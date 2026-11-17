"""Notifications by email: the words, the settings, and the unsubscribe link (migration 062)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from staff import PASSWORD, Person, remove, signed_up

from app.db import database_is_reachable, get_engine
from app.main import app
from app.notification_email import email_text, report_words, subject_for, token_for


def row(title: str, pref: str = "reminders") -> dict[str, object]:
    return {
        "display_name": "Ada Obi",
        "title": title,
        "body": "One short practice keeps it going.",
        "link_url": "/home",
        "pref": pref,
    }


def test_one_email_holds_every_reminder_and_the_way_out() -> None:
    token = uuid.uuid4()
    rows = [row("Your 6-day streak ends at midnight"), row("Your exam is tomorrow")]
    body = email_text(rows, "https://app.example", token)
    assert body.startswith("Hi Ada,")
    assert "Your exam is tomorrow" in body and "https://app.example/home" in body
    assert f"https://app.example/unsubscribe/{token}?what=reminders" in body
    assert subject_for(rows) == "Your 6-day streak ends at midnight (and 1 more)"
    assert subject_for(rows[:1]) == "Your 6-day streak ends at midnight"


def test_the_weekly_report_words() -> None:
    week = {"answered": 80, "correct": 60, "days": 4, "ms": 4_800_000,
            "answered_before": 50, "correct_before": 30}
    topics = [
        {"topic": "Cell biology", "answered": 40, "accuracy": 0.9},
        {"topic": "Genetics", "answered": 20, "accuracy": 0.5},
    ]
    title, body = report_words(week, topics)
    assert title == "Your week: 80 questions at 75%"
    assert body.startswith("4 days, 1 h 20 min, 80 questions at 75%.")
    assert "Up from 60% the week before." in body
    assert "Most practised: Cell biology, Genetics." in body
    assert "Next week's focus: Genetics." in body
    quiet = {**week, "answered": 0, "correct": 0}
    assert report_words(quiet, [])[0] == "Your week: a quiet one"


pytestmark_db = pytest.mark.integration


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


@pytestmark_db
async def test_settings_and_the_unsubscribe_link(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Email Prefs Student")
    other = await signed_up(client, "Someone Else Prefs")
    try:
        await sign_in(client, student)
        url = f"/v1/student/{student.student_id}/notification-settings"
        prefs = (await client.get(url)).json()
        assert prefs["email_reminders"] and prefs["email_reports"] and prefs["email_account"]
        changed = await client.patch(url, json={"email_reports": False})
        assert changed.status_code == 200, changed.text
        assert changed.json()["email_reports"] is False
        assert changed.json()["email_reminders"] is True

        await sign_in(client, other)
        assert (await client.get(url)).status_code == 403

        async with get_engine().connect() as conn:
            token = await token_for(conn, uuid.UUID(student.student_id))
            await conn.commit()
        client.cookies.clear()
        link = f"/v1/public/notifications/unsubscribe/{token}"
        stopped = await client.post(link, json={"what": "reminders"})
        assert stopped.status_code == 200, stopped.text
        assert (await client.post(link, json={"what": "everything"})).status_code == 422
        bad = await client.post(
            f"/v1/public/notifications/unsubscribe/{uuid.uuid4()}", json={"what": "all"}
        )
        assert bad.status_code == 404

        await sign_in(client, student)
        prefs = (await client.get(url)).json()
        assert prefs["email_reminders"] is False and prefs["email_account"] is True
    finally:
        await remove([student, other])
