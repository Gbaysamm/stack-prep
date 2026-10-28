"""The admin dashboard's overview, students list, one student's picture, and the actions."""

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


async def test_only_an_admin_sees_the_dashboard(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        for path in ("/v1/admin/overview", "/v1/admin/students",
                     f"/v1/admin/students/{person.student_id}"):
            assert (await client.get(path)).status_code == 403, path
    finally:
        await remove([person])


async def test_the_overview_counts_a_new_student(client: httpx.AsyncClient) -> None:
    person = await signed_up(client, "Overview Student")
    try:
        async with staff_login(client, "admin"):
            response = await client.get("/v1/admin/overview?days=7")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["days"] == 7 and len(body["series"]) == 7
            assert body["totals"]["new_students"] >= 1
            assert body["series"][-1]["signups"] >= 1
            assert [band["low"] for band in body["mock_scores"]] == list(range(0, 100, 10))
            # The admin who signed in is staff, so is not counted among the students.
            listed = (await client.get("/v1/admin/students?q=Overview Student")).json()
            assert [s["student_id"] for s in listed["students"]] == [person.student_id]
            assert listed["total"] == 1
    finally:
        await remove([person])


async def test_the_list_filters_and_the_profile_shows_everything(
    client: httpx.AsyncClient,
) -> None:
    person = await signed_up(client, "Profile Student")
    await client.patch(
        f"/v1/student/{person.student_id}/profile",
        json={"school_name": "Kings College", "state": "Lagos", "class_level": "ss3",
              "target_institution": "UNILAG", "target_course": "Medicine"},
    )
    try:
        async with staff_login(client, "admin"):
            found = (await client.get("/v1/admin/students?q=kings&class_level=ss3")).json()
            assert [s["student_id"] for s in found["students"]] == [person.student_id]
            none = (await client.get("/v1/admin/students?q=kings&class_level=ss1")).json()
            assert none["total"] == 0
            premium = (await client.get("/v1/admin/students?q=kings&premium=true")).json()
            assert premium["total"] == 0

            detail = await client.get(f"/v1/admin/students/{person.student_id}")
            assert detail.status_code == 200, detail.text
            body = detail.json()
            assert body["account"]["school_name"] == "Kings College"
            assert body["account"]["target_course"] == "Medicine"
            assert body["account"]["role"] == "student" and body["account"]["has_password"]
            assert len(body["activity"]["last_30_days"]) == 30
            assert body["progress"]["subjects"] == []
            assert body["mocks"] == []
            assert body["premium"]["premium"] is False
            missing = await client.get("/v1/admin/students/00000000-0000-0000-0000-000000000000")
            assert missing.status_code == 404
    finally:
        await remove([person])


async def test_a_temporary_password_works_and_signs_out_the_old_one(
    client: httpx.AsyncClient,
) -> None:
    person = await signed_up(client)
    try:
        async with staff_login(client, "admin"):
            made = await client.post(f"/v1/admin/students/{person.student_id}/password")
            assert made.status_code == 200, made.text
            temporary = made.json()["password"]
            assert len(temporary) == 14
        old = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": PASSWORD}
        )
        assert old.status_code != 200
        new = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": temporary}
        )
        assert new.status_code == 200, new.text
    finally:
        await remove([person])


async def test_suspending_ends_sessions_and_restoring_lets_them_back(
    client: httpx.AsyncClient,
) -> None:
    person = await signed_up(client)
    try:
        async with staff_login(client, "admin") as admin:
            own = await client.post(
                f"/v1/admin/students/{admin.student_id}/status", json={"status": "suspended"}
            )
            assert own.status_code == 409
            done = await client.post(
                f"/v1/admin/students/{person.student_id}/status", json={"status": "suspended"}
            )
            assert done.json()["status"] == "suspended"
        refused = await client.post(
            "/v1/auth/login", json={"login": person.login, "password": PASSWORD}
        )
        assert refused.status_code != 200
        async with staff_login(client, "admin"):
            back = await client.post(
                f"/v1/admin/students/{person.student_id}/status", json={"status": "active"}
            )
            assert back.json()["status"] == "active"
        assert (
            await client.post(
                "/v1/auth/login", json={"login": person.login, "password": PASSWORD}
            )
        ).status_code == 200
    finally:
        await remove([person])


async def test_a_role_is_given_and_taken_back(client: httpx.AsyncClient) -> None:
    person = await signed_up(client)
    try:
        async with staff_login(client, "admin") as admin:
            path = f"/v1/admin/students/{person.student_id}/role"
            made = await client.post(path, json={"role": "reviewer"})
            assert made.json()["role"] == "reviewer"
            back = await client.post(path, json={"role": "student"})
            assert back.json()["role"] == "student"
            own = await client.post(
                f"/v1/admin/students/{admin.student_id}/role", json={"role": "student"}
            )
            assert own.status_code == 409
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(
                text("DELETE FROM account_roles WHERE student_id = :s"), {"s": person.student_id}
            )
        await remove([person])
