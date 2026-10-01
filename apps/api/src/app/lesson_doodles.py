"""A written lesson's doodles, as the board gets them (migration 027).

A moment may bring a small picture onto the board, drawn by the pen beside a line: a library
doodle the web app carries itself, or one drawn for this question and stored with its lesson
(`question_lessons.doodles`). The loader checked both (database/lesson_doodles.py); here they
are read leniently — a doodle is decoration over a lesson that teaches without it, so one that
does not fit is dropped rather than taking the lesson down.
"""

from __future__ import annotations

import json
import re
from typing import Literal, get_args
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.lesson_cues import LessonCue, cue_of

#: As the loader allows: a caption is a few words.
MAX_CAPTION = 40
_NAME = re.compile(r"custom:\d{4}_q\d{2,3}_[a-z0-9][a-z0-9_-]*|[a-z0-9][a-z0-9_-]*")


#: Doodles v2 (docs/plans/doodles-v2-contract.md), as the loader allows them.
MAX_REPEAT = 50
MAX_OPS = 3
MAX_TEXT = 40
_ID = re.compile(r"[a-z][a-z0-9_]*")
_PART = re.compile(r"[a-z][a-z0-9_-]*")
DoodleSize = Literal["small", "medium", "scene"]
DoodleLayout = Literal["row", "grid", "cluster"]
DoodleOpName = Literal[
    "pulse",
    "circle",
    "highlight",
    "underline",
    "cross",
    "label",
    "arrow",
    "stage",
    "move",
    "fill",
    "grow",
    "shrink",
    "count",
    "group",
    "split",
    # A talking mouth says a word again (app/lesson_mouth.py).
    "say",
]
_OPS = frozenset(get_args(DoodleOpName))
#: What each action cannot go without.
_NEEDS: dict[str, tuple[str, ...]] = {
    "label": ("text",),
    "arrow": ("part",),
    "stage": ("stage",),
    "move": ("part", "path"),
    "fill": ("to",),
    "group": ("n", "text"),
    "split": ("n", "text"),
}


class RepeatKind(BaseModel):
    """One kind of small figure in a mixed community: its doodle, and how many."""

    name: str
    n: int


class DoodleRef(BaseModel):
    """The doodle a moment brings in: which, what is written under it, and which line it is by."""

    #: A library doodle's name ('lightbulb'), or the lesson's own ('custom:2011_q42_roof').
    name: str
    #: A few words written under it.
    caption: str | None = None
    #: The moment whose line it sits by; by default the moment's own.
    near: int | None = None
    #: Its handle in the lesson, which later moments' `doodle_do` name it by.
    id: str | None = None
    #: How big it is drawn: small (about 70px), medium (120px, the default) or a scene (320x200).
    size: DoodleSize | None = None
    #: A community of small figures drawn one by one: how many of `name`, or of each kind.
    repeat: int | list[RepeatKind] | None = None
    #: How a repeat is laid out (grid by default).
    layout: DoodleLayout | None = None
    #: The word it is drawn on, in the whiteboard style (app/lesson_cues.py).
    on: LessonCue | None = None


class DoodleOp(BaseModel):
    """Something the pen does to a doodle already on the board, during a later moment."""

    #: The doodle, by the id a moment gave it.
    id: str
    op: DoodleOpName
    #: The part of its art (`data-part`) acted on; the whole doodle without it.
    part: str | None = None
    #: A repeat group's first n figures.
    n: int | None = None
    #: The words written: a label, a group's name, a split's 'left | right'.
    text: str | None = None
    #: A fill's level, 0 to 1.
    to: float | None = None
    #: Where an arrow goes: a part of this doodle, or another doodle (`to_id`) or its part.
    to_part: str | None = None
    to_id: str | None = None
    #: The lesson's next drawing of it ('custom:YYYY_qNN_a2').
    stage: str | None = None
    #: The route (`data-path`) a move follows.
    path: str | None = None
    #: The level (`data-fill`) a fill raises, where the art has more than one.
    fill: str | None = None
    #: How much a grow or a shrink scales it.
    by: float | None = None
    #: The word a talking mouth says (`say`); its own word without it.
    word: str | None = None
    #: The sound a talking mouth holds as it says it (IPA), where it is another than its own.
    sound: str | None = None
    #: The word it is done on, in the whiteboard style (app/lesson_cues.py).
    on: LessonCue | None = None


class LessonDoodle(BaseModel):
    """A picture drawn for this question's lesson: SVG in the board's art format.

    Sent as text; the board cleans it again before drawing it (Doodle.tsx), and it was checked
    when it was loaded: nothing in it runs or fetches.
    """

    name: str
    svg: str
    alt_text: str | None = None


def _whole(value: object, least: int = 0) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= least:
        return value
    return None


def _fraction(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _words(value: object, most: int) -> str | None:
    if isinstance(value, bool) or not isinstance(value, str | int | float):
        return None
    return str(value).strip()[:most] or None


def _named(value: object, pattern: re.Pattern[str] = _PART) -> str | None:
    return value.strip() if isinstance(value, str) and pattern.fullmatch(value.strip()) else None


def _kinds(raw: list[object]) -> list[RepeatKind]:
    """A mixed repeat's kinds that fit, kept only as far as the most a repeat draws."""
    left, kept = MAX_REPEAT, []
    for kind in raw:
        if not isinstance(kind, dict):
            continue
        name, n = kind.get("name"), _whole(kind.get("n"), 1)
        if not isinstance(name, str) or not _NAME.fullmatch(name.strip()) or n is None:
            continue
        if left > 0:
            kept.append(RepeatKind(name=name.strip(), n=min(n, left)))
            left -= n
    return kept


def doodle_ref(raw: object) -> DoodleRef | None:
    """A moment's `doodle` as the board draws it, or None when it has none that fits."""
    if not isinstance(raw, dict):
        return None
    repeat: int | list[RepeatKind] | None = None
    kinds = raw.get("repeat")
    if isinstance(kinds, list):
        repeat = _kinds(kinds)
        if not repeat:
            return None
    elif (count := _whole(kinds, 1)) is not None:
        repeat = min(count, MAX_REPEAT)
    name = raw.get("name")
    if isinstance(repeat, list) and not (isinstance(name, str) and name.strip()):
        name = repeat[0].name
    if not isinstance(name, str) or not _NAME.fullmatch(name.strip()):
        return None
    caption = raw.get("caption")
    words = str(caption).strip()[:MAX_CAPTION] if isinstance(caption, str | int | float) else ""
    near = raw.get("near")
    line = near if isinstance(near, int) and not isinstance(near, bool) and near >= 0 else None
    size, layout = raw.get("size"), raw.get("layout")
    return DoodleRef(
        name=name.strip(),
        caption=words or None,
        near=line,
        id=_named(raw.get("id"), _ID),
        size=size if size in ("small", "medium", "scene") else None,
        repeat=repeat,
        layout=layout if repeat is not None and layout in ("row", "grid", "cluster") else None,
        on=cue_of(raw),
    )


def doodle_refs(raw: object) -> list[DoodleRef] | None:
    """A moment's `doodles` (one or two), or None when it has none that fits."""
    if not isinstance(raw, list):
        return None
    found = [ref for ref in (doodle_ref(item) for item in raw[:2]) if ref is not None]
    return found or None


def _doodle_op(raw: object, known: set[str]) -> DoodleOp | None:
    """One action, where it fits: a known op, on a doodle already up, with what it needs."""
    if not isinstance(raw, dict) or raw.get("op") not in _OPS:
        return None
    handle = _named(raw.get("id"), _ID)
    if handle is None or handle not in known:
        return None
    stage = raw.get("stage")
    op = DoodleOp(
        id=handle,
        op=raw["op"],
        part=_named(raw.get("part")),
        n=_whole(raw.get("n"), 1),
        text=_words(raw.get("text"), MAX_TEXT),
        to=_fraction(raw.get("to")),
        to_part=_named(raw.get("to_part")),
        to_id=_named(raw.get("to_id"), _ID),
        stage=stage.strip() if isinstance(stage, str) and _NAME.fullmatch(stage.strip()) else None,
        path=_named(raw.get("path")),
        fill=_named(raw.get("fill")),
        by=_fraction(raw.get("by")),
        word=_words(raw.get("word"), MAX_TEXT) if raw.get("op") == "say" else None,
        sound=_words(raw.get("sound"), 6) if raw.get("op") == "say" else None,
        on=cue_of(raw),
    )
    if op.to is not None:
        op.to = min(1.0, max(0.0, op.to))
    if op.by is not None:
        low, high = (1.1, 2.0) if op.op == "grow" else (0.5, 0.9)
        op.by = min(high, max(low, op.by))
    if op.to_id is not None and op.to_id not in known:
        op.to_id = None
    if op.op == "arrow" and op.to_part is None and op.to_id is None:
        return None
    if any(getattr(op, key) is None for key in _NEEDS.get(op.op, ())):
        return None
    return op


def doodle_actions(moments: list[object]) -> list[list[DoodleOp] | None]:
    """Each moment's `doodle_do` as the board plays it, or None where it has none that fits.

    An action is kept only where its doodle was brought in, with that id, by its moment or an
    earlier one; at most MAX_OPS to a moment.
    """
    known: set[str] = set()
    out: list[list[DoodleOp] | None] = []
    for moment in moments:
        if not isinstance(moment, dict):
            out.append(None)
            continue
        brought = [doodle_ref(moment.get("doodle"))] + (doodle_refs(moment.get("doodles")) or [])
        known.update(ref.id for ref in brought if ref is not None and ref.id)
        # A talking mouth's id too, which `say` (and `pulse`) act on.
        mouth = moment.get("mouth")
        if isinstance(mouth, dict) and (handle := _named(mouth.get("id"), _ID)):
            known.add(handle)
        raw = moment.get("doodle_do")
        found = (_doodle_op(item, known) for item in (raw if isinstance(raw, list) else []))
        acts = [op for op in found if op is not None][:MAX_OPS]
        out.append(acts or None)
    return out


def doodle_link(raw: object) -> tuple[str, str | None] | None:
    """A mark's link to a doodle (`to: {doodle, part?}`): its id and part, or None."""
    if not isinstance(raw, dict):
        return None
    handle = _named(raw.get("doodle"), _ID)
    return (handle, _named(raw.get("part"))) if handle else None


async def lesson_doodles(conn: AsyncConnection, version_id: UUID) -> list[LessonDoodle]:
    """The written lesson's own doodles, found the way the lesson itself is found.

    Read as `to_jsonb(l) -> 'doodles'`, so a database not yet migrated to 027 reads as a lesson
    with none instead of failing the lesson.
    """
    stored = (
        await conn.execute(
            text(
                """
                SELECT to_jsonb(l) -> 'doodles'
                FROM question_versions seen
                JOIN questions q ON q.id = seen.question_id
                JOIN question_lessons l
                  ON l.question_version_id IN (seen.id, q.current_version_id)
                WHERE seen.id = :v
                ORDER BY l.question_version_id = seen.id DESC
                LIMIT 1
                """
            ),
            {"v": version_id},
        )
    ).scalar()
    stored = json.loads(stored) if isinstance(stored, str) else stored
    doodles: list[LessonDoodle] = []
    for raw in stored if isinstance(stored, list) else []:
        try:
            doodles.append(LessonDoodle.model_validate(raw))
        except ValueError:
            continue
    return doodles
