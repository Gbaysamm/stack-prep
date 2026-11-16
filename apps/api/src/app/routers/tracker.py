"""The project tracker (founder, 16 Nov 2026): the team's tasks, their steps and history, and this
server's deployments, on one page at /tracker.

No sign-in. Anyone with the link reads it. A signed-in admin changes it as themselves; anyone
else needs the edit key (the server's
TRACKER_EDIT_KEY, carried by the edit link and sent back as the X-Tracker-Key header), with the
editor's name in X-Tracker-Name for the history. Without a key set on the server, nobody can
change it. Deployments are written by the release script (database/record_deploy.py).
"""

from __future__ import annotations

import hmac
from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import admin_session
from app.config import get_settings
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/public/tracker", tags=["tracker"])

Status = Literal["todo", "doing", "waiting", "done", "committed", "deployed"]
STATUS_WORD = {
    "todo": "To do",
    "doing": "In progress",
    "waiting": "Waiting",
    "done": "Done",
    "committed": "Committed",
    "deployed": "Deployed",
}
FINISHED = ("done", "committed", "deployed")

#: Deployments shown on the page.
DEPLOYS_SHOWN = 20


def _may_edit(key: str | None) -> bool:
    wanted = get_settings().tracker_edit_key
    return bool(wanted) and key is not None and hmac.compare_digest(key.encode(), wanted.encode())


class Editor(BaseModel):
    name: str


async def _signed_in_admin(request: Request, conn: AsyncConnection) -> str | None:
    """The signed-in admin's name, or None: admins edit the tracker without the key."""
    try:
        staff = await admin_session(request, conn)
    except HTTPException:
        return None
    return staff.display_name


async def editor(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    x_tracker_key: Annotated[str | None, Header()] = None,
    x_tracker_name: Annotated[str | None, Header()] = None,
) -> Editor:
    """The person changing the tracker: a signed-in admin, or anyone with the edit key; their
    name goes in the history."""
    admin = await _signed_in_admin(request, conn)
    if admin is not None:
        return Editor(name=admin)
    if not _may_edit(x_tracker_key):
        raise HTTPException(status_code=403, detail="This link can only view the tracker.")
    name = " ".join((x_tracker_name or "").split())[:60] or "Someone"
    return Editor(name=name)


class Item(BaseModel):
    id: UUID
    title: str
    area: str
    status: Status
    owner: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None
    updated_by: str | None
    #: The day it is planned for: under Today from then until it is finished.
    planned_for: date | None
    steps: int
    steps_done: int


class Deployment(BaseModel):
    id: UUID
    sha: str
    target: str
    deployed_at: datetime
    changes: list[str]


class TrackerPage(BaseModel):
    can_edit: bool
    #: A signed-in admin's name: they edit under it, with no key and no name to give.
    editor_name: str | None = None
    items: list[Item]
    deployments: list[Deployment]


ITEMS = """
    SELECT i.id, i.title, i.area, i.status, i.owner, i.note, i.created_at, i.updated_at,
           i.done_at, i.updated_by, i.planned_for,
           (SELECT count(*) FROM tracker_steps s WHERE s.item_id = i.id) AS steps,
           (SELECT count(*) FROM tracker_steps s WHERE s.item_id = i.id AND s.done) AS steps_done
    FROM tracker_items i
"""


@router.get("", response_model=TrackerPage, summary="The tracker: tasks and deployments")
async def tracker(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    x_tracker_key: Annotated[str | None, Header()] = None,
) -> TrackerPage:
    admin = await _signed_in_admin(request, conn)
    items = await fetch_all(conn, ITEMS + " ORDER BY i.area, i.updated_at DESC")
    deploys = await fetch_all(
        conn,
        "SELECT id, sha, target, deployed_at, changes FROM deployments"
        " ORDER BY deployed_at DESC LIMIT :n",
        n=DEPLOYS_SHOWN,
    )
    return TrackerPage(
        can_edit=admin is not None or _may_edit(x_tracker_key),
        editor_name=admin,
        items=[Item(**row) for row in items],
        deployments=[Deployment(**{**row, "changes": list(row["changes"])}) for row in deploys],
    )


class Step(BaseModel):
    id: UUID
    text: str
    done: bool


class Activity(BaseModel):
    at: datetime
    by_name: str | None
    what: str


class ItemDetail(BaseModel):
    item: Item
    steps: list[Step]
    activity: list[Activity]


async def _detail(conn: AsyncConnection, item_id: UUID) -> ItemDetail:
    rows = await fetch_all(conn, ITEMS + " WHERE i.id = :id", id=item_id)
    if not rows:
        raise HTTPException(status_code=404, detail="no such task")
    steps = await fetch_all(
        conn,
        "SELECT id, text, done FROM tracker_steps WHERE item_id = :id"
        " ORDER BY position, created_at",
        id=item_id,
    )
    activity = await fetch_all(
        conn,
        "SELECT at, by_name, what FROM tracker_activity WHERE item_id = :id"
        " ORDER BY at DESC LIMIT 50",
        id=item_id,
    )
    return ItemDetail(
        item=Item(**rows[0]),
        steps=[Step(**s) for s in steps],
        activity=[Activity(**a) for a in activity],
    )


@router.get("/items/{item_id}", response_model=ItemDetail, summary="One task in full")
async def item(item_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]) -> ItemDetail:
    return await _detail(conn, item_id)


async def _log(conn: AsyncConnection, item_id: UUID, who: Editor, what: str) -> None:
    await fetch_all(
        conn,
        "INSERT INTO tracker_activity (item_id, by_name, what)"
        " VALUES (:id, :by, :what) RETURNING id",
        id=item_id,
        by=who.name,
        what=what[:500],
    )


async def _touch(conn: AsyncConnection, item_id: UUID, who: Editor) -> None:
    await fetch_all(
        conn,
        "UPDATE tracker_items SET updated_at = now(), updated_by = :by WHERE id = :id RETURNING id",
        by=who.name,
        id=item_id,
    )


def _clean(value: str | None, keep_lines: bool = False) -> str | None:
    if value is None:
        return None
    value = value.strip() if keep_lines else " ".join(value.split())
    return value or None


class ItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    area: str = Field(default="General", min_length=1, max_length=60)
    status: Status = "todo"
    owner: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=4000)
    planned_for: date | None = None


@router.post("/items", response_model=ItemDetail, summary="Add a task")
async def add_item(
    body: ItemIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> ItemDetail:
    rows = await fetch_all(
        conn,
        """
        INSERT INTO tracker_items (title, area, status, owner, note, planned_for, updated_by,
                                   done_at)
        VALUES (:title, :area, :status, :owner, :note, :planned_for, :by,
                CASE WHEN :status IN ('done', 'committed', 'deployed') THEN now() END)
        RETURNING id
        """,
        title=_clean(body.title),
        area=_clean(body.area) or "General",
        status=body.status,
        owner=_clean(body.owner),
        note=_clean(body.note, keep_lines=True),
        planned_for=body.planned_for,
        by=who.name,
    )
    item_id = rows[0]["id"]
    await _log(conn, item_id, who, "Added the task")
    await conn.commit()
    return await _detail(conn, item_id)


class ItemChange(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    area: str | None = Field(default=None, min_length=1, max_length=60)
    status: Status | None = None
    owner: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=4000)
    #: A day to plan it for, or null to take it off the plan.
    planned_for: date | None = None


@router.patch("/items/{item_id}", response_model=ItemDetail, summary="Change a task")
async def change_item(
    item_id: UUID,
    body: ItemChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> ItemDetail:
    before = (await _detail(conn, item_id)).item
    fields: dict[str, Any] = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        fields[key] = (
            _clean(value, keep_lines=key == "note")
            if isinstance(value, str) and key != "status"
            else value
        )
    for required in ("title", "area", "status"):
        if required in fields and not fields[required]:
            raise HTTPException(status_code=422, detail=f"{required} cannot be empty")
    changed = {k: v for k, v in fields.items() if getattr(before, k) != v}
    if not changed:
        return await _detail(conn, item_id)
    sets = ", ".join(f"{key} = :{key}" for key in changed)
    done_at = (
        ", done_at = CASE WHEN :status IN ('done', 'committed', 'deployed')"
        " THEN coalesce(done_at, now()) END"
        if "status" in changed
        else ""
    )
    await fetch_all(
        conn,
        f"UPDATE tracker_items SET {sets}{done_at}, updated_at = now(), updated_by = :by"
        " WHERE id = :id RETURNING id",
        **changed,
        by=who.name,
        id=item_id,
    )
    for key, value in changed.items():
        if key == "status":
            await _log(conn, item_id, who, f"Moved to {STATUS_WORD[value]}")
        elif key == "note":
            await _log(conn, item_id, who, "Changed the notes")
        elif key == "planned_for":
            await _log(
                conn,
                item_id,
                who,
                f"Planned for {value:%a %d %b}" if value else "Taken off the day's plan",
            )
        elif key == "owner":
            await _log(
                conn, item_id, who, f"Gave it to {value}" if value else "Cleared who is on it"
            )
        else:
            await _log(conn, item_id, who, f"Changed the {key} to “{value}”")
    await conn.commit()
    return await _detail(conn, item_id)


@router.delete("/items/{item_id}", status_code=204, summary="Remove a task")
async def remove_item(
    item_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> None:
    del who  # the key is what matters; a removed task keeps no history
    rows = await fetch_all(
        conn, "DELETE FROM tracker_items WHERE id = :id RETURNING id", id=item_id
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no such task")
    await conn.commit()


class StepIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@router.post("/items/{item_id}/steps", response_model=ItemDetail, summary="Add a step")
async def add_step(
    item_id: UUID,
    body: StepIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> ItemDetail:
    await _detail(conn, item_id)
    text = _clean(body.text) or ""
    await fetch_all(
        conn,
        """
        INSERT INTO tracker_steps (item_id, text, position)
        VALUES (:id, :text, (SELECT coalesce(max(position), 0) + 1 FROM tracker_steps
                             WHERE item_id = :id))
        RETURNING id
        """,
        id=item_id,
        text=text,
    )
    await _touch(conn, item_id, who)
    await _log(conn, item_id, who, f"Added the step “{text}”")
    await conn.commit()
    return await _detail(conn, item_id)


class StepChange(BaseModel):
    done: bool | None = None
    text: str | None = Field(default=None, min_length=1, max_length=300)


@router.patch("/steps/{step_id}", response_model=ItemDetail, summary="Tick or change a step")
async def change_step(
    step_id: UUID,
    body: StepChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> ItemDetail:
    rows = await fetch_all(
        conn,
        """
        UPDATE tracker_steps
           SET done = coalesce(:done, done), text = coalesce(:text, text)
         WHERE id = :id
        RETURNING item_id, text, done
        """,
        done=body.done,
        text=_clean(body.text),
        id=step_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no such step")
    item_id = rows[0]["item_id"]
    await _touch(conn, item_id, who)
    if body.done is not None:
        verb = "Ticked" if rows[0]["done"] else "Unticked"
        await _log(conn, item_id, who, f"{verb} “{rows[0]['text']}”")
    else:
        await _log(conn, item_id, who, f"Changed a step to “{rows[0]['text']}”")
    await conn.commit()
    return await _detail(conn, item_id)


@router.delete("/steps/{step_id}", response_model=ItemDetail, summary="Remove a step")
async def remove_step(
    step_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    who: Annotated[Editor, Depends(editor)],
) -> ItemDetail:
    rows = await fetch_all(
        conn, "DELETE FROM tracker_steps WHERE id = :id RETURNING item_id, text", id=step_id
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no such step")
    item_id = rows[0]["item_id"]
    await _log(conn, item_id, who, f"Removed the step “{rows[0]['text']}”")
    await conn.commit()
    return await _detail(conn, item_id)
