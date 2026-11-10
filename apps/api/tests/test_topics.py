"""A subject's topics: add a topic, subtopic and skills to a subject with none, see the counts,
rename, and remove only once the questions under it have somewhere else to go."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from staff import staff_login
from test_bank import _drop_exam

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


async def test_topics_flow(client: httpx.AsyncClient) -> None:
    short = f"T{uuid.uuid4().hex[:6].upper()}"
    exam_id = None
    async with staff_login(client, "reviewer"):
        try:
            made = await client.post(
                "/v1/bank/exams",
                json={"name": "Topics test", "short_name": short, "exam_body": "Test council"},
            )
            assert made.status_code == 201, made.text
            exam_id = made.json()["id"]
            subject = await client.post(
                f"/v1/bank/exams/{exam_id}/subjects", json={"name": "Geography"}
            )
            assert subject.status_code == 201, subject.text
            subject_id = subject.json()["subject_id"]

            tree = (await client.get(f"/v1/bank/subjects/{subject_id}/topics")).json()
            assert tree["items"] == [] and tree["syllabus_version_id"] is None

            add = f"/v1/bank/subjects/{subject_id}/topics"
            topic = await client.post(add, json={"name": "Maps"})
            assert topic.status_code == 201, topic.text
            assert topic.json()["kind"] == "topic"
            sub = await client.post(add, json={"name": "Scale", "parent_id": topic.json()["id"]})
            assert sub.json()["kind"] == "subtopic"
            first = (
                await client.post(add, json={"name": "Ratio scale", "parent_id": sub.json()["id"]})
            ).json()
            second = (
                await client.post(add, json={"name": "Line scale", "parent_id": sub.json()["id"]})
            ).json()
            assert first["kind"] == "skill" and first["code"] != second["code"]
            under_skill = await client.post(add, json={"name": "No", "parent_id": first["id"]})
            assert under_skill.status_code == 422

            paper = await client.post(
                f"/v1/bank/subjects/{subject_id}/papers", json={"exam_year": 2020}
            )
            assert paper.status_code == 201, paper.text
            question = {
                "stem": "A map's scale is 1 : 50 000. What does 2 cm show?",
                "options": [
                    {"key": k, "body": b}
                    for k, b in zip("ABCD", ["1 km", "10 km", "100 m", "5 km"], strict=True)
                ],
                "answer": "A",
                "solution_steps": ["2 cm times 50 000 = 100 000 cm = 1 km."],
                "hints": ["Multiply, then change cm to km."],
                "level": 1,
                "skill_id": first["id"],
            }
            added = await client.post(
                f"/v1/bank/papers/{paper.json()['paper_id']}/questions", json=question
            )
            assert added.status_code == 201, added.text

            counts = {
                item["id"]: item["questions"]
                for item in (await client.get(f"/v1/bank/subjects/{subject_id}/topics")).json()[
                    "items"
                ]
            }
            assert counts[topic.json()["id"]] == 1 and counts[second["id"]] == 0
            listed = (await client.get(f"/v1/bank/topics/{topic.json()['id']}/questions")).json()
            assert [q["question_id"] for q in listed] == [added.json()["question_id"]]

            renamed = await client.put(f"/v1/bank/topics/{first['id']}", json={"name": "Scales"})
            assert renamed.status_code == 200 and renamed.json()["name"] == "Scales"

            # The guardrail: not removed while a question is filed under it with nowhere to go.
            refused = await client.post(f"/v1/bank/topics/{first['id']}/remove", json={})
            assert refused.status_code == 409
            inside = await client.post(
                f"/v1/bank/topics/{sub.json()['id']}/remove",
                json={"move_to_skill_id": second["id"]},
            )
            assert inside.status_code == 422
            moved = await client.post(
                f"/v1/bank/topics/{first['id']}/remove", json={"move_to_skill_id": second["id"]}
            )
            assert moved.status_code == 200, moved.text
            assert moved.json()["moved"] == 1
            items = (await client.get(f"/v1/bank/subjects/{subject_id}/topics")).json()["items"]
            assert first["id"] not in {i["id"] for i in items}
            assert next(i for i in items if i["id"] == second["id"])["questions"] == 1
        finally:
            if exam_id:
                await _drop_exam(exam_id)
