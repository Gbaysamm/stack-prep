#!/usr/bin/env python3
"""Put the hand transcription of UTME Literature in English into the bank, approved, with lessons.

    uv run python database/load_retranscribed_literature.py                      # dry run
    uv run python database/load_retranscribed_literature.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_literature.py --pending            # exit 10 if work

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics, English,
Chemistry, Physics, Biology, Government and Economics loaders, after a backup, whenever
--pending says there is anything left to load; once the bank matches the files it is a no-op.

Literature loads exactly as Chemistry and Physics do (database/retranscribed_loader.py, where
every step is described): when LIT is missing this creates it, with its two documents recorded
and licensed, its 5 topics, their 11 subtopics (docs/questions/utme/literature/subtopics.yaml)
and one skill under each, all approved and switched on, then loads each year whose
retranscribed_YYYY.yaml and explanations_YYYY.yaml are both there and read correctly, and the
lessons written for them.

Where Literature differs (docs/questions/utme/literature/README.md): its papers are UTME-YYYY-LIT;
it has no figures, so a question with a JPG `figure` stops its year loading; and its set texts
changed over the years, so a question is tagged by what it tests (a genre's types, techniques or
interpretation, a literary term, or an unseen extract), not by its text.

Everything is approved in the name given with --reviewer or --reviewer-name, recorded on every
row it writes. All of it is one transaction: a failure changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each subtopic's content starts on (source/syllabus.pdf, 6 pages; the
#: detailed syllabus runs from page 1, topic 1, to page 4, topic 5; page 5 lists the set texts
#: of the current syllabus and page 6 the recommended anthologies and critical texts). Read off
#: the PDF one page at a time with pdftotext.
SYLLABUS_PAGES: dict[str, int] = {
    "LIT.1.a": 1,
    "LIT.1.b": 1,
    "LIT.1.c": 2,
    "LIT.2.a": 2,
    "LIT.2.b": 2,
    "LIT.2.c": 3,
    "LIT.3.a": 3,
    "LIT.3.b": 3,
    "LIT.3.c": 3,
    "LIT.4.a": 4,
    "LIT.5.a": 4,
}

LITERATURE = Subject(
    folder="literature",
    code="LIT",
    name="Literature in English",
    author="Hand re-transcription (UTME Literature in English)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=6,
    syllabus_title="UTME Syllabus — Literature in English",
    papers_pdf="past-questions.pdf",
    papers_page_count=93,
    papers_title=(
        "UTME Literature in English past questions 2010-2018 "
        "(toppers.com.ng compilation, with keys)"
    ),
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/literature/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
    jpg_figures=False,
)


if __name__ == "__main__":
    sys.exit(main(LITERATURE, __doc__))
