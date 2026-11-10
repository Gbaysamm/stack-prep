"""Build the lessons the public home page plays, with the free Kokoro voice.

Reads lessons from the board harness file (apps/web/board.local.json, kept out of git) and
writes, for each one chosen below, apps/web/public/showcase/<id>.json and one mp3 per spoken
moment, with each word's timing so the board writes in step with the voice. The output is
committed; run this again only to change which lessons are shown or how they are worded.

    DATABASE_URL=... .venv/Scripts/python scripts/showcase_lessons.py

Kokoro is free (it runs on this machine), so nothing here costs money.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))

from app import voice_store  # noqa: E402
from app.config import get_settings  # noqa: E402

SOURCE = ROOT / "apps" / "web" / "board.local.json"
OUT = ROOT / "apps" / "web" / "public" / "showcase"

#: id in the harness file -> how the home page names it, and the keyed option.
CHOSEN = {
    "11": {"subject": "Mathematics", "label": "Straight lines", "answer": "D",
           "title": "Coordinate geometry of straight lines"},
    "m97_35": {"subject": "Mathematics", "label": "Trigonometry", "answer": "B"},
    "e14_7d": {"subject": "English", "label": "Comprehension", "answer": "C"},
}


async def main() -> int:
    settings = get_settings()
    lessons = json.loads(SOURCE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for lesson_id, about in CHOSEN.items():
        lesson = dict(lessons[lesson_id])
        folder = OUT / lesson_id
        shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir()
        moments = []
        for index, moment in enumerate(lesson["moments"]):
            moment = {k: v for k, v in moment.items() if k not in ("voice_data", "phones", "mouth")}
            clip = await voice_store.voiced(moment["say"], settings, patient=True, engine="kokoro")
            if clip is None:
                print(f"{lesson_id} {index}: no voice", file=sys.stderr)
                return 1
            shutil.copyfile(clip, folder / f"{index}.mp3")
            timed = voice_store.timings(moment["say"], settings, engine="kokoro") or {}
            moment["voice"] = f"/showcase/{lesson_id}/{index}.mp3"
            moment["words"] = timed.get("words", [])
            moments.append(moment)
        lesson["moments"] = moments
        lesson.update(about)
        lesson.pop("mouth_words", None)
        (OUT / f"{lesson_id}.json").write_text(
            json.dumps(lesson, ensure_ascii=False), encoding="utf-8"
        )
        size = sum(f.stat().st_size for f in folder.iterdir())
        print(f"{lesson_id}: {len(moments)} moments, {size // 1024} KB of voice")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
