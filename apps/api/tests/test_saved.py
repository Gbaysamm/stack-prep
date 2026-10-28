"""Bookmarks and problem reports (migration 034), against the local database."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import text
from staff import remove, signed_up, staff_login

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


async def a_question() -> str:
    async with get_engine().connect() as conn:
        version = (
            await conn.execute(
                text("SELECT question_version_id FROM deliverable_questions LIMIT 1")
            )
        ).scalar()
    if version is None:
        pytest.skip("no published questions in this database")
    return str(version)


async def test_a_bookmark_is_kept_listed_and_removed(client: httpx.AsyncClient) -> None:
    version = await a_question()
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/bookmarks"
    try:
        assert (await client.get(f"{path}/{version}")).json() == {"bookmarked": False}
        assert (await client.put(f"{path}/{version}")).json() == {"bookmarked": True}
        assert (await client.put(f"{path}/{version}")).status_code == 200  # twice is fine
        kept = (await client.get(path)).json()
        assert [item["question_version_id"] for item in kept] == [version]
        assert kept[0]["stem"] and kept[0]["practisable"] is True
        assert (await client.get(f"{path}/{version}")).json() == {"bookmarked": True}
        assert (await client.delete(f"{path}/{version}")).json() == {"bookmarked": False}
        assert (await client.get(path)).json() == []
        missing = await client.put(f"{path}/00000000-0000-0000-0000-000000000000")
        assert missing.status_code == 404
    finally:
        await remove([person])


async def test_a_student_cannot_touch_anothers_bookmarks(client: httpx.AsyncClient) -> None:
    version = await a_question()
    first = await signed_up(client)
    second = await signed_up(client)  # signed in as the second
    try:
        refused = await client.put(f"/v1/student/{first.student_id}/bookmarks/{version}")
        assert refused.status_code == 403
    finally:
        await remove([first, second])


async def test_a_report_reaches_the_admin_who_closes_it(client: httpx.AsyncClient) -> None:
    version = await a_question()
    person = await signed_up(client, "Reporting Student")
    report_id = None
    try:
        sent = await client.post(
            f"/v1/student/{person.student_id}/reports",
            json={
                "question_version_id": version,
                "reason": "wrong_answer",
                "detail": "  I think   it is C ",
                "where": "mock",
            },
        )
        assert sent.status_code == 201, sent.text
        again = await client.post(
            f"/v1/student/{person.student_id}/reports",
            json={"question_version_id": version, "reason": "typo", "where": "practice"},
        )
        assert again.status_code == 200
        assert again.json() == {"status": "already"}
        assert (await client.get("/v1/admin/reports")).status_code == 403  # a student

        async with staff_login(client, "admin"):
            listed = (await client.get("/v1/admin/reports")).json()
            mine = [r for r in listed["reports"] if r["reporter_student_id"] == person.student_id]
            assert len(mine) == 1
            report = mine[0]
            report_id = report["id"]
            assert report["detail"] == "I think it is C"
            assert report["where"] == "mock" and report["reporter_name"] == "Reporting Student"
            assert listed["open"] >= 1

            closed = await client.post(
                f"/v1/admin/reports/{report_id}/close",
                json={"outcome": "rejected", "note": "The key is right: B."},
            )
            assert closed.status_code == 200, closed.text
            assert closed.json()["status"] == "rejected"
            assert closed.json()["resolved_by_name"]
            twice = await client.post(
                f"/v1/admin/reports/{report_id}/close",
                json={"outcome": "fixed", "note": "again"},
            )
            assert twice.status_code == 404
            # The closing admin's reviewer row is removed with them, so the report goes first.
            async with get_engine().begin() as conn:
                await conn.execute(
                    text("DELETE FROM question_reports WHERE id = :id"), {"id": report_id}
                )
    finally:
        await remove([person])
