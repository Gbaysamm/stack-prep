"""The UTME Physics loader's settings, and the Physics files read the way it reads them.

database/load_retranscribed_physics.py is retranscribed_loader.py with Physics's settings.
The year files are still being written, so every check of them takes whichever years exist.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "database"))

import retranscribed_loader as loader
from load_retranscribed_chemistry import CHEMISTRY
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((PHYSICS.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_physics_names_its_own_folder_codes_and_documents() -> None:
    assert PHYSICS.code == "PHY" and PHYSICS.name == "Physics"
    assert PHYSICS.paper_code(2014) == "UTME-2014-PHY"
    assert PHYSICS.syllabus_path.is_file() and PHYSICS.papers_path.is_file()
    assert PHYSICS.svg_dir == PHYSICS.dir / "figures" / "svg"
    assert not PHYSICS.jpg_figures
    # nothing Chemistry's rows are keyed on is shared with Physics
    assert PHYSICS.author != CHEMISTRY.author
    assert PHYSICS.syllabus_path != CHEMISTRY.syllabus_path


@pytest.mark.parametrize("subject", [PHYSICS, CHEMISTRY], ids=["physics", "chemistry"])
def test_the_page_counts_are_the_pdfs(subject: loader.Subject) -> None:
    for path, pages in (
        (subject.syllabus_path, subject.syllabus_page_count),
        (subject.papers_path, subject.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_physics_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(PHYSICS.syllabus_pages)
    assert all(1 <= page <= PHYSICS.syllabus_page_count for page in PHYSICS.syllabus_pages.values())


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards.
    pages = [PHYSICS.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == PHYSICS.syllabus_page_count


def test_the_physics_curriculum_is_forty_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(PHYSICS)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 40
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes)
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("PHY.")


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(PHYSICS)}
    for topic, subs in subtopics().items():
        lettered = not (len(subs) == 1 and subs[0].endswith(".a"))
        for code in subs:
            assert (items[code]["status"] == "explicit") == lettered, code
            assert bool(items[code]["rationale"]) != lettered, code
        assert items[topic]["status"] == "explicit"
    assert items["PHY.3.g"]["location"] == "PDF page 4, topic 3 (g)"
    assert items["PHY.40.b"]["location"] == "PDF page 20, topic 40 (b)"
    assert items["PHY.9.a"]["location"] == "PDF page 7, topic 9"


# ---------------------------------------------------------------------------------- figures


def raw_question(**changes: object) -> dict:
    raw: dict = {
        "number": 4,
        "stem": "Which symbol is an n-p-n transistor?",
        "options": {"A": "Symbol A", "B": "Symbol B", "C": "Symbol C", "D": "Symbol D"},
        "answer": "B",
        "subtopic": "PHY.39.a",
        "level": 2,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "B", "steps": ["s"], "hint": "h", "why": {"A": "", "C": "", "D": ""}}


def picture(label: str) -> str:
    return f'<svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="{label}"/>'


def test_physics_refuses_a_cropped_figure() -> None:
    codes = set(PHYSICS.syllabus_pages)
    assert loader.check_question(PHYSICS, raw_question(), NOTE, codes, 2010) == []
    cropped = raw_question(figure="figures/2010_q04.jpg", figure_alt="a circuit")
    assert any("drawn" in p for p in loader.check_question(PHYSICS, cropped, NOTE, codes, 2010))


def test_option_figures_must_draw_all_four_with_a_description() -> None:
    codes = set(PHYSICS.syllabus_pages)
    drawn = {letter: picture(f"symbol {letter}") for letter in "ABCD"}
    assert (
        loader.check_question(PHYSICS, raw_question(option_figures=drawn), NOTE, codes, 2010) == []
    )
    three = {k: v for k, v in drawn.items() if k != "D"}
    assert loader.check_question(PHYSICS, raw_question(option_figures=three), NOTE, codes, 2010)
    blank = {**drawn, "C": "<svg/>"}
    assert loader.check_question(PHYSICS, raw_question(option_figures=blank), NOTE, codes, 2010)


def test_an_option_picture_is_its_own_file_and_part_of_the_version() -> None:
    assert loader.svg_path(PHYSICS, 2012, 7).name == "2012_q07.svg"
    assert loader.svg_path(PHYSICS, 2012, 7, "B").name == "2012_q07_b.svg"
    path = loader.svg_path(PHYSICS, 2012, 7, "A")
    figure = loader.drawn_figure(picture("arrow in"), path, "Drawn")
    assert figure["alt"] == "arrow in" and figure["width"] == 160
    assert figure["uri"] == "docs/questions/utme/physics/figures/svg/2012_q07_a.svg"
    q: dict = {
        "stem": "Which?",
        "options": {"A": "Symbol A", "B": "Symbol B", "C": "Symbol C", "D": "Symbol D"},
        "answer": "A",
        "why": {"B": "b", "C": "c", "D": "d"},
        "level": 2,
        "figure": None,
        "option_figures": {},
    }
    plain = loader.version_hash(q)
    # No option pictures: the hash a question had before they existed, so nothing re-versions.
    assert plain == loader.version_hash({k: v for k, v in q.items() if k != "option_figures"})
    with_one = loader.version_hash({**q, "option_figures": {"A": figure}})
    assert with_one != plain
    redrawn = loader.drawn_figure(picture("arrow out"), path, "Drawn")
    assert loader.version_hash({**q, "option_figures": {"A": redrawn}}) != with_one
    assert loader.drawn_files({**q, "option_figures": {"A": figure}}) == [("A", figure)]


# ---------------------------------------------------------------------------- the real files


def test_every_complete_physics_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(PHYSICS)
    if not years:
        pytest.skip("no complete Physics year yet")
    questions, _dropped, notes, loaded = loader.read_papers(PHYSICS)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == PHYSICS.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None or q["figure"]["mime"] == "image/svg+xml"
        for figure in q["option_figures"].values():
            assert figure["alt"] and figure["width"]


def test_every_written_physics_lesson_reads() -> None:
    questions, _dropped, _notes, _years = loader.read_papers(PHYSICS)
    lessons = loader.read_lessons(PHYSICS)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
