"""Seed one demo practice run for a student, so the run report always has something to show.

For a LOCAL database only (founder, 17 Nov 2026: the roadmap gates runs, so a fresh account
has no run report to look at). Twelve questions from the student's first subject, every
outcome the report draws: right first time, right after a hint, guessed right, taught on the
board (missed twice), and missed once with no second try.

    .venv/Scripts/python scripts/seed_demo_run.py admin-local@example.test

DATABASE_URL picks the database (default: the local integration one). Prints the report link.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import asyncpg

DSN = os.environ.get("DATABASE_URL", "postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int").replace(
    "postgresql+asyncpg://", "postgresql://"
)

# (outcome, tries): each try is (correct?, hint used?, confidence)
PLAN = [
    ("right", [(True, False, "sure")]),
    ("hint", [(False, False, "sure"), (True, True, "unsure")]),
    ("right", [(True, False, "sure")]),
    ("taught", [(False, False, "sure"), (False, True, "unsure")]),
    ("guess", [(True, False, "guessed")]),
    ("right", [(True, False, "unsure")]),
    ("miss", [(False, False, "sure")]),
    ("hint", [(False, False, "unsure"), (True, True, "sure")]),
    ("right", [(True, False, "sure")]),
    ("taught", [(False, False, "guessed"), (False, True, "unsure")]),
    ("right", [(True, False, "sure")]),
    ("guess", [(True, False, "guessed")]),
]


async def main(login: str) -> None:
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute("SET search_path = stackprep, public")
        student = await conn.fetchval(
            """
            SELECT id FROM students WHERE lower(email) = lower($1) OR phone = $1
            """,
            login,
        )
        if student is None:
            raise SystemExit(f"no student signs in as {login}")
        subject = await conn.fetchval(
            """
            SELECT g.subject_id FROM student_exam_goals g
            JOIN subjects s ON s.id = g.subject_id
            WHERE g.student_id = $1 AND g.status = 'active'
            ORDER BY s.name LIMIT 1
            """,
            student,
        )
        if subject is None:
            raise SystemExit("the student has no subjects yet")
        questions = await conn.fetch(
            """
            SELECT d.question_version_id,
                   (SELECT o.option_key FROM question_options o
                     WHERE o.question_version_id = d.question_version_id AND o.is_correct
                     ORDER BY o.display_order LIMIT 1) AS right_key,
                   (SELECT o.option_key FROM question_options o
                     WHERE o.question_version_id = d.question_version_id AND NOT o.is_correct
                     ORDER BY o.display_order LIMIT 1) AS wrong_key
            FROM deliverable_questions d
            WHERE d.subject_id = $1 AND d.response_format = 'mcq_single'
            ORDER BY md5(d.question_version_id::text)
            LIMIT $2
            """,
            subject,
            len(PLAN),
        )
        questions = [q for q in questions if q["right_key"] and q["wrong_key"]]
        if len(questions) < len(PLAN):
            raise SystemExit(f"only {len(questions)} questions to use in this subject")

        start = datetime.now(timezone.utc) - timedelta(minutes=40)
        async with conn.transaction():
            session = await conn.fetchval(
                """
                INSERT INTO study_sessions (student_id, subject_id, session_type, started_at, ended_at,
                                            engine_version, planned_items, practice_filters)
                VALUES ($1, $2, 'guided', $3, $4, 'demo', $5, $6)
                RETURNING id
                """,
                student,
                subject,
                start,
                start + timedelta(minutes=35),
                len(PLAN),
                json.dumps({"topic_ids": [], "bookmarked": False, "exam_years": [], "subtopic_ids": []}),
            )
            at = start
            for question, (_, tries) in zip(questions, PLAN):
                for correct, hint, confidence in tries:
                    at += timedelta(seconds=70)
                    await conn.execute(
                        """
                        INSERT INTO attempts (id, student_id, question_version_id, session_id, context,
                                              selected_option_key, is_correct, response_ms, hint_count,
                                              answered_at_client, confidence, engine_version)
                        VALUES (gen_random_uuid(), $1, $2, $3, 'guided', $4, $5, $6, $7, $8, $9, 'demo')
                        """,
                        student,
                        question["question_version_id"],
                        session,
                        question["right_key"] if correct else question["wrong_key"],
                        correct,
                        40_000,
                        1 if hint else 0,
                        at,
                        confidence,
                    )
        print(f"Seeded run {session}")
        print(f"Open: http://localhost:5173/practice/{session}/report")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "admin-local@example.test"))
