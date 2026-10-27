#!/usr/bin/env python3
"""Put the hand transcription of UTME Accounts into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_accounts.py                      # dry run
    uv run python database/load_retranscribed_accounts.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_accounts.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_accounts.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry, Physics, Biology, Government, Economics, Literature and Commerce loaders, after a backup,
whenever --pending says there is anything left to load; once the bank matches the files it is
a no-op.

Accounts loads exactly as Chemistry and Physics do (database/retranscribed_loader.py, where
every step is described): when ACC is missing this creates it, with its two documents recorded
and licensed, its 18 topics, their 84 subtopics (docs/questions/utme/accounts/subtopics.yaml)
and one skill under each, all approved and switched on, then loads each year whose
retranscribed_YYYY.yaml and explanations_YYYY.yaml are both there and read correctly, and the
lessons written for them.

Where Accounts differs (docs/questions/utme/accounts/README.md): its papers are UTME-YYYY-ACC;
and, as in Physics, any diagram is always drawn (`figure_svg`), never cropped from the
compilation, so a question with a JPG `figure` stops its year loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 6 pages; the
#: detailed syllabus runs from page 1, topic 1, to page 5, topic 18; page 6 lists the
#: recommended texts). Read off the PDF one page at a time with pdftotext.
SYLLABUS_PAGES: dict[str, int] = {
    **{f"ACC.1.{x}": 1 for x in "abcdef"},
    **{f"ACC.2.{x}": 1 for x in "abcdefg"},
    **{f"ACC.3.{x}": 2 for x in "abcd"},
    **{f"ACC.4.{x}": 2 for x in "abc"},
    **{f"ACC.5.{x}": 2 for x in "abcde"},
    **{f"ACC.6.{x}": 2 for x in "abc"},
    **{f"ACC.7.{x}": 3 for x in "abc"},
    **{f"ACC.8.{x}": 3 for x in "abc"},
    **{f"ACC.9.{x}": 3 for x in "abcde"},
    **{f"ACC.10.{x}": 3 for x in "abcd"},
    **{f"ACC.11.{x}": 3 for x in "abcd"},
    **{f"ACC.12.{x}": 4 for x in "abcd"},
    **{f"ACC.13.{x}": 4 for x in "abcde"},
    **{f"ACC.14.{x}": 4 for x in "abcd"},
    **{f"ACC.15.{x}": 4 for x in "abcdef"},
    **{f"ACC.16.{x}": 4 for x in "abcd"},
    "ACC.16.e": 5,
    **{f"ACC.17.{x}": 5 for x in "abcdefgh"},
    **{f"ACC.18.{x}": 5 for x in "abcde"},
}

ACCOUNTS = Subject(
    folder="accounts",
    code="ACC",
    name="Principles of Accounts",
    author="Hand re-transcription (UTME Principles of Accounts)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=6,
    syllabus_title="UTME Syllabus — Principles of Accounts",
    papers_pdf="past-questions.pdf",
    papers_page_count=96,
    papers_title=(
        "UTME Principles of Accounts past questions 2010-2018 "
        "(toppers.com.ng compilation, with keys)"
    ),
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/accounts/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(ACCOUNTS, __doc__))
