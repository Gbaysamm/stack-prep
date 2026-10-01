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


def test_a_value_travels_from_a_doodle_a_diagram_or_a_line() -> None:
    sketches = {"sketch": SKETCH}
    doodles = {"cls": {"total", "both"}}
    point = [
        {"line": 2, "kind": "travel", "at": "40", "from": {"doodle": "cls", "part": "total"}},
        {"line": 2, "kind": "travel", "at": "7", "from": {"figure": "sketch", "target": "A"}},
        {
            "line": -1,
            "kind": "travel",
            "at": "[[2]]x",
            "from": {"line": 0, "at": "x = 2"},
            "text": "x = 2",
        },
    ]
    assert marks.clean_points(point, 2, "here", [], sketches, doodles=doodles) == [
        {"line": 2, "kind": "travel", "at": "40", "from": {"doodle": "cls", "part": "total"}},
        {"line": 2, "kind": "travel", "at": "7", "from": {"figure": "sketch", "target": "A"}},
        {
            "line": -1,
            "kind": "travel",
            "text": "x = 2",
            "at": "[[2]]x",
            "from": {"line": 0, "at": "x = 2"},
        },
    ]
    bad: list[tuple[dict[str, object], str]] = [
        ({"line": 2, "kind": "travel", "from": {"doodle": "cls"}}, "needs at"),
        ({"line": 2, "kind": "travel", "at": "40"}, "needs from"),
        ({"line": 3, "kind": "travel", "at": "40", "from": {"doodle": "cls"}}, "earlier one"),
        ({"line": 2, "kind": "travel", "at": "40", "from": {"doodle": "jar"}}, "not a doodle"),
        (
            {"line": 2, "kind": "travel", "at": "4", "from": {"doodle": "cls", "part": "x"}},
            "no part",
        ),
        (
            {"line": 2, "kind": "travel", "at": "4", "from": {"figure": "sketch"}},
            "figure: …, target",
        ),
        (
            {"line": 2, "kind": "travel", "at": "4", "from": {"figure": "sketch", "target": "Z"}},
            "not made of",
        ),
        ({"line": 2, "kind": "travel", "at": "4", "from": {"line": 3}}, "earlier one"),
        ({"line": 2, "kind": "travel", "at": "4", "from": {"word": "x"}}, "travel's from is"),
        (
            {"line": 2, "kind": "travel", "at": "4", "from": {"line": 0}, "to": {"doodle": "cls"}},
            "not to",
        ),
    ]
    for mark, message in bad:
        with pytest.raises(SystemExit, match=message):
            marks.clean_points([mark], 2, "here", [], sketches, doodles=doodles)


def test_a_section_is_a_short_heading() -> None:
    assert marks.clean_section("  Find   the union ", "here") == "Find the union"
    for value, message in [("", "short heading"), (3, "short heading"), ("x" * 41, "at most 40")]:
        with pytest.raises(SystemExit, match=message):
            marks.clean_section(value, "here")


def test_the_board_is_sent_a_travel_whole_or_not_at_all() -> None:
    from app.routers.practice import _points

    sent = _points(
        [
            {"line": 2, "kind": "travel", "at": "40", "from": {"doodle": "cls", "part": "total"}},
            {"line": 2, "kind": "travel", "at": "7", "from": {"figure": "sketch", "target": "A"}},
            {"line": 2, "kind": "travel", "at": "2", "from": {"line": 0, "at": "x"}, "text": "x"},
            # Not whole: nothing to land on, or nowhere to come from.
            {"line": 2, "kind": "travel", "from": {"line": 0}},
            {"line": 2, "kind": "travel", "at": "2", "from": {"figure": "sketch"}},
        ]
    )
    assert sent is not None
    assert [p.model_dump(by_alias=True, exclude_none=True) for p in sent] == [
        {"line": 2, "kind": "travel", "at": "40", "from": {"doodle": "cls", "part": "total"}},
        {"line": 2, "kind": "travel", "at": "7", "from": {"figure": "sketch", "target": "A"}},
        {"line": 2, "kind": "travel", "text": "x", "at": "2", "from": {"line": 0, "at": "x"}},
    ]
