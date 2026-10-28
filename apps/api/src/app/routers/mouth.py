"""The talking mouth's endpoints: a lesson beat's phonemes, and a tapped word said again.

The board's mouth (docs/plans/doodles-v2-contract.md section 7, apps/web/src/student/Mouth.tsx)
moves through a word's sound shapes in time with the voice. It asks for the beat's sounds
(`/phones`, beside `/words`), and when a student taps it, for the word said again slowly in the
free Kokoro voice (`/mouth/say`). Neither ever calls the paid voice (app/mouth_voice.py).
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncConnection

from app import mouth_voice, premium, voice_store
from app.auth import require_session_owner
from app.config import Settings, get_settings
from app.db import connection
from app.routers.practice import _lesson_beats, _lesson_is_open

router = APIRouter(prefix="/v1/practice", tags=["practice"])

#: A student may have this many new words made for them in a window; words already made are
#: free and not counted. Kokoro runs on the API's own CPU, one clip at a time.
WORDS_PER_WINDOW = 12
WINDOW_SECONDS = 60.0
_made_for: dict[UUID, list[float]] = {}


def _allow(session_id: UUID) -> bool:
    now = time.monotonic()
    recent = [at for at in _made_for.get(session_id, []) if now - at < WINDOW_SECONDS]
    if len(recent) >= WORDS_PER_WINDOW:
        _made_for[session_id] = recent
        return False
    _made_for[session_id] = [*recent, now]
    return True


@router.get(
    "/{session_id}/lesson/{question_version_id}/voice/{beat}/phones",
    summary="When each sound of one beat is said, for the talking mouth",
)
async def lesson_voice_phones(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    question_version_id: UUID,
    beat: int,
    engine: voice_store.Engine = "studio",
) -> dict[str, Any]:
    """`{engine, duration, estimated, words: [{w, start, end}], phones: [{p, start, end}]}`.

    `p` is IPA, times are seconds into the beat's clip. With the Kokoro voice the times are
    the model's own; with the studio voice the line is phonemized here and the sounds spread
    over the clip (`estimated`). Kokoro's clip is made if it is not yet (it is free); a studio
    clip is only read, never made here, so a beat whose studio clip is not made yet is a 404
    and the board asks again once it is playing.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_voice(conn, session_id)
    await _lesson_is_open(conn, session_id, question_version_id, whole=False)
    beats, _ = await _lesson_beats(conn, session_id, question_version_id, settings)
    if not 0 <= beat < len(beats):
        raise HTTPException(status_code=404, detail="no such beat")
    said = beats[beat].say
    if voice_store.engine_for(engine, settings) == "kokoro":
        await voice_store.voiced(said, settings, engine="kokoro")
    found = await asyncio.to_thread(mouth_voice.beat_phones, said, settings, engine)
    if found is None:
        raise HTTPException(status_code=404, detail="no sounds for this beat")
    return found


@router.get(
    "/{session_id}/mouth/say",
    summary="A short word said slowly in the free voice, with its sounds",
)
async def mouth_say(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_id: UUID,
    word: Annotated[str, Query(max_length=60)],
) -> dict[str, Any]:
    """`{engine: 'kokoro', word, duration, phones, audio}`; `audio` is the mp3 as a data URL.

    For the student who taps the mouth to hear its word again. At most three words, letters
    only. Kokoro only: where it is not on offer this is a 503, and the board moves the mouth
    without a voice. Words already made are kept and free; new ones are limited per sitting.
    """
    await require_session_owner(request, conn, session_id)
    await premium.check_voice(conn, session_id)
    cleaned = mouth_voice.clean_word(word)
    if cleaned is None:
        raise HTTPException(
            status_code=422,
            detail=f"a word or up to {mouth_voice.MAX_WORDS} words, letters only",
        )
    kept = await asyncio.to_thread(mouth_voice.word_kept, cleaned, settings)
    if kept is not None:
        return kept
    if voice_store.engine_for("kokoro", settings) != "kokoro":
        raise HTTPException(status_code=503, detail="the free voice is not on offer here")
    if not _allow(session_id):
        raise HTTPException(status_code=429, detail="too many new words; try again in a minute")
    async with voice_store.making(f"mouth|{cleaned}"):
        found = await asyncio.to_thread(mouth_voice.say_word, cleaned, settings)
    if found is None:
        raise HTTPException(status_code=503, detail="the free voice could not say it")
    return found
