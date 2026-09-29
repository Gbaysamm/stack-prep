"""A lesson's doodles: the loader's rules (database/lesson_doodles.py) and the board's reading."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

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
    with pytest.raises(SystemExit, match="only name, caption, near"):
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
