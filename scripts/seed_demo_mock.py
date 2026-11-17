"""Seed one finished demo mock for a student, so the mock report always has something to show.

For a LOCAL database and API only (founder, 17 Nov 2026: a fresh account has no mock to look
at). A UTME-style mock across the student's subjects, 10 questions each, answered with a mix
of right, wrong and left blank, then submitted through the API so the report is scored exactly
as a real one.

    .venv/Scripts/python scripts/seed_demo_mock.py admin-local@example.test localtest123

DATABASE_URL picks the database, API_URL the API (default: the local ones). Prints the link.
"""

from __future__ import annotations

import asyncio
import os
import sys

import asyncpg
import httpx

DSN = os.environ.get("DATABASE_URL", "postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int").replace(
    "postgresql+asyncpg://", "postgresql://"
)
API = os.environ.get("API_URL", "http://127.0.0.1:8020")
PER_SUBJECT = 10
# For each question in turn: right, wrong or left blank.
PATTERN = ["right", "right", "wrong", "right", "blank", "wrong", "right", "right", "wrong", "right"]


async def main(login: str, password: str) -> None:
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute("SET search_path = stackprep, public")
        student = await conn.fetchval("SELECT id FROM students WHERE lower(email) = lower($1) OR phone = $1", login)
        if student is None:
            raise SystemExit(f"no student signs in as {login}")
        subjects = await conn.fetch(
            """
            SELECT g.subject_id, s.examination_id FROM student_exam_goals g
            JOIN subjects s ON s.id = g.subject_id
            WHERE g.student_id = $1 AND g.status = 'active' ORDER BY s.name
            """,
            student,
        )
        if not subjects:
            raise SystemExit("the student has no subjects yet")
        minutes = 30
        async with conn.transaction():
            mock = await conn.fetchval(
                """
                INSERT INTO mock_exams (student_id, examination_id, preset, duration_minutes, deadline_at)
                VALUES ($1, $2, 'utme', $3, now() + make_interval(mins => $3))
                RETURNING id
                """,
                student,
                subjects[0]["examination_id"],
                minutes,
            )
            for subject in subjects:
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
                    ORDER BY md5(d.question_version_id::text || 'mock')
                    LIMIT $2
                    """,
                    subject["subject_id"],
                    PER_SUBJECT,
                )
                session = await conn.fetchval(
                    """
                    INSERT INTO study_sessions (student_id, subject_id, session_type, planned_minutes,
                      planned_items, engine_version, mock_exam_id, started_at)
                    SELECT $1, $2, 'full_mock', $3, $4, 'demo', m.id, m.started_at
                    FROM mock_exams m WHERE m.id = $5
                    RETURNING id
                    """,
                    student,
                    subject["subject_id"],
                    minutes,
                    len(questions),
                    mock,
                )
                for position, (question, how) in enumerate(zip(questions, PATTERN), 1):
                    chosen = None if how == "blank" else question["right_key"] if how == "right" else question["wrong_key"]
                    await conn.execute(
                        """
                        INSERT INTO mock_exam_items (mock_exam_id, session_id, position, question_version_id,
                          selected_option_key, answered_at, response_ms)
                        VALUES ($1, $2, $3, $4, $5, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END, 40000)
                        """,
                        mock,
                        session,
                        position,
                        question["question_version_id"],
                        chosen,
                    )
    finally:
        await conn.close()

    # Submitted through the API, so the report is scored as a real mock is.
    with httpx.Client(base_url=API, timeout=120) as client:
        client.post("/v1/auth/login", json={"login": login, "password": password}).raise_for_status()
        client.post(f"/v1/mock/{mock}/submit", json={"answers": []}).raise_for_status()
    print(f"Seeded mock {mock}")
    print(f"Open: http://localhost:5173/mock/{mock}/report")


if __name__ == "__main__":
    asyncio.run(
        main(
            sys.argv[1] if len(sys.argv) > 1 else "admin-local@example.test",
            sys.argv[2] if len(sys.argv) > 2 else "localtest123",
        )
    )
