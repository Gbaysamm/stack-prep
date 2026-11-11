"""A lesson's DOODLES: small hand-drawn pictures on the board, checked before loading.

Shared by load_retranscribed_maths.py and load_retranscribed_english.py, so the two agree on
what a doodle may be. (The marks and sketches have their own module, lesson_marks.py.)

A moment may bring a doodle onto the board, drawn by the pen beside the line it belongs to:

    doodle: {name: 'custom:2011_q42_roof', caption: 'ridged, in folds', near: 1}

`name` is either

* `custom:YYYY_qNN_x` — a picture drawn for THIS question, to make its content make sense (a
  wavy corrugated roofing sheet on a little house for "corrugated"). The file is
  docs/questions/utme/<mathematics|english>/doodles/YYYY_qNN_x.svg, where YYYY_qNN is the
  lesson's own year and number and x a short lower-case tag (letters, digits, - or _). This is
  the main use; or
* a LIBRARY doodle's name — apps/web/src/student/doodles/<name>.svg, the board's shared set
  (a lightbulb, a calendar, a tipping scale).

`caption` (optional) is a few words written under the picture in the handwriting font: at most
MAX_CAPTION characters. `near` (optional) is the line it sits beside: a moment's index from 0,
this moment or an earlier one, and a moment that writes a line. Without it, the doodle sits by
this moment's own line, or where this moment writes nothing, by the latest line before it.

THE ART FORMAT (see check_doodle): one <svg> with viewBox "0 0 120 120" and an aria-label that
describes it (what a screen reader says, and the picture's alt text), drawn in strokes —
path, circle, ellipse, line, polyline, polygon, rect, g, text (and tspan) only. Groups may
carry `data-anim` (bob, blink, wiggle, pulse, sway, spin-slow, shake, pop), `data-origin="x y"`
and `data-react` (wiggle, shake, pop), which the board plays once the picture is drawn. The
board cleans the markup again before it draws it (Doodle.tsx); nothing that runs or fetches
gets past either.

Every custom doodle file must belong to a written lesson and be used by one of its moments (or
be a later stage of one of its doodles): a picture drawn and never shown is a mistake worth
hearing about.

DOODLES V2 (docs/plans/doodles-v2-contract.md). A doodle may also carry an `id` (so later moments
can act on it), a `size` (small, medium, scene) and a `repeat` (a community of small figures,
with a `layout`); a moment may bring in two with `doodles: [..]`, and act on earlier ones with
`doodle_do: [{id, op, ...}]` (at most MAX_OPS). The art may name its parts (`data-part` on a
group), a route for `move` (`data-path` on a path that is not drawn) and a level for `fill`
(`data-fill` on a group holding a closed shape, and optionally its starting `data-level`, 0 to
1). A board line may link to a doodle's part: `to: {doodle: <id>, part: <name>}` in a mark.
DoodleBook follows one lesson's doodles through its moments and checks all of this.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lesson_marks import check_sketch
from lesson_mouth import clean_mouth, clean_say

ROOT = Path(__file__).resolve().parent.parent
#: The board's shared doodles: <name>.svg, read by the web app's doodles/index.ts.
LIBRARY_DIR = ROOT / "apps" / "web" / "src" / "student" / "doodles"
#: The longest caption written under a doodle, in characters.
MAX_CAPTION = 40
#: The elements a doodle is drawn with. (title and desc are allowed and ignored.)
DOODLE_TAGS = {
    "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text",
    "tspan", "title", "desc",
}
ANIMS = {"bob", "blink", "wiggle", "pulse", "sway", "spin-slow", "shake", "pop"}
REACTS = {"wiggle", "shake", "pop"}
_KEYS = {"name", "caption", "near", "id", "size", "repeat", "layout"}
_CUSTOM = re.compile(r"custom:(\d{4})_q(\d{2,3})_([a-z0-9][a-z0-9_-]*)")
_FILE = re.compile(r"(\d{4})_q(\d{2,3})_([a-z0-9][a-z0-9_-]*)\.svg")
#: A subtopic lesson's own doodle (docs/lessons/subtopics/<subject>/doodles/sub_<slug>_x.svg),
#: named custom:sub_<slug>_x. Such a lesson is checked with year and number 0.
_SUB = re.compile(r"custom:sub_[a-z0-9][a-z0-9_-]*")
SUBTOPIC = 0
_LIBRARY_NAME = re.compile(r"[a-z0-9][a-z0-9_-]*")
#: A doodle's handle in its lesson, a part's name in its art, and a route's or a level's.
_ID = re.compile(r"[a-z][a-z0-9_]*")
_PART = re.compile(r"[a-z][a-z0-9-]*")
_ROUTE = re.compile(r"[a-z][a-z0-9_-]*")
SIZES = {"small", "medium", "scene"}
LAYOUTS = {"row", "grid", "cluster"}
#: The most small figures a `repeat` draws, and the most actions on one moment.
MAX_REPEAT = 50
MAX_OPS = 3
#: The longest words an action writes (a label, a group's name, both sides of a split).
MAX_TEXT = 40
#: A scene's art: its viewBox, and how big its file may be (about 8 KB).
SCENE_VIEWBOX = (0.0, 0.0, 320.0, 200.0)
SCENE_MAX_BYTES = 8704
#: What each action is, and the keys it takes beyond `id` and `op` (required ones first).
OPS: dict[str, tuple[set[str], set[str]]] = {
    "pulse": (set(), {"part", "n"}),
    "circle": (set(), {"part", "n", "text"}),
    "highlight": (set(), {"part", "n", "text"}),
    "underline": (set(), {"part", "n", "text"}),
    "cross": (set(), {"part", "n", "text"}),
    "label": ({"text"}, {"part", "n"}),
    "arrow": ({"part"}, {"to_part", "to_id", "text"}),
    "stage": ({"stage"}, set()),
    "move": ({"part", "path"}, set()),
    "fill": ({"to"}, {"fill"}),
    "grow": (set(), {"part", "by"}),
    "shrink": (set(), {"part", "by"}),
    "count": (set(), {"n"}),
    "group": ({"n", "text"}, set()),
    "split": ({"n", "text"}, set()),
}
#: The actions that only a `repeat` group takes, and those it cannot.
GROUP_OPS = {"count", "group", "split"}
_NOT_ON_GROUP = {"stage", "move", "fill", "arrow"}


def check_doodle(svg: str, where: str) -> dict[str, str]:
    """A doodle file, checked, as it is stored with its lesson: {svg, alt_text}.

    Everything a sketch is checked for (well-formed, a viewBox, an aria-label, nothing that
    runs, embeds or fetches: lesson_marks.check_sketch), and then the doodle's own rules: only
    the elements it is drawn with, and only the animations the board knows.
    """
    checked = check_sketch(svg, where)
    root = ET.fromstring(svg)
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in DOODLE_TAGS:
            raise SystemExit(f"{where}: a doodle is drawn with {sorted(DOODLE_TAGS)}, not <{tag}>")
        anim = element.get("data-anim")
        if anim is not None and not set(anim.split()) <= ANIMS:
            raise SystemExit(f"{where}: data-anim {anim!r} is not one of {sorted(ANIMS)}")
        react = element.get("data-react")
        if react is not None and react.strip() not in REACTS:
            raise SystemExit(f"{where}: data-react {react!r} is not one of {sorted(REACTS)}")
        origin = element.get("data-origin")
        if origin is not None and not re.fullmatch(r"\s*-?[\d.]+[\s,]+-?[\d.]+\s*", origin):
            raise SystemExit(f"{where}: data-origin is two numbers, 'x y' ({origin!r})")
    art_info(svg, where)
    return {"svg": str(checked["svg"]), "alt_text": str(checked["alt_text"])}


_CLOSED = {"path", "circle", "ellipse", "rect", "polygon"}


@dataclass
class ArtInfo:
    """What actions can find in a doodle's art: its viewBox, parts, routes and levels."""

    view_box: tuple[float, ...] | None
    parts: set[str] = field(default_factory=set)
    paths: set[str] = field(default_factory=set)
    fills: set[str] = field(default_factory=set)
    size: int = 0


def art_info(svg: str, where: str) -> ArtInfo:
    """The art's named parts (`data-part`), routes (`data-path`) and levels (`data-fill`), checked.

    A part is any shape or group but the whole picture, named [a-z][a-z0-9-]*, once in the file.
    A route is a <path> that is not drawn (stroke="none" fill="none"). A level is a group
    holding the closed shape it rises in, and may say where it starts (`data-level`, 0 to 1).
    """
    root = ET.fromstring(svg)
    found = re.search(
        r'viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)', svg
    )
    info = ArtInfo(
        view_box=tuple(float(n) for n in found.groups()) if found else None,
        size=len(svg.strip().encode("utf-8")),
    )
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        tag = element.tag.rsplit("}", 1)[-1]
        part = element.get("data-part")
        if part is not None:
            if element is root:
                raise SystemExit(f"{where}: data-part names a piece of the picture, not all of it")
            if not _PART.fullmatch(part):
                raise SystemExit(f"{where}: data-part {part!r} is named [a-z][a-z0-9-]*")
            if part in info.parts:
                raise SystemExit(f"{where}: two parts are called {part!r}")
            info.parts.add(part)
        route = element.get("data-path")
        if route is not None:
            if tag != "path":
                raise SystemExit(f"{where}: data-path goes on a <path>, not <{tag}>")
            if not _ROUTE.fullmatch(route):
                raise SystemExit(f"{where}: data-path {route!r} is named [a-z][a-z0-9_-]*")
            if (element.get("stroke") or "").strip() != "none" or (
                element.get("fill") or ""
            ).strip() != "none":
                raise SystemExit(
                    f"{where}: the route {route!r} is not drawn: stroke=\"none\" fill=\"none\""
                )
            if route in info.paths:
                raise SystemExit(f"{where}: two routes are called {route!r}")
            info.paths.add(route)
        level = element.get("data-fill")
        if level is not None:
            if tag != "g":
                raise SystemExit(f"{where}: data-fill goes on a <g> holding the shape, not <{tag}>")
            if not _ROUTE.fullmatch(level):
                raise SystemExit(f"{where}: data-fill {level!r} is named [a-z][a-z0-9_-]*")
            if not any(
                isinstance(inner.tag, str) and inner.tag.rsplit("}", 1)[-1] in _CLOSED
                for inner in element.iter()
                if inner is not element
            ):
                raise SystemExit(f"{where}: data-fill {level!r} holds no closed shape to fill")
            if level in info.fills:
                raise SystemExit(f"{where}: two levels are called {level!r}")
            start = element.get("data-level")
            if start is not None:
                try:
                    value = float(start)
                except ValueError:
                    value = -1.0
                if not 0 <= value <= 1:
                    raise SystemExit(f"{where}: data-level is a fraction, 0 to 1 ({start!r})")
            info.fills.add(level)
        elif element.get("data-level") is not None:
            raise SystemExit(f"{where}: data-level goes with data-fill")
    return info


def library_names(folder: Path = LIBRARY_DIR) -> set[str]:
    """The names of the board's shared doodles."""
    return {file.stem for file in folder.glob("*.svg")} if folder.is_dir() else set()


def read_custom_doodles(folder: Path, year: int, number: int) -> list[dict[str, str]]:
    """The doodles drawn for one question, checked: [{name, svg, alt_text}], by file name."""
    if not folder.is_dir():
        return []
    found: list[dict[str, str]] = []
    for file in sorted(folder.glob(f"{year}_q{number:02d}_*.svg")):
        if not _FILE.fullmatch(file.name):
            continue
        checked = check_doodle(file.read_text(encoding="utf-8"), f"doodles/{file.name}")
        found.append({"name": f"custom:{file.stem}", **checked})
    return found


def read_subtopic_doodles(folder: Path, slug: str) -> list[dict[str, str]]:
    """The doodles drawn for one subtopic lesson, checked: [{name, svg, alt_text}]."""
    if not folder.is_dir():
        return []
    found: list[dict[str, str]] = []
    for file in sorted(folder.glob(f"sub_{slug}_*.svg")):
        checked = check_doodle(file.read_text(encoding="utf-8"), f"doodles/{file.name}")
        found.append({"name": f"custom:{file.stem}", **checked})
    return found


def check_doodle_files(folder: Path, lessons: set[tuple[int, int]]) -> None:
    """Every doodle file is named YYYY_qNN_x.svg and has a written lesson to go with."""
    for file in sorted(folder.glob("*")) if folder.is_dir() else []:
        named = _FILE.fullmatch(file.name)
        if not named:
            raise SystemExit(f"doodles/{file.name}: named YYYY_qNN_x.svg (x: a short tag)")
        if (int(named.group(1)), int(named.group(2))) not in lessons:
            raise SystemExit(f"doodles/{file.name}: there is no written lesson for it to go with")


def _doodle_name(
    name: object, library: set[str], custom: set[str], year: int, number: int, where: str
) -> str:
    """A doodle's name, checked: this question's own (custom:YYYY_qNN_x) or the library's."""
    if not isinstance(name, str) or not name.strip():
        raise SystemExit(f"{where}: a doodle needs a name")
    name = name.strip()
    if name.startswith("custom:") and year == SUBTOPIC:
        if not _SUB.fullmatch(name):
            raise SystemExit(f"{where}: a lesson's own doodle is named custom:sub_<lesson>_x")
        if name not in custom:
            raise SystemExit(f"{where}: {name}, but there is no doodles/{name[7:]}.svg")
    elif name.startswith("custom:"):
        found = _CUSTOM.fullmatch(name)
        if not found:
            raise SystemExit(f"{where}: a custom doodle is named custom:YYYY_qNN_x ({name!r})")
        if (int(found.group(1)), int(found.group(2))) != (year, number):
            raise SystemExit(f"{where}: {name} is not this question's (it is {year} Q{number})")
        if name not in custom:
            raise SystemExit(f"{where}: {name}, but there is no doodles/{name[7:]}.svg")
    elif not _LIBRARY_NAME.fullmatch(name) or name not in library:
        raise SystemExit(
            f"{where}: no doodle {name!r} in the library "
            f"(apps/web/src/student/doodles/); a question's own is custom:YYYY_qNN_x"
        )
    return name


def _count(value: object, where: str, what: str, least: int = 1) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < least:
        raise SystemExit(f"{where}: {what} is a whole number, {least} or more")
    return value


def library_art(name: str, folder: Path = LIBRARY_DIR) -> str | None:
    """A library doodle's art, or None where there is no such file."""
    file = folder / f"{name}.svg"
    return file.read_text(encoding="utf-8") if file.is_file() else None


def clean_doodle(
    value: object,
    index: int,
    writes: list[bool],
    library: set[str],
    custom: set[str],
    year: int,
    number: int,
    where: str,
    svgs: dict[str, str] | None = None,
) -> dict[str, object]:
    """A doodle a moment brings in, checked, as it is stored.

    {name, id?, size?, repeat?, layout?, caption?, near?}. `writes` says, for each moment up to
    and including this one, whether it writes a line; `library` is the shared doodles' names and
    `custom` the names of this lesson's own ('custom:YYYY_qNN_x'). `svgs` is the lesson's own
    art by name, where the caller has it: a scene is then checked for its viewBox and size.
    """
    if not isinstance(value, dict):
        raise SystemExit(f"{where}: doodle is {{name, caption?, near?}}")
    unknown = set(value) - _KEYS
    if unknown:
        raise SystemExit(
            f"{where}: a doodle has no {sorted(unknown)} "
            "(only name, caption, near, id, size, repeat, layout)"
        )
    repeat = value.get("repeat")
    clean: dict[str, object] = {}
    repeat_clean: int | list[dict[str, object]] | None = None
    if isinstance(repeat, list):
        # A mixed community: each kind by its own name, so the doodle's own is not needed.
        if not repeat:
            raise SystemExit(f"{where}: repeat is a number, or a list of {{name, n}}")
        kinds: list[dict[str, object]] = []
        for kind in repeat:
            if not isinstance(kind, dict) or set(kind) != {"name", "n"}:
                raise SystemExit(f"{where}: each kind in a repeat is {{name, n}}")
            kinds.append(
                {
                    "name": _doodle_name(kind["name"], library, custom, year, number, where),
                    "n": _count(kind["n"], where, "a repeat's n"),
                }
            )
        total = sum(int(str(kind["n"])) for kind in kinds)
        if total > MAX_REPEAT:
            raise SystemExit(f"{where}: a repeat draws at most {MAX_REPEAT} figures ({total})")
        # The doodle's own name is ignored for a list; the first kind's stands for it.
        clean["name"] = str(kinds[0]["name"])
        repeat_clean = kinds
    else:
        clean["name"] = _doodle_name(value.get("name"), library, custom, year, number, where)
        if repeat is not None:
            repeat_clean = _count(repeat, where, "repeat")
            if repeat_clean > MAX_REPEAT:
                raise SystemExit(
                    f"{where}: a repeat draws at most {MAX_REPEAT} figures ({repeat_clean})"
                )
    handle = value.get("id")
    if handle is not None:
        if not isinstance(handle, str) or not _ID.fullmatch(handle):
            raise SystemExit(f"{where}: a doodle's id is [a-z][a-z0-9_]* ({handle!r})")
        clean["id"] = handle
    size = value.get("size")
    if size is not None:
        if size not in SIZES:
            raise SystemExit(f"{where}: a doodle's size is one of {sorted(SIZES)} ({size!r})")
        if size == "scene":
            if repeat_clean is not None:
                raise SystemExit(f"{where}: a repeat is laid out by its figures, not a scene")
            name = str(clean["name"])
            art = (svgs or {}).get(name) if name.startswith("custom:") else library_art(name)
            if art is not None:
                info = art_info(art, where)
                if info.view_box != SCENE_VIEWBOX:
                    raise SystemExit(f'{where}: a scene is drawn in viewBox="0 0 320 200"')
                if info.size > SCENE_MAX_BYTES:
                    raise SystemExit(f"{where}: a scene is at most about 8 KB ({info.size} bytes)")
        clean["size"] = size
    if repeat_clean is not None:
        clean["repeat"] = repeat_clean
    layout = value.get("layout")
    if layout is not None:
        if repeat_clean is None:
            raise SystemExit(f"{where}: layout is for a repeat")
        if layout not in LAYOUTS:
            raise SystemExit(f"{where}: a repeat's layout is one of {sorted(LAYOUTS)}")
        clean["layout"] = layout
    caption = value.get("caption")
    if caption is not None:
        if not isinstance(caption, str | int | float) or isinstance(caption, bool):
            raise SystemExit(f"{where}: a doodle's caption is a few words")
        caption = str(caption).strip()
        if not caption:
            raise SystemExit(f"{where}: a doodle's caption is a few words or nothing")
        if len(caption) > MAX_CAPTION:
            raise SystemExit(
                f"{where}: a doodle's caption is at most {MAX_CAPTION} characters "
                f"({len(caption)}: {caption!r})"
            )
        clean["caption"] = caption
    near = value.get("near")
    if near is not None:
        if isinstance(near, bool) or not isinstance(near, int):
            raise SystemExit(f"{where}: a doodle's near is a moment's number")
        if near < 0 or near > index:
            raise SystemExit(f"{where}: a doodle sits by this moment's line or an earlier one")
        if not writes[near]:
            raise SystemExit(f"{where}: near: {near}, but that moment writes no line to sit by")
        clean["near"] = near
    elif not any(writes[: index + 1]):
        raise SystemExit(f"{where}: a doodle needs a line to sit by, and none is written yet")
    return clean


def _brought(moment: dict[str, object]) -> list[dict[str, object]]:
    """The doodles a stored moment brings in: its `doodle`, or its `doodles`."""
    one = moment.get("doodle")
    many = moment.get("doodles")
    out = [one] if isinstance(one, dict) else []
    out += [d for d in many if isinstance(d, dict)] if isinstance(many, list) else []
    return out


def check_all_used(
    doodles: list[dict[str, str]], moments: list[dict[str, object]], where: str
) -> None:
    """Every one of a lesson's own doodles is brought in by one of its moments.

    Brought in means named by a moment's `doodle` or `doodles` (a repeat's kinds included), or
    reached as a later stage by a `doodle_do` action.
    """
    used: set[str] = set()
    for moment in moments:
        for doodle in _brought(moment):
            used.add(str(doodle.get("name")))
            repeat = doodle.get("repeat")
            if isinstance(repeat, list):
                used.update(str(kind.get("name")) for kind in repeat if isinstance(kind, dict))
        actions = moment.get("doodle_do")
        for action in actions if isinstance(actions, list) else []:
            if isinstance(action, dict) and action.get("op") == "stage":
                used.add(str(action.get("stage")))
    for own in doodles:
        if own["name"] not in used:
            raise SystemExit(f"{where}: {own['name']} is drawn but no moment brings it in")


@dataclass
class _Held:
    """A doodle on the board, as the moments so far have left it."""

    name: str
    info: ArtInfo
    #: How many small figures, for a repeat; 0 for a single picture.
    members: int = 0


#: The order an action's keys are stored in.
_OP_ORDER = (
    "id", "op", "part", "n", "text", "to", "to_part", "to_id", "stage", "path", "fill", "by",
)


class DoodleBook:
    """One lesson's doodles, followed through its moments: what each brings in and does.

    The loaders make one per lesson and, for each moment in turn, call `bring` (its `doodle` or
    `doodles`), then `links` (what a mark's `to: {doodle, part}` may name, for clean_points),
    then `act` (its `doodle_do`), and store what they return.
    """

    def __init__(
        self,
        library: set[str],
        custom: list[dict[str, str]],
        year: int,
        number: int,
        library_dir: Path = LIBRARY_DIR,
    ) -> None:
        self.library = library
        self.svgs = {doodle["name"]: doodle["svg"] for doodle in custom}
        self.year = year
        self.number = number
        self.library_dir = library_dir
        self.held: dict[str, _Held] = {}
        self._art: dict[str, ArtInfo] = {}
        #: The talking mouths brought in so far, by id (lesson_mouth.py).
        self.mouths: set[str] = set()

    def info(self, name: str, where: str) -> ArtInfo:
        """What actions can find in the art of this name."""
        if name not in self._art:
            if name.startswith("custom:"):
                art = self.svgs.get(name)
            else:
                art = library_art(name, self.library_dir)
            self._art[name] = art_info(art, where) if art is not None else ArtInfo(None)
        return self._art[name]

    def bring(
        self, moment: dict[str, object], index: int, writes: list[bool], where: str
    ) -> dict[str, object]:
        """The moment's `doodle` or `doodles`, checked, as the entry to store with it."""
        one, many = moment.get("doodle"), moment.get("doodles")
        if one is None and many is None:
            return {}
        if one is not None and many is not None:
            raise SystemExit(f"{where}: a moment brings in doodle or doodles, not both")
        if one is None and (not isinstance(many, list) or not 1 <= len(many) <= 2):
            raise SystemExit(f"{where}: doodles is a list of one or two doodles")
        values: list[object] = [one] if one is not None else list(many)  # type: ignore[call-overload]
        cleaned = [
            clean_doodle(
                value,
                index,
                writes,
                self.library,
                set(self.svgs),
                self.year,
                self.number,
                where,
                self.svgs,
            )
            for value in values
        ]
        for doodle in cleaned:
            handle = doodle.get("id")
            if handle is None:
                continue
            if handle in self.held or handle in self.mouths:
                raise SystemExit(f"{where}: two doodles in this lesson have the id {handle!r}")
            repeat = doodle.get("repeat")
            if isinstance(repeat, list):
                members = sum(int(str(kind["n"])) for kind in repeat)
            else:
                members = int(str(repeat)) if repeat is not None else 0
            name = str(doodle["name"])
            self.held[str(handle)] = _Held(name, self.info(name, where), members)
        return {"doodle": cleaned[0]} if one is not None else {"doodles": cleaned}

    def moment(
        self, moment: dict[str, object], index: int, writes: list[bool], where: str
    ) -> tuple[dict[str, object], dict[str, set[str]]]:
        """One moment's doodles: what to store with it (its `doodle` or `doodles`, and its
        `doodle_do`), and what its marks may link to — each doodle's parts before its actions
        or after them, since a mark may point at a part a stage of this moment draws."""
        stored = self.bring(moment, index, writes, where)
        if moment.get("mouth") is not None:
            # A talking mouth (docs/plans/doodles-v2-contract.md section 7).
            say = moment.get("say")
            mouth = clean_mouth(moment["mouth"], say if isinstance(say, str) else "", where)
            handle = mouth.get("id")
            if handle is not None:
                if handle in self.held or handle in self.mouths:
                    raise SystemExit(f"{where}: two doodles in this lesson have the id {handle!r}")
                self.mouths.add(handle)
            stored["mouth"] = mouth
        before = self.links()
        if moment.get("doodle_do") is not None:
            stored["doodle_do"] = self.act(moment["doodle_do"], where)
        after = self.links()
        return stored, {key: before.get(key, set()) | after[key] for key in after}

    def links(self) -> dict[str, set[str]]:
        """What a mark may link to now: each doodle's id, and the parts its art has now."""
        return {handle: set(held.info.parts) for handle, held in self.held.items()}

    def _held(self, handle: object, where: str, what: str = "id") -> _Held:
        if not isinstance(handle, str) or handle not in self.held:
            raise SystemExit(
                f"{where}: {what} {handle!r} is not a doodle brought in by this moment "
                "or an earlier one"
            )
        return self.held[handle]

    @staticmethod
    def _part(held: _Held, part: object, where: str, handle: str) -> str:
        if not isinstance(part, str) or part not in held.info.parts:
            known = sorted(held.info.parts) or "none"
            raise SystemExit(f"{where}: {handle} has no part {part!r} (its parts: {known})")
        return part

    def act(self, value: object, where: str) -> list[dict[str, object]]:
        """A moment's `doodle_do`, checked, as it is stored."""
        if not isinstance(value, list) or not value:
            raise SystemExit(f"{where}: doodle_do is a list of actions")
        if len(value) > MAX_OPS:
            raise SystemExit(
                f"{where}: {len(value)} doodle actions on one moment (at most {MAX_OPS})"
            )
        return [self._action(action, where) for action in value]

    def _action(self, action: object, where: str) -> dict[str, object]:
        if not isinstance(action, dict):
            raise SystemExit(f"{where}: each doodle action is {{id, op, ...}}")
        op = action.get("op")
        if action.get("id") in self.mouths:
            # A talking mouth says a word again, or is pointed at; nothing else.
            if op == "say":
                return clean_say(action, where)
            if op == "pulse" and set(action) <= {"id", "op"}:
                return {"id": action["id"], "op": "pulse"}
            raise SystemExit(f"{where}: a talking mouth takes say or pulse ({op!r})")
        if op == "say":
            raise SystemExit(
                f"{where}: say is for a talking mouth, and {action.get('id')!r} is not one"
            )
        if not isinstance(op, str) or op not in OPS:
            raise SystemExit(f"{where}: a doodle action's op is one of {sorted(OPS)} ({op!r})")
        needs, may = OPS[op]
        missing = sorted(key for key in needs if action.get(key) is None)
        if missing:
            raise SystemExit(f"{where}: {op} needs {', '.join(missing)}")
        unknown = set(action) - needs - may - {"id", "op"}
        if unknown:
            raise SystemExit(f"{where}: {op} takes no {sorted(unknown)}")
        held = self._held(action.get("id"), where)
        handle = str(action["id"])
        clean: dict[str, object] = {"id": handle, "op": op}
        group = held.members > 0
        if op in GROUP_OPS and not group:
            raise SystemExit(f"{where}: {op} is for a repeat group, and {handle} is one picture")
        if group and op in _NOT_ON_GROUP:
            raise SystemExit(f"{where}: {op} is for one picture, and {handle} is a repeat group")
        if "part" in action:
            if group:
                raise SystemExit(f"{where}: a repeat group has no parts; n picks its first n")
            clean["part"] = self._part(held, action["part"], where, handle)
        if "n" in action:
            if not group:
                raise SystemExit(f"{where}: n picks from a repeat group, and {handle} is not one")
            n = _count(action["n"], where, "n")
            # A split leaves at least one figure on each side.
            most = held.members - 1 if op == "split" else held.members
            if n > most:
                raise SystemExit(f"{where}: n: {n}, but {handle} has only {most} to take")
            clean["n"] = n
        text = action.get("text")
        if text is not None:
            if not isinstance(text, str | int | float) or isinstance(text, bool):
                raise SystemExit(f"{where}: an action's text is a few words")
            words = str(text).strip()
            if not words:
                raise SystemExit(f"{where}: an action's text is a few words")
            if len(words) > MAX_TEXT:
                raise SystemExit(
                    f"{where}: an action's text is at most {MAX_TEXT} characters "
                    f"({len(words)}: {words!r})"
                )
            if op == "split":
                sides = [side.strip() for side in words.split("|")]
                if len(sides) != 2 or not all(sides):
                    raise SystemExit(f"{where}: a split's text is 'left | right'")
            clean["text"] = words
        if op == "arrow":
            self._arrow(action, held, handle, clean, where)
        elif op == "stage":
            self._stage(action.get("stage"), held, handle, clean, where)
        elif op == "move":
            path = action.get("path")
            if not isinstance(path, str) or path not in held.info.paths:
                known = sorted(held.info.paths) or "none"
                raise SystemExit(f"{where}: {handle} has no route {path!r} (its routes: {known})")
            clean["path"] = path
        elif op == "fill":
            self._fill(action, held, handle, clean, where)
        elif op in ("grow", "shrink"):
            by = action.get("by")
            if by is not None:
                low, high = (1.1, 2.0) if op == "grow" else (0.5, 0.9)
                if isinstance(by, bool) or not isinstance(by, int | float) or not low <= by <= high:
                    raise SystemExit(f"{where}: {op} is by {low} to {high} ({by!r})")
                clean["by"] = by
        return {key: clean[key] for key in _OP_ORDER if key in clean}

    def _arrow(
        self,
        action: dict[str, object],
        held: _Held,
        handle: str,
        clean: dict[str, object],
        where: str,
    ) -> None:
        to_id = action.get("to_id")
        other = held if to_id is None else self._held(to_id, where, "to_id")
        if to_id is not None:
            clean["to_id"] = str(to_id)
        if "to_part" in action:
            if other.members > 0:
                raise SystemExit(f"{where}: an arrow to a repeat group points at it whole")
            clean["to_part"] = self._part(other, action["to_part"], where, str(to_id or handle))
        elif to_id is None:
            raise SystemExit(f"{where}: an arrow needs to_part or to_id")

    def _stage(
        self, stage: object, held: _Held, handle: str, clean: dict[str, object], where: str
    ) -> None:
        if self.year == SUBTOPIC:
            if not isinstance(stage, str) or not _SUB.fullmatch(stage):
                raise SystemExit(f"{where}: a stage is this lesson's custom:sub_<lesson>_x file")
        else:
            found = _CUSTOM.fullmatch(stage) if isinstance(stage, str) else None
            if not isinstance(stage, str) or not found:
                raise SystemExit(f"{where}: a stage is this question's custom:YYYY_qNN_x file")
            if (int(found.group(1)), int(found.group(2))) != (self.year, self.number):
                raise SystemExit(f"{where}: stage {stage} is not this question's")
        if stage not in self.svgs:
            raise SystemExit(f"{where}: stage {stage}, but there is no doodles/{stage[7:]}.svg")
        if stage == held.name:
            raise SystemExit(f"{where}: {handle} is already drawn as {stage}")
        held.name = stage
        held.info = self.info(stage, where)
        clean["stage"] = stage

    @staticmethod
    def _fill(
        action: dict[str, object],
        held: _Held,
        handle: str,
        clean: dict[str, object],
        where: str,
    ) -> None:
        level = action.get("to")
        if isinstance(level, bool) or not isinstance(level, int | float) or not 0 <= level <= 1:
            raise SystemExit(f"{where}: a fill goes to a fraction, 0 to 1 ({level!r})")
        clean["to"] = level
        named = action.get("fill")
        if named is not None:
            if not isinstance(named, str) or named not in held.info.fills:
                known = sorted(held.info.fills) or "none"
                raise SystemExit(f"{where}: {handle} has no level {named!r} (its levels: {known})")
            clean["fill"] = named
        elif not held.info.fills:
            raise SystemExit(f"{where}: {handle} has no <g data-fill> to fill")
        elif len(held.info.fills) > 1:
            raise SystemExit(
                f"{where}: {handle} has levels {sorted(held.info.fills)}; say which with fill"
            )


async def doodles_column(conn: Any) -> bool:
    """Whether the database has migration 027's `question_lessons.doodles` yet."""
    return bool(
        await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'question_lessons' AND column_name = 'doodles')"
        )
    )


def need_doodles_column(has_column: bool, work: list[tuple[object, dict[str, Any]]]) -> None:
    """Stop before writing lessons that carry doodles into a database that cannot hold them."""
    if not has_column and any(lesson.get("doodles") for _, lesson in work):
        raise SystemExit(
            "Some lessons carry doodles, and question_lessons has no doodles column: "
            "apply database/migrations/027_lesson_doodles.sql first."
        )
