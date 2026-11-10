"""The reviewer's question bank: add an exam, a subject (with copied topics), a paper and a
question; approve it; edit it (a new version when what it asks changes); remove it."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import staff_login

from app.db import database_is_reachable, get_engine
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def _utme_maths() -> str | None:
    async with get_engine().connect() as conn:
        found = (
            await conn.execute(
                text(
                    """
            SELECT s.id FROM subjects s JOIN examinations e ON e.id = s.examination_id
            JOIN syllabus_versions v ON v.subject_id = s.id AND v.status = 'approved'
              AND v.is_current
            WHERE e.short_name = 'UTME' AND s.code = 'MATH'
            """
                )
            )
        ).scalar_one_or_none()
    return str(found) if found else None


async def _drop_exam(exam_id: str) -> None:
    """Remove everything a test exam made, children first."""
    async with get_engine().begin() as conn:
        subjects = "(SELECT id FROM subjects WHERE examination_id = :e)"
        versions = f"(SELECT id FROM question_versions WHERE subject_id IN {subjects})"
        items = f"(SELECT id FROM curriculum_items WHERE subject_id IN {subjects})"
        for sql in (
            f"UPDATE question_versions SET review_status = 'withdrawn'"
            f" WHERE review_status = 'approved' AND subject_id IN {subjects}",
            f"DELETE FROM question_classifications WHERE subject_id IN {subjects}",
            f"DELETE FROM question_options WHERE subject_id IN {subjects}",
            f"UPDATE questions SET current_version_id = NULL WHERE subject_id IN {subjects}",
            f"DELETE FROM question_explanation_history WHERE question_version_id IN {versions}",
            f"DELETE FROM question_versions WHERE id IN {versions}",
            f"DELETE FROM questions WHERE subject_id IN {subjects}",
            f"DELETE FROM exam_papers WHERE subject_id IN {subjects}",
            f"DELETE FROM curriculum_mastery_levels WHERE curriculum_item_id IN {items}",
            f"DELETE FROM curriculum_evidence WHERE curriculum_item_id IN {items}",
            f"DELETE FROM curriculum_items WHERE subject_id IN {subjects} AND item_type = 'skill'",
            f"DELETE FROM curriculum_items WHERE subject_id IN {subjects}"
            " AND item_type = 'subtopic'",
            f"DELETE FROM curriculum_items WHERE subject_id IN {subjects}",
            f"DELETE FROM syllabus_versions WHERE subject_id IN {subjects}",
            "DELETE FROM source_documents WHERE examination_id = :e",
            "DELETE FROM subjects WHERE examination_id = :e",
            "DELETE FROM examinations WHERE id = :e",
        ):
            await conn.execute(text(sql), {"e": exam_id})


async def test_only_staff_reach_the_bank(client: httpx.AsyncClient) -> None:
    assert (await client.get("/v1/bank/exams")).status_code == 401


async def test_the_whole_bank_flow(client: httpx.AsyncClient) -> None:
    source = await _utme_maths()
    if source is None:
        pytest.skip("no approved UTME Mathematics topics in this database")
    short = f"T{uuid.uuid4().hex[:6].upper()}"
    exam_id = None
    transport = httpx.ASGITransport(app=app)
    # A second reviewer approves (an author can't approve their own question). Both stay signed
    # in until the test's data is gone: what they decided points at them.
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://test") as other,
        staff_login(other, "reviewer"),
        staff_login(client, "reviewer"),
    ):
        try:
            made = await client.post(
                "/v1/bank/exams",
                json={"name": "Test examination", "short_name": short, "exam_body": "Test council"},
            )
            assert made.status_code == 201, made.text
            exam_id = made.json()["id"]
            assert (
                await client.post(
                    "/v1/bank/exams",
                    json={"name": "Again", "short_name": short, "exam_body": "Another body"},
                )
            ).status_code == 409

            subject = await client.post(
                f"/v1/bank/exams/{exam_id}/subjects",
                json={"name": "Mathematics", "copy_topics_from": source},
            )
            assert subject.status_code == 201, subject.text
            assert subject.json()["has_topics"] is True
            subject_id = subject.json()["subject_id"]

            paper = await client.post(
                f"/v1/bank/subjects/{subject_id}/papers", json={"exam_year": 2021}
            )
            assert paper.status_code == 201, paper.text
            paper_id = paper.json()["paper_id"]
            assert (
                await client.post(
                    f"/v1/bank/subjects/{subject_id}/papers", json={"exam_year": 2021}
                )
            ).status_code == 409
            own = await client.post(
                f"/v1/bank/subjects/{subject_id}/papers", json={"title": "Stack Prep set 1"}
            )
            assert own.status_code == 201 and own.json()["own"] is True

            page = (await client.get(f"/v1/bank/papers/{paper_id}")).json()
            syllabus = page["syllabus_version_id"]
            assert syllabus
            skills = (
                await client.get("/v1/review/skills", params={"syllabus_version_id": syllabus})
            ).json()
            skill = next(s for s in skills)

            question = {
                "stem": "What is 2 + 3?",
                "options": [
                    {"key": k, "body": b} for k, b in zip("ABCD", ["4", "5", "6", "7"], strict=True)
                ],
                "answer": "B",
                "solution_steps": ["Count on from 2: 3, 4, 5."],
                "hints": ["Start at 2 and count three more."],
                "level": 1,
                "skill_id": skill["id"],
            }
            added = await client.post(f"/v1/bank/papers/{paper_id}/questions", json=question)
            assert added.status_code == 201, added.text
            qid = added.json()["question_id"]
            line = (await client.get(f"/v1/bank/papers/{paper_id}")).json()["questions"][0]
            assert line["state"] == "ready" and line["question_number"] == "1"

            # Its author can't approve it: a second reviewer does.
            mine = await client.post(f"/v1/review/questions/{qid}/approve", json={})
            assert mine.status_code == 409
            approved = await other.post(f"/v1/review/questions/{qid}/approve", json={})
            assert approved.status_code == 200, approved.text

            # Only the working changes: improved in place, still approved.
            better = {**question, "solution_steps": ["2 + 3 = 5."]}
            kept = await client.put(f"/v1/bank/questions/{qid}", json=better)
            assert kept.status_code == 200, kept.text
            line = (await client.get(f"/v1/bank/papers/{paper_id}")).json()["questions"][0]
            assert line["state"] == "approved"

            # What it asks changes: a new version waiting for approval, the old one withdrawn.
            changed = {**better, "stem": "What is 3 + 2?"}
            assert (await client.put(f"/v1/bank/questions/{qid}", json=changed)).status_code == 200
            line = (await client.get(f"/v1/bank/papers/{paper_id}")).json()["questions"][0]
            assert line["state"] == "ready" and line["stem"] == "What is 3 + 2?"
            async with get_engine().connect() as conn:
                states = (
                    await conn.execute(
                        text(
                            "SELECT array_agg(review_status ORDER BY version)"
                            " FROM question_versions WHERE question_id = :q"
                        ),
                        {"q": qid},
                    )
                ).scalar_one()
            assert states == ["withdrawn", "draft"]

            assert (await client.delete(f"/v1/bank/papers/{paper_id}")).status_code == 409
            removed = await client.post(
                f"/v1/bank/questions/{qid}/remove", json={"reason": "A test"}
            )
            assert removed.status_code == 204
            assert (await client.get(f"/v1/bank/papers/{paper_id}")).json()["questions"] == []
            assert (await client.delete(f"/v1/bank/papers/{paper_id}")).status_code == 204
        finally:
            # Inside the sign-in: the test reviewer is removed when it ends, and what they
            # approved must go first.
            if exam_id:
                await _drop_exam(exam_id)
