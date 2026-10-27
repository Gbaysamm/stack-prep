"""Forgotten passwords, changing a password, and changing the login, against the local database."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, remove, signed_up

from app.db import database_is_reachable, get_engine
from app.main import app
from app.routers import accounts

pytestmark = pytest.mark.integration


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """Emails the API would have sent: (to, body)."""
    sent: list[tuple[str, str]] = []

    async def capture(to: str, subject: str, body: str) -> bool:
        sent.append((to, body))
        return True

    monkeypatch.setattr(accounts, "send_email", capture)
    return sent


def code_in(body: str) -> str:
    found = re.search(r"\b(\d{6})\b", body)
    assert found, body
    return found.group(1)


async def test_a_forgotten_password_is_reset_with_the_emailed_code(
    client: httpx.AsyncClient, outbox: list[tuple[str, str]]
) -> None:
    person = await signed_up(client, "Reset Me")
    try:
        sent = await client.post("/v1/auth/forgot", json={"login": person.login.upper()})
        assert sent.status_code == 202, sent.text
        assert outbox and outbox[0][0] == person.login
        code = code_in(outbox[0][1])

        wrong = "000000" if code != "000000" else "111111"
        refused = await client.post(
            "/v1/auth/reset",
            json={"login": person.login, "code": wrong, "password": "a new password"},
        )
        assert refused.status_code == 422
        assert refused.json()["detail"] == accounts.BAD_CODE

        reset = await client.post(
            "/v1/auth/reset",
            json={"login": person.login, "code": code, "password": "a new password"},
        )
        assert reset.status_code == 200, reset.text
        assert reset.json()["student_id"] == person.student_id
        assert (await client.get("/v1/auth/me")).status_code == 200  # signed in by the reset

        again = await client.post(
            "/v1/auth/reset",
            json={"login": person.login, "code": code, "password": "another password"},
        )
        assert again.status_code == 422  # a code works once

        old = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": PASSWORD}
        )
        assert old.status_code == 401
        new = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": "a new password"}
        )
        assert new.status_code == 200
    finally:
        await remove([person])


async def test_the_reply_is_the_same_whether_or_not_the_account_exists(
    client: httpx.AsyncClient, outbox: list[tuple[str, str]]
) -> None:
    nobody = await client.post("/v1/auth/forgot", json={"login": "no-one-here@example.test"})
    assert nobody.status_code == 202
    assert nobody.json()["detail"] == accounts.RESET_SENT
    assert outbox == []
    phone = await client.post("/v1/auth/forgot", json={"login": "08031234567"})
    assert phone.status_code == 422


async def test_five_wrong_codes_spend_the_code(
    client: httpx.AsyncClient, outbox: list[tuple[str, str]]
) -> None:
    person = await signed_up(client)
    try:
        await client.post("/v1/auth/forgot", json={"login": person.login})
        code = code_in(outbox[0][1])
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(accounts.RESET_TRIES):
            body = {"login": person.login, "code": wrong, "password": "a new password"}
            assert (await client.post("/v1/auth/reset", json=body)).status_code == 422
        late = await client.post(
            "/v1/auth/reset",
            json={"login": person.login, "code": code, "password": "a new password"},
        )
        assert late.status_code == 422
    finally:
        await remove([person])


async def test_changing_the_password_needs_the_current_one(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        wrong = await client.post(
            "/v1/auth/password",
            json={"current_password": "not it at all", "new_password": "a new password"},
        )
        assert wrong.status_code == 422  # not 401: that would sign the student out
        assert wrong.json()["detail"] == accounts.WRONG_PASSWORD
        short = await client.post(
            "/v1/auth/password", json={"current_password": PASSWORD, "new_password": "short"}
        )
        assert short.status_code == 422
        done = await client.post(
            "/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": "a new password"},
        )
        assert done.status_code == 204, done.text
        assert (await client.get("/v1/auth/me")).status_code == 200  # this device stays in
        new = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": "a new password"}
        )
        assert new.status_code == 200
    finally:
        await remove([person])


async def test_the_login_can_change_but_never_to_nothing(client: httpx.AsyncClient) -> None:
    first = await signed_up(client)
    person = await signed_up(client)  # the client is signed in as this one
    try:
        details = (await client.get("/v1/auth/login-details")).json()
        assert details == {"email": person.login, "phone": None}

        phone = await client.post(
            "/v1/auth/login-details",
            json={"current_password": PASSWORD, "phone": "0803 123 4599"},
        )
        assert phone.status_code == 200, phone.text
        assert phone.json() == {"email": person.login, "phone": "+2348031234599"}

        none = await client.post(
            "/v1/auth/login-details",
            json={"current_password": PASSWORD, "email": "", "phone": None},
        )
        assert none.status_code == 422

        taken = await client.post(
            "/v1/auth/login-details", json={"current_password": PASSWORD, "email": first.login}
        )
        assert taken.status_code == 409

        by_phone = await client.post(
            "/v1/auth/login", json={"login": "08031234599", "password": PASSWORD}
        )
        assert by_phone.status_code == 200
    finally:
        await remove([first, person])
        # The phone login's attempts are recorded under the phone number.
        async with get_engine().begin() as conn:
            await conn.execute(text("DELETE FROM auth_attempts WHERE login = '+2348031234599'"))
