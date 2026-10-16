#!/usr/bin/env python3
"""Put the hand transcription of UTME Chemistry into the bank, approved, with its lessons.

    uv run python database/load_retranscribed_chemistry.py                      # dry run
    uv run python database/load_retranscribed_chemistry.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_chemistry.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_chemistry.py --export-figures     # write SVGs

Each deploy runs the --apply form (deploy/*/release.sh) after the Mathematics and English
loaders, after a backup, whenever --pending says there is anything left to load; once the bank
matches the files it is a no-op.

WHY THIS ONE ALSO BUILDS THE SUBJECT. Mathematics and English were in the bank before their
loaders were written: a syllabus seed (load_syllabus.rb) made the curriculum as drafts, and
publish_utme_subject.py walked it through approval over the API. Chemistry starts from nothing,
and a server only ever gets content through release.sh. So when CHEM is missing, this makes it,
in the same order publish_utme_subject.py follows, because the database triggers allow no
other:

  1. The two documents, recorded and licensed: the syllabus (source/syllabus.pdf), which the
     curriculum is read from, and the past-question compilation
     (source/past-questions-2010-2018.pdf), which the questions are read from.
  2. One citation per curriculum item, approved.
  3. The syllabus version, approved and made current.
  4. The items, parents first: 18 topics, their lettered subtopics (subtopics.yaml), and one
     skill under each subtopic. Questions are filed under skills (the schema refuses anything
     else), and the files file each question under a subtopic, so each subtopic carries
     exactly one skill of the same name, recorded as our inference ('implied').
  5. The subject switched on, so published_curriculum_scope, teachable_skills and with them
     the catalogue, the check-up, practice and the mock exam all offer it.

A topic the syllabus does not letter (2, 5, 13, 17, 18) has one subtopic `a`, which is ours
too ('implied'), and says so in its citation. Everything already done is left alone: a second
run finds each step complete and writes nothing.

THE QUESTIONS. Each year is two files, docs/questions/utme/chemistry/retranscribed_YYYY.yaml
and explanations_YYYY.yaml (format: the README beside them). A year loads when both exist and
every kept question in it reads correctly; a year with a problem is reported and skipped whole,
so it is never half-loaded. Questions are matched to the bank on (subject, year, number).

  - `drop: true`: not loaded; one already in the bank is retired with the drop_reason.
  - Not in the bank: created, filed under its subtopic's skill, and approved.
  - In the bank with everything a version freezes unchanged (stem, options, answer, level, the
    `why` notes, the figure): only the explanation (steps, hint) is rewritten in place if it
    differs (017/018 allow that and keep the old one), and the classification moved if the
    subtopic changed.
  - Anything frozen different: a NEW version, approved; the question points at it and the old
    one is withdrawn with a report. The old one stays because a student's attempt may point at
    it.

  `answer` is the correct option. Each `why` is that option's distractor_note, which the mock
  report shows beside a wrong choice. The steps and the hint are the version's solution_steps
  and hints, as in Mathematics. `level` is the mastery level, and the time allowed follows from
  it (SECONDS_BY_LEVEL, the Mathematics table). A `figure` (a JPG cropped from the compilation)
  becomes a question_assets row, image/jpeg, described by `figure_alt`; a `figure_svg` is
  written to figures/svg/YYYY_qNN.svg (as Mathematics does) and attached as image/svg+xml,
  described by its aria-label.

LESSONS (lessons_YYYY.yaml, and doodles/YYYY_qNN_x.svg) are checked and loaded exactly as
load_retranscribed_maths.py loads them, against the version each question ends up on. A year
whose lessons file does not exist yet simply has no lessons.

WHAT THE REVIEWER IS DECIDING. Everything here is approved in the name given with --reviewer
or --reviewer-name, and every row it writes says so: that the curriculum is the syllabus's, that
we may store and show both documents, that the answers and levels are our answers, and that the
figures and their descriptions may be shown. It is the decision publish_utme_subject.py and
load_retranscribed_maths.py record for the other two subjects, made once for Chemistry.

All of it is one transaction: a failure changes nothing.

The loading itself is database/retranscribed_loader.py, shared with Physics; this file is
Chemistry's settings and its command line.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from retranscribed_loader import Subject, main

#: The syllabus page each lettered subtopic is printed on (source/syllabus.pdf, 16 pages; the
#: detailed syllabus is pages 1 to 15, page 16 the recommended texts). Read off the PDF.
SYLLABUS_PAGES: dict[str, int] = {
    **{f"CHEM.1.{x}": 1 for x in "abcde"},
    "CHEM.2.a": 1,
    "CHEM.3.a": 2,
    "CHEM.3.b": 2,
    "CHEM.4.a": 2,
    **{f"CHEM.4.{x}": 3 for x in "bcd"},
    "CHEM.5.a": 3,
    **{f"CHEM.6.{x}": 4 for x in "abc"},
    "CHEM.7.a": 4,
    **{f"CHEM.7.{x}": 5 for x in "bcd"},
    "CHEM.8.a": 5,
    "CHEM.8.b": 5,
    **{f"CHEM.8.{x}": 6 for x in "cde"},
    **{f"CHEM.9.{x}": 6 for x in "abcdef"},
    **{f"CHEM.10.{x}": 7 for x in "abcde"},
    **{f"CHEM.11.{x}": 7 for x in "abc"},
    **{f"CHEM.12.{x}": 8 for x in "abc"},
    "CHEM.13.a": 8,
    **{f"CHEM.14.{x}": 9 for x in "abc"},
    "CHEM.14.d": 10,
    "CHEM.14.e": 11,
    "CHEM.15.a": 11,
    "CHEM.15.b": 11,
    **{f"CHEM.15.{x}": 12 for x in "cdefghi"},
    "CHEM.16.a": 13,
    "CHEM.16.b": 13,
    **{f"CHEM.16.{x}": 14 for x in "cdefgh"},
    "CHEM.16.i": 15,
    "CHEM.16.j": 15,
    "CHEM.17.a": 15,
    "CHEM.18.a": 15,
}
#: The Chemistry PDF prints no year either; it was saved in July 2025, which is the syllabus in
#: use for the 2026/27 sittings, so it carries VERSION_LABEL (utme-2027) like the others.
CHEMISTRY = Subject(
    folder="chemistry",
    code="CHEM",
    name="Chemistry",
    author="Hand re-transcription (UTME Chemistry)",
    syllabus_pdf="syllabus.pdf",
    syllabus_page_count=16,
    syllabus_title="UTME Syllabus — Chemistry",
    papers_pdf="past-questions-2010-2018.pdf",
    papers_page_count=84,
    papers_title=(
        "UTME Chemistry past questions 2010-2018 (toppers.com.ng compilation, with keys)"
    ),
    syllabus_pages=SYLLABUS_PAGES,
    note=(
        "Superseded by a new write-up of the paper "
        "(docs/questions/utme/chemistry/retranscribed_{year}.yaml / explanations_{year}.yaml)."
    ),
)


if __name__ == "__main__":
    sys.exit(main(CHEMISTRY, __doc__))
