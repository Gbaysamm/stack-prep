#!/usr/bin/env python3
"""Put the hand transcription of UTME Economics into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_economics.py                      # dry run
    uv run python database/load_retranscribed_economics.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_economics.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_economics.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry, Physics, Biology and Government loaders, after a backup, whenever --pending says
there is anything left to load; once the bank matches the files it is a no-op.

Economics loads exactly as Chemistry and Physics do (database/retranscribed_loader.py, where
every step is described): when ECO is missing this creates it, with its two documents recorded
and licensed, its 23 topics, their 110 subtopics (docs/questions/utme/economics/subtopics.yaml)
and one skill under each, all approved and switched on, then loads each year whose
retranscribed_YYYY.yaml and explanations_YYYY.yaml are both there and read correctly, and the
lessons written for them.

Where Economics differs (docs/questions/utme/economics/README.md): its papers are UTME-YYYY-ECO;
and, as in Physics, its graphs and charts are always drawn (`figure_svg`), never cropped from
the compilation, so a question with a JPG `figure` stops its year loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 9 pages; the
#: detailed syllabus runs from page 1, topic 1, to page 8, topic 23; page 9 lists the
#: recommended texts). Read off the PDF one page at a time with pdftotext.
SYLLABUS_PAGES: dict[str, int] = {
    **{f"ECO.1.{x}": 1 for x in "abc"},
    **{f"ECO.2.{x}": 1 for x in "abc"},
    **{f"ECO.3.{x}": 2 for x in "ab"},
    **{f"ECO.4.{x}": 2 for x in "abcd"},
    **{f"ECO.5.{x}": 3 for x in "abcde"},
    **{f"ECO.6.{x}": 3 for x in "abc"},
    **{f"ECO.7.{x}": 3 for x in "abc"},
    **{f"ECO.7.{x}": 4 for x in "de"},
    **{f"ECO.8.{x}": 4 for x in "abcdefg"},
    **{f"ECO.9.{x}": 4 for x in "abcde"},
    **{f"ECO.10.{x}": 5 for x in "abc"},
    **{f"ECO.11.{x}": 5 for x in "abcdefg"},
    **{f"ECO.12.{x}": 5 for x in "abcdef"},
    **{f"ECO.13.{x}": 6 for x in "abcdefg"},
    **{f"ECO.14.{x}": 6 for x in "abcdefgh"},
    **{f"ECO.15.{x}": 6 for x in "abcde"},
    **{f"ECO.16.{x}": 6 for x in "abc"},
    **{f"ECO.16.{x}": 7 for x in "de"},
    **{f"ECO.17.{x}": 7 for x in "abcde"},
    **{f"ECO.18.{x}": 7 for x in "abcdef"},
    **{f"ECO.19.{x}": 7 for x in "abcdef"},
    **{f"ECO.20.{x}": 8 for x in "abcde"},
    **{f"ECO.21.{x}": 8 for x in "abcd"},
    "ECO.22.a": 8,
    **{f"ECO.23.{x}": 8 for x in "abcde"},
}

ECONOMICS = Subject(
    folder="economics",
    code="ECO",
    name="Economics",
    author="Hand re-transcription (UTME Economics)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=9,
    syllabus_title="UTME Syllabus — Economics",
    papers_pdf="past-questions.pdf",
    papers_page_count=84,
    papers_title="UTME Economics past questions 2010-2018 (toppers.com.ng compilation, with keys)",
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/economics/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(ECONOMICS, __doc__))
