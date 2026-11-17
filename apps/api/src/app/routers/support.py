"""Support: a student writes to Stack Prep, the admin answers (migration 036).

A conversation is a support_threads row and its support_messages. A signed-in student starts
one from Help & guides and reads the replies there; someone without an account writes through
the public contact form, and the reply goes to the email they gave. Every reply from the admin
is also emailed when there is an address and email is set up, so nobody has to keep checking.

Status: `open` waits for the admin, `answered` waits for the student, `closed` is finished. A
new message from the student opens it again.
"""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit, mailer, notifications
from app.auth import Staff, admin_session, require_student
from app.config import get_settings
from app.db import connection, fetch_all

student_router = APIRouter(prefix="/v1/student", tags=["support"])
public_router = APIRouter(prefix="/v1", tags=["support"])
admin_router = APIRouter(
    prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)]
)

Topic = Literal["account", "payment", "question", "app", "other"]
Status = Literal["open", "answered", "closed"]

#: New conversations a student may start in a day.
THREADS_PER_DAY = 5
#: Messages through the public form from one address in a day, and from everyone in an hour.
CONTACT_PER_EMAIL = 3
CONTACT_PER_HOUR = 60
NOT_FOUND = "We couldn't find that conversation."


class Message(BaseModel):
    id: UUID
    from_staff: bool
    author_name: str | None
    body: str
    created_at: datetime


class ThreadLine(BaseModel):
    id: UUID
    topic: Topic
    subject: str
    status: Status
    created_at: datetime
    updated_at: datetime
    last_body: str
    last_from_staff: bool
    messages: int
    #: For the student: a reply they haven't opened yet.
    unread: bool = False


class Thread(ThreadLine):
    thread_messages: list[Message]


class NewThread(BaseModel):
    topic: Topic
    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=4000)


class Reply(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class Contact(NewThread):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    #: A field people never see; a form that fills it in is a robot.
    website: str = ""


class Sent(BaseModel):
    status: Literal["sent"] = "sent"


def _tidy(words: str) -> str:
    return "\n".join(line.rstrip() for line in words.strip().splitlines())


THREAD_COLUMNS = """
    t.id, t.topic, t.subject, t.status, t.created_at, t.updated_at,
    last.body AS last_body, last.from_staff AS last_from_staff, counts.n AS messages
"""
THREAD_JOINS = """
    JOIN LATERAL (
      SELECT m.body, m.from_staff FROM support_messages m
      WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
    ) last ON TRUE
    JOIN LATERAL (SELECT count(*) AS n FROM support_messages m WHERE m.thread_id = t.id) counts
      ON TRUE
"""


async def _messages(conn: AsyncConnection, thread_id: UUID) -> list[Message]:
    rows = await fetch_all(
        conn,
        """
        SELECT m.id, m.from_staff, m.body, m.created_at,
               CASE WHEN m.from_staff THEN coalesce(a.display_name, 'Stack Prep')
                    ELSE coalesce(a.display_name, t.name) END AS author_name
        FROM support_messages m
        JOIN support_threads t ON t.id = m.thread_id
        LEFT JOIN students a ON a.id = m.author_id
        WHERE m.thread_id = :thread ORDER BY m.created_at
        """,
        thread=thread_id,
    )
    return [Message(**row) for row in rows]


async def _start(
    conn: AsyncConnection,
    *,
    student_id: UUID | None,
    name: str | None,
    email: str | None,
    body: NewThread,
) -> UUID:
    thread_id: UUID = (
        await conn.execute(
            text(
                """
                INSERT INTO support_threads (student_id, name, email, topic, subject,
                                             student_seen_at)
                VALUES (:student, :name, :email, :topic, :subject, now())
                RETURNING id
                """
            ),
            {"student": student_id, "name": name, "email": email, "topic": body.topic,
             "subject": " ".join(body.subject.split())},
        )
    ).scalar_one()
    await conn.execute(
        text(
            "INSERT INTO support_messages (thread_id, author_id, body) "
            "VALUES (:thread, :author, :body)"
        ),
        {"thread": thread_id, "author": student_id, "body": _tidy(body.body)},
    )
    return thread_id


# ------------------------------------------------------------------ the student


@student_router.get(
    "/{student_id}/support", response_model=list[ThreadLine], summary="Your conversations"
)
async def my_threads(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[ThreadLine]:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        f"""
        SELECT {THREAD_COLUMNS},
               EXISTS (
                 SELECT 1 FROM support_messages m WHERE m.thread_id = t.id AND m.from_staff
                   AND m.created_at > coalesce(t.student_seen_at, '-infinity')
               ) AS unread
        FROM support_threads t {THREAD_JOINS}
        WHERE t.student_id = :student
        ORDER BY t.updated_at DESC LIMIT 50
        """,
        student=student_id,
    )
    return [ThreadLine(**row) for row in rows]


@student_router.post(
    "/{student_id}/support",
    response_model=Thread,
    status_code=201,
    summary="Write to Stack Prep",
)
async def start_thread(
    request: Request,
    student_id: UUID,
    body: NewThread,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Thread:
    await require_student(request, conn, student_id)
    today = (
        await conn.execute(
            text(
                "SELECT count(*) FROM support_threads WHERE student_id = :student "
                "AND created_at > now() - interval '1 day'"
            ),
            {"student": student_id},
        )
    ).scalar_one()
    if today >= THREADS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="You've started a lot of conversations today. Add to one you already have, "
            "or try again tomorrow.",
        )
    thread_id = await _start(conn, student_id=student_id, name=None, email=None, body=body)
    await conn.commit()
    return await _student_thread(conn, student_id, thread_id)


async def _student_thread(conn: AsyncConnection, student_id: UUID, thread_id: UUID) -> Thread:
    rows = await fetch_all(
        conn,
        f"SELECT {THREAD_COLUMNS} FROM support_threads t {THREAD_JOINS} "
        "WHERE t.id = :thread AND t.student_id = :student",
        thread=thread_id,
        student=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return Thread(**rows[0], thread_messages=await _messages(conn, thread_id))


@student_router.get(
    "/{student_id}/support/{thread_id}", response_model=Thread, summary="One conversation"
)
async def my_thread(
    request: Request,
    student_id: UUID,
    thread_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Thread:
    await require_student(request, conn, student_id)
    thread = await _student_thread(conn, student_id, thread_id)
    await conn.execute(
        text("UPDATE support_threads SET student_seen_at = now() WHERE id = :thread"),
        {"thread": thread_id},
    )
    await conn.commit()
    return thread


@student_router.post(
    "/{student_id}/support/{thread_id}/messages",
    response_model=Thread,
    summary="Add to a conversation",
)
async def student_reply(
    request: Request,
    student_id: UUID,
    thread_id: UUID,
    body: Reply,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Thread:
    await require_student(request, conn, student_id)
    await _student_thread(conn, student_id, thread_id)
    await conn.execute(
        text(
            "INSERT INTO support_messages (thread_id, author_id, body) "
            "VALUES (:thread, :student, :body)"
        ),
        {"thread": thread_id, "student": student_id, "body": _tidy(body.body)},
    )
    await conn.execute(
        text(
            "UPDATE support_threads SET status = 'open', updated_at = now(), "
            "student_seen_at = now() WHERE id = :thread"
        ),
        {"thread": thread_id},
    )
    await conn.commit()
    return await _student_thread(conn, student_id, thread_id)


# ------------------------------------------------------------------ the public contact form


@public_router.post("/contact", response_model=Sent, status_code=202, summary="Contact us")
async def contact(body: Contact, conn: Annotated[AsyncConnection, Depends(connection)]) -> Sent:
    if body.website:
        return Sent()  # a robot: thank it and keep nothing
    email = body.email.strip().lower()
    counts = (
        await conn.execute(
            text(
                """
                SELECT count(*) FILTER (WHERE lower(email) = :email
                                        AND created_at > now() - interval '1 day'),
                       count(*) FILTER (WHERE student_id IS NULL
                                        AND created_at > now() - interval '1 hour')
                FROM support_threads
                WHERE created_at > now() - interval '1 day'
                """
            ),
            {"email": email},
        )
    ).one()
    if counts[0] >= CONTACT_PER_EMAIL or counts[1] >= CONTACT_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="We've had a lot of messages just now. Please try again a little later.",
        )
    await _start(
        conn, student_id=None, name=" ".join(body.name.split()), email=email, body=body
    )
    await conn.commit()
    return Sent()


# ------------------------------------------------------------------ the admin's inbox


class InboxLine(ThreadLine):
    student_id: UUID | None
    who: str
    contact: str | None


class InboxThread(InboxLine):
    thread_messages: list[Message]
    #: Whether a reply can be emailed: there is an address and email is set up.
    can_email: bool


class Inbox(BaseModel):
    threads: list[InboxLine]
    counts: dict[str, int]


INBOX_COLUMNS = f"""
    {THREAD_COLUMNS}, t.student_id,
    coalesce(s.display_name, t.name, t.email) AS who,
    coalesce(t.email, s.email, s.phone) AS contact
"""


@admin_router.get("/support", response_model=Inbox, summary="The support inbox")
async def inbox(
    conn: Annotated[AsyncConnection, Depends(connection)],
    status: Status | Literal["all"] = "open",
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> Inbox:
    conditions = ["TRUE"]
    params: dict[str, Any] = {}
    if status != "all":
        conditions.append("t.status = :status")
        params["status"] = status
    if q and q.strip():
        conditions.append(
            "(t.subject ILIKE :q OR s.display_name ILIKE :q OR t.name ILIKE :q "
            "OR t.email ILIKE :q OR s.email ILIKE :q)"
        )
        params["q"] = f"%{q.strip()}%"
    rows = await fetch_all(
        conn,
        f"""
        SELECT {INBOX_COLUMNS}
        FROM support_threads t {THREAD_JOINS}
        LEFT JOIN students s ON s.id = t.student_id
        WHERE {" AND ".join(conditions)}
        ORDER BY t.status = 'open' DESC, t.updated_at DESC LIMIT 100
        """,
        **params,
    )
    count_rows = await fetch_all(
        conn, "SELECT status, count(*) AS n FROM support_threads GROUP BY status"
    )
    counts = {"open": 0, "answered": 0, "closed": 0}
    counts.update({row["status"]: row["n"] for row in count_rows})
    return Inbox(threads=[InboxLine(**row) for row in rows], counts=counts)


async def _inbox_thread(conn: AsyncConnection, thread_id: UUID) -> InboxThread:
    rows = await fetch_all(
        conn,
        f"""
        SELECT {INBOX_COLUMNS}, coalesce(t.email, s.email) AS email_to
        FROM support_threads t {THREAD_JOINS}
        LEFT JOIN students s ON s.id = t.student_id
        WHERE t.id = :thread
        """,
        thread=thread_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    row = rows[0]
    email_to = row.pop("email_to")
    return InboxThread(
        **row,
        thread_messages=await _messages(conn, thread_id),
        can_email=bool(email_to and get_settings().smtp_host),
    )


@admin_router.get("/support/{thread_id}", response_model=InboxThread, summary="A conversation")
async def inbox_thread(
    thread_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> InboxThread:
    return await _inbox_thread(conn, thread_id)


def _reply_email(who: str, subject: str, reply: str, signed_up: bool) -> str:
    url = get_settings().public_url.rstrip("/")
    where = (
        f"You can read the whole conversation and reply in Stack Prep, under Help & guides"
        f"{f': {url}/help' if url else ''}."
        if signed_up
        else "Reply to this email, or write to us again through the contact form."
    )
    return f"Hello {who},\n\nAbout “{subject}”:\n\n{reply}\n\n{where}\n\nThe Stack Prep team\n"


@admin_router.post(
    "/support/{thread_id}/messages", response_model=InboxThread, summary="Reply"
)
async def admin_reply(
    thread_id: UUID,
    body: Reply,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> InboxThread:
    thread = await _inbox_thread(conn, thread_id)
    words = _tidy(body.body)
    await conn.execute(
        text(
            "INSERT INTO support_messages (thread_id, author_id, from_staff, body) "
            "VALUES (:thread, :staff, true, :body)"
        ),
        {"thread": thread_id, "staff": staff.student_id, "body": words},
    )
    await conn.execute(
        text(
            "UPDATE support_threads SET status = 'answered', updated_at = now() "
            "WHERE id = :thread"
        ),
        {"thread": thread_id},
    )
    await audit.record(
        conn, staff, "support.reply", f"Replied to “{thread.subject}” from {thread.who}",
        target_kind="support", target_id=str(thread_id),
    )
    if thread.student_id is not None:
        await notifications.notify(
            conn,
            thread.student_id,
            kind="support_reply",
            category="system",
            title="We replied to your message",
            body=f"“{thread.subject}”: {words[:200]}",
            link_url=f"/messages/{thread_id}",
            key=f"support-{thread_id}-{secrets.token_hex(6)}",
        )
    await conn.commit()
    email_to: str | None = (
        await conn.execute(
            text(
                "SELECT coalesce(t.email, s.email) FROM support_threads t "
                "LEFT JOIN students s ON s.id = t.student_id WHERE t.id = :thread"
            ),
            {"thread": thread_id},
        )
    ).scalar_one_or_none()
    if email_to:
        await mailer.send_email(
            email_to,
            f"Re: {thread.subject}",
            _reply_email(thread.who, thread.subject, words, thread.student_id is not None),
        )
    return await _inbox_thread(conn, thread_id)


class StatusChange(BaseModel):
    status: Status


@admin_router.put(
    "/support/{thread_id}/status", response_model=InboxThread, summary="Close or reopen"
)
async def set_status(
    thread_id: UUID,
    body: StatusChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> InboxThread:
    thread = await _inbox_thread(conn, thread_id)
    if thread.status != body.status:
        await conn.execute(
            text("UPDATE support_threads SET status = :status WHERE id = :thread"),
            {"thread": thread_id, "status": body.status},
        )
        verb = "Closed" if body.status == "closed" else "Reopened"
        await audit.record(
            conn, staff, f"support.{body.status}", f"{verb} “{thread.subject}” from {thread.who}",
            target_kind="support", target_id=str(thread_id),
        )
        await conn.commit()
    return await _inbox_thread(conn, thread_id)
