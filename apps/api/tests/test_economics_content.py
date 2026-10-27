"""The UTME Economics loader's settings, and the Economics files read the way it reads them.

database/load_retranscribed_economics.py is retranscribed_loader.py with Economics's
settings. The year files are still being written, so every check of them takes whichever years
exist, and a year with no files yet is simply not there.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "database"))

import retranscribed_loader as loader
from load_retranscribed_biology import BIOLOGY
from load_retranscribed_chemistry import CHEMISTRY
from load_retranscribed_economics import ECONOMICS
from load_retranscribed_government import GOVERNMENT
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((ECONOMICS.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_economics_names_its_own_folder_codes_and_documents() -> None:
    assert ECONOMICS.code == "ECO" and ECONOMICS.name == "Economics"
    assert ECONOMICS.paper_code(2014) == "UTME-2014-ECO"
    assert ECONOMICS.syllabus_path.is_file() and ECONOMICS.papers_path.is_file()
    assert ECONOMICS.svg_dir == ECONOMICS.dir / "figures" / "svg"
    assert not ECONOMICS.jpg_figures
    # nothing another subject's rows are keyed on is shared with Economics
    for other in (CHEMISTRY, PHYSICS, BIOLOGY, GOVERNMENT):
        assert ECONOMICS.author != other.author
        assert ECONOMICS.syllabus_path != other.syllabus_path
        assert ECONOMICS.papers_path != other.papers_path


def test_the_page_counts_are_the_pdfs() -> None:
    for path, pages in (
        (ECONOMICS.syllabus_path, ECONOMICS.syllabus_page_count),
        (ECONOMICS.papers_path, ECONOMICS.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_economics_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(ECONOMICS.syllabus_pages)
    assert all(
        1 <= page <= ECONOMICS.syllabus_page_count for page in ECONOMICS.syllabus_pages.values()
    )


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards. Its last page
    # (9) is the list of recommended texts, so topic 23 ends on page 8.
    pages = [ECONOMICS.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == ECONOMICS.syllabus_page_count - 1


def test_the_economics_curriculum_is_twenty_three_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(ECONOMICS)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 23
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes) == 110
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("ECO.")


def test_the_topics_keep_the_syllabus_order_and_are_cited_by_number() -> None:
    # Numbers in the file's order; ECO.10 comes after ECO.9, never after ECO.1 the way a plain
    # string sort would put it.
    topics = [item for item in loader.read_curriculum(ECONOMICS) if item["type"] == "topic"]
    assert [t["order"] for t in topics] == list(range(1, 24))
    assert [t["code"] for t in topics] == list(subtopics())
    assert topics[0]["code"] == "ECO.1" and topics[-1]["code"] == "ECO.23"
    assert loader.topic_label("ECO.10") == ("topic 10", "10")
    items = {item["code"]: item for item in loader.read_curriculum(ECONOMICS)}
    assert items["ECO.7.d"]["location"] == "PDF page 4, topic 7 (d)"
    assert items["ECO.4"]["excerpt"] == "4. The Theory of Demand"
    assert items["ECO.22.a"]["rationale"].startswith("Topic 22 prints its contents")


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(ECONOMICS)}
    for topic, subs in subtopics().items():
        lettered = not (len(subs) == 1 and subs[0].endswith(".a"))
        for code in subs:
            assert (items[code]["status"] == "explicit") == lettered, code
            assert bool(items[code]["rationale"]) != lettered, code
        assert items[topic]["status"] == "explicit"


# ---------------------------------------------------------------------------- the questions


def raw_question(**changes: object) -> dict:
    raw: dict = {
        "number": 7,
        "stem": "The most popular sizes of dresses and shoes are determined by the",
        "options": {"A": "range", "B": "mean", "C": "mode", "D": "median"},
        "answer": "C",
        "subtopic": "ECO.3.b",
        "level": 1,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "C", "steps": ["s"], "hint": "h", "why": {"A": "", "B": "", "D": ""}}


def test_a_question_must_use_a_economics_subtopic() -> None:
    codes = set(ECONOMICS.syllabus_pages)
    assert loader.check_question(ECONOMICS, raw_question(), NOTE, codes, 2010) == []
    assert loader.check_question(ECONOMICS, raw_question(subtopic="ECO.24.a"), NOTE, codes, 2010)
    assert loader.check_question(ECONOMICS, raw_question(subtopic="GOV.I1.a"), NOTE, codes, 2010)


def picture(label: str) -> str:
    return f'<svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="{label}"/>'


def test_economics_refuses_a_cropped_figure_and_takes_a_drawn_one() -> None:
    codes = set(ECONOMICS.syllabus_pages)
    cropped = raw_question(figure="figures/2010_q07.jpg", figure_alt="a graph")
    problems = loader.check_question(ECONOMICS, cropped, NOTE, codes, 2010)
    assert any("drawn" in p for p in problems)
    drawn = raw_question(figure_svg=picture("a demand curve sloping down to the right"))
    assert loader.check_question(ECONOMICS, drawn, NOTE, codes, 2010) == []
    path = loader.svg_path(ECONOMICS, 2012, 5)
    figure = loader.drawn_figure(picture("a pie chart"), path, "Drawn")
    assert figure["uri"] == "docs/questions/utme/economics/figures/svg/2012_q05.svg"


# ---------------------------------------------------------------------------- the real files


def test_every_complete_economics_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(ECONOMICS)
    if not years:
        pytest.skip("no complete Economics year yet")
    questions, _dropped, notes, loaded = loader.read_papers(ECONOMICS)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == ECONOMICS.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None or q["figure"]["mime"] == "image/svg+xml"


def test_every_written_economics_lesson_reads() -> None:
    if not any(ECONOMICS.dir.glob("lessons_*.yaml")):
        pytest.skip("no Economics lessons written yet")
    questions, _dropped, _notes, _years = loader.read_papers(ECONOMICS)
    lessons = loader.read_lessons(ECONOMICS)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
