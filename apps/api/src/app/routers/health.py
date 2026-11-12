"""Liveness and version information."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import inworld_voice, kokoro_voice
from app.config import Settings, get_settings
from app.db import database_is_reachable
from engine import ENGINE_VERSION

router = APIRouter(tags=["system"])


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    environment: str
    api_version: str
    engine_version: str
    database: Literal["reachable", "unreachable"]


@router.get("/health", response_model=Health, summary="Service health")
async def health() -> Health:
    from app.main import API_VERSION

    reachable = await database_is_reachable()
    return Health(
        status="ok" if reachable else "degraded",
        environment=get_settings().app_env,
        api_version=API_VERSION,
        engine_version=ENGINE_VERSION,
        database="reachable" if reachable else "unreachable",
    )


class Features(BaseModel):
    """What this deployment has switched on, for a client deciding what to render."""

    #: The coach speaks its explanation aloud.
    coach_voice: bool
    #: The student may ask by speaking instead of typing. A client asks rather than assumes,
    #: so a deployment that has switched it off never has the button drawn against it.
    student_voice: bool
    #: The free Kokoro voice can be asked for (`engine=kokoro`) on the lesson's voice.
    kokoro_voice: bool = False
    #: The Inworld voice (Nigerian English) can be asked for (`engine=inworld`).
    inworld_voice: bool = False


@router.get("/v1/features", response_model=Features, summary="What is switched on here")
async def features(settings: Annotated[Settings, Depends(get_settings)]) -> Features:
    return Features(
        coach_voice=settings.ai_speak,
        student_voice=settings.ai_listen,
        kokoro_voice=kokoro_voice.available(settings),
        inworld_voice=inworld_voice.available(settings),
    )
