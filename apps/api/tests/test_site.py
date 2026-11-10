"""The public site's subjects: UTME only, named, with no counts or years."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest

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


async def test_the_site_counts_add_up(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/app/site")  # no sign-in needed
    assert response.status_code == 200, response.text
    site = response.json()
    # No counts and no years, for the bank or any subject: only the subjects' names.
    assert "questions" not in site and "questions_at_least" not in site
    assert all(set(s) == {"name"} for s in site["subjects"])
    assert 0 <= site["worked_percent"] <= 100
    names = [s["name"] for s in site["subjects"]]
    assert not any(name.startswith(("Practice subject", "Sandbox")) for name in names)
