"""Student sign-up, sign-in and sessions, against the local database.

Every student here is made with a login unique to the run, and removed by id at the end;
nothing is deleted by pattern, so no other student can be caught up in the cleanup.
"""

from __future__ import annotations

import random
import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text

from app.auth import SESSION_COOKIE, hash_token
from app.db import database_is_reachable, get_engine
from app.main import app
from app.routers.accounts import normalise_login
from app.routers.dev import CLEAR_STUDENTS_SQL

pytestmark = pytest.mark.integration

PASSWORD = "correct horse battery"


def test_logins_are_normalised() -> None:
    assert normalise_login("  Ada.Obi@Example.COM ") == ("email", "ada.obi@example.com")
    assert normalise_login("0803 123-4567") == ("phone", "+2348031234567")
    assert normalise_login("2348031234567") == ("phone", "+2348031234567")
    assert normalise_login("+234 803 123 4567") == ("phone", "+2348031234567")
    for bad in ("", "ada@", "ada@example", "12345", "+447700900123", "08031234"):
        assert normalise_login(bad) is None, bad


class Tracker:
    """What a test created, so the teardown removes exactly that."""

    def __init__(self) -> None:
        self.students: set[str] = set()
        self.logins: set[str] = set()

    def email(self) -> str:
        address = f"auth-{uuid.uuid4().hex[:12]}@example.test"
        self.logins.add(address)
        return address

    def phone(self) -> tuple[str, str]:
        """(as typed, as stored)."""
        rest = "".join(random.choices("0123456789", k=8))
        self.logins.add(f"+23470{rest}")
        return f"070 {rest[:4]}-{rest[4:]}", f"+23470{rest}"


@pytest.fixture
async def tracker() -> AsyncIterator[Tracker]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    created = Tracker()
    yield created
    async with get_engine().begin() as conn:
        ids = list(created.students)
        if ids:
            await conn.execute(
                text("DELETE FROM consents WHERE student_id::text = ANY(:ids)"), {"ids": ids}
            )
            # Credentials and sessions cascade with the student.
            await conn.execute(
                text("DELETE FROM students WHERE id::text = ANY(:ids)"), {"ids": ids}
            )
        await conn.execute(
            text("DELETE FROM auth_attempts WHERE login = ANY(:logins)"),
            {"logins": list(created.logins)},
        )


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def signup(
    client: httpx.AsyncClient, tracker: Tracker, login: str, **extra: object
) -> httpx.Response:
    body = {"display_name": "  Ada Obi ", "login": login, "password": PASSWORD, **extra}
    response = await client.post("/v1/auth/signup", json=body)
    if response.status_code == 201:
        tracker.students.add(response.json()["student_id"])
    return response


async def test_signup_with_an_email(client: httpx.AsyncClient, tracker: Tracker) -> None:
    email = tracker.email()
    response = await signup(client, tracker, f"  {email.upper()} ")
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"student_id", "display_name", "login", "role"}
    assert body["role"] == "student"
    assert body["display_name"] == "Ada Obi"
    assert body["login"] == email

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=2592000" in cookie
    assert "Path=/" in cookie
    assert "Secure" not in cookie  # plain http here

    async with get_engine().connect() as conn:
        row = (
            (
                await conn.execute(
                    text(
                        """
                        SELECT s.email, s.phone, s.status, s.external_ref,
                               c.password_hash,
                               (SELECT count(*) FROM consents k WHERE k.student_id = s.id
                                  AND k.consent_type = 'data_processing' AND k.granted
                                  AND k.revoked_at IS NULL) AS consents,
                               (SELECT token_hash FROM auth_sessions a
                                  WHERE a.student_id = s.id) AS token_hash
                        FROM students s JOIN student_credentials c ON c.student_id = s.id
                        WHERE s.id = :id
                        """
                    ),
                    {"id": body["student_id"]},
                )
            )
            .mappings()
            .one()
        )
    assert (row["email"], row["phone"], row["status"]) == (email, None, "active")
    assert row["external_ref"] is None
    assert row["password_hash"].startswith("$argon2id$")
    assert PASSWORD not in row["password_hash"]
    assert row["consents"] == 1
    # Only the token's hash is stored.
    assert row["token_hash"] == hash_token(client.cookies[SESSION_COOKIE])


async def test_signup_with_a_phone_number_and_secure_cookie_behind_https(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    typed, stored = tracker.phone()
    response = await client.post(
        "/v1/auth/signup",
        json={"display_name": "Tunde", "login": typed, "password": PASSWORD},
        headers={"x-forwarded-proto": "https"},
    )
    assert response.status_code == 201, response.text
    tracker.students.add(response.json()["student_id"])
    assert response.json()["login"] == stored
    assert "Secure" in response.headers["set-cookie"]

    # Signing in with another spelling of the same number finds the same student.
    local = "0" + stored[4:]
    response = await client.post("/v1/auth/login", json={"login": local, "password": PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json()["login"] == stored


async def test_a_login_can_only_be_taken_once(client: httpx.AsyncClient, tracker: Tracker) -> None:
    email = tracker.email()
    assert (await signup(client, tracker, email)).status_code == 201
    again = await signup(client, tracker, email.upper())
    assert again.status_code == 409
    assert again.json() == {"detail": "An account with that email or phone number already exists."}


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"password": "short"}, "Use at least 8 characters for your password."),
        ({"password": "x" * 129}, "Use 128 characters or fewer for your password."),
        ({"login": "not a login"}, "Enter a valid email address or Nigerian phone number."),
        ({"login": "+447700900123"}, "Enter a valid email address or Nigerian phone number."),
        ({"display_name": "   "}, "Enter your name."),
        ({"display_name": "n" * 61}, "Keep your name to 60 characters or fewer."),
    ],
)
async def test_invalid_signups_are_refused_in_plain_words(
    client: httpx.AsyncClient, tracker: Tracker, changes: dict[str, str], detail: str
) -> None:
    body = {"display_name": "Ada", "login": tracker.email(), "password": PASSWORD, **changes}
    response = await client.post("/v1/auth/signup", json=body)
    assert response.status_code == 422
    assert response.json() == {"detail": detail}


async def test_the_password_cannot_be_the_login(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    email = tracker.email()
    response = await client.post(
        "/v1/auth/signup", json={"display_name": "Ada", "login": email, "password": email}
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Your password can't be your email or phone number."}


async def test_login_me_and_logout(client: httpx.AsyncClient, tracker: Tracker) -> None:
    email = tracker.email()
    created = (await signup(client, tracker, email)).json()
    client.cookies.clear()

    assert (await client.get("/v1/auth/me")).json() == {"detail": "Not signed in."}
    assert (await client.get("/v1/auth/me")).status_code == 401

    wrong = await client.post("/v1/auth/login", json={"login": email, "password": "wrong-pass"})
    unknown = await client.post(
        "/v1/auth/login", json={"login": tracker.email(), "password": PASSWORD}
    )
    for response in (wrong, unknown):
        assert response.status_code == 401
        assert response.json() == {"detail": "That email/phone and password don't match."}
        assert SESSION_COOKIE not in response.cookies

    response = await client.post("/v1/auth/login", json={"login": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json() == created

    me = await client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json() == created

    token = client.cookies[SESSION_COOKIE]
    out = await client.post("/v1/auth/logout")
    assert out.status_code == 204
    assert f'{SESSION_COOKIE}=""' in out.headers["set-cookie"]
    assert "Max-Age=0" in out.headers["set-cookie"]
    async with get_engine().connect() as conn:
        left = (
            await conn.execute(
                text("SELECT count(*) FROM auth_sessions WHERE token_hash = :h"),
                {"h": hash_token(token)},
            )
        ).scalar_one()
    assert left == 0

    # The old token is dead even if a browser kept it.
    client.cookies.set(SESSION_COOKIE, token)
    assert (await client.get("/v1/auth/me")).status_code == 401


async def test_me_slides_the_expiry_of_a_session_in_use(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    await signup(client, tracker, tracker.email())
    token_hash = hash_token(client.cookies[SESSION_COOKIE])
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                """
                UPDATE auth_sessions
                SET last_seen_at = now() - interval '3 days',
                    expires_at = now() + interval '27 days',
                    created_at = now() - interval '3 days'
                WHERE token_hash = :h
                """
            ),
            {"h": token_hash},
        )
    response = await client.get("/v1/auth/me")
    assert response.status_code == 200
    assert "Max-Age=2592000" in response.headers["set-cookie"]
    async with get_engine().connect() as conn:
        days_left = (
            await conn.execute(
                text(
                    "SELECT extract(epoch FROM expires_at - now()) / 86400 "
                    "FROM auth_sessions WHERE token_hash = :h"
                ),
                {"h": token_hash},
            )
        ).scalar_one()
    assert days_left > 29.9

    # Expired sessions are not honoured.
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "UPDATE auth_sessions SET created_at = now() - interval '31 days', "
                "expires_at = now() - interval '1 second' WHERE token_hash = :h"
            ),
            {"h": token_hash},
        )
    assert (await client.get("/v1/auth/me")).status_code == 401


async def test_ten_failures_lock_the_login(client: httpx.AsyncClient, tracker: Tracker) -> None:
    email = tracker.email()
    await signup(client, tracker, email)
    for _ in range(10):
        response = await client.post(
            "/v1/auth/login", json={"login": email, "password": "not-the-password"}
        )
        assert response.status_code == 401
    # Even the right password is refused until the window passes.
    locked = await client.post("/v1/auth/login", json={"login": email, "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json() == {"detail": "Too many attempts. Wait a few minutes and try again."}

    # Once the failures are older than the window, the login works again.
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "UPDATE auth_attempts SET attempted_at = attempted_at - interval '16 minutes' "
                "WHERE login = :login"
            ),
            {"login": email},
        )
    ok = await client.post("/v1/auth/login", json={"login": email, "password": PASSWORD})
    assert ok.status_code == 200


async def test_a_sandbox_student_can_be_claimed(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    made = await client.post("/v1/dev/students", json={})
    assert made.status_code == 200, made.text
    sandbox = made.json()
    tracker.students.add(sandbox["student_id"])

    email = tracker.email()
    response = await signup(client, tracker, email, claim_student_id=sandbox["student_id"])
    assert response.status_code == 201, response.text
    assert response.json() == {
        "student_id": sandbox["student_id"],
        "display_name": "Ada Obi",
        "login": email,
        "role": "student",
    }
    async with get_engine().connect() as conn:
        row = (
            (
                await conn.execute(
                    text(
                        """
                        SELECT email, status, external_ref,
                               (SELECT count(*) FROM consents WHERE student_id = s.id) AS consents
                        FROM students s WHERE id = :id
                        """
                    ),
                    {"id": sandbox["student_id"]},
                )
            )
            .mappings()
            .one()
        )
    assert (row["email"], row["status"], row["external_ref"]) == (
        email,
        "active",
        sandbox["external_ref"],
    )
    assert row["consents"] == 1

    # A claimed student cannot be claimed twice: the second sign-up gets a student of its own.
    other = await signup(client, tracker, tracker.email(), claim_student_id=sandbox["student_id"])
    assert other.status_code == 201
    assert other.json()["student_id"] != sandbox["student_id"]

    # And the sandbox cleanup no longer treats the claimed student as disposable. (Running
    # it here would clear every other sandbox student too, so its selection is checked.)
    assert "student_credentials" in str(CLEAR_STUDENTS_SQL)


async def test_signup_with_both_an_email_and_a_phone(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    email = tracker.email()
    typed, stored = tracker.phone()
    body = {"display_name": "Ada", "email": email, "phone": typed, "password": PASSWORD}
    made = await client.post("/v1/auth/signup", json=body)
    assert made.status_code == 201, made.text
    tracker.students.add(made.json()["student_id"])
    assert made.json()["login"] == email

    # Either one signs in.
    for login in (email, typed):
        client.cookies.clear()
        signed = await client.post("/v1/auth/login", json={"login": login, "password": PASSWORD})
        assert signed.status_code == 200, (login, signed.text)

    # Taken, each named on its own.
    again = await client.post("/v1/auth/signup", json={**body, "phone": tracker.phone()[0]})
    assert again.status_code == 409 and "email" in again.json()["detail"]
    other = await client.post("/v1/auth/signup", json={**body, "email": tracker.email()})
    assert other.status_code == 409 and "phone" in other.json()["detail"]
    async with get_engine().connect() as conn:
        phone = (await conn.execute(
            text("SELECT phone FROM students WHERE email = :e"), {"e": email}
        )).scalar_one()
    assert phone == stored


async def test_signup_needs_both_and_each_in_its_place(
    client: httpx.AsyncClient, tracker: Tracker
) -> None:
    base = {"display_name": "Ada", "password": PASSWORD}
    cases = [
        {"email": tracker.email()},  # no phone
        {"phone": tracker.phone()[0]},  # no email
        {"email": tracker.phone()[0], "phone": tracker.phone()[0]},  # a phone as the email
        {"email": tracker.email(), "phone": tracker.email()},  # an email as the phone
    ]
    for extra in cases:
        response = await client.post("/v1/auth/signup", json={**base, **extra})
        assert response.status_code == 422, (extra, response.text)
