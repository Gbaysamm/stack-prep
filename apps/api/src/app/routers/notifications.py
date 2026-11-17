"""The student's notifications: what the hourly job and the app have told them (migration 061).

The bell in the top bar shows how many are unread and the latest five; the Notifications page
shows them all. The student opens one (it is read), marks any read or unread, or deletes it.
A deleted one is only hidden, so the job, which keys each notification once, never sends it again.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import require_student
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/student", tags=["notifications"])
NOT_FOUND = "We couldn't find that notification."


class Notification(BaseModel):
    id: UUID
    kind: str
    category: str
    title: str
    body: str | None
    link_url: str | None
    created_at: datetime
    read: bool


class Inbox(BaseModel):
    unread: int
    total: int
    items: list[Notification]


class ReadState(BaseModel):
    read: bool = True


@router.get("/{student_id}/notifications", response_model=Inbox, summary="Your notifications")
async def inbox(
    request: Request,
    student_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> Inbox:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        """
        SELECT id, kind, category, title, body, link_url, created_at, read_at IS NOT NULL AS read
        FROM notifications WHERE student_id = :s AND dismissed_at IS NULL
        ORDER BY created_at DESC LIMIT :n
        """,
        s=student_id,
        n=limit,
    )
    counts = await fetch_all(
        conn,
        "SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread, count(*) AS total"
        " FROM notifications WHERE student_id = :s AND dismissed_at IS NULL",
        s=student_id,
    )
    return Inbox(
        unread=counts[0]["unread"],
        total=counts[0]["total"],
        items=[Notification(**row) for row in rows],
    )


@router.post(
    "/{student_id}/notifications/read", status_code=204, summary="Mark every notification read"
)
async def read_all(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> None:
    await require_student(request, conn, student_id)
    await fetch_all(
        conn,
        "UPDATE notifications SET read_at = now()"
        " WHERE student_id = :s AND read_at IS NULL AND dismissed_at IS NULL RETURNING id",
        s=student_id,
    )
    await conn.commit()


@router.post(
    "/{student_id}/notifications/{notification_id}/read",
    status_code=204,
    summary="Mark one notification read or unread",
)
async def read_one(
    request: Request,
    student_id: UUID,
    notification_id: UUID,
    body: ReadState,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        "UPDATE notifications SET read_at = CASE WHEN :read THEN coalesce(read_at, now()) END"
        " WHERE id = :id AND student_id = :s AND dismissed_at IS NULL RETURNING id",
        read=body.read,
        id=notification_id,
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await conn.commit()


@router.delete(
    "/{student_id}/notifications/{notification_id}",
    status_code=204,
    summary="Delete a notification",
)
async def dismiss(
    request: Request,
    student_id: UUID,
    notification_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        "UPDATE notifications SET dismissed_at = coalesce(dismissed_at, now())"
        " WHERE id = :id AND student_id = :s RETURNING id",
        id=notification_id,
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await conn.commit()
