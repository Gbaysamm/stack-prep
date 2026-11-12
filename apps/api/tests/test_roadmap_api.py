"""The roadmap through the API: built after the first check-up, its runs started and linked,
re-planned when a check-up finishes, with the old plan kept on record."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text

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


async def _subject() -> str | None:
    """A subject with live questions in several topics, or None."""
    async with get_engine().connect() as conn:
        found = (
            await conn.execute(
                text(
                    """
                    SELECT dq.subject_id FROM deliverable_questions dq
                    JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
                    JOIN curriculum_items sub ON sub.id = skill.parent_id
                    GROUP BY dq.subject_id
                    HAVING count(DISTINCT sub.parent_id) >= 4
                    ORDER BY count(*) DESC LIMIT 1
                    """
                )
            )
        ).scalar_one_or_none()
    return str(found) if found else None


async def _checkup(client: httpx.AsyncClient, student: str, subject: str) -> str:
    state = (
        await client.post(
            "/v1/checkup/start", json={"student_id": student, "subject_id": subject}
        )
    ).json()
    session = state["session_id"]
    for _ in range(30):
        if state["finished"]:
            break
        state = (
            await client.post(
                f"/v1/checkup/{session}/answer",
                json={
                    "question_version_id": state["question"]["question_version_id"],
                    "selected_option_key": state["question"]["options"][0]["option_key"],
                    "response_ms": 5000,
                },
            )
        ).json()
    return str(session)


async def _rows(sql: str, **params: Any) -> list[dict[str, Any]]:
    async with get_engine().connect() as conn:
        return [dict(r) for r in (await conn.execute(text(sql), params)).mappings()]


async def test_the_roadmap_follows_the_student(client: httpx.AsyncClient) -> None:
    subject = await _subject()
    if subject is None:
        pytest.skip("no subject with questions in several topics in this database")
    student = str((await client.post("/v1/dev/students", json={})).json()["student_id"])
    other = str((await client.post("/v1/dev/students", json={})).json()["student_id"])
    try:
        await _checkup(client, student, subject)
        first = await client.get(f"/v1/roadmap/{student}")
        assert first.status_code == 200, first.text
        plan = first.json()
        assert plan["reason"] == "first"
        # One subject is not four: no total out of 400 is claimed.
        assert plan["total_now"] is None and plan["status"] == "needs_checkups"
        runs = [i for i in plan["items"] if i["kind"] == "run"]
        assert runs and runs[0]["state"] == "to_do" and runs[0]["subtopic_name"]
        assert all(i["value"] in ("high", "medium", "low") for i in runs)
        assert all(isinstance(i["level"], int) and 0 <= i["level"] <= 5 for i in runs)

        # The roadmap picks the runs: the student's own choice waits for the first milestone,
        # a general run for today's plan; bookmarks are always open.
        assert plan["record"]["own_runs_in"] == 10
        own = await client.post(
            "/v1/practice/start",
            json={
                "student_id": student,
                "subject_id": subject,
                "subtopic_ids": [runs[0]["subtopic_id"]],
            },
        )
        assert own.status_code == 428 and "10 more planned runs" in own.json()["detail"]
        general = await client.post(
            "/v1/practice/start", json={"student_id": student, "subject_id": subject}
        )
        assert general.status_code == 428
        marked = await client.post(
            "/v1/practice/start",
            json={"student_id": student, "subject_id": subject, "bookmarked": True},
        )
        assert marked.status_code != 428

        started = await client.post(f"/v1/roadmap/{student}/items/{runs[0]['id']}/start")
        assert started.status_code == 200, started.text
        assert started.json()["path"].startswith("/practice/")
        again = (await client.get(f"/v1/roadmap/{student}")).json()
        assert again["built_for"] == plan["built_for"] and again["reason"] == "first"
        mine = next(i for i in again["items"] if i["id"] == runs[0]["id"])
        assert mine["state"] == "in_progress"
        assert mine["session_id"] == started.json()["session_id"]
        # Starting it twice carries on with the same run.
        twice = await client.post(f"/v1/roadmap/{student}/items/{runs[0]['id']}/start")
        assert twice.json()["session_id"] == started.json()["session_id"]

        # Someone else's roadmap is not theirs to start.
        assert (
            await client.post(f"/v1/roadmap/{other}/items/{runs[0]['id']}/start")
        ).status_code == 404

        # A later check-up re-plans; the first plan stays on record with what happened.
        async with get_engine().begin() as conn:
            await conn.execute(
                text(
                    "UPDATE study_sessions SET started_at = started_at - interval '1 day',"
                    " ended_at = ended_at - interval '1 day'"
                    " WHERE student_id = :s AND session_type = 'checkup'"
                ),
                {"s": student},
            )
            await conn.execute(
                text(
                    "UPDATE roadmaps SET inputs = jsonb_set(inputs, '{subjects,0,last_checkup}',"
                    " to_jsonb((CURRENT_DATE - 1)::text)) WHERE student_id = :s"
                ),
                {"s": student},
            )
        await _checkup(client, student, subject)
        replanned = (await client.get(f"/v1/roadmap/{student}")).json()
        assert replanned["reason"] == "checkup"
        kept = await _rows(
            "SELECT status, (SELECT count(*) FROM roadmap_items i WHERE i.roadmap_id = r.id)"
            " AS items FROM roadmaps r WHERE student_id = :s ORDER BY created_at",
            s=student,
        )
        assert [r["status"] for r in kept] == ["replaced", "active"]
        assert kept[0]["items"] > 0
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
            for statement in (
                "DELETE FROM roadmaps WHERE student_id = ANY(:ids)",
                "DELETE FROM attempts WHERE student_id = ANY(:ids)",
                "DELETE FROM study_sessions WHERE student_id = ANY(:ids)",
                "DELETE FROM consents WHERE student_id = ANY(:ids)",
                "DELETE FROM students WHERE id = ANY(:ids)",
            ):
                await conn.execute(
                    text(statement.replace(":ids", "CAST(:ids AS uuid[])")),
                    {"ids": [student, other]},
                )


def test_levels_follow_the_spec_mastery_bands() -> None:
    from app.routers.roadmap import level_of

    assert level_of(None, 0) == 0 and level_of(0.9, 2) == 0  # not enough answers yet
    assert [level_of(m, 5) for m in (0.2, 0.4, 0.65, 0.8, 0.9)] == [1, 2, 3, 4, 5]


async def test_a_bank_lesson_comes_down_as_one_kept_file(client: httpx.AsyncClient) -> None:
    """The whole lesson in one download (app/lesson_package.py); asked again with the version
    the phone holds, a 304 and nothing more. Without a voice it is the board alone."""
    import json
    import struct

    found = await _rows(
        "SELECT c.subtopic_id, jsonb_array_length(c.moments) AS n FROM subtopic_lesson_content c"
        " LIMIT 1"
    )
    if not found:
        pytest.skip("no written lesson in the bank in this database")
    subtopic, moments = str(found[0]["subtopic_id"]), int(found[0]["n"])
    student = str((await client.post("/v1/dev/students", json={})).json()["student_id"])
    url = f"/v1/roadmap/{student}/lessons/{subtopic}/package?engine=none"

    first = await client.get(url)
    assert first.status_code == 200
    data = first.content
    assert data[:4] == b"SPL1"
    (size,) = struct.unpack(">I", data[4:8])
    header = json.loads(data[8 : 8 + size])
    assert header["engine"] == "none" and header["title"]
    assert len(header["lesson"]["beats"]) == moments
    assert header["clips"] == [None] * moments
    assert first.headers["x-lesson-complete"] == "1"

    again = await client.get(url, headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304 and again.content == b""

    nothing = "00000000-0000-0000-0000-000000000000"
    missing = await client.get(f"/v1/roadmap/{student}/lessons/{nothing}/package?engine=none")
    assert missing.status_code == 404
