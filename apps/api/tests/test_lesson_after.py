"""After a subtopic lesson: the rating, the problems and the kept conversation with the coach
(app/routers/lesson_after.py)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text

from app.db import database_is_reachable, get_engine
from app.main import app
from app.routers.lesson_after import matches


def test_a_typed_answer_is_marked_however_it_is_written() -> None:
    assert matches("1:8", "1:8", [])
    assert matches(" 1 : 8 ", "1:8", [])
    assert matches("(c)", "C", [])
    assert matches("c.", "C", [])
    assert matches("Brass", "C", ["brass"])
    assert matches("x = 4", "4", [])
    assert matches("0.5", "1/2", [])
    assert matches(chr(0x2212) + "3", "-3", [])  # a typed minus sign
    assert matches("2,500", "2500", [])
    assert not matches("1:16", "1:8", [])
    assert not matches("B", "C", ["brass"])
    assert not matches("0.6", "1/2", [])


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.integration
async def test_after_the_lesson_the_answers_wait_until_tried_and_the_talk_is_kept(
    client: httpx.AsyncClient,
) -> None:
    async with get_engine().connect() as conn:
        found = (
            await conn.execute(
                text(
                    "SELECT subtopic_id FROM subtopic_lesson_content"
                    " WHERE jsonb_array_length(problems) > 0 LIMIT 1"
                )
            )
        ).scalar_one_or_none()
    if found is None:
        pytest.skip("no lesson with problems in this database")
    student = str((await client.post("/v1/dev/students", json={})).json()["student_id"])
    base = f"/v1/roadmap/{student}/lessons/{found}"
    try:
        page = (await client.get(f"{base}/after")).json()
        assert page["problems"] and page["rating"] is None and page["conversation"] == []
        # Nothing of the answer before it is tried.
        assert page["problems"][0]["tried"] is None
        assert "answer" not in page["problems"][0]

        wrong = (await client.post(f"{base}/problems/0/answer", json={"text": "zzz"})).json()
        assert wrong["correct"] is False and wrong["working"] and wrong["answer"]
        right = await client.post(f"{base}/problems/0/answer", json={"text": wrong["answer"]})
        assert right.json()["correct"] is True

        assert (await client.post(f"{base}/rating", json={"rating": 2})).status_code == 204
        assert (await client.post(f"{base}/rating", json={"rating": 9})).status_code == 422

        asked = await client.post(f"{base}/ask", json={"question": "Why is brass a mixture?"})
        # No AI key in tests: the coach falls back, or the plan does not include it.
        assert asked.status_code in (200, 402), asked.text
        again = (await client.get(f"{base}/after")).json()
        assert again["rating"] == 2
        assert again["problems"][0]["tried"]["correct"] is True
        if asked.status_code == 200:
            assert again["conversation"][0]["asked"] == "Why is brass a mixture?"
            assert again["conversation"][0]["reply"] == asked.json()["reply"]

        bad = await client.post(
            f"{base}/problems/0/photo",
            files={"photo": ("x.txt", b"not a photo", "text/plain")},
        )
        assert bad.status_code == 415
        assert (
            await client.post(f"{base}/problems/9/answer", json={"text": "1"})
        ).status_code == 404
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
            for statement in (
                "DELETE FROM lesson_ratings WHERE student_id = :id",
                "DELETE FROM lesson_problem_attempts WHERE student_id = :id",
                "DELETE FROM lesson_coach_turns WHERE student_id = :id",
                "DELETE FROM consents WHERE student_id = :id",
                "DELETE FROM students WHERE id = :id",
            ):
                await conn.execute(text(statement), {"id": student})
