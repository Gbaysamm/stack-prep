"""Admin: the question writer's AI settings (app/ai_writer.py, migration 040).

An admin picks the provider (Anthropic or OpenAI) and model, pastes the API key, sets prices
and an optional monthly cap. The key is write-only: it is never sent back, only its last four
characters. Checking a key costs nothing (it lists the provider's models).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncConnection

from app import ai_writer, audit
from app.ai_writer import Provider
from app.auth import Staff, admin_session
from app.db import connection

router = APIRouter(
    prefix="/v1/admin/ai-writer", tags=["admin"], dependencies=[Depends(admin_session)]
)

_MODEL = re.compile(r"^[A-Za-z0-9._:/-]{1,80}$")


class KnownModelOut(BaseModel):
    id: str
    label: str
    input_usd_per_million: float
    output_usd_per_million: float
    note: str


class WriterSettingsOut(BaseModel):
    provider: Provider
    model: str
    key_set: bool
    key_hint: str | None
    #: A key is stored but this server can no longer open it: enter it again.
    key_unreadable: bool
    input_usd_per_million: float
    output_usd_per_million: float
    monthly_cap_usd: float | None
    spent_this_month_usd: float
    runs_this_month: int
    updated_at: datetime | None
    updated_by_name: str | None
    anthropic_models: list[KnownModelOut]


async def _out(conn: AsyncConnection) -> WriterSettingsOut:
    settings = await ai_writer.load(conn)
    spent, runs = await ai_writer.spent_this_month(conn)
    return WriterSettingsOut(
        provider=settings.provider,
        model=settings.model,
        key_set=settings.api_key_hint is not None,
        key_hint=settings.api_key_hint,
        key_unreadable=settings.key_unreadable,
        input_usd_per_million=settings.input_usd_per_million,
        output_usd_per_million=settings.output_usd_per_million,
        monthly_cap_usd=settings.monthly_cap_usd,
        spent_this_month_usd=round(spent, 4),
        runs_this_month=runs,
        updated_at=settings.updated_at,
        updated_by_name=settings.updated_by_name,
        anthropic_models=[KnownModelOut(**vars(m)) for m in ai_writer.ANTHROPIC_MODELS],
    )


@router.get("", response_model=WriterSettingsOut, summary="The question writer's AI settings")
async def read(conn: Annotated[AsyncConnection, Depends(connection)]) -> WriterSettingsOut:
    return await _out(conn)


class WriterSettingsIn(BaseModel):
    provider: Provider
    model: str
    #: Omitted (or null) keeps the stored key; "" removes it; anything else replaces it.
    api_key: str | None = None
    input_usd_per_million: float = Field(ge=0, le=1000)
    output_usd_per_million: float = Field(ge=0, le=1000)
    #: Null: no cap.
    monthly_cap_usd: float | None = Field(default=None, ge=0, le=100_000)


@router.put("", response_model=WriterSettingsOut, summary="Change the question writer's settings")
async def update(
    body: WriterSettingsIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    me: Annotated[Staff, Depends(admin_session)],
) -> WriterSettingsOut:
    model = body.model.strip()
    if not _MODEL.match(model):
        raise HTTPException(status_code=422, detail="Enter the model's name, like claude-opus-5-5.")
    current = await ai_writer.load(conn)
    key: str | object | None = ai_writer.KEEP
    if body.api_key is not None:
        typed = body.api_key.strip()
        if typed and (len(typed) < 20 or len(typed) > 400 or any(c.isspace() for c in typed)):
            raise HTTPException(status_code=422, detail="That doesn't look like an API key.")
        key = typed or None
    # A key belongs to one provider: switching provider needs that provider's key.
    if body.provider != current.provider and key is ai_writer.KEEP and current.api_key_hint:
        raise HTTPException(
            status_code=422,
            detail="Enter the API key for the new provider (the stored one is for the other).",
        )
    await ai_writer.save(
        conn,
        provider=body.provider,
        model=model,
        api_key=key,
        input_usd_per_million=body.input_usd_per_million,
        output_usd_per_million=body.output_usd_per_million,
        monthly_cap_usd=body.monthly_cap_usd,
        by=me.student_id,
    )
    what = f"{body.provider} {model}"
    if key is None:
        what += ", key removed"
    elif isinstance(key, str):
        what += f", new key ending {key[-4:]}"
    cap = "no cap" if body.monthly_cap_usd is None else f"cap US${body.monthly_cap_usd:,.2f}"
    await audit.record(conn, me, "ai_writer.settings", f"Question writer: {what}; {cap}")
    await conn.commit()
    return await _out(conn)


class KeyCheckIn(BaseModel):
    provider: Provider
    #: A key to try before saving it; omitted tries the stored one.
    api_key: str | None = None


class KeyCheckOut(BaseModel):
    ok: bool
    message: str
    models: list[str]


@router.post("/check", response_model=KeyCheckOut, summary="Check an API key (free)")
async def check(
    body: KeyCheckIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> KeyCheckOut:
    key = (body.api_key or "").strip()
    if not key:
        settings = await ai_writer.load(conn)
        if settings.provider != body.provider or not settings.api_key:
            return KeyCheckOut(ok=False, message="Enter a key to check.", models=[])
        key = settings.api_key
    result = await ai_writer.check_key(body.provider, key)
    return KeyCheckOut(ok=result.ok, message=result.message, models=result.models)
