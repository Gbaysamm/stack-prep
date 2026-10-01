"""The loader's rules for `on:` cues (database/lesson_cues.py), and the API passing them on."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

from app.lesson_cues import LessonCue, cue_of
from app.lesson_doodles import doodle_actions, doodle_ref
from app.routers.practice import _cued_points

_SOURCE = Path(__file__).resolve().parents[3] / "database" / "lesson_cues.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("lesson_cues", _SOURCE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    # Registered first: its dataclass looks itself up by module name.
    sys.modules.setdefault("lesson_cues", module)
    spec.loader.exec_module(module)
    return module


cues = _load()

SAY = "Look at the middle one, the MIDDLE one. It is $x^2$, so the median is seven."


def test_words_are_matched_without_case_punctuation_or_maths() -> None:
    assert cues.spoken_words("The MIDDLE one, it's $x^2 + y$ — seven!") == [
        "the",
        "middle",
        "one",
        "its",
        "seven",
    ]
    assert cues.cue_count(SAY, "middle one") == 2
    assert cues.cue_count(SAY, "Median.") == 1
    # Maths is not words: x is inside $…$.
    assert cues.cue_count(SAY, "x") == 0


def test_a_cue_is_taken_off_and_checked() -> None:
    item = {"line": 0, "kind": "circle", "on": "middle one", "on_nth": 2}
    rest, cue = cues.take_cue(item, SAY, "here", ("on_nth",))
    assert rest == {"line": 0, "kind": "circle"}
    assert cue == {"on": "middle one", "on_nth": 2}
    # The first time is not stored.
    assert cues.take_cue({"on": "median", "nth": 1}, SAY, "here")[1] == {"on": "median"}
    # No cue, nothing changed.
    assert cues.take_cue({"kind": "box"}, SAY, "here") == ({"kind": "box"}, None)


@pytest.mark.parametrize(
    ("item", "message"),
    [
        ({"on": "triangle"}, "not said in this moment"),
        ({"on": "x"}, "not said in this moment"),
        ({"on": "median", "on_nth": 2}, "said only 1 time"),
        ({"on": "median", "on_nth": 0}, "from 1"),
        ({"on": "median", "on_nth": True}, "from 1"),
        ({"on_nth": 2}, "no on"),
        ({"on": "  ,  "}, "a word or a few words"),
        ({"on": ["middle"]}, "a word or a few words"),
        ({"on": "median", "on_nth": 1, "nth": 1}, "not both"),
    ],
)
def test_a_cue_that_cannot_be_found_stops_the_load(item: dict[str, object], message: str) -> None:
    with pytest.raises(SystemExit, match=message):
        cues.take_cue(item, SAY, "here")


def test_a_marks_nth_stays_the_passages() -> None:
    mark = {"passage": True, "kind": "highlight", "target": "the", "nth": 3, "on": "look"}
    rest, cue = cues.take_cue(mark, SAY, "here", ("on_nth",))
    assert rest == {"passage": True, "kind": "highlight", "target": "the", "nth": 3}
    assert cue == {"on": "look"}


def test_a_moments_cues_come_off_and_go_back_on_item_for_item() -> None:
    moment = {
        "say": SAY,
        "write": "$7$",
        "on": "median",
        "point": [{"line": 0, "kind": "box"}, {"line": 0, "kind": "circle", "on": "middle"}],
        "doodles": [{"name": "lightbulb", "on": "look"}, {"name": "calendar"}],
        "doodle_do": [{"id": "bag", "op": "count", "n": 2, "on": "one", "nth": 2}],
    }
    bare, found = cues.split_cues(moment, "here")
    assert "on" not in bare
    assert bare["point"][1] == {"line": 0, "kind": "circle"}
    assert bare["doodles"][0] == {"name": "lightbulb"}
    assert bare["doodle_do"][0] == {"id": "bag", "op": "count", "n": 2}
    assert found.any()
    # What the other checks return, in the same order, gets its cues back.
    entry: dict[str, object] = {
        "say": SAY,
        "write": "$7$",
        "point": [{"line": 0, "kind": "box"}, {"line": 0, "kind": "circle"}],
        "doodles": [{"name": "lightbulb"}, {"name": "calendar"}],
        "doodle_do": [{"id": "bag", "op": "count", "n": 2}],
    }
    cues.attach_cues(entry, found)
    assert entry["on"] == "median"
    assert entry["point"] == [
        {"line": 0, "kind": "box"},
        {"line": 0, "kind": "circle", "on": "middle"},
    ]
    assert entry["doodles"] == [{"name": "lightbulb", "on": "look"}, {"name": "calendar"}]
    assert entry["doodle_do"] == [{"id": "bag", "op": "count", "n": 2, "on": "one", "on_nth": 2}]


def test_a_moments_on_needs_a_write_or_a_sketch() -> None:
    with pytest.raises(SystemExit, match="neither"):
        cues.split_cues({"say": SAY, "on": "median"}, "here")
    _, found = cues.split_cues({"say": SAY, "show_sketch": True, "on": "look"}, "here")
    assert found.moment == {"on": "look"}
    # A bad cue on a doodle is found too.
    with pytest.raises(SystemExit, match="doodle: on 'lamp'"):
        cues.split_cues({"say": SAY, "doodle": {"name": "lightbulb", "on": "lamp"}}, "here")


def test_the_api_passes_cues_on() -> None:
    assert cue_of({"on": " middle one ", "on_nth": 2}) == LessonCue(word="middle one", nth=2)
    assert cue_of({"on": "x", "on_nth": True}) == LessonCue(word="x", nth=1)
    assert cue_of({"on": ""}) is None
    assert cue_of({"kind": "box"}) is None
    marks = _cued_points(
        [
            {"line": 0, "kind": "box"},
            {"kind": "nonsense", "on": "x"},
            {"line": 0, "kind": "circle", "on": "middle"},
        ]
    )
    assert marks is not None
    assert [mark.on for mark in marks] == [None, LessonCue(word="middle")]
    ref = doodle_ref({"name": "lightbulb", "on": "look"})
    assert ref is not None and ref.on == LessonCue(word="look")
    moment = {
        "doodle": {"name": "lightbulb", "id": "bulb"},
        "doodle_do": [{"id": "bulb", "op": "pulse", "on": "it"}],
    }
    acts = doodle_actions([moment])
    assert acts[0] is not None and acts[0][0].on == LessonCue(word="it")
