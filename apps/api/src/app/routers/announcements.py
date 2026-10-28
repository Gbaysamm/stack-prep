"""Announcements: a message from the admin in the student app (migration 036).

A banner sits along the top of every page until the student closes it; a pop-up opens once,
the next time they come in. Each one goes to an audience (everyone, students without a plan,
students on a plan, or one class), from when it starts until it ends or is switched off.
Closing one is remembered per student, so it never comes back.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, admin_session, require_student
from app.db import connection, fetch_all
from app.routers.admin_reports import STUDENTS_ONLY

student_router = APIRouter(prefix="/v1/student", tags=["announcements"])
admin_router = APIRouter(
    prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)]
)

Kind = Literal["banner", "popup"]
Audience = Literal["all", "free", "paid", "ss1", "ss2", "ss3", "graduated"]
Tone = Literal["info", "good", "warning"]

AUDIENCE_WORDS: dict[str, str] = {
    "all": "everyone",
    "free": "students without a plan",
    "paid": "students on a plan",
    "ss1": "SS1 students",
    "ss2": "SS2 students",
    "ss3": "SS3 students",
    "graduated": "students who have left school",
}
NOT_FOUND = "We couldn't find that announcement."

#: Whether a student is in an announcement's audience (`a` the announcement, `s` the student).
IN_AUDIENCE = """
    (a.audience = 'all'
     OR (a.audience IN ('ss1', 'ss2', 'ss3', 'graduated') AND s.class_level = a.audience)
     OR (a.audience IN ('free', 'paid') AND (a.audience = 'paid') = EXISTS (
           SELECT 1 FROM premium_periods p JOIN premium_plans pl ON pl.id = p.plan_id
           WHERE p.student_id = s.id AND pl.kind = 'paid'
             AND p.starts_at <= now() AND p.ends_at > now())))
"""
SHOWING = "a.active AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now())"


class Announcement(BaseModel):
    id: UUID
    kind: Kind
    title: str
    body: str | None
    link_label: str | None
    link_url: str | None
    tone: Tone


# ------------------------------------------------------------------ the student


@student_router.get(
    "/{student_id}/announcements",
    response_model=list[Announcement],
    summary="Announcements for you",
)
async def for_student(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[Announcement]:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        f"""
        SELECT a.id, a.kind, a.title, a.body, a.link_label, a.link_url, a.tone
        FROM announcements a JOIN students s ON s.id = :student
        WHERE {SHOWING} AND {IN_AUDIENCE}
          AND NOT EXISTS (SELECT 1 FROM announcement_dismissals d
                          WHERE d.announcement_id = a.id AND d.student_id = s.id)
        ORDER BY a.starts_at DESC LIMIT 5
        """,
        student=student_id,
    )
    return [Announcement(**row) for row in rows]


@student_router.post(
    "/{student_id}/announcements/{announcement_id}/dismiss",
    status_code=204,
    summary="Close an announcement for good",
)
async def dismiss(
    request: Request,
    student_id: UUID,
    announcement_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Response:
    await require_student(request, conn, student_id)
    await conn.execute(
        text(
            """
            INSERT INTO announcement_dismissals (announcement_id, student_id)
            SELECT id, :student FROM announcements WHERE id = :id
            ON CONFLICT DO NOTHING
            """
        ),
        {"id": announcement_id, "student": student_id},
    )
    await conn.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ the admin


class AnnouncementIn(BaseModel):
    kind: Kind
    title: str = Field(min_length=1, max_length=80)
    body: str | None = Field(default=None, max_length=600)
    link_label: str | None = Field(default=None, max_length=30)
    link_url: str | None = Field(default=None, max_length=300)
    audience: Audience = "all"
    tone: Tone = "info"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    active: bool = True

    @model_validator(mode="after")
    def _sound(self) -> AnnouncementIn:
        self.title = " ".join(self.title.split())
        self.body = (self.body or "").strip() or None
        self.link_label = (self.link_label or "").strip() or None
        self.link_url = (self.link_url or "").strip() or None
        if bool(self.link_label) != bool(self.link_url):
            raise ValueError("A link needs both its words and where it goes.")
        if self.link_url and not (
            self.link_url.startswith("/") or self.link_url.startswith("https://")
        ):
            raise ValueError("A link goes to a page in the app (/plans) or an https:// address.")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("It has to end after it starts.")
        return self


class AdminAnnouncement(Announcement):
    audience: Audience
    starts_at: datetime
    ends_at: datetime | None
    active: bool
    created_at: datetime
    created_by_name: str | None
    #: showing, scheduled (starts later), ended, or off.
    state: Literal["showing", "scheduled", "ended", "off"]
    #: Students who closed it.
    dismissed: int
    #: Students it goes to now.
    reach: int


async def _all(conn: AsyncConnection, one: UUID | None = None) -> list[AdminAnnouncement]:
    rows = await fetch_all(
        conn,
        f"""
        SELECT a.id, a.kind, a.title, a.body, a.link_label, a.link_url, a.tone, a.audience,
               a.starts_at, a.ends_at, a.active, a.created_at, c.display_name AS created_by_name,
               CASE WHEN NOT a.active THEN 'off'
                    WHEN a.ends_at IS NOT NULL AND a.ends_at <= now() THEN 'ended'
                    WHEN a.starts_at > now() THEN 'scheduled'
                    ELSE 'showing' END AS state,
               (SELECT count(*) FROM announcement_dismissals d
                WHERE d.announcement_id = a.id) AS dismissed,
               (SELECT count(*) FROM students s
                WHERE {STUDENTS_ONLY} AND {IN_AUDIENCE}) AS reach
        FROM announcements a LEFT JOIN students c ON c.id = a.created_by
        WHERE (CAST(:one AS uuid) IS NULL OR a.id = :one)
        ORDER BY a.created_at DESC LIMIT 200
        """,
        one=one,
    )
    return [AdminAnnouncement(**row) for row in rows]


@admin_router.get(
    "/announcements", response_model=list[AdminAnnouncement], summary="Every announcement"
)
async def announcements(
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> list[AdminAnnouncement]:
    return await _all(conn)


def _values(body: AnnouncementIn) -> dict[str, Any]:
    return {**body.model_dump(exclude={"starts_at"}), "starts_at": body.starts_at}


def _summary(body: AnnouncementIn) -> str:
    kind = "pop-up" if body.kind == "popup" else "banner"
    return f"“{body.title}”, a {kind} for {AUDIENCE_WORDS[body.audience]}"


@admin_router.post(
    "/announcements", response_model=AdminAnnouncement, status_code=201, summary="Announce"
)
async def create(
    body: AnnouncementIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> AdminAnnouncement:
    new_id: UUID = (
        await conn.execute(
            text(
                """
                INSERT INTO announcements (kind, title, body, link_label, link_url, audience,
                                           tone, starts_at, ends_at, active, created_by)
                VALUES (:kind, :title, :body, :link_label, :link_url, :audience, :tone,
                        coalesce(:starts_at, now()), :ends_at, :active, :staff)
                RETURNING id
                """
            ),
            {**_values(body), "staff": staff.student_id},
        )
    ).scalar_one()
    await audit.record(
        conn, staff, "announcement.create", f"Announced {_summary(body)}",
        target_kind="announcement", target_id=str(new_id),
    )
    await conn.commit()
    return (await _all(conn, new_id))[0]


@admin_router.put(
    "/announcements/{announcement_id}", response_model=AdminAnnouncement, summary="Change one"
)
async def change(
    announcement_id: UUID,
    body: AnnouncementIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> AdminAnnouncement:
    updated = await conn.execute(
        text(
            """
            UPDATE announcements SET kind = :kind, title = :title, body = :body,
              link_label = :link_label, link_url = :link_url, audience = :audience,
              tone = :tone, starts_at = coalesce(:starts_at, starts_at), ends_at = :ends_at,
              active = :active
            WHERE id = :id
            """
        ),
        {**_values(body), "id": announcement_id},
    )
    if updated.rowcount == 0:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await audit.record(
        conn, staff, "announcement.change", f"Changed {_summary(body)}"
        + ("" if body.active else " (switched off)"),
        target_kind="announcement", target_id=str(announcement_id),
    )
    await conn.commit()
    return (await _all(conn, announcement_id))[0]


@admin_router.delete(
    "/announcements/{announcement_id}", status_code=204, summary="Delete one"
)
async def delete(
    announcement_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> Response:
    title: str | None = (
        await conn.execute(
            text("DELETE FROM announcements WHERE id = :id RETURNING title"),
            {"id": announcement_id},
        )
    ).scalar_one_or_none()
    if title is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await audit.record(
        conn, staff, "announcement.delete", f"Deleted the announcement “{title}”",
        target_kind="announcement", target_id=str(announcement_id),
    )
    await conn.commit()
    return Response(status_code=204)
