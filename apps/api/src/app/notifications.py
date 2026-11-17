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

The same job also tells them what their calendar holds (`PLAN_RULES`, 8 am to 9 pm only): the
exam countdown (30, 14, 7 days, the day before), a scheduled mock opening and closing tomorrow,
today's check-up or mock on the roadmap, a plan ending within three days and a plan just ended.

What happens in the app is told when it happens, through `notify` (the caller commits): a reply
to their message, a plan starting, a check-up or mock marked, a password or login change, and
the welcome. Email and push will later send from the same rows.
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


async def notify(
    conn: AsyncConnection,
    student_id: UUID,
    *,
    kind: str,
    category: str,
    title: str,
    body: str | None,
    link_url: str | None,
    key: str,
) -> None:
    """Tell a student something that just happened. Once per `key`; the caller commits."""
    await conn.execute(
        text(
            """
            INSERT INTO notifications (student_id, kind, category, title, body, link_url,
                                       dedupe_key)
            VALUES (:s, :kind, :category, :title, :body, :link_url, :key)
            ON CONFLICT (student_id, dedupe_key) DO NOTHING
            """
        ),
        {
            "s": student_id,
            "kind": kind,
            "category": category,
            "title": title[:120],
            "body": body[:600] if body else None,
            "link_url": link_url,
            "key": key[:120],
        },
    )


#: Each student's wall clock, kept only while it is daytime there (8 am to 9 pm).
_LOCAL = """
    WITH st AS (
      SELECT s.id, (coalesce(CAST(:now AS timestamptz), now()) AT TIME ZONE s.timezone) AS lt
      FROM students s WHERE s.status NOT IN ('suspended', 'archived')
    ), day AS (
      SELECT id, lt, lt::date AS today FROM st
      WHERE extract(hour FROM lt) >= 8 AND extract(hour FROM lt) < 21
    )
"""
_INSERT = """
    INSERT INTO notifications (student_id, kind, category, title, body, link_url, dedupe_key)
"""
_DONE = " ON CONFLICT (student_id, dedupe_key) DO NOTHING RETURNING 1"
#: Mocks scheduled for an examination the student is preparing for, not yet sat.
_THEIR_MOCK = """
    sm.cancelled_at IS NULL
    AND sm.examination_id IN (
      SELECT sj.examination_id FROM student_exam_goals g JOIN subjects sj ON sj.id = g.subject_id
      WHERE g.student_id = day.id AND g.status = 'active')
    AND NOT EXISTS (SELECT 1 FROM mock_exams m WHERE m.student_id = day.id
                    AND m.scheduled_mock_id = sm.id AND m.hidden_at IS NULL)
"""
#: A paid plan with no later paid plan after it.
_LAST_PAID = """
    NOT EXISTS (SELECT 1 FROM premium_periods later
                JOIN premium_plans lp ON lp.id = later.plan_id AND lp.kind = 'paid'
                WHERE later.student_id = day.id AND later.ends_at > p.ends_at)
"""

PLAN_RULES: dict[str, str] = {
    "exam_countdown": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'exam_countdown', 'plan',
               CASE WHEN d.left_days = 1 THEN 'Your exam is tomorrow'
                    ELSE d.left_days || ' days to your exam' END,
               CASE d.left_days
                 WHEN 30 THEN 'A month to go. Keep to your roadmap and sit a mock each week.'
                 WHEN 14 THEN 'Two weeks left. A mock now shows exactly what to fix.'
                 WHEN 7 THEN 'One week left. Revise your weakest topics rather than new ones.'
                 ELSE 'Rest well tonight. You have prepared for this.' END,
               '/roadmap', 'exam-' || d.exam_date || '-' || d.left_days
        FROM day
        JOIN LATERAL (
          SELECT g.exam_date, g.exam_date - day.today AS left_days
          FROM student_exam_goals g
          WHERE g.student_id = day.id AND g.status = 'active' AND g.exam_date IS NOT NULL
          GROUP BY g.exam_date
        ) d ON d.left_days IN (30, 14, 7, 1)
    """
    + _DONE,
    "mock_open": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'mock_open', 'plan', sm.title || ' is open',
               'Sit it by ' || to_char(sm.closes_on, 'FMDay FMDD Mon')
               || '. It is timed and marked like the real exam.',
               '/mock', 'smock-open-' || sm.id
        FROM day JOIN scheduled_mocks sm
          ON sm.opens_on <= day.today AND sm.closes_on > day.today AND
    """
    + _THEIR_MOCK
    + _DONE,
    "mock_closing": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'mock_closing', 'plan', sm.title || ' closes tomorrow',
               'You have not sat it yet. It takes about two hours.',
               '/mock', 'smock-close-' || sm.id
        FROM day JOIN scheduled_mocks sm ON sm.closes_on = day.today + 1 AND
    """
    + _THEIR_MOCK
    + _DONE,
    "roadmap_today": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'roadmap_' || ri.kind, 'plan',
               CASE ri.kind WHEN 'mock' THEN 'Your weekly mock is today'
                    ELSE 'A ' || sj.name || ' check-up is on today''s plan' END,
               CASE ri.kind WHEN 'mock' THEN 'It shows your score out of 400 and what to fix.'
                    ELSE 'It takes about ten minutes and updates your roadmap.' END,
               '/roadmap', 'roadmap-' || ri.id
        FROM day
        JOIN roadmaps r ON r.student_id = day.id AND r.status = 'active'
        JOIN roadmap_items ri ON ri.roadmap_id = r.id AND ri.day = day.today
                             AND ri.kind IN ('checkup', 'mock')
                             AND ri.session_id IS NULL AND ri.started_at IS NULL
        LEFT JOIN subjects sj ON sj.id = ri.subject_id
    """
    + _DONE,
    "plan_ending": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'plan_ending', 'system', 'Your ' || pl.name || ' plan ends soon',
               'It ends on ' || to_char(p.ends_at AT TIME ZONE 'Africa/Lagos', 'FMDay FMDD Mon')
               || '. Renew to keep everything open.',
               '/plans', 'plan-end-' || p.id
        FROM day
        JOIN premium_periods p ON p.student_id = day.id
             AND p.ends_at > now() AND p.ends_at <= now() + interval '3 days'
        JOIN premium_plans pl ON pl.id = p.plan_id AND pl.kind = 'paid'
        WHERE
    """
    + _LAST_PAID
    + _DONE,
    "plan_ended": _LOCAL
    + _INSERT
    + """
        SELECT day.id, 'plan_ended', 'system', 'Your ' || pl.name || ' plan has ended',
               'You are on the Free plan now. Your progress is all kept.',
               '/plans', 'plan-ended-' || p.id
        FROM day
        JOIN premium_periods p ON p.student_id = day.id
             AND p.ends_at <= now() AND p.ends_at > now() - interval '2 days'
        JOIN premium_plans pl ON pl.id = p.plan_id AND pl.kind = 'paid'
        WHERE
    """
    + _LAST_PAID
    + _DONE,
}


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
    for name, sql in PLAN_RULES.items():
        rows_added = len((await conn.execute(text(sql), {"now": now})).all())
        if rows_added:
            log.info("notifications: %s %s", rows_added, name)
        added += rows_added
    await conn.commit()
    log.info("notifications: %s added for %s students", added, len(rows))
    return added
