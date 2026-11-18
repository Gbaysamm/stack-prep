"""Push notifications: a device is saved, pushes go once, a gone device is dropped (push.py)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, Person, remove, signed_up

from app import notification_email, push
from app.config import get_settings
from app.db import database_is_reachable, get_engine
from app.main import app

pytestmark = pytest.mark.integration

DEVICE = {
    "endpoint": "https://push.example.test/send/abc123",
    "keys": {"p256dh": "BPublicKeyOfTheBrowser", "auth": "authsecret"},
}


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


def test_the_key_pair_and_the_payload() -> None:
    public, private = push.make_keys()
    assert len(public) == 87 and len(private) == 43
    body = json.loads(
        push.payload({"title": "7-day streak!", "body": None, "link_url": None, "kind": "x"})
    )
    assert body == {"title": "7-day streak!", "body": "", "url": "/notifications", "tag": "x"}


async def test_a_device_gets_each_notification_once(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    public, private = push.make_keys()
    monkeypatch.setattr(get_settings(), "vapid_public_key", public)
    monkeypatch.setattr(get_settings(), "vapid_private_key", private)
    sent: list[dict[str, Any]] = []
    answers = [201, 410]

    def fake_send(subscription: dict[str, Any], data: str) -> int:
        sent.append({"to": subscription["endpoint"], **json.loads(data)})
        return answers.pop(0)

    monkeypatch.setattr(push, "_send", fake_send)
    # The test sends itself; the within-seconds send after sign-up would race it.
    monkeypatch.setattr(notification_email, "send_soon", lambda student_id: None)
    student = await signed_up(client, "Push Test Student")
    try:
        assert (await client.get("/v1/push/key")).json() == {"key": public}
        await sign_in(client, student)
        url = f"/v1/student/{student.student_id}/push-subscriptions"
        assert (await client.post(url, json=DEVICE)).status_code == 204
        assert (await client.post(url, json=DEVICE)).status_code == 204  # the same device again
        bad = {**DEVICE, "endpoint": "http://not-secure.test/x"}
        assert (await client.post(url, json=bad)).status_code == 422

        # The welcome from signing up is due: pushed once, then never again.
        async with get_engine().connect() as conn:
            assert await push.send_due(conn, student.student_id) == 1
            assert await push.send_due(conn, student.student_id) == 0
        assert sent[0]["to"] == DEVICE["endpoint"] and sent[0]["title"].startswith("Welcome")

        # A push service saying the device is gone (410) drops it.
        async with get_engine().connect() as conn:
            await conn.execute(
                text(
                    "INSERT INTO notifications (student_id, kind, category, title, dedupe_key)"
                    " VALUES (:s, 'streak_risk', 'nudge', 'Your streak', 'push-test')"
                ),
                {"s": student.student_id},
            )
            await conn.commit()
            assert await push.send_due(conn, student.student_id) == 0
            left = await conn.scalar(
                text("SELECT count(*) FROM push_subscriptions WHERE student_id = :s"),
                {"s": student.student_id},
            )
        assert left == 0

        assert (await client.post(url, json=DEVICE)).status_code == 204
        gone = await client.post(f"{url}/remove", json={"endpoint": DEVICE["endpoint"]})
        assert gone.status_code == 204
    finally:
        await remove([student])
