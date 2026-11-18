"""The student's game state in one call (founder, 18 Nov 2026; docs/gamification-plan.md).

XP and level, XP today, the streak, and today's roadmap (the daily goal), for the top bar, Home
and the reward moment after a run, a lesson or a check-up.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import xp
from app.auth import require_student
from app.db import connection, fetch_all
from app.routers.progress import STREAK_CONTEXTS, streak

router = APIRouter(prefix="/v1/student", tags=["game"])


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
        """,
        s=student_id,
        tz=row["timezone"],
        contexts=list(STREAK_CONTEXTS),
    )
    run, active = streak([d["day"] for d in days], row["today"])
    level = xp.level_for(int(row["total"]))
    done, planned = await xp.today_plan(conn, student_id)
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
    )
