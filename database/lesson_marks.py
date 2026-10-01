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
printed in the drawing — 'B', '(0, 4)', '1 - √2' (spaces ignored, a typeset minus the same
as -) — or, where
every character is a one-letter label, shorthand for two points ('AB', the side between them)
or three ('ABC', the angle at the middle one); a list of labels where they are longer than a
letter (['P', "Q'"], ['(0, 4)', '(2, 0)']); or a place in the drawing's own units
({x: 120, y: 40}). The kinds a diagram takes are circle,
underline, arrow, highlight, strike, arc (an angle, or with two points on a circle, the arc of
the circle between them) and label (a few words at a point, a side or an angle).

A LESSON'S OWN SKETCH. A question with no printed figure may still describe one (a bearing,
a ladder against a wall, a triangle given by its sides), and its lesson may carry a sketch
drawn from the question's numbers: docs/questions/utme/mathematics/sketches/YYYY_qNN.svg (a
second one YYYY_qNN_b.svg, a third YYYY_qNN_c.svg), attached to that question's lesson by the
loader. Marks address them as `figure: sketch`, `sketch_b`, `sketch_c`, with a target found in
it exactly as in a printed figure. See check_sketch for what a sketch may contain.

A moment brings one in with `show_sketch: true` (the first sketch; `show_sketch: sketch` says
the same) or `show_sketch: sketch_b` / `sketch_c`: each sketch once, in order (sketch before
_b before _c), and only one the lesson has (see clean_show_sketch). A sketch no moment brings
in comes with the first. A later sketch that keeps every shape of the one before it is drawn
on the board as that picture built up, only its new strokes added.

ACROSS, BETWEEN THE WORKING AND A DIAGRAM. An `arrow` may go from a piece of the working to
a point on a diagram, or from a diagram mark to a piece of the working, with `to`:

    {line: 6, kind: arrow, at: '(2, 0)', to: {figure: sketch, target: A}, text: 'here'}
    {figure: sketch, kind: arrow, target: A, to: {line: 6, at: '(2, 0)'}}

The first starts at the piece `at` of line 6 and lands on A (its `to` is a figure and a target,
checked like a diagram mark's); the second starts at A and lands on the piece (its `to` is a
line, this moment or an earlier one, and a piece of it). Only an arrow goes across, and it
does not also have a `from`.

A MARK IN THE PASSAGE. For a question set on a passage (comprehension, cloze, words in
context), the passage is on the board beside the working, and a mark may be drawn in it:

    {passage: true, kind: highlight, target: 'once or twice a year', text: 'seldom'}
    {passage: true, kind: label, target: 'but', text: 'contrast: "but" flips it', nth: 2}

`target` is an exact piece of the passage's text, matched with whitespace normalised and
curly and straight quotes, apostrophes and dashes treated as the same (see `norm_passage`);
where it occurs more than once, `nth` (from 1) picks the occurrence, the first by default.
The kinds a passage takes are highlight, underline, circle, strike and label (a note in the
margin beside the words, which needs its `text`). A passage mark goes with the line of the
working written at its moment, as a diagram mark does.

A mark on the working may link its piece to a place in the passage with `to`:

    {line: 2, kind: highlight, at: 'once or twice a year', to: {passage: true, target: '...'}}

(`to.nth` as above). The passage piece is highlighted and the two are paired on the board. Any
mark on the working but a move may link so, and not together with a `from`.

A mark on the working may link its piece to a doodle on the board, or to a named part of one
(lesson_doodles.py), with `to`:

    {line: 3, kind: highlight, at: '₦1,240', to: {doodle: jar, part: label}}

`doodle` is the id a moment gave the doodle when it brought it in, this moment or an earlier
one, and `part` (optional) a `data-part` its art has at this moment. Any mark on the working
but a move may link so, and not together with a `from`.

Or to a LIVE DIAGRAM's part (lesson_diagrams.py; docs/plans/doodles-v2-contract.md section 8):

    {line: 1, kind: highlight, at: '18', to: {diagram: v, part: 'M∩P'}}

`diagram` is the diagram's id, and `part` (optional) one of its parts drawn by this moment
(its actions go first, then its links), named as section 8 names them.

A VALUE THAT TRAVELS. A `travel` mark answers "where did this number come from?": a chip with
the value rides a curved arrow from where it was found into the line that uses it.

    {line: 4, kind: travel, at: '40', from: {doodle: class, part: total}, text: '40 students'}
    {line: 4, kind: travel, at: '7', from: {figure: sketch, target: AB}}
    {line: 5, kind: travel, at: '[[2]]x', from: {line: 3, at: 'x = 2'}}

`line` and `at` are the piece it lands on (both needed); `from` is exactly one source: a
doodle on the board by its id and, optionally, a named part of it (as a link's `to` names
one); a place on a diagram (`figure` and `target`, as a diagram mark names them); or a piece
of this line or an earlier one (`line` and `at`). `text` is the chip's words; the piece `at`
is used where there is none. The whiteboard style rides the chip along the arrow; the classic
style draws the arrow alone. A travel has no `to`.

A moment may start a titled SECTION of the working with `section: 'Find the union'` (a short
heading, at most SECTION_MAX characters; see clean_section). The whiteboard style puts it up
as a heading chip with room above it; the classic style ignores it.

At most MAX_MARKS marks to a moment: more than that and the student cannot follow them all
while one sentence is said.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from lesson_diagrams import DiagramBook, check_diagram_link

LINE_KINDS = {"circle", "underline", "arrow", "box", "highlight", "strike", "move"}
FIGURE_KINDS = {"circle", "underline", "arrow", "highlight", "strike", "arc", "label"}
#: A value riding an arrow from a picture part, or another line, into a line (see `_travel`).
TRAVEL = "travel"
POINT_KINDS = LINE_KINDS | FIGURE_KINDS | {TRAVEL}
#: The longest `section` heading a moment may start: a few words on a chip.
SECTION_MAX = 40
MAX_MARKS = 3
_KEYS = {"line", "kind", "text", "at", "from", "figure", "target", "to", "passage", "nth"}
#: What a mark in the passage may be.
PASSAGE_KINDS = {"highlight", "underline", "circle", "strike", "label"}
#: The longest note a passage mark may carry: a short sentence in the margin.
PASSAGE_NOTE_MAX = 80
#: What a mark calls a lesson's sketches: the first, and a second where there is one.
SKETCH_NAMES = ("sketch", "sketch_b", "sketch_c")
#: The file each is in: YYYY_qNN.svg, YYYY_qNN_b.svg, YYYY_qNN_c.svg.
SKETCH_SUFFIXES = ("", "_b", "_c")

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

    return {
        "svg": svg.strip(),
        "alt_text": label,
        "width": whole("width"),
        "height": whole("height"),
    }


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

    A target is matched against the labels' whole text, spaces ignored and a typeset minus the same
    as -: '(0, 4)', '1 - √2', '44°' and 'B' each name the one label that reads so. A list names one
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
    mark: dict[str, object],
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
            f"{where}: a diagram mark's figure is the figure's number from 0, or sketch,"
            " sketch_b or sketch_c"
        )
    for key in ("line", "at", "from"):
        if key in mark:
            raise SystemExit(f"{where}: a diagram mark has a figure and a target, not {key}")
    if "to" in mark and kind != "arrow":
        raise SystemExit(f"{where}: only an arrow goes across (to) between a diagram and a line")
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


def _to_line(to: object, index: int, where: str) -> dict[str, object]:
    """Where an arrow across from a diagram lands: a line (this moment or earlier) and a piece."""
    if not isinstance(to, dict) or "line" not in to or set(to) - {"line", "at"}:
        raise SystemExit(f"{where}: an arrow across from a diagram has to: {{line: …, at: …}}")
    clean: dict[str, object] = {"line": _moment(to.get("line"), index, where, "to.line")}
    at = _piece(to.get("at"), "to.at", where)
    if at is not None:
        clean["at"] = at
    return clean


def _to_figure(
    to: object,
    where: str,
    figures: list[str] | None,
    sketches: dict[str, str] | None,
) -> dict[str, object]:
    """Where an arrow across from the working lands: a diagram and a target in it."""
    if not isinstance(to, dict) or set(to) != {"figure", "target"}:
        raise SystemExit(f"{where}: an arrow across to a diagram has to: {{figure: …, target: …}}")
    found = _figure_mark(dict(to), "circle", f"{where} (to)", figures, sketches)
    return {"figure": found["figure"], "target": found["target"]}


_SAME = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201a": "'",
        "\u201b": "'",
        "\u2032": "'",
        "`": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u201e": '"',
        "\u201f": '"',
        "\u2033": '"',
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2015": "-",
        "\u2212": "-",
        "\u2026": "...",
        "\u00a0": " ",
    }
)


def norm_passage(text: str) -> str:
    """Passage text as a target is matched against it (the board's `normPassage` is the same).

    Whitespace runs are one space, spaces round a dash are dropped, and curly and straight
    quotes, apostrophes and every dash read the same.
    """
    flat = re.sub(r"\s+", " ", text.translate(_SAME))
    return re.sub(r" ?- ?", "-", flat).strip()


def passage_count(target: str, body: str) -> int:
    """How many times the target occurs in the passage (not overlapping), as it is matched."""
    needle = norm_passage(target)
    return norm_passage(body).count(needle) if needle else 0


def _passage_target(
    raw: dict[str, object], where: str, passage: str | None, what: str
) -> dict[str, object]:
    """A passage target and its occurrence, checked against the question's passage."""
    if raw.get("passage") is not True:
        raise SystemExit(f"{where}: {what} is marked passage: true")
    if passage is None:
        raise SystemExit(f"{where}: {what} is in the passage, but this question has no passage")
    target = raw.get("target")
    if not isinstance(target, str) or not norm_passage(target):
        raise SystemExit(f"{where}: {what} needs a target: the words in the passage")
    count = passage_count(target, passage)
    if count == 0:
        raise SystemExit(f"{where}: {what} target {target!r} is not in the passage")
    nth = raw.get("nth", 1)
    if isinstance(nth, bool) or not isinstance(nth, int) or not 1 <= nth <= count:
        times = f"{count} time{'s' if count != 1 else ''}"
        raise SystemExit(
            f"{where}: {what} nth {nth!r} is out of range: {target!r} is in the passage {times}"
        )
    clean: dict[str, object] = {"passage": True, "target": target.strip()}
    if "nth" in raw:
        clean["nth"] = nth
    return clean


def _passage_mark(
    mark: dict[str, object], kind: object, where: str, passage: str | None
) -> dict[str, object]:
    """A mark drawn in the passage, checked: a kind the passage takes, and a target in it."""
    for key in ("line", "at", "from", "figure", "to"):
        if key in mark:
            raise SystemExit(f"{where}: a passage mark has a target (and nth), not {key}")
    if kind not in PASSAGE_KINDS:
        raise SystemExit(f"{where}: a passage mark's kind is one of {sorted(PASSAGE_KINDS)}")
    text = mark.get("text")
    if kind == "label" and text is None:
        raise SystemExit(f"{where}: a label in the passage needs its text")
    if isinstance(text, str) and len(text.strip()) > PASSAGE_NOTE_MAX:
        raise SystemExit(
            f"{where}: a passage note is at most {PASSAGE_NOTE_MAX} characters ({len(text)})"
        )
    clean = _passage_target(mark, where, passage, "a passage mark")
    clean["kind"] = kind
    return clean


def _to_passage(to: object, where: str, passage: str | None) -> dict[str, object]:
    """Where a mark on the working links into the passage: a target in it, and which one."""
    if not isinstance(to, dict) or set(to) - {"passage", "target", "nth"}:
        raise SystemExit(f"{where}: a link into the passage is to: {{passage: true, target: …}}")
    return _passage_target(dict(to), where, passage, "to")


_DOODLE_ID = re.compile(r"[a-z][a-z0-9_]*")


def _to_doodle(to: object, where: str, doodles: dict[str, set[str]] | None) -> dict[str, object]:
    """Where a mark on the working links to a doodle: its id, and a part of its art."""
    if not isinstance(to, dict) or set(to) - {"doodle", "part"}:
        raise SystemExit(f"{where}: a link to a doodle is to: {{doodle: <id>, part: <name>}}")
    handle, part = to.get("doodle"), to.get("part")
    if not isinstance(handle, str) or not _DOODLE_ID.fullmatch(handle):
        raise SystemExit(f"{where}: to.doodle is a doodle's id ({handle!r})")
    if doodles is not None and handle not in doodles:
        raise SystemExit(
            f"{where}: to.doodle {handle!r} is not a doodle brought in by this moment or earlier"
        )
    clean: dict[str, object] = {"doodle": handle}
    if part is not None:
        if not isinstance(part, str) or (doodles is not None and part not in doodles[handle]):
            known = sorted(doodles[handle]) if doodles is not None else []
            raise SystemExit(
                f"{where}: {handle} has no part {part!r} (its parts: {known or 'none'})"
            )
        clean["part"] = part
    return clean


def clean_show_sketch(value: object, drawn: dict[str, str], brought: list[str], where: str) -> str:
    """The sketch a moment brings in (`show_sketch`), checked: true is the first sketch.

    It must be one of the lesson's sketches, not brought in before, and after every sketch
    already brought in (sketch, then sketch_b, then sketch_c); a later one only once every
    earlier one the lesson has is up. `brought` is the names so far.
    """
    name = "sketch" if value is True else value
    if name not in SKETCH_NAMES:
        raise SystemExit(f"{where}: show_sketch is true, or one of {list(SKETCH_NAMES)}")
    assert isinstance(name, str)
    if name not in drawn:
        raise SystemExit(f"{where}: show_sketch: {name}, but the lesson has no {name} file")
    if name in brought:
        raise SystemExit(f"{where}: {name} is brought in once")
    if any(SKETCH_NAMES.index(name) < SKETCH_NAMES.index(earlier) for earlier in brought):
        raise SystemExit(f"{where}: sketches are brought in in order (sketch, sketch_b, sketch_c)")
    earlier = SKETCH_NAMES[: SKETCH_NAMES.index(name)]
    before = [n for n in earlier if n in drawn and n not in brought]
    if before:
        raise SystemExit(f"{where}: {name} comes after {before[0]}, which no moment has brought in")
    return name


def clean_section(value: object, where: str) -> str:
    """A moment's `section`: the heading of the part of the working it starts, a few words."""
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"{where}: section is a short heading, e.g. 'Find the union'")
    heading = " ".join(value.split())
    if len(heading) > SECTION_MAX:
        raise SystemExit(
            f"{where}: section {heading!r} is {len(heading)} characters (at most {SECTION_MAX})"
        )
    return heading


def _travel(
    mark: dict[str, object],
    index: int,
    where: str,
    figures: list[str] | None,
    sketches: dict[str, str] | None,
    doodles: dict[str, set[str]] | None,
) -> dict[str, object]:
    """A `travel` mark, checked: the piece it lands on, and the one place it comes from."""
    for key in ("figure", "target", "to", "passage", "nth"):
        if key in mark:
            raise SystemExit(f"{where}: a travel has line, at, from and text, not {key}")
    clean: dict[str, object] = {
        "line": _moment(mark.get("line"), index, where, "line"),
        "kind": TRAVEL,
    }
    at = _piece(mark.get("at"), "at", where)
    if at is None:
        raise SystemExit(f"{where}: a travel needs at: the piece of its line the value lands on")
    clean["at"] = at
    start = mark.get("from")
    if not isinstance(start, dict) or not start:
        raise SystemExit(
            f"{where}: a travel needs from: {{doodle, part}}, {{figure, target}} or {{line, at}}"
        )
    if "doodle" in start:
        if set(start) - {"doodle", "part"}:
            raise SystemExit(f"{where}: a travel from a doodle is from: {{doodle: <id>, part: …}}")
        handle, part = start.get("doodle"), start.get("part")
        if not isinstance(handle, str) or not _DOODLE_ID.fullmatch(handle):
            raise SystemExit(f"{where}: from.doodle is a doodle's id ({handle!r})")
        if doodles is not None and handle not in doodles:
            raise SystemExit(
                f"{where}: from.doodle {handle!r} is not a doodle brought in by this moment"
                " or earlier"
            )
        begin: dict[str, object] = {"doodle": handle}
        if part is not None:
            if not isinstance(part, str) or (doodles is not None and part not in doodles[handle]):
                known = sorted(doodles[handle]) if doodles is not None else []
                raise SystemExit(
                    f"{where}: {handle} has no part {part!r} (its parts: {known or 'none'})"
                )
            begin["part"] = part
    elif "figure" in start:
        if set(start) != {"figure", "target"}:
            raise SystemExit(f"{where}: a travel from a diagram is from: {{figure: …, target: …}}")
        found = _figure_mark(dict(start), "circle", f"{where} (from)", figures, sketches)
        begin = {"figure": found["figure"], "target": found["target"]}
    elif "line" in start:
        if set(start) - {"line", "at"}:
            raise SystemExit(f"{where}: a travel from a line is from: {{line: …, at: …}}")
        begin = {"line": _moment(start.get("line"), index, where, "from.line")}
        begin_at = _piece(start.get("at"), "from.at", where)
        if begin_at is not None:
            begin["at"] = begin_at
    else:
        raise SystemExit(
            f"{where}: a travel's from is {{doodle, part}}, {{figure, target}} or {{line, at}}"
        )
    clean["from"] = begin
    return clean


def clean_points(
    point: object,
    index: int,
    where: str,
    figures: list[str] | None = None,
    sketches: dict[str, str] | None = None,
    passage: str | None = None,
    doodles: dict[str, set[str]] | None = None,
    diagrams: DiagramBook | None = None,
) -> list[dict[str, object]]:
    """A moment's marks, checked, in the form they are stored and played.

    `index` is this moment's place in the lesson. `figures` is the question's drawings as SVG
    text, where the loader knows them: a diagram mark is then checked against the drawing (the
    figure exists, every label in its target is printed in it exactly once, a place is inside
    it). Where it is None — a subject whose loader does not carry figures — only the shape of
    a diagram mark is checked, and the board draws nothing for a target it cannot find.
    `sketches` is the lesson's own sketches by name ('sketch', 'sketch_b'), checked the same
    way where it is given. `passage` is the body of the question's passage, where it has one:
    a passage mark, or a link into the passage, is checked against it (see the head of this
    file), and refused where there is none. `doodles` is the lesson's doodles brought in by this
    moment, by id, with the parts each has now (lesson_doodles.DoodleBook.links): a link to a
    doodle is checked against it where it is given. `diagrams` is the lesson's DiagramBook
    (lesson_diagrams.py): a link to a live diagram's part, `to: {diagram, part}`, is checked
    against it where it is given.
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
        if kind == TRAVEL:
            clean = _travel(mark, index, where, figures, sketches, doodles)
        elif "passage" in mark:
            clean = _passage_mark(mark, kind, where, passage)
        elif "nth" in mark:
            raise SystemExit(f"{where}: nth picks an occurrence in the passage (passage: true)")
        elif "figure" in mark or "target" in mark:
            clean = _figure_mark(mark, kind, where, figures, sketches)
            if kind == "label" and text is None:
                raise SystemExit(f"{where}: a label mark needs its text")
            if "to" in mark:
                clean["to"] = _to_line(mark["to"], index, where)
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
            to = mark.get("to")
            if isinstance(to, dict) and "passage" in to:
                if kind == "move" or start is not None:
                    raise SystemExit(
                        f"{where}: a link into the passage is not a move, and not with a from"
                    )
                clean["to"] = _to_passage(to, where, passage)
            elif isinstance(to, dict) and "doodle" in to:
                if kind == "move" or start is not None:
                    raise SystemExit(
                        f"{where}: a link to a doodle is not a move, and not with a from"
                    )
                clean["to"] = _to_doodle(to, where, doodles)
            elif isinstance(to, dict) and "diagram" in to:
                # A live diagram's part (lesson_diagrams.py): `diagrams` is the lesson's
                # DiagramBook, which checks the part is drawn by now.
                if kind == "move" or start is not None:
                    raise SystemExit(
                        f"{where}: a link to a diagram is not a move, and not with a from"
                    )
                clean["to"] = check_diagram_link(to, where, diagrams)
            elif "to" in mark:
                if kind != "arrow" or start is not None:
                    raise SystemExit(
                        f"{where}: only an arrow goes across (to) to a diagram, and not with a from"
                    )
                clean["to"] = _to_figure(mark["to"], where, figures, sketches)
        if text is not None:
            clean["text"] = text.strip()
        # Stored in the order the keys were always written: line, kind, then the rest.
        order = ["line", "passage", "figure", "kind", "text", "at", "from", "target", "nth", "to"]
        marks.append({key: clean[key] for key in order if key in clean})
    return marks
