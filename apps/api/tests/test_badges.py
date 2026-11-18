"""Badges: unlocked once from what was done, shown once, listed on the shelf (app/badges.py)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, Person, remove, signed_up

from app import badges
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


async def sign_in(client: httpx.AsyncClient, person: Person) -> None:
    client.cookies.clear()
    response = await client.post(
        "/v1/auth/login", json={"login": person.login, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text


async def test_a_badge_unlocks_once_and_shows_once(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Badge Test Student")
    sid = UUID(student.student_id)
    try:
        async with get_engine().connect() as conn:
            assert await badges.check(conn, sid, 0) == []
            # A finished day's plan (the daily goal XP) unlocks "Day done"; a 7-day streak too.
            await conn.execute(
                text(
                    "INSERT INTO xp_events (student_id, reason, amount, dedupe_key)"
                    " VALUES (:s, 'daily_goal', 25, 'daily-test')"
                ),
                {"s": sid},
            )
            new = await badges.check(conn, sid, 7)
            assert {b.id for b in new} == {"day_done", "streak_7"}
            assert await badges.check(conn, sid, 7) == []
            await conn.commit()

        await sign_in(client, student)
        game = (await client.get(f"/v1/student/{sid}/game")).json()
        assert {b["id"] for b in game["badges_new"]} == {"day_done", "streak_7"}
        seen = await client.post(f"/v1/student/{sid}/badges/seen", json={"ids": ["day_done"]})
        assert seen.status_code == 204
        game = (await client.get(f"/v1/student/{sid}/game")).json()
        assert [b["id"] for b in game["badges_new"]] == ["streak_7"]

        shelf = (await client.get(f"/v1/student/{sid}/badges")).json()
        assert len(shelf) == len(badges.BADGES)
        by_id = {b["id"]: b for b in shelf}
        assert by_id["day_done"]["unlocked_at"] is not None
        assert by_id["right_100"]["unlocked_at"] is None and by_id["right_100"]["target"] == 100
    finally:
        await remove([student])
