"""Parents (founder, 17-18 Nov 2026; migration 065): the student adds one, the parent confirms.

A student adds a parent or guardian by name and email (two at most). The parent gets an email
with a Confirm link; until they confirm nothing about the student goes to them. Confirming
records the consent (`consents`, `guardian_digest`, from the link). Then the parent gets the
weekly report and missed-days alerts (app/parent_email.py).

A student can take back an invitation that is still waiting, to fix a wrong address, but not
remove a parent who has confirmed: that would let a student hide from the reports. Changing a
confirmed parent goes through us (Messages).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncConnection

from app import parent_email
from app.auth import require_student
from app.db import connection, fetch_all, get_engine

router = APIRouter(prefix="/v1/student", tags=["parents"])
public_router = APIRouter(prefix="/v1/public/parents", tags=["parents"])

MOST = 2
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
Relationship = Literal["mother", "father", "guardian", "other"]
GONE = "That link is no longer valid. Ask them to send it again from Stack Prep."


class Parent(BaseModel):
    id: UUID
    name: str
    email: str
    relationship: Relationship
    status: Literal["pending", "active"]
    invited_at: datetime | None


class ParentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=200)
    relationship: Relationship


LIST = """
    SELECT gs.id, g.display_name AS name, g.email, gs.relationship_type AS relationship,
           gs.status, gs.invited_at
    FROM guardian_students gs JOIN guardians g ON g.id = gs.guardian_id
    WHERE gs.student_id = :s AND gs.status <> 'revoked'
    ORDER BY gs.created_at
"""


async def _invite_later(link_id: UUID, again: bool = False) -> None:
    async with get_engine().connect() as conn:
        await parent_email.send_invite(conn, link_id, again=again)


@router.get("/{student_id}/parents", response_model=list[Parent], summary="Your parents")
async def parents(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[Parent]:
    await require_student(request, conn, student_id)
    return [Parent(**row) for row in await fetch_all(conn, LIST, s=student_id)]


@router.post(
    "/{student_id}/parents", response_model=list[Parent], status_code=201, summary="Add a parent"
)
async def add_parent(
    request: Request,
    student_id: UUID,
    body: ParentIn,
    background: BackgroundTasks,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> list[Parent]:
    await require_student(request, conn, student_id)
    email = body.email.strip().lower()
    name = " ".join(body.name.split())
    if not EMAIL.match(email):
        raise HTTPException(
            status_code=422, detail="Enter their email address, like name@example.com."
        )
    own = await fetch_all(
        conn, "SELECT lower(email) AS email FROM students WHERE id = :s", s=student_id
    )
    if own and own[0]["email"] == email:
        raise HTTPException(status_code=422, detail="That is your own email. Enter your parent's.")
    now = await fetch_all(conn, LIST, s=student_id)
    if any(row["email"].lower() == email for row in now):
        raise HTTPException(status_code=409, detail="You have already added that email.")
    if len(now) >= MOST:
        raise HTTPException(status_code=409, detail=f"You can add {MOST} parents or guardians.")
    guardian = await fetch_all(
        conn,
        """
        INSERT INTO guardians (display_name, email, preferred_contact_method)
        VALUES (:n, :e, 'email') RETURNING id
        """,
        n=name,
        e=email,
    )
    link = await fetch_all(
        conn,
        """
        INSERT INTO guardian_students (guardian_id, student_id, relationship_type,
                                       can_receive_reports)
        VALUES (:g, :s, :r, false) RETURNING id
        """,
        g=guardian[0]["id"],
        s=student_id,
        r=body.relationship,
    )
    await conn.commit()
    background.add_task(_invite_later, link[0]["id"])
    return [Parent(**row) for row in await fetch_all(conn, LIST, s=student_id)]


@router.post(
    "/{student_id}/parents/{link_id}/resend", status_code=204, summary="Send the invitation again"
)
async def resend(
    request: Request,
    student_id: UUID,
    link_id: UUID,
    background: BackgroundTasks,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        """
        SELECT status, invited_at > now() - interval '10 minutes' AS recent
        FROM guardian_students WHERE id = :l AND student_id = :s
        """,
        l=link_id,
        s=student_id,
    )
    if not rows or rows[0]["status"] != "pending":
        raise HTTPException(status_code=404, detail="There is no invitation waiting.")
    if rows[0]["recent"]:
        raise HTTPException(
            status_code=429, detail="Sent a few minutes ago. Ask them to check spam."
        )
    background.add_task(_invite_later, link_id, True)


@router.delete(
    "/{student_id}/parents/{link_id}", status_code=204, summary="Take back an invitation"
)
async def take_back(
    request: Request,
    student_id: UUID,
    link_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        "SELECT status FROM guardian_students WHERE id = :l AND student_id = :s",
        l=link_id,
        s=student_id,
    )
    if not rows or rows[0]["status"] == "revoked":
        raise HTTPException(status_code=404, detail="There is no such parent.")
    if rows[0]["status"] == "active":
        raise HTTPException(
            status_code=409,
            detail="They have confirmed, so they stay. To change this, write to us in Messages.",
        )
    await fetch_all(
        conn,
        "UPDATE guardian_students SET status = 'revoked' WHERE id = :l RETURNING id",
        l=link_id,
    )
    await conn.commit()


# ------------------------------------------------------------------ the parent's side


class Invitation(BaseModel):
    student_name: str
    parent_name: str
    confirmed: bool


async def _invitation(conn: AsyncConnection, token: UUID) -> dict[str, object]:
    rows = await fetch_all(
        conn,
        """
        SELECT gs.id, gs.student_id, gs.guardian_id, gs.status, s.display_name AS student_name,
               g.display_name AS parent_name
        FROM guardian_students gs
        JOIN students s ON s.id = gs.student_id JOIN guardians g ON g.id = gs.guardian_id
        WHERE gs.invite_token = :t AND gs.status <> 'revoked'
        """,
        t=token,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=GONE)
    return rows[0]


@public_router.get("/{token}", response_model=Invitation, summary="An invitation, for its page")
async def invitation(
    token: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Invitation:
    row = await _invitation(conn, token)
    return Invitation(
        student_name=str(row["student_name"]),
        parent_name=str(row["parent_name"]),
        confirmed=row["status"] == "active",
    )


@public_router.post("/{token}/confirm", response_model=Invitation, summary="Confirm")
async def confirm(token: UUID, conn: Annotated[AsyncConnection, Depends(connection)]) -> Invitation:
    """The parent says yes. Confirming twice is fine."""
    row = await _invitation(conn, token)
    if row["status"] == "pending":
        await fetch_all(
            conn,
            """
            UPDATE guardian_students
               SET status = 'active', verified_at = now(), can_receive_reports = true
             WHERE id = :l RETURNING id
            """,
            l=row["id"],
        )
        await fetch_all(
            conn,
            """
            INSERT INTO consents (student_id, consent_type, granted, granted_by_guardian_id,
                                  source, evidence_note)
            VALUES (:s, 'guardian_digest', true, :l, 'guardian_link',
                    'Confirmed from the invitation email link')
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            s=row["student_id"],
            l=row["id"],
        )
        await conn.commit()
    return Invitation(
        student_name=str(row["student_name"]), parent_name=str(row["parent_name"]), confirmed=True
    )
