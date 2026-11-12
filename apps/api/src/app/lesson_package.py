"""A bank lesson as ONE file: its board, every line's voice and the voice's word timings.

WHY (founder, 12 Nov 2026). A lesson that fetches its voice a line at a time, while it plays,
stops dead on a weak network: the student is left in front of a silent board and leaves. The
bank lessons are the same for every student, so nothing about them needs making while one is
watched. The voice is made once, ahead of time; the lesson goes down in a single download
with a progress bar; and once it is on the phone, it plays to the end with no network at all
(the phone keeps it: apps/web/src/prep/lessonPackage.ts).

THE FILE. Binary, so the audio is not inflated by base64:

    b"SPL1" | uint32 big-endian: length of the header | header (UTF-8 JSON) | the clips

The header is `{"version", "engine", "title", "subject", "lesson": NarratedLesson with no
voice URLs, "clips": [{"offset", "length", "words"} | null, one per beat]}`; offsets count
from the end of the header. A beat with no clip is read at the board's silent pace.

The version is a hash of everything in the file (the lesson, the doodles, the voice and how it
is made), so it is the file's ETag: a phone holding the current version is answered 304, a few
bytes, and plays what it has.

Kokoro clips go in at 32 kbps (`kokoro_voice.LITE_KBPS`): speech at 24 kHz loses nothing a
student would hear, and a lesson weighs about half what it would at the live voice's 64.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import struct
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app import voice_store
from app.config import Settings

_log = logging.getLogger(__name__)

MAGIC = b"SPL1"
#: Bumped when the file's layout changes, so every package is made again.
FORMAT = "1"

Voice = Literal["studio", "kokoro", "none"]


class Built(BaseModel):
    version: str
    data: bytes
    #: Every beat that should have a voice has one. An incomplete package is still served, so
    #: the lesson plays, but it is not kept on disk or on the phone: the next ask makes it again.
    complete: bool


def _folder() -> Path:
    where = voice_store.folder() / "packages"
    where.mkdir(parents=True, exist_ok=True)
    return where


def _clip_key(line: str, settings: Settings, engine: Voice) -> str:
    if engine == "none":
        return ""
    return voice_store.path_for(line, settings, engine).stem


def _lesson_json(beats: list[Any], doodles: list[Any]) -> dict[str, Any]:
    from app.routers.practice import LessonBeat, NarratedLesson

    return NarratedLesson(
        source="script",
        beats=[
            LessonBeat(
                board_index=beat.board_index,
                write=beat.write,
                write_at=beat.at,
                say=beat.say,
                voice_url="",  # The phone points it at the clip it unpacked.
                answer=beat.answer,
                point=beat.point,
                show_sketch=beat.show_sketch,
                doodle=beat.doodle,
                doodles=beat.doodles,
                doodle_do=beat.doodle_do,
                on=beat.on,
                section=beat.section,
                mouth=beat.mouth,
                diagram=beat.diagram,
                diagram_do=beat.diagram_do,
            )
            for beat in beats
        ],
        doodles=doodles,
    ).model_dump(mode="json")


class Lesson(BaseModel):
    """What goes into a package, read without making anything: enough to answer a 304."""

    model_config = {"arbitrary_types_allowed": True}

    version: str
    voice: Voice
    beats: list[Any]
    doodles: list[Any]
    #: The subtopic's and subject's names, so the lesson opens with no other request.
    title: str
    subject: str


async def describe(
    conn: AsyncConnection, subtopic_id: UUID, settings: Settings, engine: Voice
) -> Lesson | None:
    """The package's contents and version. None: the bank has no lesson for this subtopic."""
    from app.db import fetch_all
    from app.routers.roadmap import _bank_beats

    found = await _bank_beats(conn, subtopic_id)
    if found is None:
        return None
    beats, doodles = found
    names = await fetch_all(
        conn,
        """
        SELECT sub.name AS title, s.name AS subject
        FROM curriculum_items sub JOIN subjects s ON s.id = sub.subject_id
        WHERE sub.id = :sub
        """,
        sub=subtopic_id,
    )
    title = str(names[0]["title"]) if names else "Lesson"
    subject = str(names[0]["subject"]) if names else ""
    voice: Voice = voice_store.engine_for(engine, settings) if engine != "none" else "none"
    keys = [_clip_key(str(beat.say), settings, voice) for beat in beats]
    stamp = json.dumps(
        [
            FORMAT,
            voice,
            voice_store.LITE_RECIPE,
            title,
            subject,
            _lesson_json(beats, doodles),
            keys,
        ],
        sort_keys=True,
        default=str,
    )
    return Lesson(
        version=hashlib.sha256(stamp.encode()).hexdigest()[:24],
        voice=voice,
        beats=beats,
        doodles=doodles,
        title=title,
        subject=subject,
    )


async def build(
    conn: AsyncConnection,
    subtopic_id: UUID,
    settings: Settings,
    engine: Voice,
    patient: bool = False,
) -> Built | None:
    """The subtopic's lesson package, from disk when it was made before. None: no bank lesson."""
    found = await describe(conn, subtopic_id, settings, engine)
    if found is None:
        return None
    beats, doodles, voice, version = found.beats, found.doodles, found.voice, found.version
    kept = _folder() / f"{version}.spl"
    async with voice_store.making(f"package-{version}"):
        if kept.is_file():
            return Built(version=version, data=kept.read_bytes(), complete=True)
        if voice == "studio":
            # The hosted voice answers several at once: the lines are made four at a time
            # rather than one after another while the first student waits. (Kokoro runs one
            # line at a time on this server whatever is asked: voice_store._kokoro_turn.)
            said_lines = [str(beat.say).strip() for beat in beats if str(beat.say).strip()]
            await voice_store.voice_all(said_lines, settings, at_once=4, engine="studio")
        clips: list[dict[str, Any] | None] = []
        audio = bytearray()
        complete = True
        for beat in beats:
            said = str(beat.say).strip()
            if voice == "none" or not said:
                clips.append(None)
                continue
            path = await voice_store.packaged(said, settings, voice, patient=patient)
            if path is None:
                complete = False
                clips.append(None)
                continue
            data = path.read_bytes()
            clips.append(
                {
                    "offset": len(audio),
                    "length": len(data),
                    "words": (voice_store.timings(said, settings, voice) or {}).get("words"),
                }
            )
            audio += data
        header = json.dumps(
            {
                "version": version,
                "engine": voice,
                "title": found.title,
                "subject": found.subject,
                "lesson": _lesson_json(beats, doodles),
                "clips": clips,
            },
            separators=(",", ":"),
        ).encode()
        data = MAGIC + struct.pack(">I", len(header)) + header + bytes(audio)
        if complete:
            voice_store.write_atomically(kept, data)
        return Built(version=version, data=data, complete=complete)


async def warm_all(settings: Settings) -> None:
    """Make every bank lesson's package in the free voice, one line at a time, behind any
    student who is waiting on a voice (`patient`). Run at start-up; skips what is made."""
    from app.db import fetch_all, get_engine
    from app.kokoro_voice import available

    if not available(settings):
        return
    try:
        async with get_engine().connect() as conn:
            rows = await fetch_all(conn, "SELECT subtopic_id FROM subtopic_lesson_content")
            for row in rows:
                await build(conn, row["subtopic_id"], settings, "kokoro", patient=True)
    except asyncio.CancelledError:
        raise
    except Exception:  # A warm-up never takes the API down: the package is made when asked.
        _log.exception("warming the lesson packages stopped")
