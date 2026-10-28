"""The admin dashboard's front page and reports: they answer, and count what they should."""

from __future__ import annotations

from collections.abc import AsyncIterator

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


PAGES = ("/v1/admin/home", "/v1/admin/engagement", "/v1/admin/features", "/v1/admin/ai",
         "/v1/admin/revenue")


async def test_only_an_admin_sees_the_reports(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        for path in PAGES:
            assert (await client.get(path)).status_code == 403, path
    finally:
        await remove([person])


async def test_every_report_answers(client: httpx.AsyncClient) -> None:
    newcomer = await signed_up(client, "Brand New Student")
    try:
        async with staff_login(client, "admin"):
            for path in PAGES:
                response = await client.get(path)
                assert response.status_code == 200, (path, response.text)
            home = (await client.get("/v1/admin/home")).json()
            tiles = {tile["key"]: tile for tile in home["tiles"]}
            assert tiles["students"]["sub_value"] >= 1  # joined today
            assert newcomer.student_id in [p["student_id"] for p in home["new_students"]]

            engagement = (await client.get("/v1/admin/engagement?days=14")).json()
            assert len(engagement["daily_active"]) == 14
            assert all(len(c["active"]) == 8 for c in engagement["cohorts"])

            features = (await client.get("/v1/admin/features?days=7")).json()
            keys = {f["key"] for f in features}
            assert {"practice_questions", "mocks", "coach", "bookmarks"} <= keys
            assert all(len(f["series"]) == 7 for f in features)

            ai = (await client.get("/v1/admin/ai?days=7")).json()
            assert len(ai["daily"]) == 7 and ai["turns"] >= 0

            revenue = (await client.get("/v1/admin/revenue?months=6")).json()
            assert len(revenue["months"]) == 6
    finally:
        await remove([newcomer])
