"""The admin content pages: subjects, the bank, one question, quality, mocks, check-ups."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pytest
from staff import remove, signed_up, staff_login

from app.db import database_is_reachable
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


PAGES = ("/v1/admin/content/subjects", "/v1/admin/questions", "/v1/admin/quality",
         "/v1/admin/mocks", "/v1/admin/checkups")


async def test_only_an_admin_sees_the_content_pages(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        for path in PAGES:
            assert (await client.get(path)).status_code == 403, path
    finally:
        await remove([person])


async def test_every_content_page_answers(client: httpx.AsyncClient) -> None:
    async with staff_login(client, "admin"):
        for path in PAGES:
            response = await client.get(path)
            assert response.status_code == 200, (path, response.text)
        for sort in ("most_answered", "least_accurate", "most_reported"):
            response = await client.get(f"/v1/admin/questions?sort={sort}&limit=5")
            assert response.status_code == 200, (sort, response.text)
        quality = (await client.get("/v1/admin/quality?minimum=1")).json()
        assert set(quality) >= {"key_doubts", "most_missed", "most_reported",
                                "lessons_not_landing"}
        assert all(item["note"] for group in ("key_doubts", "most_missed")
                   for item in quality[group])


async def test_a_subject_its_topics_and_one_question(client: httpx.AsyncClient) -> None:
    async with staff_login(client, "admin"):
        subjects = (await client.get("/v1/admin/content/subjects")).json()
        live = [s for s in subjects if s["questions"] > 0]
        if not live:
            pytest.skip("no live questions in this database")
        subject = live[0]
        topics = await client.get(f"/v1/admin/content/subjects/{subject['subject_id']}")
        assert topics.status_code == 200
        assert sum(t["questions"] for t in topics.json()) >= 1

        bank = (await client.get(
            f"/v1/admin/questions?subject_id={subject['subject_id']}&limit=3"
        )).json()
        assert bank["total"] >= 1
        assert all(q["subject_name"] == subject["name"] for q in bank["questions"])

        first = bank["questions"][0]
        found = (await client.get(
            f"/v1/admin/questions?q={first['question_number']}"
            f"&subject_id={subject['subject_id']}"
        )).json()
        assert first["question_id"] in [q["question_id"] for q in found["questions"]]

        detail = (await client.get(f"/v1/admin/questions/{first['question_id']}")).json()
        assert detail["stem"] == first["stem"]
        assert sum(o["is_correct"] for o in detail["options"]) >= 1  # the key is shown
        assert detail["answered"] == sum(o["chosen"] for o in detail["options"])

        missing = await client.get(f"/v1/admin/questions/{uuid4()}")
        assert missing.status_code == 404
