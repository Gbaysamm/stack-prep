"""The student's home: where they stand, what they have done, and what is waiting for them.

Everything here is read, and none of it is new arithmetic. Every score comes from
`app.scoring` (docs/student-scoring.md), the same module the check-up report and the end of a
run use, so no two pages can disagree. The run counts are the ones the guided loop keeps, and
a subject appears only because the student set a goal for it or sat something in it.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import scoring
from app.auth import require_student
from app.db import connection, fetch_all
from app.routers.checkup import _subtopics
from app.routers.practice import DEFAULT_LENGTH
from app.routers.student import sessions_before

router = APIRouter(prefix="/v1/student", tags=["student"])

#: How many recent runs the home page shows.
RECENT_RUNS = 8

#: How many subtopics the home page names as the ones to work on.
WEAKEST = 3

#: How many lessons the home page offers to go back to, and how much of each stem it shows.
TO_REVISIT = 10
STEM_EXCERPT_CHARS = 120

#: The contexts a streak counts. Mock exams are not a study habit, and review has no session.
STREAK_CONTEXTS = ("guided", "practice", "checkup")

#: Every guided run this student has started, with the counts the loop itself keeps. The same
#: tests `_state` in the practice router uses: taught is missed twice and never right, and an
#: unaided right answer is one `scoring_attempts` lets through. A right answer the student
#: called a guess is not unaided; it is counted apart, as `guessed_right`, exactly as `_state`
#: counts it.
#:
#: Finished is the stamp the loop now writes, or, for runs from before it wrote one, every
#: question used up with none left waiting on its second try.
#:
#: A run the student deleted is still here, marked `hidden`: its answers still count, so the
#: totals keep it, and only the lists of runs leave it out.
RUNS = """
    SELECT ss.id AS session_id, ss.subject_id, s.name AS subject_name, ss.started_at,
           coalesce(ss.planned_items, :default_length) AS length,
           coalesce(q.answered, 0) AS answered,
           coalesce(u.correct_unaided, 0) AS correct_unaided,
           coalesce(g.guessed_right, 0) AS guessed_right,
           coalesce(q.taught, 0) AS taught,
           (ss.ended_at IS NOT NULL
            OR (coalesce(q.answered, 0) >= coalesce(ss.planned_items, :default_length)
                AND NOT coalesce(q.mid_question, false))) AS finished,
           ss.hidden_at IS NOT NULL AS hidden
    FROM study_sessions ss
    JOIN subjects s ON s.id = ss.subject_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS answered,
             count(*) FILTER (WHERE pq.tries >= 2 AND NOT pq.ever_right) AS taught,
             -- A first miss on the last question touched: the hint is showing.
             bool_or(pq.tries = 1 AND NOT pq.ever_right AND pq.last_at = pq.session_last)
               AS mid_question
      FROM (
        SELECT count(*) AS tries,
               bool_or(coalesce(a.is_correct, false)) AS ever_right,
               max(a.answered_at_client) AS last_at,
               max(max(a.answered_at_client)) OVER () AS session_last
        FROM attempts a
        WHERE a.session_id = ss.id
        GROUP BY a.question_version_id
      ) pq
    ) q ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS correct_unaided
      FROM scoring_attempts sa
      WHERE sa.session_id = ss.id AND sa.is_correct
    ) u ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS guessed_right
      FROM attempts ga
      WHERE ga.session_id = ss.id AND ga.is_correct AND ga.confidence = 'guessed'
        AND ga.hint_count = 0 AND NOT ga.solution_viewed_before_answer
    ) g ON true
    WHERE ss.student_id = :student AND ss.session_type = 'guided'
"""


class Student(BaseModel):
    student_id: UUID
    display_name: str


class SubjectGoal(BaseModel):
    target_score: float | None
    exam_date: date | None
    #: Calendar days from today, in the student's own timezone. Negative once it has passed.
    days_to_exam: int | None
    minutes_per_day: int | None
    study_days: list[int] | None
    sessions_before_exam: int | None


class WeakSubtopic(BaseModel):
    """One weak JAMB topic. The DB calls it a subtopic; students call it a topic."""

    subtopic_id: UUID
    name: str
    #: The DB topic, which is JAMB's section. Kept for older clients.
    topic_name: str
    #: 0 to 1: the topic score (right ÷ answered) as a fraction.
    mastery: float
    #: How much the reading can carry: "low" or "medium", from the number answered.
    confidence: str
    answered: int = 0
    right: int = 0
    #: JAMB's section (the DB topic): a heading, never the unit a student works on.
    section_id: UUID | None = None
    section_name: str | None = None


class LatestCheckup(BaseModel):
    session_id: UUID
    finished_at: datetime
    answered: int
    right: int
    #: That sitting's result, right ÷ answered: the predicted score.
    score: int | None
    #: Weakest first, by topic score, among topics the student has answered in.
    weakest_subtopics: list[WeakSubtopic]


class PracticeTotals(BaseModel):
    runs_finished: int
    questions_answered: int
    correct_unaided: int
    taught: int
    #: Right with no help but called a guess by the student; not in `correct_unaided`.
    guessed_right: int = 0


class SubjectOverview(BaseModel):
    subject_id: UUID
    subject_name: str
    examination_short_name: str
    goal: SubjectGoal | None
    latest_checkup: LatestCheckup | None
    #: Every number the home page shows for this subject (docs/student-scoring.md).
    scores: scoring.SubjectScore | None = None
    #: A check-up started and not finished, to resume rather than start again.
    open_checkup_session_id: UUID | None
    #: The newest guided run not yet finished.
    open_practice_session_id: UUID | None
    practice: PracticeTotals


class PracticeRun(BaseModel):
    session_id: UUID
    subject_id: UUID
    subject_name: str
    started_at: datetime
    finished: bool
    #: Distinct questions met, including any taught rather than answered.
    answered: int
    correct_unaided: int
    taught: int
    length: int
    #: Right with no help but called a guess by the student; not in `correct_unaided`.
    guessed_right: int = 0


class PracticeRunDetail(PracticeRun):
    #: The DB topics this run's questions came from, which are JAMB's SECTIONS, alphabetical.
    #: Kept for older clients; `sections` is the same list named for what it is.
    topics: list[str]
    #: JAMB's sections (DB topics) the run touched, alphabetical.
    sections: list[str] = Field(default_factory=list)
    #: JAMB's topics (DB subtopics) the run touched, alphabetical: what students see.
    subtopics: list[str] = Field(default_factory=list)


class PracticeRunPage(BaseModel):
    runs: list[PracticeRunDetail]
    #: Pass as `before` for the next page; null when there is none.
    next_before: datetime | None


class ExamPaper(BaseModel):
    subject_id: UUID
    subject_name: str
    exam_date: date | None
    #: Calendar days from today in the student's timezone; negative once it has passed.
    days_to_exam: int | None


class ExamCountdown(BaseModel):
    """How far off one examination is, worked out the way that examination is sat.

    Sat together (UTME): every paper is on one day, so the countdown is to that day. Sat paper
    by paper (WAEC, NECO): the countdown is to the nearest paper still to come, and
    `next_subject_names` says which paper that is (more than one when they share the day).
    A date already passed is never "next".
    """

    examination_id: UUID
    short_name: str
    name: str
    sits_together: bool
    #: The next exam day still to come, today included; null when none is set or all passed.
    next_date: date | None
    days_to_next: int | None
    #: The papers sat on `next_date`, in name order.
    next_subject_names: list[str]
    #: Every subject the student has a goal in, by date (undated last).
    papers: list[ExamPaper]


def exam_countdowns(rows: list[dict[str, Any]], today: date) -> list[ExamCountdown]:
    """Group goal rows into one countdown per examination, nearest first.

    Each row needs examination_id, short_name, exam_name, sits_together, subject_id,
    subject_name and exam_date. Exams with no date still to come sort last, by name.
    """
    grouped: dict[UUID, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["examination_id"], []).append(row)
    countdowns: list[ExamCountdown] = []
    for exam_rows in grouped.values():
        first = exam_rows[0]
        papers = sorted(
            (
                ExamPaper(
                    subject_id=row["subject_id"],
                    subject_name=row["subject_name"],
                    exam_date=row["exam_date"],
                    days_to_exam=(row["exam_date"] - today).days if row["exam_date"] else None,
                )
                for row in exam_rows
            ),
            key=lambda paper: (
                paper.exam_date is None,
                paper.exam_date or today,
                paper.subject_name,
            ),
        )
        upcoming = [p.exam_date for p in papers if p.exam_date is not None and p.exam_date >= today]
        next_date = min(upcoming) if upcoming else None
        countdowns.append(
            ExamCountdown(
                examination_id=first["examination_id"],
                short_name=first["short_name"],
                name=first["exam_name"],
                sits_together=bool(first["sits_together"]),
                next_date=next_date,
                days_to_next=(next_date - today).days if next_date else None,
                next_subject_names=sorted(
                    p.subject_name for p in papers if next_date and p.exam_date == next_date
                ),
                papers=papers,
            )
        )
    countdowns.sort(key=lambda c: (c.next_date is None, c.next_date or today, c.short_name))
    return countdowns


class Overview(BaseModel):
    student: Student
    subjects: list[SubjectOverview]
    #: One countdown per examination the student has a goal in, nearest first. This is what
    #: "days to exam" means across the app; a subject's own `goal.days_to_exam` is its paper.
    exams: list[ExamCountdown] = Field(default_factory=list)
    recent_runs: list[PracticeRun]
    #: Consecutive calendar days, ending today or yesterday, with at least one answer.
    streak_days: int
    active_today: bool


async def _student(conn: AsyncConnection, student_id: UUID) -> dict[str, Any]:
    """The student, and what today's date is where they are."""
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT id, display_name, timezone,
                           (now() AT TIME ZONE timezone)::date AS today
                    FROM students WHERE id = :id
                    """
                ),
                {"id": student_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="unknown student")
    return dict(row)


def streak(days: list[date], today: date) -> tuple[int, bool]:
    """Consecutive study days ending today, or yesterday if today has not started yet.

    Yesterday counts so a streak is not shown as broken at breakfast. Two days back and it is.
    """
    seen = set(days)
    active_today = today in seen
    day = today if active_today else today - timedelta(days=1)
    count = 0
    while day in seen:
        count += 1
        day -= timedelta(days=1)
    return count, active_today


async def _scores(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID, today: date
) -> scoring.SubjectScore | None:
    """The subject's scores, or nothing when its syllabus has lost its current version."""
    try:
        units, _ = await _subtopics(conn, subject_id)
    except HTTPException as error:
        if error.status_code == 409:
            return None
        raise
    return await scoring.subject_scores(conn, student_id, subject_id, units, today)


def _latest_checkup(found: scoring.SubjectScore | None) -> LatestCheckup | None:
    """The latest finished check-up, and the weakest topics as they stand now."""
    # A check-up closed with no answers has no result to show.
    finished = [line for line in found.checkups if line.answered] if found else []
    if found is None or not finished:
        return None
    last = finished[-1]
    reached = sorted(
        (line for line in found.topics if line.score is not None),
        key=lambda line: (line.score or 0, -line.share),
    )
    return LatestCheckup(
        session_id=last.session_id,
        finished_at=last.finished_at,
        answered=last.answered,
        right=last.right,
        score=last.score,
        weakest_subtopics=[
            WeakSubtopic(
                subtopic_id=line.subtopic_id,
                name=line.name,
                topic_name=line.section_name,
                mastery=(line.score or 0) / 100,
                confidence="low" if line.answered < scoring.JUST_STARTED_BELOW else "medium",
                section_id=line.section_id,
                section_name=line.section_name,
                answered=line.answered,
                right=line.right,
            )
            for line in reached[:WEAKEST]
        ],
    )


@router.get(
    "/{student_id}/overview", response_model=Overview, summary="Everything the home page shows"
)
async def overview(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], student_id: UUID
) -> Overview:
    """One call for the student's home: each subject, the latest runs, and the streak.

    A handful of queries whatever the history: one for the subjects, one for the runs, one for
    the days studied, and one report per subject for its latest finished check-up.
    """
    await require_student(request, conn, student_id)
    student = await _student(conn, student_id)
    today: date = student["today"]

    subjects = await fetch_all(
        conn,
        """
        WITH mine AS (
          SELECT subject_id FROM student_exam_goals
          WHERE student_id = :student AND status = 'active'
          UNION
          SELECT subject_id FROM study_sessions
          WHERE student_id = :student AND subject_id IS NOT NULL
        )
        SELECT s.id AS subject_id, s.name AS subject_name, e.short_name,
               e.id AS examination_id, e.name AS exam_name, e.sits_together,
               g.target_score, g.exam_date, g.minutes_per_day, g.study_days,
               g.id IS NOT NULL AS has_goal,
               done.id AS checkup_id, done.ended_at AS checkup_finished_at,
               open_checkup.id AS open_checkup_id
        FROM mine
        JOIN subjects s ON s.id = mine.subject_id
        JOIN examinations e ON e.id = s.examination_id
        LEFT JOIN student_exam_goals g
          ON g.student_id = :student AND g.subject_id = s.id AND g.status = 'active'
        LEFT JOIN LATERAL (
          SELECT c.id, c.ended_at FROM study_sessions c
          WHERE c.student_id = :student AND c.subject_id = s.id
            AND c.session_type = 'checkup' AND c.ended_at IS NOT NULL
          ORDER BY c.ended_at DESC LIMIT 1
        ) done ON true
        LEFT JOIN LATERAL (
          SELECT c.id FROM study_sessions c
          WHERE c.student_id = :student AND c.subject_id = s.id
            AND c.session_type = 'checkup' AND c.ended_at IS NULL
          ORDER BY c.started_at DESC LIMIT 1
        ) open_checkup ON true
        ORDER BY s.name
        """,
        student=student_id,
    )

    runs = await fetch_all(
        conn,
        RUNS + " ORDER BY ss.started_at DESC",
        student=student_id,
        default_length=DEFAULT_LENGTH,
    )

    days = await fetch_all(
        conn,
        """
        SELECT DISTINCT (a.answered_at_client AT TIME ZONE :tz)::date AS day
        FROM attempts a
        WHERE a.student_id = :student AND a.context = ANY (CAST(:contexts AS text[]))
          AND a.answered_at_client >= now() - interval '400 days'
        """,
        student=student_id,
        tz=student["timezone"],
        contexts=list(STREAK_CONTEXTS),
    )
    streak_days, active_today = streak([row["day"] for row in days], today)

    # A deleted run is not shown or offered to resume, but the work in it still happened.
    shown = [run for run in runs if not run["hidden"]]

    subject_views: list[SubjectOverview] = []
    for row in subjects:
        mine = [run for run in runs if run["subject_id"] == row["subject_id"]]
        open_run = next(
            (
                run
                for run in shown
                if run["subject_id"] == row["subject_id"] and not run["finished"]
            ),
            None,
        )
        goal = None
        if row["has_goal"]:
            study_days = list(row["study_days"]) if row["study_days"] else None
            goal = SubjectGoal(
                target_score=(
                    float(row["target_score"]) if row["target_score"] is not None else None
                ),
                exam_date=row["exam_date"],
                days_to_exam=(row["exam_date"] - today).days if row["exam_date"] else None,
                minutes_per_day=row["minutes_per_day"],
                study_days=study_days,
                sessions_before_exam=sessions_before(
                    row["exam_date"], row["minutes_per_day"], study_days or []
                ),
            )
        found = await _scores(conn, student_id, row["subject_id"], today)
        subject_views.append(
            SubjectOverview(
                subject_id=row["subject_id"],
                subject_name=row["subject_name"],
                examination_short_name=row["short_name"],
                goal=goal,
                latest_checkup=_latest_checkup(found),
                scores=found,
                open_checkup_session_id=row["open_checkup_id"],
                open_practice_session_id=open_run["session_id"] if open_run else None,
                practice=PracticeTotals(
                    runs_finished=sum(1 for run in mine if run["finished"]),
                    questions_answered=sum(int(run["answered"]) for run in mine),
                    correct_unaided=sum(int(run["correct_unaided"]) for run in mine),
                    guessed_right=sum(int(run["guessed_right"]) for run in mine),
                    taught=sum(int(run["taught"]) for run in mine),
                ),
            )
        )

    return Overview(
        student=Student(student_id=student["id"], display_name=student["display_name"]),
        subjects=subject_views,
        exams=exam_countdowns([dict(row) for row in subjects if row["has_goal"]], today),
        recent_runs=[_run(run) for run in shown[:RECENT_RUNS]],
        streak_days=streak_days,
        active_today=active_today,
    )


def _run(row: dict[str, Any]) -> PracticeRun:
    return PracticeRun(
        session_id=row["session_id"],
        subject_id=row["subject_id"],
        subject_name=row["subject_name"],
        started_at=row["started_at"],
        finished=bool(row["finished"]),
        answered=int(row["answered"]),
        correct_unaided=int(row["correct_unaided"]),
        taught=int(row["taught"]),
        length=int(row["length"]),
        guessed_right=int(row["guessed_right"]),
    )


@router.get(
    "/{student_id}/practice",
    response_model=PracticeRunPage,
    summary="Every guided run, newest first",
)
async def practice_runs(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    student_id: UUID,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    before: datetime | None = None,
) -> PracticeRunPage:
    """A page of this student's guided runs, and the topics each one touched.

    Paged by start time rather than by offset, so a run started while the student is reading
    the list does not push one they have already seen onto the next page twice.
    """
    await require_student(request, conn, student_id)
    await _student(conn, student_id)
    rows = await fetch_all(
        conn,
        f"""
        WITH runs AS ({RUNS}
          AND ss.hidden_at IS NULL
          AND (CAST(:before AS timestamptz) IS NULL OR ss.started_at < CAST(:before AS timestamptz))
          ORDER BY ss.started_at DESC
          LIMIT :limit
        )
        SELECT runs.*,
               coalesce((
                 SELECT array_agg(DISTINCT topic.name ORDER BY topic.name)
                 FROM attempts a
                 JOIN question_versions v ON v.id = a.question_version_id
                 JOIN question_classifications c
                   ON c.question_id = v.question_id AND c.classification_role = 'primary'
                 JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
                 JOIN curriculum_items sub ON sub.id = skill.parent_id
                 JOIN curriculum_items topic ON topic.id = sub.parent_id
                 WHERE a.session_id = runs.session_id
               ), ARRAY[]::text[]) AS topics,
               coalesce((
                 SELECT array_agg(DISTINCT sub.name ORDER BY sub.name)
                 FROM attempts a
                 JOIN question_versions v ON v.id = a.question_version_id
                 JOIN question_classifications c
                   ON c.question_id = v.question_id AND c.classification_role = 'primary'
                 JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
                 JOIN curriculum_items sub ON sub.id = skill.parent_id
                 WHERE a.session_id = runs.session_id
               ), ARRAY[]::text[]) AS subtopics
        FROM runs
        ORDER BY runs.started_at DESC
        """,
        student=student_id,
        default_length=DEFAULT_LENGTH,
        before=before,
        limit=limit,
    )
    page = [
        PracticeRunDetail(
            **_run(row).model_dump(),
            topics=list(row["topics"]),
            sections=list(row["topics"]),
            subtopics=list(row["subtopics"]),
        )
        for row in rows
    ]
    return PracticeRunPage(
        runs=page,
        next_before=page[-1].started_at if len(page) == limit else None,
    )


class LessonFeedbackCounts(BaseModel):
    got_it: int = 0
    unsure: int = 0
    too_hard: int = 0
    matched_yes: int = 0
    matched_partly: int = 0
    matched_no: int = 0


class LessonToRevisit(BaseModel):
    question_version_id: UUID
    subject_id: UUID
    subject_name: str
    #: The DB topic, which is JAMB's section. Kept for older clients.
    topic_name: str | None
    #: So "practise this again" can start a run on this subtopic alone.
    subtopic_id: UUID | None = None
    #: The DB subtopic, which is JAMB's topic: the name students see.
    subtopic_name: str | None
    #: JAMB's section, the same as `topic_name`, named for what it is.
    section_name: str | None = None
    #: The start of the question, as plain text.
    stem_excerpt: str
    understood: Literal["unsure", "too_hard"]
    at: datetime


class LessonFeedbackSummary(BaseModel):
    #: Over the latest answer per question, so a student who changed their mind counts once.
    counts: LessonFeedbackCounts
    #: Questions with any feedback.
    total: int
    #: Lessons the student said did not land, newest first.
    to_revisit: list[LessonToRevisit]


def stem_excerpt(stem: str, limit: int = STEM_EXCERPT_CHARS) -> str:
    """The first ``limit`` characters of a stem, with markup and runs of space taken out."""
    plain = re.sub(r"<[^>]+>", " ", stem)
    plain = re.sub(r"[*_`#]+", "", plain)
    plain = " ".join(plain.split())
    if len(plain) <= limit:
        return plain
    return plain[: limit - 1].rstrip() + "…"


@router.get(
    "/{student_id}/lesson-feedback",
    response_model=LessonFeedbackSummary,
    summary="What the student said about their lessons, and which to go back to",
)
async def lesson_feedback(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], student_id: UUID
) -> LessonFeedbackSummary:
    await require_student(request, conn, student_id)
    await _student(conn, student_id)
    rows = await fetch_all(
        conn,
        """
        WITH latest AS (
          SELECT DISTINCT ON (f.question_version_id)
                 f.question_version_id, f.understood, f.matched_working, f.created_at
          FROM lesson_feedback f
          WHERE f.student_id = :student
          ORDER BY f.question_version_id, f.created_at DESC, f.id DESC
        )
        SELECT l.question_version_id, l.understood, l.matched_working, l.created_at,
               v.stem, s.id AS subject_id, s.name AS subject_name,
               topic.name AS topic_name, sub.id AS subtopic_id, sub.name AS subtopic_name,
               -- Hidden the way the web hides them: the sandbox and the test exams.
               (upper(e.short_name) = 'SANDBOX' OR upper(e.short_name) LIKE 'PR%') AS hidden
        FROM latest l
        JOIN question_versions v ON v.id = l.question_version_id
        JOIN subjects s ON s.id = v.subject_id
        JOIN examinations e ON e.id = s.examination_id
        LEFT JOIN question_classifications c
          ON c.question_id = v.question_id AND c.classification_role = 'primary'
        LEFT JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        LEFT JOIN curriculum_items sub ON sub.id = skill.parent_id
        LEFT JOIN curriculum_items topic ON topic.id = sub.parent_id
        ORDER BY l.created_at DESC
        """,
        student=student_id,
    )
    counts = LessonFeedbackCounts()
    for row in rows:
        setattr(counts, row["understood"], getattr(counts, row["understood"]) + 1)
        if row["matched_working"] is not None:
            field = f"matched_{row['matched_working']}"
            setattr(counts, field, getattr(counts, field) + 1)
    to_revisit = [
        LessonToRevisit(
            question_version_id=row["question_version_id"],
            subject_id=row["subject_id"],
            subject_name=row["subject_name"],
            topic_name=row["topic_name"],
            subtopic_id=row["subtopic_id"],
            subtopic_name=row["subtopic_name"],
            section_name=row["topic_name"],
            stem_excerpt=stem_excerpt(str(row["stem"] or "")),
            understood=row["understood"],
            at=row["created_at"],
        )
        for row in rows
        if row["understood"] in ("too_hard", "unsure") and not row["hidden"]
    ][:TO_REVISIT]
    return LessonFeedbackSummary(counts=counts, total=len(rows), to_revisit=to_revisit)


#: The most check-ins one listing returns: years of daily practice for one student.
CHECKINS_MAX = 500


class CheckinEntry(BaseModel):
    """One check-in, as the student gave it, with the question it was about."""

    id: UUID
    at: datetime
    session_id: UUID
    question_version_id: UUID
    #: Why the board opened: two misses, or a right answer the student guessed or doubted.
    context: Literal[
        "after_misses", "after_guess", "after_unsure", "after_second_guess", "after_right"
    ]
    understood: Literal["got_it", "unsure", "too_hard"]
    matched_working: Literal["yes", "partly", "no"] | None
    subject_id: UUID
    subject_name: str
    #: The DB topic, which is JAMB's section. Kept for older clients.
    topic_name: str | None
    #: So a check-in's "practise this" can start a run on this subtopic alone.
    subtopic_id: UUID | None = None
    #: The DB subtopic, which is JAMB's topic: the name students see.
    subtopic_name: str | None
    #: JAMB's section, the same as `topic_name`, named for what it is.
    section_name: str | None = None
    stem_excerpt: str


class CheckinList(BaseModel):
    entries: list[CheckinEntry]


@router.get(
    "/{student_id}/lesson-feedback/entries",
    response_model=CheckinList,
    summary="Every check-in the student has given after a lesson, newest first",
)
async def lesson_feedback_entries(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], student_id: UUID
) -> CheckinList:
    """Every answer, not only the latest per question: this is the student's own record."""
    await require_student(request, conn, student_id)
    await _student(conn, student_id)
    rows = await fetch_all(
        conn,
        """
        SELECT f.id, f.created_at, f.session_id, f.question_version_id, f.context,
               f.understood, f.matched_working, v.stem,
               s.id AS subject_id, s.name AS subject_name,
               topic.name AS topic_name, sub.id AS subtopic_id, sub.name AS subtopic_name
        FROM lesson_feedback f
        JOIN question_versions v ON v.id = f.question_version_id
        JOIN subjects s ON s.id = v.subject_id
        JOIN examinations e ON e.id = s.examination_id
        LEFT JOIN question_classifications c
          ON c.question_id = v.question_id AND c.classification_role = 'primary'
        LEFT JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        LEFT JOIN curriculum_items sub ON sub.id = skill.parent_id
        LEFT JOIN curriculum_items topic ON topic.id = sub.parent_id
        WHERE f.student_id = :student
          AND NOT (upper(e.short_name) = 'SANDBOX' OR upper(e.short_name) LIKE 'PR%')
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT :limit
        """,
        student=student_id,
        limit=CHECKINS_MAX,
    )
    return CheckinList(
        entries=[
            CheckinEntry(
                id=row["id"],
                at=row["created_at"],
                session_id=row["session_id"],
                question_version_id=row["question_version_id"],
                context=row["context"],
                understood=row["understood"],
                matched_working=row["matched_working"],
                subject_id=row["subject_id"],
                subject_name=row["subject_name"],
                topic_name=row["topic_name"],
                subtopic_id=row["subtopic_id"],
                subtopic_name=row["subtopic_name"],
                section_name=row["topic_name"],
                stem_excerpt=stem_excerpt(str(row["stem"] or "")),
            )
            for row in rows
        ]
    )
