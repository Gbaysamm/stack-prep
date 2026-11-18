"""The student's game state in one call (founder, 18 Nov 2026; docs/gamification-plan.md).

XP and level, XP today, the streak, and today's roadmap (the daily goal), for the top bar, Home
and the reward moment after a run, a lesson or a check-up.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import badges, xp
from app.auth import require_student
from app.db import connection, fetch_all
from app.routers.progress import STREAK_CONTEXTS, streak

router = APIRouter(prefix="/v1/student", tags=["game"])


class BadgeView(BaseModel):
    id: str
    name: str
    line: str
    tone: str
    icon: str


class ShelfBadge(BadgeView):
    unlocked_at: datetime | None
    progress: int
    target: int


class Seen(BaseModel):
    ids: list[str]


class Game(BaseModel):
    xp_total: int
    xp_today: int
    level: int
    #: XP into this level, and what the level needs in all.
    level_into: int
    level_needs: int
    streak_days: int
    active_today: bool
    #: Today's roadmap: items done and planned (the daily goal). No plan today: both 0.
    plan_done: int
    plan_total: int
    #: Streak freezes held (migration 069): a missed day uses one.
    freezes: int
    #: Badges unlocked and not yet shown (the app shows each once, then marks it seen).
    badges_new: list[BadgeView] = []


@router.get("/{student_id}/game", response_model=Game, summary="XP, level, streak and today")
async def game(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Game:
    await require_student(request, conn, student_id)
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT (now() AT TIME ZONE s.timezone)::date AS today, s.timezone,
                           coalesce((SELECT sum(amount) FROM xp_events x
                                     WHERE x.student_id = s.id), 0) AS total,
                           coalesce((SELECT sum(amount) FROM xp_events x
                                     WHERE x.student_id = s.id
                                       AND (x.created_at AT TIME ZONE s.timezone)::date
                                           = (now() AT TIME ZONE s.timezone)::date), 0) AS today_xp
                    FROM students s WHERE s.id = :s
                    """
                ),
                {"s": student_id},
            )
        )
        .mappings()
        .one()
    )
    days = await fetch_all(
        conn,
        """
        SELECT DISTINCT (a.answered_at_client AT TIME ZONE :tz)::date AS day
        FROM attempts a
        WHERE a.student_id = :s AND a.context = ANY (CAST(:contexts AS text[]))
          AND a.answered_at_client >= now() - interval '400 days'
        UNION
        SELECT f.used_on FROM streak_freezes f WHERE f.student_id = :s AND f.used_on IS NOT NULL
        """,
        s=student_id,
        tz=row["timezone"],
        contexts=list(STREAK_CONTEXTS),
    )
    run, active = streak([d["day"] for d in days], row["today"])
    level = xp.level_for(int(row["total"]))
    done, planned = await xp.today_plan(conn, student_id)
    freezes = int(
        await conn.scalar(
            text("SELECT count(*) FROM streak_freezes WHERE student_id = :s AND used_on IS NULL"),
            {"s": student_id},
        )
        or 0
    )
    return Game(
        xp_total=level.total,
        xp_today=int(row["today_xp"]),
        level=level.level,
        level_into=level.into,
        level_needs=level.needs,
        streak_days=run,
        active_today=active,
        plan_done=done,
        plan_total=planned,
        freezes=freezes,
        badges_new=[
            BadgeView(**_view(badges.BY_ID[row[0]]))
            for row in (
                await conn.execute(
                    text(
                        "SELECT badge FROM student_badges WHERE student_id = :s"
                        " AND seen_at IS NULL ORDER BY unlocked_at"
                    ),
                    {"s": student_id},
                )
            ).all()
            if row[0] in badges.BY_ID
        ],
    )


def _view(badge: badges.Badge) -> dict[str, str]:
    return {
        "id": badge.id,
        "name": badge.name,
        "line": badge.line,
        "tone": badge.tone,
        "icon": badge.icon,
    }


@router.get("/{student_id}/badges", response_model=list[ShelfBadge], summary="Every badge")
async def badge_shelf(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[ShelfBadge]:
    await require_student(request, conn, student_id)
    unlocked = {
        row[0]: row[1]
        for row in (
            await conn.execute(
                text("SELECT badge, unlocked_at FROM student_badges WHERE student_id = :s"),
                {"s": student_id},
            )
        ).all()
    }
    numbers = await badges.figures(conn, student_id, await badges.streak_now(conn, student_id))
    return [ShelfBadge(**item) for item in badges.shelf(numbers, unlocked)]


@router.post("/{student_id}/badges/seen", status_code=204, summary="Badges shown")
async def badges_seen(
    request: Request,
    student_id: UUID,
    body: Seen,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    await require_student(request, conn, student_id)
    await fetch_all(
        conn,
        "UPDATE student_badges SET seen_at = now() WHERE student_id = :s"
        " AND badge = ANY(CAST(:b AS text[])) AND seen_at IS NULL RETURNING badge",
        s=student_id,
        b=body.ids,
    )
    await conn.commit()
