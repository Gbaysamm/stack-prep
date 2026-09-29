#!/usr/bin/env python3
"""Put the hand re-transcription of UTME Use of English into the bank, approved, with lessons.

    uv run python database/load_retranscribed_english.py                      # dry run
    uv run python database/load_retranscribed_english.py --reviewer-name Abdulmalik --apply
    uv run python database/load_retranscribed_english.py --pending            # exit 10 if work
    uv run python database/load_retranscribed_english.py --fix-encoding ...   # also mojibake

Each deploy runs the --apply form (deploy/*/release.sh) straight after the Mathematics loader,
after a backup, whenever --pending says there is anything left to load; once the bank matches
the files it is a no-op.

WHY THIS EXISTS. The English bank was filled by convert_jamb_english.py from the text layer of
a PDF: cloze passages cut off mid-option with the option lists left inside the prose, option
letters dropped, page headers inside passages, the italicised target word moved to the end of
the sentence, questions missed, and every curly quote and ellipsis stored as mojibake ("â€™",
"â€¦"). Explanations were short and many questions had none at all, so the coach had nothing to
put on the board. Each paper has since been transcribed again by hand, one year per file:

    docs/questions/utme/english/retranscribed_YYYY.yaml   stems, options, passages, skill
    docs/questions/utme/english/explanations_YYYY.yaml    our answer, 2-4 steps, a hint
    docs/questions/utme/english/lessons_YYYY.yaml         the board lesson: moments and traps

A year is loaded only when all three of its files exist, so a year still being written is
skipped rather than half-loaded. Questions are matched to the bank on (subject, exam_year,
question_number), which is how the bank identifies a past-paper question.

WHAT IT DOES, question by question (the same procedure as load_retranscribed_maths.py):

  - Approved, and stem, options, key, instructions and passage all as written: only the
    explanation is rewritten in place if it differs (017/018 allow that and keep the old one).
  - In the bank with anything different: a NEW version is written and approved, the question
    is pointed at it, and the old version is withdrawn with a report saying why. Approved
    content is immutable; the old version stays because a student's attempt may point at it.
  - A draft whose stem and options already read correctly: completed in place (key,
    explanation, instructions, passage) and approved.
  - Not in the bank at all (the extractor dropped it): created, levelled by
    propose_levels_english.propose, filed under the file's skill, and approved.
  - Marked `unrecoverable` in the file, printed with fewer than the four options the bank
    needs to approve a question, retired, or absent from the files: left alone.

The skill in the file is the question's primary classification; one filed elsewhere is moved in
place, as correct_english_questions.py does, because what a question is filed under is not
what it is.

PASSAGES. The bank's `passages` table has a title and a body and nothing else, so a passage's
`label` goes to passages.title and its `text` to passages.body (paragraphs kept as blank
lines). Directions live on the question version: question_versions.instructions takes the
question's own `instructions`, or the passage's when the question has none. A passage whose
text changed becomes a NEW passage row (a deterministic id from paper, passage id and text),
approved with its licence verified like the passages it replaces; the old row is not edited,
because withdrawn versions still point at it and must keep showing what was asked.

LESSONS go into question_lessons against the version each question ends up on, checked first:
exactly one answer moment, naming the same letter as the explanation, and a trap for every
wrong option.

--fix-encoding. Separately, and only when asked, repairs mojibake in English text the files do
not cover: every English passage in place (an encoding repair changes no word of it), and the
stem, instructions and options of any current version outside the files — a draft in place,
an approved version as a new version with the old one withdrawn. Each damaged run is re-read
as the UTF-8 it was (text.encode('cp1252').decode('utf-8'), run by run) and left alone if it
does not decode.

WHAT THE REVIEWER IS DECIDING. Approval here is one decision by the person named with
--reviewer or --reviewer-name: that the worked answers are our answers and the re-transcribed
wording is the paper's. Every row it writes says who made it.
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
from lesson_doodles import (
    check_all_used,
    check_doodle_files,
    clean_doodle,
    doodles_column,
    library_names,
    need_doodles_column,
    read_custom_doodles,
)
from lesson_marks import clean_points
from load_questions import content_hash, normalise, uuid_for
from propose_levels_english import propose

ROOT = Path(__file__).resolve().parent.parent
ENGLISH = ROOT / "docs" / "questions" / "utme" / "english"
#: Pictures drawn for a lesson's board, to make the question make sense: YYYY_qNN_x.svg
#: (lesson_doodles.py). A moment brings one in with `doodle: {name: custom:YYYY_qNN_x}`.
DOODLE_DIR = ENGLISH / "doodles"
SUBJECT = "ENG"
EXAMINATION = "UTME"
AUTHOR = "Hand re-transcription (UTME Use of English)"
SECONDS_BY_LEVEL = {1: 30, 2: 45, 3: 60, 4: 80, 5: 100}
OPTION_LETTERS = {"A", "B", "C", "D", "E"}

#: Said on every version this supersedes, so the reason is in the row and not only in a commit.
NOTE = (
    "Superseded by the hand re-transcription of the paper "
    "(docs/questions/utme/english/retranscribed_{year}.yaml): the automated import had "
    "garbled, cut or mis-encoded parts of this question."
)
ENCODING_NOTE = (
    "Superseded by an encoding repair (load_retranscribed_english.py --fix-encoding): the "
    "import had stored each curly quote and ellipsis as three characters of mojibake."
)


# --------------------------------------------------------------------------------------------
# Mojibake


#: The characters cp1252 puts at bytes 0x80-0x9F. With U+0080-U+00BF (the Latin-1 reading of
#: the bytes cp1252 leaves undefined, and of 0xA0-0xBF) they are what a UTF-8 continuation
#: byte turns into when the text is decoded as cp1252.
_CP1252_HIGH = bytes(range(0x80, 0xA0)).decode("cp1252", errors="ignore")
_LEAD = f"[{chr(0xC2)}-{chr(0xF4)}]"
_CONT = f"[{chr(0x80)}-{chr(0xBF)}" + re.escape(_CP1252_HIGH) + "]"
_RUN = re.compile(f"(?:{_LEAD}{_CONT}+)+")
_MARKERS = (chr(0xE2) + chr(0x20AC), chr(0xC3), chr(0xC2))  # the lead bytes of UTF-8, as cp1252


def _as_byte(char: str) -> bytes:
    try:
        return char.encode("cp1252")
    except UnicodeEncodeError:
        return bytes([ord(char)])  # a byte cp1252 leaves undefined came through as Latin-1


def fix_mojibake(text: str) -> str:
    """UTF-8 that was read as cp1252, read again as UTF-8. Anything else is left as it is.

    Run by run rather than on the whole string, so a string that also holds a correct curly
    quote or a Latin-1 letter (which cp1252 cannot encode, or which is not mojibake) keeps it.
    """
    if not any(marker in text for marker in _MARKERS):
        return text

    def repair(match: re.Match[str]) -> str:
        run = match.group(0)
        try:
            return b"".join(_as_byte(c) for c in run).decode("utf-8")
        except (UnicodeDecodeError, ValueError):
            return run

    return _RUN.sub(repair, text)


def has_mojibake(text: str | None) -> bool:
    return text is not None and fix_mojibake(text) != text


# --------------------------------------------------------------------------------------------
# Reading the files


def passage_body(text: str) -> str:
    """Paragraphs kept (one per blank-line-separated block), whitespace inside them collapsed."""
    paragraphs = [normalise(p) for p in re.split(r"\n", text.strip())]
    return "\n\n".join(p for p in paragraphs if p)


def years_ready() -> tuple[list[int], list[str]]:
    """Years with all three files, and a note for each year that is not complete yet."""
    ready: list[int] = []
    skipped: list[str] = []
    for path in sorted(ENGLISH.glob("retranscribed_*.yaml")):
        found = re.fullmatch(r"retranscribed_(\d{4})\.yaml", path.name)
        if not found:
            continue
        year = int(found.group(1))
        missing = [
            name
            for name in (f"explanations_{year}.yaml", f"lessons_{year}.yaml")
            if not (ENGLISH / name).is_file()
        ]
        if missing:
            skipped.append(f"{year} (no {', '.join(missing)} yet)")
        else:
            ready.append(year)
    return ready, skipped


def _load(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise SystemExit(f"{path.name}: not valid YAML: {error}") from error


def read_papers(
    years: list[int],
) -> tuple[list[dict[str, Any]], dict[tuple[int, str], dict[str, Any]], list[str]]:
    """Every re-transcribed question joined to its explanation, the passages, and skips."""
    questions: list[dict[str, Any]] = []
    passages: dict[tuple[int, str], dict[str, Any]] = {}
    unrecoverable: list[str] = []
    for year in years:
        paper = _load(ENGLISH / f"retranscribed_{year}.yaml")
        if int(paper["source"]["exam_year"]) != year:
            raise SystemExit(f"retranscribed_{year}.yaml says it is {paper['source']['exam_year']}")
        paper_code = str(paper["source"].get("paper_code") or f"UTME-{year}-ENG")
        explained = _load(ENGLISH / f"explanations_{year}.yaml")["explanations"] or {}
        for raw in paper.get("passages") or []:
            pid = str(raw["id"])
            label = normalise(str(raw.get("label") or "")) or None
            body = passage_body(str(raw.get("text") or ""))
            if not body:
                raise SystemExit(f"{year} passage {pid} has no text")
            digest = hashlib.sha256(f"{label}\n{body}".encode()).hexdigest()[:16]
            passages[(year, pid)] = {
                "id": uuid_for(f"passage:retranscribed:{paper_code}:{pid}:{digest}"),
                "title": label,
                "body": body,
                "instructions": normalise(str(raw.get("instructions") or "")) or None,
            }
        seen: set[int] = set()
        for raw in paper["questions"]:
            number = int(raw["number"])
            where = f"{year} Q{number}"
            if number in seen:
                raise SystemExit(f"{where} appears twice")
            seen.add(number)
            if raw.get("retire"):
                # Not a question at all: taken out of the bank by read_retirements below.
                continue
            if raw.get("unrecoverable"):
                unrecoverable.append(where)
                continue
            entry = explained.get(number) or explained.get(str(number))
            if not entry:
                raise SystemExit(f"{where} has no explanation")
            options = {str(k).upper(): normalise(str(v)) for k, v in raw["options"].items()}
            if not set(options) <= OPTION_LETTERS:
                raise SystemExit(f"{where}: options are lettered A-E")
            if len(options) < 4:
                # The paper printed fewer than four (a line lost in print, say). The bank
                # refuses to approve such a question, so it is left as it is, like an
                # unrecoverable one, and named so a person can look at it.
                unrecoverable.append(f"{where} (only {len(options)} options printed)")
                continue
            if any(not body for body in options.values()):
                raise SystemExit(f"{where}: an option is empty")
            answer = str(entry["answer"]).strip().upper()
            if answer not in options:
                raise SystemExit(f"{where}: answer {answer} is not an option")
            steps = [normalise(str(s)) for s in entry.get("steps") or []]
            hint = normalise(str(entry.get("hint") or ""))
            if not steps or not hint:
                raise SystemExit(f"{where}: an explanation needs steps and a hint")
            passage_key = raw.get("passage")
            passage = None
            if passage_key is not None:
                passage = passages.get((year, str(passage_key)))
                if passage is None:
                    raise SystemExit(f"{where}: passage {passage_key!r} is not in the file")
            instructions = normalise(str(raw.get("instructions") or "")) or (
                passage["instructions"] if passage else None
            )
            skill = str(raw.get("skill") or "").strip()
            if not skill:
                raise SystemExit(f"{where}: no skill")
            text = [raw["stem"], *options.values(), *steps, hint, instructions or ""]
            if any(has_mojibake(str(t)) for t in text):
                raise SystemExit(f"{where}: the file itself holds mojibake")
            questions.append(
                {
                    "year": year,
                    "number": number,
                    "paper_code": paper_code,
                    "stem": normalise(str(raw["stem"])),
                    "options": options,
                    "answer": answer,
                    "instructions": instructions,
                    "passage": passage,
                    "skill": skill,
                    "corrected": normalise(str(raw.get("corrected") or "")) or None,
                    "steps": steps,
                    "hint": hint,
                }
            )
    return questions, passages, unrecoverable


def read_retirements(years: list[int]) -> list[tuple[int, int, str]]:
    """Items the files mark `retire`: printed on the paper, but not a question to ask anyone.

    "Which question paper type of Use of English is given to you?" is an invigilator's
    instruction from the paper-based exam. It has no answer to work out from anything a student
    knows, so it teaches nothing and tells us nothing, and the only way to get it right is to
    guess. The loader retires each one (its reason from the file), which takes it out of every
    run and check-up while keeping the row for anyone who has already answered it.
    """
    found: list[tuple[int, int, str]] = []
    for year in years:
        paper = _load(ENGLISH / f"retranscribed_{year}.yaml")
        for raw in paper["questions"]:
            reason = raw.get("retire")
            if reason:
                found.append((year, int(raw["number"]), normalise(str(reason))))
    return found


def read_lessons(
    years: list[int], questions: list[dict[str, Any]]
) -> dict[tuple[int, int], dict[str, Any]]:
    """Every written lesson, checked against its question, keyed by year and question number.

    A malformed lesson stops the load with its address rather than being skipped: a lesson is
    played to students exactly as written, so one that is wrong has to be fixed.
    """
    by_key = {(q["year"], q["number"]): q for q in questions}
    found: dict[tuple[int, int], dict[str, Any]] = {}
    library = library_names()
    #: Every lesson written, loaded or not (one for an unloadable item still owns its doodles).
    written: set[tuple[int, int]] = set()
    for year in years:
        path = ENGLISH / f"lessons_{year}.yaml"
        doc = _load(path)
        if int(doc["exam_year"]) != year:
            raise SystemExit(f"{path.name} says it is {doc['exam_year']}")
        for number, lesson in (doc.get("lessons") or {}).items():
            where = f"{path.name} Q{number}"
            written.add((year, int(number)))
            q = by_key.get((year, int(number)))
            if q is None:
                # A lesson for an item the file marks unrecoverable has nothing to attach to.
                continue
            moments = lesson.get("moments") if isinstance(lesson, dict) else None
            if not isinstance(moments, list) or not moments:
                raise SystemExit(f"{where}: a lesson needs moments")
            # The pictures drawn for this question's board (lesson_doodles.py).
            doodles = read_custom_doodles(DOODLE_DIR, year, int(number))
            custom = {doodle["name"] for doodle in doodles}
            clean: list[dict[str, object]] = []
            for moment in moments:
                say = moment.get("say") if isinstance(moment, dict) else None
                if not isinstance(say, str) or not say.strip():
                    raise SystemExit(f"{where}: every moment needs something said")
                write = moment.get("write")
                if write is not None and (not isinstance(write, str) or not write.strip()):
                    raise SystemExit(f"{where}: a moment's write is a line on the board or nothing")
                entry: dict[str, object] = {"say": say.strip()}
                if write:
                    entry["write"] = write.strip()
                if moment.get("answer"):
                    entry["answer"] = True
                point = moment.get("point")
                if point is not None:
                    # The English papers carry no redrawn figures through this loader, so a mark
                    # on a diagram is checked for its shape only (lesson_marks.py). A mark in the
                    # passage is checked against the passage's text, as it is stored.
                    entry["point"] = clean_points(
                        point,
                        len(clean),
                        f"{where} moment {len(clean)}",
                        passage=q["passage"]["body"] if q["passage"] else None,
                    )
                if moment.get("doodle") is not None:
                    entry["doodle"] = clean_doodle(
                        moment["doodle"],
                        len(clean),
                        [bool(m.get("write")) for m in clean] + [bool(write)],
                        library,
                        custom,
                        year,
                        int(number),
                        f"{where} moment {len(clean)}",
                    )
                clean.append(entry)
            check_all_used(doodles, clean, where)
            answers = [m for m in clean if m.get("answer")]
            if len(answers) != 1:
                raise SystemExit(f"{where}: exactly one moment is the answer, found {len(answers)}")
            said = re.search(r"answer choice ([A-E])\b", str(answers[0]["say"]))
            if not said or said.group(1) != q["answer"]:
                raise SystemExit(
                    f"{where}: the answer moment must say 'answer choice {q['answer']}', "
                    "the explanation's answer"
                )
            traps = lesson.get("traps") or {}
            if not isinstance(traps, dict) or not {str(k) for k in traps} <= OPTION_LETTERS:
                raise SystemExit(f"{where}: traps are keyed by option letter")
            traps = {str(k): str(v).strip() for k, v in traps.items()}
            wrong = set(q["options"]) - {q["answer"]}
            if set(traps) != wrong:
                raise SystemExit(
                    f"{where}: traps must cover exactly the wrong options {sorted(wrong)}, "
                    f"found {sorted(traps)}"
                )
            everything = [str(m["say"]) + str(m.get("write") or "") for m in clean]
            if any(has_mojibake(t) for t in everything + list(traps.values())):
                raise SystemExit(f"{where}: the lesson holds mojibake")
            found[(year, int(number))] = {
                "moments": clean,
                "traps": traps,
                "doodles": doodles,
                "file": path.relative_to(ROOT).as_posix(),
            }
    check_doodle_files(DOODLE_DIR, written)
    return found


def version_hash(q: dict[str, Any]) -> str:
    """Everything that defines the question, so a new version never repeats an old one's hash.

    content_hash(stem, options) alone would collide whenever only the key, the directions or
    the passage changed, and the bank refuses two versions of one question with one hash.
    """
    passage = q["passage"] or {}
    extra = json.dumps(
        [q["answer"], q["instructions"], passage.get("title"), passage.get("body")],
        ensure_ascii=False,
    )
    return content_hash(q["stem"] + "\n" + extra, q["options"])


# --------------------------------------------------------------------------------------------
# The database


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
    if args.reviewer:
        row = await conn.fetchrow(
            "SELECT id, display_name FROM academic_reviewers WHERE id = $1 AND active",
            args.reviewer,
        )
        if row is None:
            raise SystemExit("no active reviewer with that id")
        return row["id"], row["display_name"], False
    if args.reviewer_name:
        # By name, so a deploy can say who approves without anyone looking up an id on each
        # server. Two active reviewers with one name is ambiguous and refused.
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


async def lessons_to_load(
    conn: asyncpg.Connection, subject_id: object, lessons: dict[tuple[int, int], dict[str, Any]]
) -> list[tuple[object, dict[str, Any]]]:
    """The lessons whose question's current version does not already carry them as written."""
    work: list[tuple[object, dict[str, Any]]] = []
    for (year, number), lesson in lessons.items():
        row = await conn.fetchrow(
            """
            SELECT q.current_version_id AS version_id, l.moments, l.traps,
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
            # Read whether or not migration 027 has added the column yet: absent reads as none.
            and json.loads(row["doodles"] or "[]") == lesson["doodles"]
        )
        if not same:
            work.append((row["version_id"], lesson))
    return work


async def options_of(conn: asyncpg.Connection, version_id: object) -> tuple[dict[str, str], Any]:
    rows = await conn.fetch(
        "SELECT option_key, body, is_correct FROM question_options WHERE question_version_id = $1",
        version_id,
    )
    key = next((r["option_key"] for r in rows if r["is_correct"]), None)
    return {r["option_key"]: r["body"] for r in rows}, key


async def encoding_work(
    conn: asyncpg.Connection, subject_id: object, covered: set[tuple[int, str]]
) -> tuple[list[dict[str, Any]], list[asyncpg.Record]]:
    """Versions outside the files, and English passages, that still hold mojibake."""
    versions: list[dict[str, Any]] = []
    rows = await conn.fetch(
        """
        SELECT q.exam_year, q.question_number, v.*,
               (SELECT max(version) FROM question_versions WHERE question_id = q.id)
                 AS top_version
        FROM questions q JOIN question_versions v ON v.id = q.current_version_id
        WHERE q.subject_id = $1 AND q.retired_at IS NULL
          AND v.review_status IN ('draft', 'pending', 'approved')
        ORDER BY q.exam_year, q.question_number
        """,
        subject_id,
    )
    for row in rows:
        if (int(row["exam_year"]), str(row["question_number"])) in covered:
            continue
        options, key = await options_of(conn, row["id"])
        fixed_options = {k: fix_mojibake(v) for k, v in options.items()}
        stem = fix_mojibake(row["stem"])
        instructions = fix_mojibake(row["instructions"]) if row["instructions"] else None
        if (stem, instructions, fixed_options) != (row["stem"], row["instructions"], options):
            versions.append(
                {
                    "row": row,
                    "key": key,
                    "stem": stem,
                    "instructions": instructions,
                    "options": fixed_options,
                }
            )
    passages = [
        p
        for p in await conn.fetch(
            "SELECT id, title, body FROM passages WHERE subject_id = $1", subject_id
        )
        if has_mojibake(p["body"]) or has_mojibake(p["title"])
    ]
    return versions, passages


async def approve(conn: asyncpg.Connection, version_id: object, reviewer_id: object) -> None:
    await conn.execute(
        """
        UPDATE question_versions
           SET review_status = 'approved', reviewed_by = $2, reviewed_at = now()
         WHERE id = $1
        """,
        version_id,
        reviewer_id,
    )


async def supersede(
    conn: asyncpg.Connection,
    question_id: object,
    old_version_id: object,
    new_version_id: object,
    new_version: int,
    reviewer_id: object,
    detail: str,
) -> None:
    """Point the question at the new version, approve it, and withdraw the old one."""
    # Point the question at the new version BEFORE withdrawing the old one, so the question
    # is never momentarily without a deliverable version.
    await conn.execute(
        "UPDATE questions SET current_version_id = $2, updated_at = now() WHERE id = $1",
        question_id,
        new_version_id,
    )
    await approve(conn, new_version_id, reviewer_id)
    await conn.execute(
        "UPDATE question_versions SET review_status = 'withdrawn' WHERE id = $1",
        old_version_id,
    )
    await conn.execute(
        """
        INSERT INTO question_reports (question_version_id, reporter_kind, reason,
          detail, status, resolved_by, resolved_at, resolution_note)
        VALUES ($1, 'system', 'other', $2, 'fixed', $3, now(), $4)
        """,
        old_version_id,
        detail,
        reviewer_id,
        f"Superseded by version {new_version}.",
    )


async def insert_options(
    conn: asyncpg.Connection,
    version_id: object,
    subject_id: object,
    options: dict[str, str],
    answer: str | None,
) -> None:
    for order, (letter, body) in enumerate(sorted(options.items()), 1):
        await conn.execute(
            """
            INSERT INTO question_options (question_version_id, subject_id,
              option_key, body, is_correct, display_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            version_id,
            subject_id,
            letter,
            body,
            letter == answer,
            order,
        )


def _same_passage(row: asyncpg.Record, passage: dict[str, Any] | None) -> bool:
    if passage is None:
        return row["passage_id"] is None
    if row["passage_id"] is None:
        return False
    return (
        normalise(row["passage_title"] or "") == normalise(passage["title"] or "")
        and passage_body(row["passage_body"] or "") == passage["body"]
    )


async def run(args: argparse.Namespace) -> int:
    years, not_ready = years_ready()
    questions, _, unrecoverable = read_papers(years)
    retirements = read_retirements(years)
    lessons = read_lessons(years, questions)

    conn = await connect(args)
    try:
        reviewer_id, reviewer_name, new_reviewer = await resolve_reviewer(conn, args)
        subject_id = await conn.fetchval(
            """
            SELECT s.id FROM subjects s JOIN examinations e ON e.id = s.examination_id
            WHERE s.code = $1 AND e.short_name = $2
            """,
            SUBJECT,
            EXAMINATION,
        )
        if subject_id is None:
            raise SystemExit(f"no {EXAMINATION} subject with code {SUBJECT}")

        # Where each year's questions live: a new question joins its paper's existing ones.
        papers = {
            row["exam_year"]: row
            for row in await conn.fetch(
                """
                SELECT DISTINCT ON (q.exam_year) q.exam_year, q.paper_code, q.source_document_id,
                       q.exam_paper_id, q.import_batch_id, q.usage_pool
                FROM questions q WHERE q.subject_id = $1
                ORDER BY q.exam_year, q.created_at
                """,
                subject_id,
            )
        }
        syllabus_version_id = await conn.fetchval(
            """
            SELECT c.syllabus_version_id FROM question_classifications c
            WHERE c.subject_id = $1 AND c.review_status = 'approved'
            GROUP BY 1 ORDER BY count(*) DESC LIMIT 1
            """,
            subject_id,
        )
        skills = {
            row["code"]: row["id"]
            for row in await conn.fetch(
                """
                SELECT ci.code, ci.id FROM curriculum_items ci
                WHERE ci.syllabus_version_id = $1 AND ci.item_type = 'skill'
                """,
                syllabus_version_id,
            )
        }
        unknown = sorted({q["skill"] for q in questions} - set(skills))
        if unknown:
            raise SystemExit(f"skills not in the English syllabus: {', '.join(unknown)}")

        everything = {
            (row["exam_year"], str(row["question_number"])): row
            for row in await conn.fetch(
                """
                SELECT q.id AS question_id, q.exam_year, q.question_number, q.retired_at,
                       v.id AS version_id, v.stem, v.instructions, v.passage_id,
                       v.review_status, v.marks, v.expected_seconds, v.mastery_level_number,
                       v.solution_steps, v.hints, v.solution_source,
                       p.title AS passage_title, p.body AS passage_body,
                       c.curriculum_item_id AS primary_skill,
                       (SELECT max(version) FROM question_versions WHERE question_id = q.id)
                         AS top_version
                FROM questions q
                JOIN question_versions v ON v.id = q.current_version_id
                LEFT JOIN passages p ON p.id = v.passage_id
                LEFT JOIN question_classifications c
                  ON c.question_id = q.id AND c.classification_role = 'primary'
                WHERE q.subject_id = $1
                """,
                subject_id,
            )
        }

        plan: dict[str, list[Any]] = {
            k: [] for k in ("explain", "revise", "create", "complete", "same", "left")
        }
        reclassify: list[tuple[dict[str, Any], asyncpg.Record]] = []
        for q in questions:
            row = everything.get((q["year"], str(q["number"])))
            if row is None:
                if q["year"] not in papers:
                    raise SystemExit(f"no {q['year']} paper in the bank to add Q{q['number']} to")
                plan["create"].append((q, None))
                continue
            if row["retired_at"] is not None or row["review_status"] not in (
                "draft",
                "pending",
                "approved",
            ):
                # Retired (a reading-text question, say) or withdrawn: someone decided that,
                # and a re-transcription is not the place to reverse it.
                plan["left"].append((q, row))
                continue
            if skills[q["skill"]] != row["primary_skill"]:
                reclassify.append((q, row))
            options, key = await options_of(conn, row["version_id"])
            same_text = (
                normalise(row["stem"]) == q["stem"]
                and {k: normalise(v) for k, v in options.items()} == q["options"]
            )
            same_rest = (
                normalise(row["instructions"] or "") == (q["instructions"] or "")
                and _same_passage(row, q["passage"])
                and key == q["answer"]
            )
            if row["review_status"] != "approved" and same_text:
                # The import read this one correctly. A new version would repeat its content,
                # which the bank refuses; the draft is completed and approved instead.
                plan["complete"].append((q, row))
            elif not (row["review_status"] == "approved" and same_text and same_rest):
                plan["revise"].append((q, row))
            elif (
                json.loads(row["solution_steps"] or "[]") != q["steps"]
                or json.loads(row["hints"] or "[]") != [q["hint"]]
                or row["solution_source"] != "expert_verified"
            ):
                plan["explain"].append((q, row))
            else:
                plan["same"].append((q, row))

        # Items the files say are not questions, still live in the bank: retired below.
        to_retire = [
            (year, number, reason, row)
            for year, number, reason in retirements
            if (row := everything.get((year, str(number)))) is not None
            and row["retired_at"] is None
        ]

        covered = {(q["year"], str(q["number"])) for q in questions}
        enc_versions: list[dict[str, Any]] = []
        enc_passages: list[asyncpg.Record] = []
        if args.fix_encoding:
            enc_versions, enc_passages = await encoding_work(conn, subject_id, covered)

        print(f"English years loaded from files: {', '.join(map(str, years)) or 'none'}.")
        if not_ready:
            print(f"Not yet complete, skipped: {'; '.join(not_ready)}.")
        print(
            f"{len(questions)} questions re-transcribed, {len(unrecoverable)} unrecoverable "
            "(left as they are in the bank)."
        )
        if unrecoverable:
            print("    left: " + ", ".join(unrecoverable))
        print(f"  {len(plan['revise'])} corrected as a new version, approved")
        print(f"  {len(plan['create'])} not in the bank yet: created, approved")
        print(f"  {len(plan['complete'])} drafts already read correctly: completed, approved")
        print(f"  {len(plan['explain'])} unchanged but for the explanation: rewritten in place")
        print(f"  {len(plan['same'])} already exactly as written")
        print(f"  {len(reclassify)} filed under a different skill: moved")
        if plan["left"]:
            print(
                f"  {len(plan['left'])} retired or withdrawn in the bank: left alone ("
                + ", ".join(f"{q['year']} Q{q['number']}" for q, _ in plan["left"])
                + ")"
            )
        if plan["create"]:
            print("    new: " + ", ".join(f"{q['year']} Q{q['number']}" for q, _ in plan["create"]))
        print(
            f"  {len(to_retire)} not to be asked (`retire` in the files, with a reason): retired"
            + (" (" + ", ".join(f"{y} Q{n}" for y, n, _, _ in to_retire) + ")" if to_retire else "")
        )
        lesson_work = await lessons_to_load(conn, subject_id, lessons)
        print(f"  {len(lessons)} written lessons, {len(lesson_work)} to load or update")
        if args.fix_encoding:
            print(
                f"Encoding: {len(enc_versions)} version(s) outside the files and "
                f"{len(enc_passages)} passage(s) still hold mojibake."
            )
            for item in enc_versions[:12]:
                r = item["row"]
                print(f"    {r['exam_year']} Q{r['question_number']} ({r['review_status']})")
        pending = sum(len(plan[k]) for k in ("revise", "create", "complete", "explain"))
        pending += len(reclassify) + len(lesson_work) + len(enc_versions) + len(enc_passages)
        pending += len(to_retire)
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

            for _, _, reason, row in to_retire:
                await conn.execute(
                    "UPDATE questions SET retired_at = now(), retired_reason = $2, "
                    "updated_at = now() WHERE id = $1",
                    row["question_id"],
                    reason,
                )
                # A retired question's version must not read "approved".
                await conn.execute(
                    "UPDATE question_versions SET review_status = 'withdrawn' "
                    "WHERE id = $1 AND review_status = 'approved'",
                    row["version_id"],
                )

            # Passages first: a version can only be approved on an approved passage.
            async def passage_for(q: dict[str, Any], row: asyncpg.Record | None) -> object:
                passage = q["passage"]
                if passage is None:
                    return None
                if row is not None and _same_passage(row, passage):
                    return row["passage_id"]
                paper = papers[q["year"]]
                await conn.execute(
                    """
                    INSERT INTO passages (id, subject_id, source_document_id, title, body,
                      passage_type, licence_status, review_status, reviewed_by, reviewed_at)
                    VALUES ($1, $2, $3, $4, $5, 'prose', 'verified', 'approved', $6, now())
                    ON CONFLICT (id) DO NOTHING
                    """,
                    passage["id"],
                    subject_id,
                    paper["source_document_id"],
                    passage["title"],
                    passage["body"],
                    reviewer_id,
                )
                return passage["id"]

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

            for q, row in plan["create"] + plan["revise"]:
                paper = papers[q["year"]]
                proposal = {
                    "proposed_skill": q["skill"],
                    "proposed_answer": q["answer"],
                    "options": q["options"],
                    "stem": q["stem"],
                }
                if row is None:
                    question_id = uuid_for(
                        f"question:retranscribed:{paper['paper_code']}:{q['number']}"
                    )
                    await conn.execute(
                        """
                        INSERT INTO questions (id, subject_id, exam_paper_id, origin,
                          source_document_id, exam_year, paper_code, question_number,
                          import_batch_id, usage_pool, created_by)
                        VALUES ($1, $2, $3, 'past_paper', $4, $5, $6, $7, $8, $9, $10)
                        """,
                        question_id,
                        subject_id,
                        paper["exam_paper_id"],
                        paper["source_document_id"],
                        q["year"],
                        paper["paper_code"],
                        str(q["number"]),
                        paper["import_batch_id"],
                        paper["usage_pool"],
                        author_id,
                    )
                    level, _ = propose(proposal)
                    version, marks = 1, None
                    seconds = SECONDS_BY_LEVEL[level]
                else:
                    question_id = row["question_id"]
                    level = row["mastery_level_number"] or propose(proposal)[0]
                    version, marks = int(row["top_version"]) + 1, row["marks"]
                    seconds = row["expected_seconds"] or SECONDS_BY_LEVEL[level]
                passage_id = await passage_for(q, row)
                version_id = await conn.fetchval(
                    """
                    INSERT INTO question_versions (question_id, subject_id, version, stem,
                      instructions, passage_id, response_format, marking_method,
                      solution_steps, hints, marks, expected_seconds, option_count,
                      content_hash, authored_by, answer_source, answer_confidence,
                      mastery_level_number, level_source, level_confidence, solution_source,
                      review_status)
                    VALUES ($1, $2, $3, $4, $5, $6, 'mcq_single', 'auto_key', $7::jsonb,
                      $8::jsonb, $9, $10, $11, $12, $13, 'expert_verified', 'medium', $14,
                      'expert_verified', 'low', 'expert_verified', 'draft')
                    RETURNING id
                    """,
                    question_id,
                    subject_id,
                    version,
                    q["stem"],
                    q["instructions"],
                    passage_id,
                    json.dumps(q["steps"]),
                    json.dumps([q["hint"]]),
                    marks,
                    seconds,
                    len(q["options"]),
                    version_hash(q),
                    author_id,
                    level,
                )
                await insert_options(conn, version_id, subject_id, q["options"], q["answer"])
                if row is None:
                    await conn.execute(
                        """
                        INSERT INTO question_classifications (question_id, subject_id,
                          curriculum_item_id, syllabus_version_id, classification_role,
                          proposed_by, confidence, classification_reason, review_status,
                          reviewed_by, reviewed_at)
                        VALUES ($1, $2, $3, $4, 'primary', 'model', 0.5, $5, 'approved', $6,
                          now())
                        """,
                        question_id,
                        subject_id,
                        skills[q["skill"]],
                        syllabus_version_id,
                        "Skill given in the hand re-transcription.",
                        reviewer_id,
                    )
                    await conn.execute(
                        "UPDATE questions SET current_version_id = $2, updated_at = now() "
                        "WHERE id = $1",
                        question_id,
                        version_id,
                    )
                    await approve(conn, version_id, reviewer_id)
                else:
                    detail = NOTE.format(year=q["year"])
                    if q["corrected"]:
                        detail += " What was repaired: " + q["corrected"]
                    await supersede(
                        conn,
                        question_id,
                        row["version_id"],
                        version_id,
                        version,
                        reviewer_id,
                        detail,
                    )

            for q, row in plan["complete"]:
                version_id = row["version_id"]
                level = (
                    row["mastery_level_number"]
                    or propose(
                        {
                            "proposed_skill": q["skill"],
                            "proposed_answer": q["answer"],
                            "options": q["options"],
                            "stem": q["stem"],
                        }
                    )[0]
                )
                passage_id = await passage_for(q, row)
                # Two statements: at most one correct option is enforced row by row, so the old key
                # has to be cleared before the new one is set.
                await conn.execute(
                    "UPDATE question_options SET is_correct = false WHERE question_version_id = $1",
                    version_id,
                )
                await conn.execute(
                    "UPDATE question_options SET is_correct = true "
                    "WHERE question_version_id = $1 AND option_key = $2",
                    version_id,
                    q["answer"],
                )
                await conn.execute(
                    """
                    UPDATE question_versions
                       SET instructions = $2, passage_id = $3,
                           solution_steps = $4::jsonb, hints = $5::jsonb,
                           solution_source = 'expert_verified', answer_source = 'expert_verified',
                           answer_confidence = 'medium', mastery_level_number = $6,
                           level_source = 'expert_verified', level_confidence = 'low',
                           expected_seconds = coalesce(expected_seconds, $7),
                           authored_by = coalesce(authored_by, $8)
                     WHERE id = $1
                    """,
                    version_id,
                    q["instructions"],
                    passage_id,
                    json.dumps(q["steps"]),
                    json.dumps([q["hint"]]),
                    level,
                    SECONDS_BY_LEVEL[level],
                    author_id,
                )
                await approve(conn, version_id, reviewer_id)

            for q, row in reclassify:
                await conn.execute(
                    """
                    UPDATE question_classifications
                       SET curriculum_item_id = $2, classification_reason = $3,
                           review_status = 'approved', reviewed_by = $4, reviewed_at = now()
                     WHERE question_id = $1 AND classification_role = 'primary'
                    """,
                    row["question_id"],
                    skills[q["skill"]],
                    f"Filed under {q['skill']} by the hand re-transcription.",
                    reviewer_id,
                )

            # Encoding repair, outside the files. Passages in place: the words are unchanged.
            for p in enc_passages:
                await conn.execute(
                    "UPDATE passages SET title = $2, body = $3 WHERE id = $1",
                    p["id"],
                    fix_mojibake(p["title"]) if p["title"] else None,
                    fix_mojibake(p["body"]),
                )
            for item in enc_versions:
                await repair_version(conn, subject_id, item, reviewer_id)

        # After the questions, because a lesson belongs to the version a question is ON, and
        # the corrections above may just have moved it.
        lesson_work = await lessons_to_load(conn, subject_id, lessons)
        # The doodles need migration 027; a database without it takes lessons with none.
        with_doodles = await doodles_column(conn)
        need_doodles_column(with_doodles, lesson_work)
        async with conn.transaction():
            for version_id, lesson in lesson_work:
                await conn.execute(
                    """
                    INSERT INTO question_lessons (question_version_id, moments, traps,
                      source_file)
                    VALUES ($1, $2::jsonb, $3::jsonb, $4)
                    ON CONFLICT (question_version_id) DO UPDATE
                      SET moments = EXCLUDED.moments, traps = EXCLUDED.traps,
                          source_file = EXCLUDED.source_file, updated_at = now()
                    """,
                    version_id,
                    json.dumps(lesson["moments"]),
                    json.dumps(lesson["traps"]),
                    lesson["file"],
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
            "SELECT count(*) FROM deliverable_questions WHERE subject_id = $1", subject_id
        )
        print(f"\nDone. {deliverable} Use of English questions deliverable.")
        return 0
    finally:
        await conn.close()


async def repair_version(
    conn: asyncpg.Connection, subject_id: object, item: dict[str, Any], reviewer_id: object
) -> None:
    """Mojibake out of one version outside the files: a draft in place, else a new version."""
    row = item["row"]
    fixed_hash = content_hash(item["stem"], item["options"])
    if row["review_status"] != "approved":
        await conn.execute(
            "UPDATE question_versions SET stem = $2, instructions = $3, content_hash = $4 "
            "WHERE id = $1",
            row["id"],
            item["stem"],
            item["instructions"],
            fixed_hash,
        )
        for letter, body in item["options"].items():
            await conn.execute(
                "UPDATE question_options SET body = $3 "
                "WHERE question_version_id = $1 AND option_key = $2",
                row["id"],
                letter,
                body,
            )
        return
    version = int(row["top_version"]) + 1
    steps = [fix_mojibake(str(s)) for s in json.loads(row["solution_steps"] or "[]")]
    hints = [fix_mojibake(str(h)) for h in json.loads(row["hints"] or "[]")]
    version_id = await conn.fetchval(
        """
        INSERT INTO question_versions (question_id, subject_id, version, stem, instructions,
          passage_id, response_format, marking_method, solution_steps, hints, marks,
          expected_seconds, option_count, content_hash, authored_by, answer_source,
          answer_confidence, mastery_level_number, level_source, level_confidence,
          solution_source, review_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, 'draft')
        RETURNING id
        """,
        row["question_id"],
        subject_id,
        version,
        item["stem"],
        item["instructions"],
        row["passage_id"],
        row["response_format"],
        row["marking_method"],
        json.dumps(steps),
        json.dumps(hints),
        row["marks"],
        row["expected_seconds"],
        len(item["options"]),
        fixed_hash,
        row["authored_by"],
        row["answer_source"],
        row["answer_confidence"],
        row["mastery_level_number"],
        row["level_source"],
        row["level_confidence"],
        row["solution_source"],
    )
    await insert_options(conn, version_id, subject_id, item["options"], item["key"])
    # A lesson belongs to the version; carry it to the repaired one.
    await conn.execute(
        """
        INSERT INTO question_lessons (question_version_id, moments, traps, source_file)
        SELECT $2, moments, traps, source_file FROM question_lessons
         WHERE question_version_id = $1
        ON CONFLICT (question_version_id) DO NOTHING
        """,
        row["id"],
        version_id,
    )
    await supersede(
        conn, row["question_id"], row["id"], version_id, version, reviewer_id, ENCODING_NOTE
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
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
        "--fix-encoding",
        action="store_true",
        help="Also repair mojibake in English text the re-transcription files do not cover",
    )
    args = parser.parse_args()
    if args.apply and not (args.reviewer or args.reviewer_name):
        parser.error("--apply needs --reviewer or --reviewer-name: approval is a person's")
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
