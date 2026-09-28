"""The Use of English content files, checked the way the deploy's loader will check them.

database/load_retranscribed_english.py refuses the whole load when one file is malformed, and
a deploy only reports that as a warning. These run its reading and checking without a
database, so a broken year file fails here, before it reaches a release.
"""

# ruff: noqa: RUF001  (curly quotes and dashes are what these tests are about)

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "database"))

import load_retranscribed_english as english


def garble(text: str) -> str:
    """What the import did: UTF-8 bytes read as cp1252 (undefined bytes kept as Latin-1)."""
    return "".join(
        bytes([b]).decode("cp1252", errors="ignore") or chr(b) for b in text.encode("utf-8")
    )


@pytest.mark.parametrize(
    "clean",
    [
        "The expression, … stress is an issue",
        "Ali’s essay was “full” of it",
        "café – déjà vu",
        "Lemoti……… as a painter",
    ],
)
def test_mojibake_is_read_back_as_the_utf8_it_was(clean: str) -> None:
    damaged = garble(clean)
    assert damaged != clean
    assert english.fix_mojibake(damaged) == clean


def test_mojibake_repair_leaves_good_text_alone() -> None:
    for text in ["plain", "café", "’ and “quotes”", "Ã alone"]:
        assert english.fix_mojibake(text) == text
    mixed = "real ’ and " + garble("Ali’s")
    assert english.fix_mojibake(mixed) == "real ’ and Ali’s"


def test_passage_body_keeps_paragraphs() -> None:
    assert english.passage_body("One  two\nthree\n\nfour ") == "One two\n\nthree\n\nfour"


def test_every_complete_year_loads() -> None:
    years, _ = english.years_ready()
    if not years:
        pytest.skip("no complete English year yet")
    questions, _, _ = english.read_papers(years)
    lessons = english.read_lessons(years, questions)
    assert questions
    for q in questions:
        assert (q["year"], q["number"]) in lessons, f"{q['year']} Q{q['number']} has no lesson"
        assert q["answer"] in q["options"]
