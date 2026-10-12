"""Custom runs, the run report, and deleting a run, against the local database.

Built on the guided loop's fixture — one topic, one subtopic, three questions — with two more
topics added here, their questions set in known exam years, so a choice can be seen to narrow
what is asked.
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection
from test_access import People, people
from test_practice import answer, checkup_done, client, fixture

from app.db import get_engine

pytestmark = pytest.mark.integration

# Used by name; imported so pytest can find them here.
__all__ = ["client", "fixture", "people"]


async def _item(
    conn: AsyncConnection,
    ids: dict[str, str],
    item_type: str,
    code: str,
    name: str,
    parent: str | None,
    order: int,
) -> str:
    """One curriculum item, with its printed evidence, approved."""
    item = str(
        (
            await conn.execute(
                text(
                    """
                    INSERT INTO curriculum_items (syllabus_version_id, subject_id, parent_id,
                      item_type, code, name, syllabus_status, pilot_support_status,
                      review_status, display_order)
                    VALUES (CAST(:ver AS uuid), CAST(:s AS uuid), CAST(:parent AS uuid), :t,
                      :code, :name, 'explicit', 'supported', 'draft', :order)
                    RETURNING id
                    """
                ),
                {
                    "ver": ids["version_id"],
                    "s": ids["subject_id"],
                    "parent": parent,
                    "t": item_type,
                    "code": code,
                    "name": name,
                    "order": order,
                },
            )
        ).scalar_one()
    )
    await conn.execute(
        text(
            """
            INSERT INTO curriculum_evidence (curriculum_item_id, source_document_id,
              evidence_kind, source_location, source_excerpt, review_status, reviewed_by,
              reviewed_at)
            SELECT CAST(:item AS uuid), d.id, 'inclusion', 'page 2', 'printed', 'approved',
              CAST(:r AS uuid), now()
            FROM source_documents d WHERE d.subject_id = CAST(:s AS uuid)
            """
        ),
        {"item": item, "s": ids["subject_id"], "r": ids["reviewer_id"]},
    )
    await conn.execute(
        text(
            """
            UPDATE curriculum_items
               SET review_status = 'approved', approved_by = CAST(:r AS uuid), approved_at = now()
             WHERE id = CAST(:item AS uuid)
            """
        ),
        {"item": item, "r": ids["reviewer_id"]},
    )
    return item


async def _question(
    conn: AsyncConnection, ids: dict[str, str], skill: str, year: int, number: int
) -> str:
    """One approved, deliverable question in a skill, set in a given year. Key: A."""
    question_id = (
        await conn.execute(
            text(
                """
                INSERT INTO questions (subject_id, origin, usage_pool, created_by, exam_year,
                  question_number)
                VALUES (CAST(:s AS uuid), 'authored', 'practice', CAST(:a AS uuid), :year,
                  :number)
                RETURNING id
                """
            ),
            {"s": ids["subject_id"], "a": ids["author_id"], "year": year, "number": str(number)},
        )
    ).scalar_one()
    version_id = (
        await conn.execute(
            text(
                """
                INSERT INTO question_versions (question_id, subject_id, version, stem,
                  response_format, marking_method, solution_steps, hints, marks,
                  expected_seconds, option_count, content_hash, authored_by, answer_source,
                  mastery_level_number, level_source, review_status)
                VALUES (:q, CAST(:s AS uuid), 1, :stem, 'mcq_single', 'auto_key',
                  CAST(:steps AS jsonb), CAST(:hints AS jsonb), 1, 45, 4, :hash,
                  CAST(:a AS uuid), 'expert_verified', 3, 'expert_verified', 'draft')
                RETURNING id
                """
            ),
            {
                "q": question_id,
                "s": ids["subject_id"],
                "stem": f"Question from {year}, number {number}",
                "steps": '["first step", "second step"]',
                "hints": '["the general hint"]',
                "hash": uuid.uuid4().hex + uuid.uuid4().hex,
                "a": ids["author_id"],
            },
        )
    ).scalar_one()
    for order, letter in enumerate("ABCD", 1):
        await conn.execute(
            text(
                """
                INSERT INTO question_options (question_version_id, subject_id, option_key,
                  body, is_correct, display_order)
                VALUES (:v, CAST(:s AS uuid), :k, :b, :correct, :o)
                """
            ),
            {
                "v": version_id,
                "s": ids["subject_id"],
                "k": letter,
                "b": f"option {letter}",
                "correct": letter == "A",
                "o": order,
            },
        )
    await conn.execute(
        text(
            """
            INSERT INTO question_classifications (question_id, subject_id, curriculum_item_id,
              syllabus_version_id, classification_role, classification_reason, review_status,
              reviewed_by, reviewed_at, proposed_by)
            VALUES (:q, CAST(:s AS uuid), CAST(:skill AS uuid), CAST(:ver AS uuid), 'primary',
              'fixture', 'approved', CAST(:r AS uuid), now(), 'human')
            """
        ),
        {
            "q": question_id,
            "s": ids["subject_id"],
            "skill": skill,
            "ver": ids["version_id"],
            "r": ids["reviewer_id"],
        },
    )
    await conn.execute(
        text("UPDATE questions SET current_version_id = :v WHERE id = :q"),
        {"v": version_id, "q": question_id},
    )
    await conn.execute(
        text(
            """
            UPDATE question_versions
               SET review_status = 'approved', reviewed_by = CAST(:r AS uuid), reviewed_at = now()
             WHERE id = :v
            """
        ),
        {"v": version_id, "r": ids["reviewer_id"]},
    )
    return str(version_id)


@pytest.fixture
async def bank(fixture: dict[str, str]) -> dict[str, Any]:
    """Three topics. The fixture's own (no year) comes first; then Algebra, then Geometry.

    Algebra: two questions from 2015, one from 2016. Geometry: two from 2016.
    """
    async with get_engine().begin() as conn:
        topic_id, subtopic_id = (
            await conn.execute(
                text(
                    """
                    SELECT sub.parent_id, sub.id FROM curriculum_items sub
                    WHERE sub.subject_id = CAST(:s AS uuid) AND sub.item_type = 'subtopic'
                    """
                ),
                {"s": fixture["subject_id"]},
            )
        ).one()
        made: dict[str, Any] = {
            "first": {"topic": str(topic_id), "subtopic": str(subtopic_id)},
            "versions": {},
        }
        plan = {"Algebra": [2015, 2015, 2016], "Geometry": [2016, 2016]}
        for order, (name, years) in enumerate(plan.items(), 2):
            topic = await _item(conn, fixture, "topic", f"PRA.{name}", name, None, order)
            sub = await _item(
                conn, fixture, "subtopic", f"PRA.{name}.1", f"{name} basics", topic, 1
            )
            skill = await _item(conn, fixture, "skill", f"PRA.{name}.1.i", f"{name} skill", sub, 1)
            made[name] = {"topic": topic, "subtopic": sub}
            for number, year in enumerate(years, 1):
                version = await _question(conn, fixture, skill, year, number)
                made["versions"][version] = {"topic": name, "year": year}
    return made


async def start(client: httpx.AsyncClient, ids: dict[str, str], **extra: Any) -> httpx.Response:
    return await client.post(
        "/v1/practice/start",
        json={"student_id": ids["student"], "subject_id": ids["subject_id"], **extra},
    )


async def walk(client: httpx.AsyncClient, state: dict[str, Any]) -> list[str]:
    """Answer every question right, and return what was asked."""
    asked = []
    while state["stage"] != "finished":
        asked.append(state["question"]["question_version_id"])
        state = await answer(client, state["session_id"], state, "A", confidence="sure")
    return asked


async def test_the_options_show_years_and_the_syllabus(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    response = await client.get(
        f"/v1/student/{fixture['student']}/subjects/{fixture['subject_id']}/practice-options"
    )
    assert response.status_code == 200, response.text
    options = response.json()
    assert options["subject_id"] == fixture["subject_id"]
    assert options["subject_name"] == "Practice subject"
    # Newest first, and only years something was set in.
    assert options["years"] == [
        {"exam_year": 2016, "questions": 3},
        {"exam_year": 2015, "questions": 2},
    ]
    assert [topic["name"] for topic in options["topics"]] == ["The topic", "Algebra", "Geometry"]
    assert [topic["questions"] for topic in options["topics"]] == [3, 3, 2]
    algebra = options["topics"][1]
    assert algebra["topic_id"] == bank["Algebra"]["topic"]
    assert algebra["subtopics"] == [
        {
            "subtopic_id": bank["Algebra"]["subtopic"],
            "name": "Algebra basics",
            "questions": 3,
            "mastery": None,
        }
    ]


async def test_an_ordinary_run_is_unchanged(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    response = await start(client, fixture, length=4, topic_ids=[], exam_years=[])
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["filters"] is None
    assert state["length"] == 4


async def test_a_year_narrows_the_run_and_shortens_it(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    response = await start(client, fixture, length=10, exam_years=[2016])
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["filters"] == {"topic_ids": [], "subtopic_ids": [], "exam_years": [2016]}
    # Three questions were set in 2016, so a run of ten is three.
    assert state["length"] == 3

    # A reload keeps the choice.
    resumed = (await client.get(f"/v1/practice/{state['session_id']}")).json()
    assert resumed["filters"] == state["filters"]

    asked = await walk(client, state)
    assert len(asked) == 3
    assert {bank["versions"][version]["year"] for version in asked} == {2016}


async def test_a_topic_narrows_the_run(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    response = await start(client, fixture, length=10, topic_ids=[bank["Geometry"]["topic"]])
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["length"] == 2
    asked = await walk(client, state)
    assert {bank["versions"][version]["topic"] for version in asked} == {"Geometry"}


async def test_topics_and_years_both_apply(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    response = await start(
        client,
        fixture,
        length=10,
        subtopic_ids=[bank["Algebra"]["subtopic"]],
        topic_ids=[bank["Geometry"]["topic"]],
        exam_years=[2015],
    )
    assert response.status_code == 200, response.text
    state = response.json()
    # Algebra's two 2015 questions; Geometry has nothing from 2015.
    assert state["length"] == 2
    asked = await walk(client, state)
    assert [bank["versions"][version] for version in asked] == [
        {"topic": "Algebra", "year": 2015}
    ] * 2


async def test_a_choice_with_nothing_in_it_is_refused(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    for extra in (
        {"exam_years": [1999]},
        {"topic_ids": [str(uuid.uuid4())]},
        {"topic_ids": [bank["first"]["topic"]], "exam_years": [2016]},
    ):
        response = await start(client, fixture, **extra)
        assert response.status_code == 422, response.text
        assert response.json() == {
            "detail": "No questions match that choice yet. Try more topics or years."
        }


async def test_the_review_tells_each_question_as_it_went(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    state = (await start(client, fixture, length=5, topic_ids=[bank["Algebra"]["topic"]])).json()
    session = state["session_id"]
    assert state["length"] == 3
    first = state["question"]["question_version_id"]
    state = await answer(client, session, state, "A", confidence="guessed")
    second = state["question"]["question_version_id"]
    state = await answer(client, session, state, "B", confidence="sure")
    state = await answer(client, session, state, "C", confidence="unsure")
    assert state["stage"] == "explain"
    feedback = await client.post(
        f"/v1/practice/{session}/lesson/{second}/feedback",
        json={"context": "after_misses", "understood": "unsure", "matched_working": "partly"},
    )
    assert feedback.status_code == 201, feedback.text
    feedback = await client.post(
        f"/v1/practice/{session}/lesson/{second}/feedback",
        json={"context": "after_misses", "understood": "got_it"},
    )
    assert feedback.status_code == 201, feedback.text
    state = (await client.post(f"/v1/practice/{session}/taught")).json()
    third = state["question"]["question_version_id"]
    await answer(client, session, state, "D")

    response = await client.get(f"/v1/practice/{session}/review")
    assert response.status_code == 200, response.text
    review = response.json()
    assert review["session_id"] == session
    assert review["subject_name"] == "Practice subject"
    assert review["finished"] is False
    assert (review["length"], review["answered"]) == (3, 3)
    assert (review["correct_unaided"], review["guessed_right"], review["taught"]) == (0, 1, 1)
    assert review["filters"]["topic_ids"] == [bank["Algebra"]["topic"]]

    items = review["items"]
    assert [item["position"] for item in items] == [1, 2, 3]
    assert [item["question_version_id"] for item in items] == [first, second, third]
    assert [item["outcome"] for item in items] == ["guessed_right", "taught", "unanswered"]
    taught = items[1]
    assert taught["topic_name"] == "Algebra"
    assert taught["subtopic_name"] == "Algebra basics"
    assert taught["exam_year"] == bank["versions"][second]["year"]
    assert taught["question_number"] is not None
    assert taught["correct_option_key"] == "A"
    assert taught["solution_steps"] == ["first step", "second step"]
    assert taught["hint"] == "the general hint"
    assert taught["figures"] == []
    assert [option["option_key"] for option in taught["options"]] == ["A", "B", "C", "D"]
    assert [
        (a["selected_option_key"], a["is_correct"], a["confidence"], a["hint_used"])
        for a in taught["attempts"]
    ] == [("B", False, "sure", False), ("C", False, "unsure", True)]
    # The latest word on the lesson, not the first.
    assert taught["lesson_feedback"] == {"understood": "got_it", "matched_working": None}
    assert items[0]["lesson_feedback"] is None


async def test_a_retry_that_lands_is_right_after_a_hint(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    state = (await start(client, fixture, length=2)).json()
    session = state["session_id"]
    state = await answer(client, session, state, "A", confidence="sure")
    state = await answer(client, session, state, "B")
    state = await answer(client, session, state, "A")
    review = (await client.get(f"/v1/practice/{session}/review")).json()
    assert [item["outcome"] for item in review["items"]] == [
        "right_first_time",
        "right_after_hint",
    ]
    assert review["finished"] is True
    assert review["filters"] is None


async def test_a_deleted_run_is_hidden_but_still_counts(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    student, subject = fixture["student"], fixture["subject_id"]
    options_url = f"/v1/student/{student}/subjects/{subject}/practice-options"

    kept = (await start(client, fixture, length=1, topic_ids=[bank["Geometry"]["topic"]])).json()
    await walk(client, kept)
    state = (await start(client, fixture, length=3, topic_ids=[bank["Algebra"]["topic"]])).json()
    session = state["session_id"]
    await answer(client, session, state, "A", confidence="sure")
    before = (await client.get(options_url)).json()
    assert before["topics"][1]["subtopics"][0]["mastery"] == 1.0
    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    assert overview["subjects"][0]["open_practice_session_id"] == session

    deleted = await client.delete(f"/v1/practice/{session}")
    assert deleted.status_code == 204, deleted.text
    assert deleted.content == b""
    # Again is harmless.
    assert (await client.delete(f"/v1/practice/{session}")).status_code == 204

    assert (await client.get(f"/v1/practice/{session}")).status_code == 404
    assert (await client.get(f"/v1/practice/{session}/review")).status_code == 404

    overview = (await client.get(f"/v1/student/{student}/overview")).json()
    assert [run["session_id"] for run in overview["recent_runs"]] == [kept["session_id"]]
    assert overview["subjects"][0]["open_practice_session_id"] is None
    runs = (await client.get(f"/v1/student/{student}/practice")).json()
    assert [run["session_id"] for run in runs["runs"]] == [kept["session_id"]]

    # Mastery reads the deleted run's answer exactly as before.
    assert (await client.get(options_url)).json() == before

    async with get_engine().connect() as conn:
        ended = (
            await conn.execute(
                text("SELECT ended_at IS NOT NULL FROM study_sessions WHERE id = :id"),
                {"id": session},
            )
        ).scalar()
    assert ended is True

    assert (await client.delete(f"/v1/practice/{uuid.uuid4()}")).status_code == 404


async def test_another_student_is_refused(
    people: People, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    owner, student = await people.account()
    stranger, _ = await people.account()
    await checkup_done(student, fixture["subject_id"])
    started = await owner.post(
        "/v1/practice/start",
        json={"student_id": student, "subject_id": fixture["subject_id"], "length": 2},
    )
    assert started.status_code == 200, started.text
    session = started.json()["session_id"]

    for response in (
        await stranger.get(
            f"/v1/student/{student}/subjects/{fixture['subject_id']}/practice-options"
        ),
        await stranger.get(f"/v1/practice/{session}/review"),
        await stranger.delete(f"/v1/practice/{session}"),
    ):
        assert response.status_code == 403, response.text
        assert response.json() == {"detail": "That isn't your account."}
    assert (await owner.get(f"/v1/practice/{session}/review")).status_code == 200
