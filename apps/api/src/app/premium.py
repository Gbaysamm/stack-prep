"""What each student may do: the features of the plan they're on (migration 035).

Every plan, Free included, is a row an admin edits: practice questions a day, mocks per day,
week, month or in total, the lesson's voice, questions to the coach a day, custom runs and
bookmark runs. A student on no paid plan has the Free plan's features; with paid plans
running, the highest-ranked one applies. Check-ups and the board's written working are
always free.

None of it applies until an admin turns the limits on: until then every student has
everything. Admins always have everything; reviewers do not use the app.

A refusal is a 402 whose detail is a sentence for the student; the app opens its upgrade
prompt on any 402.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import app_settings
from app.auth import role_of

PREMIUM_FOR_VOICE = "Lessons explained aloud come with a plan."
PERIOD_SQL = {
    "day": "now() - interval '1 day'",
    "week": "now() - interval '7 days'",
    "month": "now() - interval '30 days'",
}
PERIOD_WORD = {"day": "today", "week": "this week", "month": "this month", "total": "in all"}


@dataclass(frozen=True)
class Allowance:
    """What a student may do now. None is unlimited."""

    practice_per_day: int | None
    mocks: int | None
    #: day, week, month or total.
    mocks_per: str
    voice: bool
    #: None is the server's own daily allowance (no limits, or an admin).
    coach_per_day: int | None
    custom_runs: bool
    bookmark_runs: bool


EVERYTHING = Allowance(
    practice_per_day=None,
    mocks=None,
    mocks_per="week",
    voice=True,
    coach_per_day=None,
    custom_runs=True,
    bookmark_runs=True,
)

PLAN_COLUMNS = """
    p.id, p.kind, p.name, p.display_order, p.practice_per_day, p.mocks_allowed, p.mocks_per,
    p.voice, p.coach_per_day, p.custom_runs, p.bookmark_runs
"""


def allowance_of(row: Any) -> Allowance:
    return Allowance(
        practice_per_day=row["practice_per_day"],
        mocks=row["mocks_allowed"],
        mocks_per=row["mocks_per"],
        voice=bool(row["voice"]),
        coach_per_day=int(row["coach_per_day"]),
        custom_runs=bool(row["custom_runs"]),
        bookmark_runs=bool(row["bookmark_runs"]),
    )


@dataclass(frozen=True)
class Standing:
    limits_on: bool
    #: The paid plan that applies now; None on the Free plan.
    plan_id: UUID | None
    plan_name: str | None
    #: When that plan runs out, counting time bought on it back to back.
    plan_until: datetime | None
    allowance: Allowance
    #: An admin account: has everything, with no plan.
    admin: bool = False

    @property
    def premium(self) -> bool:
        return self.admin or self.plan_id is not None


async def limits_on(conn: AsyncConnection) -> bool:
    on: bool | None = (
        await conn.execute(text("SELECT limits_on FROM billing_settings"))
    ).scalar_one_or_none()
    return bool(on)


async def free_plan(conn: AsyncConnection) -> Any:
    return (
        (
            await conn.execute(
                text(f"SELECT {PLAN_COLUMNS} FROM premium_plans p WHERE p.kind = 'free'")
            )
        )
        .mappings()
        .first()
    )


async def standing(conn: AsyncConnection, student_id: UUID) -> Standing:
    on = await limits_on(conn)
    best = (
        (
            await conn.execute(
                text(
                    f"""
                    SELECT {PLAN_COLUMNS}
                    FROM premium_periods pp JOIN premium_plans p ON p.id = pp.plan_id
                    WHERE pp.student_id = :s AND pp.starts_at <= now() AND pp.ends_at > now()
                      AND p.kind = 'paid'
                    ORDER BY p.display_order DESC, pp.ends_at DESC
                    LIMIT 1
                    """
                ),
                {"s": student_id},
            )
        )
        .mappings()
        .first()
    )
    admin = await role_of(conn, student_id) == "admin"
    if admin or not on:
        allowance = EVERYTHING
    elif best is not None:
        allowance = allowance_of(best)
    else:
        free = await free_plan(conn)
        allowance = allowance_of(free) if free is not None else EVERYTHING
    return Standing(
        limits_on=on,
        plan_id=best["id"] if best else None,
        plan_name=best["name"] if best else None,
        plan_until=await plan_until(conn, student_id, best["id"]) if best else None,
        allowance=allowance,
        admin=admin,
    )


async def plan_until(conn: AsyncConnection, student_id: UUID, plan_id: UUID) -> datetime | None:
    """When the student's time on this plan runs out, following periods bought back to back."""
    rows = (
        await conn.execute(
            text(
                """
                SELECT starts_at, ends_at FROM premium_periods
                WHERE student_id = :s AND plan_id = :p AND ends_at > now()
                ORDER BY starts_at
                """
            ),
            {"s": student_id, "p": plan_id},
        )
    ).all()
    until: datetime | None = None
    for starts_at, ends_at in rows:
        if until is None:
            until = ends_at
        elif starts_at <= until:
            until = max(until, ends_at)
    return until


async def practice_used_today(conn: AsyncConnection, student_id: UUID) -> int:
    """Practice questions the student has answered today, on Nigerian time.

    A question counts once, however many tries it took; check-ups and mocks do not count.
    """
    used: int = (
        await conn.execute(
            text(
                """
                SELECT count(DISTINCT (a.session_id, a.question_version_id))
                FROM attempts a
                WHERE a.student_id = :s AND a.context = 'guided'
                  AND a.answered_at_client >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos')
                                      AT TIME ZONE 'Africa/Lagos'
                """
            ),
            {"s": student_id},
        )
    ).scalar_one()
    return used


async def mocks_used(conn: AsyncConnection, student_id: UUID, per: str = "total") -> int:
    """Mocks the student has started, deleted ones too, over the plan's period."""
    since = f"AND started_at > {PERIOD_SQL[per]}" if per in PERIOD_SQL else ""
    used: int = (
        await conn.execute(
            text(f"SELECT count(*) FROM mock_exams WHERE student_id = :s {since}"),
            {"s": student_id},
        )
    ).scalar_one()
    return used


def _plan_words(current: Standing) -> str:
    return f"on {current.plan_name}" if current.plan_name else "on the free plan"


def _higher(current: Standing) -> str:
    return "A higher plan gives you more." if current.plan_name else "Choose a plan to keep going."


def _practice_refusal(current: Standing) -> HTTPException:
    per_day = current.allowance.practice_per_day
    return HTTPException(
        status_code=402,
        detail=(
            f"You've answered your {per_day} practice questions for today {_plan_words(current)}."
            f" Come back tomorrow. {_higher(current)}"
        ),
    )


async def check_practice_start(
    conn: AsyncConnection, student_id: UUID, *, custom: bool = False, bookmarked: bool = False
) -> None:
    """Refuse a new run when today's practice questions are used, or the kind isn't included."""
    current = await standing(conn, student_id)
    if bookmarked and not current.allowance.bookmark_runs:
        raise HTTPException(
            status_code=402,
            detail=f"Revising your bookmarks as a run isn't included {_plan_words(current)}.",
        )
    if custom and not current.allowance.custom_runs:
        raise HTTPException(
            status_code=402,
            detail=f"Choosing your own topics and years isn't included {_plan_words(current)}.",
        )
    per_day = current.allowance.practice_per_day
    if per_day is not None and await practice_used_today(conn, student_id) >= per_day:
        raise _practice_refusal(current)


async def check_practice_answer(
    conn: AsyncConnection, student_id: UUID, session_id: UUID, version_id: UUID
) -> None:
    """Refuse the answer to a new question once today's are used.

    A second try at a question already counted is always let through.
    """
    current = await standing(conn, student_id)
    per_day = current.allowance.practice_per_day
    if per_day is None:
        return
    tried = (
        await conn.execute(
            text(
                """
                SELECT 1 FROM attempts
                WHERE session_id = :session AND question_version_id = :version LIMIT 1
                """
            ),
            {"session": session_id, "version": version_id},
        )
    ).first()
    if tried is not None:
        return
    if await practice_used_today(conn, student_id) >= per_day:
        raise _practice_refusal(current)


async def check_mock_start(conn: AsyncConnection, student_id: UUID) -> None:
    current = await standing(conn, student_id)
    allowed = current.allowance.mocks
    if allowed is None:
        return
    per = current.allowance.mocks_per
    if await mocks_used(conn, student_id, per) >= allowed:
        if allowed == 0:
            detail = f"Mock exams aren't included {_plan_words(current)}. {_higher(current)}"
        else:
            noun = "mock" if allowed == 1 else "mocks"
            detail = (
                f"You've sat your {allowed} {noun} {PERIOD_WORD[per]} {_plan_words(current)}."
                f" {_higher(current)}"
            )
        raise HTTPException(status_code=402, detail=detail)


async def _session_student(conn: AsyncConnection, session_id: UUID) -> UUID | None:
    student_id: UUID | None = (
        await conn.execute(
            text("SELECT student_id FROM study_sessions WHERE id = :id"), {"id": session_id}
        )
    ).scalar_one_or_none()
    return student_id


async def voice_allowed(conn: AsyncConnection, session_id: UUID) -> bool:
    """May the student who owns this sitting hear the lesson?"""
    student_id = await _session_student(conn, session_id)
    if student_id is None:
        return True  # the route's own 404 answers
    return (await standing(conn, student_id)).allowance.voice


async def check_voice(conn: AsyncConnection, session_id: UUID) -> None:
    if not await voice_allowed(conn, session_id):
        raise HTTPException(status_code=402, detail=PREMIUM_FOR_VOICE)


async def check_coach(conn: AsyncConnection, session_id: UUID) -> None:
    """Asking the coach: a plan with coach questions, once the limits are on."""
    if not await app_settings.get(conn, "coach_enabled"):
        raise HTTPException(
            status_code=503,
            detail="The coach is resting for now. The working on the board has every step.",
        )
    student_id = await _session_student(conn, session_id)
    if student_id is None:
        return
    if (await standing(conn, student_id)).allowance.coach_per_day == 0:
        raise HTTPException(
            status_code=402, detail="Asking the coach about a step comes with a plan."
        )


async def coach_allowance(conn: AsyncConnection, student_id: UUID, default: int) -> int:
    """Questions to the coach a day for this student.

    `default` is the server's own daily allowance (AI_DAILY_CALLS_PER_STUDENT): what everyone
    gets while the limits are off, and what an admin gets. A plan sets its own.
    """
    allowed = (await standing(conn, student_id)).allowance.coach_per_day
    return default if allowed is None else allowed
