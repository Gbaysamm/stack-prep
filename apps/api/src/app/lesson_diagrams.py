"""A written lesson's LIVE DIAGRAMS, as the board gets them (docs/plans/doodles-v2-contract.md
section 8).

A moment may bring in a diagram described as data (a graph, a Venn diagram, a pie or bar chart, a
histogram, a number line, a probability tree, a table, an ogive), which the board draws and
changes (apps/web/src/student/LiveDiagram.tsx), and act on diagrams already up (`diagram_do`).
The loader checked every field (database/lesson_diagrams.py); here they are passed on as they
were stored, each kind's own fields as they are, and read leniently: a diagram that does not fit
is dropped rather than taking the lesson down, since the working teaches without it.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from app.lesson_cues import LessonCue, cue_of

DiagramKind = Literal[
    "graph", "venn", "pie", "bar", "histogram", "numberline", "tree", "table", "ogive"
]
#: As the loader allows.
MAX_OPS = 3
_ID = re.compile(r"[a-z][a-z0-9_]*")


class LessonDiagram(BaseModel):
    """A live diagram: its id, its kind, and its kind's own fields as the loader stored them."""

    model_config = ConfigDict(extra="allow")

    id: str
    kind: DiagramKind
    caption: str | None = None
    size: Literal["medium", "scene"] | None = None
    #: The moment whose line it sits under, where it is not in the column beside the working.
    near: int | None = None
    #: The word it is drawn on, in the whiteboard style.
    on: LessonCue | None = None


class DiagramOp(BaseModel):
    """Something the pen does to a diagram already up: `op` and its own fields, as stored."""

    model_config = ConfigDict(extra="allow")

    id: str
    op: str
    part: str | None = None
    on: LessonCue | None = None


def _without_cue(raw: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in raw.items() if key not in ("on", "on_nth")}


def diagram_of(raw: object) -> LessonDiagram | None:
    """A stored moment's `diagram`, or None where it has none or it does not fit."""
    if not isinstance(raw, dict) or not _ID.fullmatch(str(raw.get("id", ""))):
        return None
    try:
        diagram = LessonDiagram.model_validate(_without_cue(raw))
    except ValidationError:
        return None
    diagram.on = cue_of(raw)
    return diagram


def diagram_actions(raw: object) -> list[DiagramOp] | None:
    """A stored moment's `diagram_do`, each action that fits, or None where there are none."""
    if not isinstance(raw, list):
        return None
    kept: list[DiagramOp] = []
    for item in raw[:MAX_OPS]:
        if not isinstance(item, dict) or not isinstance(item.get("op"), str):
            continue
        try:
            action = DiagramOp.model_validate(_without_cue(item))
        except ValidationError:
            continue
        action.on = cue_of(item)
        kept.append(action)
    return kept or None


def diagram_link(raw: object) -> tuple[str, str | None] | None:
    """A mark's `to: {diagram, part?}`: the diagram's id and the part, or None."""
    if not isinstance(raw, dict) or not isinstance(raw.get("diagram"), str):
        return None
    handle = raw["diagram"]
    if not _ID.fullmatch(handle):
        return None
    part = raw.get("part")
    return handle, part if isinstance(part, str) and part.strip() else None
