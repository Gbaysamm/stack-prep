"""A student's runs as things they choose, look back on, and put away.

Three routes around the guided loop rather than inside it:

* what a custom run may be narrowed to — the years and the syllabus, with how many questions
  each holds and where the student stands in each subtopic;
* the report on one run — every question in the order it was met, what was chosen, how it
  ended, and the reviewed working;
* deleting a run from the student's lists.

DELETING HIDES, IT DOES NOT ERASE. The attempts in a deleted run happened, and they still
count toward mastery and the projection: a record that could be tidied away to improve a
number would not be a record. `hidden_at` only takes the run out of what the student is shown,
and out of reach by its id.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import require_session_owner, require_student
from app.db import connection, fetch_all
from app.figures import QuestionFigure, figures_for
from app.routers.checkup import _subtopics
from app.routers.practice import (
    DEFAULT_LENGTH,
    EXCLUDED_POOL,
    Option,
    RunFilters,
    _options,
    _session,
    _standings_from_history,
    session_filters,
)
from app.routers.progress import RUNS

router = APIRouter(tags=["practice"])

Outcome = Literal["right_first_time", "right_after_hint", "guessed_right", "taught", "unanswered"]


class YearOption(BaseModel):
    exam_year: int
    questions: int


class SubtopicOption(BaseModel):
    """One JAMB topic (the DB subtopic): what a student picks."""

    subtopic_id: UUID
    name: str
    questions: int
    #: The student's mastery here, 0 to 1, from every answer that counts; null if never met.
    mastery: float | None


class TopicOption(BaseModel):
    """One DB topic, which is JAMB's SECTION: a heading over its topics (`subtopics`)."""

    topic_id: UUID
    name: str
    questions: int
    subtopics: list[SubtopicOption]
    #: The same as `topic_id` and `name`, named for what they are: JAMB's section.
    section_id: UUID | None = None
    section_name: str | None = None


class PracticeOptions(BaseModel):
    subject_id: UUID
    subject_name: str
    #: Newest first.
    years: list[YearOption]
    #: Syllabus order. Only topics and subtopics with questions to ask.
    topics: list[TopicOption]


@router.get(
    "/v1/student/{student_id}/subjects/{subject_id}/practice-options",
    response_model=PracticeOptions,
    summary="What a custom run can be narrowed to",
)
async def practice_options(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    student_id: UUID,
    subject_id: UUID,
) -> PracticeOptions:
    """The years and the syllabus a student may choose from, with what each holds.

    Counted over the same pool a run draws from — deliverable, and not held out — and over the
    subtopics the plan can reach, so a choice made here is one the run can serve. Mastery is
    the reading the plan itself uses: every unaided answer this student has given there.
    """
    await require_student(request, conn, student_id)
    if (
        await conn.execute(text("SELECT 1 FROM students WHERE id = :id"), {"id": student_id})
    ).first() is None:
        raise HTTPException(status_code=404, detail="unknown student")
    subject_name = (
        await conn.execute(text("SELECT name FROM subjects WHERE id = :id"), {"id": subject_id})
    ).scalar()
    if subject_name is None:
        raise HTTPException(status_code=404, detail="unknown subject")

    units, _ = await _subtopics(conn, subject_id)
    rows = await fetch_all(
        conn,
        """
        WITH deliverable AS MATERIALIZED (
          SELECT dq.question_id, dq.primary_skill_id, q.exam_year
          FROM deliverable_questions dq
          JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
          WHERE dq.subject_id = :subject
        )
        SELECT skill.parent_id::text AS subtopic_id, d.exam_year,
               count(DISTINCT d.question_id) AS questions
        FROM deliverable d
        JOIN curriculum_items skill ON skill.id = d.primary_skill_id
        GROUP BY skill.parent_id, d.exam_year
        """,
        pool=EXCLUDED_POOL,
        subject=subject_id,
    )
    reachable = {unit.unit_id for unit in units}
    per_subtopic: dict[str, int] = {}
    per_year: dict[int, int] = {}
    for row in rows:
        if row["subtopic_id"] not in reachable:
            continue
        count = int(row["questions"])
        per_subtopic[row["subtopic_id"]] = per_subtopic.get(row["subtopic_id"], 0) + count
        if row["exam_year"] is not None:
            year = int(row["exam_year"])
            per_year[year] = per_year.get(year, 0) + count

    mastery = {
        standing.unit_id: standing.mastery
        for standing in await _standings_from_history(conn, student_id, subject_id, units)
    }
    topics: list[TopicOption] = []
    for unit in units:
        questions = per_subtopic.get(unit.unit_id, 0)
        if not questions:
            continue
        if not topics or str(topics[-1].topic_id) != unit.topic_id:
            topics.append(
                TopicOption(
                    topic_id=UUID(unit.topic_id),
                    name=unit.topic_name,
                    questions=0,
                    subtopics=[],
                    section_id=UUID(unit.topic_id),
                    section_name=unit.topic_name,
                )
            )
        topic = topics[-1]
        topic.questions += questions
        found = mastery.get(unit.unit_id)
        topic.subtopics.append(
            SubtopicOption(
                subtopic_id=UUID(unit.unit_id),
                name=unit.name,
                questions=questions,
                mastery=round(found, 4) if found is not None else None,
            )
        )

    return PracticeOptions(
        subject_id=subject_id,
        subject_name=str(subject_name),
        years=[
            YearOption(exam_year=year, questions=count)
            for year, count in sorted(per_year.items(), reverse=True)
        ],
        topics=topics,
    )


class ReviewAttempt(BaseModel):
    selected_option_key: str
    is_correct: bool
    confidence: Literal["sure", "unsure", "guessed"] | None
    hint_used: bool
    answered_at: datetime


class ReviewFeedback(BaseModel):
    understood: Literal["got_it", "unsure", "too_hard"]
    matched_working: Literal["yes", "partly", "no"] | None


class ReviewItem(BaseModel):
    #: 1-based, in the order the questions were met.
    position: int
    question_version_id: UUID
    exam_year: int | None
    question_number: str | None
    #: The DB topic, which is JAMB's section. Kept for older clients.
    topic_name: str | None
    #: The DB subtopic, which is JAMB's topic: the name students see.
    subtopic_name: str | None
    passage_title: str | None
    passage_body: str | None
    instructions: str | None
    stem: str
    options: list[Option]
    figures: list[QuestionFigure]
    correct_option_key: str
    attempts: list[ReviewAttempt]
    outcome: Outcome
    solution_steps: list[str]
    hint: str | None
    #: The student's latest word on this question's lesson in this run, if they gave one.
    lesson_feedback: ReviewFeedback | None
    #: JAMB's section, the same as `topic_name`, named for what it is.
    section_name: str | None = None


class RunReview(BaseModel):
    session_id: UUID
    subject_id: UUID
    subject_name: str
    started_at: datetime
    finished: bool
    length: int
    answered: int
    correct_unaided: int
    guessed_right: int
    taught: int
    filters: RunFilters | None
    items: list[ReviewItem]


def outcome_of(attempts: list[dict[str, Any]]) -> Outcome:
    """How one question in a run ended, by the same tests the loop counts with.

    Right first time with no hint is `right_first_time`, unless the student called it a guess.
    Right on a later try is `right_after_hint`. Missed twice and never right is `taught`. One
    miss and nothing after is `unanswered`: the run stopped at the hint.
    """
    first = attempts[0]
    if first["is_correct"] and int(first["hint_count"] or 0) == 0:
        return "guessed_right" if first["confidence"] == "guessed" else "right_first_time"
    if any(attempt["is_correct"] for attempt in attempts):
        return "right_after_hint"
    if len(attempts) >= 2:
        return "taught"
    return "unanswered"


async def review_items(conn: AsyncConnection, session_id: UUID) -> list[ReviewItem]:
    """Every question a session asked, in order: what was chosen, the answer and the working."""
    attempts = await fetch_all(
        conn,
        """
        SELECT a.question_version_id, a.selected_option_key, a.is_correct, a.confidence,
               a.hint_count, a.answered_at_client
        FROM attempts a
        WHERE a.session_id = :session
        ORDER BY a.answered_at_client, a.received_at, a.id
        """,
        session=session_id,
    )
    by_question: dict[UUID, list[dict[str, Any]]] = {}
    for attempt in attempts:
        by_question.setdefault(attempt["question_version_id"], []).append(attempt)

    order = list(by_question)
    details = {
        row["question_version_id"]: row
        for row in await fetch_all(
            conn,
            """
            SELECT v.id AS question_version_id, v.stem, v.instructions, v.solution_steps,
                   v.hints, q.exam_year, q.question_number,
                   pg.title AS passage_title, pg.body AS passage_body,
                   topic.name AS topic_name, sub.name AS subtopic_name,
                   (SELECT o.option_key FROM question_options o
                     WHERE o.question_version_id = v.id AND o.is_correct
                     ORDER BY o.display_order LIMIT 1) AS correct_option_key
            FROM question_versions v
            JOIN questions q ON q.id = v.question_id
            LEFT JOIN passages pg ON pg.id = v.passage_id
            LEFT JOIN question_classifications c
              ON c.question_id = v.question_id AND c.classification_role = 'primary'
            LEFT JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
            LEFT JOIN curriculum_items sub ON sub.id = skill.parent_id
            LEFT JOIN curriculum_items topic ON topic.id = sub.parent_id
            WHERE v.id = ANY(CAST(:versions AS uuid[]))
            """,
            versions=[str(version) for version in order],
        )
    }
    feedback = {
        row["question_version_id"]: row
        for row in await fetch_all(
            conn,
            """
            SELECT DISTINCT ON (f.question_version_id)
                   f.question_version_id, f.understood, f.matched_working
            FROM lesson_feedback f
            WHERE f.session_id = :session
            ORDER BY f.question_version_id, f.created_at DESC, f.id DESC
            """,
            session=session_id,
        )
    }

    items: list[ReviewItem] = []
    for position, version_id in enumerate(order, 1):
        row = details[version_id]
        tries = by_question[version_id]
        said = feedback.get(version_id)
        hints = row["hints"] or []
        items.append(
            ReviewItem(
                position=position,
                question_version_id=version_id,
                exam_year=row["exam_year"],
                question_number=row["question_number"],
                topic_name=row["topic_name"],
                subtopic_name=row["subtopic_name"],
                section_name=row["topic_name"],
                passage_title=row["passage_title"],
                passage_body=row["passage_body"],
                instructions=row["instructions"],
                stem=str(row["stem"]),
                options=await _options(conn, version_id),
                figures=await figures_for(conn, version_id),
                correct_option_key=str(row["correct_option_key"] or ""),
                attempts=[
                    ReviewAttempt(
                        selected_option_key=str(attempt["selected_option_key"]),
                        is_correct=bool(attempt["is_correct"]),
                        confidence=attempt["confidence"],
                        hint_used=int(attempt["hint_count"] or 0) > 0,
                        answered_at=attempt["answered_at_client"],
                    )
                    for attempt in tries
                ],
                outcome=outcome_of(tries),
                solution_steps=[str(step) for step in (row["solution_steps"] or [])],
                hint=str(hints[0]) if hints and hints[0] else None,
                lesson_feedback=(
                    ReviewFeedback(
                        understood=said["understood"], matched_working=said["matched_working"]
                    )
                    if said is not None
                    else None
                ),
            )
        )

    return items


@router.get(
    "/v1/practice/{session_id}/review",
    response_model=RunReview,
    summary="Every question in a run, what was chosen, and the working",
)
async def review_run(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> RunReview:
    await require_session_owner(request, conn, session_id)
    session = await _session(conn, session_id)
    summary = (
        (
            await conn.execute(
                text(RUNS + " AND ss.id = :session"),
                {
                    "student": session["student_id"],
                    "session": session_id,
                    "default_length": DEFAULT_LENGTH,
                },
            )
        )
        .mappings()
        .one()
    )

    items = await review_items(conn, session_id)

    return RunReview(
        session_id=session_id,
        subject_id=summary["subject_id"],
        subject_name=summary["subject_name"],
        started_at=summary["started_at"],
        finished=bool(summary["finished"]),
        length=int(summary["length"]),
        answered=int(summary["answered"]),
        correct_unaided=int(summary["correct_unaided"]),
        guessed_right=int(summary["guessed_right"]),
        taught=int(summary["taught"]),
        filters=session_filters(session),
        items=items,
    )


@router.delete(
    "/v1/practice/{session_id}",
    status_code=204,
    response_class=Response,
    summary="Delete a run from the student's lists",
)
async def delete_run(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> Response:
    """Hide the run. Its answers still count; an unfinished run is ended as it goes.

    Deleting a run already deleted answers the same, so a retried request is harmless.
    """
    await require_session_owner(request, conn, session_id)
    changed = (
        await conn.execute(
            text(
                """
                UPDATE study_sessions
                   SET hidden_at = coalesce(hidden_at, now()),
                       ended_at = coalesce(ended_at, greatest(now(), started_at))
                 WHERE id = :id AND session_type = 'guided'
                RETURNING id
                """
            ),
            {"id": session_id},
        )
    ).first()
    if changed is None:
        raise HTTPException(status_code=404, detail="unknown practice session")
    await conn.commit()
    return Response(status_code=204)


class CheckupAnswers(BaseModel):
    items: list[ReviewItem]


@router.get(
    "/v1/checkup/{session_id}/answers",
    response_model=CheckupAnswers,
    summary="Every question in a check-up, what was chosen, and the working",
)
async def checkup_answers(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)], session_id: UUID
) -> CheckupAnswers:
    await require_session_owner(request, conn, session_id)
    kind = (
        await conn.execute(
            text("SELECT session_type FROM study_sessions WHERE id = :id"), {"id": session_id}
        )
    ).scalar()
    if kind != "checkup":
        raise HTTPException(status_code=404, detail="unknown check-up")
    return CheckupAnswers(items=await review_items(conn, session_id))
