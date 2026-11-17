"""Seed saved questions (bookmarks) for a student, so the Bookmarks page has something to show.

For a LOCAL database only (founder, 17 Nov 2026). Three questions from each of the student's
subjects, saved over the last few days; questions already saved are left as they are.

    .venv/Scripts/python scripts/seed_demo_bookmarks.py admin-local@example.test
"""

from __future__ import annotations

import asyncio
import os
import sys

import asyncpg

DSN = os.environ.get("DATABASE_URL", "postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int").replace(
    "postgresql+asyncpg://", "postgresql://"
)
PER_SUBJECT = 3


async def main(login: str) -> None:
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute("SET search_path = stackprep, public")
        student = await conn.fetchval("SELECT id FROM students WHERE lower(email) = lower($1) OR phone = $1", login)
        if student is None:
            raise SystemExit(f"no student signs in as {login}")
        added = await conn.fetchval(
            """
            WITH picked AS (
              SELECT d.question_id, d.question_version_id,
                     row_number() OVER (PARTITION BY d.subject_id
                                        ORDER BY md5(d.question_version_id::text || 'saved')) AS n
              FROM deliverable_questions d
              JOIN student_exam_goals g ON g.subject_id = d.subject_id
                                       AND g.student_id = $1 AND g.status = 'active'
            ), added AS (
              INSERT INTO question_bookmarks (student_id, question_id, question_version_id, created_at)
              SELECT $1, question_id, question_version_id, now() - make_interval(hours => (n * 19)::int)
              FROM picked WHERE n <= $2
              ON CONFLICT DO NOTHING
              RETURNING 1
            )
            SELECT count(*) FROM added
            """,
            student,
            PER_SUBJECT,
        )
        print(f"Saved {added} questions. Open: http://localhost:5173/bookmarks")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "admin-local@example.test"))
