"""XP: points for learning (founder, 18 Nov 2026; docs/gamification-plan.md; migration 068).

Every award is a row in `xp_events` with a key, so a retried request or a replayed answer never
counts twice. Rewards are for learning, never for clicking:

- an answer right first time with no hint, not called a guess: 10;
- right first time but called a guess: 3;
- right after a hint: 5;
- right only after the working was shown: nothing;
- the same question again on the same day: nothing;
- every third answer in a row right without help: a combo bonus of 5;
- a lesson finished 20, a check-up 30, a mock 100, today's roadmap done 25.

Levels come from the total: level 2 at 100 XP, and each level after needs 50 more than the one
before (100, 150, 200, ...).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

UNAIDED = 10
GUESSED = 3
AFTER_HINT = 5
COMBO_EVERY = 3
COMBO_BONUS = 5
LESSON = 20
CHECKUP = 30
MOCK = 100
DAILY_GOAL = 25


def for_answer(*, correct: bool, hints_before: int, guessed: bool) -> int:
    """XP for one answer, from what the student had seen before answering."""
    if not correct or hints_before >= 2:
        return 0
    if hints_before == 1:
        return AFTER_HINT
    return GUESSED if guessed else UNAIDED


@dataclass(frozen=True)
class Level:
    level: int
    #: XP into this level, and how much the level needs in all.
    into: int
    needs: int
    total: int


def level_for(total: int) -> Level:
    """Level 1 from 0; level 2 at 100; each later level needs 50 more than the last."""
    level, floor, step = 1, 0, 100
    while total >= floor + step:
        floor += step
        level += 1
        step += 50
    return Level(level=level, into=total - floor, needs=step, total=total)


async def award(
    conn: AsyncConnection,
    student_id: UUID,
    *,
    reason: str,
    amount: int,
    key: str,
    session_id: UUID | None = None,
) -> int:
    """Record XP once per key; returns what was added (0 when the key was used before).

    The caller commits.
    """
    if amount <= 0:
        return 0
    added = await conn.scalar(
        text(
            """
            INSERT INTO xp_events (student_id, reason, amount, session_id, dedupe_key)
            VALUES (:s, :r, :a, :session, :k)
            ON CONFLICT (student_id, dedupe_key) DO NOTHING
            RETURNING amount
            """
        ),
        {"s": student_id, "r": reason, "a": amount, "session": session_id, "k": key[:160]},
    )
    return int(added or 0)


async def total(conn: AsyncConnection, student_id: UUID) -> int:
    return int(
        await conn.scalar(
            text("SELECT coalesce(sum(amount), 0) FROM xp_events WHERE student_id = :s"),
            {"s": student_id},
        )
        or 0
    )


async def for_session(conn: AsyncConnection, session_id: UUID) -> int:
    return int(
        await conn.scalar(
            text("SELECT coalesce(sum(amount), 0) FROM xp_events WHERE session_id = :s"),
            {"s": session_id},
        )
        or 0
    )


async def unaided_run(conn: AsyncConnection, session_id: UUID) -> int:
    """How many answers in a row, ending with the latest, were right without help."""
    rows = (
        await conn.execute(
            text(
                """
                SELECT is_correct AND hint_count = 0 AND NOT solution_viewed_before_answer
                       AND coalesce(confidence, '') <> 'guessed' AS clean
                FROM attempts WHERE session_id = :s
                ORDER BY received_at DESC, answered_at_client DESC
                LIMIT 50
                """
            ),
            {"s": session_id},
        )
    ).all()
    run = 0
    for (clean,) in rows:
        if not clean:
            break
        run += 1
    return run


# ------------------------------------------------------------------ the student's day

TODAY_PLAN = """
    SELECT count(*) AS total,
           count(*) FILTER (WHERE i.done_at IS NOT NULL OR ss.ended_at IS NOT NULL) AS done
    FROM roadmap_items i
    JOIN roadmaps r ON r.id = i.roadmap_id AND r.status = 'active'
    LEFT JOIN study_sessions ss ON ss.id = i.session_id
    JOIN students st ON st.id = i.student_id
    WHERE i.student_id = :s AND i.day = (now() AT TIME ZONE st.timezone)::date
"""


async def today_plan(conn: AsyncConnection, student_id: UUID) -> tuple[int, int]:
    """Today's roadmap: (done, total)."""
    row = (await conn.execute(text(TODAY_PLAN), {"s": student_id})).mappings().one()
    return int(row["done"] or 0), int(row["total"] or 0)


async def check_daily_goal(conn: AsyncConnection, student_id: UUID) -> int:
    """+25 once a day when today's roadmap is all done; returns what was added.

    Called after anything that can finish a roadmap item. The caller commits.
    """
    done, planned = await today_plan(conn, student_id)
    if planned == 0 or done < planned:
        return 0
    day = await conn.scalar(
        text("SELECT (now() AT TIME ZONE timezone)::date FROM students WHERE id = :s"),
        {"s": student_id},
    )
    return await award(conn, student_id, reason="daily_goal", amount=DAILY_GOAL, key=f"daily-{day}")
