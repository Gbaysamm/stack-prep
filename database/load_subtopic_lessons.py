"""Load the subtopic lesson bank: docs/lessons/subtopics/<subject>/<slug>.yaml.

Each file is one subtopic's lesson for the board (migration 045), written in the moments the
question lessons use and checked by the same modules: cues, doodles, points, sections. Its own
doodles are docs/lessons/subtopics/<subject>/doodles/sub_<slug>_x.svg, named custom:sub_<slug>_x.

    python database/load_subtopic_lessons.py            # check every file and load it
    python database/load_subtopic_lessons.py --check    # check only

The database comes from DATABASE_URL (asyncpg form accepted), as the other loaders.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

import asyncpg
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lesson_cues import attach_cues, split_cues
from lesson_diagrams import DiagramBook
from lesson_doodles import (
    SUBTOPIC,
    DoodleBook,
    check_all_used,
    library_names,
    read_subtopic_doodles,
)
from lesson_marks import clean_points, clean_section

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "docs" / "lessons" / "subtopics"


def read_problems(raw: object, where: str) -> list[dict[str, object]]:
    """The one or two short problems tried after the lesson (subtopic-lesson-guide.md §9).

    Each: `ask` (what is set, maths in $...$), `answer` (the expected answer, as a student
    would type it), `accept` (other ways of writing it that are right), `working` (the steps,
    shown once the student has tried) and `needs_working` (answered with a photo of the
    working rather than a typed answer).
    """
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 2:
        raise SystemExit(f"{where}: problems is a list of one or two")
    problems: list[dict[str, object]] = []
    for n, item in enumerate(raw):
        here = f"{where} problem {n}"
        if not isinstance(item, dict):
            raise SystemExit(f"{here}: a problem is a mapping")
        ask, answer = item.get("ask"), item.get("answer")
        if not isinstance(ask, str) or not ask.strip():
            raise SystemExit(f"{here}: a problem needs `ask`")
        if not isinstance(answer, (str, int, float)) or not str(answer).strip():
            raise SystemExit(f"{here}: a problem needs `answer`")
        accept = item.get("accept") or []
        working = item.get("working") or []
        answers_ok = all(isinstance(a, (str, int, float)) for a in accept)
        if not isinstance(accept, list) or not answers_ok:
            raise SystemExit(f"{here}: accept is a list of answers")
        if not isinstance(working, list) or not all(isinstance(w, str) for w in working):
            raise SystemExit(f"{here}: working is a list of lines")
        problems.append(
            {
                "ask": ask.strip(),
                "answer": str(answer).strip(),
                "accept": [str(a).strip() for a in accept],
                "working": [w.strip() for w in working],
                "needs_working": bool(item.get("needs_working", False)),
            }
        )
    return problems


def read_lesson(path: Path) -> dict[str, Any]:
    """One lesson file, checked, as the row to store."""
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    where = path.relative_to(ROOT).as_posix()
    subtopic_id = str(doc.get("subtopic_id") or "").strip()
    if not subtopic_id:
        raise SystemExit(f"{where}: a lesson names its subtopic_id")
    moments = doc.get("moments")
    if not isinstance(moments, list) or not moments:
        raise SystemExit(f"{where}: a lesson needs moments")
    slug = path.stem
    doodles = read_subtopic_doodles(path.parent / "doodles", slug)
    book = DoodleBook(library_names(), doodles, SUBTOPIC, SUBTOPIC)
    diagrams = DiagramBook()
    clean: list[dict[str, object]] = []
    for moment in moments:
        here = f"{where} moment {len(clean)}"
        say = moment.get("say") if isinstance(moment, dict) else None
        if not isinstance(say, str) or not say.strip():
            raise SystemExit(f"{here}: every moment needs something said")
        if moment.get("answer") or moment.get("show_sketch"):
            raise SystemExit(f"{here}: a subtopic lesson has no answer and no sketches")
        moment, cues = split_cues(moment, here)
        write = moment.get("write")
        if write is not None and (not isinstance(write, str) or not write.strip()):
            raise SystemExit(f"{here}: a moment's write is a line of working or nothing")
        entry: dict[str, object] = {"say": say.strip()}
        if write:
            entry["write"] = write.strip()
        if moment.get("section") is not None:
            entry["section"] = clean_section(moment["section"], here)
        writes = [bool(m.get("write")) for m in clean] + [bool(write)]
        bringing, linkable = book.moment(moment, len(clean), writes, here)
        drawing = diagrams.moment(moment, len(clean), writes, here)
        point = moment.get("point")
        if point is not None:
            entry["point"] = clean_points(
                point, len(clean), here, [], {}, doodles=linkable, diagrams=diagrams
            )
        entry.update(bringing)
        entry.update(drawing)
        attach_cues(entry, cues)
        clean.append(entry)
    check_all_used(doodles, clean, where)
    return {
        "subtopic_id": subtopic_id,
        "moments": clean,
        "doodles": doodles,
        "problems": read_problems(doc.get("problems"), where),
        "file": where,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check the files, load nothing")
    parser.add_argument(
        "--file", help="only this lesson file (a writer checking theirs while others write)"
    )
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()
    paths = [Path(args.file).resolve()] if args.file else sorted(BANK.glob("*/*.yaml"))
    lessons = [read_lesson(path) for path in paths]
    print(f"{len(lessons)} subtopic lesson(s) checked.")
    if args.check:
        return
    dsn = args.database_url.replace("+asyncpg", "", 1) or None
    conn = await asyncpg.connect(dsn=dsn)
    try:
        await conn.execute("SET search_path = stackprep, public")
        async with conn.transaction():
            for lesson in lessons:
                found = await conn.fetchval(
                    "SELECT 1 FROM curriculum_items WHERE id = $1 AND item_type = 'subtopic'",
                    lesson["subtopic_id"],
                )
                if not found:
                    raise SystemExit(f"{lesson['file']}: no subtopic {lesson['subtopic_id']}")
                await conn.execute(
                    """
                    INSERT INTO subtopic_lesson_content
                      (subtopic_id, moments, doodles, problems, source_file)
                    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
                    ON CONFLICT (subtopic_id) DO UPDATE
                      SET moments = EXCLUDED.moments, doodles = EXCLUDED.doodles,
                          problems = EXCLUDED.problems,
                          source_file = EXCLUDED.source_file, updated_at = now()
                    """,
                    lesson["subtopic_id"],
                    json.dumps(lesson["moments"]),
                    json.dumps(lesson["doodles"]),
                    json.dumps(lesson["problems"]),
                    lesson["file"],
                )
        print(f"{len(lessons)} subtopic lesson(s) loaded.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
