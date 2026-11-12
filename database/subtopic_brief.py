"""What a lesson writer starts from: a subtopic's syllabus scope and its JAMB past questions.

    python database/subtopic_brief.py <subtopic_id>
    python database/subtopic_brief.py --list Chemistry      # every subtopic, in syllabus order

Prints the subject, topic and subtopic, the syllabus's objective, scope, depth and boundary
notes, then each past question in our bank with its options, the right answer, the reviewed
working and the note on each wrong option. The lesson guide is
docs/lessons/subtopic-lesson-guide.md; the sources are docs/lessons/sources.md.

The database comes from DATABASE_URL (asyncpg form accepted).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import asyncpg


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subtopic", nargs="?")
    parser.add_argument("--list", metavar="SUBJECT")
    args = parser.parse_args()
    dsn = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "", 1) or None
    conn = await asyncpg.connect(dsn=dsn)
    await conn.execute("SET search_path = stackprep, public")
    try:
        if args.list:
            rows = await conn.fetch(
                """
                SELECT t.name AS topic, sub.id, sub.name,
                  EXISTS (SELECT 1 FROM subtopic_lesson_content c WHERE c.subtopic_id = sub.id)
                    AS written
                FROM curriculum_items sub
                JOIN curriculum_items t ON t.id = sub.parent_id
                JOIN subjects s ON s.id = sub.subject_id
                WHERE s.name = $1 AND sub.item_type = 'subtopic'
                ORDER BY t.display_order, sub.display_order
                """,
                args.list,
            )
            for row in rows:
                mark = "written" if row["written"] else "-"
                print(f"{row['id']}  {mark:8} {row['topic']} | {row['name']}")
            return
        head = await conn.fetchrow(
            """
            SELECT s.name AS subject, t.name AS topic, sub.name, sub.learning_objective,
                   sub.examinable_scope, sub.expected_depth, sub.boundary_notes,
                   (SELECT string_agg(o.name, ', ' ORDER BY o.display_order)
                    FROM curriculum_items o WHERE o.parent_id = t.id) AS siblings
            FROM curriculum_items sub
            JOIN curriculum_items t ON t.id = sub.parent_id
            JOIN subjects s ON s.id = sub.subject_id
            WHERE sub.id = $1
            """,
            args.subtopic,
        )
        if head is None:
            raise SystemExit(f"no subtopic {args.subtopic}")
        print(f"SUBJECT: {head['subject']}\nTOPIC: {head['topic']}\nSUBTOPIC: {head['name']}")
        print(f"OTHER SUBTOPICS IN THIS TOPIC: {head['siblings']}")
        for label in ("learning_objective", "examinable_scope", "expected_depth", "boundary_notes"):
            if head[label]:
                print(f"{label.upper()}: {head[label]}")
        questions = await conn.fetch(
            """
            SELECT v.id, v.stem, v.solution_steps, p.exam_year AS year
            FROM deliverable_questions dq
            JOIN question_versions v ON v.id = dq.question_version_id
            JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
            LEFT JOIN exam_papers p ON p.id = dq.exam_paper_id
            WHERE skill.parent_id = $1
            ORDER BY p.exam_year NULLS LAST
            """,
            args.subtopic,
        )
        print(f"\nPAST QUESTIONS IN OUR BANK: {len(questions)}")
        for n, q in enumerate(questions, 1):
            print(f"\n--- {n}. ({q['year'] or 'year unknown'}) {q['stem']}")
            for o in await conn.fetch(
                "SELECT option_key, body, is_correct, distractor_note FROM question_options"
                " WHERE question_version_id = $1 ORDER BY display_order",
                q["id"],
            ):
                mark = "  <- answer" if o["is_correct"] else ""
                note = f"   [why chosen: {o['distractor_note']}]" if o["distractor_note"] else ""
                print(f"  {o['option_key']}. {o['body']}{mark}{note}")
            steps = q["solution_steps"]
            steps = json.loads(steps) if isinstance(steps, str) else steps
            if steps:
                print("  working: " + " / ".join(str(s) for s in steps))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
