"""Notifications by email, and the weekly report (founder, 17 Nov 2026; migration 062).

After each hourly run the worker calls `send_due`: every notification of the last day that goes
by email, to a student with an email address who has not turned that kind off in Settings. Each
is sent once (`emailed_at`). What goes by email:

- reminders (`nudge`, `plan`): streak, missed days, away, the exam countdown, mocks, the roadmap.
  A nudge is at most one a day already, so at most one reminder email a day from those.
- account (plans starting and ending, password and login changes).
- the weekly report (`report`).

Not by email: rewards (in the app, where they are earned), the welcome, and replies to their
messages (support emails those itself).

`weekly_reports` writes the report on Sunday from 6 pm their time: days studied, time, questions,
accuracy against the week before, the topics practised most, and the weakest one as next
week's focus. It is a notification like any other, so it is in the bell too, and links to
Progress, which is the report page.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import mailer
from app.config import get_settings

log = logging.getLogger(__name__)

ACCOUNT_KINDS = ("plan_started", "plan_ending", "plan_ended", "password_changed",
                 "password_reset", "login_changed")
#: How many emails one run sends at most, so a backlog never floods the mail server.
PER_RUN = 300

#: Which preference covers a notification, and the words for turning it off.
PREF_WORDS = {
    "reminders": "reminder emails",
    "reports": "the weekly report",
    "account": "account and plan emails",
}

DUE = """
    SELECT n.id, n.student_id, n.kind, n.category, n.title, n.body, n.link_url,
           s.email, s.display_name,
           CASE WHEN n.category = 'report' THEN 'reports'
                WHEN n.kind = ANY (CAST(:account AS text[])) THEN 'account'
                ELSE 'reminders' END AS pref,
           p.unsubscribe_token
    FROM notifications n
    JOIN students s ON s.id = n.student_id
    LEFT JOIN notification_prefs p ON p.student_id = n.student_id
    WHERE n.emailed_at IS NULL AND n.dismissed_at IS NULL
      AND n.created_at > now() - interval '1 day'
      AND s.email IS NOT NULL AND s.status NOT IN ('suspended', 'archived')
      AND (n.category IN ('nudge', 'plan', 'report') OR n.kind = ANY (CAST(:account AS text[])))
      AND CASE WHEN n.category = 'report' THEN coalesce(p.email_reports, true)
               WHEN n.kind = ANY (CAST(:account AS text[])) THEN coalesce(p.email_account, true)
               ELSE coalesce(p.email_reminders, true) END
    ORDER BY n.created_at
    LIMIT :n
"""


async def token_for(conn: AsyncConnection, student_id: UUID) -> UUID:
    """The student's unsubscribe token, made the first time it is needed."""
    token = await conn.scalar(
        text(
            """
            INSERT INTO notification_prefs (student_id) VALUES (:s)
            ON CONFLICT (student_id) DO UPDATE SET student_id = EXCLUDED.student_id
            RETURNING unsubscribe_token
            """
        ),
        {"s": student_id},
    )
    assert token is not None
    return UUID(str(token))


def email_text(rows: list[dict[str, Any]], base: str, token: UUID) -> str:
    """The plain email: one notification or several of one kind, links, how to stop this kind."""
    first = (rows[0]["display_name"] or "there").split()[0]
    pref = rows[0]["pref"]
    lines = [f"Hi {first},"]
    for row in rows:
        lines += ["", row["title"]]
        if row["body"]:
            lines.append(row["body"])
        if row["link_url"]:
            lines.append(f"Open it: {base}{row['link_url']}")
    lines += [
        "",
        "Stack Prep",
        "",
        "--",
        f"You get this because {PREF_WORDS[pref]} are on for your account.",
        f"Turn them off: {base}/unsubscribe/{token}?what={pref}",
        f"Or choose what you get in Settings: {base}/settings#set-notifications",
    ]
    return "\n".join(lines)


def subject_for(rows: list[dict[str, Any]]) -> str:
    title = str(rows[0]["title"])
    return title if len(rows) == 1 else f"{title} (and {len(rows) - 1} more)"


async def send_due(conn: AsyncConnection) -> int:
    """Email what is due, one email per student and kind; returns how many emails were sent.

    Reminders are one email a day at most: everything due in a run goes in one email, and once
    one has gone, later reminders that day stay in the app. Account emails always go.
    """
    settings = get_settings()
    # The student app's address: PUBLIC_URL, else the first address the API lets in.
    base = (settings.public_url or next(iter(settings.cors_origin_list), "")).rstrip("/")
    rows = [
        dict(r)
        for r in (
            await conn.execute(text(DUE), {"account": list(ACCOUNT_KINDS), "n": PER_RUN})
        ).mappings()
    ]
    groups: dict[tuple[UUID, str], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault((row["student_id"], row["pref"]), []).append(row)
    sent = 0
    for (student_id, pref), group in groups.items():
        quiet = pref == "reminders" and bool(
            await conn.scalar(
                text(
                    "SELECT 1 FROM notification_prefs WHERE student_id = :s"
                    " AND last_reminder_email_at > now() - interval '20 hours'"
                ),
                {"s": student_id},
            )
        )
        if not quiet:
            token = group[0]["unsubscribe_token"] or await token_for(conn, student_id)
            ok = await mailer.send_email(
                group[0]["email"], subject_for(group), email_text(group, base, token)
            )
            sent += int(ok)
            if ok and pref == "reminders":
                await conn.execute(
                    text(
                        "UPDATE notification_prefs SET last_reminder_email_at = now()"
                        " WHERE student_id = :s"
                    ),
                    {"s": student_id},
                )
        # Marked either way: a failure is logged by the mailer, and a retry next hour would
        # send a stale reminder; a reminder held back stays in the app.
        await conn.execute(
            text(
                "UPDATE notifications SET emailed_at = now()"
                " WHERE id = ANY (CAST(:ids AS uuid[]))"
            ),
            {"ids": [str(r["id"]) for r in group]},
        )
        await conn.commit()
    if groups:
        log.info("notification emails: %s sent for %s due", sent, len(rows))
    return sent


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
        added = await conn.scalar(
            text(
                """
                INSERT INTO notifications (student_id, kind, category, title, body, link_url,
                                           dedupe_key)
                VALUES (:s, 'weekly_report', 'report', :title, :body, '/progress', :key)
                ON CONFLICT (student_id, dedupe_key) DO NOTHING
                RETURNING 1
                """
            ),
            {"s": student["id"], "title": title, "body": body, "key": f"week-{today}"},
        )
        written += int(added is not None)
    await conn.commit()
    if written:
        log.info("weekly reports: %s written", written)
    return written
