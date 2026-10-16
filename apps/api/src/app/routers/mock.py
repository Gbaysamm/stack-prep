"""The mock exam: a JAMB-style computer-based test, separate from practice.

The student sets it up — up to four subjects sat together, how many questions in each, and how
long — or takes the Real UTME preset. The whole paper is fixed and sent at the start, so the
test runs with almost no traffic: answers are saved as they are chosen (a reload resumes), and
the browser reports what it saw (full screen left, tab switched) as integrity events.

THE SERVER OWNS THE CLOCK. `deadline_at` is set from the database's own `now()` when the paper
is made, the time left is always computed from it, and an answer that arrives after it is
refused. A mock left open past its deadline is submitted by the server the next time anyone
looks at it, so closing the tab does not stop the clock.

NOTHING IS GIVEN AWAY BEFORE THE END. The paper carries no answer key, no hint, no working and
no topic names. The key appears only in the report, after submission. Question order is
shuffled per sitting (keeping a passage's questions together); option order stays as printed,
because a JAMB key is a letter.

WHAT COUNTS. On submission each answered question becomes exactly one attempt with
`context = 'full_mock'`, its final answer, unaided. An unanswered question gets no attempt: it
is reported as unanswered, never as wrong. The result per subject and overall is plain right
divided by answered, as a whole percentage.
"""

from __future__ import annotations

import math
import secrets
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import require_student
from app.db import connection, fetch_all
from app.figures import DISPLAYABLE, OptionFigure, QuestionFigure, option_figure
from app.routers.practice import EXCLUDED_POOL
from engine.version import ENGINE_VERSION

router = APIRouter(prefix="/v1/mock", tags=["mock"])

#: The UTME way: four subjects in one sitting.
MAX_SUBJECTS = 4
MAX_QUESTIONS_PER_SUBJECT = 100
#: `study_sessions.planned_minutes` allows up to 300.
MAX_MINUTES = 300
#: An answer chosen just before 0:00 may still be on the wire when the clock runs out. This
#: much lateness is accepted for answers; nothing later is.
ANSWER_GRACE_SECONDS = 5
#: Integrity events kept per mock, so a misbehaving page cannot fill the table.
MAX_EVENTS_PER_MOCK = 2000

#: The Real UTME preset: English 60 questions, every other subject 40, two hours for all four.
UTME_ENGLISH_QUESTIONS = 60
UTME_OTHER_QUESTIONS = 40
UTME_MINUTES = 120
#: JAMB's pace: 180 questions in 120 minutes. A Real UTME mock with fewer subjects gets the time
#: its questions would get in the real exam, never the whole two hours.
UTME_SECONDS_PER_QUESTION = 40

#: JAMB's Use of English paper in the order it is set, with how many questions each part has:
#: (part, the JAMB topics it draws on, questions, whether it is read as passages). Third-party
#: guides differ by a question or two per part; this is the most commonly published layout.
#: The approved reading text's 5 questions are stood in for by comprehension until the bank
#: holds questions on the current text. Passages are never cut: see `utme_english_paper`.
UTME_ENGLISH_BLUEPRINT: tuple[tuple[str, tuple[str, ...], int, bool], ...] = (
    (
        "Comprehension",
        (
            "Comprehension of a passage as a whole or in part",
            "Comprehension of words, phrases, clauses, sentences, figures of speech and idioms "
            "in context",
            "Coherence and logical reasoning",
            "Synthesis of ideas",
            "Approved Reading Text",
        ),
        15,
        True,
    ),
    ("Cloze", ("Cloze passage",), 10, True),
    ("Sentence interpretation", ("Ordinary, figurative and idiomatic usage",), 5, False),
    ("Antonyms", ("Antonyms",), 5, False),
    ("Synonyms", ("Synonyms",), 5, False),
    (
        "Grammar",
        (
            "Clause and sentence patterns",
            "Word classes and their functions",
            "Mood, tense, aspect, number, concord, degree and question tags",
            "Mechanics",
        ),
        10,
        False,
    ),
    ("Vowels", ("Vowels (monophthongs, diphthongs and triphthongs)",), 2, False),
    ("Consonants", ("Consonants (including clusters)",), 2, False),
    ("Rhymes", ("Rhymes (including homophones)",), 2, False),
    ("Word stress", ("Word stress (monosyllabic and polysyllabic)",), 2, False),
    ("Emphatic stress", ("Emphatic stress (in connected speech)",), 2, False),
)


def utme_minutes(questions: int) -> int:
    """The time a Real UTME sitting of this many questions gets, at JAMB's pace, rounded up."""
    return max(1, math.ceil(questions * UTME_SECONDS_PER_QUESTION / 60))


def _print_order(row: dict[str, Any]) -> tuple[int, str]:
    number = str(row.get("question_number") or "")
    digits = "".join(ch for ch in number if ch.isdigit())
    return (int(digits) if digits else 10_000, number)


def whole_passages(
    blocks: list[list[dict[str, Any]]], target: int
) -> list[list[dict[str, Any]]] | None:
    """Whole passages adding up to exactly `target`, preferring those earlier in `blocks`.

    A small depth-first search: the bank holds a few dozen passages per part, and the first
    exact mix found, in preference order, is the one used. None when no mix adds up.
    """
    best: list[int] | None = None
    sizes = [len(block) for block in blocks]
    limit = [0]

    def walk(start: int, left: int, picked: list[int]) -> bool:
        limit[0] += 1
        if left == 0:
            nonlocal best
            best = list(picked)
            return True
        if limit[0] > 20_000:
            return False
        for index in range(start, len(blocks)):
            if sizes[index] <= left:
                picked.append(index)
                if walk(index + 1, left - sizes[index], picked):
                    return True
                picked.pop()
        return False

    walk(0, target, [])
    return None if best is None else [blocks[index] for index in best]


def nearest_whole_passages(
    blocks: list[list[dict[str, Any]]], target: int
) -> list[list[dict[str, Any]]]:
    """Whole passages whose questions add up as near to `target` as the bank allows.

    A passage is never cut. Exactly `target` is best; otherwise the nearest total, a shortfall
    before an excess when they are equally near. Among mixes with the same total, passages
    earlier in `blocks` (unseen ones, in this sitting's random order) are preferred.
    """
    ceiling = target + max(len(block) for block in blocks) if blocks else 0
    # reach[t] = the first-found list of block indices adding up to t.
    reach: dict[int, list[int]] = {0: []}
    for index, block in enumerate(blocks):
        size = len(block)
        for total, picked in sorted(reach.items(), reverse=True):
            new = total + size
            if new <= ceiling and new not in reach:
                reach[new] = [*picked, index]
    best = min(reach, key=lambda total: (abs(total - target), total > target))
    return [blocks[index] for index in reach[best]]


def share_out(total: int, weights: list[int]) -> list[int]:
    """`total` split across parts in proportion to `weights`, largest remainders first."""
    whole = sum(weights)
    if total <= 0 or whole <= 0:
        return [0] * len(weights)
    exact = [total * weight / whole for weight in weights]
    counts = [math.floor(value) for value in exact]
    for index in sorted(range(len(weights)), key=lambda i: exact[i] - counts[i], reverse=True)[
        : total - sum(counts)
    ]:
        counts[index] += 1
    return counts


def utme_english_paper(
    pool: list[dict[str, Any]], rng: secrets.SystemRandom, size: int = UTME_ENGLISH_QUESTIONS
) -> list[UUID]:
    """A Use of English paper laid out the way JAMB sets it.

    The passage parts come first and always whole: each takes the mix of whole passages
    nearest its usual count, so it may land a question or two over or under. Whatever that
    leaves of `size` is shared across the other parts in proportion to their usual counts,
    so the paper always has `size` questions. Within a part, questions the student has not
    met come first, and a passage keeps its questions in their printed order. A part the
    bank cannot fill is made up at the end from the rest of the subject.
    """
    used: set[Any] = set()

    def fresh_first(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = list(rows)
        rng.shuffle(rows)
        return sorted(rows, key=lambda row: bool(row["seen"]))

    def candidates(subtopics: tuple[str, ...]) -> list[dict[str, Any]]:
        names = set(subtopics)
        return [
            row
            for row in pool
            if row["subtopic_name"] in names and row["question_version_id"] not in used
        ]

    scale = size / UTME_ENGLISH_QUESTIONS
    parts: list[list[UUID]] = [[] for _ in UTME_ENGLISH_BLUEPRINT]

    # 1. The passage parts, in whole passages.
    for index, (_, subtopics, count, passages) in enumerate(UTME_ENGLISH_BLUEPRINT):
        if not passages:
            continue
        groups: dict[Any, list[dict[str, Any]]] = {}
        for row in candidates(subtopics):
            groups.setdefault(row["passage_id"] or row["question_version_id"], []).append(row)
        blocks = list(groups.values())
        rng.shuffle(blocks)
        blocks.sort(key=lambda block: any(row["seen"] for row in block))
        blocks = [sorted(block, key=_print_order) for block in blocks]
        for block in nearest_whole_passages(blocks, round(count * scale)):
            parts[index].extend(row["question_version_id"] for row in block)
            used.update(row["question_version_id"] for row in block)

    # 2. The rest of the paper, shared across the other parts by their usual sizes.
    others = [i for i, part in enumerate(UTME_ENGLISH_BLUEPRINT) if not part[3]]
    room = size - sum(len(part) for part in parts)
    for index, share in zip(
        others, share_out(room, [UTME_ENGLISH_BLUEPRINT[i][2] for i in others]), strict=True
    ):
        for row in fresh_first(candidates(UTME_ENGLISH_BLUEPRINT[index][1]))[:share]:
            parts[index].append(row["question_version_id"])
            used.add(row["question_version_id"])

    order = [version for part in parts for version in part]
    if len(order) < size:
        rest = [row for row in pool if row["question_version_id"] not in used]
        order.extend(row["question_version_id"] for row in fresh_first(rest)[: size - len(order)])
    return order[:size]


EventKind = Literal[
    "fullscreen_enter",
    "fullscreen_exit",
    "tab_hidden",
    "tab_visible",
    "window_blur",
    "window_focus",
    "copy_blocked",
    "paste_blocked",
    "menu_blocked",
]
Status = Literal["in_progress", "submitted"]
Outcome = Literal["right", "wrong", "unanswered"]

# --------------------------------------------------------------------------- models


class SubjectOption(BaseModel):
    subject_id: UUID
    code: str
    name: str
    #: Questions a mock can be built from (deliverable, not held out).
    available: int
    #: Of those, how many this student has never met.
    unseen: int
    #: The student has an active goal in this subject.
    mine: bool
    compulsory: bool


class ExamOption(BaseModel):
    examination_id: UUID
    short_name: str
    name: str
    max_subjects: int
    subjects: list[SubjectOption]


class Preset(BaseModel):
    english_questions: int = UTME_ENGLISH_QUESTIONS
    other_questions: int = UTME_OTHER_QUESTIONS
    minutes: int = UTME_MINUTES
    subjects: int = MAX_SUBJECTS


class MockOptions(BaseModel):
    examinations: list[ExamOption]
    #: A mock still running, to resume rather than start another.
    open_mock_id: UUID | None
    utme: Preset = Field(default_factory=Preset)
    max_questions_per_subject: int = MAX_QUESTIONS_PER_SUBJECT
    max_minutes: int = MAX_MINUTES


class SubjectChoice(BaseModel):
    subject_id: UUID
    questions: int = Field(ge=1, le=MAX_QUESTIONS_PER_SUBJECT)


class StartMock(BaseModel):
    student_id: UUID
    subjects: list[SubjectChoice] = Field(min_length=1, max_length=MAX_SUBJECTS)
    minutes: int = Field(ge=1, le=MAX_MINUTES)
    preset: Literal["utme", "custom"] = "custom"


class PaperOption(BaseModel):
    option_key: str
    body: str
    #: The option's drawing, when the option is a picture; its `body` is then only a label.
    figure: OptionFigure | None = None
    #: Why this wrong option tempts. Only in a submitted mock's report.
    why: str | None = None


class PaperQuestion(BaseModel):
    question_version_id: UUID
    #: 1-based within its subject, in this sitting's order.
    position: int
    stem: str
    instructions: str | None
    passage_id: UUID | None
    passage_title: str | None
    passage_body: str | None
    options: list[PaperOption]
    figures: list[QuestionFigure] = Field(default_factory=list)
    selected_option_key: str | None
    flagged: bool
    response_ms: int


class PaperSubject(BaseModel):
    subject_id: UUID
    session_id: UUID
    code: str
    name: str
    questions: list[PaperQuestion]


class MockPaper(BaseModel):
    mock_id: UUID
    status: Status
    preset: str
    duration_minutes: int
    started_at: datetime
    deadline_at: datetime
    #: The server's clock when this was sent, so the browser can correct its own.
    server_now: datetime
    seconds_left: int
    subjects: list[PaperSubject]


class AnswerSave(BaseModel):
    """One question's whole state on the sheet. A null choice is unanswered."""

    question_version_id: UUID
    selected_option_key: str | None = Field(default=None, pattern="^[A-F]$")
    flagged: bool = False
    response_ms: int = Field(default=0, ge=0, le=36_000_000)


class SaveAnswers(BaseModel):
    answers: list[AnswerSave] = Field(max_length=500)


class Saved(BaseModel):
    saved: int
    server_now: datetime
    seconds_left: int


class EventIn(BaseModel):
    kind: EventKind
    at_client: datetime | None = None


class EventsIn(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=200)


class SubmitIn(BaseModel):
    #: The last unsaved changes, sent with the submission so nothing is lost.
    answers: list[AnswerSave] = Field(default_factory=list, max_length=500)


class Tally(BaseModel):
    questions: int
    answered: int
    correct: int
    wrong: int
    unanswered: int
    #: Right divided by answered, as a whole percentage; null when nothing was answered.
    percent: int | None


class ReportItem(BaseModel):
    position: int
    question_version_id: UUID
    stem: str
    instructions: str | None
    passage_title: str | None
    passage_body: str | None
    options: list[PaperOption]
    figures: list[QuestionFigure] = Field(default_factory=list)
    selected_option_key: str | None
    correct_option_key: str | None
    flagged: bool
    outcome: Outcome
    #: The reviewed working, step by step. Only in a submitted mock's report.
    solution_steps: list[str] = Field(default_factory=list)
    #: Time the question was visibly open in the room, summed across visits.
    response_ms: int = 0
    #: The JAMB topic (the curriculum's subtopic) the question tests, and the section above it.
    #: Only in a report: the paper never names topics. Null when it is not classified.
    subtopic_id: UUID | None = None
    subtopic_name: str | None = None
    topic_name: str | None = None


class TopicResult(BaseModel):
    """One JAMB topic within a subject of this mock: how its questions went."""

    subtopic_id: UUID
    name: str
    #: The section of the syllabus it sits in.
    topic_name: str | None
    questions: int
    correct: int
    wrong: int
    unanswered: int


class SubjectResult(BaseModel):
    subject_id: UUID
    session_id: UUID
    code: str
    name: str
    tally: Tally
    items: list[ReportItem] = Field(default_factory=list)
    #: Time the subject's questions were open, summed. Only in a report.
    time_ms: int = 0
    #: The subject's topics, most wrong first. Only in a report.
    topics: list[TopicResult] = Field(default_factory=list)


class IntegrityEvent(BaseModel):
    kind: EventKind
    at: datetime


class Integrity(BaseModel):
    fullscreen_exits: int = 0
    tab_switches: int = 0
    window_blurs: int = 0
    copy_blocked: int = 0
    paste_blocked: int = 0
    menu_blocked: int = 0
    events: list[IntegrityEvent] = Field(default_factory=list)


class MockReport(BaseModel):
    mock_id: UUID
    preset: str
    duration_minutes: int
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime
    auto_submitted: bool
    time_used_seconds: int
    overall: Tally
    subjects: list[SubjectResult]
    integrity: Integrity


class MockSummary(BaseModel):
    mock_id: UUID
    status: Status
    preset: str
    duration_minutes: int
    started_at: datetime
    submitted_at: datetime | None
    auto_submitted: bool
    #: Null while the mock is still running: its marks wait for the end.
    overall: Tally | None
    subjects: list[SubjectResult]
    #: Times the student left full screen or switched away, for the history list.
    integrity_flags: int


# --------------------------------------------------------------------------- helpers


def tally(questions: int, answered: int, correct: int) -> Tally:
    """Right over answered, rounded half up to a whole percentage."""
    percent = None if answered == 0 else math.floor(100 * correct / answered + 0.5)
    return Tally(
        questions=questions,
        answered=answered,
        correct=correct,
        wrong=answered - correct,
        unanswered=questions - answered,
        percent=percent,
    )


def shuffled_paper(picked: list[dict[str, Any]], rng: secrets.SystemRandom) -> list[UUID]:
    """This sitting's order: questions shuffled, a passage's questions kept together.

    A comprehension passage is read once and its questions answered together, as they are
    printed, so the passage is the unit that moves; its questions keep their own order.
    """
    groups: dict[Any, list[UUID]] = {}
    for row in picked:
        key = row["passage_id"] or row["question_version_id"]
        groups.setdefault(key, []).append(row["question_version_id"])
    blocks = list(groups.values())
    rng.shuffle(blocks)
    return [version for block in blocks for version in block]


async def _mock(conn: AsyncConnection, request: Request, mock_id: UUID) -> dict[str, Any]:
    """The mock, if the caller may see it; 404 for a missing or deleted one."""
    rows = await fetch_all(
        conn,
        """
        SELECT m.*, now() AS server_now
        FROM mock_exams m
        WHERE m.id = :id AND m.hidden_at IS NULL
        """,
        id=mock_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="unknown mock exam")
    await require_student(request, conn, rows[0]["student_id"])
    return rows[0]


def _seconds_left(mock: dict[str, Any]) -> int:
    if mock["submitted_at"] is not None:
        return 0
    left: float = (mock["deadline_at"] - mock["server_now"]).total_seconds()
    return max(0, math.ceil(left))


async def _finalize(conn: AsyncConnection, mock_id: UUID, *, auto: bool) -> None:
    """Submit the mock: its answer sheet becomes attempts, once. Safe to call twice.

    Commits. When the deadline has passed the mock is marked as submitted by the clock, at the
    deadline, whoever asked.
    """
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT id, submitted_at, deadline_at, now() > deadline_at AS expired
                    FROM mock_exams WHERE id = :id FOR UPDATE
                    """
                ),
                {"id": mock_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["submitted_at"] is not None:
        await conn.commit()
        return
    by_clock = auto or bool(row["expired"])
    await conn.execute(
        text(
            """
            UPDATE mock_exams
               SET submitted_at = CASE WHEN :by_clock THEN least(now(), deadline_at)
                                       ELSE now() END,
                   auto_submitted = :by_clock
             WHERE id = :id
            """
        ),
        {"id": mock_id, "by_clock": by_clock},
    )
    await conn.execute(
        text(
            """
            INSERT INTO attempts (id, student_id, question_version_id, session_id, context,
              selected_option_key, is_correct, response_ms, answered_at_client, engine_version)
            SELECT gen_random_uuid(), m.student_id, i.question_version_id, i.session_id,
                   'full_mock', i.selected_option_key,
                   CASE WHEN EXISTS (SELECT 1 FROM question_options k
                                      WHERE k.question_version_id = i.question_version_id
                                        AND k.is_correct)
                        THEN EXISTS (SELECT 1 FROM question_options k
                                      WHERE k.question_version_id = i.question_version_id
                                        AND k.is_correct
                                        AND k.option_key = i.selected_option_key)
                   END,
                   i.response_ms, i.answered_at, :engine
            FROM mock_exam_items i
            JOIN mock_exams m ON m.id = i.mock_exam_id
            WHERE i.mock_exam_id = :id AND i.selected_option_key IS NOT NULL
            ORDER BY i.session_id, i.position
            """
        ),
        {"id": mock_id, "engine": ENGINE_VERSION},
    )
    await conn.execute(
        text(
            """
            UPDATE study_sessions s
               SET ended_at = greatest(m.submitted_at, s.started_at)
              FROM mock_exams m
             WHERE m.id = :id AND s.mock_exam_id = m.id AND s.ended_at IS NULL
            """
        ),
        {"id": mock_id},
    )
    await conn.commit()


async def _settle_expired(conn: AsyncConnection, student_id: UUID) -> None:
    """Submit, by the clock, every mock of this student whose time has run out."""
    expired = await fetch_all(
        conn,
        """
        SELECT id FROM mock_exams
        WHERE student_id = :student AND submitted_at IS NULL AND deadline_at < now()
        """,
        student=student_id,
    )
    for row in expired:
        await _finalize(conn, row["id"], auto=True)


async def _save(conn: AsyncConnection, mock_id: UUID, answers: list[AnswerSave]) -> int:
    """Write each question's state to the sheet. Returns how many rows matched."""
    saved = 0
    for answer in answers:
        result = await conn.execute(
            text(
                """
                UPDATE mock_exam_items i
                   SET answered_at = CASE
                         WHEN CAST(:choice AS text) IS NULL THEN NULL
                         WHEN i.selected_option_key IS DISTINCT FROM CAST(:choice AS text)
                           THEN now()
                         ELSE i.answered_at END,
                       selected_option_key = CAST(:choice AS text),
                       flagged = :flagged,
                       response_ms = greatest(i.response_ms, :ms)
                 WHERE i.mock_exam_id = :mock AND i.question_version_id = :version
                   AND (CAST(:choice AS text) IS NULL OR EXISTS (
                         SELECT 1 FROM question_options o
                          WHERE o.question_version_id = i.question_version_id
                            AND o.option_key = CAST(:choice AS text)))
                """
            ),
            {
                "mock": mock_id,
                "version": answer.question_version_id,
                "choice": answer.selected_option_key,
                "flagged": answer.flagged,
                "ms": answer.response_ms,
            },
        )
        saved += int(result.rowcount or 0)
    return saved


async def _sheet(
    conn: AsyncConnection, mock_ids: list[UUID], *, with_items: bool, with_keys: bool
) -> dict[UUID, list[dict[str, Any]]]:
    """Each mock's subjects, in paper order, with their questions when asked for.

    Keys are read only when `with_keys` is set, which only a submitted mock's report does.
    """
    subjects = await fetch_all(
        conn,
        """
        SELECT s.mock_exam_id, s.id AS session_id, sub.id AS subject_id, sub.code,
               sub.name,
               count(i.question_version_id) AS questions,
               count(i.selected_option_key) AS answered,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM question_options k
                  WHERE k.question_version_id = i.question_version_id AND k.is_correct
                    AND k.option_key = i.selected_option_key)) AS correct
        FROM study_sessions s
        JOIN subjects sub ON sub.id = s.subject_id
        JOIN examinations e ON e.id = sub.examination_id
        LEFT JOIN mock_exam_items i ON i.session_id = s.id
        WHERE s.mock_exam_id = ANY(CAST(:ids AS uuid[]))
        GROUP BY s.mock_exam_id, s.id, sub.id, sub.code, sub.name, e.compulsory_subject_codes
        ORDER BY s.mock_exam_id, sub.code = ANY(e.compulsory_subject_codes) DESC, sub.name
        """,
        ids=[str(mock_id) for mock_id in mock_ids],
    )
    by_mock: dict[UUID, list[dict[str, Any]]] = {mock_id: [] for mock_id in mock_ids}
    for row in subjects:
        row["items"] = []
        by_mock[row["mock_exam_id"]].append(row)
    if not with_items or not subjects:
        return by_mock

    why_column = (
        "CASE WHEN o.is_correct THEN NULL ELSE coalesce(o.distractor_note, m.description) END"
        if with_keys
        else "NULL"
    )
    steps_column = "v.solution_steps" if with_keys else "'[]'::jsonb"
    key_column = (
        """(SELECT min(k.option_key) FROM question_options k
             WHERE k.question_version_id = i.question_version_id AND k.is_correct)"""
        if with_keys
        else "NULL"
    )
    # Topic names would hint at what a question is about, so the paper never carries them.
    topic_columns = (
        "t.subtopic_id, t.subtopic_name, t.topic_name"
        if with_keys
        else "NULL::uuid AS subtopic_id, NULL::text AS subtopic_name, NULL::text AS topic_name"
    )
    topic_join = (
        """
        LEFT JOIN LATERAL (
          SELECT sub.id AS subtopic_id, sub.name AS subtopic_name, topic.name AS topic_name
          FROM question_classifications c
          JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
          JOIN curriculum_items sub ON sub.id = skill.parent_id
          LEFT JOIN curriculum_items topic ON topic.id = sub.parent_id
          WHERE c.question_id = v.question_id AND c.classification_role = 'primary'
            AND c.review_status <> 'rejected' AND c.review_status <> 'withdrawn'
          ORDER BY c.review_status = 'approved' DESC, c.created_at DESC
          LIMIT 1
        ) t ON true
        """
        if with_keys
        else ""
    )
    items = await fetch_all(
        conn,
        f"""
        SELECT i.session_id, i.position, i.question_version_id, i.selected_option_key,
               i.flagged, i.response_ms, v.stem, v.instructions, v.passage_id,
               pg.title AS passage_title, pg.body AS passage_body,
               {topic_columns},
               {key_column} AS correct_option_key,
               {steps_column} AS solution_steps,
               coalesce((
                 SELECT jsonb_agg(jsonb_build_object('option_key', o.option_key,
                                                     'body', o.body, 'why', {why_column})
                                  ORDER BY o.display_order, o.option_key)
                 FROM question_options o
                 LEFT JOIN misconceptions m ON m.id = o.misconception_id
                 WHERE o.question_version_id = i.question_version_id
               ), '[]'::jsonb) AS options
        FROM mock_exam_items i
        JOIN question_versions v ON v.id = i.question_version_id
        LEFT JOIN passages pg ON pg.id = v.passage_id
        {topic_join}
        WHERE i.mock_exam_id = ANY(CAST(:ids AS uuid[]))
        ORDER BY i.session_id, i.position
        """,
        ids=[str(mock_id) for mock_id in mock_ids],
    )
    figures = await fetch_all(
        conn,
        """
        SELECT DISTINCT a.question_version_id, a.id, a.option_key, a.mime_type, a.alt_text,
               a.width, a.height, a.display_order
        FROM question_assets a
        JOIN mock_exam_items i ON i.question_version_id = a.question_version_id
        WHERE i.mock_exam_id = ANY(CAST(:ids AS uuid[])) AND a.licence_status = 'verified'
        ORDER BY a.display_order, a.id
        """,
        ids=[str(mock_id) for mock_id in mock_ids],
    )
    figures_of: dict[UUID, list[QuestionFigure]] = {}
    # A drawn option's picture belongs to its option, never to the question's figures.
    pictures: dict[tuple[UUID, str], OptionFigure] = {}
    for figure in figures:
        if figure["mime_type"] not in DISPLAYABLE:
            continue
        if figure["option_key"] is not None:
            pictures.setdefault(
                (figure["question_version_id"], str(figure["option_key"])), option_figure(figure)
            )
            continue
        figures_of.setdefault(figure["question_version_id"], []).append(
            QuestionFigure(
                url=f"/v1/figures/{figure['id']}",
                alt_text=figure["alt_text"],
                width=figure["width"],
                height=figure["height"],
            )
        )
    sessions = {row["session_id"]: row for rows in by_mock.values() for row in rows}
    for item in items:
        item["figures"] = figures_of.get(item["question_version_id"], [])
        for option in item["options"]:
            option["figure"] = pictures.get((item["question_version_id"], option["option_key"]))
        sessions[item["session_id"]]["items"].append(item)
    return by_mock


def topics_of(items: list[ReportItem]) -> list[TopicResult]:
    """The topics the questions test, most wrong first, then most questions, then by name."""
    found: dict[UUID, TopicResult] = {}
    for item in items:
        if item.subtopic_id is None:
            continue
        topic = found.setdefault(
            item.subtopic_id,
            TopicResult(
                subtopic_id=item.subtopic_id,
                name=item.subtopic_name or "",
                topic_name=item.topic_name,
                questions=0,
                correct=0,
                wrong=0,
                unanswered=0,
            ),
        )
        topic.questions += 1
        if item.outcome == "right":
            topic.correct += 1
        elif item.outcome == "wrong":
            topic.wrong += 1
        else:
            topic.unanswered += 1
    return sorted(found.values(), key=lambda t: (-t.wrong, -t.questions, t.name))


def _subject_result(row: dict[str, Any], *, with_items: bool) -> SubjectResult:
    items: list[ReportItem] = []
    if with_items:
        for item in row["items"]:
            chosen = item["selected_option_key"]
            key = item["correct_option_key"]
            outcome: Outcome = (
                "unanswered" if chosen is None else "right" if chosen == key else "wrong"
            )
            items.append(
                ReportItem(
                    position=item["position"],
                    question_version_id=item["question_version_id"],
                    stem=item["stem"],
                    instructions=item["instructions"],
                    passage_title=item["passage_title"],
                    passage_body=item["passage_body"],
                    options=[PaperOption(**option) for option in item["options"]],
                    figures=item["figures"],
                    selected_option_key=chosen,
                    correct_option_key=key,
                    flagged=item["flagged"],
                    outcome=outcome,
                    solution_steps=[str(step) for step in (item["solution_steps"] or [])],
                    response_ms=int(item["response_ms"]),
                    subtopic_id=item["subtopic_id"],
                    subtopic_name=item["subtopic_name"],
                    topic_name=item["topic_name"],
                )
            )
    return SubjectResult(
        subject_id=row["subject_id"],
        session_id=row["session_id"],
        code=row["code"],
        name=row["name"],
        tally=tally(int(row["questions"]), int(row["answered"]), int(row["correct"])),
        items=items,
        time_ms=sum(item.response_ms for item in items),
        topics=topics_of(items),
    )


def _overall(subjects: list[SubjectResult]) -> Tally:
    return tally(
        sum(s.tally.questions for s in subjects),
        sum(s.tally.answered for s in subjects),
        sum(s.tally.correct for s in subjects),
    )


async def _integrity(conn: AsyncConnection, mock_ids: list[UUID]) -> dict[UUID, Integrity]:
    rows = await fetch_all(
        conn,
        """
        SELECT mock_exam_id, kind, coalesce(at_client, received_at) AS at
        FROM mock_exam_events
        WHERE mock_exam_id = ANY(CAST(:ids AS uuid[]))
        ORDER BY received_at, id
        """,
        ids=[str(mock_id) for mock_id in mock_ids],
    )
    found = {mock_id: Integrity() for mock_id in mock_ids}
    counted = {
        "fullscreen_exit": "fullscreen_exits",
        "tab_hidden": "tab_switches",
        "window_blur": "window_blurs",
        "copy_blocked": "copy_blocked",
        "paste_blocked": "paste_blocked",
        "menu_blocked": "menu_blocked",
    }
    for row in rows:
        record = found[row["mock_exam_id"]]
        record.events.append(IntegrityEvent(kind=row["kind"], at=row["at"]))
        field = counted.get(row["kind"])
        if field:
            setattr(record, field, getattr(record, field) + 1)
    return found


# --------------------------------------------------------------------------- routes


@router.get("/options/{student_id}", response_model=MockOptions, summary="What a mock can hold")
async def options(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], student_id: UUID
) -> MockOptions:
    """The subjects a mock can be built from, with how many questions each can supply.

    Offered: every examination the student has a goal in, and every examination sat in one
    sitting (UTME), so a student with no goal yet can still sit a mock.
    """
    await require_student(request, conn, student_id)
    await _settle_expired(conn, student_id)
    rows = await fetch_all(
        conn,
        """
        WITH goals AS (
          SELECT g.subject_id, s.examination_id
          FROM student_exam_goals g JOIN subjects s ON s.id = g.subject_id
          WHERE g.student_id = :student AND g.status = 'active'
        ), pool AS (
          SELECT DISTINCT dq.subject_id, dq.question_id
          FROM deliverable_questions dq
          JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
        )
        SELECT e.id AS examination_id, e.short_name, e.name AS exam_name,
               coalesce(e.max_subjects, :max_subjects) AS max_subjects,
               s.id AS subject_id, s.code, s.name,
               s.code = ANY(e.compulsory_subject_codes) AS compulsory,
               EXISTS (SELECT 1 FROM goals g WHERE g.subject_id = s.id) AS mine,
               count(p.question_id) AS available,
               count(p.question_id) FILTER (WHERE NOT EXISTS (
                 SELECT 1 FROM student_question_history h
                  WHERE h.student_id = :student AND h.question_id = p.question_id)) AS unseen
        FROM examinations e
        JOIN subjects s ON s.examination_id = e.id AND s.status = 'active'
        JOIN pool p ON p.subject_id = s.id
        WHERE e.status = 'active'
          AND (e.sits_together OR e.id IN (SELECT examination_id FROM goals))
        GROUP BY e.id, e.short_name, e.name, e.max_subjects, e.compulsory_subject_codes,
                 s.id, s.code, s.name
        ORDER BY EXISTS (SELECT 1 FROM goals g WHERE g.examination_id = e.id) DESC,
                 e.short_name, compulsory DESC, s.name
        """,
        student=student_id,
        pool=EXCLUDED_POOL,
        max_subjects=MAX_SUBJECTS,
    )
    exams: dict[UUID, ExamOption] = {}
    for row in rows:
        exam = exams.setdefault(
            row["examination_id"],
            ExamOption(
                examination_id=row["examination_id"],
                short_name=row["short_name"],
                name=row["exam_name"],
                max_subjects=min(int(row["max_subjects"]), MAX_SUBJECTS),
                subjects=[],
            ),
        )
        exam.subjects.append(
            SubjectOption(
                subject_id=row["subject_id"],
                code=row["code"],
                name=row["name"],
                available=int(row["available"]),
                unseen=int(row["unseen"]),
                mine=bool(row["mine"]),
                compulsory=bool(row["compulsory"]),
            )
        )
    open_id = (
        await conn.execute(
            text(
                """
                SELECT id FROM mock_exams
                WHERE student_id = :student AND submitted_at IS NULL AND hidden_at IS NULL
                ORDER BY started_at DESC LIMIT 1
                """
            ),
            {"student": student_id},
        )
    ).scalar_one_or_none()
    return MockOptions(examinations=list(exams.values()), open_mock_id=open_id)


@router.post("/start", response_model=MockPaper, summary="Set the paper and start the clock")
async def start(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], body: StartMock
) -> MockPaper:
    """Fix the whole paper, then start the clock. Each count is capped by what is available."""
    await require_student(request, conn, body.student_id)
    student = (
        await conn.execute(text("SELECT 1 FROM students WHERE id = :id"), {"id": body.student_id})
    ).first()
    if student is None:
        raise HTTPException(status_code=404, detail="unknown student")
    chosen = [choice.subject_id for choice in body.subjects]
    if len(set(chosen)) != len(chosen):
        raise HTTPException(status_code=422, detail="Each subject can be chosen once.")

    await _settle_expired(conn, body.student_id)
    running = (
        await conn.execute(
            text(
                """
                SELECT id FROM mock_exams
                WHERE student_id = :student AND submitted_at IS NULL AND hidden_at IS NULL
                LIMIT 1
                """
            ),
            {"student": body.student_id},
        )
    ).scalar_one_or_none()
    if running is not None:
        raise HTTPException(
            status_code=409,
            detail="You already have a mock exam running. Finish or submit it first.",
        )

    subjects = await fetch_all(
        conn,
        """
        SELECT s.id, s.examination_id, s.name, s.code, e.compulsory_subject_codes,
               coalesce(e.max_subjects, :max_subjects) AS max_subjects
        FROM subjects s JOIN examinations e ON e.id = s.examination_id
        WHERE s.id = ANY(CAST(:ids AS uuid[])) AND s.status = 'active'
        """,
        ids=[str(subject_id) for subject_id in chosen],
        max_subjects=MAX_SUBJECTS,
    )
    if len(subjects) != len(chosen):
        raise HTTPException(status_code=404, detail="unknown subject")
    exams = {row["examination_id"] for row in subjects}
    if len(exams) != 1:
        raise HTTPException(
            status_code=422, detail="Choose subjects from one examination for one sitting."
        )
    if len(chosen) > min(int(subjects[0]["max_subjects"]), MAX_SUBJECTS):
        raise HTTPException(status_code=422, detail="That is more subjects than one sitting holds.")
    names = {row["id"]: row["name"] for row in subjects}
    codes = {row["id"]: row["code"] for row in subjects}
    compulsory = set(subjects[0]["compulsory_subject_codes"] or [])

    rng = secrets.SystemRandom()
    papers: list[tuple[UUID, list[UUID]]] = []
    for choice in body.subjects:
        if body.preset == "utme" and codes.get(choice.subject_id) in compulsory:
            pool = await fetch_all(
                conn,
                """
                SELECT DISTINCT ON (dq.question_version_id)
                       dq.question_version_id, dq.passage_id, q.question_number,
                       sub.name AS subtopic_name,
                       EXISTS (SELECT 1 FROM student_question_history h
                                WHERE h.student_id = :student
                                  AND h.question_id = dq.question_id) AS seen
                FROM deliverable_questions dq
                JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
                JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
                JOIN curriculum_items sub ON sub.id = skill.parent_id
                WHERE dq.subject_id = :subject
                """,
                pool=EXCLUDED_POOL,
                subject=choice.subject_id,
                student=body.student_id,
            )
            laid_out = utme_english_paper(pool, rng, choice.questions)
            if laid_out:
                papers.append((choice.subject_id, laid_out))
                continue
        picked = await fetch_all(
            conn,
            """
            WITH pool AS (
              SELECT DISTINCT ON (dq.question_version_id)
                     dq.question_version_id, dq.question_id, dq.passage_id
              FROM deliverable_questions dq
              JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
              WHERE dq.subject_id = :subject
            )
            SELECT p.question_version_id, p.passage_id
            FROM pool p
            ORDER BY EXISTS (SELECT 1 FROM student_question_history h
                              WHERE h.student_id = :student
                                AND h.question_id = p.question_id),
                     random()
            LIMIT :n
            """,
            pool=EXCLUDED_POOL,
            subject=choice.subject_id,
            student=body.student_id,
            n=choice.questions,
        )
        if not picked:
            raise HTTPException(
                status_code=422,
                detail=f"{names[choice.subject_id]} has no questions ready for a mock yet.",
            )
        papers.append((choice.subject_id, shuffled_paper(picked, rng)))

    # The Real UTME gets JAMB's time for the questions actually set; a custom mock, the
    # student's own.
    minutes = (
        utme_minutes(sum(len(order) for _, order in papers))
        if body.preset == "utme"
        else body.minutes
    )
    mock_id = (
        await conn.execute(
            text(
                """
                INSERT INTO mock_exams (student_id, examination_id, preset, duration_minutes,
                  deadline_at)
                VALUES (:student, :exam, :preset, :minutes,
                  now() + make_interval(mins => :minutes))
                RETURNING id
                """
            ),
            {
                "student": body.student_id,
                "exam": next(iter(exams)),
                "preset": body.preset,
                "minutes": minutes,
            },
        )
    ).scalar_one()
    for subject_id, order in papers:
        session_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO study_sessions (student_id, subject_id, session_type,
                      planned_minutes, planned_items, engine_version, mock_exam_id, started_at)
                    SELECT :student, :subject, 'full_mock', :minutes, :items, :engine, m.id,
                           m.started_at
                    FROM mock_exams m WHERE m.id = :mock
                    RETURNING id
                    """
                ),
                {
                    "student": body.student_id,
                    "subject": subject_id,
                    "minutes": minutes,
                    "items": len(order),
                    "engine": ENGINE_VERSION,
                    "mock": mock_id,
                },
            )
        ).scalar_one()
        await conn.execute(
            text(
                """
                INSERT INTO mock_exam_items (mock_exam_id, session_id, position,
                  question_version_id)
                VALUES (:mock, :session, :position, :version)
                """
            ),
            [
                {"mock": mock_id, "session": session_id, "position": index, "version": version}
                for index, version in enumerate(order, 1)
            ],
        )
    await conn.commit()
    return await paper(request, conn, mock_id)


@router.get("/{mock_id}", response_model=MockPaper, summary="The paper and the time left")
async def paper(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], mock_id: UUID
) -> MockPaper:
    """The whole paper, with the student's answers so far. Never the key."""
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is None and mock["server_now"] > mock["deadline_at"]:
        await _finalize(conn, mock_id, auto=True)
        mock = await _mock(conn, request, mock_id)
    submitted = mock["submitted_at"] is not None
    sheet = (await _sheet(conn, [mock_id], with_items=not submitted, with_keys=False))[mock_id]
    return MockPaper(
        mock_id=mock_id,
        status="submitted" if submitted else "in_progress",
        preset=mock["preset"],
        duration_minutes=mock["duration_minutes"],
        started_at=mock["started_at"],
        deadline_at=mock["deadline_at"],
        server_now=mock["server_now"],
        seconds_left=_seconds_left(mock),
        subjects=[
            PaperSubject(
                subject_id=row["subject_id"],
                session_id=row["session_id"],
                code=row["code"],
                name=row["name"],
                questions=[
                    PaperQuestion(
                        question_version_id=item["question_version_id"],
                        position=item["position"],
                        stem=item["stem"],
                        instructions=item["instructions"],
                        passage_id=item["passage_id"],
                        passage_title=item["passage_title"],
                        passage_body=item["passage_body"],
                        options=[PaperOption(**option) for option in item["options"]],
                        figures=item["figures"],
                        selected_option_key=item["selected_option_key"],
                        flagged=item["flagged"],
                        response_ms=item["response_ms"],
                    )
                    for item in row["items"]
                ],
            )
            for row in sheet
        ],
    )


@router.put("/{mock_id}/answers", response_model=Saved, summary="Save answers as they are chosen")
async def save_answers(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    mock_id: UUID,
    body: SaveAnswers,
) -> Saved:
    """Write the changed questions' state. Refused once the mock is over or time is up."""
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is not None:
        raise HTTPException(status_code=409, detail="This mock has been submitted.")
    late = (mock["server_now"] - mock["deadline_at"]).total_seconds()
    if late > ANSWER_GRACE_SECONDS:
        await _finalize(conn, mock_id, auto=True)
        raise HTTPException(status_code=409, detail="Time is up. Your answers were submitted.")
    saved = await _save(conn, mock_id, body.answers)
    await conn.commit()
    return Saved(saved=saved, server_now=mock["server_now"], seconds_left=_seconds_left(mock))


@router.post(
    "/{mock_id}/events",
    status_code=204,
    response_class=Response,
    summary="Record what the browser saw",
)
async def record_events(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    mock_id: UUID,
    body: EventsIn,
) -> Response:
    """Integrity events while the mock runs. Ignored once it is over."""
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is None:
        await conn.execute(
            text(
                """
                INSERT INTO mock_exam_events (mock_exam_id, kind, at_client)
                SELECT :mock, :kind, :at
                WHERE (SELECT count(*) FROM mock_exam_events WHERE mock_exam_id = :mock) < :cap
                """
            ),
            [
                {
                    "mock": mock_id,
                    "kind": event.kind,
                    "at": event.at_client,
                    "cap": MAX_EVENTS_PER_MOCK,
                }
                for event in body.events
            ],
        )
        await conn.commit()
    return Response(status_code=204)


@router.post("/{mock_id}/submit", response_model=MockReport, summary="Submit and see the report")
async def submit(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    mock_id: UUID,
    body: SubmitIn,
) -> MockReport:
    """Hand the paper in. Submitting twice answers with the same report."""
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is None:
        late = (mock["server_now"] - mock["deadline_at"]).total_seconds()
        if body.answers and late <= ANSWER_GRACE_SECONDS:
            await _save(conn, mock_id, body.answers)
        await _finalize(conn, mock_id, auto=False)
    return await report(request, conn, mock_id)


@router.get("/{mock_id}/report", response_model=MockReport, summary="The result, once it is over")
async def report(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], mock_id: UUID
) -> MockReport:
    """Per subject and overall, every question with its key, and the integrity log."""
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is None:
        if mock["server_now"] <= mock["deadline_at"]:
            raise HTTPException(status_code=409, detail="This mock is still running.")
        await _finalize(conn, mock_id, auto=True)
        mock = await _mock(conn, request, mock_id)
    sheet = (await _sheet(conn, [mock_id], with_items=True, with_keys=True))[mock_id]
    subjects = [_subject_result(row, with_items=True) for row in sheet]
    used = (mock["submitted_at"] - mock["started_at"]).total_seconds()
    return MockReport(
        mock_id=mock_id,
        preset=mock["preset"],
        duration_minutes=mock["duration_minutes"],
        started_at=mock["started_at"],
        deadline_at=mock["deadline_at"],
        submitted_at=mock["submitted_at"],
        auto_submitted=mock["auto_submitted"],
        time_used_seconds=max(0, round(used)),
        overall=_overall(subjects),
        subjects=subjects,
        integrity=(await _integrity(conn, [mock_id]))[mock_id],
    )


@router.get("/history/{student_id}", response_model=list[MockSummary], summary="Every mock sat")
async def history(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], student_id: UUID
) -> list[MockSummary]:
    """Newest first, without the deleted ones."""
    await require_student(request, conn, student_id)
    await _settle_expired(conn, student_id)
    mocks = await fetch_all(
        conn,
        """
        SELECT * FROM mock_exams
        WHERE student_id = :student AND hidden_at IS NULL
        ORDER BY started_at DESC
        LIMIT 200
        """,
        student=student_id,
    )
    ids = [row["id"] for row in mocks]
    sheets = await _sheet(conn, ids, with_items=False, with_keys=False)
    integrity = await _integrity(conn, ids)
    summaries: list[MockSummary] = []
    for mock in mocks:
        subjects = [_subject_result(row, with_items=False) for row in sheets[mock["id"]]]
        flags = integrity[mock["id"]]
        summaries.append(
            MockSummary(
                mock_id=mock["id"],
                status="submitted" if mock["submitted_at"] is not None else "in_progress",
                preset=mock["preset"],
                duration_minutes=mock["duration_minutes"],
                started_at=mock["started_at"],
                submitted_at=mock["submitted_at"],
                auto_submitted=mock["auto_submitted"],
                # A running mock's marks would give the key away early; they wait.
                overall=_overall(subjects) if mock["submitted_at"] is not None else None,
                subjects=subjects if mock["submitted_at"] is not None else [],
                integrity_flags=flags.fullscreen_exits + flags.tab_switches,
            )
        )
    return summaries


@router.delete(
    "/{mock_id}",
    status_code=204,
    response_class=Response,
    summary="Delete a mock from the student's history",
)
async def delete_mock(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], mock_id: UUID
) -> Response:
    """Hide it. A running mock is submitted first; its answers still count.

    Deleting a mock already deleted answers 404, as practice runs do once they are gone.
    """
    mock = await _mock(conn, request, mock_id)
    if mock["submitted_at"] is None:
        await _finalize(conn, mock_id, auto=False)
    await conn.execute(
        text("UPDATE mock_exams SET hidden_at = coalesce(hidden_at, now()) WHERE id = :id"),
        {"id": mock_id},
    )
    await conn.commit()
    return Response(status_code=204)
