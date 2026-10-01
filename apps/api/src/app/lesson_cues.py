"""A lesson item's cue: the word of its moment's `say` it lands on (database/lesson_cues.py).

Stored on a moment, a mark, a doodle or a doodle action as `on` (the words) and `on_nth`
(which time they are said, from 1; absent for the first). The board's whiteboard style brings
the item up as the voice reaches those words; the classic style ignores it.
"""

from __future__ import annotations

from pydantic import BaseModel

#: Long enough for a few words in a row; a cue is never a sentence.
MAX_CUE = 60


class LessonCue(BaseModel):
    #: The word, or a few words in a row, as they are said.
    word: str
    #: Which time they are said, from 1.
    nth: int = 1


def cue_of(raw: object) -> LessonCue | None:
    """The cue stored on `raw` (a moment, mark, doodle or action), or None where it has none."""
    if not isinstance(raw, dict):
        return None
    words = raw.get("on")
    if not isinstance(words, str) or not words.strip():
        return None
    nth = raw.get("on_nth")
    count = nth if isinstance(nth, int) and not isinstance(nth, bool) and nth >= 1 else 1
    return LessonCue(word=words.strip()[:MAX_CUE], nth=count)
