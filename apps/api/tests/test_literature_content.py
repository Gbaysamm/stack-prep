"""The UTME Literature loader's settings, and the Literature files read the way it reads them.

database/load_retranscribed_literature.py is retranscribed_loader.py with Literature's
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
from load_retranscribed_literature import LITERATURE
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((LITERATURE.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_literature_names_its_own_folder_codes_and_documents() -> None:
    assert LITERATURE.code == "LIT" and LITERATURE.name == "Literature in English"
    assert LITERATURE.paper_code(2014) == "UTME-2014-LIT"
    assert LITERATURE.syllabus_path.is_file() and LITERATURE.papers_path.is_file()
    assert not LITERATURE.jpg_figures
    # nothing another subject's rows are keyed on is shared with Literature
    for other in (CHEMISTRY, PHYSICS, BIOLOGY, GOVERNMENT, ECONOMICS):
        assert LITERATURE.author != other.author
        assert LITERATURE.syllabus_path != other.syllabus_path
        assert LITERATURE.papers_path != other.papers_path


def test_the_page_counts_are_the_pdfs() -> None:
    for path, pages in (
        (LITERATURE.syllabus_path, LITERATURE.syllabus_page_count),
        (LITERATURE.papers_path, LITERATURE.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_literature_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(LITERATURE.syllabus_pages)
    assert all(
        1 <= page <= LITERATURE.syllabus_page_count for page in LITERATURE.syllabus_pages.values()
    )


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards. Page 5 lists
    # the current set texts and page 6 the recommended texts, so topic 5 ends on page 4.
    pages = [LITERATURE.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == LITERATURE.syllabus_page_count - 2


def test_the_literature_curriculum_is_five_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(LITERATURE)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 5
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes) == 11
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("LIT.")


def test_the_topics_keep_the_syllabus_order_and_are_cited_by_number() -> None:
    topics = [item for item in loader.read_curriculum(LITERATURE) if item["type"] == "topic"]
    assert [t["order"] for t in topics] == list(range(1, 6))
    assert [t["code"] for t in topics] == list(subtopics())
    items = {item["code"]: item for item in loader.read_curriculum(LITERATURE)}
    assert items["LIT.3.b"]["location"] == "PDF page 3, topic 3 (b)"
    assert items["LIT.1"]["excerpt"] == "1. Drama"
    assert items["LIT.5.a"]["location"] == "PDF page 4, topic 5"


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(LITERATURE)}
    for topic, subs in subtopics().items():
        lettered = not (len(subs) == 1 and subs[0].endswith(".a"))
        for code in subs:
            assert (items[code]["status"] == "explicit") == lettered, code
            assert bool(items[code]["rationale"]) != lettered, code
        assert items[topic]["status"] == "explicit"


# ---------------------------------------------------------------------------- the questions


def raw_question(**changes: object) -> dict:
    raw: dict = {
        "number": 37,
        "stem": "Pun as a literary device deals with",
        "options": {
            "A": "placing two opposite phrases",
            "B": "placing words side by side",
            "C": "playing on words",
            "D": "arrangement of words",
        },
        "answer": "C",
        "subtopic": "LIT.4.a",
        "level": 1,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "C", "steps": ["s"], "hint": "h", "why": {"A": "", "B": "", "D": ""}}


def test_a_question_must_use_a_literature_subtopic() -> None:
    codes = set(LITERATURE.syllabus_pages)
    assert loader.check_question(LITERATURE, raw_question(), NOTE, codes, 2010) == []
    assert loader.check_question(LITERATURE, raw_question(subtopic="LIT.6.a"), NOTE, codes, 2010)
    assert loader.check_question(LITERATURE, raw_question(subtopic="GOV.I1.a"), NOTE, codes, 2010)


def test_literature_refuses_a_cropped_figure() -> None:
    codes = set(LITERATURE.syllabus_pages)
    cropped = raw_question(figure="figures/2010_q37.jpg", figure_alt="a page")
    problems = loader.check_question(LITERATURE, cropped, NOTE, codes, 2010)
    assert any("drawn" in p for p in problems)


# ---------------------------------------------------------------------------- the real files


def test_every_complete_literature_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(LITERATURE)
    if not years:
        pytest.skip("no complete Literature year yet")
    questions, _dropped, notes, loaded = loader.read_papers(LITERATURE)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == LITERATURE.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None and not q["option_figures"]


def test_every_written_literature_lesson_reads() -> None:
    if not any(LITERATURE.dir.glob("lessons_*.yaml")):
        pytest.skip("no Literature lessons written yet")
    questions, _dropped, _notes, _years = loader.read_papers(LITERATURE)
    lessons = loader.read_lessons(LITERATURE)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
