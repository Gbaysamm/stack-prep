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
from pydantic import BaseModel, Field
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


# ------------------------------------------------------------------ email settings

public_router = APIRouter(prefix="/v1/public/notifications", tags=["notifications"])


class EmailPrefs(BaseModel):
    email_reminders: bool = True
    email_reports: bool = True
    email_account: bool = True
    #: Where the emails go; none means the student has no email address yet.
    email: str | None = None


class EmailPrefsIn(BaseModel):
    email_reminders: bool | None = None
    email_reports: bool | None = None
    email_account: bool | None = None


async def _prefs(conn: AsyncConnection, student_id: UUID) -> EmailPrefs:
    rows = await fetch_all(
        conn,
        """
        SELECT coalesce(p.email_reminders, true) AS email_reminders,
               coalesce(p.email_reports, true) AS email_reports,
               coalesce(p.email_account, true) AS email_account, s.email
        FROM students s LEFT JOIN notification_prefs p ON p.student_id = s.id
        WHERE s.id = :s
        """,
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="unknown student")
    return EmailPrefs(**rows[0])


@router.get(
    "/{student_id}/notification-settings",
    response_model=EmailPrefs,
    summary="What you get by email",
)
async def email_prefs(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> EmailPrefs:
    await require_student(request, conn, student_id)
    return await _prefs(conn, student_id)


@router.patch(
    "/{student_id}/notification-settings",
    response_model=EmailPrefs,
    summary="Change what you get by email",
)
async def change_email_prefs(
    request: Request,
    student_id: UUID,
    body: EmailPrefsIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> EmailPrefs:
    await require_student(request, conn, student_id)
    now = await _prefs(conn, student_id)
    merged = {**now.model_dump(exclude={"email"}), **body.model_dump(exclude_none=True)}
    await fetch_all(
        conn,
        """
        INSERT INTO notification_prefs (student_id, email_reminders, email_reports, email_account)
        VALUES (:s, :email_reminders, :email_reports, :email_account)
        ON CONFLICT (student_id) DO UPDATE SET
          email_reminders = EXCLUDED.email_reminders, email_reports = EXCLUDED.email_reports,
          email_account = EXCLUDED.email_account, updated_at = now()
        RETURNING student_id
        """,
        s=student_id,
        **merged,
    )
    await conn.commit()
    return await _prefs(conn, student_id)


class Unsubscribe(BaseModel):
    #: reminders, reports, account, or all.
    what: str = Field(pattern="^(reminders|reports|account|all)$")


class Unsubscribed(BaseModel):
    what: str


@public_router.post(
    "/unsubscribe/{token}",
    response_model=Unsubscribed,
    summary="Stop an email from the link in it",
)
async def unsubscribe(
    token: UUID, body: Unsubscribe, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Unsubscribed:
    """No sign-in: the token in the email is the proof. Turning off twice is fine."""
    sets = {
        "reminders": "email_reminders = false",
        "reports": "email_reports = false",
        "account": "email_account = false",
        "all": "email_reminders = false, email_reports = false, email_account = false",
    }[body.what]
    rows = await fetch_all(
        conn,
        f"UPDATE notification_prefs SET {sets}, updated_at = now()"
        " WHERE unsubscribe_token = :t RETURNING student_id",
        t=token,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That link is no longer valid.")
    await conn.commit()
    return Unsubscribed(what=body.what)
