"""A lesson's CUES: things that land on the word that names them, checked before loading.

Shared by load_retranscribed_maths.py and load_retranscribed_english.py. In the board's
whiteboard style (docs/lesson-style-guide.md section 6), an item may wait for a word of its
moment's `say` instead of going up with the moment:

    - say: Look at the middle one. It is the median.
      write: $\\text{median} = 7$
      on: median                      # the write (and a show_sketch) lands on "median"
      point:
        - {line: 0, kind: circle, at: '7', on: middle one}
      doodle: {name: lightbulb, on: look}
      doodle_do:
        - {id: bag, op: count, n: 3, on: it, on_nth: 2}

Where `on` may go:

* on the MOMENT: times its `write` line, and its `show_sketch` where it brings one in;
* on each `point[]` mark;
* on its `doodle`, and on each of its `doodles[]`;
* on each of its `doodle_do[]` actions;
* on its `diagram`, and on each of its `diagram_do[]` actions (lesson_diagrams.py).

`on` is a word or a few words in a row, as they are said. Matching ignores case and
punctuation, and words inside `$…$` maths do not count (the voice says maths its own way).
`on_nth` (from 1) picks a later occurrence where the words are said more than once; `nth` means
the same on the moment, a doodle and a doodle action, but not on a mark, where `nth` already
picks an occurrence in the passage.

The loader checks each cue's words are really said in that moment, often enough for its nth,
and stores it as `on` (and `on_nth` where it is more than 1). The classic board ignores it.

`split_cues` takes the cues off a moment before the rest of it is checked by lesson_marks.py
and lesson_doodles.py (which know nothing of them), and `attach_cues` puts them back on what
those return, item for item.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

_MATHS = re.compile(r"\$[^$]*\$")
_BREAK = re.compile(r"[\s\-\u2013\u2014/]+")
_NOT_WORD = re.compile(r"[^\w]|_")


def spoken_words(text: str) -> list[str]:
    """The words of `text` as they are matched: lower case, no punctuation, no maths."""
    plain = _MATHS.sub(" ", text)
    out: list[str] = []
    for token in _BREAK.split(plain.lower()):
        word = _NOT_WORD.sub("", token)
        if word:
            out.append(word)
    return out


def cue_count(say: str, words: str) -> int:
    """How many times the run of `words` is said in `say`."""
    want = spoken_words(words)
    heard = spoken_words(say)
    if not want:
        return 0
    return sum(
        1 for start in range(len(heard) - len(want) + 1) if heard[start : start + len(want)] == want
    )


def _nth(value: object, where: str, key: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise SystemExit(f"{where}: {key} is which time the words are said, from 1 ({value!r})")
    return value


def take_cue(
    item: dict[str, Any], say: str, where: str, nth_keys: tuple[str, ...] = ("on_nth", "nth")
) -> tuple[dict[str, Any], dict[str, object] | None]:
    """`item` without its cue keys, and the cue checked against `say` (None where it has none)."""
    if True in item and "on" not in item:
        # YAML 1.1 reads a bare `on:` key as the boolean true. In a lesson it can only mean the
        # cue, so it is taken as one rather than quietly dropped.
        item = {("on" if key is True else key): value for key, value in item.items()}
    present =[key for key in ("on", *nth_keys) if key in item]
    if not present:
        return item, None
    rest = {key: value for key, value in item.items() if key not in present}
    words = item.get("on")
    numbers = [key for key in nth_keys if key in item]
    if words is None:
        raise SystemExit(f"{where}: {numbers[0]} picks which time the `on` words are said; no on")
    if len(numbers) > 1:
        raise SystemExit(f"{where}: give on_nth or nth, not both")
    if isinstance(words, int | float) and not isinstance(words, bool):
        words = str(words)
    if not isinstance(words, str) or not spoken_words(words):
        raise SystemExit(f"{where}: on is a word or a few words said in this moment ({words!r})")
    nth = _nth(item[numbers[0]], where, numbers[0]) if numbers else 1
    found = cue_count(say, words)
    if found == 0:
        raise SystemExit(
            f"{where}: on {words!r} is not said in this moment (maths in $…$ does not count): "
            f"{say!r}"
        )
    if nth > found:
        raise SystemExit(f"{where}: on {words!r} nth {nth}, but it is said only {found} time(s)")
    cue: dict[str, object] = {"on": words.strip()}
    if nth > 1:
        cue["on_nth"] = nth
    return rest, cue


@dataclass
class Cues:
    """A moment's cues, by where they were: put back on the cleaned moment by attach_cues."""

    moment: dict[str, object] | None = None
    point: list[dict[str, object] | None] = field(default_factory=list)
    doodle: dict[str, object] | None = None
    doodles: list[dict[str, object] | None] = field(default_factory=list)
    doodle_do: list[dict[str, object] | None] = field(default_factory=list)
    #: A live diagram's, and its actions' (lesson_diagrams.py).
    diagram: dict[str, object] | None = None
    diagram_do: list[dict[str, object] | None] = field(default_factory=list)

    def any(self) -> bool:
        return any(
            [
                self.moment,
                self.doodle,
                self.diagram,
                *self.point,
                *self.doodles,
                *self.doodle_do,
                *self.diagram_do,
            ]
        )


def split_cues(moment: object, where: str) -> tuple[Any, Cues]:
    """The moment with every cue taken off (for the other checks), and the cues, checked."""
    cues = Cues()
    if not isinstance(moment, dict):
        return moment, cues
    say = moment.get("say")
    say = say if isinstance(say, str) else ""
    bare, cues.moment = take_cue(moment, say, where)
    if cues.moment is not None and not (bare.get("write") or bare.get("show_sketch")):
        raise SystemExit(
            f"{where}: a moment's on times its write or its show_sketch, and it has neither"
        )
    point = bare.get("point")
    if isinstance(point, list):
        cleaned = []
        for mark in point:
            if isinstance(mark, dict):
                # A mark's nth is the passage's; its cue's is on_nth.
                mark, cue = take_cue(mark, say, f"{where} mark", ("on_nth",))
            else:
                cue = None
            cleaned.append(mark)
            cues.point.append(cue)
        bare["point"] = cleaned
    one = bare.get("doodle")
    if isinstance(one, dict):
        bare["doodle"], cues.doodle = take_cue(one, say, f"{where} doodle")
    many = bare.get("doodles")
    if isinstance(many, list):
        cleaned = []
        for doodle in many:
            cue = None
            if isinstance(doodle, dict):
                doodle, cue = take_cue(doodle, say, f"{where} doodle")
            cleaned.append(doodle)
            cues.doodles.append(cue)
        bare["doodles"] = cleaned
    acts = bare.get("doodle_do")
    if isinstance(acts, list):
        cleaned = []
        for action in acts:
            cue = None
            if isinstance(action, dict):
                action, cue = take_cue(action, say, f"{where} doodle action")
            cleaned.append(action)
            cues.doodle_do.append(cue)
        bare["doodle_do"] = cleaned
    drawn = bare.get("diagram")
    if isinstance(drawn, dict):
        bare["diagram"], cues.diagram = take_cue(drawn, say, f"{where} diagram")
    acts = bare.get("diagram_do")
    if isinstance(acts, list):
        cleaned = []
        for action in acts:
            cue = None
            if isinstance(action, dict):
                action, cue = take_cue(action, say, f"{where} diagram action")
            cleaned.append(action)
            cues.diagram_do.append(cue)
        bare["diagram_do"] = cleaned
    return bare, cues


def _onto(items: object, cues: list[dict[str, object] | None]) -> None:
    if not isinstance(items, list):
        return
    for item, cue in zip(items, cues, strict=False):
        if cue is not None and isinstance(item, dict):
            item.update(cue)


def attach_cues(entry: dict[str, object], cues: Cues) -> None:
    """Put the cues back on the moment as it is stored (cleaned item for item, in order)."""
    if cues.moment is not None:
        entry.update(cues.moment)
    _onto(entry.get("point"), cues.point)
    if cues.doodle is not None and isinstance(entry.get("doodle"), dict):
        entry["doodle"].update(cues.doodle)  # type: ignore[union-attr]
    _onto(entry.get("doodles"), cues.doodles)
    _onto(entry.get("doodle_do"), cues.doodle_do)
    if cues.diagram is not None and isinstance(entry.get("diagram"), dict):
        entry["diagram"].update(cues.diagram)  # type: ignore[union-attr]
    _onto(entry.get("diagram_do"), cues.diagram_do)
