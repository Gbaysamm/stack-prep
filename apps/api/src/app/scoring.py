"""The student's scores, as plain percentages (docs/student-scoring.md, version 3.1).

Every number a student sees comes from here:

- a question counts once, by the latest answer to it that counts (no hint, no board, not a
  guessed right answer);
- a topic score is right ÷ answered in that topic;
- a subject score ("your score") is the average of the topic scores the student has;
- each check-up also gets its own result, the average of the topic scores from that sitting
  alone. The first is where the student started; the latest is their predicted score.

Nothing here is weighted or estimated, so a student can always check the sum themselves.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Protocol
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db import fetch_all

#: Days between check-ups.
CHECKUP_EVERY_DAYS = 7

#: Fewer answers than this in a topic and it is only "just started", whatever the percentage.
JUST_STARTED_BELOW = 3

#: A topic at this score, with at least `SETTLED_AFTER` answers, goes to the back of the plan.
STRONG_FROM = 80
SETTLED_AFTER = 5

Status = Literal["not_tried", "just_started", "needs_work", "getting_there", "strong"]


class Unit(Protocol):
    """One JAMB topic (a subtopic in the database), as the check-up router describes it."""

    @property
    def unit_id(self) -> str: ...
    @property
    def name(self) -> str: ...
    @property
    def topic_id(self) -> str: ...
    @property
    def topic_name(self) -> str: ...
    @property
    def share(self) -> float: ...


@dataclass(frozen=True)
class Answer:
    question_id: str
    unit_id: str
    session_id: str | None
    is_correct: bool
    at: datetime


@dataclass(frozen=True)
class Tally:
    right: int
    answered: int

    @property
    def score(self) -> int | None:
        return percent(self.right, self.answered)


def percent(right: int, answered: int) -> int | None:
    """A whole percentage, rounded half up, or nothing when nothing was answered."""
    if answered <= 0:
        return None
    return (200 * right + answered) // (2 * answered)


def average(scores: Iterable[int | None]) -> int | None:
    """The average of whole percentages, rounded half up; topics with no score are left out."""
    found = [score for score in scores if score is not None]
    if not found:
        return None
    return (2 * sum(found) + len(found)) // (2 * len(found))


def status(tally: Tally) -> Status:
    if tally.answered == 0:
        return "not_tried"
    if tally.answered < JUST_STARTED_BELOW:
        return "just_started"
    score = tally.score or 0
    if score >= STRONG_FROM:
        return "strong"
    if score >= 50:
        return "getting_there"
    return "needs_work"


def latest(answers: Iterable[Answer]) -> dict[str, Answer]:
    """The latest counted answer to each question. `answers` must be in time order."""
    found: dict[str, Answer] = {}
    for answer in answers:
        found[answer.question_id] = answer
    return found


def tally(answers: Iterable[Answer], unit_id: str | None = None) -> Tally:
    """Right and answered over the latest answer to each question, optionally in one topic."""
    last = [
        answer
        for answer in latest(answers).values()
        if unit_id is None or answer.unit_id == unit_id
    ]
    return Tally(right=sum(1 for answer in last if answer.is_correct), answered=len(last))


def overall(answers: Sequence[Answer]) -> int | None:
    """Your score: the average of the topic scores these answers give."""
    topics = {answer.unit_id for answer in answers}
    return average(tally(answers, unit_id).score for unit_id in topics)


def first_session(answers: Sequence[Answer], unit_id: str | None = None) -> list[Answer]:
    """The answers from the first sitting that touched this topic (or the subject)."""
    mine = [answer for answer in answers if unit_id is None or answer.unit_id == unit_id]
    if not mine:
        return []
    first = mine[0].session_id
    return [answer for answer in mine if answer.session_id == first]


class TopicScore(BaseModel):
    """One JAMB topic. The database calls it a subtopic; students call it a topic."""

    subtopic_id: UUID
    name: str
    section_id: UUID
    section_name: str
    #: The share of the exam this topic carries. Orders the plan; never enters a score.
    share: float
    answered: int
    right: int
    score: int | None
    started_score: int | None
    status: Status


class CheckupResult(BaseModel):
    session_id: UUID
    finished_at: datetime
    answered: int
    right: int
    #: The average of the topic scores from this sitting alone.
    score: int | None
    #: How many topics that average is over.
    topics: int = 0


class SubjectScore(BaseModel):
    subject_id: UUID
    #: Your score: the average of the topic scores the student has.
    score: int | None
    #: Every question answered in the subject, and how many of those are right now.
    answered: int
    right: int
    #: How many topics `score` averages.
    topics_tried: int
    #: The first check-up's result, or the first sitting's when there was no check-up first.
    started_score: int | None
    #: `score - started_score`.
    change: int | None
    #: The latest finished check-up's result.
    predicted: int | None
    #: Every finished check-up, oldest first.
    checkups: list[CheckupResult]
    next_checkup_due: date | None
    checkup_due: bool
    topics: list[TopicScore]


class TopicChange(BaseModel):
    subtopic_id: UUID
    name: str
    before: int | None
    after: int | None
    answered: int
    right: int


class ScoreChange(BaseModel):
    """What one sitting did to the scores: the subject, and every topic it touched."""

    before: int | None
    after: int | None
    topics: list[TopicChange]


#: Every counted answer one student has given in one subject, oldest first.
ANSWERS = """
    SELECT v.question_id::text AS question_id, sub.id::text AS unit_id,
           a.session_id::text AS session_id, a.is_correct, a.answered_at_client AS at
    FROM scoring_attempts a
    JOIN question_versions v ON v.id = a.question_version_id
    JOIN questions q ON q.id = v.question_id
    JOIN question_classifications c
      ON c.question_id = v.question_id AND c.classification_role = 'primary'
     AND c.review_status = 'approved'
    JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
    JOIN curriculum_items sub ON sub.id = skill.parent_id
    WHERE a.student_id = :student AND q.subject_id = :subject AND a.is_correct IS NOT NULL
    ORDER BY a.answered_at_client, a.received_at
"""

#: Every finished check-up, oldest first.
CHECKUPS = """
    SELECT ss.id AS session_id, ss.ended_at AS finished_at
    FROM study_sessions ss
    WHERE ss.student_id = :student AND ss.subject_id = :subject
      AND ss.session_type = 'checkup' AND ss.ended_at IS NOT NULL
    ORDER BY ss.ended_at
"""


#: The latest lesson the student finished on each subtopic of the subject (migration 044).
LESSONS = """
    SELECT l.subtopic_id::text AS unit_id, max(l.finished_at) AS at
    FROM subtopic_lessons l
    JOIN curriculum_items sub ON sub.id = l.subtopic_id
    WHERE l.student_id = :student AND sub.subject_id = :subject
    GROUP BY l.subtopic_id
"""


def after_lessons(answers: Sequence[Answer], lessons: dict[str, datetime]) -> list[Answer]:
    """A subtopic's answers after its lesson are the student's real attempt at it.

    Once there is at least one answer after the latest lesson on a subtopic, the answers before
    that lesson stop counting there: the student was taught, then tried again on new questions.
    Until then nothing changes, so a lesson alone never moves a score.
    """
    since = {
        unit: at
        for unit, at in lessons.items()
        if any(a.unit_id == unit and a.at > at for a in answers)
    }
    return [a for a in answers if a.unit_id not in since or a.at > since[a.unit_id]]


async def answers_for(conn: AsyncConnection, student_id: UUID, subject_id: UUID) -> list[Answer]:
    rows = await fetch_all(conn, ANSWERS, student=student_id, subject=subject_id)
    found = [
        Answer(
            question_id=row["question_id"],
            unit_id=row["unit_id"],
            session_id=row["session_id"],
            is_correct=bool(row["is_correct"]),
            at=row["at"],
        )
        for row in rows
    ]
    lessons = {
        str(row["unit_id"]): row["at"]
        for row in await fetch_all(conn, LESSONS, student=student_id, subject=subject_id)
    }
    return after_lessons(found, lessons) if lessons else found


def checkup_result(
    session_id: UUID, finished_at: datetime, answers: Sequence[Answer]
) -> CheckupResult:
    """One check-up's own result: the average of the topic scores from that sitting alone."""
    mine = [answer for answer in answers if answer.session_id == str(session_id)]
    counted = tally(mine)
    return CheckupResult(
        session_id=session_id,
        finished_at=finished_at,
        answered=counted.answered,
        right=counted.right,
        score=overall(mine),
        topics=len({answer.unit_id for answer in mine}),
    )


async def checkups_for(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID, answers: Sequence[Answer]
) -> list[CheckupResult]:
    rows = await fetch_all(conn, CHECKUPS, student=student_id, subject=subject_id)
    return [checkup_result(row["session_id"], row["finished_at"], answers) for row in rows]


def topic_scores(units: Sequence[Unit], answers: Sequence[Answer]) -> list[TopicScore]:
    lines: list[TopicScore] = []
    for unit in units:
        now = tally(answers, unit.unit_id)
        start = first_session(answers, unit.unit_id)
        lines.append(
            TopicScore(
                subtopic_id=UUID(unit.unit_id),
                name=unit.name,
                section_id=UUID(unit.topic_id),
                section_name=unit.topic_name,
                share=round(unit.share, 4),
                answered=now.answered,
                right=now.right,
                score=now.score,
                started_score=tally(start).score if start else None,
                status=status(now),
            )
        )
    return lines


def subject_score(
    subject_id: UUID,
    units: Sequence[Unit],
    answers: Sequence[Answer],
    checkups: Sequence[CheckupResult],
    today: date,
) -> SubjectScore:
    known = {unit.unit_id for unit in units}
    # The check-up is where scoring starts. Before the first one, nothing is scored, not even
    # a mock exam's answers: a mock is practice under exam conditions, never a check-up.
    answers = [answer for answer in answers if answer.unit_id in known] if checkups else []
    counted = tally(answers)
    topics = topic_scores(units, answers)
    score = average(line.score for line in topics)
    # Where the student started: the first check-up, or the first sitting if none came first.
    scored = [line for line in checkups if line.score is not None]
    started = scored[0].score if scored else overall(first_session(answers))
    last = checkups[-1] if checkups else None
    due = last.finished_at.date() + timedelta(days=CHECKUP_EVERY_DAYS) if last else None
    return SubjectScore(
        subject_id=subject_id,
        score=score,
        answered=counted.answered,
        right=counted.right,
        topics_tried=sum(1 for line in topics if line.score is not None),
        started_score=started,
        change=(score - started) if score is not None and started is not None else None,
        predicted=scored[-1].score if scored else None,
        checkups=list(checkups),
        next_checkup_due=due,
        checkup_due=last is None or (due is not None and due <= today),
        topics=topics,
    )


async def subject_scores(
    conn: AsyncConnection,
    student_id: UUID,
    subject_id: UUID,
    units: Sequence[Unit],
    today: date,
) -> SubjectScore:
    answers = await answers_for(conn, student_id, subject_id)
    checkups = await checkups_for(conn, student_id, subject_id, answers)
    return subject_score(subject_id, units, answers, checkups, today)


def session_change(
    units: Sequence[Unit], answers: Sequence[Answer], session_id: str
) -> ScoreChange:
    """The scores just before a sitting and just after it, and every topic it touched.

    Before is every counted answer given before the sitting's first one; after adds the
    sitting itself. Anything answered later, in another sitting, is left out of both, so an
    old run's report still shows what that run did.
    """
    known = {unit.unit_id for unit in units}
    answers = [answer for answer in answers if answer.unit_id in known]
    mine = [answer for answer in answers if answer.session_id == session_id]
    if not mine:
        return ScoreChange(before=None, after=None, topics=[])
    start = mine[0].at
    before = [answer for answer in answers if answer.at < start and answer.session_id != session_id]
    after = [answer for answer in answers if answer.session_id == session_id or answer.at < start]
    names = {unit.unit_id: unit.name for unit in units}
    touched: list[str] = []
    for answer in mine:
        if answer.unit_id not in touched:
            touched.append(answer.unit_id)
    topics = []
    for unit_id in touched:
        in_session = tally(answer for answer in mine if answer.unit_id == unit_id)
        topics.append(
            TopicChange(
                subtopic_id=UUID(unit_id),
                name=names.get(unit_id, "This topic"),
                before=tally(before, unit_id).score,
                after=tally(after, unit_id).score,
                answered=in_session.answered,
                right=in_session.right,
            )
        )
    return ScoreChange(before=overall(before), after=overall(after), topics=topics)
