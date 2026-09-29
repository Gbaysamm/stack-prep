"""A written lesson's doodles, as the board gets them (migration 027).

A moment may bring a small picture onto the board, drawn by the pen beside a line: a library
doodle the web app carries itself, or one drawn for this question and stored with its lesson
(`question_lessons.doodles`). The loader checked both (database/lesson_doodles.py); here they
are read leniently — a doodle is decoration over a lesson that teaches without it, so one that
does not fit is dropped rather than taking the lesson down.
"""

from __future__ import annotations

import json
import re
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

#: As the loader allows: a caption is a few words.
MAX_CAPTION = 40
_NAME = re.compile(r"custom:\d{4}_q\d{2,3}_[a-z0-9][a-z0-9_-]*|[a-z0-9][a-z0-9_-]*")


class DoodleRef(BaseModel):
    """The doodle a moment brings in: which, what is written under it, and which line it is by."""

    #: A library doodle's name ('lightbulb'), or the lesson's own ('custom:2011_q42_roof').
    name: str
    #: A few words written under it.
    caption: str | None = None
    #: The moment whose line it sits by; by default the moment's own.
    near: int | None = None


class LessonDoodle(BaseModel):
    """A picture drawn for this question's lesson: SVG in the board's art format.

    Sent as text; the board cleans it again before drawing it (Doodle.tsx), and it was checked
    when it was loaded: nothing in it runs or fetches.
    """

    name: str
    svg: str
    alt_text: str | None = None


def doodle_ref(raw: object) -> DoodleRef | None:
    """A moment's `doodle` as the board draws it, or None when it has none that fits."""
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    if not isinstance(name, str) or not _NAME.fullmatch(name.strip()):
        return None
    caption = raw.get("caption")
    words = str(caption).strip()[:MAX_CAPTION] if isinstance(caption, str | int | float) else ""
    near = raw.get("near")
    line = near if isinstance(near, int) and not isinstance(near, bool) and near >= 0 else None
    return DoodleRef(name=name.strip(), caption=words or None, near=line)


async def lesson_doodles(conn: AsyncConnection, version_id: UUID) -> list[LessonDoodle]:
    """The written lesson's own doodles, found the way the lesson itself is found.

    Read as `to_jsonb(l) -> 'doodles'`, so a database not yet migrated to 027 reads as a lesson
    with none instead of failing the lesson.
    """
    stored = (
        await conn.execute(
            text(
                """
                SELECT to_jsonb(l) -> 'doodles'
                FROM question_versions seen
                JOIN questions q ON q.id = seen.question_id
                JOIN question_lessons l
                  ON l.question_version_id IN (seen.id, q.current_version_id)
                WHERE seen.id = :v
                ORDER BY l.question_version_id = seen.id DESC
                LIMIT 1
                """
            ),
            {"v": version_id},
        )
    ).scalar()
    stored = json.loads(stored) if isinstance(stored, str) else stored
    doodles: list[LessonDoodle] = []
    for raw in stored if isinstance(stored, list) else []:
        try:
            doodles.append(LessonDoodle.model_validate(raw))
        except ValueError:
            continue
    return doodles
