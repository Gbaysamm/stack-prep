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
