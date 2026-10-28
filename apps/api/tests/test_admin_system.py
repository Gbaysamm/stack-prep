"""Settings, system health and the audit log (migration 036)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, remove, signed_up, staff_login

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
    # Settings are shared by the whole database: put back any a test changed.
    async with get_engine().begin() as conn:
        await conn.execute(
            text("DELETE FROM app_settings WHERE key IN ('signups_open', 'notice')")
        )


async def test_only_an_admin_reaches_the_system_pages(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        for path in ("/v1/admin/settings", "/v1/admin/health", "/v1/admin/audit"):
            assert (await client.get(path)).status_code == 403, path
    finally:
        await remove([person])


async def test_settings_change_take_effect_and_are_logged(client: httpx.AsyncClient) -> None:
    async with staff_login(client, "admin") as admin:
        listed = (await client.get("/v1/admin/settings")).json()
        assert {"signups_open", "coach_enabled", "notice"} <= {s["key"] for s in listed}
        bad = await client.put("/v1/admin/settings", json={"signups_open": "no"})
        assert bad.status_code == 422
        unknown = await client.put("/v1/admin/settings", json={"nope": True})
        assert unknown.status_code == 422
        changed = await client.put(
            "/v1/admin/settings", json={"signups_open": False, "notice": "  Back at 6pm  "}
        )
        assert changed.status_code == 200, changed.text
        values = {s["key"]: s["value"] for s in changed.json()}
        assert values["signups_open"] is False and values["notice"] == "Back at 6pm"

        log = (await client.get("/v1/admin/audit?action=setting")).json()
        mine = [e for e in log["entries"] if e["actor_id"] == admin.student_id]
        assert len(mine) == 2
        assert "setting.change" in log["actions"]

    shown = (await client.get("/v1/app/settings")).json()
    assert shown["signups_open"] is False and shown["notice"] == "Back at 6pm"
    refused = await client.post(
        "/v1/auth/signup",
        json={"display_name": "Late", "login": "late-signup@example.test", "password": PASSWORD},
    )
    assert refused.status_code == 403
    assert "closed" in refused.json()["detail"]


async def test_an_admin_action_is_in_the_audit_log(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Audited Student")
    try:
        async with staff_login(client, "admin") as admin:
            done = await client.post(
                f"/v1/admin/students/{student.student_id}/status", json={"status": "suspended"}
            )
            assert done.status_code == 200
            log = (
                await client.get(f"/v1/admin/audit?target_id={student.student_id}")
            ).json()
            assert [e["action"] for e in log["entries"]] == ["student.suspend"]
            entry = log["entries"][0]
            assert entry["summary"] == "Suspended Audited Student"
            assert entry["actor_id"] == admin.student_id
            found = (await client.get("/v1/admin/audit?q=Audited")).json()
            assert found["entries"]
    finally:
        await remove([student])


async def test_health_says_what_is_set_up(client: httpx.AsyncClient) -> None:
    async with staff_login(client, "admin"):
        health = await client.get("/v1/admin/health")
        assert health.status_code == 200, health.text
        body = health.json()
        names = {check["name"]: check for check in body["checks"]}
        assert names["Database"]["state"] in ("ok", "warning")
        assert names["Database changes (migrations)"]["state"] == "ok"
        assert "Payments (Paystack)" in names
        assert body["counts"]["accounts"] >= 1
