"""The teaching marks in a written lesson (a moment's `point` list), checked before loading.

Shared by load_retranscribed_maths.py and load_retranscribed_english.py, and read by the
content checker, so the three agree on what a mark may be.

A MARK ON THE WORKING names a moment and, if only part of it, the piece:

    {line: 2, kind: circle, at: 'x2', text: 'the square'}

`line` is the moment's index in the lesson from 0, or counted back from this moment when
negative; it must be this moment or an earlier one, since nothing can be marked before it is
written. `at` is the piece as it reads on the board (KaTeX's rendering: x^{2} reads "x2"), and
where the piece occurs more than once the words around it pick it out, with `[[ ]]` round the
part meant: `6[[2]]` is the 2 just after the 6, and only that 2 is marked.

PIECE TO PIECE. An `arrow` or a `move` may also say where it starts:

    {line: 1, kind: move, from: {line: 1, at: '[[2]]log'}, at: '6[[2]]', text: 'power law'}

`from.line` is counted the same way and must also be this moment or an earlier one. An arrow
then runs from that piece to the marked one (on the same line, a small hop over the words);
a `move` lifts a copy of the `from` piece, carries it along the same path and sets it down on
the marked piece, leaving a light trace of the way it went. A move always has a `from`.

A MARK ON THE DIAGRAM names the figure and what in it, instead of a line:

    {figure: 0, kind: arc, target: 'QRP', text: '34°'}

`figure` counts the question's figures from 0. `target` is a label's whole text as it is
printed in the drawing — 'B', '(0, 4)', '1 − √2' (spaces ignored, − and - the same) — or, where
every character is a one-letter label, shorthand for two points ('AB', the side between them)
or three ('ABC', the angle at the middle one); a list of labels where they are longer than a
letter (['P', "Q'"], ['(0, 4)', '(2, 0)']); or a place in the drawing's own units
({x: 120, y: 40}). The kinds a diagram takes are circle,
underline, arrow, highlight, strike, arc (an angle, or with two points on a circle, the arc of
the circle between them) and label (a few words at a point, a side or an angle).

A LESSON'S OWN SKETCH. A question with no printed figure may still describe one (a bearing,
a ladder against a wall, a triangle given by its sides), and its lesson may carry a sketch
drawn from the question's numbers: docs/questions/utme/mathematics/sketches/YYYY_qNN.svg (a
second one YYYY_qNN_b.svg), attached to that question's lesson by the loader. Marks address it
as `figure: sketch` (or `figure: sketch_b`), with a target found in it exactly as in a printed
figure. See check_sketch for what a sketch may contain.

At most MAX_MARKS marks to a moment: more than that and the student cannot follow them all
while one sentence is said.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

LINE_KINDS = {"circle", "underline", "arrow", "box", "highlight", "strike", "move"}
FIGURE_KINDS = {"circle", "underline", "arrow", "highlight", "strike", "arc", "label"}
POINT_KINDS = LINE_KINDS | FIGURE_KINDS
MAX_MARKS = 3
_KEYS = {"line", "kind", "text", "at", "from", "figure", "target"}
#: What a mark calls a lesson's sketches: the first, and a second where there is one.
SKETCH_NAMES = ("sketch", "sketch_b")

#: Elements a sketch may not contain: anything that runs, embeds or fetches.
_BANNED_TAGS = {"script", "foreignobject", "iframe", "object", "embed", "image", "use", "style",
                "a", "audio", "video", "animate", "set", "animatemotion", "animatetransform"}


def check_sketch(svg: str, where: str) -> dict[str, object]:
    """A sketch file, checked, as it is stored with its lesson.

    It is drawn in the house style of the redrawn figures: one <svg> with a viewBox, role="img"
    and an aria-label that describes it (what a screen reader says), one <text> label per
    point. It is shown as a picture, never as markup, but it is still refused if it holds
    anything that runs or reaches out — a script, an event handler (on…), an embedded or
    linked document, a stylesheet, or any link or url() that is not to a part of itself.
    """
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as error:
        raise SystemExit(f"{where}: the sketch is not well-formed SVG ({error})") from None
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise SystemExit(f"{where}: a sketch is one <svg> element")
    if not _view_box(svg):
        raise SystemExit(f"{where}: a sketch needs a viewBox")
    label = (root.get("aria-label") or "").strip()
    if not label:
        raise SystemExit(f"{where}: a sketch needs an aria-label that describes it")
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        tag = element.tag.rsplit("}", 1)[-1].lower()
        if tag in _BANNED_TAGS:
            raise SystemExit(f"{where}: a sketch may not contain <{tag}>")
        for name, value in element.attrib.items():
            local = name.rsplit("}", 1)[-1].lower()
            if local.startswith("on"):
                raise SystemExit(f"{where}: a sketch may not carry an event handler ({local})")
            if local == "href" and not value.strip().startswith("#"):
                raise SystemExit(f"{where}: a sketch may not link outside itself ({value!r})")
            links = re.findall(r"url\s*\(([^)]*)\)", value, flags=re.IGNORECASE)
            if "@import" in value or any(
                not link.strip().strip("'\"").strip().startswith("#") for link in links
            ):
                raise SystemExit(f"{where}: a sketch may not fetch anything ({local}={value!r})")

    def whole(key: str) -> int | None:
        found = re.match(r"\s*(\d+)", root.get(key) or "")
        return int(found.group(1)) if found else None

    return {"svg": svg.strip(), "alt_text": label, "width": whole("width"), "height": whole("height")}


def svg_labels(svg: str) -> list[str]:
    """Every <text> in a drawing, as its words read (one entry per element, in order)."""
    try:
        root = ET.fromstring(svg)
    except ET.ParseError:
        return []
    return [
        "".join(element.itertext()).strip()
        for element in root.iter()
        if isinstance(element.tag, str) and element.tag.rsplit("}", 1)[-1] == "text"
    ]


def norm_label(text: str) -> str:
    """A label as it is matched: spaces ignored, every minus or dash the same minus."""
    return re.sub(r"\s+", "", text).replace("\u2212", "-").replace("\u2013", "-")


def split_target(target: str | list[str], labels: list[str]) -> list[str] | None:
    """The labels a target names, or None where it names something not in the drawing.

    A target is matched against the labels' whole text, spaces ignored and − the same as -:
    '(0, 4)', '1 − √2', '44°' and 'B' each name the one label that reads so. A list names one
    label per item. Only where the whole text is no label, and every character of it is itself
    a one-letter label in the drawing, is it read as shorthand: 'AB' the side from A to B,
    'ABC' the angle at B.
    """
    known = {norm_label(label): label for label in labels if label.strip()}
    if isinstance(target, list):
        found = [known.get(norm_label(item)) for item in target]
        return [label for label in found if label] if all(found) else None
    whole = known.get(norm_label(target))
    if whole is not None:
        return [whole]
    letters = norm_label(target)
    if letters and all(char.isalpha() and char in known for char in letters):
        return [known[char] for char in letters]
    return None


def _view_box(svg: str) -> tuple[float, float, float, float] | None:
    found = re.search(r'viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)', svg)
    return tuple(float(n) for n in found.groups()) if found else None  # type: ignore[return-value]


def _piece(value: object, key: str, where: str) -> str | None:
    """An `at`: some words, with at most one [[ ]] round the part meant."""
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"{where}: a mark's {key} is a few words or nothing")
    value = value.strip()
    opens, closes = value.count("[["), value.count("]]")
    if opens or closes:
        inner = re.fullmatch(r"[^\[\]]*\[\[([^\[\]]+)\]\][^\[\]]*", value)
        if opens != 1 or closes != 1 or not inner or not inner.group(1).strip():
            raise SystemExit(
                f"{where}: {key} {value!r} marks its part with one [[ ]] round some words"
            )
    return value


def _moment(line: object, index: int, where: str, what: str) -> int:
    if isinstance(line, bool) or not isinstance(line, int):
        raise SystemExit(f"{where}: a mark's {what} is a moment number")
    target = index + line if line < 0 else line
    if not 0 <= target <= index:
        raise SystemExit(f"{where}: a mark's {what} can only be this moment or an earlier one")
    return line


def _figure_mark(
    mark: dict,
    kind: object,
    where: str,
    figures: list[str] | None,
    sketches: dict[str, str] | None,
) -> dict[str, object]:
    figure = mark.get("figure")
    if figure in SKETCH_NAMES:
        if sketches is not None and figure not in sketches:
            raise SystemExit(f"{where}: figure: {figure}, but this lesson has no {figure} file")
    elif isinstance(figure, bool) or not isinstance(figure, int) or figure < 0:
        raise SystemExit(
            f"{where}: a diagram mark's figure is the figure's number from 0, or sketch / sketch_b"
        )
    for key in ("line", "at", "from"):
        if key in mark:
            raise SystemExit(f"{where}: a diagram mark has a figure and a target, not {key}")
    if kind not in FIGURE_KINDS:
        raise SystemExit(f"{where}: a diagram mark's kind is one of {sorted(FIGURE_KINDS)}")
    target = mark.get("target")
    svg = None
    if isinstance(figure, str):
        svg = sketches.get(figure) if sketches else None
    elif figures is not None:
        if figure >= len(figures):
            raise SystemExit(
                f"{where}: figure {figure} does not exist (this question has {len(figures)})"
            )
        svg = figures[figure]
    clean: dict[str, object] = {"figure": figure, "kind": kind}
    if isinstance(target, dict):
        x, y = target.get("x"), target.get("y")
        if set(target) != {"x", "y"} or not all(
            isinstance(n, int | float) and not isinstance(n, bool) for n in (x, y)
        ):
            raise SystemExit(f"{where}: a place on the figure is {{x: …, y: …}} in its units")
        box = _view_box(svg) if svg else None
        if box and not (box[0] <= x <= box[0] + box[2] and box[1] <= y <= box[1] + box[3]):  # type: ignore[operator]
            raise SystemExit(f"{where}: ({x}, {y}) is outside the figure's viewBox {box}")
        if kind == "arc":
            raise SystemExit(f"{where}: an arc is at an angle ('ABC') or between two points")
        clean["target"] = {"x": x, "y": y}
    elif isinstance(target, str | list) and target:
        if isinstance(target, list) and not all(
            isinstance(label, str) and label.strip() for label in target
        ):
            raise SystemExit(f"{where}: a target list is the labels, as printed")
        value: str | list[str] = (
            target.strip() if isinstance(target, str) else [t.strip() for t in target]
        )
        if svg is not None:
            labels = svg_labels(svg)
            names = split_target(value, labels)
            if names is None:
                raise SystemExit(
                    f"{where}: target {value!r} is not made of the figure's labels {labels}"
                )
            twice = [
                name
                for name in names
                if sum(norm_label(label) == norm_label(name) for label in labels) > 1
            ]
            if twice:
                raise SystemExit(f"{where}: the figure has more than one label {twice[0]!r}")
            count = len(names)
            if count > 3:
                raise SystemExit(f"{where}: a target is a point, a side or an angle")
            if kind == "arc" and count not in (2, 3):
                raise SystemExit(f"{where}: an arc is at an angle ('ABC') or between two points")
        clean["target"] = value
    else:
        raise SystemExit(f"{where}: a diagram mark needs a target")
    return clean


def clean_points(
    point: object,
    index: int,
    where: str,
    figures: list[str] | None = None,
    sketches: dict[str, str] | None = None,
) -> list[dict[str, object]]:
    """A moment's marks, checked, in the form they are stored and played.

    `index` is this moment's place in the lesson. `figures` is the question's drawings as SVG
    text, where the loader knows them: a diagram mark is then checked against the drawing (the
    figure exists, every label in its target is printed in it exactly once, a place is inside
    it). Where it is None — a subject whose loader does not carry figures — only the shape of
    a diagram mark is checked, and the board draws nothing for a target it cannot find.
    `sketches` is the lesson's own sketches by name ('sketch', 'sketch_b'), checked the same
    way where it is given.
    """
    if not isinstance(point, list) or not point:
        raise SystemExit(f"{where}: point is a list of marks")
    if len(point) > MAX_MARKS:
        raise SystemExit(f"{where}: {len(point)} marks on one moment (at most {MAX_MARKS})")
    marks: list[dict[str, object]] = []
    for mark in point:
        if not isinstance(mark, dict):
            raise SystemExit(f"{where}: each mark is a mapping")
        unknown = set(mark) - _KEYS
        if unknown:
            raise SystemExit(f"{where}: a mark has unknown keys {sorted(unknown)}")
        kind = mark.get("kind")
        if kind not in POINT_KINDS:
            raise SystemExit(f"{where}: a mark's kind is one of {sorted(POINT_KINDS)}")
        text = mark.get("text")
        if text is not None and (not isinstance(text, str) or not text.strip()):
            raise SystemExit(f"{where}: a mark's text is a few words or nothing")
        if "figure" in mark or "target" in mark:
            clean = _figure_mark(mark, kind, where, figures, sketches)
            if kind == "label" and text is None:
                raise SystemExit(f"{where}: a label mark needs its text")
        else:
            if kind not in LINE_KINDS:
                raise SystemExit(f"{where}: {kind} is for the diagram (figure and target)")
            clean = {"line": _moment(mark.get("line"), index, where, "line"), "kind": kind}
            at = _piece(mark.get("at"), "at", where)
            if at is not None:
                clean["at"] = at
            start = mark.get("from")
            if start is not None:
                if kind not in ("arrow", "move"):
                    raise SystemExit(f"{where}: only an arrow or a move comes from somewhere")
                if not isinstance(start, dict) or set(start) - {"line", "at"}:
                    raise SystemExit(f"{where}: from is {{line: …, at: …}}")
                begin: dict[str, object] = {
                    "line": _moment(start.get("line"), index, where, "from.line")
                }
                begin_at = _piece(start.get("at"), "from.at", where)
                if begin_at is not None:
                    begin["at"] = begin_at
                clean["from"] = begin
            elif kind == "move":
                raise SystemExit(f"{where}: a move needs a from: where the piece is taken from")
        if text is not None:
            clean["text"] = text.strip()
        # Stored in the order the keys were always written: line, kind, then the rest.
        order = ["line", "figure", "kind", "text", "at", "from", "target"]
        marks.append({key: clean[key] for key in order if key in clean})
    return marks
