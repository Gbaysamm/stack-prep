"""Guided practice: the teaching loop that runs after the check-up.

One question at a time. Answer it and the loop moves on. Miss it and you get a hint and the
same question again. Miss it again and the worked solution is shown a step at a time, and the
question is marked as taught rather than as known.

THE RULE THAT PROTECTS EVERY NUMBER DOWNSTREAM. An assisted attempt earns no mastery. A
question answered after a hint, or after the solution was shown, is recorded in full — that is
what `hint_count` and `solution_viewed_before_answer` are for — but it does not move the
estimate, and neither does a correct answer the student said was a guess. The rule lives in
the `scoring_attempts` view so no query here has to remember it. Without it, mastery climbs
with every hint, the projection built on mastery becomes a promise nobody can keep, and the
student is told they are ready when they are not.

WHAT IT TEACHES NEXT. The subtopic comes from the same plan the report shows: the one where
the next session earns the most marks, which is share of the paper times what a session can
move. Within it the question comes at the level the student is working at, and never one they
have answered before. So the loop and the projection cannot disagree about what matters — they
read the same engine.

WHAT THE COACH MAY GENERATE. The board still renders `solution_steps` and nothing else: the
working a student reads is the working a reviewer checked. What is generated is the answer
when they ask about it — `/ask`, once the question is already taught and its answer already
shown, explaining the reviewed steps rather than replacing them. If that tutor is unavailable
the steps are served in its place, so the lesson degrades and never breaks.

VOICE GOES BOTH WAYS. The coach speaks — `/ask/stream` returns the explanation as audio
beside the text, because the board is the summary and the talking is the lesson. The student
can speak back: `/listen` turns a recording into words for them to check and send. The
consent position for recording a minor is certified, so this is an ordinary feature now.

WHAT STILL HOLDS AROUND IT. The recording never outlives the request that carried it — it is
transcribed and dropped, and what reaches `tutor_turns` is the transcript, exactly as a typed
question would. Every spoken line of the coach is captioned on screen whatever happens to the
audio, so nothing it teaches exists only in the air.

WHAT IS NOT HERE YET. There is no working pad, so `attempts.working` stays null; the column
exists so that the day the pad lands, the attempts already recorded have the shape it needs.
"""

from __future__ import annotations

import asyncio
import base64
import dataclasses
import hashlib
import json
import secrets
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal, get_args
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import badges, inworld_voice, kokoro_voice, premium, scoring, tutor, voice_store, xp
from app.auth import require_session_owner, require_student
from app.config import Settings, get_settings
from app.db import connection, fetch_all
from app.figures import OptionFigure, QuestionFigure, figures_for, option_figures_for, resolve
from app.lesson_cues import LessonCue, cue_of
from app.lesson_diagrams import (
    DiagramOp,
    LessonDiagram,
    diagram_actions,
    diagram_link,
    diagram_of,
)
from app.lesson_doodles import (
    DoodleOp,
    DoodleRef,
    LessonDoodle,
    doodle_actions,
    doodle_link,
    doodle_ref,
    doodle_refs,
    lesson_doodles,
)
from app.lesson_mouth import LessonMouth, mouth_of
from app.routers.checkup import UnitWeight, _subtopics
from engine.projection import UnitStanding, project
from engine.version import ENGINE_VERSION

router = APIRouter(prefix="/v1/practice", tags=["practice"])

#: What may be sent to the model as a picture. Anything else attached to a question is not
#: an image we are willing to put in a packet.
FIGURE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _event(name: str, payload: dict[str, object]) -> str:
    """One server-sent event. JSON so a newline in the text cannot end the frame early."""
    return f"event: {name}\ndata: {json.dumps(payload)}\n\n"


#: A line the coach has just written, waiting to be spoken, keyed by a handle the client
#: fetches it with. The audio is not pushed down the lesson stream any more: the browser is
#: far better at playing a sound that is still arriving than we are at reassembling one, so
#: it is given a URL and left to stream it.
#:
#: In memory on purpose — it lives for seconds, it is worth nothing once spoken, and putting
#: it in the database would mean storing a queue of sentences to say out loud. A deployment
#: running more than one worker would need this shared; today there is one.
_WAITING_TO_BE_SAID: dict[str, tuple[float, UUID, str]] = {}

#: Long enough for a student to sit through the lesson before this line's turn comes, short
#: enough that a handle is worthless by the time anyone could find it.
SPEECH_HANDLE_SECONDS = 600.0


def _remember_to_say(session_id: UUID, line: str) -> str:
    """Put a line aside to be spoken, and return the handle that fetches it."""
    now = time.monotonic()
    for handle, (expires, _, _) in list(_WAITING_TO_BE_SAID.items()):
        if expires < now:
            del _WAITING_TO_BE_SAID[handle]
    handle = secrets.token_urlsafe(16)
    _WAITING_TO_BE_SAID[handle] = (now + SPEECH_HANDLE_SECONDS, session_id, line)
    return handle


#: Bigger than any figure in the bank. A file past this is a mistake in the store, not a
#: diagram, and it is skipped rather than sent.
MAX_FIGURE_BYTES = 4_000_000

#: Questions this student has already met are never asked again, in any context.
EXCLUDED_POOL = "held_out"

#: How far a guided session goes before it suggests stopping. Long enough to be worth
#: sitting down for, short enough to finish.
DEFAULT_LENGTH = 10

Confidence = Literal["guessed", "unsure", "sure"]
Stage = Literal["asking", "hint", "explain", "finished"]


class RunFilters(BaseModel):
    """What a student chose to practise, when they chose.

    A question qualifies when its subtopic is one of `subtopic_ids` or sits under one of
    `topic_ids` (both empty means no narrowing by subject matter), and, when `exam_years` is
    given, it was set in one of those years.

    `bookmarked` is a revision run instead: the student's bookmarked questions in the subject,
    the oldest bookmark first, met before or not (migration 034).
    """

    topic_ids: list[UUID] = Field(default_factory=list)
    subtopic_ids: list[UUID] = Field(default_factory=list)
    exam_years: list[int] = Field(default_factory=list)
    bookmarked: bool = False

    def is_empty(self) -> bool:
        return not (self.topic_ids or self.subtopic_ids or self.exam_years or self.bookmarked)


#: Said when a student's choice leaves nothing to ask.
NOTHING_MATCHES = "No questions match that choice yet. Try more topics or years."
NO_BOOKMARKS = "You have no bookmarked questions to revise in this subject yet."


class StartPractice(BaseModel):
    student_id: UUID
    subject_id: UUID
    length: int = Field(default=DEFAULT_LENGTH, ge=1, le=40)
    #: All optional. Absent or empty, the run is planned by the engine as it always was.
    topic_ids: list[UUID] | None = Field(default=None, max_length=200)
    subtopic_ids: list[UUID] | None = Field(default=None, max_length=500)
    exam_years: list[Annotated[int, Field(ge=1900, le=2200)]] | None = Field(
        default=None, max_length=100
    )
    #: Revise the bookmarked questions; the other filters are then ignored.
    bookmarked: bool = False

    def filters(self) -> RunFilters | None:
        if self.bookmarked:
            return RunFilters(bookmarked=True)
        chosen = RunFilters(
            topic_ids=list(dict.fromkeys(self.topic_ids or [])),
            subtopic_ids=list(dict.fromkeys(self.subtopic_ids or [])),
            exam_years=sorted(set(self.exam_years or []), reverse=True),
        )
        return None if chosen.is_empty() else chosen


class AnswerIn(BaseModel):
    #: Client-generated, so a retried submission is stored once.
    attempt_id: UUID = Field(default_factory=uuid4)
    question_version_id: UUID
    selected_option_key: str = Field(pattern="^[A-F]$")
    response_ms: int = Field(ge=0, le=3_600_000)
    #: Asked after answering and before being told. None means they were not asked.
    confidence: Confidence | None = None


class AskIn(BaseModel):
    """A question typed at the board."""

    question_version_id: UUID
    #: Which step was showing. None means the board had finished writing.
    step_index: int | None = Field(default=None, ge=0, le=40)
    asked: str = Field(min_length=1, max_length=tutor.MAX_QUESTION_CHARS)

    @field_validator("asked")
    @classmethod
    def _not_only_spaces(cls, value: str) -> str:
        # Stored stripped, so a question of blank space is refused here rather than reaching
        # the tutor as an empty prompt or the table as a row that says nothing.
        stripped = value.strip()
        if not stripped:
            raise ValueError("ask the coach something")
        return stripped


class TutorReply(BaseModel):
    #: The tagged transcript, both channels, exactly as it was stored.
    reply: str
    #: What was said aloud, and what was written up. Most of the teaching is in the first.
    spoken: str = ""
    board: list[str] = Field(default_factory=list)
    #: How the student got this answer: the tutor, or the reviewed steps standing in for it.
    source: tutor.Source
    #: Said out loud so the budget is a thing the student can see coming rather than a wall
    #: they hit without warning.
    asks_left: int


class Option(BaseModel):
    option_key: str
    body: str
    #: The option's drawing, when the option is a picture; its `body` is then only a label.
    figure: OptionFigure | None = None


class Misconception(BaseModel):
    name: str
    description: str
    remediation_note: str | None


class PracticeQuestion(BaseModel):
    question_version_id: UUID
    subtopic_name: str
    topic_name: str
    stem: str
    instructions: str | None
    passage_title: str | None
    passage_body: str | None
    options: list[Option]
    #: Hints already spent on this question, so a reload does not hand one back.
    hints_used: int
    #: The diagrams printed with the question, shown above it and again on the board.
    figures: list[QuestionFigure] = Field(default_factory=list)
    #: A question from an earlier sitting the student has not yet got right on their own.
    comeback: bool = False


class PracticeState(BaseModel):
    session_id: UUID
    stage: Stage
    position: int
    length: int
    answered: int
    #: Right first time, with no hint, and not called a guess by the student.
    correct_unaided: int
    taught: int
    question: PracticeQuestion | None
    #: Right first time with no hint, but the student said they guessed. Not counted in
    #: `correct_unaided`: a lucky guess has not shown they understand it.
    guessed_right: int = 0
    #: Set when the last answer was wrong and a hint is being offered.
    hint: str | None = None
    #: Set once the student has missed twice: the board's script.
    solution_steps: list[str] | None = None
    correct_option_key: str | None = None
    #: Why that wrong answer is a tempting one, when the option carries the explanation.
    misconception: Misconception | None = None
    #: Said plainly to the student when the sitting ends.
    closing_note: str | None = None
    #: The student's choice for a custom run; null for an ordinary one.
    filters: RunFilters | None = None
    #: Once the run is finished: the score before and after it, and each topic it touched.
    score_change: scoring.ScoreChange | None = None
    #: XP for the answer just given (app/xp.py), and the combo bonus when it made one.
    xp_gained: int = 0
    xp_combo: int = 0
    #: Answers in a row right without help, ending with this one.
    xp_run: int = 0
    #: Once the run is finished: all the XP it earned, and the day's bonus if it finished
    #: today's plan.
    xp_session: int | None = None
    xp_daily_goal: int = 0


def session_filters(session: dict[str, Any]) -> RunFilters | None:
    """The filters stored on a session, or None for an ordinary run."""
    raw = session.get("practice_filters")
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = json.loads(raw)
    return RunFilters.model_validate(raw)


async def _session(conn: AsyncConnection, session_id: UUID) -> dict[str, Any]:
    """A guided session, or 404. A run the student deleted is gone as far as they can reach."""
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT id, student_id, subject_id, planned_items, ended_at, started_at,
                           practice_filters
                    FROM study_sessions
                    WHERE id = :id AND session_type = 'guided' AND hidden_at IS NULL
                    """
                ),
                {"id": session_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="unknown practice session")
    return dict(row)


def allowed_units(units: list[UnitWeight], filters: RunFilters | None) -> list[UnitWeight]:
    """The subtopics a run may draw from: all of them, or the ones the student chose."""
    if filters is None or not (filters.topic_ids or filters.subtopic_ids):
        return list(units)
    topics = {str(topic_id) for topic_id in filters.topic_ids}
    subtopics = {str(subtopic_id) for subtopic_id in filters.subtopic_ids}
    return [unit for unit in units if unit.topic_id in topics or unit.unit_id in subtopics]


async def _plan(
    conn: AsyncConnection,
    student_id: UUID,
    subject_id: UUID,
    filters: RunFilters | None = None,
) -> list[str]:
    """Subtopics in the order the projection says they earn the most marks.

    Read from the same engine the report reads, so what the student is taught and what they
    were told they would be taught cannot drift apart. A student's own choice narrows the list
    but does not reorder it: within what they picked, the plan still goes first where it earns
    the most.
    """
    units, _ = await _subtopics(conn, subject_id)
    standings = await _standings_from_history(conn, student_id, subject_id, units)
    result = project(standings, sessions_available=len(units))
    allowed = {unit.unit_id for unit in allowed_units(units, filters)}
    order = [line.unit_id for line in result.plan if line.unit_id in allowed]
    # A topic the student is already strong in goes to the back, for occasional review, so
    # time moves on to the next weakest (docs/student-scoring.md §7).
    settled = {
        standing.unit_id
        for standing in standings
        if standing.mastery is not None
        and standing.answered >= scoring.SETTLED_AFTER
        and standing.mastery * 100 >= scoring.STRONG_FROM
    }
    return [unit for unit in order if unit not in settled] + [
        unit for unit in order if unit in settled
    ]


async def _available(
    conn: AsyncConnection,
    subject_id: UUID,
    student_id: UUID,
    subtopic_ids: list[str],
    exam_years: list[int],
) -> int:
    """How many questions a run narrowed this way could still ask this student.

    The same pool `_pick` draws from (deliverable, not held out, never met before), so a run
    shortened to this many can actually be served.
    """
    if not subtopic_ids:
        return 0
    value = (
        await conn.execute(
            text(
                """
                WITH deliverable AS MATERIALIZED (
                  SELECT dq.question_id, dq.primary_skill_id, q.exam_year
                  FROM deliverable_questions dq
                  JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
                  WHERE dq.subject_id = :subject
                )
                SELECT count(DISTINCT d.question_id)
                FROM deliverable d
                JOIN curriculum_items skill ON skill.id = d.primary_skill_id
                WHERE skill.parent_id::text = ANY(CAST(:subs AS text[]))
                  AND (cardinality(CAST(:years AS int[])) = 0
                       OR d.exam_year = ANY(CAST(:years AS int[])))
                  AND NOT EXISTS (
                      SELECT 1 FROM student_question_history h
                      WHERE h.student_id = :student AND h.question_id = d.question_id
                  )
                """
            ),
            {
                "pool": EXCLUDED_POOL,
                "subject": subject_id,
                "subs": subtopic_ids,
                "years": exam_years,
                "student": student_id,
            },
        )
    ).scalar()
    return int(value or 0)


#: A bookmarked question that can be practised: deliverable in the subject, not held out.
_BOOKMARKED = """
    SELECT dq.question_version_id, v.stem, v.instructions,
           pg.title AS passage_title, pg.body AS passage_body,
           sub.name AS subtopic_name, topic.name AS topic_name
    FROM question_bookmarks b
    JOIN deliverable_questions dq ON dq.question_id = b.question_id AND dq.subject_id = :subject
    JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
    JOIN question_versions v ON v.id = dq.question_version_id
    LEFT JOIN passages pg ON pg.id = v.passage_id
    JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
    JOIN curriculum_items sub ON sub.id = skill.parent_id
    JOIN curriculum_items topic ON topic.id = sub.parent_id
    WHERE b.student_id = :student
"""


async def _bookmarks_available(conn: AsyncConnection, subject_id: UUID, student_id: UUID) -> int:
    value = (
        await conn.execute(
            text(f"SELECT count(*) FROM ({_BOOKMARKED}) AS kept"),
            {"subject": subject_id, "pool": EXCLUDED_POOL, "student": student_id},
        )
    ).scalar()
    return int(value or 0)


async def _next_bookmark(conn: AsyncConnection, session: dict[str, Any]) -> dict[str, Any] | None:
    """The oldest bookmark not yet asked in this run."""
    rows = await fetch_all(
        conn,
        _BOOKMARKED
        + """
          AND NOT EXISTS (
              SELECT 1 FROM attempts a
              JOIN question_versions av ON av.id = a.question_version_id
              WHERE a.session_id = :session AND av.question_id = b.question_id
          )
        ORDER BY b.created_at, b.question_id
        LIMIT 1
        """,
        subject=session["subject_id"],
        pool=EXCLUDED_POOL,
        student=session["student_id"],
        session=session["id"],
    )
    return rows[0] if rows else None


async def _standings_from_history(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID, units: list[UnitWeight]
) -> list[UnitStanding]:
    """Where this student stands per subtopic: the topic score the student sees.

    Right ÷ answered over the latest counted answer to each question, from every sitting, so a
    student who has been taught a subtopic since their check-up is planned for as they are now.
    """
    answers = await scoring.answers_for(conn, student_id, subject_id)
    standings: list[UnitStanding] = []
    for unit in units:
        found = scoring.tally(answers, unit.unit_id)
        standings.append(
            UnitStanding(
                unit_id=unit.unit_id,
                name=unit.name,
                topic_id=unit.topic_id,
                topic_name=unit.topic_name,
                share=unit.share,
                mastery=(found.right / found.answered) if found.answered else None,
                answered=found.answered,
            )
        )
    return standings


async def _level_for(conn: AsyncConnection, student_id: UUID, subtopic_id: str) -> int:
    """The level this student is working at in one subtopic.

    Spec §9.5: from the level of their latest answer there, two right in a row move up one
    level and two wrong in a row move down one; anything else stays. One slip or one lucky
    guess does not swing the difficulty. A subtopic they have never met starts in the middle.
    """
    rows = await fetch_all(
        conn,
        """
        SELECT a.is_correct, v.mastery_level_number AS level
        FROM scoring_attempts a
        JOIN question_versions v ON v.id = a.question_version_id
        JOIN question_classifications c
          ON c.question_id = v.question_id AND c.classification_role = 'primary'
        JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        WHERE a.student_id = :student AND skill.parent_id = CAST(:sub AS uuid)
        ORDER BY a.answered_at_client DESC
        LIMIT 5
        """,
        student=student_id,
        sub=subtopic_id,
    )
    if not rows:
        return 3
    last = rows[0]
    level = int(last["level"] or 3)
    # Two in a row at this same level: after a move, it takes two more at the new level.
    if (
        len(rows) >= 2
        and rows[1]["is_correct"] == last["is_correct"]
        and int(rows[1]["level"] or 3) == level
    ):
        level += 1 if last["is_correct"] else -1
    return max(1, min(5, level))


async def _pick(
    conn: AsyncConnection,
    subject_id: UUID,
    student_id: UUID,
    subtopic_id: str,
    level: int,
    exam_years: list[int] | None = None,
) -> dict[str, Any] | None:
    rows = await fetch_all(
        conn,
        """
        WITH deliverable AS MATERIALIZED (
          SELECT dq.question_id, dq.question_version_id, dq.mastery_level_number,
                 dq.primary_skill_id, q.exam_year
          FROM deliverable_questions dq
          JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
          WHERE dq.subject_id = :subject
        )
        SELECT dq.question_version_id, v.stem, v.instructions,
               pg.title AS passage_title, pg.body AS passage_body,
               sub.name AS subtopic_name, topic.name AS topic_name
        FROM deliverable dq
        JOIN question_versions v ON v.id = dq.question_version_id
        LEFT JOIN passages pg ON pg.id = v.passage_id
        JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
        JOIN curriculum_items sub ON sub.id = skill.parent_id
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        WHERE sub.id = CAST(:sub AS uuid)
          AND (cardinality(CAST(:years AS int[])) = 0
               OR dq.exam_year = ANY(CAST(:years AS int[])))
          AND NOT EXISTS (
              SELECT 1 FROM student_question_history h
              WHERE h.student_id = :student AND h.question_id = dq.question_id
          )
        ORDER BY abs(coalesce(dq.mastery_level_number, 3) - :level),
                 md5(:student || dq.question_version_id::text)
        LIMIT 1
        """,
        pool=EXCLUDED_POOL,
        subject=subject_id,
        sub=subtopic_id,
        student=str(student_id),
        level=level,
        years=list(exam_years or []),
    )
    return rows[0] if rows else None


#: One question in every this-many of a run is a comeback, when one is waiting: the second,
#: the fifth, the eighth (docs/student-scoring.md §6).
COMEBACK_EVERY = 3


async def _comeback(
    conn: AsyncConnection,
    session: dict[str, Any],
    subtopic_ids: list[str],
    exam_years: list[int] | None = None,
) -> dict[str, Any] | None:
    """A question this student has not yet got, brought back from an earlier sitting.

    Waiting means the latest counted answer to it was wrong (which includes every question
    taught on the board), or it has never had a counted answer at all (a right answer the
    student called a guess). Never one already met in this run, so the student is not asked
    to remember what they were just told. The plan's order decides which topic goes first;
    within a topic, the one waiting longest.
    """
    if not subtopic_ids:
        return None
    rows = await fetch_all(
        conn,
        """
        WITH mine AS (
          SELECT v.question_id,
                 max(a.answered_at_client) AS last_at,
                 bool_or(a.session_id = :session) AS this_run
          FROM attempts a
          JOIN question_versions v ON v.id = a.question_version_id
          WHERE a.student_id = :student
          GROUP BY v.question_id
        ),
        counted AS (
          SELECT DISTINCT ON (v.question_id) v.question_id, sa.is_correct
          FROM scoring_attempts sa
          JOIN question_versions v ON v.id = sa.question_version_id
          WHERE sa.student_id = :student AND sa.is_correct IS NOT NULL
          ORDER BY v.question_id, sa.answered_at_client DESC, sa.received_at DESC
        )
        SELECT dq.question_version_id, v.stem, v.instructions,
               pg.title AS passage_title, pg.body AS passage_body,
               sub.name AS subtopic_name, topic.name AS topic_name
        FROM mine
        LEFT JOIN counted c ON c.question_id = mine.question_id
        JOIN deliverable_questions dq
          ON dq.question_id = mine.question_id AND dq.subject_id = :subject
        JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
        JOIN question_versions v ON v.id = dq.question_version_id
        LEFT JOIN passages pg ON pg.id = v.passage_id
        JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
        JOIN curriculum_items sub ON sub.id = skill.parent_id
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        WHERE NOT mine.this_run
          AND coalesce(c.is_correct, false) = false
          AND sub.id::text = ANY(CAST(:subs AS text[]))
          -- Taught since: a lesson on this subtopic came after it was last met, so it is not
          -- asked again; the student's real attempt is on new questions (migration 044).
          AND NOT EXISTS (
            SELECT 1 FROM subtopic_lessons l
            WHERE l.student_id = :student AND l.subtopic_id = sub.id
              AND l.finished_at > mine.last_at
          )
          AND (cardinality(CAST(:years AS int[])) = 0
               OR q.exam_year = ANY(CAST(:years AS int[])))
        ORDER BY array_position(CAST(:subs AS text[]), sub.id::text), mine.last_at,
                 dq.question_version_id
        LIMIT 1
        """,
        student=session["student_id"],
        session=session["id"],
        subject=session["subject_id"],
        pool=EXCLUDED_POOL,
        subs=subtopic_ids,
        years=list(exam_years or []),
    )
    return rows[0] if rows else None


async def _score_change(conn: AsyncConnection, session: dict[str, Any]) -> scoring.ScoreChange:
    """What this run did to the student's scores, for the end-of-run screen."""
    units, _ = await _subtopics(conn, session["subject_id"])
    answers = await scoring.answers_for(conn, session["student_id"], session["subject_id"])
    return scoring.session_change(units, answers, str(session["id"]))


async def _options(conn: AsyncConnection, question_version_id: UUID) -> list[Option]:
    rows = await fetch_all(
        conn,
        """
        SELECT option_key, body FROM question_options
        WHERE question_version_id = :version ORDER BY display_order, option_key
        """,
        version=question_version_id,
    )
    pictures = await option_figures_for(conn, [question_version_id])
    return [
        Option(**dict(row), figure=pictures.get((str(question_version_id), str(row["option_key"]))))
        for row in rows
    ]


async def _hints_used(conn: AsyncConnection, session_id: UUID, version_id: UUID) -> int:
    """How much help this question has already had in this sitting.

    Held in the attempts rather than in memory, so a student who reloads mid-question is not
    handed a fresh hint, and a reviewer reading the table later can see what was given.
    """
    value = (
        await conn.execute(
            text(
                """
                SELECT count(*) FROM attempts
                WHERE session_id = :session AND question_version_id = :version
                """
            ),
            {"session": session_id, "version": version_id},
        )
    ).scalar()
    return int(value or 0)


async def _state(
    conn: AsyncConnection,
    session: dict[str, Any],
    *,
    stage: Stage = "asking",
    hint: str | None = None,
    solution_steps: list[str] | None = None,
    correct_option_key: str | None = None,
    misconception: Misconception | None = None,
    repeat_version_id: UUID | None = None,
) -> PracticeState:
    """The whole loop's state, rebuilt from what is stored rather than carried in memory."""
    filters = session_filters(session)
    counts = (
        (
            await conn.execute(
                text(
                    """
                    SELECT count(DISTINCT a.question_version_id) AS seen,
                           -- Taught, not answered: a question that was missed twice and then
                           -- explained. Counted from the attempts rather than from a flag,
                           -- because nothing is answered after the board and there is no
                           -- attempt to hang a flag on.
                           (SELECT count(*) FROM (
                              SELECT question_version_id
                              FROM attempts t
                              WHERE t.session_id = :session
                              GROUP BY question_version_id
                              HAVING count(*) >= 2 AND bool_and(coalesce(t.is_correct, false)
                                                                 IS FALSE)
                            ) AS explained) AS taught,
                           (SELECT count(*) FROM scoring_attempts s
                             WHERE s.session_id = :session AND s.is_correct) AS unaided,
                           -- Right with no help, but the student's own word is that they
                           -- guessed. `scoring_attempts` already keeps these out of
                           -- `unaided`; counted here so the run can say so honestly.
                           (SELECT count(*) FROM attempts g
                             WHERE g.session_id = :session AND g.is_correct
                               AND g.confidence = 'guessed' AND g.hint_count = 0
                               AND NOT g.solution_viewed_before_answer) AS guessed_right
                    FROM attempts a WHERE a.session_id = :session
                    """
                ),
                {"session": session["id"]},
            )
        )
        .mappings()
        .first()
    )
    assert counts is not None
    seen = int(counts["seen"])
    length = int(session["planned_items"] or DEFAULT_LENGTH)

    question: PracticeQuestion | None = None
    if repeat_version_id is not None:
        found = (
            (
                await conn.execute(
                    text(
                        """
                        SELECT v.id AS question_version_id, v.stem, v.instructions,
                               pg.title AS passage_title, pg.body AS passage_body,
                               sub.name AS subtopic_name, topic.name AS topic_name
                        FROM question_versions v
                        LEFT JOIN passages pg ON pg.id = v.passage_id
                        JOIN question_classifications c
                          ON c.question_id = v.question_id AND c.classification_role = 'primary'
                        JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
                        JOIN curriculum_items sub ON sub.id = skill.parent_id
                        JOIN curriculum_items topic ON topic.id = sub.parent_id
                        WHERE v.id = :version
                        """
                    ),
                    {"version": repeat_version_id},
                )
            )
            .mappings()
            .first()
        )
        if found is not None:
            question = PracticeQuestion(
                **dict(found),
                options=await _options(conn, repeat_version_id),
                hints_used=await _hints_used(conn, session["id"], repeat_version_id),
                figures=await figures_for(conn, repeat_version_id),
            )
    elif stage == "asking" and seen < length and filters is not None and filters.bookmarked:
        kept = await _next_bookmark(conn, session)
        if kept is not None:
            question = PracticeQuestion(
                **dict(kept),
                options=await _options(conn, kept["question_version_id"]),
                hints_used=0,
                figures=await figures_for(conn, kept["question_version_id"]),
            )
    elif stage == "asking" and seen < length:
        plan = await _plan(conn, session["student_id"], session["subject_id"], filters)
        years = filters.exam_years if filters is not None else None
        if seen % COMEBACK_EVERY == 1:
            back = await _comeback(conn, session, plan, years)
            if back is not None:
                question = PracticeQuestion(
                    **dict(back),
                    options=await _options(conn, back["question_version_id"]),
                    hints_used=0,
                    figures=await figures_for(conn, back["question_version_id"]),
                    comeback=True,
                )
        for subtopic_id in plan if question is None else []:
            level = await _level_for(conn, session["student_id"], subtopic_id)
            picked = await _pick(
                conn,
                session["subject_id"],
                session["student_id"],
                subtopic_id,
                level,
                filters.exam_years if filters is not None else None,
            )
            if picked is not None:
                question = PracticeQuestion(
                    **dict(picked),
                    options=await _options(conn, picked["question_version_id"]),
                    hints_used=0,
                    figures=await figures_for(conn, picked["question_version_id"]),
                )
                break

    finished = question is None and stage == "asking"
    closing = None
    score_change: scoring.ScoreChange | None = None
    if finished:
        guessed = int(counts["guessed_right"])
        lucky = ""
        if guessed:
            lucky = (
                "1 was right but guessed — it'll come back. "
                if guessed == 1
                else f"{guessed} were right but guessed — they'll come back. "
            )
        taught_note = ""
        if int(counts["taught"]):
            taught_note = (
                f"{counts['taught']} {'was' if int(counts['taught']) == 1 else 'were'} "
                "taught on the board — "
                f"{'it comes' if int(counts['taught']) == 1 else 'they come'} back in a later "
                "run, so you can get "
                f"{'it' if int(counts['taught']) == 1 else 'them'} right yourself."
            )
        unaided = f"{counts['unaided']} of {seen} answered without help. "
        closing = f"{unaided}{lucky}{taught_note}".strip()
        score_change = await _score_change(conn, session)
    return PracticeState(
        session_id=session["id"],
        stage="finished" if finished else stage,
        position=min(seen + (0 if stage == "asking" else 1), length),
        length=length,
        answered=seen,
        correct_unaided=int(counts["unaided"]),
        guessed_right=int(counts["guessed_right"]),
        taught=int(counts["taught"]),
        question=question,
        hint=hint,
        solution_steps=solution_steps,
        correct_option_key=correct_option_key,
        misconception=misconception,
        closing_note=closing,
        filters=filters,
        score_change=score_change,
    )


#: Said when practice is locked behind a check-up (docs/student-scoring.md §3). The web app
#: reads the 423 and takes the student to the check-up.
CHECKUP_FIRST = "Take your first check-up. Practice opens once it's done."
CHECKUP_DUE = "Your check-up is due. Practice opens again once you've taken it."


async def checkup_lock(conn: AsyncConnection, student_id: UUID, subject_id: UUID) -> str | None:
    """Why practice is locked in this subject, or nothing when it is open.

    Locked until the first check-up is finished, and again once the next one falls due:
    seven days after the last, counted in the student's own calendar.
    """
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT max(ss.ended_at) AS last_checkup,
                           (now() AT TIME ZONE coalesce(s.timezone, 'UTC'))::date AS today,
                           coalesce(s.timezone, 'UTC') AS tz
                    FROM students s
                    LEFT JOIN study_sessions ss
                      ON ss.student_id = s.id AND ss.subject_id = :subject
                     AND ss.session_type = 'checkup' AND ss.ended_at IS NOT NULL
                    WHERE s.id = :student
                    GROUP BY s.id, s.timezone
                    """
                ),
                {"student": student_id, "subject": subject_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["last_checkup"] is None:
        return CHECKUP_FIRST
    due = row["last_checkup"].date() + timedelta(days=scoring.CHECKUP_EVERY_DAYS)
    return CHECKUP_DUE if due <= row["today"] else None


@router.post("/start", response_model=PracticeState, summary="Begin a guided session")
async def start(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], body: StartPractice
) -> PracticeState:
    await require_student(request, conn, body.student_id)
    student = (
        await conn.execute(text("SELECT 1 FROM students WHERE id = :id"), {"id": body.student_id})
    ).first()
    if student is None:
        raise HTTPException(status_code=404, detail="unknown student")
    session_id = await begin_run(
        conn, body.student_id, body.subject_id, body.length, body.filters()
    )
    return await _state(conn, await _session(conn, session_id))


#: Planned items a student finishes before building their own runs (the roadmap's first
#: milestone; docs/plans/2026-11-10-student-roadmap.md).
OWN_RUNS_AFTER = 10


async def roadmap_lock(
    conn: AsyncConnection, student_id: UUID, filters: RunFilters | None
) -> str | None:
    """Why a run the student starts themselves waits for their roadmap, or nothing.

    Stack Prep plans the work. With a roadmap, a run narrowed to topics the student picked opens
    only after OWN_RUNS_AFTER planned items are done, and a general run only once today's plan
    is. Revising bookmarks is always open.
    """
    if filters is not None and filters.bookmarked:
        return None
    rows = await fetch_all(
        conn,
        """
        SELECT
          EXISTS (SELECT 1 FROM roadmaps WHERE student_id = :s AND status = 'active') AS planned,
          (SELECT count(*) FROM roadmap_items i JOIN study_sessions ss ON ss.id = i.session_id
           WHERE i.student_id = :s AND ss.ended_at IS NOT NULL) AS done,
          (SELECT count(*) FROM roadmap_items i
           JOIN roadmaps r ON r.id = i.roadmap_id AND r.status = 'active'
           JOIN students st ON st.id = i.student_id
           LEFT JOIN study_sessions ss ON ss.id = i.session_id
           WHERE i.student_id = :s AND ss.ended_at IS NULL
             AND i.day = (now() AT TIME ZONE st.timezone)::date) AS left_today
        """,
        s=student_id,
    )
    row = rows[0]
    if not row["planned"]:
        return None
    if filters is not None and row["done"] < OWN_RUNS_AFTER:
        left = OWN_RUNS_AFTER - int(row["done"])
        return (
            "Your roadmap picks your runs for now. Choosing your own opens after "
            f"{left} more planned {'run' if left == 1 else 'runs'}."
        )
    if filters is None and row["left_today"] > 0:
        return (
            "Today's plan comes first. Finish today's items on your roadmap, "
            "then you can start your own runs."
        )
    return None


async def open_run(conn: AsyncConnection, student_id: UUID) -> UUID | None:
    """The student's unfinished, not deleted run, in any subject, or None.

    "Finished" is read exactly as the run list reads it (progress.RUNS), so the two agree.
    """
    from app.routers.progress import RUNS  # progress imports this module

    rows = await fetch_all(
        conn,
        f"SELECT session_id FROM ({RUNS} AND ss.hidden_at IS NULL) runs"
        " WHERE NOT finished ORDER BY started_at DESC LIMIT 1",
        student=student_id,
        default_length=DEFAULT_LENGTH,
    )
    return rows[0]["session_id"] if rows else None


async def begin_run(
    conn: AsyncConnection,
    student_id: UUID,
    subject_id: UUID,
    length: int,
    filters: RunFilters | None,
    *,
    planned: bool = False,
) -> UUID:
    """Open a practice run and return its id: the student's own, or one their roadmap planned.

    A roadmap run (``planned``) is the product's own plan, so it never counts as a custom run
    against the student's plan limits, though it narrows to a subtopic like one.
    """
    locked = await checkup_lock(conn, student_id, subject_id)
    if locked is not None:
        raise HTTPException(status_code=423, detail=locked)
    if not planned:
        # 428: follow the roadmap first. The app says so and points to the roadmap.
        waiting = await roadmap_lock(conn, student_id, filters)
        if waiting is not None:
            raise HTTPException(status_code=428, detail=waiting)
    await premium.check_practice_start(
        conn,
        student_id,
        custom=filters is not None and not filters.bookmarked and not planned,
        bookmarked=filters is not None and filters.bookmarked,
    )
    # One run at a time (founder, 16 Nov 2026): an unfinished run is finished, or deleted,
    # before another starts, in any subject. After the plan check, so a student out of free
    # questions is told that, not to finish a run they cannot.
    if await open_run(conn, student_id) is not None:
        raise HTTPException(
            status_code=409,
            detail="Finish your open run first, or delete it from Your runs.",
        )
    if filters is not None and filters.bookmarked:
        available = await _bookmarks_available(conn, subject_id, student_id)
        if available == 0:
            raise HTTPException(status_code=422, detail=NO_BOOKMARKS)
        length = min(length, available)
    elif filters is not None:
        # A custom run is shortened to what its choice can actually serve, and refused
        # outright when that is nothing, rather than started and finished on the spot.
        units, _ = await _subtopics(conn, subject_id)
        available = await _available(
            conn,
            subject_id,
            student_id,
            [unit.unit_id for unit in allowed_units(units, filters)],
            filters.exam_years,
        )
        if available == 0:
            raise HTTPException(status_code=422, detail=NOTHING_MATCHES)
        length = min(length, available)
    session_id = (
        await conn.execute(
            text(
                """
                INSERT INTO study_sessions (student_id, subject_id, session_type,
                  planned_items, engine_version, practice_filters)
                VALUES (:student, :subject, 'guided', :length, :engine,
                  CAST(:filters AS jsonb))
                RETURNING id
                """
            ),
            {
                "student": student_id,
                "subject": subject_id,
                "length": length,
                "engine": ENGINE_VERSION,
                "filters": filters.model_dump_json() if filters is not None else None,
            },
        )
    ).scalar_one()
    await conn.commit()
    return UUID(str(session_id))


async def _hint_state(
    conn: AsyncConnection, session: dict[str, Any], version_id: UUID, chose: str
) -> PracticeState:
    """The first miss: a hint, and the same question again."""
    hints = (
        await conn.execute(
            text("SELECT hints FROM question_versions WHERE id = :v"),
            {"v": version_id},
        )
    ).scalar()
    chosen = (
        (
            await conn.execute(
                text(
                    """
                    SELECT m.name, m.description, m.remediation_note
                    FROM question_options o
                    JOIN misconceptions m ON m.id = o.misconception_id
                    WHERE o.question_version_id = :v AND o.option_key = :k
                    """
                ),
                {"v": version_id, "k": chose},
            )
        )
        .mappings()
        .first()
    )
    return await _state(
        conn,
        session,
        stage="hint",
        # A hint written for the mistake the student actually made beats the general one,
        # and is used whenever the option they chose carries an explanation.
        hint=(
            str(chosen["remediation_note"])
            if chosen is not None and chosen["remediation_note"]
            else (next(iter(hints or [""]), "") or "Read the question again, slowly.")
        ),
        misconception=Misconception(**dict(chosen)) if chosen is not None else None,
        repeat_version_id=version_id,
    )


async def _explain_state(
    conn: AsyncConnection, session: dict[str, Any], version_id: UUID, key: str
) -> PracticeState:
    """Missed with the hint in hand: the board, with the reviewed working and the answer."""
    steps = (
        await conn.execute(
            text("SELECT solution_steps FROM question_versions WHERE id = :v"),
            {"v": version_id},
        )
    ).scalar()
    return await _state(
        conn,
        session,
        stage="explain",
        solution_steps=[str(step) for step in (steps or [])],
        correct_option_key=key,
        repeat_version_id=version_id,
    )


async def _close_when_finished(
    conn: AsyncConnection, session: dict[str, Any], state: PracticeState
) -> PracticeState:
    """Stamp the end of a sitting the moment the loop says it is over.

    Without it a guided session never ends in the table, and anything listing a student's
    runs has to guess which ones they walked away from.
    """
    if state.stage == "finished" and session["ended_at"] is None:
        await conn.execute(
            text("UPDATE study_sessions SET ended_at = now() WHERE id = :id AND ended_at IS NULL"),
            {"id": session["id"]},
        )
        await conn.commit()
    return state


@router.get("/{session_id}", response_model=PracticeState, summary="Where this session is")
async def current(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> PracticeState:
    """The session exactly where the student left it, for a client that has just reloaded.

    Read from the last attempt, the same way the answer endpoint reads the ladder. A first
    miss not yet answered again comes back as the hint on the same question; two misses come
    back as the board. Serving a fresh question instead would skip the retry, or the lesson,
    for anyone who refreshed at the wrong moment.

    One thing is not stored: pressing on from the board (`/taught` writes nothing). So a
    reload after the board and before the next answer shows the board once more, which costs
    a click and never a lesson.
    """
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    last = (
        (
            await conn.execute(
                text(
                    """
                    SELECT a.question_version_id, a.selected_option_key,
                           count(*) OVER () AS tries,
                           bool_or(coalesce(a.is_correct, false)) OVER () AS ever_right
                    FROM attempts a
                    WHERE a.session_id = :session
                      AND a.question_version_id = (
                        SELECT question_version_id FROM attempts
                        WHERE session_id = :session
                        ORDER BY answered_at_client DESC, received_at DESC
                        LIMIT 1
                      )
                    ORDER BY a.answered_at_client DESC, a.received_at DESC
                    LIMIT 1
                    """
                ),
                {"session": session_id},
            )
        )
        .mappings()
        .first()
    )
    if session["ended_at"] is not None or last is None or last["ever_right"]:
        return await _state(conn, session)
    if int(last["tries"]) == 1:
        return await _hint_state(
            conn, session, last["question_version_id"], str(last["selected_option_key"])
        )
    key = (
        await conn.execute(
            text(
                """
                SELECT option_key FROM question_options
                WHERE question_version_id = :version AND is_correct
                """
            ),
            {"version": last["question_version_id"]},
        )
    ).scalar()
    if key is None:
        return await _state(conn, session)
    return await _explain_state(conn, session, last["question_version_id"], str(key))


@router.post(
    "/{session_id}/answer",
    response_model=PracticeState,
    summary="Answer, and find out what happens next",
)
async def answer(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    session_id: UUID,
    submission: AnswerIn,
) -> PracticeState:
    """Record the answer and decide the next move: on, a hint, or the board.

    The ladder is read from what is stored, not from anything the client says, so a client
    that replays or reorders its calls cannot talk its way past a hint or skip the board.
    """
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    await premium.check_practice_answer(
        conn, session["student_id"], session_id, submission.question_version_id
    )
    already = await _hints_used(conn, session_id, submission.question_version_id)

    key = (
        await conn.execute(
            text(
                """
                SELECT option_key FROM question_options
                WHERE question_version_id = :version AND is_correct
                """
            ),
            {"version": submission.question_version_id},
        )
    ).scalar()
    if key is None:
        raise HTTPException(status_code=409, detail="this question has no key")
    correct = submission.selected_option_key == key

    await conn.execute(
        text(
            """
            INSERT INTO attempts (id, student_id, question_version_id, session_id, context,
              selected_option_key, is_correct, response_ms, hint_count,
              solution_viewed_before_answer, answered_at_client, confidence, engine_version)
            VALUES (:id, :student, :version, :session, 'guided', :choice, :correct, :ms,
              :hints, :shown, now(), :confidence, :engine)
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {
            "id": submission.attempt_id,
            "student": session["student_id"],
            "version": submission.question_version_id,
            "session": session_id,
            "choice": submission.selected_option_key,
            "correct": correct,
            "ms": submission.response_ms,
            "hints": already,
            "shown": already >= 2,
            "confidence": submission.confidence,
            "engine": ENGINE_VERSION,
        },
    )
    await conn.commit()

    if correct:
        gained, combo, run = await _award_answer(conn, session, submission, already)
        state = await _close_when_finished(conn, session, await _state(conn, session))
        return await _with_xp(conn, session_id, state, gained, combo, run)

    # First miss: a hint, and the same question again.
    if already == 0:
        return await _hint_state(
            conn, session, submission.question_version_id, submission.selected_option_key
        )

    # Missed with the hint in hand: show the working.
    return await _explain_state(conn, session, submission.question_version_id, str(key))


@router.post(
    "/{session_id}/taught",
    response_model=PracticeState,
    summary="Move on once the board has been read",
)
async def taught(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> PracticeState:
    """Close the taught question and ask for the next one.

    Nothing is scored here: the question was explained, not answered. Its counted answer is
    still the first miss, so it comes back in a later run (never this one) until the student
    gets it right on their own (docs/student-scoring.md §6).
    """
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    state = await _close_when_finished(conn, session, await _state(conn, session))
    return await _with_xp(conn, session_id, state, 0, 0, 0)


async def _award_answer(
    conn: AsyncConnection, session: dict[str, Any], submission: AnswerIn, hints_before: int
) -> tuple[int, int, int]:
    """XP for a right answer, and the combo bonus every third in a row without help.

    Once per question per day, so answering the same question again earns nothing.
    """
    guessed = submission.confidence == "guessed"
    amount = xp.for_answer(correct=True, hints_before=hints_before, guessed=guessed)
    today = datetime.now(UTC).date().isoformat()
    gained = await xp.award(
        conn,
        session["student_id"],
        reason="answer",
        amount=amount,
        key=f"answer-{submission.question_version_id}-{today}",
        session_id=session["id"],
    )
    run = await xp.unaided_run(conn, session["id"])
    combo = 0
    if gained and hints_before == 0 and not guessed and run and run % xp.COMBO_EVERY == 0:
        combo = await xp.award(
            conn,
            session["student_id"],
            reason="combo",
            amount=xp.COMBO_BONUS,
            key=f"combo-{session['id']}-{run}",
            session_id=session["id"],
        )
    await conn.commit()
    return gained, combo, run


async def _with_xp(
    conn: AsyncConnection,
    session_id: UUID,
    state: PracticeState,
    gained: int,
    combo: int,
    run: int,
) -> PracticeState:
    """The state with this answer's XP, and the run's total once it is finished."""
    finished = state.stage == "finished"
    daily = 0
    if finished:
        session = await _session(conn, session_id)
        daily = await xp.check_daily_goal(conn, session["student_id"])
        await badges.check_now(conn, session["student_id"])
        await conn.commit()
    return state.model_copy(
        update={
            "xp_gained": gained,
            "xp_combo": combo,
            "xp_run": run,
            "xp_session": await xp.for_session(conn, session_id) if finished else None,
            "xp_daily_goal": daily,
        }
    )


async def _asks_used_today(conn: AsyncConnection, student_id: UUID) -> int:
    """How many questions this student has already asked today, in their own timezone.

    Counted from the stored turns rather than from anything the client reports, for the same
    reason the hint ladder is: a budget a browser keeps is not a budget.
    """
    return int(
        (
            await conn.execute(
                text(
                    """
                    SELECT count(*)
                    FROM tutor_turns t
                    JOIN students s ON s.id = t.student_id
                    WHERE t.student_id = :student
                      AND t.asked_at >= date_trunc(
                            'day', now() AT TIME ZONE coalesce(s.timezone, 'UTC')
                          ) AT TIME ZONE coalesce(s.timezone, 'UTC')
                    """
                ),
                {"student": student_id},
            )
        ).scalar()
        or 0
    )


async def _record_in(conn: AsyncConnection, student_id: UUID, subtopic_id: str) -> dict[str, int]:
    """Counts for this student in this subtopic, across every pool.

    Counts and nothing else. A skill-level result summary is what tutoring may receive from a
    protected assessment, so the check-up and the held-out forms contribute here — three
    numbers — and nowhere else in the packet.
    """
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT count(DISTINCT a.question_version_id) AS seen,
                           count(*) FILTER (WHERE a.id IN (
                             SELECT s.id FROM scoring_attempts s WHERE s.is_correct
                           )) AS right_unaided,
                           (SELECT count(*) FROM (
                              SELECT t.question_version_id
                              FROM attempts t
                              JOIN question_versions tv ON tv.id = t.question_version_id
                              JOIN question_classifications tc
                                ON tc.question_id = tv.question_id
                               AND tc.classification_role = 'primary'
                              JOIN curriculum_items ts ON ts.id = tc.curriculum_item_id
                              WHERE t.student_id = :student
                                AND ts.parent_id = CAST(:sub AS uuid)
                              GROUP BY t.question_version_id
                              HAVING count(*) >= 2
                                 AND bool_and(coalesce(t.is_correct, false) IS FALSE)
                            ) AS explained) AS taught
                    FROM attempts a
                    JOIN question_versions v ON v.id = a.question_version_id
                    JOIN question_classifications c
                      ON c.question_id = v.question_id AND c.classification_role = 'primary'
                    JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
                    WHERE a.student_id = :student AND skill.parent_id = CAST(:sub AS uuid)
                    """
                ),
                {"student": student_id, "sub": subtopic_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return {"seen": 0, "right_unaided": 0, "taught": 0}
    return {
        "seen": int(row["seen"] or 0),
        "right_unaided": int(row["right_unaided"] or 0),
        "taught": int(row["taught"] or 0),
    }


async def _practice_history(
    conn: AsyncConnection, student_id: UUID, subtopic_id: str, exclude_version: UUID
) -> list[tutor.Attempted]:
    """The practice questions this student has already met in this subtopic.

    `q.usage_pool = 'practice'` is the line that matters. The diagnostic and held-out pools
    are how this student is measured, and REQ-13 keeps protected question text out of
    tutoring: a tutor that has read the baseline paper makes the baseline worthless. Practice
    items carry no such weight — they have been sat, marked and explained already — so their
    text is ordinary teaching context, and it is the context that lets a coach say "this is
    the third time that same substitution has gone wrong" rather than explaining one item.
    """
    rows = await fetch_all(
        conn,
        """
        -- One row per QUESTION, not per attempt. The guided loop records two attempts for
        -- every question that reaches the board, so listing attempts would show the same
        -- question twice, spend half the history on it, and leave the coach thinking the
        -- student has met twice as much of this topic as they have.
        WITH per_question AS (
          SELECT a.question_version_id,
                 bool_or(coalesce(a.is_correct, false))     AS was_correct,
                 max(a.hint_count)                          AS hint_count,
                 -- Taught rather than answered: missed twice and never got right. The same
                 -- test `_state` counts with. NOT solution_viewed_before_answer, which marks
                 -- an answer given AFTER the board and so is false for every question that
                 -- ended at it.
                 (count(*) >= 2
                  AND bool_and(coalesce(a.is_correct, false) IS FALSE)) AS was_taught,
                 max(a.answered_at_client)                  AS last_at,
                 (array_agg(a.selected_option_key
                            ORDER BY a.answered_at_client DESC))[1] AS chose
          FROM attempts a
          JOIN question_versions v ON v.id = a.question_version_id
          JOIN questions q ON q.id = v.question_id
          JOIN question_classifications c
            ON c.question_id = q.id AND c.classification_role = 'primary'
          JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
          WHERE a.student_id = :student
            AND skill.parent_id = CAST(:sub AS uuid)
            AND q.usage_pool = 'practice'
            AND a.question_version_id <> :version
          GROUP BY a.question_version_id
        )
        SELECT v.stem,
               p.chose AS selected_option_key,
               p.was_correct,
               p.hint_count,
               p.was_taught AS solution_viewed_before_answer,
               m.description AS misconception,
               (current_date - p.last_at::date) AS days_ago
        FROM per_question p
        JOIN question_versions v ON v.id = p.question_version_id
        LEFT JOIN question_options o
          ON o.question_version_id = p.question_version_id AND o.option_key = p.chose
        LEFT JOIN misconceptions m ON m.id = o.misconception_id
        ORDER BY p.last_at DESC
        LIMIT :depth
        """,
        student=student_id,
        sub=subtopic_id,
        version=exclude_version,
        depth=tutor.HISTORY_DEPTH,
    )
    return [
        tutor.Attempted(
            stem=str(row["stem"]),
            chose=row["selected_option_key"],
            was_correct=bool(row["was_correct"]),
            misconception=row["misconception"],
            needed_hint=int(row["hint_count"] or 0) > 0,
            was_taught=bool(row["solution_viewed_before_answer"]),
            days_ago=int(row["days_ago"] or 0),
        )
        for row in rows
    ]


def _option_for_coach(option: Option) -> tuple[str, str]:
    """An option as the coach reads it: a drawn option's label alone says nothing, so its
    picture's description goes with it."""
    alt = option.figure.alt_text.strip() if option.figure and option.figure.alt_text else ""
    return option.option_key, f"{option.body} (drawn: {alt})" if alt else option.body


async def _figures(conn: AsyncConnection, version_id: UUID) -> list[tutor.Figure]:
    """The reviewed diagrams printed with this question.

    Only assets whose licence a human has verified, and only images: the coach is shown the
    same picture the student is looking at, from our own store, read off disk here so that
    `app.tutor` stays a module that does no IO. A missing or oversized file is skipped rather
    than raised — a lesson does not fail because a figure did not load.
    """
    rows = await fetch_all(
        conn,
        """
        SELECT storage_uri, mime_type, alt_text
        FROM question_assets
        WHERE question_version_id = :version AND licence_status = 'verified'
          AND option_key IS NULL
        ORDER BY display_order, id
        """,
        version=version_id,
    )

    # Capped AFTER filtering, not before: a question whose first rows are an unverified
    # licence and a PDF would otherwise send no figure at all, having spent the budget on
    # two assets it then discarded.
    figures: list[tutor.Figure] = []
    for row in rows:
        if len(figures) == tutor.MAX_FIGURES:
            break
        mime_type = str(row["mime_type"] or "")
        storage_uri = str(row["storage_uri"])
        if mime_type == "image/svg+xml":
            # The model does not take SVG. Each redrawn figure has a PNG rendering beside it,
            # made when the figure was exported, and that is the picture the coach is sent.
            storage_uri, mime_type = str(Path(storage_uri).with_suffix(".png")), "image/png"
        if mime_type not in FIGURE_MIME_TYPES:
            continue
        path = resolve(storage_uri)
        if path is None:
            continue
        if path.stat().st_size > MAX_FIGURE_BYTES:
            continue
        figures.append(
            tutor.Figure(
                mime_type=mime_type,
                base64_data=base64.b64encode(path.read_bytes()).decode("ascii"),
                alt_text=str(row["alt_text"]) if row["alt_text"] else None,
            )
        )
    return figures


async def _prior_turns(
    conn: AsyncConnection, student_id: UUID, version_id: UUID
) -> list[tutor.Turn]:
    """What this student has already been told about this question, oldest first.

    THE CONVERSATION IS KEPT (founder, 12 Nov 2026). A student who comes back to a question
    they missed, in this sitting or a later one (a comeback, a review), carries on the same
    conversation: they see it again on the board, and the coach is sent it. Scoped to the one
    question (its version) and the one student, so no other lesson's text enters the packet.

    Fallback turns are left out. They are what the student read when the coach could not
    answer, not something the coach said, and replaying them as its own words would have it
    building on an apology it never made.
    """
    rows = await fetch_all(
        conn,
        """
        SELECT asked, reply FROM tutor_turns
        WHERE student_id = :student AND question_version_id = :version
          AND source = 'model'
        ORDER BY asked_at
        """,
        student=student_id,
        version=version_id,
    )
    turns = [tutor.Turn(asked=str(row["asked"]), replied=str(row["reply"])) for row in rows]
    return turns[-tutor.MEMORY_DEPTH :]


async def _lesson_on_the_board(
    conn: AsyncConnection,
    session_id: UUID,
    student_id: UUID,
    version_id: UUID,
    step_index: int | None,
    settings: Settings,
) -> tutor.Lesson:
    """Assemble what the tutor may see, from reviewed content and this session's attempts.

    Everything here is read on the server. The client sends the student's words and which step
    they were looking at; it does not get to say what the question was, what the working says
    or what the answer is, so a client cannot widen the tutor's context by asking it to.
    """
    found = (
        (
            await conn.execute(
                text(
                    """
                    SELECT v.stem, v.solution_steps, v.hints,
                           sub.id AS subtopic_id, sub.name AS subtopic_name,
                           topic.name AS topic_name
                    FROM question_versions v
                    JOIN question_classifications c
                      ON c.question_id = v.question_id AND c.classification_role = 'primary'
                    JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
                    JOIN curriculum_items sub ON sub.id = skill.parent_id
                    JOIN curriculum_items topic ON topic.id = sub.parent_id
                    WHERE v.id = :version
                    """
                ),
                {"version": version_id},
            )
        )
        .mappings()
        .first()
    )
    if found is None:
        raise HTTPException(status_code=404, detail="unknown question")

    steps = [str(step) for step in (found["solution_steps"] or [])]
    key = (
        await conn.execute(
            text(
                """
                SELECT option_key FROM question_options
                WHERE question_version_id = :version AND is_correct
                """
            ),
            {"version": version_id},
        )
    ).scalar()
    if key is None:
        raise HTTPException(status_code=409, detail="this question has no key")

    # The wrong answer they gave last, and what that particular wrong answer usually means.
    # Without it the coach can only explain the solution; with it, it can explain their
    # mistake, which is the thing they actually came to the board with.
    mistake = (
        (
            await conn.execute(
                text(
                    """
                    SELECT a.selected_option_key, m.description
                    FROM attempts a
                    LEFT JOIN question_options o
                      ON o.question_version_id = a.question_version_id
                     AND o.option_key = a.selected_option_key
                    LEFT JOIN misconceptions m ON m.id = o.misconception_id
                    WHERE a.session_id = :session AND a.question_version_id = :version
                      AND coalesce(a.is_correct, false) IS FALSE
                    ORDER BY a.answered_at_client DESC
                    LIMIT 1
                    """
                ),
                {"session": session_id, "version": version_id},
            )
        )
        .mappings()
        .first()
    )

    subtopic_id = str(found["subtopic_id"])
    return tutor.Lesson(
        subtopic_name=str(found["subtopic_name"]),
        topic_name=str(found["topic_name"]),
        stem=str(found["stem"]),
        options=[_option_for_coach(option) for option in await _options(conn, version_id)],
        correct_option_key=str(key),
        steps=steps,
        hints=[str(hint) for hint in (found["hints"] or [])],
        step_index=step_index,
        chose=mistake["selected_option_key"] if mistake is not None else None,
        misconception=mistake["description"] if mistake is not None else None,
        level=await _level_for(conn, student_id, subtopic_id),
        **await _record_in(conn, student_id, subtopic_id),
        history=await _practice_history(conn, student_id, subtopic_id, version_id),
        figures=await _figures(conn, version_id) if settings.ai_send_figures else [],
        prior=await _prior_turns(conn, student_id, version_id),
    )


async def _must_be_at_the_board(conn: AsyncConnection, session_id: UUID, version_id: UUID) -> None:
    """Refuse unless this session's own attempts say the question was missed twice, or answered.

    Missed twice is the same test `_state` uses to decide something was taught rather than
    answered. A right latest answer is the other way to a board: the review lesson a student
    opens after answering, where the answer is already recorded. Both are read from what is
    stored rather than from anything the client says. Both ask endpoints and the microphone go
    through here, so the streaming one cannot become the softer door.
    """
    standing = (
        (
            await conn.execute(
                text(
                    """
                    SELECT count(*) AS tries,
                           bool_and(coalesce(is_correct, false) IS FALSE) AS never_right
                    FROM attempts
                    WHERE session_id = :session AND question_version_id = :version
                    """
                ),
                {"session": session_id, "version": version_id},
            )
        )
        .mappings()
        .first()
    )
    assert standing is not None
    if int(standing["tries"]) >= 2 and standing["never_right"]:
        return
    if not await _answered_right(conn, session_id, version_id):
        raise HTTPException(
            status_code=409, detail="the coach answers at the board, once a question is taught"
        )


async def _record_turn(
    conn: AsyncConnection,
    session_id: UUID,
    student_id: UUID,
    question: AskIn,
    reply: tutor.Reply,
) -> None:
    """Store the turn. Assistance is recorded (REQ-05), and a reviewer reading a complaint
    needs the lesson that happened rather than the one in the bank."""
    await conn.execute(
        text(
            """
            INSERT INTO tutor_turns (student_id, session_id, question_version_id, step_index,
              asked, reply, source, model, input_tokens, output_tokens, latency_ms)
            VALUES (:student, :session, :version, :step, :asked, :reply, :source, :model,
              :input_tokens, :output_tokens, :latency_ms)
            """
        ),
        {
            "student": student_id,
            "session": session_id,
            "version": question.question_version_id,
            "step": question.step_index,
            "asked": question.asked,
            "reply": reply.text,
            "source": reply.source,
            "model": reply.model,
            "input_tokens": reply.input_tokens,
            "output_tokens": reply.output_tokens,
            "latency_ms": reply.latency_ms,
        },
    )
    await conn.commit()


@router.post(
    "/{session_id}/ask",
    response_model=TutorReply,
    summary="Ask the coach about the working on the board",
)
async def ask(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question: AskIn,
) -> TutorReply:
    """Answer a question about the solution the student is being shown.

    ONLY AT THE BOARD. The session's own attempts have to say this question was missed twice
    and never got right — the same test `_state` uses to decide something was taught rather
    than answered — or that it was answered right, and the board is the review of it. So a
    client cannot point this at a question the student is still answering, at one from another
    sitting, or at anything outside the practice pool it was served from.
    That is what keeps protected assessment content out of tutor retrieval (S5-AC6), and it
    means the answer is already written on the board before anything can be asked about it.

    NOTHING HERE IS SCORED. The item was taught, not answered; no attempt is written and no
    estimate moves. The turn is recorded because assistance is recorded (REQ-05) and because a
    reviewer reading a complaint needs the lesson that happened, not the one in the bank.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_coach(conn, session_id)
    session = await _session(conn, session_id)
    await _must_be_at_the_board(conn, session_id, question.question_version_id)

    lesson = await _lesson_on_the_board(
        conn,
        session_id,
        session["student_id"],
        question.question_version_id,
        question.step_index,
        settings,
    )

    used = await _asks_used_today(conn, session["student_id"])
    allowance = await premium.coach_allowance(
        conn, session["student_id"], settings.ai_daily_calls_per_student
    )
    if used >= allowance:
        # Spent for today. They still get the reviewed step rather than a locked box, and the
        # turn is still stored — a budget nobody can see being hit is a budget nobody can size.
        reply = tutor.Reply(text=tutor.fallback_text(lesson), source="budget")
    else:
        reply = await tutor.answer(lesson, question.asked, settings)

    await _record_turn(conn, session_id, session["student_id"], question, reply)

    return TutorReply(
        reply=reply.text,
        spoken=reply.spoken,
        board=reply.board,
        source=reply.source,
        asks_left=max(0, allowance - (used + 1)),
    )


@router.post(
    "/{session_id}/ask/stream",
    summary="Ask the coach, and watch it teach — voice and board",
)
async def ask_streaming(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question: AskIn,
) -> StreamingResponse:
    """The same answer as `/ask`, arriving as it is made, in two channels.

    Same door. `_must_be_at_the_board` runs before anything opens, the same packet is built by
    the same function, and the same row reaches `tutor_turns` when the writing stops. What
    differs is that the student watches and hears it rather than waiting for a paragraph.

    THE EVENTS. `say` is a line spoken aloud, `board` a line written up, each as soon as the
    coach finishes it — so the board fills while the voice is still talking, the way a lesson
    actually goes. `audio` carries the mp3 for a spoken line, by index, because the voice is
    slower to make than the words are; the client plays them in order and shows the text
    meanwhile. `reset` replaces everything when what was stored differs from what was
    streamed — a reply cut at the ceiling, or a fallback, which was fetched rather than
    written. `done` says how it was reached and what is left of the allowance.

    THE VOICE IS NEVER REQUIRED. Audio that fails to make simply does not arrive; every
    spoken line is on screen as text regardless, so a muted phone, a failed call or a
    deployment with `ai_speak` off is a quieter lesson and never a missing one.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_coach(conn, session_id)
    session = await _session(conn, session_id)
    await _must_be_at_the_board(conn, session_id, question.question_version_id)

    lesson = await _lesson_on_the_board(
        conn,
        session_id,
        session["student_id"],
        question.question_version_id,
        question.step_index,
        settings,
    )

    used = await _asks_used_today(conn, session["student_id"])
    allowance = await premium.coach_allowance(
        conn, session["student_id"], settings.ai_daily_calls_per_student
    )
    asks_left = max(0, allowance - (used + 1))

    async def events() -> AsyncIterator[str]:
        """Text and the handles to hear it, sent as the lesson is written.

        The voice is not made here. Each spoken line is put aside with a handle, and the
        client fetches it from `/speech/{handle}` — which streams the audio as it is made, so
        the browser starts playing after the first fraction of a second rather than waiting
        for a finished clip. An earlier version generated every clip here and pushed it down
        this stream as base64, which meant a third more bytes and a wait for the whole thing.

        THE EVENTS. `say` is a line spoken aloud and `board` a line written up, each as soon
        as the coach finishes it, with `after` saying which spoken line a board line belongs
        under. `voice` carries where to hear a spoken line, or says there is none. `reset`
        replaces everything when what was stored differs from what was streamed. `done` says
        how the answer was reached and what is left of the allowance.
        """
        spoken = 0
        sent: list[tutor.Said] = []

        def dispatch_line(line: tutor.Said) -> list[str]:
            """Frames for one finished line: the words, and where to hear them."""
            nonlocal spoken
            sent.append(line)
            if line.channel in ("board", "draw"):
                # Which spoken line this belongs under, so the client can write it while that
                # sentence is being said rather than dropping it in on its own.
                return [_event(line.channel, {"after": spoken - 1, "text": line.text})]

            index = spoken
            spoken += 1
            frames = [_event("say", {"index": index, "text": line.text})]
            # The handle goes out with the line, before a single byte of audio exists. The
            # client can start fetching immediately, which is the whole point: generating the
            # voice and writing the next line now happen at the same time.
            if settings.ai_speak and settings.openai_api_key:
                handle = _remember_to_say(session_id, line.text)
                frames.append(
                    _event(
                        "voice",
                        {
                            "index": index,
                            "url": f"/v1/practice/{session_id}/speech/{handle}",
                        },
                    )
                )
            else:
                # No voice here at all. Said explicitly, because the client holds a line back
                # until it knows whether it can be heard and would otherwise wait forever.
                frames.append(_event("voice", {"index": index, "url": None}))
            return frames

        def dispatch(text: str) -> list[str]:
            frames = []
            for line in tutor.parse(text):
                frames += dispatch_line(line)
            return frames

        if used >= allowance:
            settled = tutor.Reply(text=tutor.fallback_text(lesson), source="budget")
            for frame in dispatch(settled.text):
                yield frame
        else:
            # Lines are dispatched as they finish rather than as they arrive: half a LaTeX
            # expression is not a board line, and half a sentence is not worth speaking.
            buffered = ""
            settled = None
            async for delta, reply in tutor.write_on_the_board(lesson, question.asked, settings):
                if reply is not None:
                    settled = reply
                    continue
                buffered += delta
                # Cut on the tags rather than on newlines: the model does not always put its
                # lines on separate rows, and when it does not, splitting on "\n" hands over
                # nothing until the whole answer has arrived.
                finished, buffered = tutor.split_finished(buffered)
                for line in finished:
                    for frame in dispatch_line(line):
                        yield frame
            assert settled is not None

            # The last line has no newline after it, so it is still in the buffer when the
            # stream ends.
            if buffered.strip():
                for frame in dispatch(buffered):
                    yield frame

            # Compared as lines rather than as raw text: the same lesson laid out with
            # different whitespace is the same lesson, and rebuilding the board for that
            # would be a flicker for nothing.
            if [(x.channel, x.text) for x in sent] != [
                (x.channel, x.text) for x in tutor.parse(settled.text)
            ]:
                sent.clear()
                spoken = 0
                yield _event("reset", {})
                for frame in dispatch(settled.text):
                    yield frame

        # Both branches above settle on a reply; the one inside the else narrows only
        # within it, so say it again where the value is actually used.
        assert settled is not None
        await _record_turn(conn, session_id, session["student_id"], question, settled)
        yield _event("done", {"source": settled.source, "asks_left": asks_left})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class Heard(BaseModel):
    """What the student was understood to have said."""

    #: Put in the box for them to read and send, never sent on their behalf. Transcription
    #: gets things wrong, and a student should see the question before it becomes one.
    asked: str


class ConversationLine(BaseModel):
    #: "say" (what the coach said) or "board" (what it wrote up).
    channel: str
    text: str


class ConversationTurn(BaseModel):
    asked: str
    lines: list[ConversationLine]


class Conversation(BaseModel):
    turns: list[ConversationTurn]


@router.get(
    "/{session_id}/conversation/{question_version_id}",
    response_model=Conversation,
    summary="What this student has asked the coach about this question before, and its replies",
)
async def conversation(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    session_id: UUID,
    question_version_id: UUID,
) -> Conversation:
    """The kept conversation about one question (founder, 12 Nov 2026), in every sitting,
    oldest first, so the board can show it again when the student comes back to it. Only the
    student's own turns; drawings are left out (they belonged to that moment's board)."""
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    rows = await fetch_all(
        conn,
        """
        SELECT asked, reply FROM tutor_turns
        WHERE student_id = :student AND question_version_id = :version
        ORDER BY asked_at
        """,
        student=session["student_id"],
        version=question_version_id,
    )
    return Conversation(
        turns=[
            ConversationTurn(
                asked=str(row["asked"]),
                lines=[
                    ConversationLine(channel=said.channel, text=said.text)
                    for said in tutor.parse(str(row["reply"]))
                    if said.channel in ("say", "board")
                ],
            )
            for row in rows
        ]
    )


@router.post(
    "/{session_id}/listen",
    response_model=Heard,
    summary="Turn a spoken question into words for the student to check",
)
async def listen(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: Annotated[UUID, Form()],
    audio: Annotated[UploadFile, File()],
) -> Heard:
    """Transcribe a question the student spoke, and hand back the words.

    A DEPLOYMENT CAN STILL TURN IT OFF. `ai_listen` defaults on, and where it is off this
    refuses with 404 rather than 403 — a switched-off feature should not advertise that it
    exists. `/v1/features` is what a client reads to decide whether to draw the button.

    THE RECORDING IS NOT KEPT. It is read, transcribed and dropped inside this request. What
    is stored is the transcript, and only once the student has read it back and pressed Ask —
    the words reach `tutor_turns` by the ordinary route, as though they had typed them.

    SAME DOOR AS ASKING. The mic lives in the ask box and the ask box only exists at the
    board, so the same guard applies: a session that has neither missed this question twice
    nor answered it cannot use this to spend the deployment's transcription budget.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_coach(conn, session_id)
    if not settings.ai_listen:
        raise HTTPException(status_code=404, detail="not found")

    await _session(conn, session_id)
    await _must_be_at_the_board(conn, session_id, question_version_id)

    heard = await tutor.listen(
        await audio.read(), audio.content_type or "application/octet-stream", settings
    )
    if heard is None:
        raise HTTPException(
            status_code=422, detail="I could not make that out. Try again, or type it."
        )
    return Heard(asked=heard)


#: How a beat may mark an earlier line on the board, the way a teacher circles a term or draws
#: an arrow back to where a line came from. `move` carries a piece from one place to another
#: (the 2 in front of a log up into its power); `arc` and `label` are for the diagram only.
PointKind = Literal[
    "circle", "underline", "arrow", "box", "highlight", "strike", "move", "arc", "label", "travel"
]
_POINT_KINDS = frozenset(get_args(PointKind))
#: A mark on the working, and a mark on the diagram: the kinds each may be.
_LINE_KINDS = frozenset({"circle", "underline", "arrow", "box", "highlight", "strike", "move"})
_FIGURE_KINDS = frozenset({"circle", "underline", "arrow", "highlight", "strike", "arc", "label"})
#: A mark in the question's passage (comprehension, cloze): the kinds it may be.
_PASSAGE_KINDS = frozenset({"highlight", "underline", "circle", "strike", "label"})


class PointFrom(BaseModel):
    #: Where an arrow or a move starts: a moment (as `line` counts them) and a piece of it.
    #: Always set for an arrow or a move; a `travel` may instead start at a doodle (`doodle`,
    #: `part`) or a place on a diagram (`figure`, `target`), and then has no `line`.
    line: int | None = None
    at: str | None = None
    doodle: str | None = None
    part: str | None = None
    figure: int | Literal["sketch", "sketch_b", "sketch_c"] | None = None
    target: str | list[str] | FigureSpot | None = None


class FigureSpot(BaseModel):
    #: A place on a figure, in the units of its SVG's viewBox.
    x: float
    y: float


class PointTo(BaseModel):
    #: Where an arrow across lands: a place on a diagram (`figure` and `target`, as a diagram
    #: mark names them), or a piece of the working (`line`, counted as `line` is, and `at`).
    figure: int | Literal["sketch", "sketch_b", "sketch_c"] | None = None
    target: str | list[str] | FigureSpot | None = None
    line: int | None = None
    at: str | None = None
    #: Or a place in the question's passage: `target` is its words, `nth` which occurrence.
    passage: bool | None = None
    nth: int | None = None
    #: Or a doodle on the board, by the id a moment gave it, and a part of its art.
    doodle: str | None = None
    part: str | None = None
    #: Or a live diagram on the board, by its id (app/lesson_diagrams.py); `part` is its part.
    diagram: str | None = None


class LessonPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    #: The line pointed at: the index of a moment in this lesson (from 0), or counted back from
    #: this beat when negative (-1 is the moment just before it). None on a diagram mark.
    line: int | None = None
    kind: PointKind
    #: A few words written beside the mark.
    text: str | None = None
    #: Part of the line to mark rather than all of it, as it reads on the board (spaces ignored).
    at: str | None = None
    #: Where an arrow or a move starts, when it goes piece to piece rather than line to line.
    from_: PointFrom | None = Field(default=None, alias="from")
    #: A mark on a diagram: which one — a question's figure by its number (from 0), or the
    #: lesson's own sketch, "sketch" (a second, "sketch_b") — and what in it: a point's label,
    #: two labels for a side, three for an angle, or a place in the drawing's units.
    figure: int | Literal["sketch", "sketch_b", "sketch_c"] | None = None
    target: str | list[str] | FigureSpot | None = None
    #: An arrow across between the working and a diagram: where it lands. Or, for any mark on
    #: the working, the place in the passage its piece is linked to (`passage` and `target`).
    to: PointTo | None = None
    #: A mark in the question's passage: `target` is the words in it, `nth` which occurrence
    #: (from 1) where they occur more than once (database/lesson_marks.py).
    passage: bool | None = None
    nth: int | None = None
    #: The word it is drawn on, in the whiteboard style (app/lesson_cues.py).
    on: LessonCue | None = None


def _drawing(value: object) -> int | Literal["sketch", "sketch_b", "sketch_c"] | None:
    """A diagram as a mark names it: a figure's number from 0, or the lesson's sketch."""
    if value == "sketch":
        return "sketch"
    if value in ("sketch_b", "sketch_c"):
        return value
    number = _whole(value)
    return number if number is not None and number >= 0 else None


def _across(raw: object, to_figure: bool) -> PointTo | None:
    """An arrow's `to`, kept only where it names somewhere the board can find."""
    if not isinstance(raw, dict):
        return None
    if to_figure:
        drawing, target = _drawing(raw.get("figure")), _target(raw.get("target"))
        return PointTo(figure=drawing, target=target) if drawing is not None and target else None
    line = _whole(raw.get("line"))
    return PointTo(line=line, at=_words(raw.get("at"))) if line is not None else None


def _in_passage(raw: object) -> tuple[str, int | None] | None:
    """A place in the passage (`passage: true`, `target`, `nth`), or None where it is not one."""
    if not isinstance(raw, dict) or raw.get("passage") is not True:
        return None
    target = raw.get("target")
    if not isinstance(target, str) or not target.strip():
        return None
    nth = _whole(raw.get("nth"))
    return target.strip(), nth if nth is not None and nth >= 1 else None


def _show_sketch(value: object) -> bool | Literal["sketch_b", "sketch_c"]:
    """A moment's `show_sketch`: true for the lesson's first sketch, or a later one's name."""
    if value == "sketch_b":
        return "sketch_b"
    if value == "sketch_c":
        return "sketch_c"
    return value is True or value == "sketch"


def _words(value: object) -> str | None:
    return (str(value).strip() or None) if value is not None else None


def _whole(value: object) -> int | None:
    """An integer that is really one (YAML's `true` is not a line number)."""
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _target(raw: object) -> str | list[str] | FigureSpot | None:
    if isinstance(raw, str):
        return raw.strip() or None
    if isinstance(raw, list):
        labels = [str(label).strip() for label in raw if isinstance(label, str | int)]
        return [label for label in labels if label] or None
    if isinstance(raw, dict):
        x, y = raw.get("x"), raw.get("y")
        if all(isinstance(n, int | float) and not isinstance(n, bool) for n in (x, y)):
            return FigureSpot(x=float(x), y=float(y))  # type: ignore[arg-type]
    return None


def _points(raw: object) -> list[LessonPoint] | None:
    """A moment's `point` list as the board draws it, or None when it has none.

    Lenient on purpose: a mark is decoration over a lesson that already teaches without it, so a
    malformed one is dropped rather than taking the lesson down. A mark is either on the
    working (a whole-number `line`) or on the diagram (a whole-number `figure` and a `target`
    it can find), and its kind has to be one that makes sense there; a `from` that is not a
    piece of a line is left off rather than losing the mark.
    """
    if not isinstance(raw, list):
        return None
    kept: list[LessonPoint] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind not in _POINT_KINDS:
            continue
        line, figure = _whole(item.get("line")), _whole(item.get("figure"))
        drawing: int | Literal["sketch", "sketch_b", "sketch_c"] | None = figure
        if item.get("figure") in ("sketch", "sketch_b", "sketch_c"):
            drawing = _drawing(item.get("figure"))
        label = _words(item.get("text"))
        spot = _in_passage(item)
        if item.get("passage") is not None:
            if spot is not None and kind in _PASSAGE_KINDS:
                kept.append(
                    LessonPoint(kind=kind, text=label, passage=True, target=spot[0], nth=spot[1])
                )
            continue
        if drawing is not None and (not isinstance(drawing, int) or drawing >= 0):
            target = _target(item.get("target"))
            if kind not in _FIGURE_KINDS or target is None:
                continue
            mark = LessonPoint(kind=kind, text=label, figure=drawing, target=target)
            if kind == "arrow":
                mark.to = _across(item.get("to"), to_figure=False)
            kept.append(mark)
            continue
        if kind == "travel":
            travel = _travel(item, line, label)
            if travel is not None:
                kept.append(travel)
            continue
        if line is None or kind not in _LINE_KINDS:
            continue
        start = item.get("from")
        begin = None
        if isinstance(start, dict) and _whole(start.get("line")) is not None:
            begin = PointFrom(line=start["line"], at=_words(start.get("at")))
        if kind == "move" and begin is None:
            continue
        point = LessonPoint(line=line, kind=kind, text=label, at=_words(item.get("at")))
        if kind in ("arrow", "move"):
            point.from_ = begin
        linked = _in_passage(item.get("to"))
        drawn = doodle_link(item.get("to"))
        if linked is not None and kind != "move" and begin is None:
            point.to = PointTo(passage=True, target=linked[0], nth=linked[1])
        elif drawn is not None and kind != "move" and begin is None:
            point.to = PointTo(doodle=drawn[0], part=drawn[1])
        elif (charted := diagram_link(item.get("to"))) and kind != "move" and begin is None:
            point.to = PointTo(diagram=charted[0], part=charted[1])
        elif kind == "arrow" and begin is None:
            point.to = _across(item.get("to"), to_figure=True)
        kept.append(point)
    return kept or None


def _travel(item: dict[str, Any], line: int | None, label: str | None) -> LessonPoint | None:
    """A `travel` mark (a value riding an arrow into a line), or None where it is not whole.

    It needs the piece it lands on (`line`, `at`) and one place it comes from: a doodle and a
    part of it, a place on a diagram, or a piece of a line (database/lesson_marks.py).
    """
    at = _words(item.get("at"))
    start = item.get("from")
    if line is None or at is None or not isinstance(start, dict):
        return None
    begin: PointFrom | None = None
    drawn = doodle_link(start)
    if drawn is not None:
        begin = PointFrom(doodle=drawn[0], part=drawn[1])
    elif "figure" in start:
        drawing, target = _drawing(start.get("figure")), _target(start.get("target"))
        if drawing is not None and target is not None:
            begin = PointFrom(figure=drawing, target=target)
    elif _whole(start.get("line")) is not None:
        begin = PointFrom(line=start["line"], at=_words(start.get("at")))
    if begin is None:
        return None
    point = LessonPoint(line=line, kind="travel", text=label, at=at)
    point.from_ = begin
    return point


def _cued_points(raw: object) -> list[LessonPoint] | None:
    """`_points`, with each mark's cue (`on`) kept on it, for the whiteboard style."""
    if not isinstance(raw, list):
        return None
    kept: list[LessonPoint] = []
    for item in raw:
        found = _points([item])
        if found:
            found[0].on = cue_of(item)
            kept.extend(found)
    return kept or None


class LessonBeat(BaseModel):
    #: Which reviewed step this beat teaches, for asking about it: a step's index, one past the
    #: last for the answer, or None where the beat is not one step (an opening, or any moment
    #: of a written lesson, which follows the working rather than the steps).
    board_index: int | None
    #: The line written while `say` is spoken, if any. It starts being written as the voice
    #: starts, and is written out over the time the words take.
    write: list[str]
    #: When each written item starts, as a fraction of the way through `say`.
    write_at: list[float]
    say: str
    voice_url: str
    #: The moment that gives the answer, which the board marks.
    answer: bool = False
    #: Marks drawn over earlier lines while this beat is said: circles, underlines, arrows.
    point: list[LessonPoint] | None = None
    #: The sketch this beat brings onto the board: true for the first ("sketch"), or the name of
    #: a later one. A sketch no beat brings in comes with the first.
    show_sketch: bool | Literal["sketch_b", "sketch_c"] = False
    #: A small picture this beat draws beside a line (app/lesson_doodles.py), if any.
    doodle: DoodleRef | None = None
    #: Or the one or two it brings in (doodles v2), and what the pen does to earlier ones.
    doodles: list[DoodleRef] | None = None
    doodle_do: list[DoodleOp] | None = None
    #: The word its `write` (and the sketch it brings in) lands on, in the whiteboard style.
    on: LessonCue | None = None
    #: The heading of the section of the working this beat starts (`section:` in the lesson
    #: file), which the whiteboard style puts up as a heading chip; the classic one ignores it.
    section: str | None = None
    #: A talking mouth this beat brings in (app/lesson_mouth.py), for oral English.
    mouth: LessonMouth | None = None
    #: A live diagram this beat brings in, and what the pen does to diagrams already up
    #: (app/lesson_diagrams.py; docs/plans/doodles-v2-contract.md section 8).
    diagram: LessonDiagram | None = None
    diagram_do: list[DiagramOp] | None = None


class LessonSketch(BaseModel):
    """A diagram drawn for the lesson from the question's words (migration 026).

    Sent as the SVG's text for the board to show as a picture — an <img> of a data: URL,
    never as markup. It was checked when it was loaded (database/lesson_marks.py): nothing in
    it runs or fetches.
    """

    #: What the lesson's marks call it: "sketch", or "sketch_b" for a second.
    name: Literal["sketch", "sketch_b", "sketch_c"]
    svg: str
    alt_text: str | None = None
    width: int | None = None
    height: int | None = None


class NarratedLesson(BaseModel):
    #: "script": the lesson written for this question. "model": a teacher's narration written
    #: live over the reviewed steps, for a question with no lesson yet. "steps": neither could
    #: be had, and the board reads the reviewed steps.
    source: Literal["script", "model", "steps"]
    beats: list[LessonBeat]
    #: The lesson's own diagrams, for a question that describes its figure in words.
    sketches: list[LessonSketch] = []
    #: The pictures drawn for this lesson's board, which its beats' `doodle` name (027).
    doodles: list[LessonDoodle] = []
    #: The right option's own words, which the board writes into a cloze passage's gap at the
    #: moment of the answer. None where the question has no right option on record.
    answer_text: str | None = None


@dataclasses.dataclass(frozen=True)
class _Beat:
    board_index: int | None
    write: list[str]
    at: list[float]
    say: str
    answer: bool = False
    point: list[LessonPoint] | None = None
    show_sketch: bool | Literal["sketch_b", "sketch_c"] = False
    doodle: DoodleRef | None = None
    doodles: list[DoodleRef] | None = None
    doodle_do: list[DoodleOp] | None = None
    on: LessonCue | None = None
    section: str | None = None
    mouth: LessonMouth | None = None
    diagram: LessonDiagram | None = None
    diagram_do: list[DiagramOp] | None = None


async def _must_have_missed(conn: AsyncConnection, session_id: UUID, version_id: UUID) -> None:
    """Refuse unless this sitting has a wrong answer to this question.

    The lesson is prepared from the first wrong answer, so it is ready by the time the board
    opens. That is as early as it may start: a question nobody has missed has no lesson to
    prepare, and the voice cannot be used to read anything else.
    """
    missed = (
        await conn.execute(
            text(
                """
                SELECT 1 FROM attempts
                WHERE session_id = :session AND question_version_id = :version
                  AND coalesce(is_correct, false) IS FALSE
                LIMIT 1
                """
            ),
            {"session": session_id, "version": version_id},
        )
    ).scalar()
    if missed is None:
        raise HTTPException(status_code=409, detail="there is no lesson for this question yet")


async def _latest_answer(
    conn: AsyncConnection, session_id: UUID, version_id: UUID
) -> dict[str, Any] | None:
    """This sitting's latest answer to the question: whether it was right, and what was said."""
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT is_correct, confidence FROM attempts
                    WHERE session_id = :session AND question_version_id = :version
                    ORDER BY answered_at_client DESC
                    LIMIT 1
                    """
                ),
                {"session": session_id, "version": version_id},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row is not None else None


async def _answered_right(conn: AsyncConnection, session_id: UUID, version_id: UUID) -> bool:
    """Whether this sitting's latest answer to the question was right.

    First try or second, sure or not. A right answer the student guessed or doubted is where
    the working is recommended ("Show me the working"); after a sure one it is still theirs to
    open ("See how it's worked out"). Either way the answer is already recorded, so opening
    the lesson changes nothing that is scored. Read from what is stored, like every other door
    here.
    """
    latest = await _latest_answer(conn, session_id, version_id)
    return latest is not None and bool(latest["is_correct"])


async def _in_a_finished_mock(conn: AsyncConnection, session_id: UUID, version_id: UUID) -> bool:
    """A question on a mock exam that has been handed in: its lesson opens from the report."""
    found = (
        await conn.execute(
            text(
                """
                SELECT 1
                FROM mock_exam_items i
                JOIN mock_exams m ON m.id = i.mock_exam_id
                WHERE i.session_id = :session AND i.question_version_id = :version
                  AND m.submitted_at IS NOT NULL
                """
            ),
            {"session": session_id, "version": version_id},
        )
    ).first()
    return found is not None


async def _lesson_is_open(
    conn: AsyncConnection, session_id: UUID, version_id: UUID, *, whole: bool
) -> None:
    """Refuse the lesson unless this sitting has earned it.

    `whole` is the lesson itself, which opens at the board (missed twice); otherwise its voice
    and its preparation, which may start from the first miss. Either way a right answer opens
    it too.
    """
    if await _answered_right(conn, session_id, version_id):
        return
    if await _in_a_finished_mock(conn, session_id, version_id):
        return
    if whole:
        await _must_be_at_the_board(conn, session_id, version_id)
    else:
        await _must_have_missed(conn, session_id, version_id)


async def _mistake(
    conn: AsyncConnection, session_id: UUID, version_id: UUID, *, first: bool
) -> tuple[str | None, str | None]:
    """A wrong option this sitting chose for the question, and why that option tempts.

    `first` for the narration written while the student is still trying, so it opens on the
    mistake they started with; otherwise the latest, which is the one a written lesson's trap
    is said about at the end.
    """
    row = (
        (
            await conn.execute(
                text(
                    f"""
                    SELECT a.selected_option_key, m.description
                    FROM attempts a
                    LEFT JOIN question_options o
                      ON o.question_version_id = a.question_version_id
                     AND o.option_key = a.selected_option_key
                    LEFT JOIN misconceptions m ON m.id = o.misconception_id
                    WHERE a.session_id = :session AND a.question_version_id = :version
                      AND coalesce(a.is_correct, false) IS FALSE
                    ORDER BY a.answered_at_client {"ASC" if first else "DESC"}
                    LIMIT 1
                    """
                ),
                {"session": session_id, "version": version_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return None, None
    return row["selected_option_key"], row["description"]


async def _narration(
    conn: AsyncConnection, session_id: UUID, version_id: UUID, settings: Settings
) -> tuple[tutor.Narration, list[str], Literal["model", "steps"]]:
    """A teacher's narration over the reviewed steps, for a question with no written lesson.

    Kept on disk under a name drawn from everything it depends on, so every student who makes
    the same mistake hears the same lesson without it being written again. Returns the
    narration, the reviewed steps it was written over, and where it came from.
    """
    # Any sitting the student owns: a practice run, or a mock exam's subject once handed in.
    student_id = (
        await conn.execute(
            text("SELECT student_id FROM study_sessions WHERE id = :id"), {"id": session_id}
        )
    ).scalar()
    if student_id is None:
        raise HTTPException(status_code=404, detail="unknown session")
    lesson = await _lesson_on_the_board(conn, session_id, student_id, version_id, None, settings)
    chose, misconception = await _mistake(conn, session_id, version_id, first=True)
    lesson = dataclasses.replace(lesson, chose=chose, misconception=misconception)
    key = hashlib.sha256(
        json.dumps(
            [
                tutor.NARRATION_VERSION,
                settings.ai_runtime_model,
                str(version_id),
                chose,
                lesson.steps,
                lesson.correct_option_key,
            ]
        ).encode()
    ).hexdigest()
    kept = voice_store.folder() / "lessons" / f"{key}.json"
    async with voice_store.making(key):
        if kept.is_file():
            data = json.loads(kept.read_text(encoding="utf-8"))
            narration = tutor.Narration(
                opening=tutor.Taught(**data["opening"]),
                steps=[tutor.Taught(**step) for step in data["steps"]],
                closing=data["closing"],
            )
            return narration, lesson.steps, "model"
        made = await tutor.narrate(lesson, settings)
        if made is not None:
            voice_store.write_atomically(kept, json.dumps(dataclasses.asdict(made)).encode())
            return made, lesson.steps, "model"
    # No narration to be had: the board reads its own reviewed steps. Not kept, so the next
    # student gets another try at the real thing.
    plain = tutor.Narration(
        opening=tutor.Taught(said="", board=[], at=[]),
        steps=[tutor.Taught(said=step, board=[], at=[]) for step in lesson.steps],
        closing=f"The answer is {lesson.correct_option_key}.",
    )
    return plain, lesson.steps, "steps"


async def _lesson_sketches(conn: AsyncConnection, version_id: UUID) -> list[LessonSketch]:
    """The written lesson's own sketches, found the way `_lesson_beats` finds the lesson.

    Read as `to_jsonb(l) -> 'sketches'` rather than by column name, so a database not yet
    migrated to 026 reads as a lesson with no sketches instead of failing the lesson. A stored
    sketch that does not fit the model is left out: the lesson teaches without it.
    """
    stored = (
        await conn.execute(
            text(
                """
                SELECT to_jsonb(l) -> 'sketches'
                FROM question_versions seen
                JOIN questions q ON q.id = seen.question_id
                JOIN question_lessons l
                  ON l.question_version_id IN (seen.id, q.current_version_id)
                WHERE seen.id = :v
                ORDER BY l.question_version_id = seen.id DESC
                LIMIT 1
                """
            ),
            {"v": version_id},
        )
    ).scalar()
    stored = json.loads(stored) if isinstance(stored, str) else stored
    sketches: list[LessonSketch] = []
    for raw in stored if isinstance(stored, list) else []:
        try:
            sketches.append(LessonSketch.model_validate(raw))
        except ValueError:
            continue
    return sketches


def beats_from_moments(moments: list[Any]) -> list[_Beat]:
    """A written lesson's moments as the board plays them: a question's lesson or a subtopic's
    (roadmap.py), the same beats either way."""
    acting = doodle_actions(moments)
    return [
        _Beat(
            board_index=None,
            write=[str(moment["write"])] if moment.get("write") else [],
            at=[0.0] if moment.get("write") else [],
            say=str(moment["say"]),
            answer=bool(moment.get("answer")),
            point=_cued_points(moment.get("point")),
            show_sketch=_show_sketch(moment.get("show_sketch")),
            doodle=doodle_ref(moment.get("doodle")),
            doodles=doodle_refs(moment.get("doodles")),
            doodle_do=acting[index],
            on=cue_of(moment),
            section=_words(moment.get("section")),
            mouth=mouth_of(moment.get("mouth")),
            diagram=diagram_of(moment.get("diagram")),
            diagram_do=diagram_actions(moment.get("diagram_do")),
        )
        for index, moment in enumerate(moments)
    ]


async def _lesson_beats(
    conn: AsyncConnection, session_id: UUID, version_id: UUID, settings: Settings
) -> tuple[list[_Beat], Literal["script", "model", "steps"]]:
    """The lesson in the order it happens.

    A written lesson when the question has one: every line of working, each written as it is
    said, and at the end the trap in the option this student last chose. Otherwise a narration
    over the reviewed steps — and then the board writes each reviewed step whole, because a
    step's working cut down to fragments reads as working with lines missing.
    """
    # The lesson written for this version, or else the one on the question's current version.
    # A student can meet a question on a version it has since moved on from (a session started
    # before a correction), and a lesson is only ever loaded onto the current version; without
    # this they would get the bare reviewed steps. Where the correction changed the answer, the
    # old key was the mistake, so the corrected lesson is still the one to teach.
    written = (
        (
            await conn.execute(
                text(
                    """
                    SELECT l.moments, l.traps
                    FROM question_versions seen
                    JOIN questions q ON q.id = seen.question_id
                    JOIN question_lessons l
                      ON l.question_version_id IN (seen.id, q.current_version_id)
                    WHERE seen.id = :v
                    ORDER BY l.question_version_id = seen.id DESC
                    LIMIT 1
                    """
                ),
                {"v": version_id},
            )
        )
        .mappings()
        .first()
    )
    if written is not None:
        moments = written["moments"]
        moments = json.loads(moments) if isinstance(moments, str) else moments
        traps = written["traps"]
        traps = json.loads(traps) if isinstance(traps, str) else (traps or {})
        beats = beats_from_moments(moments)
        chose, _ = await _mistake(conn, session_id, version_id, first=False)
        # No trap when the option they ended on was the right one: a student who got there
        # (however unsure) is not told about a mistake as if it were the one they made last.
        latest = await _latest_answer(conn, session_id, version_id)
        ended_right = latest is not None and bool(latest["is_correct"])
        if chose and traps.get(chose) and not ended_right:
            beats.append(_Beat(board_index=None, write=[], at=[], say=str(traps[chose])))
        return beats, "script"

    narration, steps, source = await _narration(conn, session_id, version_id, settings)
    beats = []
    if narration.opening.said:
        beats.append(
            _Beat(
                None,
                list(narration.opening.board),
                list(narration.opening.at),
                narration.opening.said,
            )
        )
    beats += [
        _Beat(index, [step], [0.0], taught.said)
        for index, (taught, step) in enumerate(zip(narration.steps, steps, strict=True))
    ]
    beats.append(_Beat(len(steps), [], [], narration.closing, answer=True))
    return beats, source


@router.get(
    "/{session_id}/lesson/{question_version_id}",
    response_model=NarratedLesson,
    summary="The worked solution as a lesson: what goes on the board, and what is said",
)
async def lesson(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: UUID,
) -> NarratedLesson:
    await require_session_owner(request, conn, session_id)
    await _lesson_is_open(conn, session_id, question_version_id, whole=True)
    beats, source = await _lesson_beats(conn, session_id, question_version_id, settings)
    return NarratedLesson(
        source=source,
        beats=[
            LessonBeat(
                board_index=beat.board_index,
                write=beat.write,
                write_at=beat.at,
                say=beat.say,
                # The line's own fingerprint in the address: the clip is cached for a day, so
                # a rewritten line must be fetched afresh rather than replay the old recording.
                voice_url=(
                    f"/v1/practice/{session_id}/lesson/{question_version_id}/voice/{index}"
                    f"?v={hashlib.sha256(beat.say.encode()).hexdigest()[:12]}"
                ),
                answer=beat.answer,
                point=beat.point,
                show_sketch=beat.show_sketch,
                doodle=beat.doodle,
                doodles=beat.doodles,
                doodle_do=beat.doodle_do,
                on=beat.on,
                section=beat.section,
                mouth=beat.mouth,
                diagram=beat.diagram,
                diagram_do=beat.diagram_do,
            )
            for index, beat in enumerate(beats)
        ],
        sketches=await _lesson_sketches(conn, question_version_id) if source == "script" else [],
        doodles=await lesson_doodles(conn, question_version_id) if source == "script" else [],
        answer_text=await _answer_text(conn, question_version_id),
    )


async def _answer_text(conn: AsyncConnection, version_id: UUID) -> str | None:
    """The right option's words: the lesson opens only once the answer is shown anyway."""
    body = (
        await conn.execute(
            text(
                """
                SELECT body FROM question_options
                WHERE question_version_id = :version AND is_correct
                ORDER BY display_order LIMIT 1
                """
            ),
            {"version": version_id},
        )
    ).scalar()
    return str(body).strip() or None if body is not None else None


@router.get(
    "/{session_id}/lesson/{question_version_id}/voice/{beat}",
    summary="Hear one beat of the lesson",
)
async def lesson_voice(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: UUID,
    beat: int,
    engine: voice_store.Engine = "studio",
) -> Response:
    """`engine=kokoro` asks for the free voice made on this server; where it is not offered,
    the studio voice answers instead, and `X-Voice-Engine` says which one was heard."""
    await require_session_owner(request, conn, session_id)
    await premium.check_voice(conn, session_id)
    await _lesson_is_open(conn, session_id, question_version_id, whole=False)
    beats, _ = await _lesson_beats(conn, session_id, question_version_id, settings)
    if not 0 <= beat < len(beats):
        raise HTTPException(status_code=404, detail="no such beat")
    path = await voice_store.voiced(beats[beat].say, settings, engine=engine)
    if path is None:
        # No voice to be had. The board reads this as silence and holds the beat instead.
        raise HTTPException(status_code=404, detail="no voice for this beat")
    return FileResponse(
        path,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Voice-Engine": voice_store.engine_for(engine, settings),
        },
    )


@router.get(
    "/{session_id}/lesson/{question_version_id}/voice/{beat}/words",
    summary="When each word of one beat is said",
)
async def lesson_voice_words(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: UUID,
    beat: int,
    engine: voice_store.Engine = "studio",
) -> dict[str, Any]:
    """`{engine, duration, estimated, words: [{w, start, end}]}` for the beat's clip, in seconds.

    The words are the line as spoken (its mathematics in words), not as written. Waits for the
    clip if it is still being made. Only the Kokoro voice keeps timings, so a studio clip, or
    no clip at all, is a 404 and the board reveals by its own clock instead.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_voice(conn, session_id)
    await _lesson_is_open(conn, session_id, question_version_id, whole=False)
    beats, _ = await _lesson_beats(conn, session_id, question_version_id, settings)
    if not 0 <= beat < len(beats):
        raise HTTPException(status_code=404, detail="no such beat")
    said = beats[beat].say
    if voice_store.engine_for(engine, settings) in voice_store.TIMED:
        await voice_store.voiced(said, settings, engine=engine)
    found = voice_store.timings(said, settings, engine)
    if found is None:
        raise HTTPException(status_code=404, detail="no word timings for this beat")
    return found


@router.post(
    "/{session_id}/lesson/{question_version_id}/warm",
    status_code=202,
    summary="Start preparing the lesson, so the board finds it ready",
)
async def warm_lesson(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: UUID,
    background: BackgroundTasks,
    engine: voice_store.Engine = "studio",
) -> dict[str, int]:
    """Called on the first wrong answer, so the board opens on a lesson already prepared.

    This is where a written lesson's audio is made: one question at a time, the first time a
    student needs it, and kept for everyone after. Nothing voices the whole bank in advance.
    A question without a written lesson has its narration written here too.
    """
    await require_session_owner(request, conn, session_id)
    if not await premium.voice_allowed(conn, session_id):
        return {"beats": 0}  # the written board needs nothing made
    await _lesson_is_open(conn, session_id, question_version_id, whole=False)
    beats, _ = await _lesson_beats(conn, session_id, question_version_id, settings)
    lines = [beat.say for beat in beats]
    # Kokoro is free and independent of the paid voice's switch; it is made when asked for
    # and offered here, and otherwise the studio voice is warmed as it always was.
    if voice_store.engine_for(engine, settings) == "kokoro":
        # In step order, one at a time, and only while no student is waiting on a line.
        background.add_task(
            voice_store.voice_all, lines, settings, at_once=1, patient=True, engine="kokoro"
        )
    elif voice_store.engine_for(engine, settings) == "inworld":
        # Hosted, so a few at once; each line is kept and paid for once.
        background.add_task(
            voice_store.voice_all, lines, settings, at_once=3, patient=True, engine="inworld"
        )
    elif settings.ai_speak:
        background.add_task(voice_store.voice_all, lines, settings)
    return {"beats": len(lines)}


class LessonFeedbackIn(BaseModel):
    """What the student said once the lesson was over."""

    #: Which door they came through: two misses, a right answer they guessed or doubted (first
    #: try or second), or any other right answer they chose to see worked out.
    context: Literal[
        "after_misses", "after_guess", "after_unsure", "after_second_guess", "after_right"
    ]
    understood: Literal["got_it", "unsure", "too_hard"]
    #: Whether the working matched what they did. Optional: not every student worked it out.
    matched_working: Literal["yes", "partly", "no"] | None = None


class LessonFeedbackOut(BaseModel):
    id: UUID


@router.post(
    "/{session_id}/lesson/{question_version_id}/feedback",
    response_model=LessonFeedbackOut,
    status_code=201,
    summary="Say whether the lesson landed",
)
async def lesson_feedback(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    session_id: UUID,
    question_version_id: UUID,
    feedback: LessonFeedbackIn,
) -> LessonFeedbackOut:
    """One row per answer. A student may answer again; the latest per question is the one read.

    Only for a lesson this sitting could open, by the same rule as the lesson itself, so the
    table cannot fill with opinions about lessons nobody saw.
    """
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    await _lesson_is_open(conn, session_id, question_version_id, whole=True)
    made = (
        await conn.execute(
            text(
                """
                INSERT INTO lesson_feedback (student_id, session_id, question_version_id,
                  context, understood, matched_working)
                VALUES (:student, :session, :version, :context, :understood, :matched)
                RETURNING id
                """
            ),
            {
                "student": session["student_id"],
                "session": session_id,
                "version": question_version_id,
                "context": feedback.context,
                "understood": feedback.understood,
                "matched": feedback.matched_working,
            },
        )
    ).scalar_one()
    await conn.commit()
    return LessonFeedbackOut(id=made)


@router.get(
    "/{session_id}/speech/{handle}",
    summary="Hear one line the coach wrote, as it is spoken",
)
async def speech(
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    handle: str,
    engine: voice_store.Engine = "studio",
) -> StreamingResponse:
    """Stream the audio for one spoken line.

    WHY THE BROWSER FETCHES THIS INSTEAD OF BEING SENT IT. An `<audio>` element plays a sound
    that is still arriving; reassembling one from base64 down a lesson stream does not, and
    costs a third more bytes to fail at. So the lesson stream hands out a handle the moment
    the line is written, the browser starts fetching at once, and the voice is generated while
    the next line is still being typed.

    THE HANDLE IS THE PERMISSION. It is random, it is held in memory for ten minutes, and it
    is bound to the session it was made for — a handle from one sitting cannot be replayed
    against another. There is nothing behind it but a sentence the coach has just written and
    the student is about to hear anyway.
    """
    waiting = _WAITING_TO_BE_SAID.get(handle)
    if waiting is None or waiting[0] < time.monotonic() or waiting[1] != session_id:
        raise HTTPException(status_code=404, detail="nothing to say")

    line = waiting[2]

    async def audio() -> AsyncIterator[bytes]:
        if voice_store.engine_for(engine, settings) == "kokoro":
            # Made whole rather than streamed, and not kept: a coach's line is said once.
            said = tutor.for_the_voice(line)
            clip = await asyncio.to_thread(kokoro_voice.synthesize, said, settings)
            if clip is not None:
                yield clip.mp3
            return
        if voice_store.engine_for(engine, settings) == "inworld":
            made = await inworld_voice.synthesize(tutor.for_the_voice(line), settings)
            if made is not None:
                yield made.mp3
            return
        async for chunk in tutor.speak_streaming(line, settings):
            yield chunk

    return StreamingResponse(
        audio(),
        media_type="audio/mpeg",
        # The same line is fetched once and never changes, but it is also worth nothing to
        # anyone later, so it is not worth a cache entry on the way either.
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
