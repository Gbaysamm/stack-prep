#!/usr/bin/env python3
"""Put the hand transcription of UTME Physics into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_physics.py                      # dry run
    uv run python database/load_retranscribed_physics.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_physics.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_physics.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English and
Chemistry loaders, after a backup, whenever --pending says there is anything left to load; once
the bank matches the files it is a no-op.

Physics loads exactly as Chemistry does (database/retranscribed_loader.py, where every step is
described): when PHY is missing this creates it, with its two documents recorded and licensed,
its 40 topics, their subtopics (docs/questions/utme/physics/subtopics.yaml) and one skill under
each, all approved and switched on, then loads each year whose retranscribed_YYYY.yaml and
explanations_YYYY.yaml are both there and read correctly, and the lessons written for them.

Where Physics differs (docs/questions/utme/physics/README.md): its papers are UTME-YYYY-PHY,
and its figures are always drawn (`figure_svg`), never cropped from the compilation, so a
question with a JPG `figure` stops its year loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 20 pages; the
#: detailed syllabus runs from page 1 to page 20, which also lists the recommended texts).
#: Read off the PDF one page at a time with pdftotext. Where subtopics.yaml groups several of
#: the syllabus's lettered contents into one subtopic, the page is where the first of them is
#: printed.
SYLLABUS_PAGES: dict[str, int] = {
    **{f"PHY.1.{x}": 1 for x in "abc"},
    **{f"PHY.1.{x}": 2 for x in "def"},
    "PHY.2.a": 2,
    **{f"PHY.3.{x}": 3 for x in "abcdef"},
    **{f"PHY.3.{x}": 4 for x in "ghi"},
    "PHY.4.a": 4,
    "PHY.5.a": 5,
    "PHY.5.b": 5,
    "PHY.6.a": 5,
    "PHY.7.a": 5,
    "PHY.7.b": 6,
    "PHY.7.c": 6,
    "PHY.8.a": 6,
    "PHY.9.a": 7,
    "PHY.10.a": 7,
    "PHY.10.b": 7,
    "PHY.11.a": 7,
    "PHY.12.a": 7,
    "PHY.13.a": 8,
    "PHY.14.a": 8,
    "PHY.15.a": 8,
    "PHY.15.b": 8,
    "PHY.16.a": 9,
    "PHY.17.a": 9,
    "PHY.18.a": 9,
    "PHY.18.b": 10,
    "PHY.19.a": 10,
    "PHY.20.a": 10,
    "PHY.20.b": 11,
    "PHY.20.c": 11,
    "PHY.21.a": 11,
    "PHY.22.a": 12,
    "PHY.23.a": 12,
    "PHY.23.b": 12,
    "PHY.24.a": 12,
    "PHY.25.a": 13,
    "PHY.25.b": 13,
    "PHY.26.a": 13,
    "PHY.27.a": 14,
    "PHY.27.b": 14,
    "PHY.28.a": 14,
    "PHY.29.a": 14,
    "PHY.30.a": 15,
    "PHY.31.a": 15,
    "PHY.32.a": 15,
    "PHY.33.a": 16,
    "PHY.34.a": 16,
    **{f"PHY.35.{x}": 17 for x in "abc"},
    "PHY.36.a": 17,
    "PHY.37.a": 18,
    "PHY.37.b": 18,
    "PHY.38.a": 18,
    "PHY.39.a": 19,
    "PHY.40.a": 19,
    "PHY.40.b": 20,
}

PHYSICS = Subject(
    folder="physics",
    code="PHY",
    name="Physics",
    author="Hand re-transcription (UTME Physics)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=20,
    syllabus_title="UTME Syllabus — Physics",
    papers_pdf="past-questions.pdf",
    papers_page_count=89,
    papers_title="UTME Physics past questions 2010-2018 (toppers.com.ng compilation, with keys)",
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/physics/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(PHYSICS, __doc__))
