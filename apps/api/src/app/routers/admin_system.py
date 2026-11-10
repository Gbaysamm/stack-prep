"""The admin dashboard's System pages: settings, system health, and the audit log.

Settings are changed here and read by the app (a public subset at `/v1/app/settings`, for the
student app and the public site). System health says whether each part Stack Prep depends on is
there and set up: the database, migrations, email, payments, the coach and its voice.
"""

from __future__ import annotations

import os
import platform
import time
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import app_settings, audit, migrations, paystack
from app.auth import Staff, admin_session
from app.config import get_settings
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])
public = APIRouter(tags=["app"])


# ------------------------------------------------------------------ settings


class SettingOut(BaseModel):
    key: str
    kind: str
    label: str
    help: str
    group: str
    value: Any
    default: Any


class PublicSettings(BaseModel):
    signups_open: bool
    notice: str
    support_email: str
    support_whatsapp: str


def _said(value: Any) -> str:
    """A setting's value as a person would say it, for the audit log."""
    if isinstance(value, bool):
        return "on" if value else "off"
    if value == "":
        return "nothing"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return f"“{value}”" if isinstance(value, str) else str(value)


@router.get("/settings", response_model=list[SettingOut], summary="Every setting")
async def settings(conn: Annotated[AsyncConnection, Depends(connection)]) -> list[SettingOut]:
    values = await app_settings.all_values(conn)
    return [
        SettingOut(
            key=s.key, kind=s.kind, label=s.label, help=s.help, group=s.group,
            value=values[s.key], default=s.default,
        )
        for s in app_settings.SETTINGS
    ]


@router.put("/settings", response_model=list[SettingOut], summary="Change settings")
async def change_settings(
    body: dict[str, Any],
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> list[SettingOut]:
    try:
        changed = await app_settings.change(conn, body, staff.student_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    for key, (before, after) in changed.items():
        label = app_settings.BY_KEY[key].label
        await audit.record(
            conn, staff, "setting.change",
            f"Changed “{label}” from {_said(before)} to {_said(after)}",
            target_kind="setting", target_id=key, detail={"before": before, "after": after},
        )
    await conn.commit()
    return await settings(conn)


@public.get("/v1/app/settings", response_model=PublicSettings, summary="What the app shows")
async def public_settings(
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> PublicSettings:
    values = await app_settings.all_values(conn)
    return PublicSettings(**{key: values[key] for key in PublicSettings.model_fields})


# ------------------------------------------------------------------ health


class Check(BaseModel):
    name: str
    #: ok, warning (works, but needs attention), problem (broken or missing).
    state: str
    detail: str


class Health(BaseModel):
    checks: list[Check]
    environment: str
    python: str
    release: str | None
    database_size_mb: float
    counts: dict[str, int]
    checked_at: datetime


@router.get("/health", response_model=Health, summary="Is everything set up and working")
async def health(conn: Annotated[AsyncConnection, Depends(connection)]) -> Health:
    settings = get_settings()
    checks: list[Check] = []

    started = time.perf_counter()
    await conn.execute(text("SELECT 1"))
    took = (time.perf_counter() - started) * 1000
    checks.append(Check(
        name="Database",
        state="ok" if took < 200 else "warning",
        detail=f"Answering in {took:.0f} ms.",
    ))

    # The ledger exists once app.migrations has run; a database built another way (CI applies
    # the files with psql) has none, and then this check can only say it doesn't know.
    ledger = (
        await conn.execute(text("SELECT to_regclass('public.schema_migrations')"))
    ).scalar_one_or_none()
    if ledger is None:
        checks.append(Check(
            name="Database changes (migrations)",
            state="warning",
            detail="No migration ledger in this database, so which changes are applied is unknown.",
        ))
    else:
        applied = {
            row[0] for row in (
                await conn.execute(text("SELECT version FROM public.schema_migrations"))
            ).all()
        }
        pending = [m.version for m in migrations.discover() if m.version not in applied]
        checks.append(Check(
            name="Database changes (migrations)",
            state="ok" if not pending else "problem",
            detail="All applied." if not pending
            else f"Not applied yet: {', '.join(pending)}.",
        ))
    checks.append(Check(
        name="Email (password resets)",
        state="ok" if settings.smtp_host else "problem",
        detail=f"Sending through {settings.smtp_host}." if settings.smtp_host
        else "SMTP_HOST is not set: reset codes can't be emailed.",
    ))
    key = settings.paystack_secret_key
    checks.append(Check(
        name="Payments (Paystack)",
        state="ok" if paystack.configured() and settings.public_url else
        ("warning" if paystack.configured() else "problem"),
        detail=(
            ("Test mode" if key.startswith("sk_test_") else "Live")
            + (", returning to " + settings.public_url if settings.public_url
               else "; PUBLIC_URL is not set, so the return address comes from each request")
            + "."
        ) if paystack.configured() else "PAYSTACK_SECRET_KEY is not set: plans can't be bought.",
    ))
    coach_on = await app_settings.get(conn, "coach_enabled")
    checks.append(Check(
        name="The coach",
        state="ok" if settings.openai_api_key and coach_on else "warning",
        detail=(
            f"Answering with {settings.ai_runtime_model}." if settings.openai_api_key and coach_on
            else "Switched off in Settings." if not coach_on
            else "No AI key: students get the written working only."
        ),
    ))
    checks.append(Check(
        name="Lesson voice",
        state="ok" if (settings.ai_speak and settings.openai_api_key) or settings.ai_kokoro
        else "warning",
        detail=", ".join(
            part for part in (
                "studio voice on" if settings.ai_speak and settings.openai_api_key else None,
                "free voice (Kokoro) on" if settings.ai_kokoro else None,
            ) if part
        ) or "No voice: lessons are written only.",
    ))
    signups = await app_settings.get(conn, "signups_open")
    checks.append(Check(
        name="Sign-ups",
        state="ok" if signups else "warning",
        detail="Open." if signups else "Closed in Settings: nobody new can sign up.",
    ))

    size = (
        await conn.execute(text("SELECT pg_database_size(current_database())"))
    ).scalar_one()
    counts_row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT (SELECT count(*) FROM students) AS accounts,
                           (SELECT count(*) FROM deliverable_questions) AS questions,
                           (SELECT count(*) FROM attempts) AS answers,
                           (SELECT count(*) FROM mock_exams) AS mocks,
                           (SELECT count(*) FROM tutor_turns) AS coach_questions,
                           (SELECT count(*) FROM payments WHERE status = 'paid') AS payments
                    """
                )
            )
        )
        .mappings()
        .one()
    )
    return Health(
        checks=checks,
        environment=settings.app_env,
        python=platform.python_version(),
        release=os.environ.get("RELEASE") or os.environ.get("GIT_COMMIT"),
        database_size_mb=round(int(size) / 1_048_576, 1),
        counts={key: int(value) for key, value in counts_row.items()},
        checked_at=datetime.now().astimezone(),
    )


# ------------------------------------------------------------------ audit log


class AuditEntry(BaseModel):
    id: int
    actor_id: UUID | None
    actor_name: str
    action: str
    summary: str
    target_kind: str | None
    target_id: str | None
    detail: dict[str, Any] | None
    created_at: datetime


class AuditPage(BaseModel):
    entries: list[AuditEntry]
    #: Pass as `before` for the next page; null at the end.
    next_before: int | None
    actions: list[str]


@router.get("/audit", response_model=AuditPage, summary="What staff have done, newest first")
async def audit_log(
    conn: Annotated[AsyncConnection, Depends(connection)],
    actor_id: UUID | None = None,
    action: Annotated[str | None, Query(max_length=60)] = None,
    target_id: Annotated[str | None, Query(max_length=60)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    before: int | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditPage:
    conditions = ["TRUE"]
    params: dict[str, Any] = {"limit": limit + 1}
    if actor_id:
        conditions.append("actor_id = :actor")
        params["actor"] = actor_id
    if action:
        conditions.append("action LIKE :action")
        params["action"] = f"{action}%"
    if target_id:
        conditions.append("target_id = :target")
        params["target"] = target_id
    if q and q.strip():
        conditions.append("(summary ILIKE :q OR actor_name ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if before:
        conditions.append("id < :before")
        params["before"] = before
    rows = await fetch_all(
        conn,
        f"""
        SELECT id, actor_id, actor_name, action, summary, target_kind, target_id, detail,
               created_at
        FROM audit_log WHERE {" AND ".join(conditions)}
        ORDER BY id DESC LIMIT :limit
        """,
        **params,
    )
    actions = await fetch_all(conn, "SELECT DISTINCT action FROM audit_log ORDER BY action")
    more = len(rows) > limit
    rows = rows[:limit]
    return AuditPage(
        entries=[AuditEntry(**row) for row in rows],
        next_before=rows[-1]["id"] if more and rows else None,
        actions=[row["action"] for row in actions],
    )
