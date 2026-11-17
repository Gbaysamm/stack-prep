"""The Inworld voice: Nigerian English (Emeka, Amara), made by Inworld's hosted TTS with the
time of every word, so the whiteboard writes and marks in step with it (wordClock.ts).

Founder, 12 Nov 2026: tried beside the studio and Kokoro voices, it was the first with a real
Nigerian accent, natural pauses and word timings. A third choice on the board's voice picker
(`engine=inworld`), not a replacement; where no key is configured the studio voice answers.

The key is INWORLD_API_KEY: the "Basic (Base64)" value from the Inworld portal, as copied.
Each line is made once and kept (voice_store.py), so a line is paid for once, whoever hears it.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import Settings

_log = logging.getLogger(__name__)

URL = "https://api.inworld.ai/tts/v1/voice"
#: Bumped when how a clip is asked for changes, so a kept clip is never one made another way.
RECIPE = "mp3-24k-48kbps|words"
TIMEOUT_SECONDS = 30.0
#: How long to wait to reach Inworld at all. Unreachable, every line would wait the full
#: timeout in turn while holding a database connection (17 Nov 2026: the Roadmap's lesson
#: downloads held them all and the whole app stalled).
CONNECT_SECONDS = 5.0
#: How long an unreachable Inworld is left alone before it is tried again.
UNREACHABLE_SECONDS = 120.0
#: How long an account refusal (no credit left, a wrong key) is believed before asking again.
REFUSAL_SECONDS = 300.0
#: An account refusal answers 401, 402 or 403 for every line, not just one.
_ACCOUNT_REFUSALS = frozenset({401, 402, 403})
_refused_until = 0.0


def refusing() -> bool:
    """True for a few minutes after Inworld refused the account (founder, 12 Nov 2026: with
    the credit used up every line failed one by one, so no lesson was ever whole, kept, or
    quick to open). Meanwhile the lines go to the studio voice instead (voice_store.engine_for)."""
    return time.monotonic() < _refused_until


def _refused(status: int) -> None:
    global _refused_until
    if status in _ACCOUNT_REFUSALS:
        _refused_until = time.monotonic() + REFUSAL_SECONDS


def available(settings: Settings) -> bool:
    return bool(settings.ai_inworld and settings.inworld_api_key.strip())


@dataclass
class Clip:
    mp3: bytes
    duration: float
    words: list[dict[str, Any]] = field(default_factory=list)

    def timings(self) -> dict[str, Any]:
        return {
            "engine": "inworld",
            "duration": round(self.duration, 3),
            "estimated": False,
            "words": self.words,
        }


def dumps(clip: Clip) -> bytes:
    return json.dumps(clip.timings(), ensure_ascii=False).encode()


def words_from(alignment: dict[str, Any]) -> list[dict[str, Any]]:
    """Inworld's word alignment as the board reads it: [{w, start, end}], spoken words only
    (it also times the spaces and punctuation between them)."""
    words = alignment.get("words") or []
    starts = alignment.get("wordStartTimeSeconds") or []
    ends = alignment.get("wordEndTimeSeconds") or []
    out: list[dict[str, Any]] = []
    for word, start, end in zip(words, starts, ends, strict=False):
        text = str(word).strip()
        if not any(ch.isalnum() for ch in text):
            continue
        out.append({"w": text, "start": round(float(start), 3), "end": round(float(end), 3)})
    return out


async def synthesize(said: str, settings: Settings) -> Clip | None:
    """The line spoken by the configured Inworld voice, with its word timings. None on any
    failure: the caller treats it as no voice, and the board reads the line along instead."""
    if not said.strip() or not available(settings) or refusing():
        return None
    body = {
        "text": said,
        "voiceId": settings.inworld_voice,
        "modelId": settings.inworld_model,
        "audioConfig": {"audioEncoding": "MP3", "sampleRateHertz": 24000, "bitRate": 48000},
        "timestampType": "WORD",
    }
    headers = {
        "Authorization": f"Basic {settings.inworld_api_key.strip()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT_SECONDS, connect=CONNECT_SECONDS)) as client:
            response = await client.post(URL, json=body, headers=headers)
        if response.status_code != 200:
            _log.warning("inworld refused: %s %s", response.status_code, response.text[:200])
            _refused(response.status_code)
            return None
        reply = response.json()
        audio = base64.b64decode(reply["audioContent"])
    except Exception as failed:
        _log.warning("inworld failed: %s: %s", type(failed).__name__, failed)
        if isinstance(failed, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)):
            # Not reachable: the next lines go to the studio voice for a while, not one by one
            # into the same wait.
            global _refused_until
            _refused_until = time.monotonic() + UNREACHABLE_SECONDS
        return None
    alignment = (reply.get("timestampInfo") or {}).get("wordAlignment") or {}
    words = words_from(alignment)
    ends = alignment.get("wordEndTimeSeconds") or []
    duration = float(max(ends)) if ends else (words[-1]["end"] if words else 0.0)
    return Clip(audio, duration, words)
