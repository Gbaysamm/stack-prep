"""The admin dashboard's API: everything here needs a signed-in admin (migration 031).

Reports: problems with questions that students and reviewers have flagged, newest first, and
closing them as fixed or as not a problem.

Staff: who is a reviewer or an admin. A role is granted to an account that already exists (the
person signs up as anyone does, then an admin promotes them by their login), and an admin cannot
take away their own admin role, so the dashboard can never be left with nobody to run it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, admin_session
from app.db import connection, fetch_all
from app.routers.accounts import normalise_login

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])

StaffRole = Literal["reviewer", "admin"]


class StaffMember(BaseModel):
    student_id: UUID
    display_name: str
    login: str | None
    role: StaffRole
    granted_at: datetime
    granted_by_name: str | None


class Grant(BaseModel):
    #: The email address or phone number the person signs in with.
    login: str
    role: StaffRole


STAFF_SQL = """
    SELECT r.student_id, s.display_name, coalesce(s.email, s.phone) AS login, r.role,
           r.granted_at, g.display_name AS granted_by_name
    FROM account_roles r
    JOIN students s ON s.id = r.student_id
    LEFT JOIN students g ON g.id = r.granted_by
"""


@router.get("/staff", response_model=list[StaffMember], summary="Reviewers and admins")
async def staff(conn: Annotated[AsyncConnection, Depends(connection)]) -> list[StaffMember]:
    rows = await fetch_all(conn, STAFF_SQL + " ORDER BY r.role, s.display_name")
    return [StaffMember(**row) for row in rows]


@router.post("/staff", response_model=StaffMember, summary="Make an account a reviewer or admin")
async def grant(
    body: Grant,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> StaffMember:
    login = normalise_login(body.login)
    if login is None:
        raise HTTPException(
            status_code=422, detail="Enter an email address or a Nigerian phone number."
        )
    kind, value = login
    student_id = (
        await conn.execute(
            text(f"SELECT id FROM students WHERE {kind} = :value AND status = 'active'"),
            {"value": value},
        )
    ).scalar_one_or_none()
    if student_id is None:
        raise HTTPException(
            status_code=404, detail="No account signs in with that. Ask them to sign up first."
        )
    if student_id == me.student_id and body.role != "admin":
        raise HTTPException(status_code=409, detail="You can't remove your own admin role.")
    await conn.execute(
        text(
            """
            INSERT INTO account_roles (student_id, role, granted_by)
            VALUES (:id, :role, :by)
            ON CONFLICT (student_id) DO UPDATE
              SET role = excluded.role, granted_by = excluded.granted_by, granted_at = now()
            """
        ),
        {"id": student_id, "role": body.role, "by": me.student_id},
    )
    await audit.record(
        conn, me, "staff.grant",
        f"Made {await audit.name_of(conn, student_id)} "
        f"{'an admin' if body.role == 'admin' else 'a reviewer'}",
        target_kind="student", target_id=student_id,
    )
    await conn.commit()
    rows = await fetch_all(conn, STAFF_SQL + " WHERE r.student_id = :id", id=student_id)
    return StaffMember(**rows[0])


@router.delete("/staff/{student_id}", status_code=204, summary="Take away a staff role")
async def revoke(
    student_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> None:
    if student_id == me.student_id:
        raise HTTPException(status_code=409, detail="You can't remove your own admin role.")
    await conn.execute(text("DELETE FROM account_roles WHERE student_id = :id"), {"id": student_id})
    await audit.record(
        conn, me, "staff.revoke",
        f"Took away {await audit.name_of(conn, student_id)}'s staff role",
        target_kind="student", target_id=student_id,
    )
    await conn.commit()


# ------------------------------------------------------------------ question reports


class QuestionReport(BaseModel):
    id: UUID
    status: Literal["open", "triaged", "fixed", "rejected"]
    reason: str
    detail: str | None
    #: practice, checkup, mock, review or lesson; None for a reviewer's or the system's report.
    where: str | None
    created_at: datetime
    reporter_kind: str
    reporter_name: str | None
    reporter_login: str | None
    reporter_student_id: UUID | None
    question_id: UUID
    question_version_id: UUID
    stem: str
    subject_name: str | None
    exam_year: int | None
    #: Other open reports on the same question, from anyone.
    others_open: int
    resolved_at: datetime | None
    resolved_by_name: str | None
    resolution_note: str | None


class ReportList(BaseModel):
    open: int
    reports: list[QuestionReport]


class ReportClose(BaseModel):
    outcome: Literal["fixed", "rejected"]
    note: str = Field(min_length=1, max_length=1000)


REPORTS_SQL = """
    SELECT r.id, r.status, r.reason, r.detail, r.attempt_context ->> 'where' AS where,
           r.created_at, r.reporter_kind, r.reporter_student_id,
           coalesce(st.display_name, rv.display_name) AS reporter_name,
           coalesce(st.email, st.phone) AS reporter_login,
           v.question_id, r.question_version_id, v.stem, subj.name AS subject_name,
           q.exam_year, r.resolved_at, done.display_name AS resolved_by_name,
           r.resolution_note,
           (SELECT count(*) FROM question_reports o
            JOIN question_versions ov ON ov.id = o.question_version_id
            WHERE ov.question_id = v.question_id AND o.id <> r.id
              AND o.status IN ('open', 'triaged')) AS others_open
    FROM question_reports r
    JOIN question_versions v ON v.id = r.question_version_id
    JOIN questions q ON q.id = v.question_id
    LEFT JOIN subjects subj ON subj.id = q.subject_id
    LEFT JOIN students st ON st.id = r.reporter_student_id
    LEFT JOIN academic_reviewers rv ON rv.id = r.reporter_reviewer_id
    LEFT JOIN academic_reviewers done ON done.id = r.resolved_by
"""


@router.get("/reports", response_model=ReportList, summary="Problems reported with questions")
async def reports(
    conn: Annotated[AsyncConnection, Depends(connection)],
    status: Annotated[Literal["open", "closed", "all"], Query()] = "open",
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> ReportList:
    where = {
        "open": "WHERE r.status IN ('open', 'triaged')",
        "closed": "WHERE r.status IN ('fixed', 'rejected')",
        "all": "",
    }[status]
    rows = await fetch_all(
        conn, REPORTS_SQL + f" {where} ORDER BY r.created_at DESC LIMIT :limit", limit=limit
    )
    open_count = (
        await conn.execute(
            text("SELECT count(*) FROM question_reports WHERE status IN ('open', 'triaged')")
        )
    ).scalar_one()
    return ReportList(open=open_count, reports=[QuestionReport(**row) for row in rows])


@router.post("/reports/{report_id}/close", response_model=QuestionReport, summary="Close a report")
async def close_report(
    report_id: UUID,
    body: ReportClose,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> QuestionReport:
    note = " ".join(body.note.split())
    if not note:
        raise HTTPException(status_code=422, detail="Add a short note on what was done.")
    result = await conn.execute(
        text(
            """
            UPDATE question_reports
            SET status = :outcome, resolved_by = :reviewer, resolved_at = now(),
                resolution_note = :note
            WHERE id = :id AND status IN ('open', 'triaged')
            """
        ),
        {"id": report_id, "outcome": body.outcome, "reviewer": me.reviewer_id, "note": note},
    )
    if result.rowcount:
        await audit.record(
            conn, me, "report.close",
            f"Closed a question report as "
            f"{'fixed' if body.outcome == 'fixed' else 'not a problem'}: {note}",
            target_kind="report", target_id=report_id,
        )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="That report is already closed.")
    rows = await fetch_all(conn, REPORTS_SQL + " WHERE r.id = :id", id=report_id)
    return QuestionReport(**rows[0])
