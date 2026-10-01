"""A written lesson's talking mouth, as the board gets it (docs/plans/doodles-v2-contract.md §7).

A moment may bring in a mouth that says a word in time with the voice, for oral English:
vowels, consonants, rhymes and stress. The loader checked it (database/lesson_mouth.py); here it
is read leniently, like a doodle: one that does not fit is dropped, and the lesson goes on.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from app.lesson_cues import LessonCue, cue_of

MAX_CAPTION = 40
MAX_WORD = 40
MAX_SYLLABLES = 8
_ID = re.compile(r"[a-z][a-z0-9_]*")


class LessonMouth(BaseModel):
    """The mouth a moment brings in, and the word it says."""

    #: Its handle in the lesson, which later moments' `doodle_do: {op: say}` name it by.
    id: str | None = None
    #: The word or short phrase it says.
    word: str
    #: The IPA symbol of the sound taught: the mouth holds its shape, with the symbol beside it.
    sound: str | None = None
    #: For stress: the word in syllables, and which is stressed (from 1).
    syllables: list[str] | None = None
    stress: int | None = None
    #: front (lips and teeth, the default) or side (the tongue's place, a cut-away).
    view: Literal["front", "side"] = "front"
    #: The word of `say` that starts it (its `word` by default).
    on: LessonCue | None = None
    caption: str | None = None


def _text(value: object, most: int) -> str | None:
    if isinstance(value, bool) or not isinstance(value, str | int | float):
        return None
    return str(value).strip()[:most] or None


def mouth_of(raw: object) -> LessonMouth | None:
    """A moment's `mouth`, or None where it has none that fits."""
    if not isinstance(raw, dict):
        return None
    word = _text(raw.get("word"), MAX_WORD)
    if word is None:
        return None
    handle = raw.get("id")
    syllables = raw.get("syllables")
    parts = (
        [part for part in (_text(s, MAX_WORD) for s in syllables[:MAX_SYLLABLES]) if part]
        if isinstance(syllables, list)
        else None
    )
    stress = raw.get("stress")
    stressed = (
        stress
        if parts
        and isinstance(stress, int)
        and not isinstance(stress, bool)
        and 1 <= stress <= len(parts)
        else None
    )
    return LessonMouth(
        id=handle.strip() if isinstance(handle, str) and _ID.fullmatch(handle.strip()) else None,
        word=word,
        sound=_text(raw.get("sound"), 6),
        syllables=parts or None,
        stress=stressed,
        view="side" if raw.get("view") == "side" else "front",
        on=cue_of(raw),
        caption=_text(raw.get("caption"), MAX_CAPTION),
    )
