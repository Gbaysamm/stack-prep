"""The audit log: one row for every change staff make from a dashboard (migration 036).

Each admin route that changes something calls `record` with a short action name and a sentence
a person can read ("Gave Standard to Sade Student for 30 days"). It is written in the same
transaction as the change, so a change that fails leaves no entry, and one that succeeds always
does. The caller commits.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import Staff


async def record(
    conn: AsyncConnection,
    staff: Staff,
    action: str,
    summary: str,
    *,
    target_kind: str | None = None,
    target_id: UUID | str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        text(
            """
            INSERT INTO audit_log (actor_id, actor_name, action, summary, target_kind, target_id,
              detail)
            VALUES (:actor, :name, :action, :summary, :kind, :target, CAST(:detail AS jsonb))
            """
        ),
        {
            "actor": staff.student_id,
            "name": staff.display_name,
            "action": action,
            "summary": summary[:500],
            "kind": target_kind,
            "target": str(target_id) if target_id is not None else None,
            "detail": json.dumps(detail, default=str) if detail is not None else None,
        },
    )


async def name_of(conn: AsyncConnection, student_id: UUID) -> str:
    """A student's name for a sentence in the log; their id if the account has gone."""
    name: str | None = (
        await conn.execute(
            text("SELECT display_name FROM students WHERE id = :s"), {"s": student_id}
        )
    ).scalar_one_or_none()
    return name or str(student_id)
