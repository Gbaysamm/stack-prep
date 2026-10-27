"""The UTME Government loader's settings, and the Government files read the way it reads them.

database/load_retranscribed_government.py is retranscribed_loader.py with Government's
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
from load_retranscribed_government import GOVERNMENT
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((GOVERNMENT.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_government_names_its_own_folder_codes_and_documents() -> None:
    assert GOVERNMENT.code == "GOV" and GOVERNMENT.name == "Government"
    assert GOVERNMENT.paper_code(2014) == "UTME-2014-GOV"
    assert GOVERNMENT.syllabus_path.is_file() and GOVERNMENT.papers_path.is_file()
    assert not GOVERNMENT.jpg_figures
    # nothing another subject's rows are keyed on is shared with Government
    for other in (CHEMISTRY, PHYSICS, BIOLOGY):
        assert GOVERNMENT.author != other.author
        assert GOVERNMENT.syllabus_path != other.syllabus_path
        assert GOVERNMENT.papers_path != other.papers_path


def test_the_page_counts_are_the_pdfs() -> None:
    for path, pages in (
        (GOVERNMENT.syllabus_path, GOVERNMENT.syllabus_page_count),
        (GOVERNMENT.papers_path, GOVERNMENT.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_government_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(GOVERNMENT.syllabus_pages)
    assert all(
        1 <= page <= GOVERNMENT.syllabus_page_count for page in GOVERNMENT.syllabus_pages.values()
    )


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards. Its last page
    # (8) is the list of recommended texts, so part IV ends on page 7.
    pages = [GOVERNMENT.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == GOVERNMENT.syllabus_page_count - 1


def test_the_government_curriculum_is_thirty_three_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(GOVERNMENT)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 33
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes) == 94
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("GOV.")


def test_the_topics_keep_the_syllabus_order_of_parts_then_numbers() -> None:
    # Parts then numbers, as the file lists them; I16 comes before II1, never after I1 the way
    # a plain string sort of "I16" would misplace it.
    topics = [item for item in loader.read_curriculum(GOVERNMENT) if item["type"] == "topic"]
    assert [t["order"] for t in topics] == list(range(1, 34))
    assert [t["code"] for t in topics] == list(subtopics())
    assert topics[0]["code"] == "GOV.I1" and topics[-1]["code"] == "GOV.IV1"


def test_a_government_topic_is_named_by_its_part_and_number() -> None:
    assert loader.topic_label("GOV.II3") == ("part II, topic 3", "3")
    assert loader.topic_label("GOV.IV1") == ("part IV, topic 1", "1")
    # Biology's lettered sections still read as sections
    assert loader.topic_label("BIO.B2") == ("section B, topic 2", "2")
    assert loader.topic_label("BIO.C1") == ("section C, topic 1", "1")
    items = {item["code"]: item for item in loader.read_curriculum(GOVERNMENT)}
    assert items["GOV.II3"]["location"] == "PDF page 4, part II, topic 3"
    assert items["GOV.II3"]["excerpt"] == "3. Process of Decolonization"
    assert items["GOV.I4.b"]["location"] == "PDF page 2, part I, topic 4 (b)"
    assert items["GOV.I3.a"]["rationale"].startswith("Part I, topic 3 prints its contents")


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(GOVERNMENT)}
    for topic, subs in subtopics().items():
        lettered = not (len(subs) == 1 and subs[0].endswith(".a"))
        for code in subs:
            assert (items[code]["status"] == "explicit") == lettered, code
            assert bool(items[code]["rationale"]) != lettered, code
        assert items[topic]["status"] == "explicit"


# ---------------------------------------------------------------------------- the questions


def raw_question(**changes: object) -> dict:
    raw: dict = {
        "number": 8,
        "stem": "The legislative body of the United States of America is the",
        "options": {"A": "Parliament", "B": "National Assembly", "C": "Congress", "D": "Council"},
        "answer": "C",
        "subtopic": "GOV.I4.a",
        "level": 1,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "C", "steps": ["s"], "hint": "h", "why": {"A": "", "B": "", "D": ""}}


def test_a_question_must_use_a_government_subtopic() -> None:
    codes = set(GOVERNMENT.syllabus_pages)
    assert loader.check_question(GOVERNMENT, raw_question(), NOTE, codes, 2010) == []
    assert loader.check_question(GOVERNMENT, raw_question(subtopic="GOV.V1.a"), NOTE, codes, 2010)
    assert loader.check_question(GOVERNMENT, raw_question(subtopic="BIO.A1.a"), NOTE, codes, 2010)


def test_government_refuses_a_cropped_figure() -> None:
    codes = set(GOVERNMENT.syllabus_pages)
    cropped = raw_question(figure="figures/2010_q08.jpg", figure_alt="a map")
    problems = loader.check_question(GOVERNMENT, cropped, NOTE, codes, 2010)
    assert any("drawn" in p for p in problems)


# ---------------------------------------------------------------------------- the real files


def test_every_complete_government_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(GOVERNMENT)
    if not years:
        pytest.skip("no complete Government year yet")
    questions, _dropped, notes, loaded = loader.read_papers(GOVERNMENT)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == GOVERNMENT.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None and not q["option_figures"]


def test_every_written_government_lesson_reads() -> None:
    if not any(GOVERNMENT.dir.glob("lessons_*.yaml")):
        pytest.skip("no Government lessons written yet")
    questions, _dropped, _notes, _years = loader.read_papers(GOVERNMENT)
    lessons = loader.read_lessons(GOVERNMENT)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
