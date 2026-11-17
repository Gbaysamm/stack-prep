"""Notifications by email, and the weekly report (founder, 17 Nov 2026; migration 062).

After each hourly run the worker calls `send_due`: every notification of the last day that goes
by email, to every student with an email address. None of it can be turned off (founder, 17 Nov
2026: a student who could switch them off would not be serious). Each is sent once
(`emailed_at`). What goes by email:

- reminders (`nudge`, `plan`): streak, missed days, away, the exam countdown, mocks, the roadmap.
  One reminder email a day at most: what is due goes in one email, later ones stay in the app.
  Away reminders stop after two weeks, so nobody is emailed for ever.
- account (plans starting and ending, password and login changes).
- the weekly report (`report`).

Not by email: rewards (in the app, where they are earned) and replies to their messages
(support emails those itself). The welcome, security changes, a plan starting and an account
suspended or restored go within seconds (`send_soon`), signed in or not; the rest at the hourly
run. How each email looks is app/emails/, one file per email.

`weekly_reports` writes the report on Sunday from 6 pm their time: days studied, time, questions,
accuracy against the week before, the topics practised most, and the weakest one as next
week's focus. It is a notification like any other, so it is in the bell too, and links to
Progress, which is the report page.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import emails, mailer
from app.config import get_settings

log = logging.getLogger(__name__)

ACCOUNT_KINDS = (
    "welcome",
    "plan_started",
    "plan_ending",
    "plan_ended",
    "password_changed",
    "password_reset",
    "login_changed",
    "account_suspended",
    "account_restored",
)
#: Sent within seconds of happening, not at the next hourly run (`send_soon`).
INSTANT_KINDS = (
    "welcome",
    "plan_started",
    "password_changed",
    "password_reset",
    "login_changed",
    "account_suspended",
    "account_restored",
)
#: How many notifications one run emails at most, so a backlog never floods the mail server.
PER_RUN = 300

#: What is due, claimed in the same statement (`emailed_at` set), so two senders running at
#: once (the hourly job and an instant send) never send the same email twice.
CLAIM = """
    WITH due AS (
      SELECT n.id
      FROM notifications n
      JOIN students s ON s.id = n.student_id
      WHERE n.emailed_at IS NULL AND n.dismissed_at IS NULL
        AND n.created_at > now() - interval '1 day'
        AND s.email IS NOT NULL
        AND (CAST(:student AS uuid) IS NULL OR n.student_id = CAST(:student AS uuid))
        AND (n.kind = ANY (CAST(:kinds AS text[]))
             OR (n.category IN ('nudge', 'plan', 'report')
                 AND s.status NOT IN ('suspended', 'archived')))
      ORDER BY n.created_at
      LIMIT :n
      FOR UPDATE OF n SKIP LOCKED
    )
    UPDATE notifications n SET emailed_at = now()
      FROM due, students s
     WHERE n.id = due.id AND s.id = n.student_id
    RETURNING n.id, n.student_id, n.kind, n.category, n.title, n.body, n.link_url, n.data,
              n.created_at, s.email, s.display_name,
              CASE WHEN n.category IN ('nudge', 'plan') THEN 'reminders'
                   ELSE n.id::text END AS batch
"""


def app_address() -> str:
    """The student app's address: PUBLIC_URL, else the first address the API lets in."""
    settings = get_settings()
    return (settings.public_url or next(iter(settings.cors_origin_list), "")).rstrip("/")


async def send_due(conn: AsyncConnection, student_id: UUID | None = None) -> int:
    """Email what is due (for everyone, or one student); returns how many emails were sent.

    Reminders are one email a day at most: everything due in a run goes in one email, and once
    one has gone, later reminders that day stay in the app. Reports and account emails always go.
    """
    base = app_address()
    kinds = list(ACCOUNT_KINDS)
    rows = [
        dict(r)
        for r in (
            await conn.execute(
                text(CLAIM),
                {"kinds": kinds, "n": PER_RUN, "student": str(student_id) if student_id else None},
            )
        ).mappings()
    ]
    # Claimed: from here a failure is logged by the mailer and not retried, since a retry next
    # hour would send a stale reminder.
    await conn.commit()
    rows.sort(key=lambda r: r["created_at"])
    groups: dict[tuple[UUID, str], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault((row["student_id"], row["batch"]), []).append(row)
    sent = 0
    for (student, batch), group in groups.items():
        reminders = batch == "reminders"
        if reminders and await conn.scalar(
            text(
                "SELECT 1 FROM notification_email_state WHERE student_id = :s"
                " AND last_reminder_email_at > now() - interval '20 hours'"
            ),
            {"s": student},
        ):
            continue  # one reminder email a day: these stay in the app
        email = emails.render(group, base)
        ok = await mailer.send_email(group[0]["email"], email.subject, email.text, email.html)
        sent += int(ok)
        if ok and reminders:
            await conn.execute(
                text(
                    """
                    INSERT INTO notification_email_state (student_id, last_reminder_email_at)
                    VALUES (:s, now())
                    ON CONFLICT (student_id) DO UPDATE SET last_reminder_email_at = now()
                    """
                ),
                {"s": student},
            )
            await conn.commit()
    if rows:
        log.info("notification emails: %s sent for %s due", sent, len(rows))
    return sent


_pending: set[asyncio.Task[None]] = set()


def send_soon(student_id: UUID) -> None:
    """Email this student's instant notifications in a few seconds, after the caller commits.

    Only where email is set up; elsewhere the hourly job finds them (and logs them locally).
    """
    if not get_settings().smtp_host:
        return

    async def run() -> None:
        from app.db import get_engine

        await asyncio.sleep(3)
        try:
            async with get_engine().connect() as conn:
                await send_due(conn, student_id)
        except Exception:  # never let an email break the request that caused it
            log.exception("sending instant notification emails failed")

    task = asyncio.get_running_loop().create_task(run())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


# ------------------------------------------------------------------ the weekly report

#: Students for whom it is Sunday, 6 pm or later, who studied in the last 30 days.
REPORT_DUE = """
    SELECT s.id, s.display_name, s.timezone,
           (coalesce(CAST(:now AS timestamptz), now()) AT TIME ZONE s.timezone) AS lt
    FROM students s
    WHERE s.status NOT IN ('suspended', 'archived')
      AND extract(isodow FROM coalesce(CAST(:now AS timestamptz), now())
                              AT TIME ZONE s.timezone) = 7
      AND extract(hour FROM coalesce(CAST(:now AS timestamptz), now())
                            AT TIME ZONE s.timezone) BETWEEN 18 AND 20
      AND EXISTS (SELECT 1 FROM attempts a WHERE a.student_id = s.id
                  AND a.answered_at_client >= now() - interval '30 days')
"""

#: One student's week (the 7 days to tonight) and the week before.
WEEK = """
    WITH a AS (
      SELECT a.*, (a.answered_at_client AT TIME ZONE :tz)::date AS day
      FROM attempts a
      WHERE a.student_id = :s AND a.answered_at_client >= now() - interval '15 days'
    )
    SELECT
      count(*) FILTER (WHERE day > :today - 7) AS answered,
      count(*) FILTER (WHERE day > :today - 7 AND is_correct) AS correct,
      count(DISTINCT day) FILTER (WHERE day > :today - 7) AS days,
      coalesce(sum(least(response_ms, 300000)) FILTER (WHERE day > :today - 7), 0) AS ms,
      count(*) FILTER (WHERE day <= :today - 7 AND day > :today - 14) AS answered_before,
      count(*) FILTER (WHERE day <= :today - 7 AND day > :today - 14 AND is_correct)
        AS correct_before
    FROM a
"""

#: The week's topics (subtopics), by how much they were practised, with accuracy.
TOPICS = """
    SELECT coalesce(sub.name, skill.name) AS topic, count(*) AS answered,
           avg(CASE WHEN a.is_correct THEN 1.0 ELSE 0.0 END) AS accuracy
    FROM attempts a
    JOIN question_versions v ON v.id = a.question_version_id
    JOIN question_classifications c
      ON c.question_id = v.question_id AND c.classification_role = 'primary'
    JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
    LEFT JOIN curriculum_items sub ON sub.id = skill.parent_id
    WHERE a.student_id = :s AND a.is_correct IS NOT NULL
      AND (a.answered_at_client AT TIME ZONE :tz)::date > :today - 7
    GROUP BY 1
    ORDER BY 2 DESC
"""


def _time(ms: int) -> str:
    minutes = round(ms / 60000)
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60} h {minutes % 60} min" if minutes % 60 else f"{minutes // 60} h"


def report_words(week: dict[str, Any], topics: list[dict[str, Any]]) -> tuple[str, str]:
    """The report's title and body (at most 600 characters)."""
    answered = int(week["answered"])
    if answered == 0:
        return (
            "Your week: a quiet one",
            "No practice this week. One short session tomorrow gets you going again; your "
            "roadmap has kept your place.",
        )
    accuracy = round(100 * int(week["correct"]) / answered)
    parts = [
        f"{week['days']} day{'s' if week['days'] != 1 else ''}, {_time(int(week['ms']))}, "
        f"{answered} questions at {accuracy}%."
    ]
    before = int(week["answered_before"])
    if before:
        was = round(100 * int(week["correct_before"]) / before)
        if accuracy > was:
            parts.append(f"Up from {was}% the week before.")
        elif accuracy < was:
            parts.append(f"Down from {was}% the week before; slower and surer wins.")
        else:
            parts.append("The same accuracy as the week before.")
    if topics:
        most = ", ".join(t["topic"] for t in topics[:2])
        parts.append(f"Most practised: {most}.")
        weak = [t for t in topics if int(t["answered"]) >= 3]
        if weak:
            focus = min(weak, key=lambda t: float(t["accuracy"]))
            if float(focus["accuracy"]) < 0.7:
                parts.append(f"Next week's focus: {focus['topic']}.")
    title = f"Your week: {answered} questions at {accuracy}%"
    return title, " ".join(parts)[:600]


def report_data(week: dict[str, Any], topics: list[dict[str, Any]]) -> dict[str, Any]:
    """The report's figures, for the email's four tiles and its lines."""
    answered = int(week["answered"])
    accuracy = round(100 * int(week["correct"]) / answered) if answered else 0
    data: dict[str, Any] = {
        "days": int(week["days"]),
        "time": _time(int(week["ms"])),
        "answered": answered,
        "accuracy": accuracy,
    }
    before = int(week["answered_before"])
    if before and answered:
        was = round(100 * int(week["correct_before"]) / before)
        data["change"] = (
            f"Up from {was}%"
            if accuracy > was
            else f"Down from {was}%"
            if accuracy < was
            else "The same"
        )
    if topics:
        data["most"] = [t["topic"] for t in topics[:2]]
        weak = [t for t in topics if int(t["answered"]) >= 3]
        if weak:
            focus = min(weak, key=lambda t: float(t["accuracy"]))
            if float(focus["accuracy"]) < 0.7:
                data["focus"] = focus["topic"]
    return data


async def weekly_reports(conn: AsyncConnection, now: datetime | None = None) -> int:
    """Write this week's report for every student due one; returns how many were written."""
    due = [dict(r) for r in (await conn.execute(text(REPORT_DUE), {"now": now})).mappings()]
    written = 0
    for student in due:
        today = student["lt"].date()
        params = {"s": student["id"], "tz": student["timezone"], "today": today}
        week = dict((await conn.execute(text(WEEK), params)).mappings().one())
        topics = [dict(r) for r in (await conn.execute(text(TOPICS), params)).mappings()]
        title, body = report_words(week, topics)
        data = report_data(week, topics)
        added = await conn.scalar(
            text(
                """
                INSERT INTO notifications (student_id, kind, category, title, body, link_url,
                                           dedupe_key, data)
                VALUES (:s, 'weekly_report', 'report', :title, :body, '/progress', :key,
                        CAST(:data AS jsonb))
                ON CONFLICT (student_id, dedupe_key) DO NOTHING
                RETURNING 1
                """
            ),
            {
                "s": student["id"],
                "title": title,
                "body": body,
                "key": f"week-{today}",
                "data": json.dumps(data),
            },
        )
        written += int(added is not None)
    await conn.commit()
    if written:
        log.info("weekly reports: %s written", written)
    return written
