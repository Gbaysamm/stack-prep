"""Who has Premium, and what is left of the free allowance (migration 035).

Free: check-ups, a number of practice questions a day, a number of mocks, and the board's
written working. Premium adds unlimited practice and mocks, and the lesson's voice and coach.
An admin sets the numbers, and none of it applies until they turn the limits on. Admins
always have everything; reviewers do not use the student app.

A refusal is a 402 whose detail is a sentence for the student; the app opens its upgrade
prompt on any 402.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import role_of

PREMIUM_FOR_VOICE = "The spoken lesson and the coach come with Premium."
PREMIUM_FOR_MOCKS = "You've used your free mock. Premium gives you as many mocks as you want."


@dataclass(frozen=True)
class Limits:
    on: bool
    practice_per_day: int
    mocks: int


@dataclass(frozen=True)
class Standing:
    limits: Limits
    #: Premium now, from a payment, a gift, or being an admin.
    premium: bool
    premium_until: datetime | None


async def limits(conn: AsyncConnection) -> Limits:
    row = (
        (
            await conn.execute(
                text(
                    "SELECT limits_on, free_practice_per_day, free_mocks FROM billing_settings"
                )
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return Limits(on=False, practice_per_day=0, mocks=0)
    return Limits(
        on=bool(row["limits_on"]),
        practice_per_day=int(row["free_practice_per_day"]),
        mocks=int(row["free_mocks"]),
    )


async def premium_until(conn: AsyncConnection, student_id: UUID) -> datetime | None:
    """When the student's Premium runs out, if they have it now."""
    until: datetime | None = (
        await conn.execute(
            text(
                """
                SELECT max(ends_at) FROM premium_periods
                WHERE student_id = :s AND starts_at <= now() AND ends_at > now()
                """
            ),
            {"s": student_id},
        )
    ).scalar()
    if until is None:
        return None
    # Periods bought back to back: Premium lasts to the end of the last one joined to this.
    later = (
        await conn.execute(
            text(
                """
                SELECT starts_at, ends_at FROM premium_periods
                WHERE student_id = :s AND ends_at > :until ORDER BY starts_at
                """
            ),
            {"s": student_id, "until": until},
        )
    ).all()
    for starts_at, ends_at in later:
        if starts_at <= until:
            until = max(until, ends_at)
    return until


async def standing(conn: AsyncConnection, student_id: UUID) -> Standing:
    current = await limits(conn)
    until = await premium_until(conn, student_id)
    admin = await role_of(conn, student_id) == "admin"
    return Standing(limits=current, premium=admin or until is not None, premium_until=until)


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


async def mocks_used(conn: AsyncConnection, student_id: UUID) -> int:
    """Every mock the student has started, deleted ones too."""
    used: int = (
        await conn.execute(
            text("SELECT count(*) FROM mock_exams WHERE student_id = :s"), {"s": student_id}
        )
    ).scalar_one()
    return used


def _practice_refusal(per_day: int) -> HTTPException:
    return HTTPException(
        status_code=402,
        detail=(
            f"You've answered your {per_day} free practice questions for today. Come back "
            "tomorrow, or go Premium to keep going."
        ),
    )


async def check_practice_start(conn: AsyncConnection, student_id: UUID) -> None:
    """Refuse a new run when today's free questions are all used."""
    current = await standing(conn, student_id)
    if not current.limits.on or current.premium:
        return
    if await practice_used_today(conn, student_id) >= current.limits.practice_per_day:
        raise _practice_refusal(current.limits.practice_per_day)


async def check_practice_answer(
    conn: AsyncConnection, student_id: UUID, session_id: UUID, version_id: UUID
) -> None:
    """Refuse the answer to a new question once today's free ones are used.

    A second try at a question already counted is always let through.
    """
    current = await standing(conn, student_id)
    if not current.limits.on or current.premium:
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
    if await practice_used_today(conn, student_id) >= current.limits.practice_per_day:
        raise _practice_refusal(current.limits.practice_per_day)


async def check_mock_start(conn: AsyncConnection, student_id: UUID) -> None:
    current = await standing(conn, student_id)
    if not current.limits.on or current.premium:
        return
    if await mocks_used(conn, student_id) >= current.limits.mocks:
        raise HTTPException(status_code=402, detail=PREMIUM_FOR_MOCKS)


async def voice_allowed(conn: AsyncConnection, session_id: UUID) -> bool:
    """May the student who owns this sitting hear the lesson and ask the coach?"""
    student_id: UUID | None = (
        await conn.execute(
            text("SELECT student_id FROM study_sessions WHERE id = :id"), {"id": session_id}
        )
    ).scalar_one_or_none()
    if student_id is None:
        return True  # the route's own 404 answers
    current = await standing(conn, student_id)
    return not current.limits.on or current.premium


async def check_voice(conn: AsyncConnection, session_id: UUID) -> None:
    """The lesson's voice and the coach: Premium, once the limits are on."""
    if not await voice_allowed(conn, session_id):
        raise HTTPException(status_code=402, detail=PREMIUM_FOR_VOICE)
