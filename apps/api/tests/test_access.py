"""Who may read and write a student's data, against the local database.

A signed-in student may act only as themselves. With no session, only a legacy sandbox
tester — a `sandbox:` student who never set a password — still gets through; everyone else
is asked to log in. Built on the guided loop's fixture for a subject with questions in it.

Every student made here is removed by id at the end, with what it wrote; nothing is deleted
by pattern.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from test_practice import fixture

from app.db import get_engine
from app.main import app

pytestmark = pytest.mark.integration

# Used by name; imported so pytest can find it here.
__all__ = ["fixture"]

PASSWORD = "correct horse battery"


class People:
    """A fresh client per identity, and every student and login they made."""

    def __init__(self) -> None:
        self.students: set[str] = set()
        self.logins: set[str] = set()
        self.clients: list[httpx.AsyncClient] = []

    def client(self) -> httpx.AsyncClient:
        made = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        self.clients.append(made)
        return made

    async def account(self, claim: str | None = None) -> tuple[httpx.AsyncClient, str]:
        """A signed-up student and a client holding its cookie."""
        client = self.client()
        login = f"access-{uuid.uuid4().hex[:12]}@example.test"
        self.logins.add(login)
        body: dict[str, object] = {"display_name": "Ada", "login": login, "password": PASSWORD}
        if claim is not None:
            body["claim_student_id"] = claim
        response = await client.post("/v1/auth/signup", json=body)
        assert response.status_code == 201, response.text
        student = str(response.json()["student_id"])
        self.students.add(student)
        return client, student

    async def sandbox(self) -> str:
        response = await self.client().post("/v1/dev/students", json={})
        assert response.status_code == 200, response.text
        student = str(response.json()["student_id"])
        self.students.add(student)
        return student


@pytest.fixture
async def people(fixture: dict[str, str]) -> AsyncIterator[People]:
    made = People()
    yield made
    for client in made.clients:
        await client.aclose()
    async with get_engine().begin() as conn:
        await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
        ids = list(made.students)
        for statement in (
            "DELETE FROM tutor_turns WHERE student_id::text = ANY(:ids)",
            "DELETE FROM attempts WHERE student_id::text = ANY(:ids)",
            "DELETE FROM study_sessions WHERE student_id::text = ANY(:ids)",
            "DELETE FROM student_exam_goals WHERE student_id::text = ANY(:ids)",
            "DELETE FROM consents WHERE student_id::text = ANY(:ids)",
            # Credentials and sessions cascade with the student.
            "DELETE FROM students WHERE id::text = ANY(:ids)",
        ):
            await conn.execute(text(statement), {"ids": ids})
        await conn.execute(
            text("DELETE FROM auth_attempts WHERE login = ANY(:logins)"),
            {"logins": list(made.logins)},
        )


async def start(client: httpx.AsyncClient, student: str, ids: dict[str, str]) -> httpx.Response:
    return await client.post(
        "/v1/practice/start",
        json={"student_id": student, "subject_id": ids["subject_id"], "length": 2},
    )


async def answer(client: httpx.AsyncClient, state: dict[str, Any]) -> httpx.Response:
    return await client.post(
        f"/v1/practice/{state['session_id']}/answer",
        json={
            "question_version_id": state["question"]["question_version_id"],
            "selected_option_key": "A",
            "response_ms": 9000,
        },
    )


async def test_an_account_reaches_its_own_data(people: People, fixture: dict[str, str]) -> None:
    client, student = await people.account()

    assert (await client.get(f"/v1/student/{student}/overview")).status_code == 200
    goal = await client.put(
        f"/v1/student/{student}/goals/{fixture['subject_id']}",
        json={"target_score": 70, "exam_date": (date.today() + timedelta(days=90)).isoformat()},
    )
    assert goal.status_code == 200, goal.text
    goals = await client.get(f"/v1/student/{student}/goals")
    assert goals.status_code == 200
    assert len(goals.json()) == 1

    started = await start(client, student, fixture)
    assert started.status_code == 200, started.text
    state = started.json()
    answered = await answer(client, state)
    assert answered.status_code == 200, answered.text
    assert (await client.get(f"/v1/practice/{state['session_id']}")).status_code == 200
    assert (await client.get(f"/v1/student/{student}/practice")).status_code == 200


async def test_another_account_is_refused(people: People, fixture: dict[str, str]) -> None:
    owner, student = await people.account()
    stranger, _ = await people.account()
    state = (await start(owner, student, fixture)).json()

    for response in (
        await stranger.get(f"/v1/student/{student}/overview"),
        await stranger.get(f"/v1/student/{student}/goals"),
        await stranger.get(f"/v1/student/{student}/sittings"),
        await start(stranger, student, fixture),
        await stranger.get(f"/v1/practice/{state['session_id']}"),
        await answer(stranger, state),
        await stranger.get(f"/v1/student/{student}/lesson-feedback"),
        await stranger.get(f"/v1/student/{student}/lesson-feedback/entries"),
        await stranger.post(
            f"/v1/practice/{state['session_id']}/lesson/"
            f"{state['question']['question_version_id']}/feedback",
            json={"context": "after_guess", "understood": "got_it"},
        ),
    ):
        assert response.status_code == 403, response.text
        assert response.json() == {"detail": "That isn't your account."}


async def test_an_account_without_its_cookie_must_log_in(
    people: People, fixture: dict[str, str]
) -> None:
    owner, student = await people.account()
    state = (await start(owner, student, fixture)).json()
    nobody = people.client()

    for response in (
        await nobody.get(f"/v1/student/{student}/overview"),
        await nobody.get(f"/v1/student/{student}/goals"),
        await start(nobody, student, fixture),
        await nobody.get(f"/v1/practice/{state['session_id']}"),
        await answer(nobody, state),
    ):
        assert response.status_code == 401, response.text
        assert response.json() == {"detail": "Log in to continue."}


async def test_a_legacy_sandbox_student_needs_no_cookie(
    people: People, fixture: dict[str, str]
) -> None:
    student = await people.sandbox()
    nobody = people.client()

    assert (await nobody.get(f"/v1/student/{student}/overview")).status_code == 200
    started = await start(nobody, student, fixture)
    assert started.status_code == 200, started.text
    assert (await answer(nobody, started.json())).status_code == 200


async def test_a_claimed_sandbox_student_must_log_in(
    people: People, fixture: dict[str, str]
) -> None:
    student = await people.sandbox()
    owner, claimed = await people.account(claim=student)
    assert claimed == student
    nobody = people.client()

    assert (await nobody.get(f"/v1/student/{student}/overview")).status_code == 401
    assert (await start(nobody, student, fixture)).status_code == 401
    # Its own cookie still works.
    assert (await owner.get(f"/v1/student/{student}/overview")).status_code == 200


async def test_an_unknown_student_still_404s(people: People, fixture: dict[str, str]) -> None:
    nobody = people.client()
    unknown = uuid.uuid4()
    assert (await nobody.get(f"/v1/student/{unknown}/overview")).status_code == 404
    assert (await start(nobody, str(unknown), fixture)).status_code == 404
    assert (await nobody.get(f"/v1/practice/{unknown}")).status_code == 404
