"""The student's own endpoints: the catalogue, the goal, and the list of sittings.

The catalogue test is the one that matters. A subject with an approved syllabus and no
approved questions has to appear and say why, because hiding it is how a catalogue comes to
look complete when it is not.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db import database_is_reachable, get_engine
from app.main import app
from app.routers.student import SESSION_MINUTES, sessions_before

pytestmark = pytest.mark.integration


@pytest.fixture
async def fixture() -> AsyncIterator[dict[str, str]]:
    """A student, and an active subject with no approved questions.

    The subject matters as much as the student: the test database is built from migrations
    and holds no seed data, so without one the catalogue is empty and a test asserting on it
    would pass by looking at nothing.
    """
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    engine = get_engine()
    suffix = uuid.uuid4().hex[:8]
    ids: dict[str, str] = {}
    async with engine.begin() as conn:
        ids["student"] = str(
            (
                await conn.execute(
                    text(
                        """
                        INSERT INTO students (display_name, external_ref, status,
                          requires_guardian_consent)
                        VALUES (:n, :ref, 'active', false) RETURNING id
                        """
                    ),
                    {"n": f"Goal test student {suffix}", "ref": f"sandbox:test-{suffix}"},
                )
            ).scalar_one()
        )
        ids["exam"] = str(
            (
                await conn.execute(
                    text(
                        """
                        INSERT INTO examinations (name, short_name, exam_body, country_code,
                          status)
                        VALUES (:n, :s, 'Test body', 'NG', 'active') RETURNING id
                        """
                    ),
                    {"n": f"Student test exam {suffix}", "s": f"ST{suffix[:5]}"},
                )
            ).scalar_one()
        )
        ids["subject"] = str(
            (
                await conn.execute(
                    text(
                        """
                        INSERT INTO subjects (examination_id, code, name, status)
                        VALUES (CAST(:e AS uuid), 'STU', 'Student test subject', 'active')
                        RETURNING id
                        """
                    ),
                    {"e": ids["exam"]},
                )
            ).scalar_one()
        )
    yield ids
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
        for statement in (
            "DELETE FROM student_exam_goals WHERE student_id = CAST(:s AS uuid)",
            "DELETE FROM students WHERE id = CAST(:s AS uuid)",
        ):
            await conn.execute(text(statement), {"s": ids["student"]})
        await conn.execute(
            text("DELETE FROM subjects WHERE id = CAST(:x AS uuid)"), {"x": ids["subject"]}
        )
        await conn.execute(
            text("DELETE FROM examinations WHERE id = CAST(:e AS uuid)"), {"e": ids["exam"]}
        )


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def test_a_goal_without_a_date_has_no_runway() -> None:
    """Sessions cannot be counted towards a date that was never given."""
    assert sessions_before(None, 45, [1, 2, 3]) is None
    assert sessions_before(date.today() + timedelta(days=30), None, [1, 2, 3]) is None


def test_a_date_already_past_leaves_no_sessions() -> None:
    assert sessions_before(date.today() - timedelta(days=1), 45, [1, 2, 3, 4, 5]) == 0


def test_the_runway_counts_only_the_days_the_student_named() -> None:
    """Seven days a week is twice the runway of three, on the same calendar."""
    when = date.today() + timedelta(days=70)
    every_day = sessions_before(when, SESSION_MINUTES, [1, 2, 3, 4, 5, 6, 7])
    three_days = sessions_before(when, SESSION_MINUTES, [1, 3, 5])
    assert every_day is not None and three_days is not None
    assert every_day > three_days * 2


def test_a_longer_evening_is_more_than_one_session() -> None:
    when = date.today() + timedelta(days=70)
    short = sessions_before(when, SESSION_MINUTES, [1, 2, 3])
    long = sessions_before(when, SESSION_MINUTES * 2, [1, 2, 3])
    assert short is not None and long is not None
    assert long == short * 2


async def test_the_catalogue_shows_what_is_not_ready_and_why(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    response = await client.get("/v1/student/catalogue")
    assert response.status_code == 200, response.text
    subjects = {
        subject["subject_id"]: subject for exam in response.json() for subject in exam["subjects"]
    }
    mine = subjects[fixture["subject"]]
    # An active subject with no approved questions is listed, not hidden, and says why.
    assert mine["ready"] is False
    assert mine["deliverable_questions"] == 0
    assert mine["blocked_reason"] is not None
    for subject in subjects.values():
        # Ready and blocked are two halves of one statement: exactly one of them holds.
        assert subject["ready"] == (subject["blocked_reason"] is None)


async def test_a_goal_round_trips_and_replaces_itself(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    student, subject_id = fixture["student"], fixture["subject"]
    when = (date.today() + timedelta(days=100)).isoformat()

    first = await client.put(
        f"/v1/student/{student}/goals/{subject_id}",
        json={
            "target_score": 70,
            "exam_date": when,
            "minutes_per_day": 45,
            "study_days": [1, 2, 3],
        },
    )
    assert first.status_code == 200, first.text
    assert first.json()["sessions_before_exam"] is not None

    # Setting it again replaces the active goal rather than leaving two for a reader to
    # choose between; the database only allows one active goal per subject anyway.
    second = await client.put(
        f"/v1/student/{student}/goals/{subject_id}",
        json={
            "target_score": 85,
            "exam_date": when,
            "minutes_per_day": 90,
            "study_days": [1, 2, 3, 4, 5, 6],
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["target_score"] == 85

    goals = (await client.get(f"/v1/student/{student}/goals")).json()
    assert len(goals) == 1
    assert goals[0]["target_score"] == 85
    assert goals[0]["sessions_before_exam"] > first.json()["sessions_before_exam"]


async def test_a_goal_for_an_unknown_student_is_refused(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    response = await client.put(
        f"/v1/student/{uuid.uuid4()}/goals/{fixture['subject']}",
        json={"target_score": 70, "exam_date": date.today().isoformat()},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------------------------
# How an examination is sat: one date for all its subjects, or one per paper
# ---------------------------------------------------------------------------------------------


@pytest.fixture
async def sittings_fixture() -> AsyncIterator[dict[str, str]]:
    """A student, an exam sat together (three subjects, at most two), and one sat by paper."""
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    engine = get_engine()
    suffix = uuid.uuid4().hex[:8]
    ids: dict[str, str] = {}

    async def one(conn: AsyncConnection, sql: str, **params: object) -> str:
        result = await conn.execute(text(sql), params)
        return str(result.scalar_one())

    async with engine.begin() as conn:
        ids["student"] = await one(
            conn,
            """
            INSERT INTO students (display_name, external_ref, status, requires_guardian_consent)
            VALUES (:n, :ref, 'active', false) RETURNING id
            """,
            n=f"Sitting test student {suffix}",
            ref=f"sandbox:test-{suffix}",
        )
        ids["together"] = await one(
            conn,
            """
            INSERT INTO examinations (name, short_name, exam_body, country_code, status,
              sits_together, max_subjects, compulsory_subject_codes)
            VALUES (:n, :s, 'Test body', 'NG', 'active', true, 2, ARRAY['TA'])
            RETURNING id
            """,
            n=f"Together test exam {suffix}",
            s=f"TG{suffix[:5]}",
        )
        ids["by_paper"] = await one(
            conn,
            """
            INSERT INTO examinations (name, short_name, exam_body, country_code, status)
            VALUES (:n, :s, 'Test body', 'NG', 'active') RETURNING id
            """,
            n=f"By paper test exam {suffix}",
            s=f"BP{suffix[:5]}",
        )
        for key, exam, code, name in (
            ("ta", "together", "TA", "Alpha"),
            ("tb", "together", "TB", "Beta"),
            ("tc", "together", "TC", "Gamma"),
            ("pa", "by_paper", "PA", "Physics"),
            ("pb", "by_paper", "PB", "Chemistry"),
            ("pc", "by_paper", "PC", "Biology"),
        ):
            ids[key] = await one(
                conn,
                """
                INSERT INTO subjects (examination_id, code, name, status)
                VALUES (CAST(:e AS uuid), :c, :n, 'active') RETURNING id
                """,
                e=ids[exam],
                c=code,
                n=name,
            )
    yield ids
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
        await conn.execute(
            text("DELETE FROM student_exam_goals WHERE student_id = CAST(:s AS uuid)"),
            {"s": ids["student"]},
        )
        await conn.execute(
            text("DELETE FROM students WHERE id = CAST(:s AS uuid)"), {"s": ids["student"]}
        )
        for exam in ("together", "by_paper"):
            await conn.execute(
                text("DELETE FROM subjects WHERE examination_id = CAST(:e AS uuid)"),
                {"e": ids[exam]},
            )
            await conn.execute(
                text("DELETE FROM examinations WHERE id = CAST(:e AS uuid)"), {"e": ids[exam]}
            )


def _goal(when: date | None, target: int = 70) -> dict[str, object]:
    return {
        "target_score": target,
        "exam_date": when.isoformat() if when else None,
        "minutes_per_day": 45,
        "study_days": [1, 2, 3, 4, 5],
    }


async def test_the_catalogue_says_how_an_exam_is_sat(
    client: httpx.AsyncClient, sittings_fixture: dict[str, str]
) -> None:
    catalogue = (await client.get("/v1/student/catalogue")).json()
    exams = {exam["examination_id"]: exam for exam in catalogue}
    together = exams[sittings_fixture["together"]]
    assert together["sits_together"] is True
    assert together["max_subjects"] == 2
    assert together["compulsory_subject_codes"] == ["TA"]
    assert {s["code"]: s["compulsory"] for s in together["subjects"]} == {
        "TA": True,
        "TB": False,
        "TC": False,
    }
    by_paper = exams[sittings_fixture["by_paper"]]
    assert by_paper["sits_together"] is False
    assert by_paper["max_subjects"] is None


async def test_one_sitting_has_one_date_for_every_subject(
    client: httpx.AsyncClient, sittings_fixture: dict[str, str]
) -> None:
    ids = sittings_fixture
    student = ids["student"]
    first = date.today() + timedelta(days=40)
    moved = date.today() + timedelta(days=55)

    saved = await client.put(f"/v1/student/{student}/goals/{ids['ta']}", json=_goal(first))
    assert saved.status_code == 200, saved.text
    assert saved.json()["shared_date"] is True

    # A subject added without a date takes the sitting's date.
    added = await client.put(f"/v1/student/{student}/goals/{ids['tb']}", json=_goal(None, 60))
    assert added.status_code == 200, added.text
    assert added.json()["exam_date"] == first.isoformat()

    # Moving the date on one subject moves it on all of them.
    again = await client.put(f"/v1/student/{student}/goals/{ids['tb']}", json=_goal(moved, 60))
    assert again.status_code == 200, again.text
    goals = {g["subject_id"]: g for g in (await client.get(f"/v1/student/{student}/goals")).json()}
    assert goals[ids["ta"]]["exam_date"] == moved.isoformat()
    assert goals[ids["tb"]]["exam_date"] == moved.isoformat()
    # The rest of each goal is still its own.
    assert goals[ids["ta"]]["target_score"] == 70
    assert goals[ids["tb"]]["target_score"] == 60

    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    exam = next(e for e in overview["exams"] if e["examination_id"] == ids["together"])
    assert exam["sits_together"] is True
    assert exam["next_date"] == moved.isoformat()
    assert exam["days_to_next"] == 55
    assert exam["next_subject_names"] == ["Alpha", "Beta"]


async def test_an_exam_refuses_more_subjects_than_it_allows(
    client: httpx.AsyncClient, sittings_fixture: dict[str, str]
) -> None:
    ids = sittings_fixture
    student = ids["student"]
    when = date.today() + timedelta(days=40)
    for key in ("ta", "tb"):
        response = await client.put(f"/v1/student/{student}/goals/{ids[key]}", json=_goal(when))
        assert response.status_code == 200, response.text

    refused = await client.put(f"/v1/student/{student}/goals/{ids['tc']}", json=_goal(when))
    assert refused.status_code == 409
    assert "is two subjects. Remove one to add another." in refused.json()["detail"]

    # Changing a subject already on the list is not adding one.
    kept = await client.put(f"/v1/student/{student}/goals/{ids['tb']}", json=_goal(when, 80))
    assert kept.status_code == 200, kept.text

    # Removing one makes room, and the newcomer inherits the sitting's date.
    removed = await client.delete(f"/v1/student/{student}/goals/{ids['tb']}")
    assert removed.status_code == 204
    added = await client.put(f"/v1/student/{student}/goals/{ids['tc']}", json=_goal(None))
    assert added.status_code == 200, added.text
    assert added.json()["exam_date"] == when.isoformat()
    mine = {g["subject_id"] for g in (await client.get(f"/v1/student/{student}/goals")).json()}
    assert mine == {ids["ta"], ids["tc"]}


async def test_a_paper_by_paper_exam_counts_down_to_the_nearest_paper(
    client: httpx.AsyncClient, sittings_fixture: dict[str, str]
) -> None:
    ids = sittings_fixture
    student = ids["student"]
    today = date.today()
    # Physics has been sat already; Chemistry and Biology share the nearest day to come.
    plan = {
        "pa": today - timedelta(days=3),
        "pb": today + timedelta(days=12),
        "pc": today + timedelta(days=12),
    }
    for key, when in plan.items():
        response = await client.put(f"/v1/student/{student}/goals/{ids[key]}", json=_goal(when))
        assert response.status_code == 200, response.text
        assert response.json()["shared_date"] is False

    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    exam = next(e for e in overview["exams"] if e["examination_id"] == ids["by_paper"])
    assert exam["next_subject_names"] == ["Biology", "Chemistry"]

    # Moving Biology does not move anything else: each paper keeps its own date.
    later = today + timedelta(days=30)
    response = await client.put(f"/v1/student/{student}/goals/{ids['pc']}", json=_goal(later))
    assert response.status_code == 200, response.text
    goals = {g["subject_id"]: g for g in (await client.get(f"/v1/student/{student}/goals")).json()}
    assert goals[ids["pb"]]["exam_date"] == plan["pb"].isoformat()

    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    exam = next(e for e in overview["exams"] if e["examination_id"] == ids["by_paper"])
    assert exam["sits_together"] is False
    # The past paper is never "next"; the nearest one still to come is.
    assert exam["next_date"] == plan["pb"].isoformat()
    assert exam["days_to_next"] == 12
    assert exam["next_subject_names"] == ["Chemistry"]
    assert [p["subject_name"] for p in exam["papers"]] == ["Physics", "Chemistry", "Biology"]
    # The per-subject countdown older callers read is still there.
    subject = next(s for s in overview["subjects"] if s["subject_id"] == ids["pc"])
    assert subject["goal"]["days_to_exam"] == 30


async def test_exams_are_ordered_by_the_nearest_day_still_to_come(
    client: httpx.AsyncClient, sittings_fixture: dict[str, str]
) -> None:
    ids = sittings_fixture
    student = ids["student"]
    today = date.today()
    for key, days in (("ta", 50), ("pa", 20)):
        when = today + timedelta(days=days)
        response = await client.put(f"/v1/student/{student}/goals/{ids[key]}", json=_goal(when))
        assert response.status_code == 200, response.text
    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    assert [e["examination_id"] for e in overview["exams"]] == [ids["by_paper"], ids["together"]]
    assert overview["exams"][0]["days_to_next"] == 20
