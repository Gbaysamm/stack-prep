"""The check-up sends the next question ahead when this answer cannot change it, so the app
can show it at once and save in the background. Whatever it sends ahead must be exactly the
question the sitting moves to once the answer is in, right or wrong."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text

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


async def _richest_subject() -> str | None:
    """A subject with live questions in several topics, or None."""
    async with get_engine().connect() as conn:
        found = (
            await conn.execute(
                text(
                    """
                    SELECT dq.subject_id FROM deliverable_questions dq
                    JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
                    JOIN curriculum_items sub ON sub.id = skill.parent_id
                    GROUP BY dq.subject_id
                    HAVING count(DISTINCT sub.parent_id) >= 4
                    ORDER BY count(*) DESC LIMIT 1
                    """
                )
            )
        ).scalar_one_or_none()
    return str(found) if found else None


async def test_what_is_sent_ahead_is_what_comes_next(client: httpx.AsyncClient) -> None:
    subject = await _richest_subject()
    if subject is None:
        pytest.skip("no subject with questions in several topics in this database")
    made = await client.post("/v1/dev/students", json={})
    assert made.status_code == 200, made.text
    student = str(made.json()["student_id"])
    try:
        state = (
            await client.post(
                "/v1/checkup/start", json={"student_id": student, "subject_id": subject}
            )
        ).json()
        sent_ahead = 0
        for turn in range(30):
            if state["finished"]:
                break
            ahead = state.get("upcoming")
            # Alternate right-ish and wrong-ish picks; the result must not matter.
            pick = state["question"]["options"][turn % len(state["question"]["options"])]
            state = (
                await client.post(
                    f"/v1/checkup/{state['session_id']}/answer",
                    json={
                        "question_version_id": state["question"]["question_version_id"],
                        "selected_option_key": pick["option_key"],
                        "response_ms": 5000,
                    },
                )
            ).json()
            if ahead is not None and not state["finished"]:
                sent_ahead += 1
                assert state["question"] == ahead
        assert state["finished"]
        assert sent_ahead > 0, "a check-up across several topics sends questions ahead"
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
            for statement in (
                "DELETE FROM attempts WHERE student_id = :s",
                "DELETE FROM study_sessions WHERE student_id = :s",
                "DELETE FROM consents WHERE student_id = :s",
                "DELETE FROM students WHERE id = :s",
            ):
                await conn.execute(text(statement), {"s": student})
