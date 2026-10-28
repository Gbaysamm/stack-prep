"""What the public site says about the question bank, counted live so it never goes stale.

Only UTME subjects are listed: the sandbox and test subjects live under other examinations.
How many questions each subject has is not said, and the total is rounded down to the
thousand ("5,000+"): the founder's call, so the bank's exact size stays ours.
"""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/app", tags=["app"])


class SiteSubject(BaseModel):
    name: str
    first_year: int | None
    last_year: int | None


class Site(BaseModel):
    subjects: list[SiteSubject]
    #: The number of questions, rounded down to the thousand (to the hundred below 1,000).
    questions_at_least: int
    #: Questions with a worked solution, as a whole percentage.
    worked_percent: int


#: The counts barely move, and every visitor to the home page asks: kept this long.
KEEP_SECONDS = 600
_kept: tuple[float, Site] | None = None


@router.get("/site", response_model=Site, summary="The question bank, for the public site")
async def site(conn: Annotated[AsyncConnection, Depends(connection)]) -> Site:
    global _kept
    if _kept and time.monotonic() - _kept[0] < KEEP_SECONDS:
        return _kept[1]
    rows = await fetch_all(
        conn,
        """
        SELECT sub.name, count(DISTINCT d.question_version_id) AS questions,
               min(q.exam_year) AS first_year, max(q.exam_year) AS last_year,
               count(DISTINCT d.question_version_id) FILTER (
                 WHERE jsonb_array_length(coalesce(v.solution_steps, '[]'::jsonb)) > 0) AS worked
        FROM subjects sub
        JOIN examinations e ON e.id = sub.examination_id AND e.short_name = 'UTME'
        JOIN deliverable_questions d ON d.subject_id = sub.id
        JOIN questions q ON q.id = d.question_id
        JOIN question_versions v ON v.id = d.question_version_id
        GROUP BY sub.name
        ORDER BY sub.name
        """,
    )
    total = sum(row["questions"] for row in rows)
    worked = sum(row["worked"] for row in rows)
    step = 1000 if total >= 1000 else 100
    counted = Site(
        subjects=[
            SiteSubject(**{k: v for k, v in row.items() if k not in ("worked", "questions")})
            for row in rows
        ],
        questions_at_least=total // step * step,
        worked_percent=round(100 * worked / total) if total else 0,
    )
    _kept = (time.monotonic(), counted)
    return counted
