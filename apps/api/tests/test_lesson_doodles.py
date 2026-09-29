"""A lesson's doodles: the loader's rules (database/lesson_doodles.py) and the board's reading."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

_DATABASE = Path(__file__).resolve().parents[3] / "database"


def _load() -> ModuleType:
    # lesson_doodles imports lesson_marks by its bare name, as the loaders do.
    sys.path.insert(0, str(_DATABASE))
    try:
        source = _DATABASE / "lesson_doodles.py"
        spec = importlib.util.spec_from_file_location("lesson_doodles", source)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        # Registered first, as an import would be: its dataclasses look themselves up there.
        sys.modules["lesson_doodles"] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(_DATABASE))


doodles = _load()

ART = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" '
    'aria-label="A roof of corrugated sheets" data-react="wiggle">'
    '<path d="M10 60Q20 50 30 60T50 60" fill="none" stroke="#1d1b3a" stroke-width="3"/>'
    '<g data-anim="bob blink" data-origin="60 40">'
    '<circle cx="60" cy="40" r="4" fill="#1d1b3a"/></g>'
    '<text x="60" y="100" font-family="Caveat">folds</text></svg>'
)


def clean(value: object, index: int = 2, writes: list[bool] | None = None) -> dict[str, object]:
    return doodles.clean_doodle(
        value,
        index,
        writes if writes is not None else [True, False, True],
        {"lightbulb", "calendar-rare"},
        {"custom:2011_q42_roof"},
        2011,
        42,
        "here",
    )


def test_a_doodle_names_the_lessons_own_picture_or_the_librarys() -> None:
    assert clean({"name": "custom:2011_q42_roof", "caption": "ridged, in folds", "near": 0}) == {
        "name": "custom:2011_q42_roof",
        "caption": "ridged, in folds",
        "near": 0,
    }
    assert clean({"name": "lightbulb"}) == {"name": "lightbulb"}
    with pytest.raises(SystemExit, match="no doodle 'rocket' in the library"):
        clean({"name": "rocket"})
    with pytest.raises(SystemExit, match=r"no doodles/2011_q42_house\.svg"):
        clean({"name": "custom:2011_q42_house"})
    with pytest.raises(SystemExit, match="not this question's"):
        clean({"name": "custom:2012_q42_roof"})
    with pytest.raises(SystemExit, match="custom:YYYY_qNN_x"):
        clean({"name": "custom:roof"})
    with pytest.raises(SystemExit, match="only name, caption, near, id, size, repeat, layout"):
        clean({"name": "lightbulb", "colour": 3})
    with pytest.raises(SystemExit, match="size is one of"):
        clean({"name": "lightbulb", "size": 3})


def test_a_caption_is_a_few_words() -> None:
    assert clean({"name": "lightbulb", "caption": "x" * 40})["caption"] == "x" * 40
    with pytest.raises(SystemExit, match="at most 40 characters"):
        clean({"name": "lightbulb", "caption": "x" * 41})
    with pytest.raises(SystemExit, match="a few words or nothing"):
        clean({"name": "lightbulb", "caption": "  "})


def test_a_doodle_sits_by_a_line_already_written() -> None:
    with pytest.raises(SystemExit, match="this moment's line or an earlier one"):
        clean({"name": "lightbulb", "near": 3})
    with pytest.raises(SystemExit, match="writes no line"):
        clean({"name": "lightbulb", "near": 1})
    with pytest.raises(SystemExit, match="moment's number"):
        clean({"name": "lightbulb", "near": True})
    # No near: this moment's line, or the latest before it; there has to be one.
    assert clean({"name": "lightbulb"}, 1, [True, False]) == {"name": "lightbulb"}
    with pytest.raises(SystemExit, match="none is written yet"):
        clean({"name": "lightbulb"}, 0, [False])


def test_a_doodle_file_is_checked_like_a_sketch_and_drawn_only_with_its_shapes() -> None:
    checked = doodles.check_doodle(ART, "roof.svg")
    assert checked["alt_text"] == "A roof of corrugated sheets"
    with pytest.raises(SystemExit, match="not <pattern>"):
        doodles.check_doodle(ART.replace("<text", "<pattern/><text"), "roof.svg")
    with pytest.raises(SystemExit, match="script"):
        doodles.check_doodle(ART.replace("<text", "<script>x</script><text"), "roof.svg")
    with pytest.raises(SystemExit, match="event handler"):
        doodles.check_doodle(ART.replace("<path ", '<path onclick="x()" '), "roof.svg")
    with pytest.raises(SystemExit, match="data-anim 'jump'"):
        doodles.check_doodle(ART.replace('"bob blink"', '"jump"'), "roof.svg")
    with pytest.raises(SystemExit, match="aria-label"):
        bare = ART.replace('aria-label="A roof of corrugated sheets"', "")
        doodles.check_doodle(bare, "roof.svg")


def test_every_library_doodle_is_in_the_art_format() -> None:
    names = doodles.library_names()
    for name in sorted(names):
        art = (doodles.LIBRARY_DIR / f"{name}.svg").read_text(encoding="utf-8")
        doodles.check_doodle(art, name)


def test_a_custom_doodle_is_found_by_its_question_and_must_be_used(tmp_path: Path) -> None:
    (tmp_path / "2011_q42_roof.svg").write_text(ART, encoding="utf-8")
    (tmp_path / "2011_q43_other.svg").write_text(ART, encoding="utf-8")
    found = doodles.read_custom_doodles(tmp_path, 2011, 42)
    assert [d["name"] for d in found] == ["custom:2011_q42_roof"]
    assert found[0]["alt_text"] == "A roof of corrugated sheets"
    with pytest.raises(SystemExit, match="no moment brings it in"):
        doodles.check_all_used(found, [{"say": "x"}], "here")
    doodles.check_all_used(found, [{"say": "x", "doodle": {"name": "custom:2011_q42_roof"}}], "h")
    with pytest.raises(SystemExit, match="no written lesson"):
        doodles.check_doodle_files(tmp_path, {(2011, 42)})
    (tmp_path / "roof.svg").write_text(ART, encoding="utf-8")
    with pytest.raises(SystemExit, match=r"named YYYY_qNN_x\.svg"):
        doodles.check_doodle_files(tmp_path, {(2011, 42), (2011, 43)})


def test_the_board_reads_a_moments_doodle_leniently() -> None:
    from app.lesson_doodles import doodle_ref

    ref = doodle_ref({"name": "custom:2011_q42_roof", "caption": "folds", "near": 1})
    assert ref is not None
    assert (ref.name, ref.caption, ref.near) == ("custom:2011_q42_roof", "folds", 1)
    assert doodle_ref({"name": "lightbulb", "near": True}).near is None  # type: ignore[union-attr]
    assert doodle_ref({"name": "<script>"}) is None
    assert doodle_ref("lightbulb") is None
    assert doodle_ref(None) is None


# ---- Doodles v2 (docs/plans/doodles-v2-contract.md) ---------------------------------------

JAR = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-label="A savings jar">'
    '<g data-fill="money" data-level="0.2"><path d="M30 30H90V110H30Z" fill="#22c55e"/></g>'
    '<g data-part="label"><rect x="40" y="60" width="40" height="20" fill="none"'
    ' stroke="#1d1b3a"/></g>'
    '<g data-part="car"><circle cx="10" cy="10" r="4" fill="#1d1b3a"/></g>'
    '<path data-path="route" d="M10 10L100 10" stroke="none" fill="none"/></svg>'
)
JAR2 = JAR.replace("</svg>", '<g data-part="coin"><circle cx="60" cy="20" r="5"/></g></svg>')
SCENE = JAR.replace('viewBox="0 0 120 120"', 'viewBox="0 0 320 200"')
Stored = dict[str, Any]


def book(own: list[dict[str, str]] | None = None) -> Any:
    return doodles.DoodleBook(
        {"person-small", "ball-red", "ball-blue", "lightbulb"},
        own
        if own is not None
        else [
            {"name": "custom:2001_q15_a", "svg": JAR},
            {"name": "custom:2001_q15_a2", "svg": JAR2},
            {"name": "custom:2001_q15_s", "svg": SCENE},
        ],
        2001,
        15,
    )


def moment(b: Any, value: dict[str, object], index: int = 0) -> tuple[Stored, Stored]:
    stored, links = b.moment(value, index, [True] * (index + 1), "here")
    return stored, links


def test_a_doodle_takes_an_id_a_size_and_a_repeat() -> None:
    b = book()
    jar = {"name": "custom:2001_q15_a", "id": "jar", "size": "small", "caption": "jar"}
    assert moment(b, {"doodle": jar})[0] == {"doodle": jar}
    crowd = {"name": "person-small", "id": "class", "repeat": 42, "layout": "grid"}
    assert moment(b, {"doodles": [crowd]}, 1)[0]["doodles"][0]["repeat"] == 42
    mixed = {"repeat": [{"name": "ball-red", "n": 3}, {"name": "ball-blue", "n": 5}], "id": "bag"}
    assert moment(b, {"doodle": mixed}, 2)[0]["doodle"]["name"] == "ball-red"
    with pytest.raises(SystemExit, match="two doodles in this lesson have the id 'jar'"):
        moment(b, {"doodle": {"name": "lightbulb", "id": "jar"}}, 3)
    with pytest.raises(SystemExit, match="at most 50 figures"):
        moment(book(), {"doodle": {"name": "person-small", "repeat": 51}})
    too_many = [{"name": "ball-red", "n": 30}, {"name": "ball-blue", "n": 21}]
    with pytest.raises(SystemExit, match="at most 50 figures"):
        moment(book(), {"doodle": {"repeat": too_many}})
    with pytest.raises(SystemExit, match="layout is for a repeat"):
        moment(book(), {"doodle": {"name": "lightbulb", "layout": "row"}})
    with pytest.raises(SystemExit, match="layout is one of"):
        moment(book(), {"doodle": {"name": "person-small", "repeat": 3, "layout": "ring"}})
    with pytest.raises(SystemExit, match="id is"):
        moment(book(), {"doodle": {"name": "lightbulb", "id": "Jar"}})
    with pytest.raises(SystemExit, match="doodle or doodles, not both"):
        moment(book(), {"doodle": {"name": "lightbulb"}, "doodles": [{"name": "lightbulb"}]})
    with pytest.raises(SystemExit, match="one or two doodles"):
        moment(book(), {"doodles": [{"name": "lightbulb"}] * 3})


def test_a_scene_is_drawn_320_by_200_in_about_8_kb() -> None:
    scene = moment(book(), {"doodle": {"name": "custom:2001_q15_s", "size": "scene"}})[0]
    assert scene["doodle"]["size"] == "scene"
    with pytest.raises(SystemExit, match='viewBox="0 0 320 200"'):
        moment(book(), {"doodle": {"name": "custom:2001_q15_a", "size": "scene"}})
    padded = SCENE.replace("</svg>", " " * 9000 + "<g/></svg>")
    big = book([{"name": "custom:2001_q15_s", "svg": padded}])
    with pytest.raises(SystemExit, match="about 8 KB"):
        moment(big, {"doodle": {"name": "custom:2001_q15_s", "size": "scene"}})


def acting(actions: list[dict[str, object]], b: Any = None) -> list[Stored]:
    b = b or book()
    both = [
        {"name": "custom:2001_q15_a", "id": "jar"},
        {"name": "person-small", "id": "class", "repeat": 42},
    ]
    moment(b, {"doodles": both})
    done: list[Stored] = moment(b, {"doodle_do": actions}, 1)[0]["doodle_do"]
    return done


def test_each_action_is_known_and_has_what_it_needs() -> None:
    fill = {"id": "jar", "op": "fill", "to": 0.8}
    assert acting([fill]) == [fill]
    ring = {"id": "jar", "op": "circle", "part": "label", "text": "₦1,240"}
    assert acting([ring]) == [ring]
    assert acting([{"id": "jar", "op": "move", "part": "car", "path": "route"}])[0]["path"]
    venn = [
        {"id": "class", "op": "group", "n": 18, "text": "18 both"},
        {"id": "class", "op": "split", "n": 32, "text": "Maths only | Physics only"},
    ]
    assert acting(venn) == venn
    across = {"id": "jar", "op": "arrow", "part": "label", "to_id": "class"}
    assert acting([across]) == [across]
    with pytest.raises(SystemExit, match="op is one of"):
        acting([{"id": "jar", "op": "wobble"}])
    with pytest.raises(SystemExit, match="label needs text"):
        acting([{"id": "jar", "op": "label"}])
    with pytest.raises(SystemExit, match="move needs part, path"):
        acting([{"id": "jar", "op": "move"}])
    with pytest.raises(SystemExit, match="takes no"):
        acting([{"id": "jar", "op": "pulse", "to": 1}])
    with pytest.raises(SystemExit, match="at most 3"):
        acting([{"id": "jar", "op": "pulse"}] * 4)
    with pytest.raises(SystemExit, match="at most 40 characters"):
        acting([{"id": "jar", "op": "label", "text": "x" * 41}])
    with pytest.raises(SystemExit, match=r"'left \| right'"):
        acting([{"id": "class", "op": "split", "n": 3, "text": "only one side"}])
    with pytest.raises(SystemExit, match="is for a repeat group"):
        acting([{"id": "jar", "op": "count"}])
    with pytest.raises(SystemExit, match="is for one picture"):
        acting([{"id": "class", "op": "fill", "to": 1}])
    with pytest.raises(SystemExit, match="has only 42"):
        acting([{"id": "class", "op": "count", "n": 43}])
    with pytest.raises(SystemExit, match="has only 41"):
        acting([{"id": "class", "op": "split", "n": 42, "text": "a | b"}])
    with pytest.raises(SystemExit, match="fraction"):
        acting([{"id": "jar", "op": "fill", "to": 1.2}])
    with pytest.raises(SystemExit, match=r"grow is by 1\.1 to 2\.0"):
        acting([{"id": "jar", "op": "grow", "by": 3}])
    with pytest.raises(SystemExit, match="arrow needs to_part or to_id"):
        acting([{"id": "jar", "op": "arrow", "part": "label"}])


def test_an_action_names_a_doodle_already_up_and_what_its_art_has() -> None:
    with pytest.raises(SystemExit, match="'pot' is not a doodle brought in"):
        acting([{"id": "pot", "op": "pulse"}])
    with pytest.raises(SystemExit, match="no part 'lid'"):
        acting([{"id": "jar", "op": "circle", "part": "lid"}])
    with pytest.raises(SystemExit, match="no route 'road'"):
        acting([{"id": "jar", "op": "move", "part": "car", "path": "road"}])
    with pytest.raises(SystemExit, match="no level 'water'"):
        acting([{"id": "jar", "op": "fill", "to": 0.5, "fill": "water"}])
    with pytest.raises(SystemExit, match="'late' is not a doodle"):
        book().act([{"id": "late", "op": "pulse"}], "here")


def test_a_stage_is_this_lessons_own_next_drawing_and_brings_its_parts() -> None:
    with pytest.raises(SystemExit, match="no part 'coin'"):
        acting([{"id": "jar", "op": "circle", "part": "coin"}])
    staged = acting(
        [
            {"id": "jar", "op": "stage", "stage": "custom:2001_q15_a2"},
            {"id": "jar", "op": "circle", "part": "coin"},
        ]
    )
    assert staged[0]["stage"] == "custom:2001_q15_a2"
    with pytest.raises(SystemExit, match=r"no doodles/2001_q15_a3\.svg"):
        acting([{"id": "jar", "op": "stage", "stage": "custom:2001_q15_a3"}])
    with pytest.raises(SystemExit, match="not this question's"):
        acting([{"id": "jar", "op": "stage", "stage": "custom:2002_q15_a2"}])


def test_a_board_line_links_to_a_doodle_and_its_part() -> None:
    sys.path.insert(0, str(_DATABASE))
    try:
        import lesson_marks
    finally:
        sys.path.remove(str(_DATABASE))
    b = book()
    moment(b, {"doodle": {"name": "custom:2001_q15_a", "id": "jar"}})
    # A part a stage of this same moment draws may be pointed at.
    staged = {"doodle_do": [{"id": "jar", "op": "stage", "stage": "custom:2001_q15_a2"}]}
    links = moment(b, staged, 1)[1]
    mark: dict[str, Any] = {
        "line": 1,
        "kind": "highlight",
        "at": "₦1,240",
        "to": {"doodle": "jar", "part": "coin"},
    }
    kept = lesson_marks.clean_points([mark], 1, "here", doodles=links)
    assert kept[0]["to"] == {"doodle": "jar", "part": "coin"}
    with pytest.raises(SystemExit, match="'pot' is not a doodle"):
        lesson_marks.clean_points([{**mark, "to": {"doodle": "pot"}}], 1, "h", doodles=links)
    lid = {**mark, "to": {"doodle": "jar", "part": "lid"}}
    with pytest.raises(SystemExit, match="no part 'lid'"):
        lesson_marks.clean_points([lid], 1, "here", doodles=links)
    carried = {**mark, "kind": "move", "from": {"line": 0}}
    with pytest.raises(SystemExit, match="not a move"):
        lesson_marks.clean_points([carried], 1, "here", doodles=links)


def test_the_art_names_its_parts_routes_and_levels_properly() -> None:
    info = doodles.art_info(JAR, "jar.svg")
    assert (info.parts, info.paths, info.fills) == ({"label", "car"}, {"route"}, {"money"})
    with pytest.raises(SystemExit, match="two parts are called 'car'"):
        doodles.check_doodle(JAR.replace('data-part="label"', 'data-part="car"'), "jar.svg")
    with pytest.raises(SystemExit, match="is not drawn"):
        doodles.check_doodle(JAR.replace('stroke="none" fill="none"', 'stroke="#000"'), "jar.svg")
    with pytest.raises(SystemExit, match="data-part 'Label'"):
        doodles.check_doodle(JAR.replace('data-part="label"', 'data-part="Label"'), "jar.svg")
    with pytest.raises(SystemExit, match="data-level is a fraction"):
        doodles.check_doodle(JAR.replace('data-level="0.2"', 'data-level="2"'), "jar.svg")
    empty = JAR.replace('<path d="M30 30H90V110H30Z" fill="#22c55e"/>', "<text>x</text>")
    with pytest.raises(SystemExit, match="no closed shape"):
        doodles.check_doodle(empty, "jar.svg")


def test_a_stage_file_counts_as_used() -> None:
    found = [
        {"name": "custom:2001_q15_a", "svg": JAR},
        {"name": "custom:2001_q15_a2", "svg": JAR2},
        {"name": "custom:2001_q15_b", "svg": JAR},
    ]
    moments: list[dict[str, object]] = [
        {"say": "x", "doodles": [{"name": "custom:2001_q15_a", "id": "jar"}]},
        {"say": "y", "doodle_do": [{"id": "jar", "op": "stage", "stage": "custom:2001_q15_a2"}]},
    ]
    with pytest.raises(SystemExit, match="custom:2001_q15_b is drawn but no moment"):
        doodles.check_all_used(found, moments, "here")
    doodles.check_all_used(found[:2], moments, "here")


def test_the_library_has_the_small_figures_for_a_repeat() -> None:
    names = doodles.library_names()
    small = ["person-small", "student-small", "coin-small", "seed-small", "house-small"]
    small += ["book-small"] + [f"ball-{c}" for c in ("red", "blue", "green", "yellow")]
    small += ["ball-white", "ball-black"]
    for name in small:
        assert name in names
        art = (doodles.LIBRARY_DIR / f"{name}.svg").read_text(encoding="utf-8")
        assert 'viewBox="0 0 40 40"' in art


def test_the_board_reads_v2_doodles_and_actions_leniently() -> None:
    from app.lesson_doodles import doodle_actions, doodle_link, doodle_ref, doodle_refs

    crowd = doodle_ref({"name": "person-small", "id": "class", "repeat": 80, "layout": "row"})
    assert crowd is not None
    assert (crowd.id, crowd.repeat, crowd.layout) == ("class", 50, "row")
    mixed = doodle_ref({"repeat": [{"name": "ball-red", "n": 3}, {"name": "<x>", "n": 2}]})
    assert mixed is not None and mixed.name == "ball-red"
    assert [kind.n for kind in mixed.repeat or []] == [3]  # type: ignore[union-attr]
    assert doodle_ref({"name": "lightbulb", "size": "huge", "layout": "row"}).size is None  # type: ignore[union-attr]
    assert doodle_refs([{"name": "a"}, {"name": "b"}, {"name": "c"}]) is not None
    assert len(doodle_refs([{"name": "a"}, {"name": "b"}, {"name": "c"}]) or []) == 2
    moments: list[object] = [
        {"say": "a", "doodle_do": [{"id": "jar", "op": "pulse"}]},
        {"say": "b", "doodles": [{"name": "custom:2001_q15_a", "id": "jar"}]},
        {
            "say": "c",
            "doodle_do": [
                {"id": "jar", "op": "fill", "to": 3},
                {"id": "jar", "op": "wobble"},
                {"id": "jar", "op": "label"},
                {"id": "jar", "op": "grow", "by": 9},
                {"id": "jar", "op": "pulse"},
            ],
        },
    ]
    acts = doodle_actions(moments)
    # Before the jar is up, nothing; an unknown op, or one without what it needs, is dropped.
    assert acts[0] is None and acts[1] is None
    assert [(op.op, op.to, op.by) for op in acts[2] or []] == [
        ("fill", 1.0, None),
        ("grow", None, 2.0),
        ("pulse", None, None),
    ]
    assert doodle_link({"doodle": "jar", "part": "label"}) == ("jar", "label")
    assert doodle_link({"doodle": "Jar"}) is None
