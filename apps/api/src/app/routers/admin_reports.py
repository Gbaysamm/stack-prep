"""The admin dashboard's front page and its reports: Engagement, Feature usage, AI usage and
Revenue. Everything here needs a signed-in admin. Days are Nigerian days.

Staff accounts are left out of student counts.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import app_settings
from app.auth import admin_session
from app.db import connection, fetch_all
from app.routers.admin_system import health

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])

TZ = "Africa/Lagos"
STUDENTS_ONLY = "NOT EXISTS (SELECT 1 FROM account_roles r WHERE r.student_id = s.id)"
TODAY = f"((now() AT TIME ZONE '{TZ}')::date::timestamp AT TIME ZONE '{TZ}')"
MONTH = f"(date_trunc('month', now() AT TIME ZONE '{TZ}') AT TIME ZONE '{TZ}')"


async def _one(conn: AsyncConnection, sql: str, **params: Any) -> dict[str, Any]:
    row = (await conn.execute(text(sql), params)).mappings().one()
    return {str(key): value for key, value in row.items()}


# ------------------------------------------------------------------ home


class Tile(BaseModel):
    key: str
    label: str
    value: int
    #: A second, smaller figure with its words, e.g. 3 "joined today".
    sub_value: int | None = None
    sub_label: str | None = None
    #: Where "View" goes in the dashboard.
    link: str | None = None
    money: bool = False


class SubjectGlance(BaseModel):
    subject_id: UUID
    name: str
    questions: int
    topics: int
    students: int


class Person(BaseModel):
    student_id: UUID
    display_name: str
    login: str | None
    at: datetime
    detail: str | None = None


class Waiting(BaseModel):
    kind: str
    id: str
    title: str
    detail: str
    at: datetime
    link: str


class Home(BaseModel):
    tiles: list[Tile]
    subjects: list[SubjectGlance]
    new_students: list[Person]
    payments: list[Person]
    waiting: list[Waiting]
    #: Names of the system checks that aren't working, from System health.
    problems: list[str]


@router.get("/home", response_model=Home, summary="The dashboard's front page")
async def home(conn: Annotated[AsyncConnection, Depends(connection)]) -> Home:
    t = await _one(
        conn,
        f"""
        SELECT
          (SELECT count(*) FROM students s WHERE {STUDENTS_ONLY}) AS students,
          (SELECT count(*) FROM students s WHERE {STUDENTS_ONLY} AND created_at >= {TODAY})
            AS students_today,
          (SELECT count(DISTINCT student_id) FROM attempts WHERE answered_at_client >= {TODAY})
            AS active_today,
          (SELECT count(DISTINCT student_id) FROM attempts
             WHERE answered_at_client >= now() - interval '7 days') AS active_week,
          (SELECT count(*) FROM deliverable_questions) AS questions,
          (SELECT count(DISTINCT ci.parent_id) FROM deliverable_questions q
             JOIN curriculum_items ci ON ci.id = q.primary_skill_id) AS topics,
          (SELECT count(*) FROM attempts) AS answers,
          (SELECT count(*) FROM attempts WHERE answered_at_client >= {TODAY}) AS answers_today,
          (SELECT count(*) FROM mock_exams WHERE submitted_at IS NOT NULL) AS mocks,
          (SELECT count(*) FROM mock_exams WHERE submitted_at >= {TODAY}) AS mocks_today,
          (SELECT count(*) FROM study_sessions WHERE session_type = 'checkup'
             AND ended_at IS NOT NULL) AS checkups,
          (SELECT count(*) FROM study_sessions WHERE session_type = 'checkup'
             AND ended_at >= {TODAY}) AS checkups_today,
          (SELECT coalesce(sum(amount_kobo), 0) FROM payments WHERE status = 'paid'
             AND paid_at >= {MONTH}) AS paid_month,
          (SELECT coalesce(sum(amount_kobo), 0) FROM payments WHERE status = 'paid'
             AND paid_at >= {TODAY}) AS paid_today,
          (SELECT count(DISTINCT pp.student_id) FROM premium_periods pp
             JOIN premium_plans p ON p.id = pp.plan_id AND p.kind = 'paid'
             WHERE pp.starts_at <= now() AND pp.ends_at > now()) AS on_plan,
          (SELECT count(*) FROM question_reports WHERE status IN ('open', 'triaged'))
            AS reports_open,
          (SELECT count(*) FROM support_threads WHERE status = 'open') AS support_open
        """,
    )
    tiles = [
        Tile(key="students", label="Students", value=t["students"], sub_value=t["students_today"],
             sub_label="joined today", link="/students"),
        Tile(key="active", label="Active this week", value=t["active_week"],
             sub_value=t["active_today"], sub_label="active today", link="/engagement"),
        Tile(key="questions", label="Questions live", value=t["questions"],
             sub_value=t["topics"], sub_label="topics covered", link="/content"),
        Tile(key="answers", label="Questions answered", value=t["answers"],
             sub_value=t["answers_today"], sub_label="today", link="/features"),
        Tile(key="mocks", label="Mocks sat", value=t["mocks"], sub_value=t["mocks_today"],
             sub_label="today", link="/mocks"),
        Tile(key="checkups", label="Check-ups finished", value=t["checkups"],
             sub_value=t["checkups_today"], sub_label="today", link="/checkups"),
        Tile(key="revenue", label="Taken this month", value=t["paid_month"],
             sub_value=t["paid_today"], sub_label="today", link="/revenue", money=True),
        Tile(key="on_plan", label="On a plan now", value=t["on_plan"], link="/premium"),
        Tile(key="reports", label="Open question reports", value=t["reports_open"],
             link="/reports"),
        Tile(key="support", label="Support waiting", value=t["support_open"], link=None),
    ]
    subjects = await fetch_all(
        conn,
        f"""
        SELECT sub.id AS subject_id, sub.name,
               count(DISTINCT q.question_version_id) AS questions,
               count(DISTINCT ci.parent_id) AS topics,
               (SELECT count(DISTINCT g.student_id) FROM student_exam_goals g
                  JOIN students s ON s.id = g.student_id
                 WHERE g.subject_id = sub.id AND g.status = 'active' AND {STUDENTS_ONLY})
                 AS students
        FROM subjects sub JOIN deliverable_questions q ON q.subject_id = sub.id
        LEFT JOIN curriculum_items ci ON ci.id = q.primary_skill_id
        GROUP BY sub.id, sub.name
        ORDER BY questions DESC
        """,
    )
    new_students = await fetch_all(
        conn,
        f"""
        SELECT s.id AS student_id, s.display_name, coalesce(s.email, s.phone) AS login,
               s.created_at AS at, s.school_name AS detail
        FROM students s WHERE {STUDENTS_ONLY}
        ORDER BY s.created_at DESC LIMIT 6
        """,
    )
    payments = await fetch_all(
        conn,
        """
        SELECT s.id AS student_id, s.display_name, coalesce(s.email, s.phone) AS login,
               p.paid_at AS at,
               p.plan_name || ', ' || p.length_label || ' · ₦'
                 || to_char(p.amount_kobo / 100.0, 'FM999,999,990') AS detail
        FROM payments p JOIN students s ON s.id = p.student_id
        WHERE p.status = 'paid'
        ORDER BY p.paid_at DESC LIMIT 6
        """,
    )
    reports = await fetch_all(
        conn,
        """
        SELECT r.id::text AS id, v.stem AS title, r.reason AS detail,
               r.created_at AS at
        FROM question_reports r JOIN question_versions v ON v.id = r.question_version_id
        WHERE r.status IN ('open', 'triaged')
        ORDER BY r.created_at DESC LIMIT 4
        """,
    )
    support = await fetch_all(
        conn,
        """
        SELECT t.id::text AS id, t.subject AS title,
               coalesce(s.display_name, t.name, t.email) AS detail, t.updated_at AS at
        FROM support_threads t LEFT JOIN students s ON s.id = t.student_id
        WHERE t.status = 'open'
        ORDER BY t.updated_at DESC LIMIT 4
        """,
    )
    waiting = [
        Waiting(kind="support", id=row["id"], title=row["title"], detail=row["detail"] or "",
                at=row["at"], link=f"/support/{row['id']}")
        for row in support
    ] + [
        Waiting(kind="report", id=row["id"], title=row["title"],
                detail=str(row["detail"]).replace("_", " "), at=row["at"], link="/reports")
        for row in reports
    ]
    checks = await health(conn)
    return Home(
        tiles=tiles,
        subjects=[SubjectGlance(**row) for row in subjects],
        new_students=[Person(**row) for row in new_students],
        payments=[Person(**row) for row in payments],
        waiting=sorted(waiting, key=lambda item: item.at, reverse=True),
        problems=[check.name for check in checks.checks if check.state == "problem"],
    )


# ------------------------------------------------------------------ engagement


class DayCount(BaseModel):
    day: date
    value: int


class Cohort(BaseModel):
    week: date
    students: int
    #: Percent of the cohort active in each week since they joined: week 0 first.
    active: list[int | None]


class Band(BaseModel):
    label: str
    students: int


class Engagement(BaseModel):
    days: int
    daily_active: list[DayCount]
    active_today: int
    active_7: int
    active_30: int
    #: Daily active over monthly active, as a percentage: how often people come back.
    stickiness: int
    minutes_per_active_day: float
    cohorts: list[Cohort]
    days_active_30: list[Band]


@router.get("/engagement", response_model=Engagement, summary="How often students come back")
async def engagement(
    conn: Annotated[AsyncConnection, Depends(connection)],
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> Engagement:
    series = await fetch_all(
        conn,
        f"""
        WITH d AS (
          SELECT generate_series((now() AT TIME ZONE '{TZ}')::date - (:days - 1),
                                 (now() AT TIME ZONE '{TZ}')::date, interval '1 day')::date AS day
        )
        SELECT d.day, count(DISTINCT a.student_id) AS value
        FROM d LEFT JOIN attempts a
          ON (a.answered_at_client AT TIME ZONE '{TZ}')::date = d.day
        GROUP BY d.day ORDER BY d.day
        """,
        days=days,
    )
    totals = await _one(
        conn,
        f"""
        SELECT
          (SELECT count(DISTINCT student_id) FROM attempts WHERE answered_at_client >= {TODAY})
            AS today,
          (SELECT count(DISTINCT student_id) FROM attempts
             WHERE answered_at_client >= now() - interval '7 days') AS week,
          (SELECT count(DISTINCT student_id) FROM attempts
             WHERE answered_at_client >= now() - interval '30 days') AS month,
          (SELECT coalesce(sum(response_ms), 0) FROM attempts
             WHERE answered_at_client >= now() - interval '30 days') AS ms,
          (SELECT count(DISTINCT (student_id, (answered_at_client AT TIME ZONE '{TZ}')::date))
             FROM attempts WHERE answered_at_client >= now() - interval '30 days') AS active_days
        """,
    )
    daily_mean = sum(row["value"] for row in series[-30:]) / max(1, min(30, len(series)))
    cohort_rows = await fetch_all(
        conn,
        f"""
        WITH joined AS (
          SELECT s.id, date_trunc('week', s.created_at AT TIME ZONE '{TZ}')::date AS week
          FROM students s
          WHERE {STUDENTS_ONLY} AND s.created_at >= now() - interval '8 weeks'
        ),
        seen AS (
          SELECT DISTINCT j.id, j.week,
                 ((date_trunc('week', a.answered_at_client AT TIME ZONE '{TZ}')::date - j.week)
                   / 7) AS n
          FROM joined j JOIN attempts a ON a.student_id = j.id
        )
        SELECT j.week, count(DISTINCT j.id) AS students,
               array_agg(DISTINCT s.n || ':' || s.id) FILTER (WHERE s.n IS NOT NULL) AS seen
        FROM joined j LEFT JOIN seen s ON s.id = j.id
        GROUP BY j.week ORDER BY j.week
        """,
    )
    this_week = (
        await conn.execute(text(f"SELECT date_trunc('week', now() AT TIME ZONE '{TZ}')::date"))
    ).scalar_one()
    cohorts: list[Cohort] = []
    for row in cohort_rows:
        weeks_since = (this_week - row["week"]).days // 7
        per_week: dict[int, set[str]] = {}
        for item in row["seen"] or []:
            n, student = item.split(":", 1)
            per_week.setdefault(int(n), set()).add(student)
        size = int(row["students"])
        cohorts.append(Cohort(
            week=row["week"],
            students=size,
            active=[
                round(100 * len(per_week.get(n, set())) / size) if n <= weeks_since else None
                for n in range(8)
            ],
        ))
    bands = await fetch_all(
        conn,
        f"""
        WITH d AS (
          SELECT a.student_id,
                 count(DISTINCT (a.answered_at_client AT TIME ZONE '{TZ}')::date) AS n
          FROM attempts a WHERE a.answered_at_client >= now() - interval '30 days'
          GROUP BY a.student_id
        )
        SELECT CASE WHEN n = 1 THEN '1 day' WHEN n <= 3 THEN '2 to 3 days'
                    WHEN n <= 7 THEN '4 to 7 days' WHEN n <= 14 THEN '8 to 14 days'
                    ELSE '15+ days' END AS label,
               count(*) AS students, min(n) AS sort
        FROM d GROUP BY 1 ORDER BY sort
        """,
    )
    return Engagement(
        days=days,
        daily_active=[DayCount(**row) for row in series],
        active_today=int(totals["today"]),
        active_7=int(totals["week"]),
        active_30=int(totals["month"]),
        stickiness=round(100 * daily_mean / totals["month"]) if totals["month"] else 0,
        minutes_per_active_day=round(
            int(totals["ms"]) / 60000 / max(1, int(totals["active_days"])), 1
        ),
        cohorts=cohorts,
        days_active_30=[Band(label=row["label"], students=row["students"]) for row in bands],
    )


# ------------------------------------------------------------------ feature usage


class Feature(BaseModel):
    key: str
    label: str
    total: int
    previous: int
    students: int
    series: list[DayCount]


FEATURES: tuple[tuple[str, str, str, str], ...] = (
    # key, label, table and time column, condition
    ("practice_questions", "Practice questions answered", "attempts:answered_at_client",
     "context = 'guided'"),
    ("practice_runs", "Practice runs started", "study_sessions:started_at",
     "session_type = 'guided'"),
    ("custom_runs", "Custom runs (topics or years)", "study_sessions:started_at",
     "session_type = 'guided' AND practice_filters IS NOT NULL"
     " AND NOT coalesce((practice_filters ->> 'bookmarked')::boolean, false)"),
    ("bookmark_runs", "Bookmark revision runs", "study_sessions:started_at",
     "session_type = 'guided' AND coalesce((practice_filters ->> 'bookmarked')::boolean, false)"),
    ("checkups", "Check-ups finished", "study_sessions:ended_at", "session_type = 'checkup'"),
    ("mocks", "Mock exams submitted", "mock_exams:submitted_at", "TRUE"),
    ("coach", "Questions to the coach", "tutor_turns:asked_at", "TRUE"),
    ("lesson_checkins", "Lesson check-ins", "lesson_feedback:created_at", "TRUE"),
    ("bookmarks", "Questions bookmarked", "question_bookmarks:created_at", "TRUE"),
    ("reports", "Questions reported", "question_reports:created_at",
     "reporter_kind = 'student'"),
    ("support", "Support messages", "support_threads:created_at", "TRUE"),
)


@router.get("/features", response_model=list[Feature], summary="What students use")
async def features(
    conn: Annotated[AsyncConnection, Depends(connection)],
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> list[Feature]:
    found: list[Feature] = []
    for key, label, source, condition in FEATURES:
        table, column = source.split(":")
        student = "reporter_student_id" if table == "question_reports" else "student_id"
        row = await _one(
            conn,
            f"""
            SELECT
              count(*) FILTER (WHERE {column} >= now() - make_interval(days => :days)) AS total,
              count(*) FILTER (WHERE {column} < now() - make_interval(days => :days)
                AND {column} >= now() - make_interval(days => :days * 2)) AS previous,
              count(DISTINCT {student}) FILTER (
                WHERE {column} >= now() - make_interval(days => :days)) AS students
            FROM {table} WHERE {condition}
            """,
            days=days,
        )
        series = await fetch_all(
            conn,
            f"""
            WITH d AS (
              SELECT generate_series((now() AT TIME ZONE '{TZ}')::date - (:days - 1),
                                     (now() AT TIME ZONE '{TZ}')::date,
                                     interval '1 day')::date AS day
            )
            SELECT d.day, count(t.*) AS value
            FROM d LEFT JOIN {table} t
              ON ({column} AT TIME ZONE '{TZ}')::date = d.day AND {condition}
            GROUP BY d.day ORDER BY d.day
            """,
            days=days,
        )
        found.append(Feature(
            key=key, label=label, total=int(row["total"]), previous=int(row["previous"]),
            students=int(row["students"]), series=[DayCount(**r) for r in series],
        ))
    return found


# ------------------------------------------------------------------ AI usage


class ModelUse(BaseModel):
    model: str
    turns: int
    input_tokens: int
    output_tokens: int


class TopAsker(BaseModel):
    student_id: UUID
    display_name: str
    turns: int


class AiUsage(BaseModel):
    days: int
    turns: int
    answered_by_model: int
    fallback: int
    over_budget: int
    students: int
    input_tokens: int
    output_tokens: int
    latency_ms_median: int | None
    latency_ms_p90: int | None
    #: From the token prices in Settings; null until they are set.
    cost_usd: float | None
    cost_naira: float | None
    daily: list[DayCount]
    models: list[ModelUse]
    top_askers: list[TopAsker]


@router.get("/ai", response_model=AiUsage, summary="The coach: questions, tokens and cost")
async def ai_usage(
    conn: Annotated[AsyncConnection, Depends(connection)],
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> AiUsage:
    since = "asked_at >= now() - make_interval(days => :days)"
    t = await _one(
        conn,
        f"""
        SELECT count(*) AS turns,
               count(*) FILTER (WHERE source = 'model') AS model,
               count(*) FILTER (WHERE source = 'fallback') AS fallback,
               count(*) FILTER (WHERE source = 'budget') AS budget,
               count(DISTINCT student_id) AS students,
               coalesce(sum(input_tokens), 0) AS input_tokens,
               coalesce(sum(output_tokens), 0) AS output_tokens,
               percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
               percentile_disc(0.9) WITHIN GROUP (ORDER BY latency_ms) AS p90
        FROM tutor_turns WHERE {since}
        """,
        days=days,
    )
    daily = await fetch_all(
        conn,
        f"""
        WITH d AS (
          SELECT generate_series((now() AT TIME ZONE '{TZ}')::date - (:days - 1),
                                 (now() AT TIME ZONE '{TZ}')::date, interval '1 day')::date AS day
        )
        SELECT d.day, count(t.id) AS value
        FROM d LEFT JOIN tutor_turns t ON (t.asked_at AT TIME ZONE '{TZ}')::date = d.day
        GROUP BY d.day ORDER BY d.day
        """,
        days=days,
    )
    models = await fetch_all(
        conn,
        f"""
        SELECT model, count(*) AS turns, coalesce(sum(input_tokens), 0) AS input_tokens,
               coalesce(sum(output_tokens), 0) AS output_tokens
        FROM tutor_turns WHERE {since} AND model IS NOT NULL
        GROUP BY model ORDER BY turns DESC
        """,
        days=days,
    )
    top = await fetch_all(
        conn,
        f"""
        SELECT s.id AS student_id, s.display_name, count(*) AS turns
        FROM tutor_turns t JOIN students s ON s.id = t.student_id
        WHERE {since.replace('asked_at', 't.asked_at')}
        GROUP BY s.id, s.display_name ORDER BY turns DESC LIMIT 8
        """,
        days=days,
    )
    prices = await app_settings.all_values(conn)
    per_in, per_out = prices["ai_input_usd_per_million"], prices["ai_output_usd_per_million"]
    cost = None
    if per_in or per_out:
        cost = round(
            int(t["input_tokens"]) / 1e6 * per_in + int(t["output_tokens"]) / 1e6 * per_out, 2
        )
    return AiUsage(
        days=days,
        turns=int(t["turns"]),
        answered_by_model=int(t["model"]),
        fallback=int(t["fallback"]),
        over_budget=int(t["budget"]),
        students=int(t["students"]),
        input_tokens=int(t["input_tokens"]),
        output_tokens=int(t["output_tokens"]),
        latency_ms_median=t["p50"],
        latency_ms_p90=t["p90"],
        cost_usd=cost,
        cost_naira=round(cost * prices["naira_per_usd"]) if cost is not None else None,
        daily=[DayCount(**row) for row in daily],
        models=[ModelUse(**row) for row in models],
        top_askers=[TopAsker(**row) for row in top],
    )


# ------------------------------------------------------------------ revenue


class MonthTotal(BaseModel):
    month: date
    kobo: int
    payments: int


class Split(BaseModel):
    label: str
    kobo: int
    payments: int


class Revenue(BaseModel):
    months: list[MonthTotal]
    by_plan: list[Split]
    by_length: list[Split]
    by_channel: list[Split]
    total_kobo: int
    payments: int
    payers: int
    #: Students who have paid, as a share of all students.
    conversion: float
    #: Money taken off by discounts, and plans given at 100% off.
    discount_kobo: int
    free_grants: int
    #: Average paid per paying student.
    per_payer_kobo: int


@router.get("/revenue", response_model=Revenue, summary="Money taken, by month and by plan")
async def revenue(
    conn: Annotated[AsyncConnection, Depends(connection)],
    months: Annotated[int, Query(ge=3, le=36)] = 12,
) -> Revenue:
    month_rows = await fetch_all(
        conn,
        f"""
        WITH m AS (
          SELECT generate_series(
            date_trunc('month', now() AT TIME ZONE '{TZ}') - make_interval(months => :months - 1),
            date_trunc('month', now() AT TIME ZONE '{TZ}'), interval '1 month')::date AS month
        )
        SELECT m.month, coalesce(sum(p.amount_kobo), 0) AS kobo, count(p.id) AS payments
        FROM m LEFT JOIN payments p ON p.status = 'paid' AND p.amount_kobo > 0
          AND date_trunc('month', p.paid_at AT TIME ZONE '{TZ}')::date = m.month
        GROUP BY m.month ORDER BY m.month
        """,
        months=months,
    )

    async def split(column: str) -> list[Split]:
        rows = await fetch_all(
            conn,
            f"""
            SELECT coalesce({column}, 'Unknown') AS label, sum(amount_kobo) AS kobo,
                   count(*) AS payments
            FROM payments WHERE status = 'paid' AND amount_kobo > 0
            GROUP BY 1 ORDER BY kobo DESC
            """,
        )
        return [Split(**row) for row in rows]

    t = await _one(
        conn,
        f"""
        SELECT coalesce(sum(amount_kobo), 0) AS total,
               count(*) FILTER (WHERE amount_kobo > 0) AS payments,
               count(DISTINCT student_id) FILTER (WHERE amount_kobo > 0) AS payers,
               coalesce(sum(list_price_kobo - amount_kobo), 0) AS discount,
               count(*) FILTER (WHERE amount_kobo = 0) AS free_grants,
               (SELECT count(*) FROM students s WHERE {STUDENTS_ONLY}) AS students
        FROM payments WHERE status = 'paid'
        """,
    )
    payers = int(t["payers"])
    return Revenue(
        months=[MonthTotal(**row) for row in month_rows],
        by_plan=await split("plan_name"),
        by_length=await split("length_label"),
        by_channel=await split("replace(channel, '_', ' ')"),
        total_kobo=int(t["total"]),
        payments=int(t["payments"]),
        payers=payers,
        conversion=round(100 * payers / int(t["students"]), 1) if t["students"] else 0.0,
        discount_kobo=int(t["discount"]),
        free_grants=int(t["free_grants"]),
        per_payer_kobo=int(t["total"]) // payers if payers else 0,
    )
