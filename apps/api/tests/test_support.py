"""Support and announcements: a student writes and reads the reply; the admin announces."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import PASSWORD, Person, remove, signed_up, staff_login

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


async def test_a_student_writes_and_reads_the_reply(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Support Student")
    other = await signed_up(client, "Someone Else")
    try:
        await sign_in(client, student)
        base = f"/v1/student/{student.student_id}/support"
        started = await client.post(base, json={
            "topic": "payment", "subject": "My plan didn't start",
            "body": "I paid this morning but practice still says free.",
        })
        assert started.status_code == 201, started.text
        thread = started.json()
        assert thread["status"] == "open"
        assert len(thread["thread_messages"]) == 1

        # Nobody else can read it.
        await sign_in(client, other)
        assert (await client.get(f"{base}/{thread['id']}")).status_code == 403
        own = f"/v1/student/{other.student_id}/support/{thread['id']}"
        assert (await client.get(own)).status_code == 404

        async with staff_login(client, "admin"):
            inbox = (await client.get("/v1/admin/support")).json()
            assert thread["id"] in [t["id"] for t in inbox["threads"]]
            line = next(t for t in inbox["threads"] if t["id"] == thread["id"])
            assert line["who"] == "Support Student"
            replied = await client.post(
                f"/v1/admin/support/{thread['id']}/messages",
                json={"body": "Sorted: your Standard plan is on now."},
            )
            assert replied.status_code == 200, replied.text
            assert replied.json()["status"] == "answered"
            log = (await client.get("/v1/admin/audit?limit=5")).json()
            assert any(entry["action"] == "support.reply" for entry in log["entries"])

        await sign_in(client, student)
        # The reply is also a notification, beside the welcome (routers/notifications.py).
        notes_url = f"/v1/student/{student.student_id}/notifications"
        inbox = (await client.get(notes_url)).json()
        kinds = [n["kind"] for n in inbox["items"]]
        assert kinds[0] == "support_reply" and "welcome" in kinds
        assert inbox["unread"] == len(kinds) == inbox["total"]
        reply_note = inbox["items"][0]
        assert reply_note["link_url"] == f"/messages/{thread['id']}"
        read = await client.post(f"{notes_url}/{reply_note['id']}/read", json={"read": True})
        assert read.status_code == 204
        assert (await client.get(notes_url)).json()["unread"] == len(kinds) - 1
        assert (await client.delete(f"{notes_url}/{reply_note['id']}")).status_code == 204
        left = (await client.get(notes_url)).json()["items"]
        assert reply_note["id"] not in [n["id"] for n in left]
        assert (await client.post(f"{notes_url}/read")).status_code == 204
        assert (await client.get(notes_url)).json()["unread"] == 0
        # Someone else's notifications are not theirs to read.
        other_url = f"/v1/student/{other.student_id}/notifications"
        assert (await client.get(other_url)).status_code == 403

        mine = (await client.get(base)).json()
        assert mine[0]["id"] == thread["id"] and mine[0]["unread"] is True
        opened = (await client.get(f"{base}/{thread['id']}")).json()
        assert opened["thread_messages"][-1]["from_staff"] is True
        assert (await client.get(base)).json()[0]["unread"] is False

        again = await client.post(f"{base}/{thread['id']}/messages", json={"body": "Thank you!"})
        assert again.json()["status"] == "open"

        async with staff_login(client, "admin"):
            closed = await client.put(
                f"/v1/admin/support/{thread['id']}/status", json={"status": "closed"}
            )
            assert closed.json()["status"] == "closed"
    finally:
        await remove([student, other])


async def test_the_contact_form(client: httpx.AsyncClient) -> None:
    email = f"contact-{uuid.uuid4().hex[:10]}@example.test"
    message = {"name": "A Parent", "email": email, "topic": "other",
               "subject": "School licences", "body": "Do you sell to schools?"}
    try:
        for _ in range(3):
            assert (await client.post("/v1/contact", json=message)).status_code == 202
        # A fourth from the same address in a day waits.
        assert (await client.post("/v1/contact", json=message)).status_code == 429
        # A robot filling the hidden field is thanked, and nothing is kept.
        robot = {**message, "email": f"x{email}", "website": "http://spam.example"}
        assert (await client.post("/v1/contact", json=robot)).status_code == 202
        async with get_engine().connect() as conn:
            kept = (await conn.execute(
                text("SELECT count(*) FROM support_threads WHERE email IN (:a, :b)"),
                {"a": email, "b": f"x{email}"},
            )).scalar_one()
        assert kept == 3
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(
                text("DELETE FROM support_threads WHERE email LIKE :e"), {"e": f"%{email}"}
            )


async def test_announcements_reach_their_audience(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Announced To")
    made: list[str] = []
    try:
        async with staff_login(client, "admin"):
            for body in (
                {"kind": "banner", "title": "Mocks are free this week", "audience": "all",
                 "link_label": "Sit one", "link_url": "/mock"},
                {"kind": "popup", "title": "Thanks for being on a plan", "audience": "paid"},
                {"kind": "banner", "title": "Switched off", "active": False},
            ):
                response = await client.post("/v1/admin/announcements", json=body)
                assert response.status_code == 201, response.text
                made.append(response.json()["id"])
            assert (await client.post("/v1/admin/announcements", json={
                "kind": "banner", "title": "Half a link", "link_label": "Go",
            })).status_code == 422
            listed = (await client.get("/v1/admin/announcements")).json()
            states = {a["id"]: a["state"] for a in listed}
            assert states[made[0]] == "showing" and states[made[2]] == "off"

        await sign_in(client, student)
        base = f"/v1/student/{student.student_id}/announcements"
        seen = [a["id"] for a in (await client.get(base)).json()]
        assert made[0] in seen  # everyone
        assert made[1] not in seen  # a free student isn't on a plan
        assert made[2] not in seen  # switched off

        assert (await client.post(f"{base}/{made[0]}/dismiss")).status_code == 204
        assert made[0] not in [a["id"] for a in (await client.get(base)).json()]
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(
                text("DELETE FROM announcements WHERE id::text = ANY(:ids)"), {"ids": made}
            )
        await remove([student])
