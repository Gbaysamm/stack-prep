"""The admin dashboard's overview and students: everything here needs a signed-in admin.

Overview: totals for a period, a day-by-day series for each of sign-ups, active students,
questions answered, mocks and money taken, which subjects students aim at, how their latest
mocks scored, and what the bank holds. Days are Nigerian days.

Students: a searchable list, and one student's whole picture (their details, goals, scores,
practice, mocks, Premium and payments) with the actions an admin needs: a temporary password,
a role, and suspending or restoring the account.

Staff accounts (reviewers and admins) are left out of the student counts and the list's
default; the list can show them on request.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit, notifications
from app.auth import Staff, admin_session, hash_password
from app.db import connection, fetch_all
from app.routers.billing import Standing, _standing
from app.routers.mock import MockSummary, mock_history
from app.routers.progress import Overview as StudentOverview
from app.routers.progress import build_overview

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])

TZ = "Africa/Lagos"
#: Not staff: the accounts counted as students.
STUDENTS_ONLY = "NOT EXISTS (SELECT 1 FROM account_roles r WHERE r.student_id = s.id)"
Role = Literal["student", "reviewer", "admin"]
ClassLevel = Literal["ss1", "ss2", "ss3", "graduated", "other"]


# ------------------------------------------------------------------ overview


class Totals(BaseModel):
    students: int
    new_students: int
    active_students: int
    active_today: int
    questions_answered: int
    mocks_submitted: int
    premium_now: int
    paid_kobo: int


class DayPoint(BaseModel):
    day: date
    signups: int
    active: int
    answered: int
    mocks: int
    paid_kobo: int


class SubjectCount(BaseModel):
    subject_id: UUID
    name: str
    students: int


class ScoreBand(BaseModel):
    #: The band's lowest percentage: 0 means 0-9, 90 means 90-100.
    low: int
    students: int


class ContentRow(BaseModel):
    subject_id: UUID
    name: str
    questions: int
    open_reports: int


class AdminOverview(BaseModel):
    days: int
    totals: Totals
    series: list[DayPoint]
    subjects: list[SubjectCount]
    #: Each student's latest submitted mock, as a percentage, in bands of ten.
    mock_scores: list[ScoreBand]
    content: list[ContentRow]


@router.get("/overview", response_model=AdminOverview, summary="The dashboard's front page")
async def overview(
    conn: Annotated[AsyncConnection, Depends(connection)],
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> AdminOverview:
    since = {"days": days, "tz": TZ}
    totals = (
        (
            await conn.execute(
                text(
                    f"""
                    WITH period AS (
                      SELECT ((now() AT TIME ZONE :tz)::date - (:days - 1)) AS first_day
                    ),
                    starts AS (
                      SELECT (first_day::timestamp AT TIME ZONE :tz) AS since,
                             (((now() AT TIME ZONE :tz)::date)::timestamp AT TIME ZONE :tz)
                               AS today
                      FROM period
                    )
                    SELECT
                      (SELECT count(*) FROM students s WHERE {STUDENTS_ONLY}) AS students,
                      (SELECT count(*) FROM students s, starts
                        WHERE {STUDENTS_ONLY} AND s.created_at >= starts.since) AS new_students,
                      (SELECT count(DISTINCT a.student_id) FROM attempts a, starts
                        WHERE a.answered_at_client >= starts.since) AS active_students,
                      (SELECT count(DISTINCT a.student_id) FROM attempts a, starts
                        WHERE a.answered_at_client >= starts.today) AS active_today,
                      (SELECT count(*) FROM attempts a, starts
                        WHERE a.answered_at_client >= starts.since) AS questions_answered,
                      (SELECT count(*) FROM mock_exams m, starts
                        WHERE m.submitted_at >= starts.since) AS mocks_submitted,
                      (SELECT count(DISTINCT student_id) FROM premium_periods
                        WHERE starts_at <= now() AND ends_at > now()) AS premium_now,
                      (SELECT coalesce(sum(amount_kobo), 0) FROM payments p, starts
                        WHERE p.status = 'paid' AND p.paid_at >= starts.since) AS paid_kobo
                    """
                ),
                since,
            )
        )
        .mappings()
        .one()
    )
    series = await fetch_all(
        conn,
        f"""
        WITH days AS (
          SELECT generate_series((now() AT TIME ZONE :tz)::date - (:days - 1),
                                 (now() AT TIME ZONE :tz)::date, interval '1 day')::date AS day
        ),
        since AS (SELECT (min(day)::timestamp AT TIME ZONE :tz) AS at FROM days),
        signups AS (
          SELECT (s.created_at AT TIME ZONE :tz)::date AS day, count(*) AS n
          FROM students s, since WHERE {STUDENTS_ONLY} AND s.created_at >= since.at GROUP BY 1
        ),
        answers AS (
          SELECT (a.answered_at_client AT TIME ZONE :tz)::date AS day,
                 count(*) AS n, count(DISTINCT a.student_id) AS people
          FROM attempts a, since WHERE a.answered_at_client >= since.at GROUP BY 1
        ),
        mocks AS (
          SELECT (m.submitted_at AT TIME ZONE :tz)::date AS day, count(*) AS n
          FROM mock_exams m, since WHERE m.submitted_at >= since.at GROUP BY 1
        ),
        money AS (
          SELECT (p.paid_at AT TIME ZONE :tz)::date AS day, sum(p.amount_kobo) AS n
          FROM payments p, since WHERE p.status = 'paid' AND p.paid_at >= since.at GROUP BY 1
        )
        SELECT d.day, coalesce(su.n, 0) AS signups, coalesce(an.people, 0) AS active,
               coalesce(an.n, 0) AS answered, coalesce(mo.n, 0) AS mocks,
               coalesce(me.n, 0) AS paid_kobo
        FROM days d
        LEFT JOIN signups su ON su.day = d.day
        LEFT JOIN answers an ON an.day = d.day
        LEFT JOIN mocks mo ON mo.day = d.day
        LEFT JOIN money me ON me.day = d.day
        ORDER BY d.day
        """,
        **since,
    )
    subjects = await fetch_all(
        conn,
        f"""
        SELECT sub.id AS subject_id, sub.name, count(DISTINCT g.student_id) AS students
        FROM student_exam_goals g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN students s ON s.id = g.student_id
        WHERE g.status = 'active' AND {STUDENTS_ONLY}
        GROUP BY sub.id, sub.name
        ORDER BY students DESC, sub.name
        """,
    )
    bands = await fetch_all(
        conn,
        """
        WITH latest AS (
          SELECT DISTINCT ON (student_id) id FROM mock_exams
          WHERE submitted_at IS NOT NULL
          ORDER BY student_id, submitted_at DESC
        ),
        marked AS (
          SELECT i.mock_exam_id,
                 100.0 * count(*) FILTER (WHERE o.is_correct) / count(*) AS percent
          FROM mock_exam_items i
          JOIN latest ON latest.id = i.mock_exam_id
          LEFT JOIN question_options o
            ON o.question_version_id = i.question_version_id
           AND o.option_key = i.selected_option_key
          GROUP BY i.mock_exam_id
        )
        SELECT least(floor(percent / 10) * 10, 90)::int AS low, count(*) AS students
        FROM marked GROUP BY 1
        """,
    )
    by_band = {int(row["low"]): int(row["students"]) for row in bands}
    content = await fetch_all(
        conn,
        """
        SELECT sub.id AS subject_id, sub.name,
               (SELECT count(*) FROM deliverable_questions d WHERE d.subject_id = sub.id)
                 AS questions,
               (SELECT count(*) FROM question_reports r
                  JOIN question_versions v ON v.id = r.question_version_id
                 WHERE v.subject_id = sub.id AND r.status IN ('open', 'triaged'))
                 AS open_reports
        FROM subjects sub
        WHERE EXISTS (SELECT 1 FROM deliverable_questions d WHERE d.subject_id = sub.id)
        ORDER BY sub.name
        """,
    )
    return AdminOverview(
        days=days,
        totals=Totals.model_validate(dict(totals)),
        series=[DayPoint(**row) for row in series],
        subjects=[SubjectCount(**row) for row in subjects],
        mock_scores=[ScoreBand(low=low, students=by_band.get(low, 0)) for low in range(0, 100, 10)],
        content=[ContentRow(**row) for row in content],
    )


# ------------------------------------------------------------------ students


class StudentRow(BaseModel):
    student_id: UUID
    display_name: str
    login: str | None
    school_name: str | None
    state: str | None
    class_level: str | None
    status: str
    role: Role
    created_at: datetime
    last_active_at: datetime | None
    questions_answered: int
    premium: bool


class StudentPage(BaseModel):
    total: int
    students: list[StudentRow]


Sort = Literal["newest", "active", "answered", "name"]
ORDER = {
    "newest": "s.created_at DESC",
    "active": "last_active_at DESC NULLS LAST",
    "answered": "questions_answered DESC, s.created_at DESC",
    "name": "lower(s.display_name)",
}


@router.get("/students", response_model=StudentPage, summary="Find students")
async def students(
    conn: Annotated[AsyncConnection, Depends(connection)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    class_level: ClassLevel | None = None,
    state: Annotated[str | None, Query(max_length=60)] = None,
    premium: bool | None = None,
    active_days: Annotated[int | None, Query(ge=1, le=365)] = None,
    staff: bool = False,
    sort: Sort = "newest",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> StudentPage:
    conditions = ["TRUE"] if staff else [STUDENTS_ONLY]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if q and q.strip():
        conditions.append(
            "(s.display_name ILIKE :q OR s.email ILIKE :q OR s.phone ILIKE :q"
            " OR s.school_name ILIKE :q OR s.id::text = :exact)"
        )
        params["q"] = f"%{q.strip()}%"
        params["exact"] = q.strip()
    if class_level:
        conditions.append("s.class_level = :class_level")
        params["class_level"] = class_level
    if state:
        conditions.append("s.state ILIKE :state")
        params["state"] = state.strip()
    premium_now = (
        "EXISTS (SELECT 1 FROM premium_periods pp WHERE pp.student_id = s.id"
        " AND pp.starts_at <= now() AND pp.ends_at > now())"
    )
    if premium is not None:
        conditions.append(premium_now if premium else f"NOT {premium_now}")
    if active_days:
        conditions.append(
            "EXISTS (SELECT 1 FROM attempts a WHERE a.student_id = s.id"
            " AND a.answered_at_client >= now() - make_interval(days => :active_days))"
        )
        params["active_days"] = active_days
    where = " AND ".join(conditions)
    total = (
        await conn.execute(text(f"SELECT count(*) FROM students s WHERE {where}"), params)
    ).scalar_one()
    rows = await fetch_all(
        conn,
        f"""
        SELECT s.id AS student_id, s.display_name, coalesce(s.email, s.phone) AS login,
               s.school_name, s.state, s.class_level, s.status,
               coalesce(r.role, 'student') AS role, s.created_at,
               act.last_active_at, coalesce(act.answered, 0) AS questions_answered,
               {premium_now} AS premium
        FROM students s
        LEFT JOIN account_roles r ON r.student_id = s.id
        LEFT JOIN LATERAL (
          SELECT max(a.answered_at_client) AS last_active_at, count(*) AS answered
          FROM attempts a WHERE a.student_id = s.id
        ) act ON TRUE
        WHERE {where}
        ORDER BY {ORDER[sort]}
        LIMIT :limit OFFSET :offset
        """,
        **params,
    )
    return StudentPage(total=int(total), students=[StudentRow(**row) for row in rows])


class Account(BaseModel):
    student_id: UUID
    display_name: str
    email: str | None
    phone: str | None
    has_password: bool
    status: str
    role: Role
    created_at: datetime
    school_name: str | None
    state: str | None
    class_level: str | None
    target_institution: str | None
    target_course: str | None
    target_aggregate: int | None


class Activity(BaseModel):
    last_active_at: datetime | None
    questions_answered: int
    days_active_30: int
    #: Questions answered on each of the last 30 days, oldest first.
    last_30_days: list[int]
    reports_sent: int
    bookmarks: int


class StudentDetail(BaseModel):
    account: Account
    activity: Activity
    progress: StudentOverview
    mocks: list[MockSummary]
    premium: Standing


async def _account(conn: AsyncConnection, student_id: UUID) -> Account:
    rows = await fetch_all(
        conn,
        """
        SELECT s.id AS student_id, s.display_name, s.email, s.phone, s.status, s.created_at,
               s.school_name, s.state, s.class_level, s.target_institution, s.target_course,
               s.target_aggregate, coalesce(r.role, 'student') AS role,
               EXISTS (SELECT 1 FROM student_credentials c WHERE c.student_id = s.id)
                 AS has_password
        FROM students s LEFT JOIN account_roles r ON r.student_id = s.id
        WHERE s.id = :s
        """,
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="We couldn't find that student.")
    return Account(**rows[0])


@router.get("/students/{student_id}", response_model=StudentDetail, summary="One student")
async def student(
    student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> StudentDetail:
    account = await _account(conn, student_id)
    activity = (
        (
            await conn.execute(
                text(
                    """
                    SELECT max(answered_at_client) AS last_active_at,
                           count(*) AS questions_answered,
                           count(DISTINCT (answered_at_client AT TIME ZONE :tz)::date)
                             FILTER (WHERE answered_at_client >= now() - interval '30 days')
                             AS days_active_30,
                           (SELECT count(*) FROM question_reports
                             WHERE reporter_student_id = :s) AS reports_sent,
                           (SELECT count(*) FROM question_bookmarks
                             WHERE student_id = :s) AS bookmarks
                    FROM attempts WHERE student_id = :s
                    """
                ),
                {"s": student_id, "tz": TZ},
            )
        )
        .mappings()
        .one()
    )
    daily = await fetch_all(
        conn,
        """
        WITH days AS (
          SELECT generate_series((now() AT TIME ZONE :tz)::date - 29,
                                 (now() AT TIME ZONE :tz)::date, interval '1 day')::date AS day
        )
        SELECT d.day, count(a.id) AS n
        FROM days d
        LEFT JOIN attempts a ON a.student_id = :s
          AND (a.answered_at_client AT TIME ZONE :tz)::date = d.day
        GROUP BY d.day ORDER BY d.day
        """,
        s=student_id,
        tz=TZ,
    )
    return StudentDetail(
        account=account,
        activity=Activity(
            last_active_at=activity["last_active_at"],
            questions_answered=int(activity["questions_answered"]),
            days_active_30=int(activity["days_active_30"]),
            last_30_days=[int(row["n"]) for row in daily],
            reports_sent=int(activity["reports_sent"]),
            bookmarks=int(activity["bookmarks"]),
        ),
        progress=await build_overview(conn, student_id),
        mocks=(await mock_history(conn, student_id))[:20],
        premium=await _standing(conn, student_id),
    )


# ------------------------------------------------------------------ actions


class TemporaryPassword(BaseModel):
    #: Shown once to the admin, to pass on; the student changes it in Account settings.
    password: str


#: No 0/O or 1/l/I, so it can be read out over the phone.
_READABLE = "abcdefghjkmnpqrstuvwxyz23456789"


@router.post(
    "/students/{student_id}/password",
    response_model=TemporaryPassword,
    summary="Give a student a temporary password",
)
async def temporary_password(
    student_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> TemporaryPassword:
    """For a student who can't reset it themselves (no email). Signs out all their devices."""
    account = await _account(conn, student_id)
    if not (account.email or account.phone):
        raise HTTPException(
            status_code=409, detail="This account has no email or phone to sign in with."
        )
    if student_id == staff.student_id:
        raise HTTPException(status_code=409, detail="Change your own password in Account settings.")
    password = "-".join("".join(secrets.choice(_READABLE) for _ in range(4)) for _ in range(3))
    hashed = await hash_password(password)
    await conn.execute(
        text(
            """
            INSERT INTO student_credentials (student_id, password_hash)
            VALUES (:s, :hash)
            ON CONFLICT (student_id) DO UPDATE
              SET password_hash = EXCLUDED.password_hash, updated_at = now()
            """
        ),
        {"s": student_id, "hash": hashed},
    )
    await conn.execute(text("DELETE FROM auth_sessions WHERE student_id = :s"), {"s": student_id})
    await audit.record(
        conn,
        staff,
        "student.password",
        f"Set a temporary password for {account.display_name}",
        target_kind="student",
        target_id=student_id,
    )
    await conn.commit()
    return TemporaryPassword(password=password)


class StatusChange(BaseModel):
    status: Literal["active", "suspended"]


@router.post("/students/{student_id}/status", response_model=Account, summary="Suspend or restore")
async def change_status(
    student_id: UUID,
    body: StatusChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> Account:
    """A suspended account can't sign in, and its sessions end at once. Nothing is deleted."""
    await _account(conn, student_id)
    if student_id == staff.student_id:
        raise HTTPException(status_code=409, detail="You can't suspend your own account.")
    await conn.execute(
        text("UPDATE students SET status = :st, updated_at = now() WHERE id = :s"),
        {"st": body.status, "s": student_id},
    )
    if body.status == "suspended":
        await conn.execute(
            text("DELETE FROM auth_sessions WHERE student_id = :s"), {"s": student_id}
        )
    suspended = body.status == "suspended"
    await notifications.notify(
        conn,
        student_id,
        kind="account_suspended" if suspended else "account_restored",
        category="system",
        title="Your Stack Prep account is paused" if suspended else "Your account is open again",
        body=(
            "You can't sign in for now. If you think this is a mistake, write to us through "
            "the Contact page on our website."
            if suspended
            else "You can sign in again and carry on where you stopped. Everything is as you "
            "left it."
        ),
        link_url=None if suspended else "/home",
        key=f"account-{body.status}-{secrets.token_hex(6)}",
    )
    await audit.record(
        conn,
        staff,
        f"student.{'suspend' if body.status == 'suspended' else 'restore'}",
        f"{'Suspended' if body.status == 'suspended' else 'Restored'} "
        f"{await audit.name_of(conn, student_id)}",
        target_kind="student",
        target_id=student_id,
    )
    await conn.commit()
    return await _account(conn, student_id)


class RoleChange(BaseModel):
    role: Role
    note: str | None = Field(default=None, max_length=200)


@router.post("/students/{student_id}/role", response_model=Account, summary="Change a role")
async def change_role(
    student_id: UUID,
    body: RoleChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> Account:
    await _account(conn, student_id)
    if student_id == staff.student_id and body.role != "admin":
        raise HTTPException(status_code=409, detail="You can't take away your own admin role.")
    if body.role == "student":
        await conn.execute(
            text("DELETE FROM account_roles WHERE student_id = :s"), {"s": student_id}
        )
    else:
        await conn.execute(
            text(
                """
                INSERT INTO account_roles (student_id, role, granted_by)
                VALUES (:s, :role, :by)
                ON CONFLICT (student_id) DO UPDATE
                  SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by,
                      granted_at = now()
                """
            ),
            {"s": student_id, "role": body.role, "by": staff.student_id},
        )
    await audit.record(
        conn,
        staff,
        "student.role",
        f"Made {await audit.name_of(conn, student_id)} a {body.role}",
        target_kind="student",
        target_id=student_id,
    )
    await conn.commit()
    return await _account(conn, student_id)
