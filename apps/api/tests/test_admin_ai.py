"""The question writer's AI settings: admin only, the key stored sealed and never sent back,
switching provider needs a new key, and a cap that can be set and lifted."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import staff_login

from app import ai_writer, secret_box
from app.db import database_is_reachable, get_engine
from app.main import app

pytestmark = pytest.mark.integration

FAKE_KEY = "sk-ant-test-0000000000000000000000000000wxyz"


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def _stored() -> dict | None:
    async with get_engine().connect() as conn:
        row = (await conn.execute(text("SELECT * FROM ai_writer_settings"))).mappings().first()
    return dict(row) if row else None


async def _restore(row: dict | None) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(text("DELETE FROM ai_writer_settings"))
        if row:
            columns = ", ".join(row)
            await conn.execute(
                text(
                    f"INSERT INTO ai_writer_settings ({columns}) VALUES "
                    f"({', '.join(':' + c for c in row)})"
                ),
                row,
            )


async def test_only_admins(client: httpx.AsyncClient) -> None:
    assert (await client.get("/v1/admin/ai-writer")).status_code == 401
    async with staff_login(client, "reviewer"):
        assert (await client.get("/v1/admin/ai-writer")).status_code == 403


async def test_settings_keep_the_key_sealed(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = await _stored()
    async with staff_login(client, "admin"):
        try:
            body = {
                "provider": "anthropic",
                "model": "claude-opus-5-5",
                "api_key": FAKE_KEY,
                "input_usd_per_million": 4,
                "output_usd_per_million": 20,
                "monthly_cap_usd": 25,
            }
            saved = await client.put("/v1/admin/ai-writer", json=body)
            assert saved.status_code == 200, saved.text
            out = saved.json()
            assert out["key_set"] and out["key_hint"] == "wxyz"
            assert FAKE_KEY not in saved.text
            assert out["monthly_cap_usd"] == 25

            row = await _stored()
            assert row and FAKE_KEY not in row["api_key_encrypted"]
            assert secret_box.open_secret(row["api_key_encrypted"]) == FAKE_KEY

            # Prices change, the key stays.
            kept = await client.put(
                "/v1/admin/ai-writer", json={**body, "api_key": None, "monthly_cap_usd": None}
            )
            assert kept.json()["key_hint"] == "wxyz" and kept.json()["monthly_cap_usd"] is None

            # A key belongs to one provider.
            switched = await client.put(
                "/v1/admin/ai-writer", json={**body, "api_key": None, "provider": "openai"}
            )
            assert switched.status_code == 422

            # Checking uses the stored key without sending it anywhere it shouldn't go.
            seen: list[tuple[str, str]] = []

            async def fake_check(provider: str, key: str) -> ai_writer.KeyCheck:
                seen.append((provider, key))
                return ai_writer.KeyCheck(True, "The key works: 1 models available.", ["m"])

            monkeypatch.setattr(ai_writer, "check_key", fake_check)
            checked = await client.post("/v1/admin/ai-writer/check", json={"provider": "anthropic"})
            assert checked.json()["ok"] and seen == [("anthropic", FAKE_KEY)]

            removed = await client.put("/v1/admin/ai-writer", json={**body, "api_key": ""})
            assert removed.json()["key_set"] is False
        finally:
            await _restore(before)
