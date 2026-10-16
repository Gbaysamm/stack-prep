"""The UTME Chemistry loader's pure parts, and the content files read the way it reads them.

database/load_retranscribed_chemistry.py (through retranscribed_loader.py) skips a year with a
problem and a deploy only reports that as a warning; these run its reading without a database,
so a broken year fails here first.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "database"))

import retranscribed_loader as chem
from load_retranscribed_chemistry import CHEMISTRY


def subtopic_codes() -> list[str]:
    doc = yaml.safe_load((CHEMISTRY.dir / "subtopics.yaml").read_text(encoding="utf-8"))
    return [code for topic in doc["topics"].values() for code in topic["subtopics"]]


# ------------------------------------------------------------------------------- curriculum


def test_every_subtopic_has_its_syllabus_page() -> None:
    codes = subtopic_codes()
    assert set(codes) == set(CHEMISTRY.syllabus_pages)
    assert all(1 <= page <= 15 for page in CHEMISTRY.syllabus_pages.values())


def test_curriculum_is_topics_subtopics_and_one_skill_each_parents_first() -> None:
    items = chem.read_curriculum(CHEMISTRY)
    kinds = [item["type"] for item in items]
    codes = subtopic_codes()
    assert kinds.count("topic") == 18
    assert kinds.count("subtopic") == len(codes)
    assert kinds.count("skill") == len(codes)
    seen: dict[str, str] = {}
    for item in items:
        expected = {"topic": None, "subtopic": "topic", "skill": "subtopic"}[item["type"]]
        assert (seen.get(item["parent"]) if item["parent"] else None) == expected
        seen[item["code"]] = item["type"]
    skills = {item["code"]: item for item in items if item["type"] == "skill"}
    assert set(skills) == {f"{code}.i" for code in codes}


def test_what_is_ours_is_marked_implied_and_says_why() -> None:
    items = {item["code"]: item for item in chem.read_curriculum(CHEMISTRY)}
    # Topics 2, 5, 13, 17 and 18 print no lettered contents: their one subtopic is ours.
    for topic in (2, 5, 13, 17, 18):
        sub = items[f"CHEM.{topic}.a"]
        assert sub["status"] == "implied" and sub["rationale"]
    assert items["CHEM.1.a"]["status"] == "explicit"
    assert items["CHEM.1.a"]["location"] == "PDF page 1, topic 1 (a)"
    assert all(
        i["status"] == "implied" and i["rationale"] for i in items.values() if i["type"] == "skill"
    )
    assert all(i["status"] == "explicit" for i in items.values() if i["type"] == "topic")


# ---------------------------------------------------------------------------------- figures


def tiny_jpeg(width: int, height: int) -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof + b"\xff\xd9"


def test_jpeg_size_reads_the_frame_header() -> None:
    assert chem.jpeg_size(tiny_jpeg(320, 180)) == (320, 180)
    assert chem.jpeg_size(b"not a jpeg") == (None, None)


def test_every_figure_file_has_a_size() -> None:
    for path in sorted((CHEMISTRY.dir / "figures").glob("*.jpg")):
        width, height = chem.jpeg_size(path.read_bytes())
        assert width and height, path.name


def test_a_drawn_figure_gets_its_namespace() -> None:
    text = chem.svg_file_text('<svg width="10" height="5" role="img" aria-label="x"></svg>')
    assert text.startswith('<svg xmlns="http://www.w3.org/2000/svg" ')
    assert chem.svg_size(text) == (10, 5)


# -------------------------------------------------------------------------------- questions


def question(**changes: object) -> dict:
    q: dict = {
        "year": 2010,
        "number": 3,
        "paper_code": "UTME-2010-CHEM",
        "stem": "Percentage of nitrogen?",
        "options": {"A": "8.5%", "B": "13.1%", "C": "17.1%", "D": "27.6%"},
        "answer": "C",
        "why": {"A": "a", "B": "b", "D": "d"},
        "steps": ["one", "two", "three"],
        "hint": "Write the formula.",
        "level": 3,
        "subtopic": "CHEM.2.a",
        "figure": None,
    }
    q.update(changes)
    return q


def test_level_sets_the_time_as_in_mathematics() -> None:
    assert [chem.seconds_for(level) for level in range(1, 6)] == [30, 45, 60, 80, 100]


@pytest.mark.parametrize(
    "change",
    [
        {"answer": "B", "why": {"A": "a", "C": "c", "D": "d"}},
        {"level": 4},
        {"why": {"A": "a", "B": "other", "D": "d"}},
        {"figure": {"uri": "f.jpg", "sha256": "0" * 64, "alt": "a graph"}},
        {"stem": "Percentage of oxygen?"},
    ],
)
def test_anything_a_version_freezes_changes_its_hash(change: dict) -> None:
    assert chem.version_hash(question()) != chem.version_hash(question(**change))


def test_the_explanation_and_subtopic_do_not_change_the_hash() -> None:
    base = chem.version_hash(question())
    assert chem.version_hash(question(steps=["x", "y", "z"], hint="h", subtopic="CHEM.1.a")) == base
    assert chem.version_hash(question(), salt="v2") != base


def bank_row(q: dict, **changes: object) -> dict:
    row = {
        "question_id": "qid",
        "version_id": "vid",
        "version": 1,
        "top_version": 1,
        "retired_at": None,
        "review_status": "approved",
        "content_hash": chem.version_hash(q),
        "solution_steps": '["one", "two", "three"]',
        "hints": '["Write the formula."]',
        "solution_source": "expert_verified",
        "skill_id": "skill-2a",
    }
    row.update(changes)
    return row


SKILLS = {"CHEM.2.a.i": "skill-2a", "CHEM.1.a.i": "skill-1a"}


def test_plan_sorts_each_question_into_what_it_needs() -> None:
    q = question()
    key = (2010, "3")
    assert chem.plan_questions([q], [], {}, SKILLS)["create"] == [(q, None)]
    assert chem.plan_questions([q], [], {key: bank_row(q)}, SKILLS)["same"]
    plan = chem.plan_questions([question(level=5)], [], {key: bank_row(q)}, SKILLS)
    assert len(plan["revise"]) == 1
    plan = chem.plan_questions([question(hint="new")], [], {key: bank_row(q)}, SKILLS)
    assert len(plan["explain"]) == 1 and not plan["revise"]
    plan = chem.plan_questions([question(subtopic="CHEM.1.a")], [], {key: bank_row(q)}, SKILLS)
    assert len(plan["refile"]) == 1 and not plan["revise"]
    # A version that went back to earlier content carries a salted hash, and is still "same".
    salted = bank_row(q, version=3, content_hash=chem.version_hash(q, salt="v3"))
    assert chem.plan_questions([q], [], {key: salted}, SKILLS)["same"]


def test_a_dropped_question_in_the_bank_is_retired_once() -> None:
    q = question()
    gone = {"year": 2010, "number": 3, "reason": "figure missing"}
    plan = chem.plan_questions([], [gone], {(2010, "3"): bank_row(q)}, SKILLS)
    assert plan["retire"] == [(gone, bank_row(q))]
    retired = bank_row(q, retired_at="2026-01-01")
    assert not chem.plan_questions([], [gone], {(2010, "3"): retired}, SKILLS)["retire"]


def test_check_question_names_each_problem() -> None:
    codes = set(subtopic_codes())
    raw = {
        "number": 9,
        "stem": "Which?",
        "options": {"A": "a", "B": "b", "C": "c", "D": "d"},
        "answer": "A",
        "subtopic": "CHEM.1.a",
        "level": 2,
    }
    note = {"answer": "A", "steps": ["s"], "hint": "h", "why": {"B": "", "C": "", "D": ""}}
    assert chem.check_question(CHEMISTRY, raw, note, codes, 2010) == []
    assert chem.check_question(CHEMISTRY, {**raw, "subtopic": "CHEM.99.z"}, note, codes, 2010)
    assert chem.check_question(CHEMISTRY, {**raw, "level": 7}, note, codes, 2010)
    assert chem.check_question(CHEMISTRY, raw, {**note, "answer": "B"}, codes, 2010)
    assert chem.check_question(CHEMISTRY, raw, {**note, "why": {"B": ""}}, codes, 2010)
    assert chem.check_question(CHEMISTRY, raw, None, codes, 2010)


# ---------------------------------------------------------------------------- the real files


def test_every_complete_year_reads_without_a_problem() -> None:
    years, _ = chem.years_ready(CHEMISTRY)
    if not years:
        pytest.skip("no complete Chemistry year yet")
    questions, _dropped, notes, loaded = chem.read_papers(CHEMISTRY)
    assert loaded == years, notes
    assert len({(q["year"], q["number"]) for q in questions}) == len(questions)
    for q in questions:
        assert q["answer"] not in q["why"] and len(q["why"]) == 3
        if q["figure"]:
            assert q["figure"]["alt"] and q["figure"]["width"]


def test_every_written_lesson_reads() -> None:
    questions, _dropped, _notes, _years = chem.read_papers(CHEMISTRY)
    lessons = chem.read_lessons(CHEMISTRY)
    kept = {(q["year"], q["number"]) for q in questions}
    for key, lesson in lessons.items():
        assert key in kept, f"{key}: a lesson for a question that is not loaded"
        assert sum(1 for m in lesson["moments"] if m.get("answer")) == 1, key
