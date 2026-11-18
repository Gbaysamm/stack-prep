"""The check-up: the first sitting, which establishes where a student stands.

A short, mixed sitting with no help, taken every week or so. Its result is plain: right ÷
answered, and the latest check-up's result is the student's predicted score
(docs/student-scoring.md §4). It is recorded as a study session (`session_type = 'checkup'`),
and its answers are ordinary attempts, so they also count in every topic score.

The sitting holds no server-side state of its own: the blueprint is a deterministic
function of the syllabus, so the nth question is derived from the n-1 answers already
recorded. Nothing to lose if the device drops off halfway.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app import notifications, scoring, xp
from app.auth import require_session_owner, require_student
from app.db import connection, fetch_all
from app.figures import OptionFigure, QuestionFigure, figures_for, option_figures_for
from engine.checkup import (
    DEFAULT_LENGTH,
    BlueprintSlot,
    TopicAnswers,
    TopicWeight,
    build_blueprint,
    confidence_for,
    next_level,
    summarise,
)
from engine.mastery import Attempt
from engine.projection import UnitStanding
from engine.version import ENGINE_VERSION

router = APIRouter(prefix="/v1/checkup", tags=["checkup"])

#: What a check-up must never draw on. Held-out items exist to measure the bank itself, and
#: spending them on a diagnosis would burn the only unpractised set we keep.
#:
#: Note what is NOT excluded: ordinary practice questions. A check-up used to require items
#: reserved in the diagnostic pool, which sounds careful and mostly is not. What makes a
#: baseline honest is that THIS student has not seen the question, and that is a fact about
#: the student's history, not a label on the question. A student sitting a first check-up has
#: no history at all, so every question is equally unseen to them, and a reserved pool buys
#: nothing while taking items out of practice for everybody else.
#:
#: The exclusion is therefore per-student, read from student_question_history — which the
#: schema describes as exactly that: "the selector reads this to avoid repeating an item". A
#: curated pool still counts, since reserved questions are preferred where they exist, but it
#: is a preference now rather than a gate, and a subject with no pool works fine.
EXCLUDED_POOL = "held_out"


class StartCheckup(BaseModel):
    student_id: UUID
    subject_id: UUID


class AnswerIn(BaseModel):
    #: Client-generated, so a retried submission is stored once.
    attempt_id: UUID = Field(default_factory=uuid4)
    question_version_id: UUID
    selected_option_key: str = Field(pattern="^[A-F]$")
    response_ms: int = Field(ge=0, le=3_600_000)


class CheckupOption(BaseModel):
    option_key: str
    body: str
    #: The option's drawing, when the option is a picture; its `body` is then only a label.
    figure: OptionFigure | None = None


class QuestionOut(BaseModel):
    position: int
    of: int
    #: The DB topic, which is JAMB's section ("Algebra"). Kept for older clients.
    topic_name: str
    #: The same as `topic_name`, named for what it is: JAMB's section, a heading only.
    section_name: str | None = None
    #: The DB subtopic, which is JAMB's topic ("Polynomials"): what students see.
    subtopic_name: str | None = None
    question_version_id: UUID
    stem: str
    instructions: str | None
    passage_title: str | None
    passage_body: str | None
    options: list[CheckupOption]
    figures: list[QuestionFigure] = Field(default_factory=list)


class CheckupState(BaseModel):
    session_id: UUID
    answered: int
    length: int
    finished: bool
    weights_source: str
    question: QuestionOut | None = None
    #: The question after this one, when this answer cannot change it (it is in another
    #: topic), so the app can show it the moment Next is pressed and save in the background.
    #: None when the next question depends on this answer, or this is the last.
    upcoming: QuestionOut | None = None


class TopicReport(BaseModel):
    topic_id: UUID
    name: str
    answered: int
    correct: int
    mastery: float | None
    confidence: str
    highest_level_correct: int | None
    lowest_level_wrong: int | None
    slow: bool


@dataclass(frozen=True)
class UnitWeight:
    """One subtopic and its share of the paper."""

    unit_id: str
    name: str
    topic_id: str
    topic_name: str
    share: float


class SubtopicReport(BaseModel):
    """One JAMB topic (the DB's subtopic): the unit a student sees and works on."""

    subtopic_id: UUID
    name: str
    #: The DB topic above it, which is JAMB's section. Kept for older clients.
    topic_name: str
    #: Share of the paper, 0 to 1.
    share: float
    answered: int
    correct: int
    #: None when the sitting never reached it. Not the same as zero.
    mastery: float | None
    confidence: str
    #: JAMB's section this topic sits under (the DB topic), for grouping under a heading.
    section_id: UUID | None = None
    section_name: str | None = None


class CheckupReport(BaseModel):
    session_id: UUID
    subject_id: UUID
    answered: int
    finished: bool
    #: Per DB topic, which is JAMB's SECTION (5 in Maths). Students see `subtopics`.
    topics: list[TopicReport]
    #: Per JAMB topic (the DB subtopic, 23 in Maths), in syllabus order. The finer reading
    #: a student can act on: "Idiomatic usage 35%", not "Lexis 62%".
    subtopics: list[SubtopicReport]
    weights_source: str
    #: How many of this sitting's questions were right.
    right: int
    #: This sitting's result: the average of its topic scores (docs/student-scoring.md §3).
    score: int | None
    #: The check-up before this one, to show the change.
    previous_score: int | None
    #: The subject as it stands now, from every counted answer (docs/student-scoring.md §2).
    standing: scoring.SubjectScore | None
    #: Section names (DB topics) the sitting did not reach.
    unassessed_topics: list[str]
    #: Section names (DB topics) to start with.
    priority_topics: list[str]
    #: Said plainly, because a short sitting is a starting point and not a measurement.
    caveat: str


async def _current_syllabus(conn: AsyncConnection, subject_id: UUID) -> UUID:
    row = (
        await conn.execute(
            text(
                """
                SELECT id FROM syllabus_versions
                WHERE subject_id = :s AND status = 'approved' AND is_current
                """
            ),
            {"s": subject_id},
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=409,
            detail="this subject has no approved, current syllabus version yet",
        )
    version_id: UUID = row[0]
    return version_id


async def _topics(conn: AsyncConnection, subject_id: UUID) -> tuple[list[TopicWeight], str]:
    """Topics that have questions a check-up could use, weighted by exam share.

    Where no reviewed weights exist yet, topics are treated as equally important and the
    response says so — a guessed weighting presented as fact would quietly distort every
    plan built on it.
    """
    version_id = await _current_syllabus(conn, subject_id)
    rows = await fetch_all(
        conn,
        """
        -- MATERIALIZED, and it is not decoration. deliverable_questions is six joins deep;
        -- left inline, the planner re-ran the whole thing once per candidate row and this
        -- query took 5.3 seconds against 754 questions. Pinned to one evaluation it takes 22
        -- milliseconds. The view also already carries primary_skill_id, so the classification
        -- join it used to do here was work done twice.
        WITH deliverable AS MATERIALIZED (
          SELECT dq.question_id, dq.primary_skill_id
          FROM deliverable_questions dq
          JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
          WHERE dq.subject_id = :subject
        )
        SELECT topic.id::text AS topic_id, topic.name, w.share,
               count(DISTINCT d.question_id) AS available
        FROM curriculum_items topic
        JOIN curriculum_items sub ON sub.parent_id = topic.id
        JOIN curriculum_items skill ON skill.parent_id = sub.id AND skill.item_type = 'skill'
        JOIN deliverable d ON d.primary_skill_id = skill.id
        -- Weight comes from the exam's structure, never from how many questions we happen
        -- to hold: our bank's shape is our sampling, not the examination's.
        LEFT JOIN topic_exam_weight w
          ON w.topic_id = topic.id AND w.syllabus_version_id = topic.syllabus_version_id
        WHERE topic.syllabus_version_id = :version AND topic.item_type = 'topic'
        GROUP BY topic.id, topic.name, w.share, topic.display_order, topic.code
        HAVING count(DISTINCT d.question_id) > 0
        ORDER BY topic.display_order, topic.code
        """,
        version=version_id,
        subject=subject_id,
        pool=EXCLUDED_POOL,
    )
    if not rows:
        raise HTTPException(
            status_code=409,
            detail=(
                "no approved questions exist for this subject yet. Questions must be "
                "reviewed, licensed for delivery and mapped to a skill first."
            ),
        )

    weighted = any(row["share"] is not None for row in rows)
    if weighted:
        topics = [
            TopicWeight(
                topic_id=row["topic_id"],
                share=float(row["share"]) if row["share"] is not None else 1.0,
                name=row["name"],
            )
            for row in rows
        ]
        return topics, "exam_structure"
    # No printed structure: a topic weighs what its subtopics weigh, from the past papers when
    # there are enough of them (`_subtopics`), equally when not.
    units, source = await _subtopics(conn, subject_id)
    by_topic: dict[str, float] = {}
    for unit in units:
        by_topic[unit.topic_id] = by_topic.get(unit.topic_id, 0.0) + unit.share
    topics = [
        TopicWeight(
            topic_id=row["topic_id"],
            share=by_topic.get(row["topic_id"], 0.0) or 1e-6,
            name=row["name"],
        )
        for row in rows
    ]
    return topics, source


#: Below this many past-paper questions in a subject, frequencies say too little and the
#: subtopics are weighted equally instead.
MIN_PAST_QUESTIONS = 100


async def _subtopics(conn: AsyncConnection, subject_id: UUID) -> tuple[list[UnitWeight], str]:
    """`_read_subtopics`, from memory while fresh (subject_cache.py)."""
    from app import subject_cache

    units, source = await subject_cache.remembered(
        ("subtopics", str(subject_id)), lambda: _read_subtopics(conn, subject_id)
    )
    return list(units), source


async def _read_subtopics(
    conn: AsyncConnection, subject_id: UUID
) -> tuple[list[UnitWeight], str]:
    """Every examinable subtopic, with the share of the paper it carries.

    In order of what we trust most:

    1. The exam's printed section structure (`subtopic_exam_weight`), once approved.
    2. How often the subtopic came up in the real JAMB papers we hold
       (`subtopic_past_paper_frequency`, spec §9.2 `historical_share`), smoothed by one so a
       subtopic seen once in nine years is rare, not impossible. Only questions on dated past
       papers count, never a set of our own.
    3. Equal shares, when a subject has too few past-paper questions to say anything.

    The second string says which, so a caller can label the weights honestly.
    """
    version_id = await _current_syllabus(conn, subject_id)
    rows = await fetch_all(
        conn,
        """
        SELECT sub.id::text AS unit_id, sub.name, topic.id::text AS topic_id,
               topic.name AS topic_name, w.share,
               w.expected_questions,
               coalesce(f.past_questions, 0) AS past_questions,
               coalesce(f.years_seen, 0) AS years_seen,
               count(*) OVER (PARTITION BY topic.id) AS siblings
        FROM curriculum_items sub
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        LEFT JOIN subtopic_exam_weight w
          ON w.subtopic_id = sub.id AND w.syllabus_version_id = sub.syllabus_version_id
        LEFT JOIN subtopic_past_paper_frequency f ON f.subtopic_id = sub.id
        WHERE sub.syllabus_version_id = :version AND sub.item_type = 'subtopic'
          AND sub.review_status = 'approved' AND sub.pilot_support_status = 'supported'
        ORDER BY topic.display_order, sub.display_order, sub.code
        """,
        version=version_id,
    )
    if any(row["share"] is not None for row in rows):
        units = [
            UnitWeight(
                row["unit_id"],
                row["name"],
                row["topic_id"],
                row["topic_name"],
                float(row["share"]) if row["share"] is not None else 0.0,
            )
            for row in rows
        ]
        return units, "the exam's printed section structure"

    past = sum(int(row["past_questions"]) for row in rows)
    if rows and past >= MIN_PAST_QUESTIONS:
        years = await fetch_all(
            conn,
            """
            SELECT count(DISTINCT exam_year) AS n FROM exam_papers
            WHERE subject_id = :subject AND exam_year IS NOT NULL AND NOT own
            """,
            subject=subject_id,
        )
        spread = past + len(rows)
        units = [
            UnitWeight(
                row["unit_id"],
                row["name"],
                row["topic_id"],
                row["topic_name"],
                (int(row["past_questions"]) + 1) / spread,
            )
            for row in rows
        ]
        return units, f"estimated from {years[0]['n']} past papers ({past} questions)"

    # No evidence: every subtopic counts the same. An equal share of the SUBJECT, not of its
    # topic: dividing within the topic would make a subtopic of a five-part topic look four
    # times as heavy as one of a twenty-part topic, a weighting nobody chose.
    units = [
        UnitWeight(row["unit_id"], row["name"], row["topic_id"], row["topic_name"], 1.0 / len(rows))
        for row in rows
    ]
    return units, "equal (no exam structure or past papers yet)"


async def _answers_so_far(conn: AsyncConnection, session_id: UUID) -> list[dict[str, Any]]:
    return await fetch_all(
        conn,
        """
        SELECT a.id, a.question_version_id, a.is_correct, a.response_ms,
               v.mastery_level_number AS level, v.expected_seconds,
               topic.id::text AS topic_id, sub.id::text AS subtopic_id
        FROM attempts a
        JOIN question_versions v ON v.id = a.question_version_id
        JOIN question_classifications c
          ON c.question_id = v.question_id AND c.classification_role = 'primary'
         AND c.review_status = 'approved'
        JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        JOIN curriculum_items sub ON sub.id = skill.parent_id
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        WHERE a.session_id = :session
        ORDER BY a.answered_at_client
        """,
        session=session_id,
    )


async def _pick_question(
    conn: AsyncConnection,
    subject_id: UUID,
    slot: BlueprintSlot,
    target_level: int,
    session_id: UUID,
    seen: list[UUID],
    student_id: UUID,
) -> dict[str, Any] | None:
    """The nearest question to the level we want, in this topic, preferring one this student
    has never been asked.

    "Never been asked" spans every earlier sitting and every practice answer, not just this
    session: a question drilled last week would measure memory of it. Weekly check-ups use up
    a small topic's questions, though, and a check-up that stopped short would measure less.
    So once a topic has nothing fresh left, it reuses the questions the student saw longest
    ago (docs/student-scoring.md §3). Where a curated diagnostic pool exists its questions
    come first; a subject without one still works.
    """
    rows = await fetch_all(
        conn,
        """
        WITH deliverable AS MATERIALIZED (
          SELECT dq.question_id, dq.question_version_id, dq.mastery_level_number,
                 dq.primary_skill_id, q.usage_pool
          FROM deliverable_questions dq
          JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
          WHERE dq.subject_id = :subject
        )
        SELECT dq.question_version_id, dq.mastery_level_number, v.stem, v.instructions,
               pg.title AS passage_title, pg.body AS passage_body, topic.name AS topic_name,
               sub.name AS subtopic_name
        FROM deliverable dq
        -- The stem and its passage are read from the tables rather than through
        -- candidate_question_payload, which is itself built on deliverable_questions: joining
        -- it here made the planner evaluate that whole view twice, and the six gates behind it
        -- are not cheap. One evaluation took a seven-second question down to a tenth of that.
        JOIN question_versions v ON v.id = dq.question_version_id
        LEFT JOIN passages pg ON pg.id = v.passage_id
        JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
        JOIN curriculum_items sub ON sub.id = skill.parent_id
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        -- When this student last met it, in any sitting or in practice; null if never.
        LEFT JOIN LATERAL (
          SELECT max(h.last_answered_at) AS last_seen
          FROM student_question_history h
          WHERE h.student_id = :student AND h.question_id = dq.question_id
        ) before ON true
        WHERE topic.id = CAST(:topic AS uuid)
          AND (CARDINALITY(CAST(:seen AS uuid[])) = 0
               OR NOT (dq.question_version_id = ANY (CAST(:seen AS uuid[]))))
        ORDER BY before.last_seen IS NOT NULL,
                 before.last_seen,
                 (dq.usage_pool = 'diagnostic') DESC,
                 -- A subtopic this sitting has not asked about yet comes first. A topic gets
                 -- two or three questions, and three from one subtopic would leave the rest
                 -- of the topic unmeasured while looking as though it had been.
                 EXISTS (
                   SELECT 1 FROM question_versions asked
                   JOIN question_classifications ac
                     ON ac.question_id = asked.question_id
                    AND ac.classification_role = 'primary'
                   JOIN curriculum_items askill ON askill.id = ac.curriculum_item_id
                   WHERE asked.id = ANY (CAST(:seen AS uuid[]))
                     AND askill.parent_id = sub.id
                 ),
                 abs(coalesce(dq.mastery_level_number, 3) - :level),
                 md5(:session || dq.question_version_id::text)
        LIMIT 1
        """,
        pool=EXCLUDED_POOL,
        subject=subject_id,
        topic=slot.topic_id,
        level=target_level,
        seen=seen,
        session=str(session_id),
        student=student_id,
    )
    return rows[0] if rows else None


async def _options(conn: AsyncConnection, question_version_id: UUID) -> list[CheckupOption]:
    rows = await fetch_all(
        conn,
        """
        SELECT option_key, body FROM candidate_question_options
        WHERE question_version_id = :v ORDER BY display_order, option_key
        """,
        v=question_version_id,
    )
    pictures = await option_figures_for(conn, [question_version_id])
    return [
        CheckupOption(
            option_key=row["option_key"],
            body=row["body"],
            figure=pictures.get((str(question_version_id), str(row["option_key"]))),
        )
        for row in rows
    ]


async def _next_state(
    conn: AsyncConnection, session_id: UUID, subject_id: UUID, student_id: UUID
) -> CheckupState:
    topics, weights_source = await _topics(conn, subject_id)
    blueprint = build_blueprint(topics, length=min(DEFAULT_LENGTH, _capacity(topics)))
    answers = await _answers_so_far(conn, session_id)
    position = len(answers)

    if position >= len(blueprint):
        return CheckupState(
            session_id=session_id,
            answered=position,
            length=len(blueprint),
            finished=True,
            weights_source=weights_source,
        )

    slot = blueprint[position]
    outcomes = [bool(row["is_correct"]) for row in answers if row["topic_id"] == slot.topic_id]
    target = next_level(outcomes, slot.start_level)
    seen = [row["question_version_id"] for row in answers]

    question = await _pick_question(conn, subject_id, slot, target, session_id, seen, student_id)
    if question is None:
        # The topic ran out of questions. Rather than repeat one, the sitting ends and the
        # report says which topics went unassessed.
        return CheckupState(
            session_id=session_id,
            answered=position,
            length=position,
            finished=True,
            weights_source=weights_source,
        )

    upcoming = None
    if position + 1 < len(blueprint) and blueprint[position + 1].topic_id != slot.topic_id:
        # The next slot is another topic, so how this one is answered cannot change its level;
        # and with this question counted as seen, the pick is the same one the server makes
        # once the answer is in. Sent now, it can be shown without waiting.
        after = blueprint[position + 1]
        after_outcomes = [
            bool(row["is_correct"]) for row in answers if row["topic_id"] == after.topic_id
        ]
        following = await _pick_question(
            conn,
            subject_id,
            after,
            next_level(after_outcomes, after.start_level),
            session_id,
            [*seen, question["question_version_id"]],
            student_id,
        )
        if following is not None:
            upcoming = await _question_out(conn, following, position + 2, len(blueprint))

    return CheckupState(
        session_id=session_id,
        answered=position,
        length=len(blueprint),
        finished=False,
        weights_source=weights_source,
        question=await _question_out(conn, question, position + 1, len(blueprint)),
        upcoming=upcoming,
    )


async def _question_out(
    conn: AsyncConnection, question: Any, position: int, of: int
) -> QuestionOut:
    return QuestionOut(
        position=position,
        of=of,
        topic_name=str(question["topic_name"]),
        section_name=str(question["topic_name"]),
        subtopic_name=str(question["subtopic_name"]),
        question_version_id=question["question_version_id"],
        stem=str(question["stem"]),
        instructions=question["instructions"],
        passage_title=question["passage_title"],
        passage_body=question["passage_body"],
        options=await _options(conn, question["question_version_id"]),
        figures=await figures_for(conn, question["question_version_id"]),
    )


def _capacity(topics: list[TopicWeight]) -> int:
    """Never plan more questions than the shortest sensible sitting can hold."""
    return int(max(len(topics), DEFAULT_LENGTH))


@router.post("/start", response_model=CheckupState, summary="Begin a check-up")
async def start(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], body: StartCheckup
) -> CheckupState:
    await require_student(request, conn, body.student_id)
    student = (
        await conn.execute(
            text("SELECT status FROM students WHERE id = :id"), {"id": body.student_id}
        )
    ).first()
    if student is None:
        raise HTTPException(status_code=404, detail="unknown student")

    session_id = (
        await conn.execute(
            text(
                """
                INSERT INTO study_sessions (student_id, subject_id, session_type, engine_version)
                VALUES (:student, :subject, 'checkup', :engine)
                RETURNING id
                """
            ),
            {
                "student": body.student_id,
                "subject": body.subject_id,
                "engine": ENGINE_VERSION,
            },
        )
    ).scalar_one()
    await conn.commit()
    return await _next_state(conn, session_id, body.subject_id, body.student_id)


@router.get("/{session_id}", response_model=CheckupState, summary="Where this sitting is")
async def current(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> CheckupState:
    """The next question of a sitting already in progress.

    Answers hand back the following question, which is all a client needs while it stays open
    — and nothing at all after a reload. Without this, resuming meant either starting a second
    sitting or sending an answer the student never gave to get a question back. Both were
    worse than an endpoint.
    """
    await require_session_owner(request, conn, session_id)
    session = (
        (
            await conn.execute(
                text(
                    """
                    SELECT student_id, subject_id FROM study_sessions
                    WHERE id = :id AND session_type = 'checkup'
                    """
                ),
                {"id": session_id},
            )
        )
        .mappings()
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="unknown check-up")
    return await _next_state(conn, session_id, session["subject_id"], session["student_id"])


@router.post(
    "/{session_id}/answer",
    response_model=CheckupState,
    summary="Answer and get the next question",
)
async def answer(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    session_id: UUID,
    submission: AnswerIn,
) -> CheckupState:
    await require_session_owner(request, conn, session_id)
    session = (
        (
            await conn.execute(
                text(
                    """
                SELECT student_id, subject_id, ended_at FROM study_sessions
                WHERE id = :id AND session_type = 'checkup'
                """
                ),
                {"id": session_id},
            )
        )
        .mappings()
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="unknown check-up")
    if session["ended_at"] is not None:
        raise HTTPException(status_code=409, detail="this check-up is already finished")

    # Marking happens here, never on the device: the key never leaves the server.
    key = (
        await conn.execute(
            text(
                """
                SELECT option_key FROM question_options
                WHERE question_version_id = :v AND is_correct
                """
            ),
            {"v": submission.question_version_id},
        )
    ).first()
    if key is None:
        raise HTTPException(status_code=409, detail="this question has no verified answer")

    try:
        await conn.execute(
            text(
                """
                INSERT INTO attempts (id, student_id, question_version_id, session_id, context,
                  selected_option_key, is_correct, response_ms, answered_at_client, engine_version)
                VALUES (:id, :student, :version, :session, 'checkup', :choice, :correct,
                  :ms, now(), :engine)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": submission.attempt_id,
                "student": session["student_id"],
                "version": submission.question_version_id,
                "session": session_id,
                "choice": submission.selected_option_key,
                "correct": submission.selected_option_key == key[0],
                "ms": submission.response_ms,
                "engine": ENGINE_VERSION,
            },
        )
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        original = getattr(error, "orig", None)
        message = str(original.args[0]) if original and original.args else str(error)
        # The driver prefixes the database's sentence with its class ("<class '...'>: "), and
        # the app hides anything naming the driver: without this the student saw only "not
        # quite right" and nobody could tell why.
        message = re.sub(r"^<class '[^']*'>:\s*", "", message.split("\n")[0]).strip()
        raise HTTPException(status_code=409, detail=message) from error

    state = await _next_state(conn, session_id, session["subject_id"], session["student_id"])
    if state.finished:
        await conn.execute(
            text("UPDATE study_sessions SET ended_at = now() WHERE id = :id AND ended_at IS NULL"),
            {"id": session_id},
        )
        subject = await conn.scalar(
            text("SELECT name FROM subjects WHERE id = :id"), {"id": session["subject_id"]}
        )
        await notifications.notify(
            conn,
            session["student_id"],
            kind="checkup_marked",
            category="reward",
            title=f"Your {subject or 'check-up'} report is ready",
            body="Your score, the topics to work on next, and every answer with its working.",
            link_url=f"/checkup/{session_id}/report",
            key=f"checkup-{session_id}",
        )
        await xp.award(
            conn,
            session["student_id"],
            reason="checkup",
            amount=xp.CHECKUP,
            key=f"checkup-{session_id}",
            session_id=session_id,
        )
        await xp.check_daily_goal(conn, session["student_id"])
        await conn.commit()
    return state


def _standings(
    units: Sequence[UnitWeight], answers: Sequence[dict[str, Any]]
) -> list[UnitStanding]:
    """Turn the sitting into one reading per subtopic.

    The same ``summarise`` the topic report uses, run at a finer grain — it has never been
    topic-specific, it just groups attempts by whatever unit it is given. One rule for both
    readings means a topic's number and its subtopics' numbers cannot disagree.
    """
    grouped: dict[str, list[Attempt]] = {}
    for row in answers:
        grouped.setdefault(str(row["subtopic_id"]), []).append(
            Attempt(
                is_correct=bool(row["is_correct"]),
                level=int(row["level"] or 3),
                response_ms=int(row["response_ms"] or 0),
                expected_seconds=float(row["expected_seconds"] or 45),
            )
        )
    summary = summarise(
        subject_id="subtopics",
        topics=[
            TopicWeight(topic_id=unit.unit_id, share=unit.share, name=unit.name) for unit in units
        ],
        answers=[
            TopicAnswers(topic_id=key, attempts=tuple(value)) for key, value in grouped.items()
        ],
    )
    by_id = {estimate.topic_id: estimate for estimate in summary.topics}
    return [
        UnitStanding(
            unit_id=unit.unit_id,
            name=unit.name,
            topic_id=unit.topic_id,
            topic_name=unit.topic_name,
            share=unit.share,
            mastery=by_id[unit.unit_id].mastery if unit.unit_id in by_id else None,
            answered=by_id[unit.unit_id].answered if unit.unit_id in by_id else 0,
        )
        for unit in units
    ]


@router.get("/{session_id}/report", response_model=CheckupReport, summary="What the check-up found")
async def report(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> CheckupReport:
    await require_session_owner(request, conn, session_id)
    return await build_report(conn, session_id)


async def build_report(conn: AsyncConnection, session_id: UUID) -> CheckupReport:
    """The report itself, for the route above and for the home page's latest check-up."""
    session = (
        (
            await conn.execute(
                text(
                    """
                SELECT student_id, subject_id, ended_at FROM study_sessions
                WHERE id = :id AND session_type = 'checkup'
                """
                ),
                {"id": session_id},
            )
        )
        .mappings()
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="unknown check-up")

    topics, _ = await _topics(conn, session["subject_id"])
    answers = await _answers_so_far(conn, session_id)

    grouped: dict[str, list[Attempt]] = {}
    for row in answers:
        grouped.setdefault(str(row["topic_id"]), []).append(
            Attempt(
                is_correct=bool(row["is_correct"]),
                level=int(row["level"] or 3),
                response_ms=int(row["response_ms"] or 0),
                expected_seconds=float(row["expected_seconds"] or 45),
            )
        )

    summary = summarise(
        subject_id=str(session["subject_id"]),
        topics=topics,
        answers=[
            TopicAnswers(topic_id=key, attempts=tuple(value)) for key, value in grouped.items()
        ],
    )
    names = {topic.topic_id: topic.name for topic in topics}

    units, weights_source = await _subtopics(conn, session["subject_id"])
    standings = _standings(units, answers)
    correct_by_unit: dict[str, int] = {}
    for row in answers:
        if row["is_correct"]:
            key = str(row["subtopic_id"])
            correct_by_unit[key] = correct_by_unit.get(key, 0) + 1
    right = sum(1 for row in answers if row["is_correct"])
    every = await scoring.answers_for(conn, session["student_id"], session["subject_id"])
    checkups = await scoring.checkups_for(conn, session["student_id"], session["subject_id"], every)
    sitting = [answer for answer in every if answer.session_id == str(session_id)]
    earlier = [line for line in checkups if line.session_id != session_id]
    if session["ended_at"] is not None:
        earlier = [line for line in earlier if line.finished_at < session["ended_at"]]
    today: date = (
        await conn.execute(
            text(
                """
                SELECT (now() AT TIME ZONE coalesce(timezone, 'UTC'))::date
                FROM students WHERE id = :id
                """
            ),
            {"id": session["student_id"]},
        )
    ).scalar() or date.today()
    standing = scoring.subject_score(
        session["subject_id"],
        units,
        every,
        checkups,
        today,
    )

    return CheckupReport(
        session_id=session_id,
        subject_id=session["subject_id"],
        answered=summary.answered,
        finished=session["ended_at"] is not None,
        topics=[
            TopicReport(
                topic_id=UUID(estimate.topic_id),
                name=estimate.name,
                answered=estimate.answered,
                correct=estimate.correct,
                mastery=(estimate.correct / estimate.answered) if estimate.answered else None,
                confidence=estimate.confidence,
                highest_level_correct=estimate.highest_level_correct,
                lowest_level_wrong=estimate.lowest_level_wrong,
                slow=estimate.slow,
            )
            for estimate in summary.topics
        ],
        subtopics=[
            SubtopicReport(
                subtopic_id=UUID(standing.unit_id),
                name=standing.name,
                topic_name=standing.topic_name,
                share=round(standing.share, 4),
                answered=standing.answered,
                correct=correct_by_unit.get(standing.unit_id, 0),
                mastery=(
                    correct_by_unit.get(standing.unit_id, 0) / standing.answered
                    if standing.answered
                    else None
                ),
                confidence=confidence_for(standing.answered),
                section_id=UUID(standing.topic_id),
                section_name=standing.topic_name,
            )
            for standing in standings
        ],
        weights_source=weights_source,
        right=right,
        score=scoring.overall(sitting),
        previous_score=earlier[-1].score if earlier else None,
        standing=standing,
        unassessed_topics=[names.get(topic_id, topic_id) for topic_id in summary.unassessed_topics],
        priority_topics=[names.get(topic_id, topic_id) for topic_id in summary.priority_topics],
        caveat=(
            # A student reads this sentence, so it is written as a sentence: no "(s)".
            f"{right} of {summary.answered} question{'' if summary.answered == 1 else 's'} right. "
            "The result is the average of your topic scores from this check-up. Every answer "
            "also counts in its topic score, and the next check-up is due in "
            f"{scoring.CHECKUP_EVERY_DAYS} days."
        ),
    )
