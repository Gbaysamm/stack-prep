"""The UTME Biology loader's settings, and the Biology files read the way it reads them.

database/load_retranscribed_biology.py is retranscribed_loader.py with Biology's settings.
The year files are still being written, so every check of them takes whichever years exist,
and a year with no files yet is simply not there.
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
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((BIOLOGY.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_biology_names_its_own_folder_codes_and_documents() -> None:
    assert BIOLOGY.code == "BIO" and BIOLOGY.name == "Biology"
    assert BIOLOGY.paper_code(2014) == "UTME-2014-BIO"
    assert BIOLOGY.syllabus_path.is_file() and BIOLOGY.papers_path.is_file()
    assert BIOLOGY.svg_dir == BIOLOGY.dir / "figures" / "svg"
    assert not BIOLOGY.jpg_figures
    # nothing Chemistry's or Physics's rows are keyed on is shared with Biology
    for other in (CHEMISTRY, PHYSICS):
        assert BIOLOGY.author != other.author
        assert BIOLOGY.syllabus_path != other.syllabus_path
        assert BIOLOGY.papers_path != other.papers_path


def test_the_page_counts_are_the_pdfs() -> None:
    for path, pages in (
        (BIOLOGY.syllabus_path, BIOLOGY.syllabus_page_count),
        (BIOLOGY.papers_path, BIOLOGY.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_biology_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(BIOLOGY.syllabus_pages)
    assert all(1 <= page <= BIOLOGY.syllabus_page_count for page in BIOLOGY.syllabus_pages.values())


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards. Its last page
    # (12) is the list of recommended texts, so section E ends on page 11.
    pages = [BIOLOGY.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == BIOLOGY.syllabus_page_count - 1


def test_the_biology_curriculum_is_twenty_four_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(BIOLOGY)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 24
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes) == 73
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("BIO.")


def test_the_topics_keep_the_syllabus_order_of_sections_then_numbers() -> None:
    # Section letters then numbers, as the file lists them; B9 comes before C1, never after
    # B1 the way a plain string sort of "B10" would misplace a tenth topic.
    topics = [item for item in loader.read_curriculum(BIOLOGY) if item["type"] == "topic"]
    assert [t["order"] for t in topics] == list(range(1, 25))
    assert [t["code"] for t in topics] == list(subtopics())
    assert topics[0]["code"] == "BIO.A1" and topics[-1]["code"] == "BIO.E2"


def test_a_sectioned_topic_is_named_by_its_section_and_number() -> None:
    assert loader.topic_label("BIO.B2") == ("section B, topic 2", "2")
    assert loader.topic_label("PHY.12") == ("topic 12", "12")
    assert loader.topic_label("CHEM.3") == ("topic 3", "3")
    items = {item["code"]: item for item in loader.read_curriculum(BIOLOGY)}
    assert items["BIO.A2"]["location"] == "PDF page 1, section A, topic 2"
    assert items["BIO.A2"]["excerpt"] == "2. Evolution Among the Kingdoms"
    assert items["BIO.A2.e"]["location"] == "PDF page 2, section A, topic 2 (e)"
    assert items["BIO.A2.e"]["excerpt"] == "(e) Animalia"
    assert items["BIO.D2.e.i"]["location"] == "PDF page 10, section D, topic 2 (e)"
    assert items["BIO.C1.a"]["location"] == "PDF page 6, section C, topic 1"
    assert items["BIO.C1.a"]["rationale"].startswith("Section C, topic 1 prints its contents")


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(BIOLOGY)}
    for topic, subs in subtopics().items():
        lettered = not (len(subs) == 1 and subs[0].endswith(".a"))
        for code in subs:
            assert (items[code]["status"] == "explicit") == lettered, code
            assert bool(items[code]["rationale"]) != lettered, code
        assert items[topic]["status"] == "explicit"


# ---------------------------------------------------------------------------------- figures


def raw_question(**changes: object) -> dict:
    raw: dict = {
        "number": 4,
        "stem": "Which part of the eye labelled in the diagram focuses light?",
        "options": {"A": "I", "B": "II", "C": "III", "D": "IV"},
        "answer": "B",
        "subtopic": "BIO.B9.b",
        "level": 2,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "B", "steps": ["s"], "hint": "h", "why": {"A": "", "C": "", "D": ""}}


def picture(label: str) -> str:
    return f'<svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="{label}"/>'


def test_biology_refuses_a_cropped_figure() -> None:
    codes = set(BIOLOGY.syllabus_pages)
    assert loader.check_question(BIOLOGY, raw_question(), NOTE, codes, 2010) == []
    cropped = raw_question(figure="figures/2010_q04.jpg", figure_alt="an eye")
    assert any("drawn" in p for p in loader.check_question(BIOLOGY, cropped, NOTE, codes, 2010))


def test_a_drawn_figure_and_option_figures_are_accepted() -> None:
    codes = set(BIOLOGY.syllabus_pages)
    drawn = raw_question(figure_svg=picture("an eye in section, parts labelled I to IV"))
    assert loader.check_question(BIOLOGY, drawn, NOTE, codes, 2010) == []
    options = {letter: picture(f"leaf {letter}") for letter in "ABCD"}
    assert (
        loader.check_question(BIOLOGY, raw_question(option_figures=options), NOTE, codes, 2010)
        == []
    )
    three = {k: v for k, v in options.items() if k != "D"}
    assert loader.check_question(BIOLOGY, raw_question(option_figures=three), NOTE, codes, 2010)


def test_a_question_must_use_a_biology_subtopic() -> None:
    codes = set(BIOLOGY.syllabus_pages)
    assert loader.check_question(BIOLOGY, raw_question(subtopic="BIO.F1.a"), NOTE, codes, 2010)
    assert loader.check_question(BIOLOGY, raw_question(subtopic="PHY.3.a"), NOTE, codes, 2010)


def test_biology_figures_are_written_under_its_own_folder() -> None:
    assert loader.svg_path(BIOLOGY, 2012, 7).name == "2012_q07.svg"
    assert loader.svg_path(BIOLOGY, 2012, 7, "B").name == "2012_q07_b.svg"
    figure = loader.drawn_figure(picture("a flower"), loader.svg_path(BIOLOGY, 2012, 7), "Drawn")
    assert figure["uri"] == "docs/questions/utme/biology/figures/svg/2012_q07.svg"


# ---------------------------------------------------------------------------- the real files


def test_every_complete_biology_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(BIOLOGY)
    if not years:
        pytest.skip("no complete Biology year yet")
    questions, _dropped, notes, loaded = loader.read_papers(BIOLOGY)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == BIOLOGY.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None or q["figure"]["mime"] == "image/svg+xml"
        for figure in q["option_figures"].values():
            assert figure["alt"] and figure["width"]


def test_every_written_biology_lesson_reads() -> None:
    if not any(BIOLOGY.dir.glob("lessons_*.yaml")):
        pytest.skip("no Biology lessons written yet")
    questions, _dropped, _notes, _years = loader.read_papers(BIOLOGY)
    lessons = loader.read_lessons(BIOLOGY)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
