"""The loader's rules for a lesson's marks and sketches (database/lesson_marks.py)."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

_SOURCE = Path(__file__).resolve().parents[3] / "database" / "lesson_marks.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("lesson_marks", _SOURCE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


marks = _load()

SKETCH = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-label="A circle">'
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#000"/>'
    '<circle cx="50" cy="10" r="3" fill="#000"/><text x="55" y="10">A</text></svg>'
)


def test_sketches_come_in_once_each_and_in_order() -> None:
    drawn = {"sketch": SKETCH, "sketch_b": SKETCH, "sketch_c": SKETCH}
    assert marks.clean_show_sketch(True, drawn, [], "here") == "sketch"
    assert marks.clean_show_sketch("sketch_b", drawn, ["sketch"], "here") == "sketch_b"
    assert marks.clean_show_sketch("sketch_c", drawn, ["sketch", "sketch_b"], "here") == "sketch_c"
    with pytest.raises(SystemExit, match="no moment has brought in"):
        marks.clean_show_sketch("sketch_c", drawn, ["sketch"], "here")
    with pytest.raises(SystemExit, match="once"):
        marks.clean_show_sketch("sketch", drawn, ["sketch"], "here")
    with pytest.raises(SystemExit, match="in order"):
        marks.clean_show_sketch("sketch_b", drawn, ["sketch_c"], "here")
    with pytest.raises(SystemExit, match="no sketch_c file"):
        marks.clean_show_sketch("sketch_c", {"sketch": SKETCH}, ["sketch"], "here")
    with pytest.raises(SystemExit, match="show_sketch is"):
        marks.clean_show_sketch("sketch_d", drawn, [], "here")


def test_an_arrow_goes_across_between_the_working_and_a_sketch() -> None:
    sketches = {"sketch": SKETCH}
    point = [
        {"line": 1, "kind": "arrow", "at": "(2, 0)", "to": {"figure": "sketch", "target": "A"}},
        {"figure": "sketch", "kind": "arrow", "target": "A", "to": {"line": 0, "at": "x"}},
    ]
    assert marks.clean_points(point, 1, "here", [], sketches) == [
        {"line": 1, "kind": "arrow", "at": "(2, 0)", "to": {"figure": "sketch", "target": "A"}},
        {"figure": "sketch", "kind": "arrow", "target": "A", "to": {"line": 0, "at": "x"}},
    ]
    bad: list[list[dict[str, object]]] = [
        [{"line": 1, "kind": "circle", "to": {"figure": "sketch", "target": "A"}}],
        [{"line": 1, "kind": "arrow", "to": {"figure": "sketch", "target": "Z"}}],
        [{"figure": "sketch", "kind": "arrow", "target": "A", "to": {"line": 2}}],
        [
            {
                "line": 1,
                "kind": "arrow",
                "from": {"line": 0},
                "to": {"figure": "sketch", "target": "A"},
            }
        ],
    ]
    for case in bad:
        with pytest.raises(SystemExit):
            marks.clean_points(case, 1, "here", [], sketches)


PASSAGE = (
    "Like all reptiles, snakes are cold-blooded, or more correctly, ectodermic — they "
    "cannot produce their own body heat. Some wait for months between successive meals and a "
    "few survive by eating a large meal just once or twice a year.\n\nThey don"
    + chr(0x2019)  # a curly apostrophe, matched as a straight one
    + "t eat often, but when they eat, they eat big. They eat a meal; a meal is a meal."
)


def test_a_mark_in_the_passage_names_words_that_are_there() -> None:
    point = [
        {"passage": True, "kind": "highlight", "target": "once or twice a year", "text": "seldom"},
        {"passage": True, "kind": "label", "target": "a meal", "nth": 2, "text": "the clue"},
        # Quotes, apostrophes, dashes and line breaks are matched loosely.
        {"passage": True, "kind": "underline", "target": "They don't eat often"},
    ]
    assert marks.clean_points(point, 0, "here", passage=PASSAGE) == [
        {
            "passage": True,
            "kind": "highlight",
            "text": "seldom",
            "target": "once or twice a year",
        },
        {"passage": True, "kind": "label", "text": "the clue", "target": "a meal", "nth": 2},
        {"passage": True, "kind": "underline", "target": "They don't eat often"},
    ]
    assert marks.passage_count("ectodermic - they", PASSAGE) == 1
    assert marks.passage_count("meals and a\n few", PASSAGE) == 1
    assert marks.passage_count("A meal", PASSAGE) == 0  # matched with its case


def test_a_passage_mark_that_cannot_be_found_is_refused() -> None:
    bad: list[tuple[dict[str, object], str]] = [
        ({"passage": True, "kind": "highlight", "target": "twice a week"}, "not in the passage"),
        ({"passage": True, "kind": "highlight", "target": "a meal", "nth": 4}, "out of range"),
        ({"passage": True, "kind": "highlight", "target": "a meal", "nth": 0}, "out of range"),
        ({"passage": True, "kind": "arrow", "target": "a meal"}, "kind is one of"),
        ({"passage": True, "kind": "label", "target": "a meal"}, "needs its text"),
        ({"passage": True, "kind": "circle", "target": "a meal", "line": 0}, "not line"),
        ({"passage": True, "kind": "circle"}, "needs a target"),
        ({"passage": "yes", "kind": "circle", "target": "a meal"}, "passage: true"),
        ({"line": 0, "kind": "circle", "nth": 2}, "nth picks"),
        (
            {"passage": True, "kind": "label", "target": "a meal", "text": "x" * 81},
            "at most",
        ),
    ]
    for mark, message in bad:
        with pytest.raises(SystemExit, match=message):
            marks.clean_points([mark], 0, "here", passage=PASSAGE)
    with pytest.raises(SystemExit, match="has no passage"):
        marks.clean_points([{"passage": True, "kind": "circle", "target": "a meal"}], 0, "here")


def test_a_line_of_the_working_links_to_the_passage() -> None:
    point = [
        {
            "line": 1,
            "kind": "highlight",
            "at": "once or twice a year",
            "to": {"passage": True, "target": "once or twice a year"},
        },
        {"line": 0, "kind": "arrow", "to": {"passage": True, "target": "a meal", "nth": 2}},
    ]
    assert marks.clean_points(point, 1, "here", passage=PASSAGE) == [
        {
            "line": 1,
            "kind": "highlight",
            "at": "once or twice a year",
            "to": {"passage": True, "target": "once or twice a year"},
        },
        {"line": 0, "kind": "arrow", "to": {"passage": True, "target": "a meal", "nth": 2}},
    ]
    bad: list[dict[str, object]] = [
        {"line": 1, "kind": "highlight", "to": {"passage": True, "target": "twice a week"}},
        {"line": 1, "kind": "highlight", "to": {"passage": True, "target": "a meal", "nth": 5}},
        {"line": 1, "kind": "highlight", "to": {"passage": True, "target": "a", "at": "x"}},
        {"line": 1, "kind": "move", "from": {"line": 0}, "to": {"passage": True, "target": "a"}},
        {"line": 1, "kind": "arrow", "from": {"line": 0}, "to": {"passage": True, "target": "a"}},
    ]
    for mark in bad:
        with pytest.raises(SystemExit):
            marks.clean_points([mark], 1, "here", passage=PASSAGE)
