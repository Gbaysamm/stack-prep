"""The admin dashboard's API: everything here needs a signed-in admin (migration 031).

Staff: who is a reviewer or an admin. A role is granted to an account that already exists (the
person signs up as anyone does, then an admin promotes them by their login), and an admin cannot
take away their own admin role, so the dashboard can never be left with nobody to run it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import Staff, admin_session
from app.db import connection, fetch_all
from app.routers.accounts import normalise_login

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])

StaffRole = Literal["reviewer", "admin"]


class StaffMember(BaseModel):
    student_id: UUID
    display_name: str
    login: str | None
    role: StaffRole
    granted_at: datetime
    granted_by_name: str | None


class Grant(BaseModel):
    #: The email address or phone number the person signs in with.
    login: str
    role: StaffRole


STAFF_SQL = """
    SELECT r.student_id, s.display_name, coalesce(s.email, s.phone) AS login, r.role,
           r.granted_at, g.display_name AS granted_by_name
    FROM account_roles r
    JOIN students s ON s.id = r.student_id
    LEFT JOIN students g ON g.id = r.granted_by
"""


@router.get("/staff", response_model=list[StaffMember], summary="Reviewers and admins")
async def staff(conn: Annotated[AsyncConnection, Depends(connection)]) -> list[StaffMember]:
    rows = await fetch_all(conn, STAFF_SQL + " ORDER BY r.role, s.display_name")
    return [StaffMember(**row) for row in rows]


@router.post("/staff", response_model=StaffMember, summary="Make an account a reviewer or admin")
async def grant(
    body: Grant,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> StaffMember:
    login = normalise_login(body.login)
    if login is None:
        raise HTTPException(
            status_code=422, detail="Enter an email address or a Nigerian phone number."
        )
    kind, value = login
    student_id = (
        await conn.execute(
            text(f"SELECT id FROM students WHERE {kind} = :value AND status = 'active'"),
            {"value": value},
        )
    ).scalar_one_or_none()
    if student_id is None:
        raise HTTPException(
            status_code=404, detail="No account signs in with that. Ask them to sign up first."
        )
    if student_id == me.student_id and body.role != "admin":
        raise HTTPException(status_code=409, detail="You can't remove your own admin role.")
    await conn.execute(
        text(
            """
            INSERT INTO account_roles (student_id, role, granted_by)
            VALUES (:id, :role, :by)
            ON CONFLICT (student_id) DO UPDATE
              SET role = excluded.role, granted_by = excluded.granted_by, granted_at = now()
            """
        ),
        {"id": student_id, "role": body.role, "by": me.student_id},
    )
    await conn.commit()
    rows = await fetch_all(conn, STAFF_SQL + " WHERE r.student_id = :id", id=student_id)
    return StaffMember(**rows[0])


@router.delete("/staff/{student_id}", status_code=204, summary="Take away a staff role")
async def revoke(
    student_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> None:
    if student_id == me.student_id:
        raise HTTPException(status_code=409, detail="You can't remove your own admin role.")
    await conn.execute(text("DELETE FROM account_roles WHERE student_id = :id"), {"id": student_id})
    await conn.commit()
