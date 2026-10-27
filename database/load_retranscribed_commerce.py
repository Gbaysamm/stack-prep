#!/usr/bin/env python3
"""Put the hand transcription of UTME Commerce into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_commerce.py                      # dry run
    uv run python database/load_retranscribed_commerce.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_commerce.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_commerce.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry, Physics, Biology, Government, Economics and Literature loaders, after a backup,
whenever --pending says there is anything left to load; once the bank matches the files it is
a no-op.

Commerce loads exactly as Chemistry and Physics do (database/retranscribed_loader.py, where
every step is described): when COM is missing this creates it, with its two documents recorded
and licensed, its 16 topics, their 71 subtopics (docs/questions/utme/commerce/subtopics.yaml)
and one skill under each, all approved and switched on, then loads each year whose
retranscribed_YYYY.yaml and explanations_YYYY.yaml are both there and read correctly, and the
lessons written for them.

Where Commerce differs (docs/questions/utme/commerce/README.md): its papers are UTME-YYYY-COM;
and, as in Physics, its diagrams are always drawn (`figure_svg`), never cropped from the
compilation, so a question with a JPG `figure` stops its year loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 8 pages; the
#: detailed syllabus runs from page 1, topic 1, to page 7, topic 16; page 8 lists the
#: recommended texts). Read off the PDF one page at a time with pdftotext.
SYLLABUS_PAGES: dict[str, int] = {
    **{f"COM.1.{x}": 1 for x in "abcd"},
    **{f"COM.2.{x}": 1 for x in "abc"},
    **{f"COM.3.{x}": 1 for x in "abcd"},
    **{f"COM.4.{x}": 2 for x in "abcde"},
    **{f"COM.5.{x}": 2 for x in "abc"},
    "COM.5.d": 3,
    **{f"COM.6.{x}": 3 for x in "abcde"},
    **{f"COM.6.{x}": 4 for x in "fg"},
    **{f"COM.7.{x}": 4 for x in "abcdef"},
    **{f"COM.8.{x}": 4 for x in "abc"},
    **{f"COM.8.{x}": 5 for x in "de"},
    **{f"COM.9.{x}": 5 for x in "abc"},
    **{f"COM.10.{x}": 5 for x in "abc"},
    **{f"COM.11.{x}": 5 for x in "abcd"},
    **{f"COM.12.{x}": 5 for x in "abc"},
    **{f"COM.12.{x}": 6 for x in "de"},
    **{f"COM.13.{x}": 6 for x in "abcdef"},
    **{f"COM.14.{x}": 6 for x in "abcdef"},
    **{f"COM.15.{x}": 6 for x in "abc"},
    **{f"COM.16.{x}": 7 for x in "abc"},
}

COMMERCE = Subject(
    folder="commerce",
    code="COM",
    name="Commerce",
    author="Hand re-transcription (UTME Commerce)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=8,
    syllabus_title="UTME Syllabus — Commerce",
    papers_pdf="past-questions.pdf",
    papers_page_count=77,
    papers_title="UTME Commerce past questions 2010-2018 (toppers.com.ng compilation, with keys)",
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/commerce/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(COMMERCE, __doc__))
