"""JAMB's words on the way out: the DB topic is JAMB's section, the DB subtopic is JAMB's topic.

The columns keep their names, and so do the old response fields. What these tests hold is that
every response a student screen reads also says which section a topic sits under, in fields
named for it, and that the run history names JAMB's topics and not only its sections.

Built on the guided loop's fixture: the DB topic "The topic" (a section) over the DB subtopic
"The subtopic" (a topic), with three questions.
"""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy import text
from test_practice import answer, client, fixture, start

from app.db import get_engine

pytestmark = pytest.mark.integration

# Fixtures used by name; imported so pytest can find them here.
__all__ = ["client", "fixture"]

SECTION = "The topic"
TOPIC = "The subtopic"


async def _ids(subject_id: str) -> dict[str, str]:
    """The fixture's section (DB topic) and topic (DB subtopic) ids."""
    async with get_engine().connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT item_type, id::text FROM curriculum_items "
                    "WHERE subject_id = CAST(:s AS uuid) AND item_type IN ('topic', 'subtopic')"
                ),
                {"s": subject_id},
            )
        ).all()
    return {item_type: item_id for item_type, item_id in rows}


async def test_the_run_list_names_topics_and_sections_apart(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=1)
    await answer(client, state["session_id"], state, "A", confidence="sure")

    [run] = (await client.get(f"/v1/student/{fixture['student']}/practice")).json()["runs"]
    assert run["subtopics"] == [TOPIC]
    assert run["sections"] == [SECTION]
    # The old field is unchanged, for clients that still read it.
    assert run["topics"] == [SECTION]


async def test_a_run_with_nothing_answered_names_no_topics(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    await start(client, fixture, length=1)
    [run] = (await client.get(f"/v1/student/{fixture['student']}/practice")).json()["runs"]
    assert (run["subtopics"], run["sections"], run["topics"]) == ([], [], [])


async def test_the_practice_options_name_each_section(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    ids = await _ids(fixture["subject_id"])
    options = (
        await client.get(
            f"/v1/student/{fixture['student']}/subjects/{fixture['subject_id']}/practice-options"
        )
    ).json()
    [section] = options["topics"]
    assert (section["section_id"], section["section_name"]) == (ids["topic"], SECTION)
    assert (section["topic_id"], section["name"]) == (ids["topic"], SECTION)
    [topic] = section["subtopics"]
    assert (topic["subtopic_id"], topic["name"]) == (ids["subtopic"], TOPIC)


async def test_the_run_review_names_the_section(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=1)
    session = state["session_id"]
    await answer(client, session, state, "A", confidence="sure")
    [item] = (await client.get(f"/v1/practice/{session}/review")).json()["items"]
    assert (item["subtopic_name"], item["section_name"], item["topic_name"]) == (
        TOPIC,
        SECTION,
        SECTION,
    )


async def test_the_check_up_names_the_topic_and_reports_under_its_section(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    ids = await _ids(fixture["subject_id"])
    state = (
        await client.post(
            "/v1/checkup/start",
            json={"student_id": fixture["student"], "subject_id": fixture["subject_id"]},
        )
    ).json()
    session = state["session_id"]
    question = state["question"]
    # The question says which JAMB topic it is on, not only which section.
    assert (question["subtopic_name"], question["section_name"]) == (TOPIC, SECTION)
    assert question["topic_name"] == SECTION
    for key in ("A", "B", "A"):
        if state["finished"]:
            break
        state = (
            await client.post(
                f"/v1/checkup/{session}/answer",
                json={
                    "question_version_id": state["question"]["question_version_id"],
                    "selected_option_key": key,
                    "response_ms": 9000,
                },
            )
        ).json()
    assert state["finished"] is True

    report = (await client.get(f"/v1/checkup/{session}/report")).json()
    [line] = report["subtopics"]
    assert (line["subtopic_id"], line["name"]) == (ids["subtopic"], TOPIC)
    assert (line["section_id"], line["section_name"]) == (ids["topic"], SECTION)
    assert line["topic_name"] == SECTION

    [subject] = (await client.get(f"/v1/student/{fixture['student']}/overview")).json()["subjects"]
    [weak] = subject["latest_checkup"]["weakest_subtopics"]
    assert (weak["subtopic_id"], weak["name"]) == (ids["subtopic"], TOPIC)
    assert (weak["section_id"], weak["section_name"]) == (ids["topic"], SECTION)


async def test_a_topic_score_names_its_section(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    await client.put(
        f"/v1/student/{fixture['student']}/goals/{fixture['subject_id']}",
        json={
            "target_score": 70,
            "exam_date": "2099-06-01",
            "minutes_per_day": 45,
            "study_days": [1, 2, 3, 4, 5],
        },
    )
    state = (
        await client.post(
            "/v1/checkup/start",
            json={"student_id": fixture["student"], "subject_id": fixture["subject_id"]},
        )
    ).json()
    session = state["session_id"]
    while not state["finished"]:
        state = (
            await client.post(
                f"/v1/checkup/{session}/answer",
                json={
                    "question_version_id": state["question"]["question_version_id"],
                    "selected_option_key": "B",
                    "response_ms": 9000,
                },
            )
        ).json()
    standing = (await client.get(f"/v1/checkup/{session}/report")).json()["standing"]
    assert standing is not None
    [line] = [line for line in standing["topics"] if line["answered"]]
    assert line["name"] == TOPIC
    assert line["section_name"] == SECTION


async def test_the_catalogue_counts_topics_not_only_skills(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """Students are shown how many JAMB topics are taught, never a count of "skills"."""
    exams = (await client.get("/v1/student/catalogue")).json()
    [subject] = [
        subject
        for exam in exams
        for subject in exam["subjects"]
        if subject["subject_id"] == fixture["subject_id"]
    ]
    assert subject["teachable_topics"] == 1
    assert subject["teachable_skills"] == 1
