#!/usr/bin/env python3
"""Put the hand transcription of UTME Biology into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_biology.py                      # dry run
    uv run python database/load_retranscribed_biology.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_biology.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_biology.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry and Physics loaders, after a backup, whenever --pending says there is anything left
to load; once the bank matches the files it is a no-op.

Biology loads exactly as Chemistry and Physics do (database/retranscribed_loader.py, where
every step is described): when BIO is missing this creates it, with its two documents recorded
and licensed, its 24 topics, their 73 subtopics (docs/questions/utme/biology/subtopics.yaml)
and one skill under each, all approved and switched on, then loads each year whose
retranscribed_YYYY.yaml and explanations_YYYY.yaml are both there and read correctly, and the
lessons written for them.

Where Biology differs (docs/questions/utme/biology/README.md): its papers are UTME-YYYY-BIO;
its topics are numbered within the syllabus's five lettered sections (BIO.A1 is section A,
topic 1); and, as in Physics, its figures are always drawn (`figure_svg`, and `option_figures`
when the options are pictures), never cropped from the compilation, so a question with a JPG
`figure` stops its year loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 12 pages; the
#: detailed syllabus runs from page 1, section A, to page 11, section E; page 12 lists the
#: recommended texts). Read off the PDF one page at a time with pdftotext. Where
#: subtopics.yaml groups several of the syllabus's lettered contents into one subtopic (BIO.E1.a
#: is Lamarck's and Darwin's theories), the page is where the first of them is printed.
SYLLABUS_PAGES: dict[str, int] = {
    # A: Variety of organisms
    **{f"BIO.A1.{x}": 1 for x in "abc"},
    **{f"BIO.A2.{x}": 1 for x in "abcd"},
    "BIO.A2.e": 2,
    **{f"BIO.A3.{x}": 2 for x in "abc"},
    # B: Form and functions
    **{f"BIO.B1.{x}": 3 for x in "ab"},
    **{f"BIO.B2.{x}": 3 for x in "abcd"},
    **{f"BIO.B3.{x}": 4 for x in "abcd"},
    **{f"BIO.B4.{x}": 4 for x in "abcd"},
    **{f"BIO.B5.{x}": 5 for x in "abc"},
    **{f"BIO.B6.{x}": 5 for x in "abc"},
    **{f"BIO.B7.{x}": 5 for x in "abc"},
    **{f"BIO.B8.{x}": 6 for x in "ab"},
    **{f"BIO.B9.{x}": 6 for x in "abcd"},
    # C: Ecology
    "BIO.C1.a": 6,
    **{f"BIO.C2.{x}": 7 for x in "ab"},
    **{f"BIO.C3.{x}": 7 for x in "ab"},
    **{f"BIO.C4.{x}": 7 for x in "abcde"},
    **{f"BIO.C5.{x}": 7 for x in "ab"},
    **{f"BIO.C5.{x}": 8 for x in "cd"},
    **{f"BIO.C6.{x}": 8 for x in "abc"},
    **{f"BIO.C7.{x}": 8 for x in "ab"},
    **{f"BIO.C7.{x}": 9 for x in "cde"},
    # D: Heredity and variations
    **{f"BIO.D1.{x}": 9 for x in "abc"},
    **{f"BIO.D2.{x}": 10 for x in "abcde"},
    "BIO.D3.a": 10,
    # E: Evolution
    "BIO.E1.a": 11,
    "BIO.E2.a": 11,
}

BIOLOGY = Subject(
    folder="biology",
    code="BIO",
    name="Biology",
    author="Hand re-transcription (UTME Biology)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=12,
    syllabus_title="UTME Syllabus — Biology",
    papers_pdf="past-questions.pdf",
    papers_page_count=82,
    papers_title="UTME Biology past questions 2010-2018 (toppers.com.ng compilation, with keys)",
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/biology/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(BIOLOGY, __doc__))
