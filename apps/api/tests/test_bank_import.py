"""AI-written questions brought in as JSON (routers/bank_import.py), and papers renamed and
retired (founder, 13 Nov 2026)."""

from __future__ import annotations

import uuid

import httpx
import pytest
from staff import staff_login
from test_bank import _drop_exam, _utme_maths, client  # noqa: F401  (the fixture)

pytestmark = pytest.mark.integration


def _question(code: str, **change: object) -> dict[str, object]:
    question: dict[str, object] = {
        "subtopic": code,
        "stem": "What is 2 + 3?",
        "options": {"A": "4", "B": "5", "C": "6", "D": "7"},
        "answer": "B",
        "steps": ["Add 2 and 3.", "2 + 3 = 5, which is option B."],
        "hint": "Count on from 2.",
        "why": {"A": "That is one too few.", "C": "That is one too many.", "D": "Two too many."},
        "level": 1,
    }
    question.update(change)
    return question


async def test_ai_questions_come_in_only_with_real_subtopics(client: httpx.AsyncClient) -> None:  # noqa: F811
    source = await _utme_maths()
    if source is None:
        pytest.skip("no approved UTME Mathematics topics in this database")
    short = f"T{uuid.uuid4().hex[:6].upper()}"
    exam_id = None
    async with staff_login(client, "reviewer"):
        try:
            made = await client.post(
                "/v1/bank/exams",
                json={"name": "Test examination", "short_name": short, "exam_body": "Test council"},
            )
            exam_id = made.json()["id"]
            subject_id = (
                await client.post(
                    f"/v1/bank/exams/{exam_id}/subjects",
                    json={"name": "Mathematics", "copy_topics_from": source},
                )
            ).json()["subject_id"]

            # The subtopic list the outside AI is given: real codes, with their counts.
            subs = (await client.get(f"/v1/bank/subjects/{subject_id}/subtopics")).json()
            assert subs and all(s["code"] and s["questions"] == 0 for s in subs)
            code = subs[0]["code"]

            past = (
                await client.post(
                    f"/v1/bank/subjects/{subject_id}/papers", json={"exam_year": 2021}
                )
            ).json()
            ai = await client.post(
                f"/v1/bank/subjects/{subject_id}/papers",
                json={"title": "AI-generated practice 1", "ai_generated": True},
            )
            assert ai.status_code == 201 and ai.json()["ai_generated"] is True
            ai_id = ai.json()["paper_id"]

            batch = [
                _question(code),
                _question("MATH.99.z", stem="Invented subtopic?"),
                _question(code, stem="Answer not an option?", answer="E"),
            ]
            # Never into a past paper.
            refused = await client.post(
                f"/v1/bank/papers/{past['paper_id']}/import", json={"questions": batch}
            )
            assert refused.status_code == 409

            checked = (
                await client.post(f"/v1/bank/papers/{ai_id}/import", json={"questions": batch})
            ).json()
            assert checked["passed"] == 1 and checked["saved"] == 0
            verdicts = checked["verdicts"]
            assert verdicts[0]["ok"] and verdicts[0]["subtopic"].startswith(code)
            assert any("not in this subject's syllabus" in p for p in verdicts[1]["problems"])
            assert any("not one of the options" in p for p in verdicts[2]["problems"])

            saved = (
                await client.post(
                    f"/v1/bank/papers/{ai_id}/import", json={"questions": batch, "apply": True}
                )
            ).json()
            assert saved["saved"] == 1 and saved["verdicts"][0]["question_id"]
            page = (await client.get(f"/v1/bank/papers/{ai_id}")).json()
            assert [q["state"] for q in page["questions"]] == ["needs_review"]

            # Renamed; removed only with its questions.
            renamed = await client.patch(
                f"/v1/bank/papers/{ai_id}", json={"title": "AI practice, first batch"}
            )
            assert (
                renamed.status_code == 200 and renamed.json()["title"] == "AI practice, first batch"
            )
            assert (await client.delete(f"/v1/bank/papers/{ai_id}")).status_code == 409
            assert (
                await client.delete(f"/v1/bank/papers/{ai_id}", params={"with_questions": True})
            ).status_code == 204
        finally:
            if exam_id:
                await _drop_exam(exam_id)
