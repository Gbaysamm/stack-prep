"""The UTME Accounts loader's settings, and the Accounts files read the way it reads them.

database/load_retranscribed_accounts.py is retranscribed_loader.py with Accounts's
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
from load_retranscribed_accounts import ACCOUNTS
from load_retranscribed_biology import BIOLOGY
from load_retranscribed_chemistry import CHEMISTRY
from load_retranscribed_commerce import COMMERCE
from load_retranscribed_economics import ECONOMICS
from load_retranscribed_government import GOVERNMENT
from load_retranscribed_literature import LITERATURE
from load_retranscribed_physics import PHYSICS


def subtopics() -> dict[str, list[str]]:
    doc = yaml.safe_load((ACCOUNTS.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code: list(topic["subtopics"]) for code, topic in doc["topics"].items()}


# ------------------------------------------------------------------------------- settings


def test_accounts_names_its_own_folder_codes_and_documents() -> None:
    assert ACCOUNTS.code == "ACC" and ACCOUNTS.name == "Principles of Accounts"
    assert ACCOUNTS.paper_code(2014) == "UTME-2014-ACC"
    assert ACCOUNTS.syllabus_path.is_file() and ACCOUNTS.papers_path.is_file()
    assert ACCOUNTS.svg_dir == ACCOUNTS.dir / "figures" / "svg"
    assert not ACCOUNTS.jpg_figures
    # nothing another subject's rows are keyed on is shared with Principles of Accounts
    for other in (CHEMISTRY, PHYSICS, BIOLOGY, GOVERNMENT, ECONOMICS, LITERATURE, COMMERCE):
        assert ACCOUNTS.author != other.author
        assert ACCOUNTS.syllabus_path != other.syllabus_path
        assert ACCOUNTS.papers_path != other.papers_path


def test_the_page_counts_are_the_pdfs() -> None:
    for path, pages in (
        (ACCOUNTS.syllabus_path, ACCOUNTS.syllabus_page_count),
        (ACCOUNTS.papers_path, ACCOUNTS.papers_page_count),
    ):
        # Each page object of a PDF is "/Type /Page" (not /Pages, the tree's own nodes).
        data = path.read_bytes()
        found = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        found += data.count(b"/Type/Page") - data.count(b"/Type/Pages")
        if found <= 0:
            pytest.skip(f"{path.name} keeps its pages in compressed object streams")
        assert found == pages, path.name


# ------------------------------------------------------------------------------- curriculum


def test_every_accounts_subtopic_has_its_syllabus_page() -> None:
    codes = [code for subs in subtopics().values() for code in subs]
    assert set(codes) == set(ACCOUNTS.syllabus_pages)
    assert all(
        1 <= page <= ACCOUNTS.syllabus_page_count for page in ACCOUNTS.syllabus_pages.values()
    )


def test_the_pages_run_in_syllabus_order() -> None:
    # The syllabus prints its topics in order, so the pages never go backwards. Its last page
    # (6) is the list of recommended texts, so topic 18 ends on page 5.
    pages = [ACCOUNTS.syllabus_pages[code] for subs in subtopics().values() for code in subs]
    assert pages == sorted(pages)
    assert pages[0] == 1 and pages[-1] == ACCOUNTS.syllabus_page_count - 1


def test_the_accounts_curriculum_is_eighteen_topics_with_one_skill_per_subtopic() -> None:
    items = loader.read_curriculum(ACCOUNTS)
    kinds = [item["type"] for item in items]
    codes = [code for subs in subtopics().values() for code in subs]
    assert kinds.count("topic") == 18
    assert kinds.count("subtopic") == kinds.count("skill") == len(codes) == 84
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
        assert item["code"].startswith("ACC.")


def test_the_topics_keep_the_syllabus_order_and_are_cited_by_number() -> None:
    # Numbers in the file's order; COM.10 comes after COM.9, never after COM.1 the way a plain
    # string sort would put it.
    topics = [item for item in loader.read_curriculum(ACCOUNTS) if item["type"] == "topic"]
    assert [t["order"] for t in topics] == list(range(1, 19))
    assert [t["code"] for t in topics] == list(subtopics())
    assert topics[0]["code"] == "ACC.1" and topics[-1]["code"] == "ACC.18"
    assert loader.topic_label("ACC.10") == ("topic 10", "10")
    items = {item["code"]: item for item in loader.read_curriculum(ACCOUNTS)}
    assert items["ACC.13.e"]["location"] == "PDF page 4, topic 13 (e)"
    assert items["ACC.4"]["excerpt"] == "4. Cash Book"


def test_an_unlettered_topic_is_ours_and_a_lettered_one_is_the_syllabus() -> None:
    items = {item["code"]: item for item in loader.read_curriculum(ACCOUNTS)}
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
        "stem": "The book of original entry for credit sales is the",
        "options": {"A": "cash book", "B": "journal proper", "C": "sales day book", "D": "ledger"},
        "answer": "C",
        "subtopic": "ACC.2.b",
        "level": 1,
    }
    raw.update(changes)
    return raw


NOTE = {"answer": "C", "steps": ["s"], "hint": "h", "why": {"A": "", "B": "", "D": ""}}


def test_a_question_must_use_a_accounts_subtopic() -> None:
    codes = set(ACCOUNTS.syllabus_pages)
    assert loader.check_question(ACCOUNTS, raw_question(), NOTE, codes, 2010) == []
    assert loader.check_question(ACCOUNTS, raw_question(subtopic="ACC.19.a"), NOTE, codes, 2010)
    assert loader.check_question(ACCOUNTS, raw_question(subtopic="GOV.I1.a"), NOTE, codes, 2010)


def picture(label: str) -> str:
    return f'<svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="{label}"/>'


def test_accounts_refuses_a_cropped_figure_and_takes_a_drawn_one() -> None:
    codes = set(ACCOUNTS.syllabus_pages)
    cropped = raw_question(figure="figures/2010_q07.jpg", figure_alt="a chart")
    problems = loader.check_question(ACCOUNTS, cropped, NOTE, codes, 2010)
    assert any("drawn" in p for p in problems)
    drawn = raw_question(figure_svg=picture("a T account"))
    assert loader.check_question(ACCOUNTS, drawn, NOTE, codes, 2010) == []
    path = loader.svg_path(ACCOUNTS, 2012, 5)
    figure = loader.drawn_figure(picture("a ledger extract"), path, "Drawn")
    assert figure["uri"] == "docs/questions/utme/accounts/figures/svg/2012_q05.svg"


# ---------------------------------------------------------------------------- the real files


def test_every_complete_accounts_year_reads_without_a_problem() -> None:
    years, _ = loader.years_ready(ACCOUNTS)
    if not years:
        pytest.skip("no complete Principles of Accounts year yet")
    questions, _dropped, notes, loaded = loader.read_papers(ACCOUNTS)
    # A year still being written may have problems; the ones that load must be sound.
    assert set(loaded) <= set(years), notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["paper_code"] == ACCOUNTS.paper_code(q["year"])
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        assert q["figure"] is None or q["figure"]["mime"] == "image/svg+xml"


def test_every_written_accounts_lesson_reads() -> None:
    if not any(ACCOUNTS.dir.glob("lessons_*.yaml")):
        pytest.skip("no Principles of Accounts lessons written yet")
    questions, _dropped, _notes, _years = loader.read_papers(ACCOUNTS)
    lessons = loader.read_lessons(ACCOUNTS)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        if key[0] not in {q["year"] for q in questions}:
            continue  # its year has not loaded yet
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
