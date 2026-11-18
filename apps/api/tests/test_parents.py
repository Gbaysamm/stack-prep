"""Parents: a student adds one, the parent confirms from the email (routers/parents.py)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, Person, remove, signed_up

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


async def test_a_parent_is_added_confirms_and_stays(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Parent Test Student")
    other = await signed_up(client, "Someone Else Parent")
    try:
        await sign_in(client, student)
        url = f"/v1/student/{student.student_id}/parents"
        added = await client.post(
            url,
            json={"name": "Ngozi Okafor", "email": "Ngozi@Example.test", "relationship": "mother"},
        )
        assert added.status_code == 201, added.text
        mother = added.json()[0]
        assert mother["status"] == "pending" and mother["email"] == "ngozi@example.test"

        # The invitation went (recorded once) and was dated.
        async with get_engine().connect() as conn:
            sent = await conn.scalar(
                text("SELECT count(*) FROM parent_emails WHERE guardian_student_id = :l"),
                {"l": mother["id"]},
            )
            token = await conn.scalar(
                text("SELECT invite_token FROM guardian_students WHERE id = :l"),
                {"l": mother["id"]},
            )
        assert sent == 1

        again = await client.post(
            url, json={"name": "Ngozi", "email": "ngozi@example.test", "relationship": "mother"}
        )
        assert again.status_code == 409
        bad = await client.post(url, json={"name": "X", "email": "nope", "relationship": "father"})
        assert bad.status_code == 422

        # Taken back while waiting, then added again.
        father = (
            await client.post(
                url,
                json={
                    "name": "Emeka Okafor",
                    "email": "emeka@example.test",
                    "relationship": "father",
                },
            )
        ).json()[1]
        assert (await client.delete(f"{url}/{father['id']}")).status_code == 204
        assert len((await client.get(url)).json()) == 1

        # Nobody else sees them.
        await sign_in(client, other)
        assert (await client.get(url)).status_code == 403

        # The parent confirms, signed in or not; twice is fine; the consent is recorded.
        client.cookies.clear()
        page = await client.get(f"/v1/public/parents/{token}")
        assert page.json() == {
            "student_name": "Parent Test Student",
            "parent_name": "Ngozi Okafor",
            "confirmed": False,
        }
        assert (await client.post(f"/v1/public/parents/{token}/confirm")).json()["confirmed"]
        assert (await client.post(f"/v1/public/parents/{token}/confirm")).status_code == 200
        async with get_engine().connect() as conn:
            consent = await conn.scalar(
                text(
                    "SELECT count(*) FROM consents WHERE student_id = :s "
                    "AND consent_type = 'guardian_digest' AND granted"
                ),
                {"s": student.student_id},
            )
        assert consent == 1

        # Confirmed: the student cannot remove them.
        await sign_in(client, student)
        assert (await client.get(url)).json()[0]["status"] == "active"
        assert (await client.delete(f"{url}/{mother['id']}")).status_code == 409
    finally:
        await remove([student, other])
