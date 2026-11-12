"""Spoken lines, made once and kept.

A lesson's words do not change between students, so neither does its audio. Each line is
voiced once and kept on disk under a name drawn from everything that decides how it sounds —
the words as spoken, the speech model, the voice and the reading instructions — so a second
student, or a second hearing, costs nothing, and a changed line is simply a new file.

Where it is kept: SPEECH_CACHE_DIR when set (the Docker deployment points it at a volume, so a
restart does not throw the audio away), otherwise `.local/speech` in the checkout, which is
untracked and survives a release.

Two voices share the folder. `studio` is the hosted, paid one; `kokoro` is made on this server
for nothing (app/kokoro_voice.py). A Kokoro clip's name starts from "kokoro|", so the two never
share a file, and its word timings are kept beside it as `<name>.words.json`.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from app import inworld_voice, kokoro_voice, tutor
from app.config import Settings, get_settings

#: A spoken moment or stretch of talk. Well past the longest a lesson is written with, once
#: its mathematics is said in words.
MAX_SPOKEN_CHARS = 2000

_REPO_ROOT = Path(__file__).resolve().parents[4]

#: One lock per line being made, so two requests for the same line make it once between them.
_MAKING: dict[str, asyncio.Lock] = {}


def making(key: str) -> asyncio.Lock:
    return _MAKING.setdefault(key, asyncio.Lock())


#: Kokoro runs on this server's processor: one line at a time. Several at once only shared the
#: same cores, so each took three times as long and the line a student was waiting for timed
#: out on the board. A line someone is waiting for goes ahead of lines made in advance.
_KOKORO = asyncio.Lock()
_waiting = 0


@asynccontextmanager
async def _kokoro_turn(patient: bool) -> AsyncIterator[None]:
    global _waiting
    if patient:
        # Made in advance: only when no student is waiting on a line.
        while True:
            while _waiting:
                await asyncio.sleep(0.05)
            await _KOKORO.acquire()
            if not _waiting:
                break
            _KOKORO.release()
    else:
        _waiting += 1
        try:
            await _KOKORO.acquire()
        finally:
            _waiting -= 1
    try:
        yield
    finally:
        _KOKORO.release()


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


Engine = Literal["studio", "kokoro", "inworld"]
#: The voices that keep each word's time beside the clip (the whiteboard reads them).
TIMED: frozenset[str] = frozenset({"kokoro", "inworld"})


def engine_for(asked: Engine, settings: Settings) -> Engine:
    """The voice a request will get: Kokoro or Inworld when asked for and on offer here, else
    studio (also while Inworld is refusing the account: inworld_voice.refusing)."""
    if asked == "kokoro" and kokoro_voice.available(settings):
        return "kokoro"
    if asked == "inworld" and inworld_voice.available(settings) and not inworld_voice.refusing():
        return "inworld"
    return "studio"


def path_for(line: str, settings: Settings, engine: Engine = "studio") -> Path:
    said = tutor.for_the_voice(line)
    if engine == "kokoro":
        key = (
            f"kokoro|{settings.kokoro_model}|{settings.kokoro_voice}|{settings.kokoro_speed}"
            f"|{kokoro_voice.RECIPE}|{said}"
        )
    elif engine == "inworld":
        key = (
            f"inworld|{settings.inworld_model}|{settings.inworld_voice}"
            f"|{inworld_voice.RECIPE}|{said}"
        )
    else:
        # Unchanged since before there were two voices, so every studio clip already kept
        # is still found.
        key = f"{settings.ai_speech_model}|{settings.ai_speech_voice}|{tutor.SPEECH_STYLE}|{said}"
    return folder() / f"{hashlib.sha256(key.encode()).hexdigest()}.mp3"


def words_path(clip: Path) -> Path:
    return clip.with_name(f"{clip.stem}.words.json")


#: How a package's copy of a Kokoro clip is made (kokoro_voice.LITE_KBPS); part of a package's
#: version, so a change makes every package again.
LITE_RECIPE = "lite-32k"


def lite_path(clip: Path) -> Path:
    return clip.with_name(f"{clip.stem}.lite.mp3")


def timings(line: str, settings: Settings, engine: Engine = "studio") -> dict[str, Any] | None:
    """When each word of a voiced line is said, if that was kept. Only Kokoro keeps it."""
    found = words_path(path_for(line, settings, engine_for(engine, settings)))
    if not found.is_file():
        return None
    try:
        kept: dict[str, Any] = json.loads(found.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return kept


async def _made_by_kokoro(
    line: str, settings: Settings, cached: Path, patient: bool = False
) -> Path | None:
    said = tutor.for_the_voice(line)
    if not said or len(said) > MAX_SPOKEN_CHARS:
        return None
    async with _kokoro_turn(patient):
        clip = await asyncio.to_thread(kokoro_voice.synthesize, said, settings)
    if clip is None:
        return None
    # The timings first: a clip found on disk is taken as finished, words and all.
    write_atomically(words_path(cached), kokoro_voice.dumps(clip))
    # And the talking mouth's sounds, from this same synthesis: asking for them later is then
    # a file read, never the model run again while the student is already hearing the line.
    from app import mouth_voice

    # In a thread: its British sounds come from espeak (app/phonemes_rp.py).
    await asyncio.to_thread(mouth_voice.keep_kokoro_phones, cached, clip)
    if clip.lite:
        write_atomically(lite_path(cached), clip.lite)
    write_atomically(cached, clip.mp3)
    return cached


async def _made_by_inworld(line: str, settings: Settings, cached: Path) -> Path | None:
    said = tutor.for_the_voice(line)
    if not said or len(said) > MAX_SPOKEN_CHARS:
        return None
    clip = await inworld_voice.synthesize(said, settings)
    if clip is None:
        return None
    # The timings first: a clip found on disk is taken as finished, words and all.
    write_atomically(words_path(cached), inworld_voice.dumps(clip))
    write_atomically(cached, clip.mp3)
    return cached


async def voiced(
    line: str, settings: Settings, patient: bool = False, engine: Engine = "studio"
) -> Path | None:
    """The line's audio file, made now if it has not been. None when there is no voice.

    `patient` when nobody is waiting on it: see `tutor.speak`. `engine` is the voice asked
    for; Kokoro, where this deployment does not offer it, is answered with the studio voice.
    Nothing paid is called for a Kokoro line that Kokoro can make.
    """
    engine = engine_for(engine, settings)
    cached = path_for(line, settings, engine)
    async with making(cached.stem):
        if cached.is_file():
            return cached
        if engine == "kokoro":
            return await _made_by_kokoro(line, settings, cached, patient=patient)
        if engine == "inworld":
            return await _made_by_inworld(line, settings, cached)
        audio = await tutor.speak(line, settings, max_chars=MAX_SPOKEN_CHARS, patient=patient)
        if audio is None:
            return None
        write_atomically(cached, audio)
        return cached


async def packaged(
    line: str, settings: Settings, engine: Engine, patient: bool = False
) -> Path | None:
    """The line's audio as a lesson package carries it: Kokoro's lighter copy, made again
    where the clip was kept before there were copies; the studio voice's clip as it is."""
    engine = engine_for(engine, settings)
    if engine == "inworld":
        return await voiced(line, settings, patient=patient, engine=engine)
    if engine != "kokoro":
        return await voiced(line, settings, patient=patient, engine=engine)
    cached = path_for(line, settings, engine)
    lite = lite_path(cached)
    if lite.is_file():
        return lite
    async with making(cached.stem):
        if not lite.is_file():
            await _made_by_kokoro(line, settings, cached, patient=patient)
    if lite.is_file():
        return lite
    return cached if cached.is_file() else None


async def voice_all(
    lines: list[str],
    settings: Settings,
    at_once: int = 2,
    patient: bool = False,
    engine: Engine = "studio",
) -> tuple[int, int]:
    """Make every line's audio, a few at a time. Returns (made or already there, failed)."""
    gate = asyncio.Semaphore(at_once)
    outcome = {"ok": 0, "failed": 0}

    async def one(line: str) -> None:
        async with gate:
            found = await voiced(line, settings, patient=patient, engine=engine)
            outcome["ok" if found is not None else "failed"] += 1

    await asyncio.gather(*(one(line) for line in lines), return_exceptions=True)
    return outcome["ok"], outcome["failed"]
