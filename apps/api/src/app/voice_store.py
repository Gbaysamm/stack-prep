"""Spoken lines, made once and kept.

A lesson's words do not change between students, so neither does its audio. Each line is
voiced once and kept on disk under a name drawn from everything that decides how it sounds —
the words as spoken, the speech model, the voice and the reading instructions — so a second
student, or a second hearing, costs nothing, and a changed line is simply a new file.

Where it is kept: SPEECH_CACHE_DIR when set (the Docker deployment points it at a volume, so a
restart does not throw the audio away), otherwise `.local/speech` in the checkout, which is
untracked and survives a release.
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
from pathlib import Path

from app import tutor
from app.config import Settings, get_settings

#: A spoken moment or stretch of talk. Well past the longest a lesson is written with, once
#: its mathematics is said in words.
MAX_SPOKEN_CHARS = 2000

_REPO_ROOT = Path(__file__).resolve().parents[4]

#: One lock per line being made, so two requests for the same line make it once between them.
_MAKING: dict[str, asyncio.Lock] = {}


def making(key: str) -> asyncio.Lock:
    return _MAKING.setdefault(key, asyncio.Lock())


def folder() -> Path:
    configured = get_settings().speech_cache_dir.strip()
    where = Path(configured) if configured else _REPO_ROOT / ".local" / "speech"
    where.mkdir(parents=True, exist_ok=True)
    return where


def write_atomically(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(f".{secrets.token_hex(4)}.part")
    partial.write_bytes(data)
    partial.replace(path)


def path_for(line: str, settings: Settings) -> Path:
    said = tutor.for_the_voice(line)
    name = hashlib.sha256(
        f"{settings.ai_speech_model}|{settings.ai_speech_voice}|{tutor.SPEECH_STYLE}|{said}".encode()
    ).hexdigest()
    return folder() / f"{name}.mp3"


async def voiced(line: str, settings: Settings, patient: bool = False) -> Path | None:
    """The line's audio file, made now if it has not been. None when there is no voice.

    `patient` when nobody is waiting on it: see `tutor.speak`.
    """
    cached = path_for(line, settings)
    async with making(cached.stem):
        if cached.is_file():
            return cached
        audio = await tutor.speak(line, settings, max_chars=MAX_SPOKEN_CHARS, patient=patient)
        if audio is None:
            return None
        write_atomically(cached, audio)
        return cached


async def voice_all(
    lines: list[str], settings: Settings, at_once: int = 2, patient: bool = False
) -> tuple[int, int]:
    """Make every line's audio, a few at a time. Returns (made or already there, failed)."""
    gate = asyncio.Semaphore(at_once)
    outcome = {"ok": 0, "failed": 0}

    async def one(line: str) -> None:
        async with gate:
            found = await voiced(line, settings, patient=patient)
            outcome["ok" if found is not None else "failed"] += 1

    await asyncio.gather(*(one(line) for line in lines), return_exceptions=True)
    return outcome["ok"], outcome["failed"]
