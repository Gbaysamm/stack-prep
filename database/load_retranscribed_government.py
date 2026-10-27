#!/usr/bin/env python3
"""Put the hand transcription of UTME Government into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_government.py                      # dry run
    uv run python database/load_retranscribed_government.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_government.py --pending            # exit 10 if work

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry, Physics and Biology loaders, after a backup, whenever --pending says there is
anything left to load; once the bank matches the files it is a no-op.

Government loads exactly as Chemistry, Physics and Biology do (database/retranscribed_loader.py,
where every step is described): when GOV is missing this creates it, with its two documents
recorded and licensed, its 33 topics, their 94 subtopics
(docs/questions/utme/government/subtopics.yaml) and one skill under each, all approved and
switched on, then loads each year whose retranscribed_YYYY.yaml and explanations_YYYY.yaml are
both there and read correctly, and the lessons written for them.

Where Government differs (docs/questions/utme/government/README.md): its papers are
UTME-YYYY-GOV; its topics are numbered within the syllabus's four Roman-numbered parts (GOV.II3
is part II, topic 3); and it has no figures, so a question with a `figure` stops its year
loading.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 8 pages; the
#: detailed syllabus runs from page 1, part I, to page 7, part IV; page 8 lists the
#: recommended texts). Read off the PDF one page at a time with pdftotext.
SYLLABUS_PAGES: dict[str, int] = {
    # I: Elements of Government
    "GOV.I1.a": 1,
    **{f"GOV.I2.{x}": 1 for x in "abc"},
    "GOV.I3.a": 1,
    "GOV.I4.a": 1,
    **{f"GOV.I4.{x}": 2 for x in "bcd"},
    **{f"GOV.I5.{x}": 2 for x in "abc"},
    **{f"GOV.I{n}.a": 2 for n in range(6, 11)},
    **{f"GOV.I11.{x}": 2 for x in "abcde"},
    "GOV.I12.a": 2,
    **{f"GOV.I12.{x}": 3 for x in "bcd"},
    **{f"GOV.I13.{x}": 3 for x in "ab"},
    **{f"GOV.I14.{x}": 3 for x in "ab"},
    **{f"GOV.I15.{x}": 3 for x in "ab"},
    **{f"GOV.I16.{x}": 3 for x in "ab"},
    # II: Political Development in Nigeria
    **{f"GOV.II1.{x}": 3 for x in "ab"},
    "GOV.II2.a": 3,
    **{f"GOV.II2.{x}": 4 for x in "bcde"},
    **{f"GOV.II3.{x}": 4 for x in "abcde"},
    **{f"GOV.II4.{x}": 4 for x in "abcde"},
    "GOV.II5.a": 4,
    **{f"GOV.II6.{x}": 4 for x in "abc"},
    "GOV.II7.a": 4,
    **{f"GOV.II8.{x}": 5 for x in "abcd"},
    **{f"GOV.II9.{x}": 5 for x in "abcd"},
    **{f"GOV.II10.{x}": 5 for x in "abcd"},
    **{f"GOV.II11.{x}": 5 for x in "abcd"},
    **{f"GOV.II12.{x}": 5 for x in "ab"},
    **{f"GOV.II12.{x}": 6 for x in "cd"},
    # III: Foreign Policy; IV: International Organizations
    "GOV.III1.a": 6,
    **{f"GOV.III2.{x}": 6 for x in "abc"},
    **{f"GOV.III3.{x}": 6 for x in "ab"},
    **{f"GOV.III4.{x}": 6 for x in "abcdef"},
    **{f"GOV.IV1.{x}": 6 for x in "abc"},
    **{f"GOV.IV1.{x}": 7 for x in "def"},
}

GOVERNMENT = Subject(
    folder="government",
    code="GOV",
    name="Government",
    author="Hand re-transcription (UTME Government)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=8,
    syllabus_title="UTME Syllabus — Government",
    papers_pdf="past-questions.pdf",
    papers_page_count=79,
    papers_title="UTME Government past questions 2010-2018 (toppers.com.ng compilation, with keys)",
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/government/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(GOVERNMENT, __doc__))
