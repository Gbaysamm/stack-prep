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
        "file": where,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check the files, load nothing")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()
    lessons = [read_lesson(path) for path in sorted(BANK.glob("*/*.yaml"))]
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
                    INSERT INTO subtopic_lesson_content (subtopic_id, moments, doodles, source_file)
                    VALUES ($1, $2::jsonb, $3::jsonb, $4)
                    ON CONFLICT (subtopic_id) DO UPDATE
                      SET moments = EXCLUDED.moments, doodles = EXCLUDED.doodles,
                          source_file = EXCLUDED.source_file, updated_at = now()
                    """,
                    lesson["subtopic_id"],
                    json.dumps(lesson["moments"]),
                    json.dumps(lesson["doodles"]),
                    lesson["file"],
                )
        print(f"{len(lessons)} subtopic lesson(s) loaded.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
