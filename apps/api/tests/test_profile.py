"""A student's profile and result settings (migration 032), against the local database."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from staff import remove, signed_up

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


async def test_a_new_student_starts_empty_and_on_percentages(client: httpx.AsyncClient) -> None:
    person = await signed_up(client, "Ada Obi")
    try:
        body = (await client.get(f"/v1/student/{person.student_id}/profile")).json()
        assert body["display_name"] == "Ada Obi"
        assert body["email"] == person.login and body["phone"] is None
        assert body["score_display"] == "percentage"
        assert body["target_aggregate"] is None and body["school_name"] is None
    finally:
        await remove([person])


async def test_only_what_is_sent_changes(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/profile"
    try:
        changed = await client.patch(
            path,
            json={
                "school_name": "  Kings   College ",
                "class_level": "ss3",
                "target_institution": "University of Lagos",
                "target_course": "Medicine",
                "score_display": "aggregate",
                "target_aggregate": 290,
            },
        )
        assert changed.status_code == 200, changed.text
        body = changed.json()
        assert body["school_name"] == "Kings College"
        assert (body["class_level"], body["score_display"], body["target_aggregate"]) == (
            "ss3",
            "aggregate",
            290,
        )
        again = (await client.patch(path, json={"target_course": None})).json()
        assert again["target_course"] is None
        assert again["target_institution"] == "University of Lagos"
        assert (await client.patch(path, json={"target_aggregate": 401})).status_code == 422
        assert (await client.patch(path, json={"score_display": None})).status_code == 422
    finally:
        await remove([person])


async def test_a_student_cannot_read_anothers_profile(client: httpx.AsyncClient) -> None:
    first = await signed_up(client)
    second = await signed_up(client)  # the client is now signed in as the second
    try:
        response = await client.get(f"/v1/student/{first.student_id}/profile")
        assert response.status_code == 403
    finally:
        await remove([first, second])
