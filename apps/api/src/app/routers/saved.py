"""What a student keeps and what they flag: bookmarks, and problem reports (migration 034).

Bookmarks are by question, so a newer version of a question stays bookmarked; the list shows
the version the student saw. Revising them is a practice run with `bookmarked` set
(routers/practice.py).

A report goes into question_reports with the student as reporter and where they were when they
made it. The reviewer queue counts it against the question, and the admin dashboard lists it
(routers/admin.py). Reporting during a mock reveals nothing: the reply is the same whatever the
answer is.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import require_student
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/student", tags=["student"])

#: Reports one student may send in a day, so a stuck key cannot fill the queue.
REPORTS_PER_DAY = 30
NO_SUCH_QUESTION = "We couldn't find that question."

ReportReason = Literal[
    "wrong_answer", "ambiguous", "typo", "image_missing", "off_syllabus", "other"
]
ReportPlace = Literal["practice", "checkup", "mock", "review", "lesson"]


async def _question_of(conn: AsyncConnection, version_id: UUID) -> UUID:
    question_id: UUID | None = (
        await conn.execute(
            text("SELECT question_id FROM question_versions WHERE id = :v"), {"v": version_id}
        )
    ).scalar_one_or_none()
    if question_id is None:
        raise HTTPException(status_code=404, detail=NO_SUCH_QUESTION)
    return question_id


# ------------------------------------------------------------------ bookmarks


class Bookmark(BaseModel):
    question_id: UUID
    question_version_id: UUID
    subject_id: UUID | None
    subject_name: str | None
    topic_name: str | None
    exam_year: int | None
    stem: str
    created_at: datetime
    #: False when the question can no longer be practised (withdrawn or held out).
    practisable: bool


class BookmarkState(BaseModel):
    bookmarked: bool


@router.get(
    "/{student_id}/bookmarks", response_model=list[Bookmark], summary="Questions you've kept"
)
async def bookmarks(
    request: Request,
    student_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> list[Bookmark]:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        """
        SELECT b.question_id, b.question_version_id, b.created_at, v.stem, q.exam_year,
               subj.id AS subject_id, subj.name AS subject_name, topic.name AS topic_name,
               EXISTS (
                 SELECT 1 FROM deliverable_questions dq
                 JOIN questions dq_q ON dq_q.id = dq.question_id
                   AND dq_q.usage_pool <> 'held_out'
                 WHERE dq.question_id = b.question_id
               ) AS practisable
        FROM question_bookmarks b
        JOIN question_versions v ON v.id = b.question_version_id
        JOIN questions q ON q.id = b.question_id
        LEFT JOIN question_classifications c
          ON c.question_id = b.question_id AND c.classification_role = 'primary'
        LEFT JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        LEFT JOIN curriculum_items sub ON sub.id = skill.parent_id
        LEFT JOIN curriculum_items topic ON topic.id = sub.parent_id
        LEFT JOIN subjects subj ON subj.id = q.subject_id
        WHERE b.student_id = :student
        ORDER BY b.created_at DESC
        """,
        student=student_id,
    )
    return [Bookmark(**row) for row in rows]


@router.get(
    "/{student_id}/bookmarks/{question_version_id}",
    response_model=BookmarkState,
    summary="Is this question bookmarked",
)
async def bookmark_state(
    request: Request,
    student_id: UUID,
    question_version_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> BookmarkState:
    await require_student(request, conn, student_id)
    found = (
        await conn.execute(
            text(
                """
                SELECT 1 FROM question_bookmarks b
                JOIN question_versions v ON v.question_id = b.question_id
                WHERE b.student_id = :student AND v.id = :version
                """
            ),
            {"student": student_id, "version": question_version_id},
        )
    ).first()
    return BookmarkState(bookmarked=found is not None)


@router.put(
    "/{student_id}/bookmarks/{question_version_id}",
    response_model=BookmarkState,
    summary="Bookmark a question",
)
async def add_bookmark(
    request: Request,
    student_id: UUID,
    question_version_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> BookmarkState:
    await require_student(request, conn, student_id)
    question_id = await _question_of(conn, question_version_id)
    await conn.execute(
        text(
            """
            INSERT INTO question_bookmarks (student_id, question_id, question_version_id)
            VALUES (:student, :question, :version)
            ON CONFLICT (student_id, question_id) DO NOTHING
            """
        ),
        {"student": student_id, "question": question_id, "version": question_version_id},
    )
    await conn.commit()
    return BookmarkState(bookmarked=True)


@router.delete(
    "/{student_id}/bookmarks/{question_version_id}",
    response_model=BookmarkState,
    summary="Remove a bookmark",
)
async def remove_bookmark(
    request: Request,
    student_id: UUID,
    question_version_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> BookmarkState:
    await require_student(request, conn, student_id)
    question_id = await _question_of(conn, question_version_id)
    await conn.execute(
        text("DELETE FROM question_bookmarks WHERE student_id = :student AND question_id = :q"),
        {"student": student_id, "q": question_id},
    )
    await conn.commit()
    return BookmarkState(bookmarked=False)


# ------------------------------------------------------------------ reports


class ReportIn(BaseModel):
    question_version_id: UUID
    reason: ReportReason
    detail: str | None = Field(default=None, max_length=1000)
    #: Where the student was when they reported it.
    where: ReportPlace
    #: The practice run, check-up or mock it was in, when there was one.
    session_id: UUID | None = None


class ReportReceived(BaseModel):
    #: "received", or "already" when this student already has an open report on it.
    status: Literal["received", "already"]


@router.post(
    "/{student_id}/reports",
    response_model=ReportReceived,
    status_code=201,
    summary="Report a problem with a question",
)
async def report_question(
    request: Request,
    response: Response,
    student_id: UUID,
    body: ReportIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> ReportReceived:
    await require_student(request, conn, student_id)
    await _question_of(conn, body.question_version_id)
    today = (
        await conn.execute(
            text(
                "SELECT count(*) FROM question_reports WHERE reporter_student_id = :student "
                "AND created_at > now() - interval '1 day'"
            ),
            {"student": student_id},
        )
    ).scalar_one()
    if today >= REPORTS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="You've sent a lot of reports today. Thank you! Try again tomorrow.",
        )
    detail = " ".join((body.detail or "").split()) or None
    open_one: UUID | None = (
        await conn.execute(
            text(
                """
                SELECT r.id FROM question_reports r
                JOIN question_versions mine ON mine.id = :version
                JOIN question_versions v ON v.id = r.question_version_id
                  AND v.question_id = mine.question_id
                WHERE r.reporter_student_id = :student AND r.status IN ('open', 'triaged')
                LIMIT 1
                """
            ),
            {"student": student_id, "version": body.question_version_id},
        )
    ).scalar_one_or_none()
    if open_one is not None:
        # Anything new they typed is added to the report already open.
        if detail:
            await conn.execute(
                text(
                    """
                    UPDATE question_reports
                    SET detail = left(concat_ws(' / ', detail, :detail), 2000)
                    WHERE id = :id
                    """
                ),
                {"id": open_one, "detail": detail},
            )
            await conn.commit()
        response.status_code = 200
        return ReportReceived(status="already")
    context: dict[str, str] = {"where": body.where}
    if body.session_id is not None:
        context["session_id"] = str(body.session_id)
    await conn.execute(
        text(
            """
            INSERT INTO question_reports (question_version_id, reporter_kind,
              reporter_student_id, reason, detail, attempt_context)
            VALUES (:version, 'student', :student, :reason, :detail, CAST(:context AS jsonb))
            """
        ),
        {
            "version": body.question_version_id,
            "student": student_id,
            "reason": body.reason,
            "detail": detail,
            "context": json.dumps(context),
        },
    )
    await conn.commit()
    return ReportReceived(status="received")
