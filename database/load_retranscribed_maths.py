#!/usr/bin/env python3
"""Put the hand re-transcription of UTME Mathematics into the bank, approved.

    uv run python database/load_retranscribed_maths.py --reviewer <academic_reviewers.id>
    uv run python database/load_retranscribed_maths.py --reviewer <id> --apply
    uv run python database/load_retranscribed_maths.py --reviewer-name Abdulmalik --apply

Each deploy runs the last form (deploy/*/release.sh), after a backup, whenever --pending
says there is anything left to load; once the bank matches, it is a no-op.

WHY THIS EXISTS. The Mathematics bank was filled by convert_jamb_maths.py, which read the text
layer of a PDF that mangles mathematics: degree signs as zeros, powers flattened, options cut
off, 137 questions missed outright. Every paper from 1983 to 2004 has since been transcribed
again by hand into retranscribed_YYYY.yaml, in LaTeX, with figures redrawn as SVG, and each
question worked out in explanations_YYYY.yaml. Both are keyed on year and question number,
which is also how the bank identifies a past-paper question, so that is how they are matched.

WHAT IT DOES, question by question:

  - Already in the bank with this exact stem, options and key: only the explanation is
    replaced, in place. 017 allows that on an approved question, and keeps the old text.
  - In the bank with anything different: a NEW version is written and approved, the question
    is pointed at it, and the old version is withdrawn with a report saying why. Approved
    content is immutable by design, so a correction is always a new version; the old one
    stays because a student's attempt may point at it. This is correct_english_questions.py's
    procedure, for the same reason.
  - Not in the bank at all: the question is created, classified by reclassify_maths.classify
    and levelled by propose_levels_maths.propose, and approved.

WHAT THE REVIEWER IS DECIDING. Approval here is one decision by the person named with
--reviewer: that the worked answers are our answers, that the figures' descriptions (the
aria-label each SVG was drawn with) describe them, and that the redrawn figures may be shown.
It is the decision publish_utme_questions.py records for keys, extended to figures, and every
row it writes says who made it. Four questions carry an `uncertain` note — a reading chosen
where the print is damaged — and each gets an open report so it can still be checked against
the paper after it is live.

Figures are written as SVG files beside the transcription (figures/svg/YYYY_qNN.svg), because
an asset row points at a file in the repository, not at text inside a YAML file.

Re-running is safe: a question already carrying exactly this content is left alone.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

import asyncpg
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_questions import content_hash, normalise, uuid_for
from propose_levels_maths import propose
from reclassify_maths import FALLBACK, classify

ROOT = Path(__file__).resolve().parent.parent
MATHS = ROOT / "docs" / "questions" / "utme" / "mathematics"
SVG_DIR = MATHS / "figures" / "svg"
SUBJECT = "MATH"
EXAMINATION = "UTME"
AUTHOR = "Hand re-transcription (UTME Mathematics)"
SECONDS_BY_LEVEL = {1: 30, 2: 45, 3: 60, 4: 80, 5: 100}

#: Said on every version this supersedes, so the reason is in the row and not only in a commit.
NOTE = (
    "Superseded by the hand re-transcription of the paper "
    "(docs/questions/utme/mathematics/retranscribed_{year}.yaml): the automated import had "
    "mangled or missed parts of this question."
)


def svg_path(year: int, number: int) -> Path:
    return SVG_DIR / f"{year}_q{number:02d}.svg"


def read_papers() -> list[dict]:
    """Every re-transcribed question, joined to its explanation."""
    questions: list[dict] = []
    for path in sorted(MATHS.glob("retranscribed_*.yaml")):
        paper = yaml.safe_load(path.read_text(encoding="utf-8"))
        year = int(paper["source"]["exam_year"])
        explained = yaml.safe_load(
            (MATHS / f"explanations_{year}.yaml").read_text(encoding="utf-8")
        )["explanations"]
        for raw in paper["questions"]:
            number = int(raw["number"])
            entry = explained.get(number) or explained.get(str(number))
            if not entry:
                raise SystemExit(f"{year} Q{number} has no explanation")
            options = {k: normalise(str(v)) for k, v in raw["options"].items()}
            answer = str(entry["answer"]).strip().upper()
            if answer not in options:
                raise SystemExit(f"{year} Q{number}: answer {answer} is not an option")
            svg = raw.get("figure_svg")
            label = None
            if svg:
                found = re.search(r'aria-label="([^"]+)"', svg)
                if not found:
                    raise SystemExit(f"{year} Q{number}: figure has no aria-label to describe it")
                label = found.group(1)
            questions.append(
                {
                    "year": year,
                    "number": number,
                    "stem": normalise(str(raw["stem"])),
                    "options": options,
                    "answer": answer,
                    "steps": [str(s) for s in entry["steps"]],
                    "hint": str(entry["hint"]).strip(),
                    "svg": svg,
                    "alt_text": label,
                    "uncertain": raw.get("uncertain"),
                }
            )
    return questions


def export_figures(questions: list[dict]) -> int:
    """Write each figure to its own file, with a PNG copy beside it. Returns how many changed.

    The SVG is what a student is shown. Inline in a page it needs no namespace, but as a file
    loaded through <img> a browser refuses it without one, so the namespace is added here.

    The PNG is for the coach: the model is sent the figure as a picture and does not take SVG.
    Rendering needs resvg, which the app itself never does, so this step alone asks for it:

        uv run --with resvg-py python database/load_retranscribed_maths.py --export-figures
    """
    import resvg_py  # type: ignore[import-not-found]

    SVG_DIR.mkdir(parents=True, exist_ok=True)
    changed = 0
    for q in questions:
        if not q["svg"]:
            continue
        path = svg_path(q["year"], q["number"])
        text = q["svg"].strip()
        if "xmlns=" not in text.split(">", 1)[0]:
            text = text.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
        text += "\n"
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8", newline="\n")
            changed += 1
        png = path.with_suffix(".png")
        if not png.exists() or png.stat().st_mtime < path.stat().st_mtime:
            # Twice the drawn size, on white: the figures are dark ink on no background.
            width, _ = svg_size(text)
            png.write_bytes(
                bytes(
                    resvg_py.svg_to_bytes(
                        svg_string=text, background="white", width=(width or 320) * 2
                    )
                )
            )
    return changed


def svg_size(text: str) -> tuple[int | None, int | None]:
    width = re.search(r'\bwidth="(\d+)', text)
    height = re.search(r'\bheight="(\d+)', text)
    return (int(width.group(1)) if width else None, int(height.group(1)) if height else None)


async def add_figure(conn: asyncpg.Connection, version_id: object, q: dict, reviewer: str) -> None:
    """Attach the redrawn figure, described by the aria-label it was drawn with."""
    if not q["svg"]:
        return
    path = svg_path(q["year"], q["number"])
    width, height = svg_size(q["svg"])
    await conn.execute(
        """
        INSERT INTO question_assets (question_version_id, storage_uri, mime_type, byte_size,
          width, height, alt_text, alt_text_source, source_location, licence_status,
          display_order)
        VALUES ($1, $2, 'image/svg+xml', $3, $4, $5, $6, 'expert_verified', $7, 'verified', 0)
        """,
        version_id,
        path.relative_to(ROOT).as_posix(),
        path.stat().st_size,
        width,
        height,
        q["alt_text"],
        f"Redrawn by hand from MATHEMATICS-questions.pdf, {q['year']} Q{q['number']}; "
        f"description confirmed by {reviewer}.",
    )


async def report_uncertain(conn: asyncpg.Connection, version_id: object, q: dict) -> None:
    """A reading of damaged print stays open for checking against the paper, though live."""
    if not q["uncertain"]:
        return
    await conn.execute(
        """
        INSERT INTO question_reports (question_version_id, reporter_kind, reason, detail, status)
        VALUES ($1, 'system', 'other', $2, 'open')
        """,
        version_id,
        "Approved on a reading of damaged print; check against the paper: "
        + normalise(str(q["uncertain"])),
    )


async def run(args: argparse.Namespace) -> int:
    questions = read_papers()
    if args.export_figures:
        print(f"{export_figures(questions)} figure file(s) written to {SVG_DIR.relative_to(ROOT)}.")
        return 0
    missing_files = [
        q for q in questions if q["svg"] and not svg_path(q["year"], q["number"]).is_file()
    ]
    if missing_files:
        raise SystemExit(
            f"{len(missing_files)} figure files are missing; run with --export-figures first"
        )

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
    try:
        await conn.execute("SET search_path = stackprep, public")
        new_reviewer = False
        if args.reviewer:
            reviewer = await conn.fetchrow(
                "SELECT id, display_name FROM academic_reviewers WHERE id = $1 AND active",
                args.reviewer,
            )
            if reviewer is None:
                raise SystemExit("no active reviewer with that id")
            reviewer_id, reviewer_name = reviewer["id"], reviewer["display_name"]
        elif args.reviewer_name:
            # By name, so a deploy can say who approves without anyone looking up an id on
            # each server. Two active reviewers with one name is ambiguous and refused.
            found = await conn.fetch(
                "SELECT id FROM academic_reviewers WHERE display_name = $1 AND active",
                args.reviewer_name,
            )
            if len(found) > 1:
                raise SystemExit(f"{len(found)} active reviewers are called {args.reviewer_name}")
            reviewer_name = args.reviewer_name
            if found:
                reviewer_id = found[0]["id"]
            else:
                reviewer_id, new_reviewer = uuid_for(f"reviewer:{reviewer_name}"), True
        else:
            reviewer_id, reviewer_name = None, "nobody (checking only)"
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
            WHERE c.subject_id = $1 AND c.review_status = 'approved' LIMIT 1
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
        current = {
            (row["exam_year"], str(row["question_number"])): row
            for row in await conn.fetch(
                """
                SELECT q.id AS question_id, q.exam_year, q.question_number,
                       v.id AS version_id, v.stem, v.review_status, v.marks,
                       v.expected_seconds, v.mastery_level_number, v.level_source,
                       v.level_confidence, v.solution_steps, v.hints, v.solution_source,
                       (SELECT max(version) FROM question_versions WHERE question_id = q.id)
                         AS top_version
                FROM questions q JOIN question_versions v ON v.id = q.current_version_id
                WHERE q.subject_id = $1 AND q.retired_at IS NULL
                """,
                subject_id,
            )
        }

        plan: dict[str, list] = {
            "explain": [],
            "revise": [],
            "create": [],
            "complete": [],
            "same": [],
        }
        for q in questions:
            row = current.get((q["year"], str(q["number"])))
            if row is None:
                if q["year"] not in papers:
                    raise SystemExit(f"no {q['year']} paper in the bank to add Q{q['number']} to")
                plan["create"].append((q, None))
                continue
            options = {
                r["option_key"]: r["body"]
                for r in await conn.fetch(
                    "SELECT option_key, body FROM question_options WHERE question_version_id = $1",
                    row["version_id"],
                )
            }
            key = await conn.fetchval(
                "SELECT option_key FROM question_options WHERE question_version_id = $1 "
                "AND is_correct",
                row["version_id"],
            )
            assets = await conn.fetchval(
                "SELECT count(*) FROM question_assets WHERE question_version_id = $1",
                row["version_id"],
            )
            same_text = (
                normalise(row["stem"]) == q["stem"]
                and {k: normalise(v) for k, v in options.items()} == q["options"]
            )
            unchanged = (
                row["review_status"] == "approved"
                and same_text
                and key == q["answer"]
                and assets == (1 if q["svg"] else 0)
            )
            if same_text and row["review_status"] == "draft":
                # The import read this one correctly. A new version would repeat its content,
                # which the bank refuses; the draft is completed and approved instead.
                plan["complete"].append((q, row))
            elif not unchanged:
                plan["revise"].append((q, row))
            elif (
                json.loads(row["solution_steps"] or "[]") != q["steps"]
                or json.loads(row["hints"] or "[]") != [q["hint"]]
                or row["solution_source"] != "expert_verified"
            ):
                plan["explain"].append((q, row))
            else:
                plan["same"].append((q, row))

        with_figure = sum(1 for q in questions if q["svg"])
        uncertain = [q for q in questions if q["uncertain"]]
        print(f"{len(questions)} questions re-transcribed, {with_figure} with a redrawn figure.")
        print(f"  {len(plan['revise'])} corrected as a new version, approved")
        print(f"  {len(plan['create'])} not in the bank yet: created, approved")
        print(f"  {len(plan['complete'])} drafts already read correctly: completed, approved")
        print(f"  {len(plan['explain'])} unchanged but for the explanation: rewritten in place")
        print(f"  {len(plan['same'])} already exactly as written")
        pending = sum(len(plan[k]) for k in ("revise", "create", "complete", "explain"))
        if args.pending:
            # For a deploy: exit 10 when there is work, so it knows to take a backup first.
            return 10 if pending else 0
        print(f"Approving as {reviewer_name}" + (" (a new reviewer)." if new_reviewer else "."))
        if uncertain:
            print(
                f"{len(uncertain)} carry a reading to verify against the paper; each gets an "
                "open report: " + ", ".join(f"{q['year']} Q{q['number']}" for q in uncertain)
            )
        if not args.apply:
            print("\nDry run; pass --apply to write it.")
            return 0
        if not pending:
            print("\nNothing to do.")
            return 0

        author_id = uuid_for(f"reviewer:{AUTHOR}")
        reviewer = {"display_name": reviewer_name}
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
                    level, _ = propose(q)
                    version, marks = 1, None
                    seconds = SECONDS_BY_LEVEL[level]
                else:
                    question_id = row["question_id"]
                    level = row["mastery_level_number"] or propose(q)[0]
                    version, marks = int(row["top_version"]) + 1, row["marks"]
                    seconds = row["expected_seconds"] or SECONDS_BY_LEVEL[level]
                # Approval needs a level a person accepted. As in publish_utme_questions.py,
                # the reviewer accepts the proposed level, and its confidence stays low.
                level_source, level_confidence = "expert_verified", "low"

                version_id = await conn.fetchval(
                    """
                    INSERT INTO question_versions (question_id, subject_id, version, stem,
                      response_format, marking_method, solution_steps, hints, marks,
                      expected_seconds, option_count, content_hash, authored_by, answer_source,
                      answer_confidence, mastery_level_number, level_source, level_confidence,
                      solution_source, review_status)
                    VALUES ($1, $2, $3, $4, 'mcq_single', 'auto_key', $5::jsonb, $6::jsonb, $7,
                      $8, $9, $10, $11, 'expert_verified', 'medium', $12, $13, $14,
                      'expert_verified', 'draft')
                    RETURNING id
                    """,
                    question_id,
                    subject_id,
                    version,
                    q["stem"],
                    json.dumps(q["steps"]),
                    json.dumps([q["hint"]]),
                    marks,
                    seconds,
                    len(q["options"]),
                    content_hash(q["stem"], q["options"]),
                    author_id,
                    level,
                    level_source,
                    level_confidence,
                )
                for order, (letter, body) in enumerate(sorted(q["options"].items()), 1):
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
                        letter == q["answer"],
                        order,
                    )
                await add_figure(conn, version_id, q, reviewer["display_name"])
                if row is None:
                    code, reason = classify(q) or (FALLBACK, "No topic recognised; fallback skill.")
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
                        skills[code],
                        syllabus_version_id,
                        reason,
                        reviewer_id,
                    )
                # Point the question at the new version BEFORE withdrawing the old one, so
                # the question is never momentarily without a deliverable version.
                await conn.execute(
                    "UPDATE questions SET current_version_id = $2, updated_at = now() "
                    "WHERE id = $1",
                    question_id,
                    version_id,
                )
                await conn.execute(
                    """
                    UPDATE question_versions
                       SET review_status = 'approved', reviewed_by = $2, reviewed_at = now()
                     WHERE id = $1
                    """,
                    version_id,
                    reviewer_id,
                )
                if row is not None:
                    await conn.execute(
                        "UPDATE question_versions SET review_status = 'withdrawn' WHERE id = $1",
                        row["version_id"],
                    )
                    await conn.execute(
                        """
                        INSERT INTO question_reports (question_version_id, reporter_kind, reason,
                          detail, status, resolved_by, resolved_at, resolution_note)
                        VALUES ($1, 'system', 'other', $2, 'fixed', $3, now(), $4)
                        """,
                        row["version_id"],
                        NOTE.format(year=q["year"]),
                        reviewer_id,
                        f"Superseded by version {version}.",
                    )
                await report_uncertain(conn, version_id, q)

            for q, row in plan["complete"]:
                version_id = row["version_id"]
                level = row["mastery_level_number"] or propose(q)[0]
                # The draft's figure crops came from the automated import and were never
                # described; the redrawn figure replaces them.
                await conn.execute(
                    "DELETE FROM question_assets WHERE question_version_id = $1", version_id
                )
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
                       SET solution_steps = $2::jsonb, hints = $3::jsonb,
                           solution_source = 'expert_verified', answer_source = 'expert_verified',
                           answer_confidence = 'medium', mastery_level_number = $4,
                           level_source = 'expert_verified', level_confidence = 'low',
                           expected_seconds = coalesce(expected_seconds, $5),
                           authored_by = coalesce(authored_by, $6)
                     WHERE id = $1
                    """,
                    version_id,
                    json.dumps(q["steps"]),
                    json.dumps([q["hint"]]),
                    level,
                    SECONDS_BY_LEVEL[level],
                    author_id,
                )
                await add_figure(conn, version_id, q, reviewer["display_name"])
                await conn.execute(
                    """
                    UPDATE question_versions
                       SET review_status = 'approved', reviewed_by = $2, reviewed_at = now()
                     WHERE id = $1
                    """,
                    version_id,
                    reviewer_id,
                )
                await report_uncertain(conn, version_id, q)

        deliverable = await conn.fetchval(
            "SELECT count(*) FROM deliverable_questions WHERE subject_id = $1", subject_id
        )
        print(f"\nDone. {deliverable} Mathematics questions deliverable.")
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
        help="Write the SVG figure files from the transcriptions, then stop",
    )
    args = parser.parse_args()
    if args.apply and not (args.reviewer or args.reviewer_name):
        parser.error("--apply needs --reviewer or --reviewer-name: approval is a person's")
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
