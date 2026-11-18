"""Badges (founder, 18 Nov 2026; docs/gamification-plan.md; migration 070).

Few and meaningful, each measured from what the student has done, never from clicking. `check`
works out every badge's progress for one student in one query, unlocks those reached (once),
and says each in the bell. It runs when a run, a lesson, a check-up or a mock ends, and in the
hourly job (for the streak ones). The app shows each new badge once (`seen_at`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import xp


@dataclass(frozen=True)
class Badge:
    id: str
    name: str
    line: str
    #: Which figure it is measured on, and the figure that unlocks it.
    measure: str
    target: int
    #: The badge's colour and icon in the app.
    tone: str
    icon: str


BADGES: tuple[Badge, ...] = (
    Badge(
        "first_checkup",
        "First check-up",
        "Took your first check-up.",
        "checkups",
        1,
        "purple",
        "target",
    ),
    Badge(
        "first_lesson",
        "First lesson",
        "Finished your first lesson.",
        "lessons",
        1,
        "purple",
        "book",
    ),
    Badge("first_mock", "First mock", "Sat your first full mock.", "mocks", 1, "purple", "clock"),
    Badge(
        "day_done",
        "Day done",
        "Finished everything on a day's plan.",
        "days_done",
        1,
        "lime",
        "check",
    ),
    Badge("streak_7", "One week", "7 days in a row.", "streak", 7, "orange", "flame"),
    Badge("streak_30", "One month", "30 days in a row.", "streak", 30, "orange", "flame"),
    Badge("streak_100", "Hundred days", "100 days in a row.", "streak", 100, "orange", "flame"),
    Badge(
        "right_100", "Sharp", "100 right first time, without help.", "right", 100, "yellow", "spark"
    ),
    Badge(
        "right_500",
        "Sharper",
        "500 right first time, without help.",
        "right",
        500,
        "yellow",
        "spark",
    ),
    Badge(
        "right_1000",
        "Sharpest",
        "1,000 right first time, without help.",
        "right",
        1000,
        "yellow",
        "spark",
    ),
    Badge(
        "perfect_run",
        "Perfect run",
        "A run of 10 or more, every one right without help.",
        "perfect_runs",
        1,
        "pink",
        "trophy",
    ),
    Badge("level_5", "Level 5", "Reached level 5.", "level", 5, "lime", "bolt"),
    Badge("level_10", "Level 10", "Reached level 10.", "level", 10, "lime", "bolt"),
)
BY_ID = {badge.id: badge for badge in BADGES}

FIGURES = """
    SELECT
      (SELECT count(*) FROM study_sessions ss
        WHERE ss.student_id = :s AND ss.session_type = 'checkup' AND ss.ended_at IS NOT NULL)
        AS checkups,
      (SELECT count(*) FROM subtopic_lessons l WHERE l.student_id = :s) AS lessons,
      (SELECT count(*) FROM mock_exams m WHERE m.student_id = :s AND m.submitted_at IS NOT NULL)
        AS mocks,
      (SELECT count(*) FROM xp_events x WHERE x.student_id = :s AND x.reason = 'daily_goal')
        AS days_done,
      (SELECT count(*) FROM attempts a
        WHERE a.student_id = :s AND a.is_correct AND a.hint_count = 0
          AND NOT a.solution_viewed_before_answer AND coalesce(a.confidence, '') <> 'guessed')
        AS right,
      (SELECT count(*) FROM (
         SELECT a.session_id FROM attempts a
         JOIN study_sessions ss ON ss.id = a.session_id AND ss.ended_at IS NOT NULL
         WHERE a.student_id = :s AND a.context = 'guided'
         GROUP BY a.session_id
         HAVING count(*) >= 10
            AND bool_and(a.is_correct AND a.hint_count = 0 AND NOT a.solution_viewed_before_answer
                         AND coalesce(a.confidence, '') <> 'guessed')) p) AS perfect_runs,
      (SELECT coalesce(sum(amount), 0) FROM xp_events x WHERE x.student_id = :s) AS xp_total
"""


async def figures(conn: AsyncConnection, student_id: UUID, streak_days: int) -> dict[str, int]:
    """Every figure a badge is measured on, for one student."""
    row = dict((await conn.execute(text(FIGURES), {"s": student_id})).mappings().one())
    out = {key: int(value or 0) for key, value in row.items()}
    out["streak"] = streak_days
    out["level"] = xp.level_for(out.pop("xp_total")).level
    return out


async def check(conn: AsyncConnection, student_id: UUID, streak_days: int) -> list[Badge]:
    """Unlock every badge now reached (once each) and tell the student; returns the new ones.

    The caller commits.
    """
    from app import notifications

    have = {
        row[0]
        for row in (
            await conn.execute(
                text("SELECT badge FROM student_badges WHERE student_id = :s"), {"s": student_id}
            )
        ).all()
    }
    numbers = await figures(conn, student_id, streak_days)
    new: list[Badge] = []
    for badge in BADGES:
        if badge.id in have or numbers.get(badge.measure, 0) < badge.target:
            continue
        added = await conn.scalar(
            text(
                """
                INSERT INTO student_badges (student_id, badge) VALUES (:s, :b)
                ON CONFLICT DO NOTHING RETURNING 1
                """
            ),
            {"s": student_id, "b": badge.id},
        )
        if added:
            new.append(badge)
            await notifications.notify(
                conn,
                student_id,
                kind="badge",
                category="reward",
                title=f"New badge: {badge.name}",
                body=badge.line,
                link_url="/progress#badges",
                key=f"badge-{badge.id}",
            )
    return new


async def streak_now(conn: AsyncConnection, student_id: UUID) -> int:
    """The current streak (study days and freeze days), for badge checks outside the job."""
    from app.routers.progress import STREAK_CONTEXTS, streak

    row = (
        (
            await conn.execute(
                text(
                    "SELECT timezone, (now() AT TIME ZONE timezone)::date AS today"
                    " FROM students WHERE id = :s"
                ),
                {"s": student_id},
            )
        )
        .mappings()
        .one()
    )
    days = [
        r[0]
        for r in (
            await conn.execute(
                text(
                    """
                    SELECT DISTINCT (a.answered_at_client AT TIME ZONE :tz)::date
                    FROM attempts a
                    WHERE a.student_id = :s AND a.context = ANY (CAST(:c AS text[]))
                      AND a.answered_at_client >= now() - interval '400 days'
                    UNION
                    SELECT f.used_on FROM streak_freezes f
                    WHERE f.student_id = :s AND f.used_on IS NOT NULL
                    """
                ),
                {"s": student_id, "tz": row["timezone"], "c": list(STREAK_CONTEXTS)},
            )
        ).all()
    ]
    return streak(days, row["today"])[0]


async def check_now(conn: AsyncConnection, student_id: UUID) -> list[Badge]:
    """`check`, working the streak out first. The caller commits."""
    return await check(conn, student_id, await streak_now(conn, student_id))


def shelf(numbers: dict[str, int], unlocked: dict[str, Any]) -> list[dict[str, Any]]:
    """Every badge with its state, for Progress: unlocked (when) or locked (how far along)."""
    return [
        {
            "id": badge.id,
            "name": badge.name,
            "line": badge.line,
            "tone": badge.tone,
            "icon": badge.icon,
            "unlocked_at": unlocked.get(badge.id),
            "progress": min(numbers.get(badge.measure, 0), badge.target),
            "target": badge.target,
        }
        for badge in BADGES
    ]
