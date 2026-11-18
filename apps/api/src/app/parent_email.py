"""Emails to parents (founder, 17-18 Nov 2026; migration 065).

Three, each through `parent_emails` so it goes once (the row is written before the email):

- the invitation, when a student adds a parent (`send_invite`), with the Confirm link;
- the weekly report, Sunday from 6 pm the student's time, to every confirmed parent of a student
  who studied in the last 30 days (`weekly`), the same figures as the student's own report;
- the missed-days alert, when a student who has studied before has gone 3 days without any
  study, and again at 7, between 8 am and 9 pm (`missed_days`).

Only parents who confirmed (`status = 'active'`, `can_receive_reports`) get the last two.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import mailer
from app.emails import parent_invite, parent_missed_days, parent_weekly_report
from app.notification_email import TOPICS, WEEK, app_address, report_data
from app.notifications import STUDY_CONTEXTS

log = logging.getLogger(__name__)

MISSED_DAYS = (3, 7)

#: Confirmed parents, with the student and the student's clock.
ACTIVE = """
    SELECT gs.id AS link_id, g.display_name AS parent_name, g.email AS parent_email,
           s.id AS student_id, s.display_name AS student_name, s.timezone,
           (coalesce(CAST(:now AS timestamptz), now()) AT TIME ZONE s.timezone) AS lt
    FROM guardian_students gs
    JOIN guardians g ON g.id = gs.guardian_id
    JOIN students s ON s.id = gs.student_id
    WHERE gs.status = 'active' AND gs.can_receive_reports AND g.email IS NOT NULL
      AND s.status NOT IN ('suspended', 'archived')
"""


async def _claim(conn: AsyncConnection, link_id: UUID, kind: str, key: str) -> bool:
    """Record the email before sending it; False when it was already sent."""
    row = await conn.scalar(
        text(
            """
            INSERT INTO parent_emails (guardian_student_id, kind, dedupe_key)
            VALUES (:l, :k, :key) ON CONFLICT DO NOTHING RETURNING 1
            """
        ),
        {"l": link_id, "k": kind, "key": key},
    )
    await conn.commit()
    return row is not None


async def send_invite(conn: AsyncConnection, link_id: UUID, *, again: bool = False) -> bool:
    """Email the parent the Confirm link (`again` sends a fresh copy on request)."""
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT gs.invite_token, gs.status, g.display_name AS parent_name,
                           g.email AS parent_email, s.display_name AS student_name
                    FROM guardian_students gs
                    JOIN guardians g ON g.id = gs.guardian_id
                    JOIN students s ON s.id = gs.student_id
                    WHERE gs.id = :l
                    """
                ),
                {"l": link_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["status"] != "pending" or not row["parent_email"]:
        return False
    key = f"invite-{datetime.now().isoformat()}" if again else "invite"
    if not await _claim(conn, link_id, "invite", key):
        return False
    base = app_address()
    email = parent_invite.build(
        row["parent_name"], row["student_name"], f"{base}/parent/{row['invite_token']}", base
    )
    await conn.execute(
        text("UPDATE guardian_students SET invited_at = now() WHERE id = :l"), {"l": link_id}
    )
    await conn.commit()
    return await mailer.send_email(row["parent_email"], email.subject, email.text, email.html)


async def weekly(conn: AsyncConnection, now: datetime | None = None) -> int:
    """Sunday from 6 pm the student's time: each confirmed parent gets the week."""
    rows = [
        dict(r)
        for r in (
            await conn.execute(
                text(
                    ACTIVE
                    + """
                    AND extract(isodow FROM coalesce(CAST(:now AS timestamptz), now())
                                            AT TIME ZONE s.timezone) = 7
                    AND extract(hour FROM coalesce(CAST(:now AS timestamptz), now())
                                          AT TIME ZONE s.timezone) BETWEEN 18 AND 20
                    AND EXISTS (SELECT 1 FROM attempts a WHERE a.student_id = s.id
                                AND a.answered_at_client >= now() - interval '30 days')
                    """
                ),
                {"now": now},
            )
        ).mappings()
    ]
    sent = 0
    base = app_address()
    for row in rows:
        today = row["lt"].date()
        if not await _claim(conn, row["link_id"], "weekly_report", f"week-{today}"):
            continue
        params = {"s": row["student_id"], "tz": row["timezone"], "today": today}
        week = dict((await conn.execute(text(WEEK), params)).mappings().one())
        topics: list[dict[str, Any]] = [
            dict(r) for r in (await conn.execute(text(TOPICS), params)).mappings()
        ]
        email = parent_weekly_report.build(
            row["parent_name"], row["student_name"], report_data(week, topics), base
        )
        sent += int(
            await mailer.send_email(row["parent_email"], email.subject, email.text, email.html)
        )
    if rows:
        log.info("parent weekly reports: %s sent of %s due", sent, len(rows))
    return sent


async def missed_days(conn: AsyncConnection, now: datetime | None = None) -> int:
    """A confirmed parent hears when their child has gone 3, then 7, days without study."""
    rows = [
        dict(r)
        for r in (
            await conn.execute(
                text(
                    "SELECT * FROM ("
                    + ACTIVE
                    + """
                    ) p
                    JOIN LATERAL (
                      SELECT max((a.answered_at_client AT TIME ZONE p.timezone)::date) AS last_day
                      FROM attempts a
                      WHERE a.student_id = p.student_id
                        AND a.context = ANY (CAST(:contexts AS text[]))
                    ) d ON d.last_day IS NOT NULL
                    WHERE extract(hour FROM p.lt) >= 8 AND extract(hour FROM p.lt) < 21
                      AND (p.lt::date - d.last_day) = ANY (CAST(:gaps AS int[]))
                    """
                ),
                {"now": now, "contexts": list(STUDY_CONTEXTS), "gaps": list(MISSED_DAYS)},
            )
        ).mappings()
    ]
    sent = 0
    base = app_address()
    for row in rows:
        gap = (row["lt"].date() - row["last_day"]).days
        if not await _claim(conn, row["link_id"], "missed_days", f"missed-{row['last_day']}-{gap}"):
            continue
        email = parent_missed_days.build(row["parent_name"], row["student_name"], gap, base)
        sent += int(
            await mailer.send_email(row["parent_email"], email.subject, email.text, email.html)
        )
    if rows:
        log.info("parent missed-days alerts: %s sent of %s due", sent, len(rows))
    return sent
