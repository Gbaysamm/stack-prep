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
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import asyncpg
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lesson_cues import attach_cues, split_cues
from lesson_diagrams import DiagramBook
from lesson_doodles import (
    _FILE as DOODLE_FILE,
)
from lesson_doodles import (
    DoodleBook,
    check_all_used,
    doodles_column,
    library_names,
    need_doodles_column,
    read_custom_doodles,
)
from lesson_marks import (
    SKETCH_NAMES,
    SKETCH_SUFFIXES,
    check_sketch,
    clean_points,
    clean_section,
    clean_show_sketch,
)
from load_questions import CURRICULUM_NAMESPACE, content_hash, normalise, uuid_for

ROOT = Path(__file__).resolve().parent.parent
CHEM = ROOT / "docs" / "questions" / "utme" / "chemistry"
SVG_DIR = CHEM / "figures" / "svg"
SKETCH_DIR = CHEM / "sketches"
DOODLE_DIR = CHEM / "doodles"
SYLLABUS_PDF = CHEM / "source" / "syllabus.pdf"
PAPERS_PDF = CHEM / "source" / "past-questions-2010-2018.pdf"

SUBJECT = "CHEM"
SUBJECT_NAME = "Chemistry"
EXAMINATION = "UTME"
#: The label the other UTME subjects' current syllabuses carry. The Chemistry PDF prints no
#: year either; it was saved in July 2025, which is the syllabus in use for the 2026/27 sittings.
VERSION_LABEL = "utme-2027"
AUTHOR = "Hand re-transcription (UTME Chemistry)"
SECONDS_BY_LEVEL = {1: 30, 2: 45, 3: 60, 4: 80, 5: 100}
LETTERS = ("A", "B", "C", "D")
#: Where Mathematics and English questions sit; Chemistry behaves the same everywhere.
USAGE_POOL = "diagnostic"

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
SYLLABUS_PAGE_COUNT = 16
PAPERS_PAGE_COUNT = 84

#: Said on every version this supersedes, so the reason is in the row and not only in a commit.
NOTE = (
    "Superseded by a new write-up of the paper "
    "(docs/questions/utme/chemistry/retranscribed_{year}.yaml / explanations_{year}.yaml)."
)


# --------------------------------------------------------------------------------------------
# The files


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def repo_path(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def read_curriculum(path: Path = CHEM / "subtopics.yaml") -> list[dict[str, Any]]:
    """Topics, subtopics and one skill per subtopic, parents before children.

    Each carries its citation: where in source/syllabus.pdf it is printed, the words, and
    whether it is the syllabus's own ('explicit', an inclusion citation) or our structure
    ('implied', an academic-boundary citation with its reason).
    """
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    items: list[dict[str, Any]] = []
    for t_order, (topic_code, topic) in enumerate(doc["topics"].items(), 1):
        number = topic_code.split(".")[1]
        subtopics = topic["subtopics"]
        pages = sorted({SYLLABUS_PAGES[code] for code in subtopics})
        lettered = not (len(subtopics) == 1 and next(iter(subtopics)).endswith(".a"))
        items.append(
            {
                "code": topic_code,
                "type": "topic",
                "parent": None,
                "name": str(topic["name"]).strip(),
                "order": t_order,
                "location": f"PDF page {pages[0]}, topic {number}",
                "excerpt": f"{number}. {str(topic['name']).strip()}",
                "status": "explicit",
            }
        )
        for s_order, (code, name) in enumerate(subtopics.items(), 1):
            letter = code.rsplit(".", 1)[1]
            page = SYLLABUS_PAGES[code]
            name = str(name).strip()
            where = f"PDF page {page}, topic {number}" + (f" ({letter})" if lettered else "")
            sub = {
                "code": code,
                "type": "subtopic",
                "parent": topic_code,
                "name": name,
                "order": s_order,
                "location": where,
                "excerpt": f"({letter}) {name}" if lettered else name,
                "status": "explicit" if lettered else "implied",
                "rationale": None
                if lettered
                else (
                    f"Topic {number} prints its contents without lettering them; the whole "
                    "topic is recorded as one subtopic so questions can be filed under it."
                ),
            }
            items.append(sub)
            items.append(
                {
                    "code": f"{code}.i",
                    "type": "skill",
                    "parent": code,
                    "name": name,
                    "order": 1,
                    "location": where,
                    "excerpt": sub["excerpt"],
                    "status": "implied",
                    "rationale": (
                        "One skill per subtopic: the syllabus lists its objectives per topic, "
                        "not per lettered content, and questions are filed by subtopic."
                    ),
                }
            )
    return items


def years_ready() -> tuple[list[int], list[str]]:
    """Years whose two files both exist, and a note for each that is still missing one."""
    years: list[int] = []
    notes: list[str] = []
    for path in sorted(CHEM.glob("retranscribed_*.yaml")):
        found = re.fullmatch(r"retranscribed_(\d{4})\.yaml", path.name)
        if not found:
            continue
        year = int(found.group(1))
        if (CHEM / f"explanations_{year}.yaml").is_file():
            years.append(year)
        else:
            notes.append(f"{year}: no explanations_{year}.yaml yet; skipped")
    return years, notes


def jpeg_size(data: bytes) -> tuple[int | None, int | None]:
    """A JPEG's width and height, read from its frame header; (None, None) if not found."""
    if data[:2] != b"\xff\xd8":
        return None, None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7 or marker == 0xFF:
            i += 1 if marker == 0xFF else 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        # Start-of-frame markers, every kind but DHT (C4), JPG (C8) and DAC (CC).
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return (width or None), (height or None)
        i += 2 + length
    return None, None


def svg_size(text: str) -> tuple[int | None, int | None]:
    width = re.search(r'\bwidth="(\d+)', text)
    height = re.search(r'\bheight="(\d+)', text)
    return (int(width.group(1)) if width else None, int(height.group(1)) if height else None)


def svg_file_text(svg: str) -> str:
    """The SVG as a file: loaded through <img>, a browser refuses it without its namespace."""
    text = svg.strip()
    if "xmlns=" not in text.split(">", 1)[0]:
        text = text.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    return text + "\n"


def svg_path(year: int, number: int) -> Path:
    return SVG_DIR / f"{year}_q{number:02d}.svg"


def seconds_for(level: int) -> int:
    return SECONDS_BY_LEVEL[level]


def check_question(
    raw: dict[str, Any], note: dict[str, Any] | None, codes: set[str], year: int
) -> list[str]:
    """What stops one kept question loading. Empty when it is sound."""
    n = raw.get("number")
    where = f"{year} Q{n}"
    problems: list[str] = []
    options = raw.get("options") or {}
    if not isinstance(options, dict) or tuple(options) != LETTERS:
        problems.append(f"{where}: options must be exactly A, B, C, D")
    elif any(not str(v).strip() for v in options.values()):
        problems.append(f"{where}: an empty option")
    answer = str(raw.get("answer") or "").strip().upper()
    if answer not in LETTERS:
        problems.append(f"{where}: answer {raw.get('answer')!r} is not A-D")
    if not str(raw.get("stem") or "").strip():
        problems.append(f"{where}: no stem")
    if raw.get("subtopic") not in codes:
        problems.append(f"{where}: subtopic {raw.get('subtopic')!r} is not in subtopics.yaml")
    if raw.get("level") not in SECONDS_BY_LEVEL:
        problems.append(f"{where}: level must be 1 to 5")
    figure = raw.get("figure")
    if figure:
        path = CHEM / str(figure)
        if not path.is_file():
            problems.append(f"{where}: figure {figure} not found")
        elif path.suffix.lower() not in (".jpg", ".jpeg"):
            problems.append(f"{where}: figure {figure} is not a JPG")
        if not str(raw.get("figure_alt") or "").strip():
            problems.append(f"{where}: figure without figure_alt")
    svg = raw.get("figure_svg")
    if svg and not re.search(r'aria-label="([^"]+)"', str(svg)):
        problems.append(f"{where}: figure_svg has no aria-label to describe it")
    if figure and svg:
        problems.append(f"{where}: both figure and figure_svg")
    if note is None:
        problems.append(f"{where}: no explanation")
        return problems
    if str(note.get("answer") or "").strip().upper() != answer:
        problems.append(f"{where}: the explanation's answer is {note.get('answer')!r}")
    steps = note.get("steps")
    if not isinstance(steps, list) or not steps or not all(str(s).strip() for s in steps):
        problems.append(f"{where}: no steps")
    if not str(note.get("hint") or "").strip():
        problems.append(f"{where}: no hint")
    why = note.get("why") or {}
    if not isinstance(why, dict) or set(why) != set(LETTERS) - {answer}:
        problems.append(f"{where}: `why` must cover exactly the wrong options")
    return problems


def read_year(year: int, codes: set[str]) -> tuple[list[dict], list[dict], list[str]]:
    """One year's kept questions, its dropped ones, and any problems (then nothing loads)."""
    paper = yaml.safe_load((CHEM / f"retranscribed_{year}.yaml").read_text(encoding="utf-8"))
    notes_doc = yaml.safe_load((CHEM / f"explanations_{year}.yaml").read_text(encoding="utf-8"))
    explained = {int(k): v for k, v in ((notes_doc or {}).get("explanations") or {}).items()}
    source = paper.get("source") or {}
    problems: list[str] = []
    if int(source.get("exam_year") or 0) != year:
        problems.append(f"{year}: source.exam_year is {source.get('exam_year')!r}")
    paper_code = str(source.get("paper_code") or f"UTME-{year}-CHEM")
    if paper_code != f"UTME-{year}-CHEM":
        problems.append(f"{year}: paper_code {paper_code!r}, expected UTME-{year}-CHEM")
    kept: list[dict] = []
    dropped: list[dict] = []
    seen: set[int] = set()
    for raw in paper.get("questions") or []:
        number = int(raw["number"])
        if number in seen:
            problems.append(f"{year} Q{number}: number used twice")
        seen.add(number)
        if raw.get("drop"):
            dropped.append(
                {
                    "year": year,
                    "number": number,
                    "reason": normalise(str(raw.get("drop_reason") or "Dropped in the write-up.")),
                }
            )
            continue
        note = explained.get(number)
        found = check_question(raw, note, codes, year)
        if found:
            problems += found
            continue
        assert note is not None
        answer = str(raw["answer"]).strip().upper()
        figure_path = CHEM / str(raw["figure"]) if raw.get("figure") else None
        svg = str(raw["figure_svg"]) if raw.get("figure_svg") else None
        figure: dict[str, Any] | None = None
        printed = source.get("pages") or ["?"]
        pages = f"{printed[0]}-{printed[-1]}"
        if figure_path is not None:
            data = figure_path.read_bytes()
            width, height = jpeg_size(data)
            figure = {
                "uri": repo_path(figure_path),
                "mime": "image/jpeg",
                "sha256": hashlib.sha256(data).hexdigest(),
                "size": len(data),
                "width": width,
                "height": height,
                "alt": normalise(str(raw["figure_alt"])),
                "where": (
                    f"Cropped from source/past-questions-2010-2018.pdf, UTME {year} "
                    f"(PDF pages {pages}), Q{number}"
                ),
            }
        elif svg is not None:
            text = svg_file_text(svg)
            label = re.search(r'aria-label="([^"]+)"', svg)
            assert label
            width, height = svg_size(text)
            figure = {
                "uri": repo_path(svg_path(year, number)),
                "mime": "image/svg+xml",
                "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "size": len(text.encode("utf-8")),
                "width": width,
                "height": height,
                "alt": normalise(label.group(1)),
                "svg": text,
                "where": f"Drawn by hand for UTME {year} Q{number} (retranscribed_{year}.yaml)",
            }
        why = note.get("why") or {}
        kept.append(
            {
                "year": year,
                "number": number,
                "paper_code": paper_code,
                "paper_label": str(source.get("paper_label") or f"UTME {year} Chemistry"),
                "stem": normalise(str(raw["stem"])),
                "options": {k: normalise(str(v)) for k, v in raw["options"].items()},
                "answer": answer,
                "why": {k: normalise(str(v)) for k, v in why.items()},
                "steps": [str(s).strip() for s in note["steps"]],
                "hint": str(note["hint"]).strip(),
                "level": int(raw["level"]),
                "level_reason": normalise(str(raw.get("level_reason") or "")),
                "subtopic": str(raw["subtopic"]),
                "figure": figure,
            }
        )
    return kept, dropped, problems


def read_papers() -> tuple[list[dict], list[dict], list[str], list[int]]:
    """Every loadable question, every dropped one, notes on years skipped, and years loaded."""
    codes = {item["code"] for item in read_curriculum() if item["type"] == "subtopic"}
    years, notes = years_ready()
    questions: list[dict] = []
    dropped: list[dict] = []
    loaded: list[int] = []
    for year in years:
        kept, gone, problems = read_year(year, codes)
        if problems:
            notes.append(f"{year}: skipped, {len(problems)} problem(s): " + "; ".join(problems[:5]))
            continue
        questions += kept
        dropped += gone
        loaded.append(year)
    return questions, dropped, notes, loaded


def version_hash(q: dict[str, Any], salt: str = "") -> str:
    """Everything a version freezes, so a change to any of it is a new version.

    content_hash(stem, options) alone would collide whenever only the key, the level, a
    distractor note or the figure changed, and the bank refuses two versions of one question
    with one hash. `salt` separates a version that returns to an earlier one's content.
    """
    figure = q["figure"] or {}
    extra = json.dumps(
        [
            q["answer"],
            q["level"],
            sorted(q["why"].items()),
            figure.get("uri"),
            figure.get("sha256"),
            figure.get("alt"),
            salt,
        ],
        ensure_ascii=False,
    )
    return content_hash(q["stem"] + "\n" + extra, q["options"])


def export_figures(questions: list[dict]) -> int:
    """Write each drawn figure to figures/svg/YYYY_qNN.svg. Returns how many changed."""
    try:
        import resvg_py as resvg  # type: ignore[import-not-found]
    except ImportError:
        resvg = None
    changed = 0
    for q in questions:
        figure = q["figure"]
        if not figure or figure["mime"] != "image/svg+xml":
            continue
        path = svg_path(q["year"], q["number"])
        if not path.exists() or path.read_text(encoding="utf-8") != figure["svg"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(figure["svg"], encoding="utf-8", newline="\n")
            changed += 1
        # A PNG beside it for the coach, which is sent pictures and does not take SVG
        # (routers/practice.py). Rendering needs resvg, which only this step asks for:
        #   uv run --with resvg-py python database/load_retranscribed_chemistry.py --export-figures
        png = path.with_suffix(".png")
        if resvg is not None and (not png.exists() or png.stat().st_mtime < path.stat().st_mtime):
            width, _ = svg_size(figure["svg"])
            png.write_bytes(
                bytes(
                    resvg.svg_to_bytes(
                        svg_string=figure["svg"], background="white", width=(width or 320) * 2
                    )
                )
            )
    if resvg is None:
        print("resvg-py is not installed, so no PNG copies for the coach were made.")
    return changed


OPTION_LETTERS = {"A", "B", "C", "D", "E"}


def read_lessons(
    figures: dict[tuple[int, int], list[str]] | None = None,
) -> dict[tuple[int, int], dict]:
    """Every written lesson (lessons_YYYY.yaml), checked, keyed by year and question number.

    load_retranscribed_maths.read_lessons, for the Chemistry folders: the same moments, cues,
    marks, sketches, doodles and live diagrams, checked by the same modules. A year with no
    lessons file yet has no lessons, and its doodles wait for it.
    """
    found: dict[tuple[int, int], dict] = {}
    library = library_names()
    lesson_years: set[int] = set()
    for path in sorted(CHEM.glob("lessons_*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        year = int(doc["exam_year"])
        lesson_years.add(year)
        for number, lesson in (doc.get("lessons") or {}).items():
            where = f"{path.name} Q{number}"
            moments = lesson.get("moments")
            if not isinstance(moments, list) or not moments:
                raise SystemExit(f"{where}: a lesson needs moments")
            sketches: list[dict[str, object]] = []
            for name, suffix in zip(SKETCH_NAMES, SKETCH_SUFFIXES, strict=True):
                file = SKETCH_DIR / f"{year}_q{int(number):02d}{suffix}.svg"
                if file.is_file():
                    checked = check_sketch(file.read_text(encoding="utf-8"), file.name)
                    sketches.append({"name": name, **checked})
            drawn = {str(sketch["name"]): str(sketch["svg"]) for sketch in sketches}
            if "sketch_b" in drawn and "sketch" not in drawn:
                raise SystemExit(f"{where}: a _b sketch with no first sketch")
            if "sketch_c" in drawn and "sketch_b" not in drawn:
                raise SystemExit(f"{where}: a _c sketch with no _b sketch")
            doodles = read_custom_doodles(DOODLE_DIR, year, int(number))
            book = DoodleBook(library, doodles, year, int(number))
            diagrams = DiagramBook()
            clean: list[dict[str, object]] = []
            brought: list[str] = []
            for moment in moments:
                say = moment.get("say") if isinstance(moment, dict) else None
                if not isinstance(say, str) or not say.strip():
                    raise SystemExit(f"{where}: every moment needs something said")
                moment, cues = split_cues(moment, f"{where} moment {len(clean)}")
                write = moment.get("write")
                if write is not None and (not isinstance(write, str) or not write.strip()):
                    raise SystemExit(f"{where}: a moment's write is a line of working or nothing")
                entry: dict[str, object] = {"say": say.strip()}
                if write:
                    entry["write"] = write.strip()
                if moment.get("answer"):
                    entry["answer"] = True
                if moment.get("section") is not None:
                    entry["section"] = clean_section(
                        moment["section"], f"{where} moment {len(clean)}"
                    )
                if moment.get("show_sketch"):
                    name = clean_show_sketch(
                        moment["show_sketch"], drawn, brought, f"{where} moment {len(clean)}"
                    )
                    brought.append(name)
                    entry["show_sketch"] = True if name == "sketch" else name
                bringing, linkable = book.moment(
                    moment,
                    len(clean),
                    [bool(m.get("write")) for m in clean] + [bool(write)],
                    f"{where} moment {len(clean)}",
                )
                drawing = diagrams.moment(
                    moment,
                    len(clean),
                    [bool(m.get("write")) for m in clean] + [bool(write)],
                    f"{where} moment {len(clean)}",
                )
                point = moment.get("point")
                if point is not None:
                    entry["point"] = clean_points(
                        point,
                        len(clean),
                        f"{where} moment {len(clean)}",
                        None if figures is None else figures.get((year, int(number)), []),
                        drawn,
                        doodles=linkable,
                        diagrams=diagrams,
                    )
                entry.update(bringing)
                entry.update(drawing)
                attach_cues(entry, cues)
                clean.append(entry)
            check_all_used(doodles, clean, where)
            traps = lesson.get("traps") or {}
            if not isinstance(traps, dict) or not set(traps) <= OPTION_LETTERS:
                raise SystemExit(f"{where}: traps are keyed by option letter")
            found[(year, int(number))] = {
                "moments": clean,
                "sketches": sketches,
                "doodles": doodles,
                "traps": {str(key): str(value).strip() for key, value in traps.items()},
                "file": path.relative_to(ROOT).as_posix(),
            }
    for file in sorted(SKETCH_DIR.glob("*.svg")) if SKETCH_DIR.is_dir() else []:
        named = re.fullmatch(r"(\d{4})_q(\d{2})(_b|_c)?\.svg", file.name)
        if not named:
            raise SystemExit(
                f"sketches/{file.name}: named YYYY_qNN.svg, YYYY_qNN_b.svg or YYYY_qNN_c.svg"
            )
        if (
            int(named.group(1)) in lesson_years
            and (
                int(named.group(1)),
                int(named.group(2)),
            )
            not in found
        ):
            raise SystemExit(f"sketches/{file.name}: there is no written lesson for it to go with")
    # As lesson_doodles.check_doodle_files, but a doodle drawn for a year whose lessons file
    # is still being written waits for it rather than stopping the load.
    for file in sorted(DOODLE_DIR.glob("*")) if DOODLE_DIR.is_dir() else []:
        named = DOODLE_FILE.fullmatch(file.name)
        if not named:
            raise SystemExit(f"doodles/{file.name}: named YYYY_qNN_x.svg (x: a short tag)")
        year, number = int(named.group(1)), int(named.group(2))
        if year in lesson_years and (year, number) not in found:
            raise SystemExit(f"doodles/{file.name}: there is no written lesson for it to go with")
    return found


# --------------------------------------------------------------------------------------------
# The database: the subject and its curriculum


async def connect(args: argparse.Namespace) -> asyncpg.Connection:
    # Inside the API container the database address is already in the environment, so a
    # deploy can run this without repeating the password on a command line.
    url = args.database_url or os.environ.get("DATABASE_URL") or ""
    dsn = url.replace("+asyncpg", "", 1) or None
    conn = await asyncpg.connect(
        dsn=dsn,
        host=None if dsn else "127.0.0.1",
        port=None if dsn else 55439,
        database=None if dsn else "scorepilot",
    )
    await conn.execute("SET search_path = stackprep, public")
    return conn


async def resolve_reviewer(
    conn: asyncpg.Connection, args: argparse.Namespace
) -> tuple[Any, str, bool]:
    """(id, name, whether the reviewer row must be created), as the Mathematics loader does."""
    if args.reviewer:
        row = await conn.fetchrow(
            "SELECT id, display_name FROM academic_reviewers WHERE id = $1 AND active",
            args.reviewer,
        )
        if row is None:
            raise SystemExit("no active reviewer with that id")
        return row["id"], row["display_name"], False
    if args.reviewer_name:
        found = await conn.fetch(
            "SELECT id FROM academic_reviewers WHERE display_name = $1 AND active",
            args.reviewer_name,
        )
        if len(found) > 1:
            raise SystemExit(f"{len(found)} active reviewers are called {args.reviewer_name}")
        if found:
            return found[0]["id"], args.reviewer_name, False
        return uuid_for(f"reviewer:{args.reviewer_name}"), args.reviewer_name, True
    return None, "nobody (checking only)", False


class Ground:
    """The rows Chemistry stands on, as found: what exists, and what is still to do."""

    def __init__(self) -> None:
        self.exam_id: Any = None
        self.subject_id: Any = None
        self.syllabus_doc: Any = None
        self.papers_doc: Any = None
        self.version_id: Any = None
        self.items: dict[str, dict[str, Any]] = {}
        self.todo: list[str] = []


async def survey(conn: asyncpg.Connection, curriculum: list[dict[str, Any]]) -> Ground:
    """Read what exists of CHEM and list every step still to take. Writes nothing."""
    g = Ground()
    exams = await conn.fetch(
        "SELECT id, status FROM examinations WHERE short_name = $1 AND country_code = 'NG'",
        EXAMINATION,
    )
    if len(exams) != 1:
        raise SystemExit(f"expected one {EXAMINATION} examination, found {len(exams)}")
    g.exam_id = exams[0]["id"]
    if exams[0]["status"] != "active":
        raise SystemExit(f"the {EXAMINATION} examination is not active; switch it on first")

    subject = await conn.fetchrow(
        "SELECT id, status, name FROM subjects WHERE examination_id = $1 AND code = $2",
        g.exam_id,
        SUBJECT,
    )
    g.subject_id = (
        subject["id"]
        if subject
        else uuid_for(f"subject:{g.exam_id}:{SUBJECT}", CURRICULUM_NAMESPACE)
    )
    if subject is None:
        g.todo.append("create the Chemistry subject")
    elif subject["status"] == "retired":
        raise SystemExit("Chemistry is retired in this database; not switching it back on")

    for attr, path in (("syllabus_doc", SYLLABUS_PDF), ("papers_doc", PAPERS_PDF)):
        sha = sha256_file(path)
        row = await conn.fetchrow(
            "SELECT id, subject_id, licence_status, review_status, storage_permission, "
            "student_delivery_permission, model_context_permission FROM source_documents "
            "WHERE file_sha256 = $1",
            sha,
        )
        if row is None:
            setattr(g, attr, uuid_for(f"document:{sha}", CURRICULUM_NAMESPACE))
            g.todo.append(f"record and license {path.name}")
            continue
        if row["subject_id"] != g.subject_id:
            raise SystemExit(f"{path.name} is already recorded for another subject")
        if row["licence_status"] == "blocked":
            raise SystemExit(f"{path.name} has a blocked licence; a person decided that, so stop")
        setattr(g, attr, row["id"])
        if not (
            row["licence_status"] == "verified"
            and row["review_status"] == "approved"
            and row["storage_permission"]
            and row["student_delivery_permission"]
            and row["model_context_permission"]
        ):
            g.todo.append(f"license {path.name}")

    version = await conn.fetchrow(
        "SELECT id, status, is_current FROM syllabus_versions "
        "WHERE subject_id = $1 AND version_label = $2",
        g.subject_id,
        VERSION_LABEL,
    )
    g.version_id = (
        version["id"]
        if version
        else uuid_for(f"version:{g.subject_id}:{VERSION_LABEL}", CURRICULUM_NAMESPACE)
    )
    other_current = await conn.fetchval(
        "SELECT id FROM syllabus_versions WHERE subject_id = $1 AND is_current AND id <> $2",
        g.subject_id,
        g.version_id,
    )
    if other_current is not None:
        raise SystemExit(
            "another Chemistry syllabus version is current; this loader will not demote it"
        )
    if version is None or version["status"] != "approved" or not version["is_current"]:
        g.todo.append(f"publish the {VERSION_LABEL} syllabus version")

    existing = {
        row["code"]: dict(row)
        for row in await conn.fetch(
            """
            SELECT c.id, c.code, c.name, c.item_type, c.review_status,
                   (SELECT count(*) FROM curriculum_evidence e
                     WHERE e.curriculum_item_id = c.id AND e.review_status = 'approved')
                     AS approved_evidence
            FROM curriculum_items c WHERE c.syllabus_version_id = $1
            """,
            g.version_id,
        )
    }
    missing = unapproved = 0
    for item in curriculum:
        row = existing.get(item["code"])
        if row is None:
            missing += 1
            g.items[item["code"]] = {
                "id": uuid_for(f"item:{g.version_id}:{item['code']}", CURRICULUM_NAMESPACE),
                "new": True,
            }
            continue
        if row["name"] != item["name"] or row["item_type"] != item["type"]:
            if row["review_status"] == "approved":
                raise SystemExit(
                    f"{item['code']} is approved as {row['name']!r} ({row['item_type']}); "
                    f"subtopics.yaml now says {item['name']!r}. Approved curriculum is "
                    "immutable: a renamed item needs a new syllabus version."
                )
            raise SystemExit(f"{item['code']} exists as a draft with a different name; settle it")
        if row["review_status"] != "approved" or not row["approved_evidence"]:
            unapproved += 1
        g.items[item["code"]] = {"id": row["id"], "new": False}
    if missing:
        g.todo.append(f"add {missing} curriculum items")
    if unapproved:
        g.todo.append(f"approve {unapproved} curriculum items")
    if subject is None or subject["status"] != "active":
        g.todo.append("switch Chemistry on")
    return g


async def lay_ground(
    conn: asyncpg.Connection,
    g: Ground,
    curriculum: list[dict[str, Any]],
    reviewer_id: Any,
    author_id: Any,
) -> None:
    """Make every row in `survey`'s list, in the order the triggers allow. Idempotent."""
    await conn.execute(
        "INSERT INTO subjects (id, examination_id, code, name, status) "
        "VALUES ($1, $2, $3, $4, 'draft') ON CONFLICT (id) DO NOTHING",
        g.subject_id,
        g.exam_id,
        SUBJECT,
        SUBJECT_NAME,
    )
    # 1. The documents, recorded then licensed in the reviewer's name.
    documents = (
        (
            g.syllabus_doc,
            SYLLABUS_PDF,
            "syllabus",
            "UTME Syllabus — Chemistry",
            SYLLABUS_PAGE_COUNT,
            None,
        ),
        (
            g.papers_doc,
            PAPERS_PDF,
            "paper",
            "UTME Chemistry past questions 2010-2018 (toppers.com.ng compilation, with keys)",
            PAPERS_PAGE_COUNT,
            None,
        ),
    )
    for doc_id, path, kind, title, pages, issuer in documents:
        await conn.execute(
            """
            INSERT INTO source_documents (id, examination_id, subject_id, document_type, title,
              issuer, file_uri, file_sha256, mime_type, page_count, licence_status,
              processing_status, review_status, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'application/pdf', $9, 'pending',
              'processed', 'pending', $10)
            ON CONFLICT (id) DO NOTHING
            """,
            doc_id,
            g.exam_id,
            g.subject_id,
            kind,
            title,
            issuer,
            repo_path(path),
            sha256_file(path),
            pages,
            author_id,
        )
        await conn.execute(
            """
            UPDATE source_documents
               SET licence_status = 'verified', storage_permission = true,
                   student_delivery_permission = true, model_context_permission = true,
                   review_status = 'approved', reviewed_by = $2, reviewed_at = now()
             WHERE id = $1 AND NOT (licence_status = 'verified' AND review_status = 'approved'
               AND storage_permission AND student_delivery_permission
               AND model_context_permission)
            """,
            doc_id,
            reviewer_id,
        )

    # 2. The syllabus version (a draft until its items exist) and the items, as drafts.
    await conn.execute(
        """
        INSERT INTO syllabus_versions (id, subject_id, version_label, source_document_id,
          status, is_current)
        VALUES ($1, $2, $3, $4, 'draft', false) ON CONFLICT (id) DO NOTHING
        """,
        g.version_id,
        g.subject_id,
        VERSION_LABEL,
        g.syllabus_doc,
    )
    for item in curriculum:
        ids = g.items[item["code"]]
        if not ids["new"]:
            continue
        parent = g.items[item["parent"]]["id"] if item["parent"] else None
        await conn.execute(
            """
            INSERT INTO curriculum_items (id, syllabus_version_id, subject_id, parent_id,
              item_type, code, name, boundary_notes, syllabus_status, pilot_support_status,
              display_order, review_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uncertain', 'undecided', $9, 'draft')
            """,
            ids["id"],
            g.version_id,
            g.subject_id,
            parent,
            item["type"],
            item["code"],
            item["name"],
            item.get("rationale"),
            item["order"],
        )
    # Each item's citation. One per item: an item already cited is left as it is.
    for item in curriculum:
        item_id = g.items[item["code"]]["id"]
        cited = await conn.fetchval(
            "SELECT count(*) FROM curriculum_evidence WHERE curriculum_item_id = $1 "
            "AND review_status IN ('pending', 'approved')",
            item_id,
        )
        if cited:
            continue
        implied = item["status"] == "implied"
        await conn.execute(
            """
            INSERT INTO curriculum_evidence (id, curriculum_item_id, source_document_id,
              evidence_kind, source_location, source_excerpt, decision_rationale,
              decision_evidence_reference, review_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
            ON CONFLICT (id) DO NOTHING
            """,
            uuid_for(
                f"evidence:{item_id}:{g.syllabus_doc}:{item['location']}", CURRICULUM_NAMESPACE
            ),
            item_id,
            g.syllabus_doc,
            "academic_boundary" if implied else "inclusion",
            item["location"],
            item["excerpt"],
            item.get("rationale") if implied else None,
            f"source/syllabus.pdf, {item['location']}" if implied else None,
        )
    # 3. Citations approved (the document is licensed now), then the version published.
    await conn.execute(
        """
        UPDATE curriculum_evidence e SET review_status = 'approved', reviewed_by = $2,
               reviewed_at = now()
          FROM curriculum_items c
         WHERE c.id = e.curriculum_item_id AND c.syllabus_version_id = $1
           AND e.review_status = 'pending'
        """,
        g.version_id,
        reviewer_id,
    )
    await conn.execute(
        """
        UPDATE syllabus_versions SET status = 'approved', is_current = true,
               approved_by = $2, approved_at = now()
         WHERE id = $1 AND status = 'draft'
        """,
        g.version_id,
        reviewer_id,
    )
    await conn.execute(
        "UPDATE syllabus_versions SET is_current = true WHERE id = $1 AND status = 'approved' "
        "AND NOT is_current",
        g.version_id,
    )
    # 4. Items, parents first (the list is already in that order).
    for item in curriculum:
        await conn.execute(
            """
            UPDATE curriculum_items
               SET syllabus_status = $2, pilot_support_status = 'supported',
                   review_status = 'approved', approved_by = $3, approved_at = now()
             WHERE id = $1 AND review_status <> 'approved'
            """,
            g.items[item["code"]]["id"],
            item["status"],
            reviewer_id,
        )
    # 5. The subject switched on: until then published_curriculum_scope leaves it out.
    await conn.execute(
        "UPDATE subjects SET status = 'active', updated_at = now() "
        "WHERE id = $1 AND status = 'draft'",
        g.subject_id,
    )


# --------------------------------------------------------------------------------------------
# The database: the questions


async def bank_state(conn: asyncpg.Connection, subject_id: Any) -> dict[tuple[int, str], dict]:
    rows = await conn.fetch(
        """
        SELECT q.id AS question_id, q.exam_year, q.question_number, q.retired_at,
               v.id AS version_id, v.version, v.content_hash, v.review_status,
               v.solution_steps, v.hints, v.solution_source,
               (SELECT max(version) FROM question_versions WHERE question_id = q.id)
                 AS top_version,
               (SELECT c.curriculum_item_id FROM question_classifications c
                 WHERE c.question_id = q.id AND c.classification_role = 'primary'
                   AND c.review_status = 'approved' LIMIT 1) AS skill_id
        FROM questions q JOIN question_versions v ON v.id = q.current_version_id
        WHERE q.subject_id = $1
        """,
        subject_id,
    )
    return {(row["exam_year"], str(row["question_number"])): dict(row) for row in rows}


def plan_questions(
    questions: list[dict],
    dropped: list[dict],
    bank: dict[tuple[int, str], dict],
    skills: dict[str, Any],
) -> dict[str, list]:
    """Sort every question into what it needs. Pure: the bank is passed in as read."""
    plan: dict[str, list] = {
        "create": [],
        "revise": [],
        "explain": [],
        "refile": [],
        "unretire": [],
        "retire": [],
        "same": [],
    }
    for q in questions:
        row = bank.get((q["year"], str(q["number"])))
        if row is None:
            plan["create"].append((q, None))
            continue
        if row["retired_at"] is not None:
            plan["unretire"].append((q, row))
        frozen = row["review_status"] == "approved" and row["content_hash"] in (
            version_hash(q),
            version_hash(q, salt=f"v{row['version']}"),
        )
        if not frozen:
            plan["revise"].append((q, row))
            continue
        explained = (
            json.loads(row["solution_steps"] or "[]") == q["steps"]
            and json.loads(row["hints"] or "[]") == [q["hint"]]
            and row["solution_source"] == "expert_verified"
        )
        filed = skills.get(f"{q['subtopic']}.i") == row["skill_id"]
        if not explained:
            plan["explain"].append((q, row))
        if not filed:
            plan["refile"].append((q, row))
        if explained and filed:
            plan["same"].append((q, row))
    for d in dropped:
        row = bank.get((d["year"], str(d["number"])))
        if row is not None and row["retired_at"] is None:
            plan["retire"].append((d, row))
    return plan


async def add_figure(conn: asyncpg.Connection, version_id: Any, q: dict, reviewer: str) -> None:
    figure = q["figure"]
    if not figure:
        return
    await conn.execute(
        """
        INSERT INTO question_assets (question_version_id, storage_uri, mime_type, byte_size,
          width, height, alt_text, alt_text_source, source_location, licence_status,
          display_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'expert_verified', $8, 'verified', 0)
        """,
        version_id,
        figure["uri"],
        figure["mime"],
        figure["size"],
        figure["width"],
        figure["height"],
        figure["alt"],
        f"{figure['where']}; description confirmed by {reviewer}.",
    )


async def write_version(
    conn: asyncpg.Connection,
    q: dict,
    row: dict | None,
    ctx: dict[str, Any],
) -> None:
    """A new approved version (a new question too, when `row` is None)."""
    subject_id, reviewer_id, author_id = ctx["subject_id"], ctx["reviewer_id"], ctx["author_id"]
    if row is None:
        question_id = uuid_for(f"question:retranscribed:{q['paper_code']}:{q['number']}")
        await conn.execute(
            """
            INSERT INTO questions (id, subject_id, exam_paper_id, origin, source_document_id,
              exam_year, paper_code, question_number, usage_pool, created_by)
            VALUES ($1, $2, $3, 'past_paper', $4, $5, $6, $7, $8, $9)
            """,
            question_id,
            subject_id,
            ctx["papers"][q["year"]],
            ctx["papers_doc"],
            q["year"],
            q["paper_code"],
            str(q["number"]),
            USAGE_POOL,
            author_id,
        )
        version = 1
        digest = version_hash(q)
    else:
        question_id = row["question_id"]
        version = int(row["top_version"]) + 1
        digest = version_hash(q)
        taken = await conn.fetchval(
            "SELECT count(*) FROM question_versions WHERE question_id = $1 AND content_hash = $2",
            question_id,
            digest,
        )
        if taken:
            # Back to an earlier version's content: the hash says which version this is.
            digest = version_hash(q, salt=f"v{version}")
    version_id = await conn.fetchval(
        """
        INSERT INTO question_versions (question_id, subject_id, version, stem,
          response_format, marking_method, solution_steps, hints, expected_seconds,
          option_count, content_hash, authored_by, answer_source, answer_confidence,
          mastery_level_number, level_source, level_confidence, solution_source, review_status)
        VALUES ($1, $2, $3, $4, 'mcq_single', 'auto_key', $5::jsonb, $6::jsonb, $7, $8, $9,
          $10, 'expert_verified', 'medium', $11, 'expert_verified', 'low', 'expert_verified',
          'draft')
        RETURNING id
        """,
        question_id,
        subject_id,
        version,
        q["stem"],
        json.dumps(q["steps"]),
        json.dumps([q["hint"]]),
        seconds_for(q["level"]),
        len(q["options"]),
        digest,
        author_id,
        q["level"],
    )
    for order, (letter, body) in enumerate(sorted(q["options"].items()), 1):
        await conn.execute(
            """
            INSERT INTO question_options (question_version_id, subject_id, option_key, body,
              is_correct, distractor_note, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            version_id,
            subject_id,
            letter,
            body,
            letter == q["answer"],
            None if letter == q["answer"] else q["why"].get(letter),
            order,
        )
    await add_figure(conn, version_id, q, ctx["reviewer_name"])
    if row is None:
        await conn.execute(
            """
            INSERT INTO question_classifications (question_id, subject_id, curriculum_item_id,
              syllabus_version_id, classification_role, proposed_by, confidence,
              classification_reason, review_status, reviewed_by, reviewed_at)
            VALUES ($1, $2, $3, $4, 'primary', 'model', 0.5, $5, 'approved', $6, now())
            """,
            question_id,
            subject_id,
            ctx["skills"][f"{q['subtopic']}.i"],
            ctx["version_id"],
            f"Filed under {q['subtopic']} in retranscribed_{q['year']}.yaml.",
            reviewer_id,
        )
    # Point the question at the new version BEFORE withdrawing the old one, so the question
    # is never momentarily without a deliverable version.
    await conn.execute(
        "UPDATE questions SET current_version_id = $2, updated_at = now() WHERE id = $1",
        question_id,
        version_id,
    )
    await conn.execute(
        "UPDATE question_versions SET review_status = 'approved', reviewed_by = $2, "
        "reviewed_at = now() WHERE id = $1",
        version_id,
        reviewer_id,
    )
    if row is not None:
        await conn.execute(
            "UPDATE question_versions SET review_status = 'withdrawn' WHERE id = $1 "
            "AND review_status <> 'withdrawn'",
            row["version_id"],
        )
        await conn.execute(
            """
            INSERT INTO question_reports (question_version_id, reporter_kind, reason, detail,
              status, resolved_by, resolved_at, resolution_note)
            VALUES ($1, 'system', 'other', $2, 'fixed', $3, now(), $4)
            """,
            row["version_id"],
            NOTE.format(year=q["year"]),
            reviewer_id,
            f"Superseded by version {version}.",
        )


async def papers_to_write(
    conn: asyncpg.Connection, subject_id: Any, questions: list[dict]
) -> list[dict[str, Any]]:
    """Each year's exam_papers row, where it is missing or its question count is stale."""
    counts: dict[int, dict[str, Any]] = {}
    for q in questions:
        entry = counts.setdefault(
            q["year"],
            {"year": q["year"], "code": q["paper_code"], "label": q["paper_label"], "n": 0},
        )
        entry["n"] += 1
    work = []
    for entry in counts.values():
        row = await conn.fetchrow(
            "SELECT question_count, values_confirmed FROM exam_papers "
            "WHERE subject_id = $1 AND paper_code = $2",
            subject_id,
            entry["code"],
        )
        if row is None or (not row["values_confirmed"] and row["question_count"] != entry["n"]):
            work.append(entry)
    return work


async def lessons_to_load(
    conn: asyncpg.Connection, subject_id: Any, lessons: dict[tuple[int, int], dict]
) -> list[tuple[Any, dict]]:
    """The lessons whose question's current version does not already carry them as written."""
    work: list[tuple[Any, dict]] = []
    for (year, number), lesson in lessons.items():
        row = await conn.fetchrow(
            """
            SELECT q.current_version_id AS version_id, l.moments, l.traps,
                   to_jsonb(l) -> 'sketches' AS sketches,
                   to_jsonb(l) -> 'doodles' AS doodles
            FROM questions q
            LEFT JOIN question_lessons l ON l.question_version_id = q.current_version_id
            WHERE q.subject_id = $1 AND q.exam_year = $2 AND q.question_number = $3
              AND q.retired_at IS NULL
            """,
            subject_id,
            year,
            str(number),
        )
        if row is None:
            continue
        same = (
            row["moments"] is not None
            and json.loads(row["moments"]) == lesson["moments"]
            and json.loads(row["traps"]) == lesson["traps"]
            and json.loads(row["sketches"] or "[]") == lesson["sketches"]
            and json.loads(row["doodles"] or "[]") == lesson["doodles"]
        )
        if not same:
            work.append((row["version_id"], lesson))
    return work


async def run(args: argparse.Namespace) -> int:
    curriculum = read_curriculum()
    questions, dropped, notes, years = read_papers()
    if args.export_figures:
        print(f"{export_figures(questions)} figure file(s) written to {repo_path(SVG_DIR)}.")
        return 0
    lessons = read_lessons(
        {
            (q["year"], q["number"]): [q["figure"]["svg"]]
            for q in questions
            if q["figure"] and q["figure"].get("svg")
        }
    )
    unexported = [
        q
        for q in questions
        if q["figure"]
        and q["figure"]["mime"] == "image/svg+xml"
        and (
            not svg_path(q["year"], q["number"]).is_file()
            or svg_path(q["year"], q["number"]).read_text(encoding="utf-8") != q["figure"]["svg"]
        )
    ]
    if unexported:
        # As in Mathematics: the files are written here and committed, never on a server,
        # where the checkout may be read-only (deploy/binaax mounts it so).
        raise SystemExit(
            f"{len(unexported)} drawn figure files are missing or stale; "
            "run with --export-figures and commit them"
        )

    conn = await connect(args)
    try:
        reviewer_id, reviewer_name, new_reviewer = await resolve_reviewer(conn, args)
        ground = await survey(conn, curriculum)
        bank = await bank_state(conn, ground.subject_id)
        skills = {code: ground.items[code]["id"] for code in ground.items if code.count(".") == 3}
        plan = plan_questions(questions, dropped, bank, skills)
        papers = await papers_to_write(conn, ground.subject_id, questions)
        lesson_work = await lessons_to_load(conn, ground.subject_id, lessons)

        print(
            f"{len(questions)} Chemistry questions ready in {len(years)} year(s)"
            + (f" ({', '.join(map(str, years))})" if years else "")
            + f", {len(dropped)} dropped in the write-up."
        )
        for note in notes:
            print(f"  ! {note}", file=sys.stderr)
        for step in ground.todo:
            print(f"  subject: {step}")
        print(f"  {len(plan['create'])} not in the bank yet: created, approved")
        print(f"  {len(plan['revise'])} changed: a new version, approved, the old withdrawn")
        print(f"  {len(plan['explain'])} unchanged but for the explanation: rewritten in place")
        print(f"  {len(plan['refile'])} filed under another subtopic: moved")
        print(f"  {len(plan['unretire'])} retired before and back in the files: restored")
        print(f"  {len(plan['retire'])} dropped in the write-up: retired")
        print(f"  {len(plan['same'])} already exactly as written")
        print(f"  {len(papers)} paper rows to write or recount")
        print(f"  {len(lessons)} written lessons, {len(lesson_work)} to load or update")
        pending = len(ground.todo) + len(papers) + len(lesson_work)
        pending += sum(len(plan[k]) for k in plan if k != "same")
        if args.pending:
            # For a deploy: exit 10 when there is work, so it knows to take a backup first.
            return 10 if pending else 0
        print(f"Approving as {reviewer_name}" + (" (a new reviewer)." if new_reviewer else "."))
        if not args.apply:
            print("\nDry run; pass --apply to write it.")
            return 0
        if not pending:
            print("\nNothing to do.")
            return 0

        author_id = uuid_for(f"reviewer:{AUTHOR}")
        with_doodles = await doodles_column(conn)
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO academic_reviewers (id, display_name, active) VALUES ($1, $2, true) "
                "ON CONFLICT (id) DO NOTHING",
                author_id,
                AUTHOR,
            )
            if new_reviewer:
                await conn.execute(
                    "INSERT INTO academic_reviewers (id, display_name, active) "
                    "VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING",
                    reviewer_id,
                    reviewer_name,
                )
            await lay_ground(conn, ground, curriculum, reviewer_id, author_id)

            for entry in papers:
                await conn.execute(
                    """
                    INSERT INTO exam_papers (id, subject_id, paper_code, name, response_mode,
                      question_count, options_per_question, values_confirmed,
                      confirmation_note, pilot_support_status, status)
                    VALUES ($1, $2, $3, $4, 'objective', $5, 4, false, $6, 'undecided', 'draft')
                    ON CONFLICT (subject_id, paper_code) DO UPDATE
                      SET question_count = EXCLUDED.question_count, updated_at = now()
                      WHERE NOT exam_papers.values_confirmed
                    """,
                    uuid_for(f"paper:{ground.subject_id}:{entry['code']}"),
                    ground.subject_id,
                    entry["code"],
                    f"{entry['label']} ({entry['year']})",
                    entry["n"],
                    "Duration and marks are not printed with the compilation; score_out_of is "
                    "the schema default. The question count is the questions kept in the "
                    "write-up, without the paper-type question and any dropped.",
                )
            paper_ids = {
                int(row["code"].split("-")[1]): row["id"]
                for row in await conn.fetch(
                    "SELECT id, paper_code AS code FROM exam_papers WHERE subject_id = $1",
                    ground.subject_id,
                )
                if re.fullmatch(r"UTME-\d{4}-CHEM", row["code"])
            }
            ctx = {
                "subject_id": ground.subject_id,
                "reviewer_id": reviewer_id,
                "reviewer_name": reviewer_name,
                "author_id": author_id,
                "papers": paper_ids,
                "papers_doc": ground.papers_doc,
                "skills": skills,
                "version_id": ground.version_id,
            }
            for q, row in plan["create"] + plan["revise"]:
                await write_version(conn, q, row, ctx)
            for q, row in plan["explain"]:
                await conn.execute(
                    """
                    UPDATE question_versions
                       SET solution_steps = $2::jsonb, hints = $3::jsonb,
                           solution_source = 'expert_verified'
                     WHERE id = $1
                    """,
                    row["version_id"],
                    json.dumps(q["steps"]),
                    json.dumps([q["hint"]]),
                )
            for q, row in plan["refile"]:
                await conn.execute(
                    """
                    UPDATE question_classifications
                       SET curriculum_item_id = $2, syllabus_version_id = $3,
                           classification_reason = $4, reviewed_by = $5, reviewed_at = now()
                     WHERE question_id = $1 AND classification_role = 'primary'
                    """,
                    row["question_id"],
                    skills[f"{q['subtopic']}.i"],
                    ground.version_id,
                    f"Filed under {q['subtopic']} in retranscribed_{q['year']}.yaml.",
                    reviewer_id,
                )
            for _q, row in plan["unretire"]:
                await conn.execute(
                    "UPDATE questions SET retired_at = NULL, retired_reason = NULL, "
                    "updated_at = now() WHERE id = $1",
                    row["question_id"],
                )
            for d, row in plan["retire"]:
                await conn.execute(
                    "UPDATE questions SET retired_at = now(), retired_reason = $2, "
                    "updated_at = now() WHERE id = $1",
                    row["question_id"],
                    d["reason"],
                )

            # After the questions: a lesson belongs to the version a question is ON, and the
            # writes above may just have moved it.
            lesson_work = await lessons_to_load(conn, ground.subject_id, lessons)
            need_doodles_column(with_doodles, lesson_work)
            for version_id, lesson in lesson_work:
                await conn.execute(
                    """
                    INSERT INTO question_lessons (question_version_id, moments, traps,
                      source_file, sketches)
                    VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb)
                    ON CONFLICT (question_version_id) DO UPDATE
                      SET moments = EXCLUDED.moments, traps = EXCLUDED.traps,
                          source_file = EXCLUDED.source_file, sketches = EXCLUDED.sketches,
                          updated_at = now()
                    """,
                    version_id,
                    json.dumps(lesson["moments"]),
                    json.dumps(lesson["traps"]),
                    lesson["file"],
                    json.dumps(lesson["sketches"]),
                )
                if with_doodles:
                    await conn.execute(
                        "UPDATE question_lessons SET doodles = $2::jsonb "
                        "WHERE question_version_id = $1",
                        version_id,
                        json.dumps(lesson["doodles"]),
                    )
        print(f"{len(lesson_work)} written lessons loaded or updated.")

        deliverable = await conn.fetchval(
            "SELECT count(*) FROM deliverable_questions WHERE subject_id = $1", ground.subject_id
        )
        skills_live = await conn.fetchval(
            "SELECT count(*) FROM teachable_skills WHERE subject_id = $1", ground.subject_id
        )
        print(
            f"\nDone. Chemistry: {skills_live} teachable skills, {deliverable} questions "
            "deliverable."
        )
        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewer", help="academic_reviewers.id of the person approving")
    parser.add_argument(
        "--reviewer-name",
        help="The approving reviewer's display name; created as a reviewer if not yet one",
    )
    parser.add_argument("--database-url", default=None, help="Defaults to $DATABASE_URL")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--pending",
        action="store_true",
        help="Write nothing; exit 10 if there is anything to load, 0 if not",
    )
    parser.add_argument(
        "--export-figures",
        action="store_true",
        help="Write the drawn (figure_svg) figures to figures/svg, then stop",
    )
    args = parser.parse_args()
    if args.apply and not (args.reviewer or args.reviewer_name):
        parser.error("--apply needs --reviewer or --reviewer-name: approval is a person's")
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
