"""A lesson's LIVE DIAGRAMS: diagrams described as data, checked before loading.

Shared by load_retranscribed_maths.py and load_retranscribed_english.py. The contract is
docs/plans/doodles-v2-contract.md sections 8 and 9 (the division ladder); the board draws them
with apps/web/src/student/LiveDiagram.tsx and diagram/kinds/*.ts, and this module refuses anything
the board could not draw, so a mistake is heard about at load time rather than seen as a
half-drawn diagram in front of a student.

A moment may bring in one diagram, and act on diagrams already brought in (at most MAX_OPS
actions a moment):

    diagram: {id: v, kind: venn, caption: '42 students', universal: {name: Class, total: 42},
              sets: [{key: M, name: Maths, total: 30}, {key: P, name: Physics, total: 24}]}
    diagram_do:
      - {id: v, op: fill, part: 'M∩P', text: '18', on: overlap}

A board line may link to a part: `to: {diagram: v, part: 'M∩P'}` in a mark (lesson_marks.py
calls `DiagramBook.link`). Cues (`on`, `on_nth`) are taken off by lesson_cues.py first.

DiagramBook follows one lesson's diagrams through its moments: what each kind's description
may hold, every action's keys, that every part named exists and is drawn by then (a `later`
item only once the action that draws it has run), that every id is brought in before it is
used, and that the numbers make sense (a pie's angles make 360, a tree's branches from one
point add up to 1, a histogram's classes touch, an ogive's totals never fall).
"""

# ruff: noqa: RUF001  (the set signs, the minus and the times are the ones a lesson writes)

from __future__ import annotations

import itertools
import math
import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

KINDS = {
    "graph",
    "venn",
    "pie",
    "bar",
    "histogram",
    "numberline",
    "tree",
    "table",
    "ogive",
    "ladder",
}
#: The colours a diagram may use, each with its meaning (docs/lesson-style-guide.md 5).
COLOURS = {"blue", "green", "purple", "orange", "red", "pink", "yellow", "grey"}
SIZES = {"medium", "scene"}
#: The most actions on one moment, and the most diagrams in one lesson.
MAX_OPS = 3
MAX_DIAGRAMS = 4
#: The longest words written: a note or a label; a caption; what a fill writes in a region or
#: a cell; a name (a set's, an axis's).
MAX_TEXT = 40
MAX_CAPTION = 40
MAX_VALUE = 16
MAX_NAME = 24
#: A diagram's handle: a letter or a short word (section 9's ladders are written `id: L`).
_ID = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
_SET_KEY = re.compile(r"[A-Z][A-Za-z0-9]{0,2}")
_FRACTION = re.compile(r"\s*(\d+)\s*/\s*(\d+)\s*")

#: What every diagram may carry, and what each kind adds.
COMMON_KEYS = {"id", "kind", "caption", "size", "near"}
_AXES = {"x", "y", "step", "x_step", "y_step", "x_label", "y_label", "grid"}
KIND_KEYS: dict[str, set[str]] = {
    "graph": _AXES | {"plots", "points"},
    "venn": {"universal", "sets", "counts"},
    "pie": {"sectors", "show"},
    "bar": {"bars", "y", "step", "y_step", "x_label", "y_label", "grid"},
    "histogram": {"bins", "x", "y", "step", "x_step", "y_step", "x_label", "y_label", "grid"},
    "numberline": {"range", "step", "points"},
    "tree": {"branches", "root", "levels"},
    "table": {"columns", "rows"},
    "ogive": _AXES | {"points", "start", "later"},
    "ladder": {"mode", "divisor", "number", "numbers", "find"},
}

#: Every action: the keys it needs and the keys it may take, beyond `id` and `op`.
_NOTE = {"text", "colour", "answer"}
COMMON_OPS: dict[str, tuple[set[str], set[str]]] = {
    "highlight": ({"part"}, _NOTE),
    "label": ({"part", "text"}, {"colour", "answer"}),
    "arrow": ({"part", "to_part"}, _NOTE),
}
KIND_OPS: dict[str, dict[str, tuple[set[str], set[str]]]] = {
    "graph": {
        "plot": (set(), {"part", "colour"}),
        "point": ({"x"}, {"y", "part"} | _NOTE),
        "intercepts": ({"part"}, {"axis", "colour", "answer"}),
        "vertex": ({"part"}, _NOTE),
        "line": (set(), {"m", "c", "through", "label", "colour", "answer"}),
        "shade": ({"part"}, {"to_part", "x"} | _NOTE),
        "gradient": ({"part", "x"}, _NOTE),
    },
    "venn": {
        "draw-set": (set(), {"part"}),
        "fill": ({"part", "text"}, {"colour", "answer"}),
        "shade": ({"part"}, _NOTE),
    },
    "pie": {
        "draw-sector": (set(), {"part"}),
        "pull-out": ({"part"}, set()),
        "angle": ({"part"}, _NOTE),
    },
    "bar": {"grow": (set(), {"part"}), "line": ({"y"}, _NOTE)},
    "histogram": {"grow": (set(), {"part"}), "line": ({"y"}, _NOTE)},
    "numberline": {
        "point": ({"x"}, {"open"} | _NOTE),
        "hop": ({"from", "to"}, {"text", "colour"}),
        "interval": (set(), {"from", "to", "from_open", "to_open"} | _NOTE),
        # A number line's label may be at a number (x) rather than by a part.
        "label": ({"text"}, {"part", "x", "colour", "answer"}),
    },
    "tree": {"branch": (set(), {"part"}), "path": ({"part"}, _NOTE)},
    "table": {
        "fill": ({"part", "text"}, {"colour", "answer"}),
        "total": ({"part"}, {"into"} | _NOTE),
    },
    "ogive": {"plot": (set(), set()), "read": (set(), {"x", "y"} | _NOTE)},
    "ladder": {"step": (set(), {"n"}), "read": (set(), {"colour", "answer"})},
}


def ops_of(kind: str) -> dict[str, tuple[set[str], set[str]]]:
    """Every action a kind takes: its own, and those every kind takes."""
    return {**COMMON_OPS, **KIND_OPS[kind]}


def fmt(n: float) -> str:
    """A number as the board writes it (diagram/engine.ts `fmt`): a real minus sign, and no
    more than two decimals."""
    value = round(n, 2)
    if abs(value) < 1e-9:
        value = 0.0
    text = str(int(value)) if value == int(value) else repr(value)
    return text.replace("-", "−")


# --------------------------------------------------------------------- a function of x


_FUNCS = {
    "sqrt": math.sqrt,
    "abs": abs,
    "sin": lambda v: math.sin(math.radians(v)),
    "cos": lambda v: math.cos(math.radians(v)),
    "tan": lambda v: math.tan(math.radians(v)),
    "ln": math.log,
    "log": math.log10,
    "exp": math.exp,
}


def _tokens(text: str) -> list[tuple[str, Any]]:
    s = (
        text.replace("−", "-")
        .replace("–", "-")
        .replace("×", "*")
        .replace("·", "*")
        .replace("÷", "/")
        .replace("²", "^2")
        .replace("³", "^3")
        .replace("√", "sqrt")
    )
    out: list[tuple[str, Any]] = []
    i = 0
    while i < len(s):
        c = s[i]
        if c.isspace():
            i += 1
            continue
        number = re.match(r"\d+\.?\d*|\.\d+", s[i:])
        if number:
            out.append(("num", float(number.group())))
            i += len(number.group())
            continue
        word = re.match(r"[A-Za-z]+", s[i:])
        if word:
            rest = word.group().lower()
            while rest:
                known = next((n for n in [*_FUNCS, "pi"] if rest.startswith(n)), None)
                if known:
                    out.append(("id", known))
                    rest = rest[len(known) :]
                else:
                    out.append(("id", rest[0]))
                    rest = rest[1:]
            i += len(word.group())
            continue
        if c in "+-*/^()":
            out.append(("op", c))
            i += 1
            continue
        raise ValueError(f"unexpected {c!r}")
    return out


def parse_fn(text: str) -> Any:
    """`fn` as a function of x, read the way the board reads it (diagram/expr.ts): numbers,
    x, pi, e, + - * / ^, brackets, implicit times, and sqrt abs sin cos tan (degrees) ln log exp.
    Raises ValueError on anything else. Never eval."""
    tokens = _tokens(text)
    at = 0

    def peek() -> tuple[str, Any] | None:
        return tokens[at] if at < len(tokens) else None

    def is_op(v: str) -> bool:
        t = peek()
        return t is not None and t[0] == "op" and t[1] == v

    def take() -> tuple[str, Any]:
        nonlocal at
        if at >= len(tokens):
            raise ValueError("unexpected end")
        at += 1
        return tokens[at - 1]

    def starts_factor() -> bool:
        t = peek()
        return t is not None and (t[0] in ("num", "id") or t == ("op", "("))

    def expr() -> Any:
        left = term()
        while is_op("+") or is_op("-"):
            op = take()[1]
            right = term()
            left = (
                (lambda a, b: lambda x: a(x) + b(x))(left, right)
                if op == "+"
                else (lambda a, b: lambda x: a(x) - b(x))(left, right)
            )
        return left

    def term() -> Any:
        left = unary()
        while True:
            if is_op("*") or is_op("/"):
                op = take()[1]
                right = unary()
                left = (
                    (lambda a, b: lambda x: a(x) * b(x))(left, right)
                    if op == "*"
                    else (lambda a, b: lambda x: a(x) / b(x))(left, right)
                )
            elif starts_factor():
                right = power()
                left = (lambda a, b: lambda x: a(x) * b(x))(left, right)
            else:
                return left

    def unary() -> Any:
        if is_op("-"):
            take()
            inner = unary()
            return lambda x: -inner(x)
        if is_op("+"):
            take()
            return unary()
        return power()

    def power() -> Any:
        base = atom()
        if is_op("^"):
            take()
            exponent = unary()
            return lambda x: base(x) ** exponent(x)
        return base

    def atom() -> Any:
        kind, value = take()
        if kind == "num":
            return lambda x: value
        if (kind, value) == ("op", "("):
            inner = expr()
            if not is_op(")"):
                raise ValueError("missing )")
            take()
            return inner
        if kind == "id":
            if value == "x":
                return lambda x: x
            if value == "pi":
                return lambda x: math.pi
            if value == "e":
                return lambda x: math.e
            if value in _FUNCS:
                f = _FUNCS[value]
                arg = power()
                return lambda x: f(arg(x))
        raise ValueError(f"unexpected {value!r}")

    fn = expr()
    if at != len(tokens):
        raise ValueError("unexpected text at the end")
    return fn


def _value(fn: Any, x: float) -> float | None:
    try:
        y = float(fn(x))
    except (ValueError, ZeroDivisionError, OverflowError, TypeError):
        return None
    return y if math.isfinite(y) else None


def _samples(fn: Any, lo: float, hi: float, n: int = 240) -> list[tuple[float, float | None]]:
    return [(lo + (hi - lo) * i / n, _value(fn, lo + (hi - lo) * i / n)) for i in range(n + 1)]


def _turning(samples: list[tuple[float, float | None]]) -> tuple[float, float] | None:
    for i in range(1, len(samples) - 1):
        a, b, c = samples[i - 1][1], samples[i][1], samples[i + 1][1]
        if a is None or b is None or c is None:
            continue
        if (b <= a and b < c) or (b >= a and b > c):
            return samples[i][0], b
    return None


def count_roots(fn: Any, lo: float, hi: float) -> int:
    """How many times the curve meets y = 0 across [lo, hi], as the board finds them
    (diagram/kinds/graph.ts `roots`): sign changes over 240 steps, exact zeros, and a turning
    point on the axis."""
    samples = _samples(fn, lo, hi)
    found: list[float] = []
    for i in range(1, len(samples)):
        (x0, y0), (x1, y1) = samples[i - 1], samples[i]
        if y0 is None or y1 is None:
            continue
        if y0 == 0:
            found.append(round(x0, 6))
        elif y0 * y1 < 0:
            found.append(round(x0 - y0 * (x1 - x0) / (y1 - y0), 3))
    turn = _turning(samples)
    if turn and abs(turn[1]) < 1e-6 and not any(abs(x - turn[0]) < 1e-2 for x in found):
        found.append(turn[0])
    last = samples[-1]
    if last[1] == 0:
        found.append(round(last[0], 6))
    return len({round(x, 2) for x in found})


# --------------------------------------------------------------------- a Venn's regions


def region_name(mask: int, keys: list[str]) -> str:
    """A region's canonical name from its membership (bit i: in set i)."""
    if mask == 0:
        return "outside"
    inside = [k for i, k in enumerate(keys) if mask & (1 << i)]
    if len(inside) == len(keys):
        return "∩".join(inside)
    return "∩".join(inside) + " only"


def regions_of(expr: str, keys: list[str]) -> set[int]:
    """The regions a set expression covers (diagram/kinds/venn.ts `regionsOf`). Raises
    ValueError on what it cannot read."""
    every = set(range(1 << len(keys)))
    text = (
        expr.strip()
        .replace("&", "∩")
        .replace("|", "∪")
        .replace("’", "'")
        .replace("′", "'")
        .replace("\\", "−")
        .replace("-", "−")
    )
    lower = text.lower()
    if lower in {"outside", "neither", "none", "neither of them", "none of them"}:
        return {0}
    if lower == "both" and len(keys) == 2:
        return {3}
    only = re.fullmatch(r"(.*?)\s+only", text, flags=re.IGNORECASE)
    if only:
        mask = 0
        for key in (k.strip() for k in only.group(1).split("∩")):
            if key not in keys:
                raise ValueError(f"no set {key}")
            mask |= 1 << keys.index(key)
        return {mask}
    s = re.sub(r"\s+", "", text)
    at = 0

    def peek() -> str:
        return s[at] if at < len(s) else ""

    def key() -> set[int]:
        nonlocal at
        word = re.match(r"[A-Za-z][A-Za-z0-9]{0,2}", s[at:])
        if not word:
            raise ValueError(f"unexpected {s[at:] or 'end'}")
        found = next(
            (w for n in range(len(word.group()), 0, -1) if (w := word.group()[:n]) in [*keys, "U"]),
            None,
        )
        if found is None:
            raise ValueError(f"no set {word.group()}")
        at += len(found)
        if found == "U":
            return set(every)
        i = keys.index(found)
        return {m for m in every if m & (1 << i)}

    def atom() -> set[int]:
        nonlocal at
        if peek() == "(":
            at += 1
            out = union()
            if peek() != ")":
                raise ValueError("missing )")
            at += 1
        else:
            out = key()
        while peek() == "'":
            at += 1
            out = every - out
        return out

    def inter() -> set[int]:
        nonlocal at
        out = atom()
        while peek() == "∩":
            at += 1
            out &= atom()
        return out

    def union() -> set[int]:
        nonlocal at
        out = inter()
        while peek() in ("∪", "−"):
            op = s[at]
            at += 1
            nxt = inter()
            out = out | nxt if op == "∪" else out - nxt
        return out

    result = union()
    if at != len(s):
        raise ValueError(f"unexpected {s[at:]}")
    return result


# --------------------------------------------------------------------- small checks


def _text(value: object, where: str, what: str, most: int = MAX_TEXT) -> str:
    if isinstance(value, int | float) and not isinstance(value, bool):
        value = fmt(float(value))
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"{where}: {what} is a few words ({value!r})")
    if len(value.strip()) > most:
        raise SystemExit(f"{where}: {what} is {len(value.strip())} characters (at most {most})")
    if "$" in value:
        raise SystemExit(
            f"{where}: {what} is written in the diagram's handwriting, not $…$ maths "
            "(use x², √, −, ½ as text)"
        )
    return value.strip()


def _num(value: object, where: str, what: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise SystemExit(f"{where}: {what} is a number ({value!r})")
    return float(value)


def _pair(value: object, where: str, what: str, rising: bool = True) -> tuple[float, float]:
    if not isinstance(value, list) or len(value) != 2:
        raise SystemExit(f"{where}: {what} is [from, to] ({value!r})")
    a, b = _num(value[0], where, what), _num(value[1], where, what)
    if rising and not a < b:
        raise SystemExit(f"{where}: {what} runs from the smaller to the larger ({value!r})")
    return a, b


def _bool(value: object, where: str, what: str) -> bool:
    if not isinstance(value, bool):
        raise SystemExit(f"{where}: {what} is true or false ({value!r})")
    return value


def _colour(value: object, where: str) -> str:
    if value not in COLOURS:
        raise SystemExit(f"{where}: colour is one of {sorted(COLOURS)} ({value!r})")
    return str(value)


def _step(value: object, span: float, where: str, what: str, most: int = 40) -> float:
    step = _num(value, where, what)
    if step <= 0:
        raise SystemExit(f"{where}: {what} is more than 0 ({value!r})")
    if span / step > most:
        raise SystemExit(
            f"{where}: {what} {fmt(step)} gives {int(span / step)} ticks (at most {most})"
        )
    return step


def _list(value: object, where: str, what: str, least: int, most: int) -> list[Any]:
    if not isinstance(value, list) or not least <= len(value) <= most:
        raise SystemExit(f"{where}: {what} is a list of {least} to {most} ({value!r})")
    return value


def _probability(value: object, where: str) -> Fraction:
    if isinstance(value, str):
        m = _FRACTION.fullmatch(value)
        if m:
            top, bottom = int(m.group(1)), int(m.group(2))
            if bottom == 0 or top > bottom:
                raise SystemExit(f"{where}: p {value!r} is not a probability")
            return Fraction(top, bottom)
        try:
            value = float(value)
        except ValueError:
            raise SystemExit(
                f"{where}: p is a fraction like '3/5' or a decimal ({value!r})"
            ) from None
    number = _num(value, where, "p")
    if not 0 <= number <= 1:
        raise SystemExit(f"{where}: p {value!r} is not a probability, 0 to 1")
    return Fraction(number).limit_denominator(10000)


# --------------------------------------------------------------------- the division ladder

#: A ladder's modes (section 9), what an lcm ladder finds, and its limits.
LADDER_MODES = {"divisor", "factors", "lcm"}
LADDER_FINDS = {"lcm", "hcf", "both"}
MAX_RUNGS = 12
MAX_LADDER_NUMBER = 100_000


@dataclass
class Rung:
    """One line of a division ladder: its numbers, the divisor left of its bar, and (divisor
    mode) the remainder written with them. `common`: an lcm ladder's divisor shared by all."""

    values: list[int]
    divisor: int | None
    remainder: int | None = None
    common: bool = False


def _smallest_prime(n: int) -> int:
    p = 2
    while p * p <= n:
        if n % p == 0:
            return p
        p += 1
    return n


def ladder_rungs(mode: str, numbers: list[int], divisor: int | None, find: str) -> list[Rung]:
    """Every line of the ladder, the top one first, worked out as the board works it out
    (diagram/kinds/ladder.ts `ladderRungs`): divided down to 0 (divisor), to 1 (factors), or
    for an lcm ladder by the primes all the numbers share first, then by any prime that
    divides one of them (a number it does not divide carried down), until every one is 1 or,
    finding only the HCF, they share no prime."""
    if mode == "divisor":
        assert divisor is not None
        n = numbers[0]
        rungs = [Rung([n], divisor)]
        while n > 0:
            n, r = divmod(n, divisor)
            rungs.append(Rung([n], divisor if n > 0 else None, r))
        return rungs
    if mode == "factors":
        n = numbers[0]
        rungs = [Rung([n], _smallest_prime(n))]
        while n > 1:
            n //= _smallest_prime(n)
            rungs.append(Rung([n], _smallest_prime(n) if n > 1 else None))
        return rungs

    def next_divisor(values: list[int]) -> tuple[int | None, bool]:
        shared = math.gcd(*values)
        if shared > 1:
            return _smallest_prime(shared), True
        live = [v for v in values if v > 1]
        if find == "hcf" or not live:
            return None, False
        return min(_smallest_prime(v) for v in live), False

    values = list(numbers)
    p, common = next_divisor(values)
    rungs = [Rung(values, p, None, common)]
    while p is not None:
        values = [v // p if v % p == 0 else v for v in values]
        p, common = next_divisor(values)
        rungs.append(Rung(values, p, None, common))
    return rungs


# --------------------------------------------------------------------- the book


@dataclass
class _Held:
    """A diagram as it stands at this moment of its lesson: what can be pointed at now."""

    kind: str
    spec: dict[str, Any]
    #: Parts that are drawn (and so may be acted on, or linked to).
    parts: set[str] = field(default_factory=set)
    #: Items marked `later` and not yet drawn, by their canonical part.
    waiting: list[str] = field(default_factory=list)
    count: dict[str, int] = field(default_factory=dict)
    #: Each kind's own: a Venn's keys, a pie's labels, a table's cells …
    extra: dict[str, Any] = field(default_factory=dict)

    def next(self, what: str) -> int:
        self.count[what] = self.count.get(what, 0) + 1
        return self.count[what]


class DiagramBook:
    """One lesson's live diagrams, followed through its moments: `moment` for each in turn
    (what it brings in, and its actions), then `link` for each mark that points at a part."""

    def __init__(self) -> None:
        self.held: dict[str, _Held] = {}
        #: Every action on each diagram in the lesson so far, in order.
        self.plans: dict[str, list[dict[str, Any]]] = {}

    # ----------------------------------------------------------------- bringing one in

    def moment(
        self, moment: dict[str, object], index: int, writes: list[bool], where: str
    ) -> dict[str, object]:
        """One moment's diagram and actions, checked, as they are stored with it."""
        stored: dict[str, object] = {}
        if moment.get("diagram") is not None:
            stored["diagram"] = self.bring(moment["diagram"], index, writes, where)
        if moment.get("diagram_do") is not None:
            stored["diagram_do"] = self.act(moment["diagram_do"], where)
        return stored

    def bring(self, value: object, index: int, writes: list[bool], where: str) -> dict[str, Any]:
        where = f"{where} diagram"
        if not isinstance(value, dict):
            raise SystemExit(f"{where}: a diagram is a mapping {{id, kind, …}}")
        kind = value.get("kind")
        if kind not in KINDS:
            raise SystemExit(f"{where}: kind is one of {sorted(KINDS)} ({kind!r})")
        unknown = set(value) - COMMON_KEYS - KIND_KEYS[str(kind)]
        if unknown:
            raise SystemExit(f"{where}: a {kind} has no {sorted(unknown)}")
        handle = value.get("id")
        if not isinstance(handle, str) or not _ID.fullmatch(handle):
            raise SystemExit(f"{where}: id is a short handle, [A-Za-z][A-Za-z0-9_]* ({handle!r})")
        if handle in self.held:
            raise SystemExit(f"{where}: two diagrams in this lesson have the id {handle!r}")
        if len(self.held) >= MAX_DIAGRAMS:
            raise SystemExit(f"{where}: at most {MAX_DIAGRAMS} diagrams in one lesson")
        clean: dict[str, Any] = {"id": handle, "kind": kind}
        if value.get("caption") is not None:
            clean["caption"] = _text(value["caption"], where, "caption", MAX_CAPTION)
        if value.get("size") is not None:
            if value["size"] not in SIZES:
                raise SystemExit(f"{where}: size is one of {sorted(SIZES)} ({value['size']!r})")
            clean["size"] = value["size"]
        if value.get("near") is not None:
            near = value["near"]
            if isinstance(near, bool) or not isinstance(near, int) or not 0 <= near <= index:
                raise SystemExit(f"{where}: near is this moment or an earlier one ({near!r})")
            if not writes[near]:
                raise SystemExit(f"{where}: near: {near}, but that moment writes no line")
            clean["near"] = near
        elif not any(writes[: index + 1]):
            raise SystemExit(f"{where}: a diagram needs a line to sit by, and none is written yet")
        held = _Held(str(kind), clean)
        getattr(self, f"_spec_{kind!s}")(value, clean, held, where)
        self.held[handle] = held
        self.plans[handle] = []
        return clean

    def _spec_graph(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        self._axes(v, clean, where, need=True)
        x = clean["x"]
        y = clean["y"]
        plots = _list(v.get("plots", []), where, "plots", 0, 4)
        held.extra["plots"] = []
        clean_plots = []
        for k, plot in enumerate(plots, start=1):
            clean_plots.append(self._plot(plot, x, y, f"{where} plot {k}", held))
        if clean_plots:
            clean["plots"] = clean_plots
        dots = _list(v.get("points", []), where, "points", 0, 8)
        out = []
        for dot in dots:
            if not isinstance(dot, dict) or set(dot) - {"x", "y", "text", "colour"}:
                raise SystemExit(f"{where}: a graph's point is {{x, y, text?, colour?}} ({dot!r})")
            one: dict[str, Any] = {
                "x": _num(dot.get("x"), where, "x"),
                "y": _num(dot.get("y"), where, "y"),
            }
            if dot.get("text") is not None:
                one["text"] = _text(dot["text"], where, "a point's text")
            if dot.get("colour") is not None:
                one["colour"] = _colour(dot["colour"], where)
            out.append(one)
            held.parts.add(f"point:{held.next('point')}")
        if out:
            clean["points"] = out
        held.parts |= {"axis:x", "axis:y"}

    def _plot(
        self, plot: object, x: tuple[float, float], y: tuple[float, float], where: str, held: _Held
    ) -> dict[str, Any]:
        if not isinstance(plot, dict) or set(plot) - {
            "fn",
            "points",
            "join",
            "domain",
            "label",
            "colour",
            "later",
        }:
            raise SystemExit(
                f"{where}: a plot is {{fn | points, join?, domain?, label?, colour?, later?}}"
            )
        if ("fn" in plot) == ("points" in plot):
            raise SystemExit(f"{where}: a plot has a fn or points, one of them")
        clean: dict[str, Any] = {}
        fn = None
        if "fn" in plot:
            text = plot["fn"]
            if not isinstance(text, str) or not text.strip():
                raise SystemExit(f"{where}: fn is a function of x, like 'x^2 - 4' ({text!r})")
            try:
                fn = parse_fn(text)
            except ValueError as error:
                raise SystemExit(f"{where}: fn {text!r} cannot be read: {error}") from None
            lo, hi = x
            if plot.get("domain") is not None:
                a, b = _pair(plot["domain"], where, "domain")
                lo, hi = max(lo, a), min(hi, b)
                if lo >= hi:
                    raise SystemExit(f"{where}: domain is outside the x range")
                clean["domain"] = [a, b]
            seen = [v for _, v in _samples(fn, lo, hi, 120) if v is not None and y[0] <= v <= y[1]]
            if len(seen) < 6:
                raise SystemExit(f"{where}: fn {text!r} is hardly on the graph's y range {list(y)}")
            clean["fn"] = text.strip()
        else:
            points = _list(plot["points"], where, "points", 2, 40)
            pairs = []
            for p in points:
                a, b = _pair(p, where, "a point", rising=False)
                pairs.append([a, b])
            clean["points"] = pairs
        if plot.get("join") is not None:
            if plot["join"] not in ("smooth", "straight", "none"):
                raise SystemExit(f"{where}: join is smooth, straight or none")
            clean["join"] = plot["join"]
        if plot.get("label") is not None:
            clean["label"] = _text(plot["label"], where, "a plot's label")
        if plot.get("colour") is not None:
            clean["colour"] = _colour(plot["colour"], where)
        later = plot.get("later") is not None and _bool(plot["later"], where, "later")
        if later:
            clean["later"] = True
        name = f"plot:{held.next('plot')}"
        held.extra["plots"].append({"name": name, "fn": fn, "domain": clean.get("domain")})
        if later:
            held.waiting.append(name)
        else:
            held.parts.add(name)
        return clean

    def _axes(self, v: dict[str, Any], clean: dict[str, Any], where: str, need: bool) -> None:
        for axis in ("x", "y"):
            if v.get(axis) is None:
                if need:
                    raise SystemExit(f"{where}: a graph needs its {axis} range, {axis}: [from, to]")
                continue
            clean[axis] = list(_pair(v[axis], where, axis))
        for key in ("step", "x_step", "y_step"):
            if v.get(key) is None:
                continue
            spans = [
                clean[a][1] - clean[a][0]
                for a in ("x", "y")
                if a in clean and (key == "step" or key[0] == a)
            ]
            clean[key] = _step(v[key], max(spans, default=1), where, key)
        for key in ("x_label", "y_label"):
            if v.get(key) is not None:
                clean[key] = _text(v[key], where, key, MAX_NAME)
        if v.get("grid") is not None:
            clean["grid"] = _bool(v["grid"], where, "grid")

    def _spec_venn(self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str) -> None:
        sets = _list(v.get("sets"), where, "sets", 2, 3)
        keys: list[str] = []
        out = []
        for one in sets:
            if not isinstance(one, dict) or set(one) - {"key", "name", "total", "colour", "later"}:
                raise SystemExit(
                    f"{where}: a set is {{key, name, total?, colour?, later?}} ({one!r})"
                )
            key = one.get("key")
            if not isinstance(key, str) or not _SET_KEY.fullmatch(key) or key == "U":
                raise SystemExit(
                    f"{where}: a set's key is a capital letter or two, not U ({key!r})"
                )
            if key in keys:
                raise SystemExit(f"{where}: two sets have the key {key!r}")
            keys.append(key)
            item: dict[str, Any] = {
                "key": key,
                "name": _text(one.get("name"), where, "a set's name", MAX_NAME),
            }
            if one.get("total") is not None:
                item["total"] = _text(one["total"], where, "a set's total", 6)
            if one.get("colour") is not None:
                item["colour"] = _colour(one["colour"], where)
            if one.get("later") is not None and _bool(one["later"], where, "later"):
                item["later"] = True
                held.waiting.append(key)
            else:
                held.parts.add(key)
            out.append(item)
        clean["sets"] = out
        held.extra["keys"] = keys
        if v.get("universal") is not None:
            u = v["universal"]
            if not isinstance(u, dict) or set(u) - {"name", "total"}:
                raise SystemExit(f"{where}: universal is {{name, total?}}")
            clean_u: dict[str, Any] = {
                "name": _text(u.get("name"), where, "the universal set's name", MAX_NAME)
            }
            if u.get("total") is not None:
                clean_u["total"] = _text(u["total"], where, "the universal total", 6)
            clean["universal"] = clean_u
            held.parts.add("U")
        held.extra["universal"] = "universal" in clean
        if v.get("counts") is not None:
            counts = v["counts"]
            if not isinstance(counts, dict):
                raise SystemExit(f"{where}: counts is a mapping of region to number")
            clean["counts"] = {}
            for region, value in counts.items():
                self._venn_region(held, str(region), where, single=True)
                clean["counts"][str(region)] = _text(value, where, "a count", MAX_VALUE)

    def _venn_region(self, held: _Held, part: str, where: str, single: bool) -> set[int]:
        keys: list[str] = held.extra["keys"]
        try:
            masks = regions_of(part, keys)
        except ValueError as error:
            raise SystemExit(
                f"{where}: {part!r} is not a region of {'/'.join(keys)} ({error}); regions are "
                f"{', '.join(repr(region_name(m, keys)) for m in range(1 << len(keys)))} or a set "
                "expression like 'A∪B', \"A'\""
            ) from None
        if not held.extra["universal"]:
            if 0 in masks and single:
                raise SystemExit(
                    f"{where}: {part!r} is outside every set, and there is no universal set"
                )
            masks.discard(0)
        if not masks:
            raise SystemExit(f"{where}: {part!r} is no region at all")
        if single and len(masks) != 1:
            raise SystemExit(f"{where}: {part!r} is {len(masks)} regions; a count goes in one")
        for m in masks:
            for i, key in enumerate(keys):
                if m & (1 << i) and key not in held.parts:
                    raise SystemExit(f"{where}: {part!r} is in set {key}, which is not drawn yet")
        return masks

    def _spec_pie(self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str) -> None:
        sectors = _list(v.get("sectors"), where, "sectors", 2, 8)
        by_angle = all(isinstance(s, dict) and "angle" in s for s in sectors)
        labels: list[str] = []
        out = []
        for k, one in enumerate(sectors, start=1):
            if not isinstance(one, dict) or set(one) - {
                "label",
                "value",
                "angle",
                "text",
                "colour",
                "later",
            }:
                raise SystemExit(
                    f"{where}: a sector is {{label, value | angle, text?, colour?, later?}}"
                )
            label = _text(one.get("label"), where, "a sector's label", 20)
            if label.lower() in (x.lower() for x in labels):
                raise SystemExit(f"{where}: two sectors are labelled {label!r}")
            labels.append(label)
            if ("value" in one) == ("angle" in one):
                raise SystemExit(f"{where}: sector {label!r} has a value or an angle, one of them")
            if ("angle" in one) != by_angle:
                raise SystemExit(f"{where}: every sector has a value, or every one an angle")
            amount = _num(one.get("angle" if by_angle else "value"), where, "a sector's size")
            if amount <= 0:
                raise SystemExit(f"{where}: sector {label!r} has nothing in it")
            item: dict[str, Any] = {"label": label, ("angle" if by_angle else "value"): amount}
            if one.get("text") is not None:
                item["text"] = _text(one["text"], where, "a sector's text", 12)
            if one.get("colour") is not None:
                item["colour"] = _colour(one["colour"], where)
            name = f"sector:{k}"
            if one.get("later") is not None and _bool(one["later"], where, "later"):
                item["later"] = True
                held.waiting.append(name)
            else:
                held.parts.add(name)
            out.append(item)
        if by_angle:
            total = sum(s["angle"] for s in out)
            if abs(total - 360) > 0.5:
                raise SystemExit(f"{where}: the sectors' angles make {fmt(total)}°, not 360°")
        clean["sectors"] = out
        held.extra["labels"] = labels
        if v.get("show") is not None:
            if v["show"] not in ("value", "angle", "percent", "none"):
                raise SystemExit(f"{where}: show is value, angle, percent or none")
            clean["show"] = v["show"]

    def _spec_bar(self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str) -> None:
        bars = _list(v.get("bars"), where, "bars", 1, 12)
        labels: list[str] = []
        out = []
        for k, one in enumerate(bars, start=1):
            if not isinstance(one, dict) or set(one) - {"label", "value", "colour", "later"}:
                raise SystemExit(f"{where}: a bar is {{label, value, colour?, later?}}")
            label = _text(one.get("label"), where, "a bar's label", 12)
            if label.lower() in (x.lower() for x in labels):
                raise SystemExit(f"{where}: two bars are labelled {label!r}")
            labels.append(label)
            value = _num(one.get("value"), where, "a bar's value")
            if value < 0:
                raise SystemExit(f"{where}: bar {label!r} is below 0")
            item: dict[str, Any] = {"label": label, "value": value}
            self._bar_rest(one, item, held, f"bar:{k}", where)
            out.append(item)
        clean["bars"] = out
        held.extra["labels"] = labels
        self._chart_axes(v, clean, held, [b["value"] for b in out], where)

    def _spec_histogram(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        bins = _list(v.get("bins"), where, "bins", 1, 12)
        out = []
        labels: list[str] = []
        for k, one in enumerate(bins, start=1):
            if not isinstance(one, dict) or set(one) - {"from", "to", "value", "colour", "later"}:
                raise SystemExit(f"{where}: a bin is {{from, to, value, colour?, later?}}")
            a = _num(one.get("from"), where, "from")
            b = _num(one.get("to"), where, "to")
            if not a < b:
                raise SystemExit(f"{where}: a bin runs from the smaller to the larger")
            if out and abs(out[-1]["to"] - a) > 1e-9:
                raise SystemExit(
                    f"{where}: a histogram's classes touch: {fmt(out[-1]['to'])}, then {fmt(a)}"
                )
            value = _num(one.get("value"), where, "a bin's value")
            if value < 0:
                raise SystemExit(f"{where}: a bin is below 0")
            item: dict[str, Any] = {"from": a, "to": b, "value": value}
            self._bar_rest(one, item, held, f"bar:{k}", where)
            labels.append(f"{fmt(a)}-{fmt(b)}")
            out.append(item)
        clean["bins"] = out
        held.extra["labels"] = labels
        if v.get("x") is not None:
            clean["x"] = list(_pair(v["x"], where, "x"))
        if v.get("x_step") is not None:
            clean["x_step"] = _step(v["x_step"], out[-1]["to"] - out[0]["from"], where, "x_step")
        self._chart_axes(v, clean, held, [b["value"] for b in out], where)

    def _bar_rest(
        self, one: dict[str, Any], item: dict[str, Any], held: _Held, name: str, where: str
    ) -> None:
        if one.get("colour") is not None:
            item["colour"] = _colour(one["colour"], where)
        if one.get("later") is not None and _bool(one["later"], where, "later"):
            item["later"] = True
            held.waiting.append(name)
        else:
            held.parts.add(name)

    def _chart_axes(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, values: list[float], where: str
    ) -> None:
        top = max(values, default=1)
        if v.get("y") is not None:
            a, b = _pair(v["y"], where, "y")
            if a != 0:
                raise SystemExit(f"{where}: a chart's y axis starts at 0")
            if b < top:
                raise SystemExit(f"{where}: y goes to {fmt(b)}, under the tallest bar ({fmt(top)})")
            clean["y"] = [a, b]
            top = b
        for key in ("step", "y_step"):
            if v.get(key) is not None:
                clean[key] = _step(v[key], top, where, key, 20)
        for key in ("x_label", "y_label"):
            if v.get(key) is not None:
                clean[key] = _text(v[key], where, key, MAX_NAME)
        if v.get("grid") is not None:
            clean["grid"] = _bool(v["grid"], where, "grid")
        held.extra["top"] = top

    def _spec_numberline(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        a, b = _pair(v.get("range"), where, "range")
        clean["range"] = [a, b]
        if v.get("step") is not None:
            clean["step"] = _step(v["step"], b - a, where, "step", 30)
        elif b - a > 30:
            raise SystemExit(f"{where}: a range of {fmt(b - a)} needs a step (at most 30 ticks)")
        dots = _list(v.get("points", []), where, "points", 0, 8)
        out = []
        for dot in dots:
            if not isinstance(dot, dict) or set(dot) - {"x", "text", "open", "colour"}:
                raise SystemExit(f"{where}: a number line's point is {{x, text?, open?, colour?}}")
            out.append(self._line_point(dot, held, where))
        if out:
            clean["points"] = out

    def _line_point(self, dot: dict[str, Any], held: _Held, where: str) -> dict[str, Any]:
        a, b = held.spec["range"]
        x = _num(dot.get("x"), where, "x")
        if not a <= x <= b:
            raise SystemExit(f"{where}: x {fmt(x)} is off the number line ({fmt(a)} to {fmt(b)})")
        one: dict[str, Any] = {"x": x}
        if dot.get("text") is not None:
            one["text"] = _text(dot["text"], where, "a point's text", MAX_NAME)
        if dot.get("open") is not None:
            one["open"] = _bool(dot["open"], where, "open")
        if dot.get("colour") is not None:
            one["colour"] = _colour(dot["colour"], where)
        held.parts.add(f"point:{held.next('point')}")
        return one

    def _spec_tree(self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str) -> None:
        paths: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        leaves = 0

        def walk(branches: object, prefix: str, depth: int, later: bool) -> list[dict[str, Any]]:
            nonlocal leaves
            items = _list(branches, where, "branches from one point", 2, 4)
            if depth > 3:
                raise SystemExit(f"{where}: a tree is at most 3 levels deep")
            out = []
            labels: list[str] = []
            ps: list[Fraction] = []
            for one in items:
                if not isinstance(one, dict) or set(one) - {"label", "p", "then", "later"}:
                    raise SystemExit(f"{where}: a branch is {{label, p?, then?, later?}}")
                label = _text(one.get("label"), where, "a branch's label", 12)
                if "/" in label:
                    raise SystemExit(f"{where}: a branch's label has no / in it ({label!r})")
                if label.lower() in (x.lower() for x in labels):
                    raise SystemExit(f"{where}: two branches from one point are both {label!r}")
                labels.append(label)
                item: dict[str, Any] = {"label": label}
                path = f"{prefix}/{label}" if prefix else label
                if one.get("p") is not None:
                    ps.append(_probability(one["p"], f"{where} branch {path!r}"))
                    item["p"] = one["p"] if isinstance(one["p"], str) else float(one["p"])
                held_later = later or (
                    one.get("later") is not None and _bool(one["later"], where, "later")
                )
                if held_later and not later:
                    item["later"] = True
                paths[path] = {"later": held_later, "p": item.get("p")}
                order.append(path)
                if one.get("then") is not None:
                    item["then"] = walk(one["then"], path, depth + 1, held_later)
                else:
                    leaves += 1
                out.append(item)
            if len(ps) == len(items) and sum(ps) != 1:
                raise SystemExit(
                    f"{where}: the branches from {prefix or 'the start'!r} add up to "
                    f"{sum(ps)}, not 1"
                )
            return out

        clean["branches"] = walk(v.get("branches"), "", 1, False)
        if leaves > 12:
            raise SystemExit(f"{where}: a tree has at most 12 ends ({leaves})")
        if v.get("root") is not None:
            clean["root"] = _text(v["root"], where, "root", 12)
        if v.get("levels") is not None:
            levels = _list(v["levels"], where, "levels", 1, 3)
            clean["levels"] = [_text(level, where, "a level's name", 16) for level in levels]
        for path in order:
            name = f"branch:{path}"
            if paths[path]["later"]:
                held.waiting.append(name)
            else:
                held.parts.add(name)
        held.extra["paths"] = paths

    def _spec_table(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        columns = _list(v.get("columns"), where, "columns", 1, 7)
        heads = [_text(c, where, "a column's header", MAX_VALUE) for c in columns]
        if len({h.lower() for h in heads}) != len(heads):
            raise SystemExit(f"{where}: two columns have the same header")
        rows = _list(v.get("rows"), where, "rows", 1, 12)
        cells: dict[tuple[int, int], str] = {}
        out = []
        for r, row in enumerate(rows, start=1):
            if not isinstance(row, list) or len(row) != len(heads):
                raise SystemExit(
                    f"{where}: row {r} has {len(row) if isinstance(row, list) else '?'} cells, "
                    f"not {len(heads)}"
                )
            clean_row: list[Any] = []
            for c, cell in enumerate(row, start=1):
                if cell is None or cell == "":
                    clean_row.append(None)
                    continue
                if isinstance(cell, int | float) and not isinstance(cell, bool):
                    clean_row.append(cell)
                    cells[(r, c)] = fmt(float(cell))
                else:
                    clean_row.append(_text(cell, where, "a cell", MAX_VALUE))
                    cells[(r, c)] = clean_row[-1]
            out.append(clean_row)
        clean["columns"] = heads
        clean["rows"] = out
        held.extra.update(heads=heads, cells=cells, rows=len(out))
        for r in range(1, len(out) + 1):
            held.parts.add(f"row:{r}")
            for c in range(1, len(heads) + 1):
                held.parts.add(f"cell:{r},{c}")
        for c in range(1, len(heads) + 1):
            held.parts.add(f"col:{c}")

    def _spec_ogive(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        points = _list(v.get("points"), where, "points", 2, 16)
        pairs = [list(_pair(p, where, "a point", rising=False)) for p in points]
        for (x0, y0), (x1, y1) in itertools.pairwise(pairs):
            if not x1 > x0:
                raise SystemExit(f"{where}: an ogive's boundaries rise: {fmt(x0)}, then {fmt(x1)}")
            if y1 < y0:
                raise SystemExit(f"{where}: a running total never falls: {fmt(y0)}, then {fmt(y1)}")
        if pairs[0][1] < 0:
            raise SystemExit(f"{where}: a running total is never below 0")
        clean["points"] = pairs
        if v.get("start") is not None:
            sx, sy = _pair(v["start"], where, "start", rising=False)
            if sy != 0 or not sx < pairs[0][0]:
                raise SystemExit(f"{where}: start is [x, 0], before the first point")
            clean["start"] = [sx, sy]
        self._axes(v, clean, where, need=False)
        data = ([clean["start"]] if "start" in clean else []) + pairs
        held.extra["data"] = data
        later = v.get("later") is not None and _bool(v["later"], where, "later")
        if later:
            clean["later"] = True
            held.waiting.append("curve")
        else:
            self._ogive_plotted(held)

    @staticmethod
    def _ogive_plotted(held: _Held) -> None:
        held.parts.add("curve")
        for k in range(1, len(held.extra["data"]) + 1):
            held.parts.add(f"point:{k}")

    def _spec_ladder(
        self, v: dict[str, Any], clean: dict[str, Any], held: _Held, where: str
    ) -> None:
        mode = v.get("mode")
        if mode is None:
            mode = "lcm" if v.get("numbers") is not None else "divisor"
        if mode not in LADDER_MODES:
            raise SystemExit(
                f"{where}: a ladder's mode is one of {sorted(LADDER_MODES)} ({mode!r})"
            )

        def whole(value: object, what: str, least: int) -> int:
            if isinstance(value, bool) or not isinstance(value, int | float) or value != int(value):
                raise SystemExit(f"{where}: {what} is a whole number ({value!r})")
            if not least <= int(value) <= MAX_LADDER_NUMBER:
                raise SystemExit(
                    f"{where}: {what} is {least} to {MAX_LADDER_NUMBER} ({fmt(float(value))})"
                )
            return int(value)

        divisor: int | None = None
        find = "lcm"
        if mode == "lcm":
            if v.get("number") is not None or v.get("divisor") is not None:
                raise SystemExit(f"{where}: an lcm ladder has numbers: [..], not number or divisor")
            raw = _list(v.get("numbers"), where, "numbers", 2, 4)
            numbers = [whole(n, "each of numbers", 2) for n in raw]
            find = v.get("find", "lcm")
            if find not in LADDER_FINDS:
                raise SystemExit(f"{where}: find is one of {sorted(LADDER_FINDS)} ({find!r})")
            clean.update(mode="lcm", numbers=numbers, find=find)
            if find != "lcm" and math.gcd(*numbers) == 1:
                raise SystemExit(
                    f"{where}: {numbers} share no prime, so their HCF is 1: there is no "
                    "ladder to draw for it"
                )
        else:
            if v.get("numbers") is not None or v.get("find") is not None:
                raise SystemExit(
                    f"{where}: numbers and find are for an lcm ladder (mode: lcm); "
                    f"a {mode} ladder has one number"
                )
            numbers = [whole(v.get("number"), "number", 1 if mode == "divisor" else 2)]
            clean.update(mode=mode, number=numbers[0])
            if mode == "divisor":
                d = v.get("divisor")
                if isinstance(d, bool) or not isinstance(d, int) or not 2 <= d <= 9:
                    raise SystemExit(
                        f"{where}: divisor is the new base, a whole number 2 to 9 ({d!r})"
                    )
                divisor = d
                clean["divisor"] = d
            elif v.get("divisor") is not None:
                raise SystemExit(f"{where}: a factors ladder finds its own primes (no divisor)")
        rungs = ladder_rungs(mode, numbers, divisor, find)
        if len(rungs) - 1 > MAX_RUNGS:
            raise SystemExit(
                f"{where}: the ladder would have {len(rungs) - 1} rows (at most {MAX_RUNGS}); "
                "use smaller numbers"
            )
        self._check_ladder(mode, numbers, divisor, find, rungs, where)
        held.extra.update(mode=mode, rungs=rungs, stepped=0, read=False)
        held.parts.update({"row:0", "divisors"})
        for k in range(1, len(rungs)):
            held.waiting.append(f"row:{k}")

    @staticmethod
    def _check_ladder(
        mode: str,
        numbers: list[int],
        divisor: int | None,
        find: str,
        rungs: list[Rung],
        where: str,
    ) -> None:
        """The arithmetic, checked a second way: every row divides as written, and the result
        is the number again (in its base, as the product of its primes, or as the LCM/HCF)."""
        for above, below in itertools.pairwise(rungs):
            p = above.divisor
            if p is None:
                raise SystemExit(f"{where}: the ladder stops at {above.values} early")
            for a, b in zip(above.values, below.values, strict=True):
                if mode == "divisor":
                    r = below.remainder or 0
                    ok = a == b * p + r and 0 <= r < p
                else:
                    ok = b * p == a if a % p == 0 else b == a
                if not ok:
                    raise SystemExit(f"{where}: {a} ÷ {p} does not give {b}")
        if mode == "divisor":
            assert divisor is not None
            digits = "".join(str(r.remainder) for r in reversed(rungs[1:]))
            if int(digits, divisor) != numbers[0]:
                raise SystemExit(f"{where}: {digits} in base {divisor} is not {numbers[0]}")
            return
        primes = [r.divisor for r in rungs if r.divisor is not None]
        if mode == "factors":
            if math.prod(primes) != numbers[0]:
                raise SystemExit(f"{where}: the primes {primes} do not make {numbers[0]}")
            return
        common = [r.divisor for r in rungs if r.common and r.divisor is not None]
        if find != "hcf" and math.prod(primes) != math.lcm(*numbers):
            raise SystemExit(f"{where}: the ladder's primes do not make the LCM of {numbers}")
        if math.prod(common) != math.gcd(*numbers):
            raise SystemExit(f"{where}: the shared primes do not make the HCF of {numbers}")

    def _ladder_part(self, held: _Held, name: str, where: str) -> str:
        lower = name.strip().lower()
        rungs: list[Rung] = held.extra["rungs"]
        if lower in ("number", "top"):
            return "row:0"
        if lower in ("divisor", "divisors"):
            return "divisors"
        if lower in ("remainder", "remainders"):
            if held.extra["mode"] != "divisor":
                raise SystemExit(
                    f"{where}: only a base ladder (divisor mode) has remainders; a "
                    f"{held.extra['mode']} ladder's parts are row:N, divisors and result"
                )
            return "remainders"
        if lower == "result":
            return "result"
        if m := re.fullmatch(r"row:\s*(\d+)", lower):
            k = int(m.group(1))
            if k >= len(rungs):
                raise SystemExit(
                    f"{where}: the ladder has rows 1 to {len(rungs) - 1} (row:0 is the number "
                    f"at the top) ({name!r})"
                )
            return f"row:{k}"
        raise SystemExit(
            f"{where}: a ladder's parts are row:N (row:0 the number at the top), divisors, "
            f"remainders (divisor mode) and result ({name!r})"
        )

    def _op_ladder(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        rows = len(held.extra["rungs"]) - 1
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "step":
            n = action.get("n", 1)
            if isinstance(n, bool) or not isinstance(n, int) or n < 1:
                raise SystemExit(f"{where}: step's n is how many rows, 1 or more ({n!r})")
            left = rows - held.extra["stepped"]
            if n > left:
                raise SystemExit(
                    f"{where}: step {n}, but the ladder has {left} row(s) left to write "
                    f"(it has {rows} in all)"
                )
            if "n" in action:
                clean["n"] = n
            for _ in range(n):
                held.extra["stepped"] += 1
                name = f"row:{held.extra['stepped']}"
                held.waiting.remove(name)
                held.parts.add(name)
            if held.extra["mode"] == "divisor":
                held.parts.add("remainders")
        elif op == "read":
            if held.extra["read"]:
                raise SystemExit(f"{where}: the ladder is read already")
            if held.extra["stepped"] < rows:
                raise SystemExit(
                    f"{where}: read once every row is written ({held.extra['stepped']} of "
                    f"{rows} so far: step the rest first)"
                )
            held.extra["read"] = True
            held.parts.add("result")

    # ----------------------------------------------------------------- parts by name

    def resolve(self, held: _Held, part: object, where: str, drawn: bool = True) -> str:
        """A part named in an action or a link, checked: the canonical part it is."""
        if not isinstance(part, str) or not part.strip():
            raise SystemExit(f"{where}: part is a part's name ({part!r})")
        name = part.strip()
        kind = held.kind
        canonical = name
        if kind == "venn":
            if name in held.extra["keys"] or name == "U":
                canonical = name
                if name == "U" and not held.extra["universal"]:
                    raise SystemExit(f"{where}: there is no universal set U")
            else:
                masks = self._venn_region(held, name, where, single=False)
                return (
                    name if len(masks) > 1 else region_name(next(iter(masks)), held.extra["keys"])
                )
        elif kind == "pie":
            m = re.fullmatch(r"sector:(.+)", name)
            if not m:
                raise SystemExit(
                    f"{where}: a pie's parts are 'sector:2' or 'sector:<label>' ({name!r})"
                )
            canonical = self._numbered(m.group(1), held.extra["labels"], "sector", where)
        elif kind in ("bar", "histogram"):
            m = re.fullmatch(r"bar:(.+)", name)
            if m:
                canonical = self._numbered(m.group(1), held.extra["labels"], "bar", where)
        elif kind == "tree":
            m = re.fullmatch(r"(branch|path):(.+)", name)
            route = m.group(2) if m else name
            route = "/".join(s.strip() for s in route.split("/"))
            known = {p.lower(): p for p in held.extra["paths"]}
            if route.lower() not in known:
                raise SystemExit(
                    f"{where}: the tree has no branch {route!r} "
                    f"(it has {sorted(held.extra['paths'])})"
                )
            prefix = m.group(1) if m and m.group(1) == "path" else "branch"
            canonical = f"{prefix}:{known[route.lower()]}"
        elif kind == "table":
            canonical = self._table_part(held, name, where)
        elif kind == "ladder":
            canonical = self._ladder_part(held, name, where)
        if drawn and canonical not in held.parts:
            if canonical in held.waiting:
                raise SystemExit(f"{where}: {name!r} is `later`, and nothing has drawn it yet")
            raise SystemExit(
                f"{where}: {held.kind} {held.spec['id']!r} has no part {name!r} yet "
                f"(it has {sorted(held.parts)})"
            )
        return canonical

    @staticmethod
    def _numbered(key: str, labels: list[str], what: str, where: str) -> str:
        key = key.strip()
        if key.isdigit() and 1 <= int(key) <= len(labels):
            return f"{what}:{int(key)}"
        for k, label in enumerate(labels, start=1):
            if label.lower() == key.lower():
                return f"{what}:{k}"
        raise SystemExit(f"{where}: there is no {what} {key!r} (1 to {len(labels)}, or {labels})")

    @staticmethod
    def _column(held: _Held, key: str, where: str) -> int:
        heads: list[str] = held.extra["heads"]
        key = key.strip()
        if key.isdigit() and 1 <= int(key) <= len(heads):
            return int(key)
        for c, head in enumerate(heads, start=1):
            if head.lower() == key.lower():
                return c
        raise SystemExit(f"{where}: the table has no column {key!r} ({heads})")

    def _table_part(self, held: _Held, name: str, where: str) -> str:
        if m := re.fullmatch(r"cell:\s*(\d+)\s*,\s*(.+)", name):
            r = int(m.group(1))
            if not 1 <= r <= held.extra["rows"]:
                raise SystemExit(f"{where}: the table has no row {r}")
            return f"cell:{r},{self._column(held, m.group(2), where)}"
        if m := re.fullmatch(r"col:(.+)", name):
            return f"col:{self._column(held, m.group(1), where)}"
        if m := re.fullmatch(r"total:(.+)", name):
            return f"total:{self._column(held, m.group(1), where)}"
        if re.fullmatch(r"row:\d+", name):
            return name
        raise SystemExit(
            f"{where}: a table's parts are row:N, col:N, cell:R,C and total:C ({name!r})"
        )

    # ----------------------------------------------------------------- acting on one

    def act(self, value: object, where: str) -> list[dict[str, Any]]:
        """A moment's `diagram_do`, checked, as it is stored."""
        if not isinstance(value, list) or not value:
            raise SystemExit(f"{where}: diagram_do is a list of actions")
        if len(value) > MAX_OPS:
            raise SystemExit(
                f"{where}: {len(value)} diagram actions on one moment (at most {MAX_OPS})"
            )
        return [
            self._action(action, f"{where} diagram action {k}") for k, action in enumerate(value)
        ]

    def _action(self, action: object, where: str) -> dict[str, Any]:
        if not isinstance(action, dict):
            raise SystemExit(f"{where}: an action is {{id, op, …}}")
        handle = action.get("id")
        if not isinstance(handle, str) or handle not in self.held:
            raise SystemExit(
                f"{where}: id {handle!r} is not a diagram brought in by this moment "
                "or an earlier one"
            )
        held = self.held[handle]
        op = action.get("op")
        known = ops_of(held.kind)
        if op not in known:
            raise SystemExit(f"{where}: a {held.kind} takes {sorted(known)} ({op!r})")
        need, may = known[str(op)]
        keys = set(action) - {"id", "op"}
        if need - keys:
            raise SystemExit(f"{where}: {op} needs {sorted(need - keys)}")
        if keys - need - may:
            raise SystemExit(f"{where}: {op} takes no {sorted(keys - need - may)}")
        clean: dict[str, Any] = {"id": handle, "op": op}
        if "text" in action:
            most = MAX_VALUE if op in ("fill",) else MAX_TEXT
            clean["text"] = _text(action["text"], where, "text", most)
        if "colour" in action:
            clean["colour"] = _colour(action["colour"], where)
        if "answer" in action and _bool(action["answer"], where, "answer"):
            clean["answer"] = True
        getattr(self, f"_op_{held.kind}", self._op_common)(held, str(op), action, clean, where)
        self.plans[handle].append(clean)
        return clean

    def _op_common(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        if op not in COMMON_OPS:
            raise SystemExit(f"{where}: {op} is not an action on a {held.kind}")
        clean["part"] = (
            action["part"].strip() if isinstance(action.get("part"), str) else action.get("part")
        )
        self.resolve(held, action["part"], where)
        if op == "arrow":
            self.resolve(held, action["to_part"], where)
            clean["to_part"] = action["to_part"].strip()

    def _draw_next(self, held: _Held, part: object, prefix: str, where: str, op: str) -> str:
        """A `later` item an action draws: the one named, or the next one waiting."""
        if part is None:
            waiting = [w for w in held.waiting if w.startswith(prefix)]
            if not waiting:
                raise SystemExit(f"{where}: {op} draws a `later` item, and none is left to draw")
            name = waiting[0]
        else:
            name = self.resolve(held, part, where, drawn=False)
            if name in held.parts:
                raise SystemExit(f"{where}: {op}: {part!r} is drawn already")
            if name not in held.waiting:
                raise SystemExit(f"{where}: {op}: {part!r} is not a `later` item")
        held.waiting.remove(name)
        held.parts.add(name)
        return name

    def _op_graph(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        x_range = held.spec["x"]
        plots = {p["name"]: p for p in held.extra["plots"]}

        def plot_of(key: str) -> dict[str, Any]:
            name = self.resolve(held, action[key], where)
            if name not in plots:
                raise SystemExit(f"{where}: {key} {action[key]!r} is not a plot")
            clean[key] = name
            return plots[name]

        def within(x: float, what: str) -> float:
            if not x_range[0] <= x <= x_range[1]:
                raise SystemExit(
                    f"{where}: {what} {fmt(x)} is off the graph "
                    f"({fmt(x_range[0])} to {fmt(x_range[1])})"
                )
            return x

        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "plot":
            clean_part = self._draw_next(held, action.get("part"), "plot:", where, op)
            if action.get("part") is not None:
                clean["part"] = clean_part
        elif op == "point":
            clean["x"] = within(_num(action["x"], where, "x"), "x")
            if action.get("part") is not None:
                plot = plot_of("part")
                if plot["fn"] is None and action.get("y") is None:
                    raise SystemExit(f"{where}: a point on a plot of points needs its y")
            elif action.get("y") is None:
                raise SystemExit(f"{where}: a point needs its y, or the plot (part) it is on")
            if action.get("y") is not None:
                clean["y"] = _num(action["y"], where, "y")
            held.parts.add(f"point:{held.next('point')}")
        elif op == "intercepts":
            plot = plot_of("part")
            axis = action.get("axis", "both")
            if axis not in ("x", "y", "both"):
                raise SystemExit(f"{where}: axis is x, y or both")
            if "axis" in action:
                clean["axis"] = axis
            if plot["fn"] is None:
                raise SystemExit(f"{where}: intercepts are found on a plot with a fn")
            lo, hi = x_range
            if plot["domain"]:
                lo, hi = max(lo, plot["domain"][0]), min(hi, plot["domain"][1])
            found = count_roots(plot["fn"], lo, hi) if axis != "y" else 0
            if axis != "x" and x_range[0] <= 0 <= x_range[1] and _value(plot["fn"], 0) is not None:
                found += 1
            if found == 0:
                raise SystemExit(f"{where}: {clean['part']} crosses no axis on this graph")
            for _ in range(found):
                held.parts.add(f"point:{held.next('point')}")
        elif op == "vertex":
            plot = plot_of("part")
            if plot["fn"] is None or _turning(_samples(plot["fn"], *x_range)) is None:
                raise SystemExit(f"{where}: {clean['part']} has no turning point on this graph")
            held.parts.add(f"point:{held.next('point')}")
        elif op == "line":
            has_m = "m" in action
            if has_m == ("through" in action):
                raise SystemExit(f"{where}: a line has m (and c), or through: [[x1, y1], [x2, y2]]")
            if has_m:
                clean["m"] = _num(action["m"], where, "m")
                clean["c"] = _num(action.get("c", 0), where, "c")
            else:
                ends = _list(action["through"], where, "through", 2, 2)
                (x1, y1), (x2, y2) = (_pair(p, where, "a point", rising=False) for p in ends)
                if x1 == x2:
                    raise SystemExit(
                        f"{where}: a line through two points with the same x is upright; not drawn"
                    )
                clean["through"] = [[x1, y1], [x2, y2]]
            if "label" in action:
                clean["label"] = _text(action["label"], where, "label")
            name = f"plot:{held.next('plot')}"
            fn = None
            if has_m:
                fn = (lambda m, c: lambda x: m * x + c)(clean["m"], clean["c"])
            held.extra["plots"].append({"name": name, "fn": fn, "domain": None})
            held.parts.add(name)
        elif op == "shade":
            plot_of("part")
            if action.get("to_part") is not None:
                plot_of("to_part")
                if clean["to_part"] == clean["part"]:
                    raise SystemExit(f"{where}: shade between two different plots")
            if action.get("x") is not None:
                a, b = _pair(action["x"], where, "x")
                clean["x"] = [within(a, "x"), within(b, "x")]
            held.parts.add(f"shade:{held.next('shade')}")
        elif op == "gradient":
            plot_of("part")
            a, b = _pair(action["x"], where, "x")
            clean["x"] = [within(a, "x"), within(b, "x")]
            held.parts.add(f"gradient:{held.next('gradient')}")

    def _op_venn(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "draw-set":
            name = self._draw_next(held, action.get("part"), "", where, op)
            if action.get("part") is not None:
                clean["part"] = name
        elif op == "fill":
            self._venn_region(held, str(action["part"]), where, single=True)
            clean["part"] = str(action["part"]).strip()
        elif op == "shade":
            self._venn_region(held, str(action["part"]), where, single=False)
            clean["part"] = str(action["part"]).strip()

    def _op_pie(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "draw-sector":
            self._draw_next(held, action.get("part"), "sector:", where, op)
            if action.get("part") is not None:
                clean["part"] = action["part"].strip()
        else:
            self.resolve(held, action["part"], where)
            clean["part"] = action["part"].strip()
            if op == "angle" and "text" in clean and len(clean["text"]) > 12:
                raise SystemExit(f"{where}: an angle's text is short, like '90°'")

    def _op_bar(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "grow":
            if action.get("part") is not None:
                self._draw_next(held, action["part"], "bar:", where, op)
                clean["part"] = action["part"].strip()
            else:
                waiting = [w for w in held.waiting if w.startswith("bar:")]
                if not waiting:
                    raise SystemExit(f"{where}: grow raises the `later` bars, and none is left")
                for name in waiting:
                    held.waiting.remove(name)
                    held.parts.add(name)
        elif op == "line":
            y = _num(action["y"], where, "y")
            if not 0 <= y <= held.extra["top"]:
                raise SystemExit(
                    f"{where}: y {fmt(y)} is off the chart (0 to {fmt(held.extra['top'])})"
                )
            clean["y"] = y
            held.parts.add(f"line:{held.next('line')}")

    _op_histogram = _op_bar

    def _op_numberline(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        a, b = held.spec["range"]

        def on_line(key: str) -> float:
            x = _num(action[key], where, key)
            if not a <= x <= b:
                raise SystemExit(
                    f"{where}: {key} {fmt(x)} is off the number line ({fmt(a)} to {fmt(b)})"
                )
            clean[key] = x
            return x

        if op == "label":
            if ("part" in action) == ("x" in action):
                raise SystemExit(
                    f"{where}: a number line's label is at x, or by a part, one of them"
                )
            if "x" in action:
                on_line("x")
            else:
                self._op_common(held, op, action, clean, where)
        elif op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "point":
            on_line("x")
            if "open" in action:
                clean["open"] = _bool(action["open"], where, "open")
            held.parts.add(f"point:{held.next('point')}")
        elif op == "hop":
            if on_line("from") == on_line("to"):
                raise SystemExit(f"{where}: a hop goes somewhere: from and to are the same")
            if "text" in clean and len(clean["text"]) > 12:
                raise SystemExit(f"{where}: a hop's text is short, like '+3'")
            held.parts.add(f"hop:{held.next('hop')}")
        elif op == "interval":
            if "from" not in action and "to" not in action:
                raise SystemExit(f"{where}: an interval has a from, a to, or both")
            ends = [on_line(key) for key in ("from", "to") if key in action]
            if len(ends) == 2 and not ends[0] < ends[1]:
                raise SystemExit(f"{where}: an interval runs from the smaller to the larger")
            for key, end in (("from_open", "from"), ("to_open", "to")):
                if key in action:
                    if end not in action:
                        raise SystemExit(f"{where}: {key} is for an interval with a {end}")
                    clean[key] = _bool(action[key], where, key)
            held.parts.add(f"interval:{held.next('interval')}")

    def _op_tree(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        paths = held.extra["paths"]
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "branch":
            if action.get("part") is not None:
                name = self.resolve(held, action["part"], where, drawn=False)
            else:
                waiting = [w for w in held.waiting if w.startswith("branch:")]
                if not waiting:
                    raise SystemExit(f"{where}: branch draws a `later` branch, and none is left")
                name = waiting[0]
            route = name.split(":", 1)[1]
            parent = route.rsplit("/", 1)[0] if "/" in route else None
            if parent is not None and f"branch:{parent}" not in held.parts:
                raise SystemExit(
                    f"{where}: branch {route!r} grows from {parent!r}, which is not drawn yet"
                )
            self._draw_next(held, name, "branch:", where, op)
            if action.get("part") is not None:
                clean["part"] = name
        elif op == "path":
            name = self.resolve(held, action["part"], where, drawn=False)
            route = name.split(":", 1)[1]
            steps = route.split("/")
            for k in range(1, len(steps) + 1):
                if f"branch:{'/'.join(steps[:k])}" not in held.parts:
                    raise SystemExit(
                        f"{where}: the path {route!r} runs along a branch not drawn yet"
                    )
            if "text" not in clean and any(
                paths["/".join(steps[:k])]["p"] is None for k in range(1, len(steps) + 1)
            ):
                raise SystemExit(
                    f"{where}: the path {route!r} has a branch with no p; give its text"
                )
            clean["part"] = f"branch:{route}"
            held.parts.add(f"path:{route}")

    def _op_table(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        cells: dict[tuple[int, int], str] = held.extra["cells"]
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "fill":
            name = self._table_part(held, str(action["part"]), where)
            if not name.startswith("cell:"):
                raise SystemExit(f"{where}: fill writes in a cell: cell:R,C")
            r, c = (int(n) for n in name[5:].split(","))
            cells[(r, c)] = clean["text"]
            clean["part"] = str(action["part"]).strip()
        elif op == "total":
            name = self._table_part(held, str(action["part"]), where)
            if not name.startswith("col:"):
                raise SystemExit(f"{where}: total adds up a column: col:N or col:<header>")
            c = int(name[4:])
            for r in range(1, held.extra["rows"] + 1):
                value = cells.get((r, c), "").replace("−", "-")
                try:
                    float(value)
                except ValueError:
                    raise SystemExit(
                        f"{where}: total of {name}: row {r} is {value or 'empty'!r}, not a number"
                    ) from None
            clean["part"] = str(action["part"]).strip()
            if action.get("into") is not None:
                into = self._table_part(held, str(action["into"]), where)
                if not into.startswith("col:") or into == name:
                    raise SystemExit(
                        f"{where}: into is another column, where the running totals go"
                    )
                clean["into"] = str(action["into"]).strip()
                d = int(into[4:])
                for r in range(1, held.extra["rows"] + 1):
                    cells[(r, d)] = "0"
            else:
                held.parts.add(f"total:{c}")

    def _op_ogive(
        self, held: _Held, op: str, action: dict[str, Any], clean: dict[str, Any], where: str
    ) -> None:
        if op in COMMON_OPS:
            self._op_common(held, op, action, clean, where)
        elif op == "plot":
            if "curve" in held.parts:
                raise SystemExit(f"{where}: the ogive is plotted already (it is not `later`)")
            held.waiting.remove("curve")
            self._ogive_plotted(held)
        elif op == "read":
            if "curve" not in held.parts:
                raise SystemExit(f"{where}: read from the curve once it is plotted")
            if ("x" in action) == ("y" in action):
                raise SystemExit(f"{where}: read from one axis: x, or y, one of them")
            data = held.extra["data"]
            key = "y" if "y" in action else "x"
            value = _num(action[key], where, key)
            k = 1 if key == "y" else 0
            lo, hi = data[0][k], data[-1][k]
            if not lo <= value <= hi:
                raise SystemExit(
                    f"{where}: {key} {fmt(value)} is off the curve ({fmt(lo)} to {fmt(hi)})"
                )
            clean[key] = value
            held.parts.add(f"read:{held.next('read')}")

    # ----------------------------------------------------------------- a board line's link

    def link(self, handle: object, part: object, where: str) -> dict[str, object]:
        """A mark's `to: {diagram, part}`, checked against the diagram as it is now."""
        if not isinstance(handle, str) or handle not in self.held:
            raise SystemExit(
                f"{where}: to.diagram {handle!r} is not a diagram brought in by this "
                "moment or earlier"
            )
        clean: dict[str, object] = {"diagram": handle}
        if part is not None:
            self.resolve(self.held[handle], part, where)
            clean["part"] = str(part).strip()
        return clean


def check_diagram_link(to: object, where: str, book: DiagramBook | None) -> dict[str, object]:
    """Where a mark on the working links to a diagram: `to: {diagram, part?}`."""
    if not isinstance(to, dict) or set(to) - {"diagram", "part"}:
        raise SystemExit(f"{where}: a link to a diagram is to: {{diagram: <id>, part: <part>}}")
    if book is None:
        clean: dict[str, object] = {"diagram": to.get("diagram")}
        if to.get("part") is not None:
            clean["part"] = to["part"]
        return clean
    return book.link(to.get("diagram"), to.get("part"), where)
