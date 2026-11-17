"""Notifications: what each student is told, and when (founder, 17 Nov 2026; migration 061).

The worker runs `run_hourly` every hour. For each student who has studied at least once it reads
a few facts (their local time, the days they studied, the hour they usually study) and `decide`
says what is due. Each notification has a `dedupe_key`, so running the job twice, or late, never
says anything twice. Like Duolingo, a little and at the right moment:

- Streak at risk: studied yesterday, not yet today, a streak of 2 or more, from 7 pm.
- Missed a day: studied the day before yesterday, not yesterday, not yet today; at their usual hour.
- Away: 3, 7 and 14 days after the last study day, gentler each time; then nothing.
- Streak milestones (a reward): 3, 7, 14, 30, 50 and 100 days, on the day it is reached.

Nudges (the first three) come at most once a day and never between 9 pm and 8 am, their time.
Email and push will later send from the same rows.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

log = logging.getLogger(__name__)

#: The contexts a study day counts (as the streak on Home does).
STUDY_CONTEXTS = ("guided", "practice", "checkup")
QUIET_FROM = 21  # no nudges from 9 pm ...
QUIET_UNTIL = 8  # ... until 8 am, the student's time
STREAK_RISK_FROM = 19
USUAL_HOUR = 17  # when a student has no habit yet
AWAY_DAYS = (3, 7, 14)
MILESTONES = (3, 7, 14, 30, 50, 100)


@dataclass(frozen=True)
class Facts:
    student_id: UUID
    first_name: str
    timezone: str
    #: Local days they studied, most recent first (the last 400 days).
    days: list[date]
    #: Local hours of their answers over the last 30 days.
    hours: list[int]


@dataclass(frozen=True)
class Note:
    kind: str
    category: str
    title: str
    body: str
    link_url: str
    dedupe_key: str


def streak(days: set[date], today: date) -> int:
    """Consecutive study days ending today, or yesterday when today has not started."""
    day = today if today in days else today - timedelta(days=1)
    count = 0
    while day in days:
        count += 1
        day -= timedelta(days=1)
    return count


def usual_hour(hours: list[int]) -> int:
    """The hour they most often study, kept inside the hours a nudge may come."""
    if not hours:
        return USUAL_HOUR
    hour = Counter(hours).most_common(1)[0][0]
    return min(max(hour, QUIET_UNTIL), QUIET_FROM - 1)


def decide(facts: Facts, now: datetime) -> list[Note]:
    """What is due for this student at `now` (their local time). Pure, so it is easy to test."""
    if not facts.days:
        return []
    today = now.date()
    seen = set(facts.days)
    last = max(seen)
    name = facts.first_name
    notes: list[Note] = []

    run = streak(seen, today)
    if today in seen and run in MILESTONES:
        notes.append(
            Note(
                kind="streak_milestone",
                category="reward",
                title=f"{run}-day streak!",
                body=f"{run} days in a row, {name}. That habit is how scores go up.",
                link_url="/progress",
                dedupe_key=f"streak-{run}-{today.isoformat()}",
            )
        )

    if not QUIET_UNTIL <= now.hour < QUIET_FROM or today in seen:
        return notes
    gap = (today - last).days
    nudge: Note | None = None
    if gap == 1 and run >= 2 and now.hour >= STREAK_RISK_FROM:
        nudge = Note(
            kind="streak_risk",
            category="nudge",
            title=f"Your {run}-day streak ends at midnight",
            body="One short practice keeps it going.",
            link_url="/home",
            dedupe_key=f"nudge-{today.isoformat()}",
        )
    elif gap == 2 and now.hour >= usual_hour(facts.hours):
        nudge = Note(
            kind="missed_day",
            category="nudge",
            title=f"We missed you yesterday, {name}",
            body="Today's plan is ready. Ten minutes is enough to get back on track.",
            link_url="/home",
            dedupe_key=f"nudge-{today.isoformat()}",
        )
    elif gap in AWAY_DAYS and now.hour >= usual_hour(facts.hours):
        body = {
            3: "Your plan has kept your place. Pick up where you stopped.",
            7: "A week away. Start small: one topic, ten minutes.",
            14: "Whenever you are ready, your plan is here. No pressure.",
        }[gap]
        nudge = Note(
            kind="away",
            category="nudge",
            title=f"Your plan is waiting, {name}",
            body=body,
            link_url="/home",
            dedupe_key=f"away-{gap}-{last.isoformat()}",
        )
    if nudge is not None:
        notes.append(nudge)
    return notes


FACTS = """
    SELECT s.id, s.display_name, s.timezone,
           (coalesce(CAST(:now AS timestamptz), now()) AT TIME ZONE s.timezone) AS local_now,
           coalesce((SELECT array_agg(DISTINCT (a.answered_at_client AT TIME ZONE s.timezone)::date)
                     FROM attempts a
                     WHERE a.student_id = s.id AND a.context = ANY (CAST(:contexts AS text[]))
                       AND a.answered_at_client >= now() - interval '400 days'), '{}') AS days,
           coalesce((SELECT array_agg(
                              extract(hour FROM a.answered_at_client AT TIME ZONE s.timezone)::int)
                     FROM attempts a
                     WHERE a.student_id = s.id AND a.context = ANY (CAST(:contexts AS text[]))
                       AND a.answered_at_client >= now() - interval '30 days'), '{}') AS hours
    FROM students s
    WHERE s.status NOT IN ('suspended', 'archived')
      AND EXISTS (SELECT 1 FROM attempts a WHERE a.student_id = s.id
                  AND a.answered_at_client >= now() - interval '30 days')
"""


async def save(conn: AsyncConnection, student_id: UUID, note: Note, now_local: date) -> bool:
    """Store one notification.

    False when it was already there, or when a nudge was already sent today.
    """
    if note.category == "nudge":
        already = await conn.scalar(
            text(
                "SELECT 1 FROM notifications WHERE student_id = :s AND category = 'nudge'"
                " AND (created_at AT TIME ZONE (SELECT timezone FROM students WHERE id = :s))::date"
                " = :d"
            ),
            {"s": student_id, "d": now_local},
        )
        if already:
            return False
    row = await conn.scalar(
        text(
            """
            INSERT INTO notifications (student_id, kind, category, title, body, link_url,
                                       dedupe_key)
            VALUES (:s, :kind, :category, :title, :body, :link_url, :dedupe_key)
            ON CONFLICT (student_id, dedupe_key) DO NOTHING
            RETURNING 1
            """
        ),
        {"s": student_id, **note.__dict__},
    )
    return row is not None


async def run_hourly(conn: AsyncConnection, now: datetime | None = None) -> int:
    """Decide and store what is due for every student; returns how many were added.

    `now` is for tests; the job uses the database's clock.
    """
    rows: list[dict[str, Any]] = [
        dict(r)
        for r in (
            await conn.execute(text(FACTS), {"contexts": list(STUDY_CONTEXTS), "now": now})
        ).mappings()
    ]
    added = 0
    for row in rows:
        local: datetime = row["local_now"]  # their wall clock, worked out by Postgres
        facts = Facts(
            student_id=row["id"],
            first_name=(row["display_name"] or "there").split()[0],
            timezone=row["timezone"],
            days=sorted(row["days"], reverse=True),
            hours=list(row["hours"]),
        )
        for note in decide(facts, local):
            if await save(conn, facts.student_id, note, local.date()):
                added += 1
    await conn.commit()
    log.info("notifications: %s added for %s students", added, len(rows))
    return added
