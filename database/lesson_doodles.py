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

Every custom doodle file must belong to a written lesson and be used by one of its moments: a
picture drawn and never shown is a mistake worth hearing about.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from lesson_marks import check_sketch

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
_KEYS = {"name", "caption", "near"}
_CUSTOM = re.compile(r"custom:(\d{4})_q(\d{2,3})_([a-z0-9][a-z0-9_-]*)")
_FILE = re.compile(r"(\d{4})_q(\d{2,3})_([a-z0-9][a-z0-9_-]*)\.svg")
_LIBRARY_NAME = re.compile(r"[a-z0-9][a-z0-9_-]*")


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
    return {"svg": str(checked["svg"]), "alt_text": str(checked["alt_text"])}


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


def check_doodle_files(folder: Path, lessons: set[tuple[int, int]]) -> None:
    """Every doodle file is named YYYY_qNN_x.svg and has a written lesson to go with."""
    for file in sorted(folder.glob("*")) if folder.is_dir() else []:
        named = _FILE.fullmatch(file.name)
        if not named:
            raise SystemExit(f"doodles/{file.name}: named YYYY_qNN_x.svg (x: a short tag)")
        if (int(named.group(1)), int(named.group(2))) not in lessons:
            raise SystemExit(f"doodles/{file.name}: there is no written lesson for it to go with")


def clean_doodle(
    value: object,
    index: int,
    writes: list[bool],
    library: set[str],
    custom: set[str],
    year: int,
    number: int,
    where: str,
) -> dict[str, object]:
    """A moment's `doodle`, checked, as it is stored: {name, caption?, near?}.

    `writes` says, for each moment up to and including this one, whether it writes a line;
    `library` is the shared doodles' names and `custom` the names of this lesson's own
    ('custom:YYYY_qNN_x').
    """
    if not isinstance(value, dict):
        raise SystemExit(f"{where}: doodle is {{name, caption?, near?}}")
    unknown = set(value) - _KEYS
    if unknown:
        raise SystemExit(f"{where}: a doodle has no {sorted(unknown)} (only name, caption, near)")
    name = value.get("name")
    if not isinstance(name, str) or not name.strip():
        raise SystemExit(f"{where}: a doodle needs a name")
    name = name.strip()
    if name.startswith("custom:"):
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
    clean: dict[str, object] = {"name": name}
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


def check_all_used(
    doodles: list[dict[str, str]], moments: list[dict[str, object]], where: str
) -> None:
    """Every one of a lesson's own doodles is brought in by one of its moments."""
    used = {
        str(doodle["name"])
        for moment in moments
        if isinstance(doodle := moment.get("doodle"), dict)
    }
    for doodle in doodles:
        if doodle["name"] not in used:
            raise SystemExit(f"{where}: {doodle['name']} is drawn but no moment brings it in")


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
