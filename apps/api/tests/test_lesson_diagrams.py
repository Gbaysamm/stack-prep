"""The loader's rules for live diagrams (database/lesson_diagrams.py), and the API passing them on
(app/lesson_diagrams.py). The contract is docs/plans/doodles-v2-contract.md section 8."""

# ruff: noqa: RUF001  (the set signs and the minus are the ones a lesson writes)

from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any

import pytest

from app.lesson_diagrams import diagram_actions, diagram_link, diagram_of
from app.routers.practice import _cued_points

_DATABASE = Path(__file__).resolve().parents[3] / "database"
sys.path.insert(0, str(_DATABASE))

import lesson_cues  # noqa: E402
import lesson_diagrams as ld  # noqa: E402
import lesson_marks  # noqa: E402


def run(moments: list[dict[str, Any]]) -> list[dict[str, object]]:
    """Moments through the book as a loader puts them: cues off, diagram, actions, links."""
    book = ld.DiagramBook()
    stored: list[dict[str, object]] = []
    # Copied: taking the cues off edits a moment in place, as the loaders' moments are read once.
    for index, raw in enumerate(copy.deepcopy(moments)):
        moment, cues = lesson_cues.split_cues(raw, f"moment {index}")
        entry: dict[str, object] = {"say": moment["say"]}
        if moment.get("write"):
            entry["write"] = moment["write"]
        writes = [bool(m.get("write")) for m in stored] + [bool(moment.get("write"))]
        entry.update(book.moment(moment, index, writes, f"moment {index}"))
        if moment.get("point") is not None:
            entry["point"] = lesson_marks.clean_points(
                moment["point"], index, f"moment {index}", diagrams=book
            )
        lesson_cues.attach_cues(entry, cues)
        stored.append(entry)
    return stored


VENN = [
    {
        "say": "Forty-two students. Let me draw the class.",
        "write": "$n(U) = 42$",
        "diagram": {
            "id": "v",
            "kind": "venn",
            "on": "draw",
            "caption": "the 42 students",
            "universal": {"name": "Class", "total": 42},
            "sets": [
                {"key": "M", "name": "Maths", "total": 30},
                {"key": "P", "name": "Physics", "total": 24},
            ],
        },
    },
    {
        "say": "Eighteen take both, so 18 goes where the circles overlap.",
        "write": "$n(M \\cap P) = 18$",
        "diagram_do": [{"id": "v", "op": "fill", "part": "M∩P", "text": "18", "on": "overlap"}],
        "point": [
            {"line": 1, "kind": "highlight", "at": "18", "to": {"diagram": "v", "part": "M∩P"}}
        ],
    },
    {
        "say": "So 12 take Maths only, and everyone in either is 36.",
        "write": "$30 - 18 = 12$",
        "diagram_do": [
            {"id": "v", "op": "fill", "part": "M only", "text": "12"},
            {"id": "v", "op": "shade", "part": "M∪P", "colour": "blue", "text": "at least one: 36"},
        ],
    },
    {
        "say": "Six are outside both circles.",
        "write": "$42 - 36 = 6$",
        "diagram_do": [{"id": "v", "op": "fill", "part": "neither", "text": "6", "answer": True}],
        "point": [
            {"line": 3, "kind": "circle", "at": "6", "to": {"diagram": "v", "part": "outside"}}
        ],
    },
]


def refused(moments: list[dict[str, Any]], words: str) -> None:
    with pytest.raises(SystemExit) as caught:
        run(moments)
    assert words in str(caught.value), caught.value


# ------------------------------------------------------------------- the function of x


def test_fn_is_read_like_the_board_reads_it() -> None:
    f = ld.parse_fn("x^2 - 2x - 3")
    assert f(0) == -3 and f(3) == 0 and f(-1) == 0
    assert ld.parse_fn("2x(x+1)")(2) == 12
    assert ld.parse_fn("−x²")(3) == -9
    assert ld.parse_fn("sqrt(x) + 3")(16) == 7
    assert round(ld.parse_fn("sin(x)")(30), 6) == 0.5  # degrees, as the exam sets them
    assert ld.parse_fn("x^-1")(4) == 0.25
    assert ld.parse_fn("(x-1)(x+2)")(1) == 0


@pytest.mark.parametrize("text", ["import os", "x;1", "eval(x)", "x +", "(x", "2 $ x", "y^2"])
def test_fn_refuses_what_it_cannot_read(text: str) -> None:
    with pytest.raises(ValueError):
        ld.parse_fn(text)


def test_roots_are_counted_as_the_board_finds_them() -> None:
    assert ld.count_roots(ld.parse_fn("x^2 - 2x - 3"), -3, 5) == 2
    assert ld.count_roots(ld.parse_fn("x^2"), -3, 3) == 1
    assert ld.count_roots(ld.parse_fn("x^2 + 1"), -3, 3) == 0


def test_numbers_are_written_as_the_board_writes_them() -> None:
    assert ld.fmt(10) == "10"
    assert ld.fmt(2.5) == "2.5"
    assert ld.fmt(-3) == "−3"
    assert ld.fmt(1 / 3) == "0.33"


# ------------------------------------------------------------------- a Venn's regions


def test_set_expressions_name_regions() -> None:
    two = ["A", "B"]
    assert ld.regions_of("A∩B", two) == {3}
    assert ld.regions_of("A only", two) == {1}
    assert ld.regions_of("(A∪B)'", two) == {0}
    assert ld.regions_of("A−B", two) == {1}
    assert ld.regions_of("A-B", two) == {1}
    assert ld.regions_of("A&B", two) == {3}
    assert ld.regions_of("A|B", two) == {1, 2, 3}
    assert ld.regions_of("neither", two) == {0}
    assert ld.regions_of("both", two) == {3}
    assert ld.regions_of("B'", two) == {0, 1}
    three = ["A", "B", "C"]
    assert ld.regions_of("A∩B only", three) == {3}
    assert ld.regions_of("A∩B∩C", three) == {7}
    assert ld.regions_of("A∩B∩C'", three) == {3}
    assert ld.region_name(3, three) == "A∩B only"
    assert ld.region_name(7, three) == "A∩B∩C"
    assert ld.region_name(0, three) == "outside"
    with pytest.raises(ValueError):
        ld.regions_of("A∩Z", two)


# ------------------------------------------------------------------- a whole lesson


def test_a_venn_lesson_is_stored_with_its_cues_and_links() -> None:
    stored = run(VENN)
    diagram = stored[0]["diagram"]
    assert isinstance(diagram, dict)
    assert diagram["id"] == "v" and diagram["kind"] == "venn" and diagram["on"] == "draw"
    assert diagram["universal"] == {"name": "Class", "total": "42"}
    assert stored[1]["diagram_do"] == [
        {"id": "v", "op": "fill", "text": "18", "part": "M∩P", "on": "overlap"}
    ]
    assert stored[1]["point"] == [
        {"line": 1, "kind": "highlight", "at": "18", "to": {"diagram": "v", "part": "M∩P"}}
    ]
    assert stored[3]["diagram_do"][0]["answer"] is True  # type: ignore[index]


def test_ids_must_be_brought_in_first() -> None:
    moments = [
        {
            "say": "Hi.",
            "write": "1",
            "diagram_do": [{"id": "v", "op": "fill", "part": "A", "text": "1"}],
        }
    ]
    refused(moments, "not a diagram brought in")
    linked = [
        {
            "say": "Hi.",
            "write": "1",
            "point": [{"line": 0, "kind": "highlight", "to": {"diagram": "v", "part": "A"}}],
        }
    ]
    refused(linked, "to.diagram 'v' is not a diagram")


def test_a_diagram_needs_a_known_kind_and_its_own_fields() -> None:
    refused(
        [{"say": "x", "write": "1", "diagram": {"id": "v", "kind": "scatter"}}], "kind is one of"
    )
    refused(
        [{"say": "x", "write": "1", "diagram": {"id": "v", "kind": "pie", "sets": []}}],
        "a pie has no ['sets']",
    )
    refused(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": {"id": "V1", "kind": "numberline", "range": [0, 5]},
            }
        ],
        "id is a short handle",
    )


def test_parts_must_exist_and_be_drawn() -> None:
    moments = [
        dict(VENN[0]),
        {
            "say": "Hm.",
            "write": "2",
            "diagram_do": [{"id": "v", "op": "fill", "part": "M∩Q", "text": "1"}],
        },
    ]
    refused(moments, "is not a region of M/P")
    later = [
        {
            "say": "Draw.",
            "write": "1",
            "diagram": {
                "id": "v",
                "kind": "venn",
                "sets": [{"key": "A", "name": "A"}, {"key": "B", "name": "B", "later": True}],
            },
            "diagram_do": [{"id": "v", "op": "fill", "part": "A∩B", "text": "3"}],
        }
    ]
    refused(later, "which is not drawn yet")
    later[0]["diagram_do"] = [
        {"id": "v", "op": "draw-set", "part": "B"},
        {"id": "v", "op": "fill", "part": "A∩B", "text": "3"},
    ]
    run(later)


def test_a_count_goes_in_one_region_and_outside_needs_a_universal_set() -> None:
    base = {
        "id": "v",
        "kind": "venn",
        "sets": [{"key": "A", "name": "A"}, {"key": "B", "name": "B"}],
    }
    refused(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": base,
                "diagram_do": [{"id": "v", "op": "fill", "part": "A∪B", "text": "3"}],
            }
        ],
        "a count goes in one",
    )
    refused(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": base,
                "diagram_do": [{"id": "v", "op": "fill", "part": "outside", "text": "3"}],
            }
        ],
        "no universal set",
    )


def test_at_most_three_actions_a_moment() -> None:
    moments = [
        dict(VENN[0]),
        {"say": "x", "write": "2", "diagram_do": [{"id": "v", "op": "highlight", "part": "M"}] * 4},
    ]
    refused(moments, "at most 3")


def test_words_are_handwriting_not_latex() -> None:
    moments = [
        dict(VENN[0]),
        {
            "say": "x",
            "write": "2",
            "diagram_do": [{"id": "v", "op": "label", "part": "M", "text": "$x^2$"}],
        },
    ]
    refused(moments, "not $…$ maths")


def test_a_graph_lesson_numbers_its_points_as_the_board_does() -> None:
    moments = [
        {
            "say": "The axes.",
            "write": "$y = x^2 - 2x - 3$",
            "diagram": {
                "id": "g",
                "kind": "graph",
                "x": [-3, 5],
                "y": [-5, 6],
                "plots": [{"fn": "x^2 - 2x - 3", "label": "y = x² − 2x − 3", "later": True}],
            },
        },
        {
            "say": "The curve.",
            "write": "a",
            "diagram_do": [{"id": "g", "op": "plot", "part": "plot:1"}],
        },
        {
            "say": "Crossings.",
            "write": "b",
            "diagram_do": [{"id": "g", "op": "intercepts", "part": "plot:1"}],
            # Two on the x axis, one on the y axis: points 1 to 3.
            "point": [{"line": 2, "kind": "highlight", "to": {"diagram": "g", "part": "point:3"}}],
        },
        {
            "say": "Lowest.",
            "write": "c",
            "diagram_do": [
                {
                    "id": "g",
                    "op": "vertex",
                    "part": "plot:1",
                    "text": "lowest point",
                    "answer": True,
                }
            ],
            "point": [{"line": 3, "kind": "highlight", "to": {"diagram": "g", "part": "point:4"}}],
        },
    ]
    run(moments)
    moments[2]["point"][0]["to"]["part"] = "point:5"  # type: ignore[index]
    refused(moments, "has no part 'point:5'")


def test_a_later_plot_must_be_drawn_before_it_is_used() -> None:
    moments = [
        {
            "say": "Axes.",
            "write": "1",
            "diagram": {
                "id": "g",
                "kind": "graph",
                "x": [-3, 3],
                "y": [-3, 9],
                "plots": [{"fn": "x^2", "later": True}],
            },
            "diagram_do": [{"id": "g", "op": "vertex", "part": "plot:1"}],
        }
    ]
    refused(moments, "is `later`, and nothing has drawn it yet")


def test_a_graph_needs_its_ranges_and_a_curve_on_them() -> None:
    refused(
        [{"say": "x", "write": "1", "diagram": {"id": "g", "kind": "graph", "y": [0, 1]}}],
        "needs its x range",
    )
    refused(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": {
                    "id": "g",
                    "kind": "graph",
                    "x": [0, 1],
                    "y": [0, 1],
                    "plots": [{"fn": "x + 100"}],
                },
            }
        ],
        "hardly on the graph",
    )


def test_a_pie_makes_360_degrees_and_names_its_sectors() -> None:
    pie = {
        "id": "p",
        "kind": "pie",
        "sectors": [{"label": "A", "angle": 90}, {"label": "B", "angle": 200}],
    }
    refused([{"say": "x", "write": "1", "diagram": pie}], "make 290°, not 360°")
    pie = {
        "id": "p",
        "kind": "pie",
        "sectors": [{"label": "Walk", "value": 40}, {"label": "Bus", "value": 30, "text": "?"}],
    }
    run(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": pie,
                "diagram_do": [
                    {"id": "p", "op": "pull-out", "part": "sector:Bus"},
                    {"id": "p", "op": "angle", "part": "sector:2"},
                ],
            }
        ]
    )
    refused(
        [
            {
                "say": "x",
                "write": "1",
                "diagram": pie,
                "diagram_do": [{"id": "p", "op": "angle", "part": "sector:Car"}],
            }
        ],
        "there is no sector 'Car'",
    )


def test_a_tree_adds_up_to_one_at_every_point() -> None:
    tree = {
        "id": "t",
        "kind": "tree",
        "branches": [
            {
                "label": "Red",
                "p": "3/5",
                "then": [{"label": "Red", "p": "2/4"}, {"label": "Blue", "p": "1/4"}],
            },
            {"label": "Blue", "p": "2/5"},
        ],
    }
    refused([{"say": "x", "write": "1", "diagram": tree}], "add up to 3/4, not 1")
    tree["branches"][0]["then"][1]["p"] = "2/4"  # type: ignore[index]
    tree["branches"][0]["then"][0]["later"] = True  # type: ignore[index]
    moments = [
        {"say": "x", "write": "1", "diagram": tree},
        {"say": "y", "write": "2", "diagram_do": [{"id": "t", "op": "path", "part": "Red/Red"}]},
    ]
    refused(moments, "runs along a branch not drawn yet")
    moments[1]["diagram_do"] = [
        {"id": "t", "op": "branch", "part": "branch:Red/Red"},
        {"id": "t", "op": "path", "part": "Red/Red", "answer": True},
    ]
    stored = run(moments)
    assert stored[1]["diagram_do"][1]["part"] == "branch:Red/Red"  # type: ignore[index]


def test_charts_check_their_numbers() -> None:
    histogram = {
        "id": "h",
        "kind": "histogram",
        "bins": [{"from": 0, "to": 10, "value": 2}, {"from": 20, "to": 30, "value": 1}],
    }
    refused([{"say": "x", "write": "1", "diagram": histogram}], "classes touch")
    bar = {
        "id": "b",
        "kind": "bar",
        "y": [0, 16],
        "bars": [
            {"label": "Mon", "value": 12, "later": True},
            {"label": "Tue", "value": 8, "later": True},
        ],
    }
    moments = [
        {"say": "x", "write": "1", "diagram": bar},
        {
            "say": "y",
            "write": "2",
            "diagram_do": [
                {"id": "b", "op": "grow"},
                {"id": "b", "op": "line", "y": 10, "text": "mean = 10"},
                {"id": "b", "op": "highlight", "part": "bar:Mon", "answer": True},
            ],
        },
    ]
    run(moments)
    moments[1]["diagram_do"][1]["y"] = 20  # type: ignore[index]
    refused(moments, "off the chart")
    ogive = {"id": "o", "kind": "ogive", "points": [[10, 2], [20, 1]]}
    refused([{"say": "x", "write": "1", "diagram": ogive}], "never falls")


def test_a_number_line_keeps_to_its_range() -> None:
    line = {"id": "n", "kind": "numberline", "range": [-1, 9]}
    moments = [
        {
            "say": "x",
            "write": "1",
            "diagram": line,
            "diagram_do": [
                {"id": "n", "op": "hop", "from": 5, "to": 8},
                {"id": "n", "op": "interval", "from": 4, "from_open": True, "answer": True},
                {"id": "n", "op": "label", "x": 4, "text": "not 4 itself"},
            ],
        }
    ]
    run(moments)
    moments[0]["diagram_do"] = [{"id": "n", "op": "point", "x": 12}]
    refused(moments, "off the number line")
    moments[0]["diagram_do"] = [{"id": "n", "op": "interval", "to_open": True, "from": 2}]
    refused(moments, "to_open is for an interval with a to")


def test_a_table_totals_only_numbers() -> None:
    table = {
        "id": "f",
        "kind": "table",
        "columns": ["Score", "Frequency", "cf"],
        "rows": [[1, 3, None], [2, 5, None]],
    }
    moments = [
        {
            "say": "x",
            "write": "1",
            "diagram": table,
            "diagram_do": [
                {"id": "f", "op": "total", "part": "col:Frequency", "into": "col:cf"},
                {"id": "f", "op": "total", "part": "col:2", "answer": True},
            ],
            "point": [
                {"line": 0, "kind": "highlight", "to": {"diagram": "f", "part": "total:Frequency"}}
            ],
        }
    ]
    run(moments)
    table["rows"][1][1] = "?"  # type: ignore[index]
    refused(moments, "not a number")


def test_cues_come_off_the_diagram_and_its_actions_and_go_back_on() -> None:
    moment = {
        "say": "Let me draw it, then shade the overlap.",
        "write": "1",
        "diagram": {"id": "v", "kind": "venn", "on": "draw", "sets": []},
        "diagram_do": [{"id": "v", "op": "shade", "part": "A∩B", "on": "overlap"}],
    }
    bare, cues = lesson_cues.split_cues(moment, "m")
    assert "on" not in bare["diagram"] and "on" not in bare["diagram_do"][0]
    assert cues.diagram == {"on": "draw"} and cues.diagram_do == [{"on": "overlap"}]
    entry: dict[str, object] = {"diagram": {"id": "v"}, "diagram_do": [{"id": "v"}]}
    lesson_cues.attach_cues(entry, cues)
    assert entry["diagram"] == {"id": "v", "on": "draw"}
    with pytest.raises(SystemExit):
        lesson_cues.split_cues({**moment, "diagram": {"id": "v", "on": "circle"}}, "m")


# ------------------------------------------------------------------- the API


def test_the_api_passes_a_diagram_on_with_its_own_fields() -> None:
    stored = run(VENN)
    diagram = diagram_of(stored[0]["diagram"])
    assert diagram is not None
    out = diagram.model_dump(exclude_none=True)
    assert out["kind"] == "venn" and out["sets"][0]["key"] == "M"
    assert out["on"] == {"word": "draw", "nth": 1}
    assert "on_nth" not in out
    actions = diagram_actions(stored[1]["diagram_do"])
    assert actions is not None
    one = actions[0].model_dump(exclude_none=True)
    assert one == {
        "id": "v",
        "op": "fill",
        "part": "M∩P",
        "text": "18",
        "on": {"word": "overlap", "nth": 1},
    }
    assert diagram_of({"id": "v", "kind": "scatter"}) is None
    assert diagram_of("nonsense") is None
    assert diagram_actions([{"id": "v"}, "x"]) is None


def test_the_api_passes_a_link_to_a_diagram_part_on() -> None:
    assert diagram_link({"diagram": "v", "part": "M∩P"}) == ("v", "M∩P")
    assert diagram_link({"diagram": "v"}) == ("v", None)
    assert diagram_link({"doodle": "jar"}) is None
    points = _cued_points(
        [{"line": 1, "kind": "highlight", "at": "18", "to": {"diagram": "v", "part": "M∩P"}}]
    )
    assert points is not None
    assert points[0].to is not None
    assert points[0].to.diagram == "v" and points[0].to.part == "M∩P"
