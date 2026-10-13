"""The mock exam, against the local database.

The rules under test are the ones that make it an exam: the paper carries no key, the server
owns the clock, an unanswered question is not a wrong one, and the result is right over
answered. The subject in the fixture has three deliverable questions whose key is A.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from test_practice import client, fixture  # noqa: F401  (pytest fixtures)

from app.db import get_engine
from app.routers.mock import shuffled_paper, tally

pytestmark = pytest.mark.integration


@pytest.fixture
async def ids(fixture: dict[str, str]) -> AsyncIterator[dict[str, str]]:  # noqa: F811
    """The practice fixture, with a goal in its subject, and the mock rows cleared after."""
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO student_exam_goals (student_id, subject_id, status)
                VALUES (CAST(:student AS uuid), CAST(:subject_id AS uuid), 'active')
                """
            ),
            fixture,
        )
    yield fixture
    async with get_engine().begin() as conn:
        await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
        for statement in (
            "DELETE FROM attempts WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM study_sessions WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM mock_exams WHERE student_id = CAST(:student AS uuid)",
        ):
            await conn.execute(text(statement), fixture)


async def start(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
    questions: int = 3,
    minutes: int = 30,
) -> dict[str, Any]:
    response = await client.post(
        "/v1/mock/start",
        json={
            "student_id": ids["student"],
            "subjects": [{"subject_id": ids["subject_id"], "questions": questions}],
            "minutes": minutes,
        },
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def save(
    client: httpx.AsyncClient,  # noqa: F811
    mock_id: str,
    answers: list[dict[str, Any]],
) -> httpx.Response:
    return await client.put(f"/v1/mock/{mock_id}/answers", json={"answers": answers})


async def move_clock(mock_id: str, seconds_ago: int) -> None:
    """Pretend the mock's deadline passed this many seconds ago."""
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                """
                UPDATE mock_exams
                   SET started_at = now() - make_interval(secs => :ago) - interval '30 minutes',
                       deadline_at = now() - make_interval(secs => :ago)
                 WHERE id = CAST(:id AS uuid)
                """
            ),
            {"id": mock_id, "ago": seconds_ago},
        )
        await conn.execute(
            text(
                """
                UPDATE study_sessions s SET started_at = m.started_at
                  FROM mock_exams m WHERE m.id = CAST(:id AS uuid) AND s.mock_exam_id = m.id
                """
            ),
            {"id": mock_id},
        )


def test_right_over_answered_rounds_to_a_whole_percent() -> None:
    assert tally(10, 3, 2).percent == 67
    assert tally(10, 8, 1).percent == 13  # 12.5 rounds up
    assert tally(10, 0, 0).percent is None
    assert tally(10, 4, 3).unanswered == 6
    assert tally(10, 4, 3).wrong == 1


def test_a_passage_keeps_its_questions_together() -> None:
    import secrets
    import uuid

    passage = uuid.uuid4()
    linked = [uuid.uuid4() for _ in range(3)]
    lone = [uuid.uuid4() for _ in range(5)]
    picked = [{"question_version_id": v, "passage_id": passage} for v in linked] + [
        {"question_version_id": v, "passage_id": None} for v in lone
    ]
    for _ in range(20):
        order = shuffled_paper(picked, secrets.SystemRandom())
        assert sorted(map(str, order)) == sorted(map(str, linked + lone))
        first = order.index(linked[0])
        assert order[first : first + 3] == linked


async def test_options_offer_the_subject_with_its_count(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    response = await client.get(f"/v1/mock/options/{ids['student']}")
    assert response.status_code == 200, response.text
    body = response.json()
    subjects = [s for exam in body["examinations"] for s in exam["subjects"]]
    mine = next(s for s in subjects if s["subject_id"] == ids["subject_id"])
    assert mine["available"] == 3 and mine["unseen"] == 3 and mine["mine"]
    assert body["open_mock_id"] is None
    assert body["utme"] == {
        "english_questions": 60,
        "other_questions": 40,
        "minutes": 120,
        "subjects": 4,
    }


async def test_the_paper_is_capped_and_never_carries_the_key(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids, questions=40)
    assert paper["status"] == "in_progress"
    assert 30 * 60 - 5 <= paper["seconds_left"] <= 30 * 60
    [subject] = paper["subjects"]
    # Asked for 40; the subject has 3.
    assert len(subject["questions"]) == 3
    assert [q["position"] for q in subject["questions"]] == [1, 2, 3]
    # Options stay as printed.
    assert [o["option_key"] for o in subject["questions"][0]["options"]] == list("ABCD")
    raw = str(paper)
    assert "is_correct" not in raw and "correct_option_key" not in raw
    assert "hint" not in raw and "solution" not in raw

    # Only one mock at a time.
    again = await client.post(
        "/v1/mock/start",
        json={
            "student_id": ids["student"],
            "subjects": [{"subject_id": ids["subject_id"], "questions": 3}],
            "minutes": 30,
        },
    )
    assert again.status_code == 409


async def test_more_than_four_subjects_is_refused(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    import uuid

    response = await client.post(
        "/v1/mock/start",
        json={
            "student_id": ids["student"],
            "subjects": [{"subject_id": str(uuid.uuid4()), "questions": 3} for _ in range(5)],
            "minutes": 30,
        },
    )
    assert response.status_code == 422


async def test_a_reload_resumes_the_answers_and_flags(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    first, second, _ = paper["subjects"][0]["questions"]
    response = await save(
        client,
        paper["mock_id"],
        [
            {"question_version_id": first["question_version_id"], "selected_option_key": "B"},
            {
                "question_version_id": second["question_version_id"],
                "selected_option_key": None,
                "flagged": True,
            },
        ],
    )
    assert response.status_code == 200, response.text
    assert response.json()["saved"] == 2
    # Changing one's mind is allowed until the end.
    await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "A"}],
    )
    reloaded = (await client.get(f"/v1/mock/{paper['mock_id']}")).json()
    sheet = {q["question_version_id"]: q for q in reloaded["subjects"][0]["questions"]}
    assert sheet[first["question_version_id"]]["selected_option_key"] == "A"
    assert sheet[second["question_version_id"]]["flagged"] is True
    assert sheet[second["question_version_id"]]["selected_option_key"] is None
    # Same order as before: the shuffle is per sitting, not per load.
    assert [q["question_version_id"] for q in reloaded["subjects"][0]["questions"]] == [
        q["question_version_id"] for q in paper["subjects"][0]["questions"]
    ]


async def test_submit_marks_right_over_answered_and_leaves_unanswered_alone(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    first, second, _ = paper["subjects"][0]["questions"]
    await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "A"}],
    )
    events = await client.post(
        f"/v1/mock/{paper['mock_id']}/events",
        json={
            "events": [
                {"kind": "fullscreen_exit"},
                {"kind": "tab_hidden", "at_client": "2026-10-12T10:00:00Z"},
                {"kind": "tab_visible"},
                {"kind": "copy_blocked"},
            ]
        },
    )
    assert events.status_code == 204, events.text
    response = await client.post(
        f"/v1/mock/{paper['mock_id']}/submit",
        json={
            "answers": [
                {"question_version_id": second["question_version_id"], "selected_option_key": "C"}
            ]
        },
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["auto_submitted"] is False
    assert report["overall"] == {
        "questions": 3,
        "answered": 2,
        "correct": 1,
        "wrong": 1,
        "unanswered": 1,
        "percent": 50,
    }
    outcomes = sorted(item["outcome"] for item in report["subjects"][0]["items"])
    assert outcomes == ["right", "unanswered", "wrong"]
    assert {item["correct_option_key"] for item in report["subjects"][0]["items"]} == {"A"}
    assert report["integrity"]["fullscreen_exits"] == 1
    assert report["integrity"]["tab_switches"] == 1
    assert report["integrity"]["copy_blocked"] == 1
    assert len(report["integrity"]["events"]) == 4

    async with get_engine().connect() as conn:
        rows = (
            (
                await conn.execute(
                    text(
                        """
                        SELECT a.context, a.selected_option_key, a.is_correct, a.hint_count,
                               s.session_type, s.ended_at IS NOT NULL AS ended
                        FROM attempts a JOIN study_sessions s ON s.id = a.session_id
                        WHERE a.student_id = CAST(:student AS uuid)
                        ORDER BY a.selected_option_key
                        """
                    ),
                    ids,
                )
            )
            .mappings()
            .all()
        )
    # Two answered, two attempts: the unanswered question has none.
    assert [(r["selected_option_key"], r["is_correct"]) for r in rows] == [
        ("A", True),
        ("C", False),
    ]
    assert {r["context"] for r in rows} == {"full_mock"}
    assert {r["session_type"] for r in rows} == {"full_mock"}
    assert all(r["ended"] and r["hint_count"] == 0 for r in rows)

    # Submitting again changes nothing and records nothing twice.
    again = await client.post(f"/v1/mock/{paper['mock_id']}/submit", json={})
    assert again.json()["overall"] == report["overall"]
    late = await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "B"}],
    )
    assert late.status_code == 409


async def test_the_report_waits_for_the_end(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    response = await client.get(f"/v1/mock/{paper['mock_id']}/report")
    assert response.status_code == 409


async def test_answers_after_time_are_refused_and_the_clock_submits(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    first = paper["subjects"][0]["questions"][0]
    await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "A"}],
    )
    await move_clock(paper["mock_id"], seconds_ago=60)
    late = await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "B"}],
    )
    assert late.status_code == 409
    report = (await client.get(f"/v1/mock/{paper['mock_id']}/report")).json()
    assert report["auto_submitted"] is True
    # The answer saved in time stands; the late change did not land.
    assert report["overall"]["answered"] == 1 and report["overall"]["correct"] == 1
    assert report["submitted_at"] == report["deadline_at"]


async def test_an_abandoned_mock_is_submitted_by_the_clock(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    await move_clock(paper["mock_id"], seconds_ago=3600)
    reloaded = (await client.get(f"/v1/mock/{paper['mock_id']}")).json()
    assert reloaded["status"] == "submitted" and reloaded["seconds_left"] == 0
    history = (await client.get(f"/v1/mock/history/{ids['student']}")).json()
    assert history[0]["auto_submitted"] is True
    assert history[0]["overall"]["unanswered"] == 3
    assert history[0]["overall"]["percent"] is None


async def test_history_lists_and_delete_hides(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    history = (await client.get(f"/v1/mock/history/{ids['student']}")).json()
    assert [m["mock_id"] for m in history] == [paper["mock_id"]]
    # A running mock shows no marks yet.
    assert history[0]["status"] == "in_progress" and history[0]["overall"] is None

    first = paper["subjects"][0]["questions"][0]
    await save(
        client,
        paper["mock_id"],
        [{"question_version_id": first["question_version_id"], "selected_option_key": "A"}],
    )
    deleted = await client.delete(f"/v1/mock/{paper['mock_id']}")
    assert deleted.status_code == 204
    assert (await client.get(f"/v1/mock/history/{ids['student']}")).json() == []
    assert (await client.get(f"/v1/mock/{paper['mock_id']}/report")).status_code == 404
    # Hidden, not erased: its answer still counts as evidence.
    async with get_engine().connect() as conn:
        counted = (
            await conn.execute(
                text(
                    "SELECT count(*) FROM attempts WHERE student_id = CAST(:student AS uuid) "
                    "AND context = 'full_mock'"
                ),
                ids,
            )
        ).scalar()
    assert counted == 1


async def test_another_student_cannot_read_the_paper(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    paper = await start(client, ids)
    # The fixture's student is an unclaimed sandbox student, so make them a real account.
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "UPDATE students SET external_ref = 'claimed-' || id::text "
                "WHERE id = CAST(:student AS uuid)"
            ),
            ids,
        )
    response = await client.get(f"/v1/mock/{paper['mock_id']}")
    assert response.status_code == 401


async def test_the_report_explains_and_opens_the_lesson_once_handed_in(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    """Each question on the report carries its working, and its lesson opens from the report."""
    paper = await start(client, ids)
    subject = paper["subjects"][0]
    question = subject["questions"][0]
    lesson_url = f"/v1/practice/{subject['session_id']}/lesson/{question['question_version_id']}"
    assert (await client.get(lesson_url)).status_code == 409

    response = await client.post(f"/v1/mock/{paper['mock_id']}/submit", json={"answers": []})
    assert response.status_code == 200, response.text
    [item, *_] = response.json()["subjects"][0]["items"]
    assert item["solution_steps"], "the reviewed working comes with the report"
    assert all("why" in option for option in item["options"])

    opened = await client.get(lesson_url)
    assert opened.status_code == 200, opened.text


async def test_the_report_names_each_question_topic_and_its_time(
    client: httpx.AsyncClient,  # noqa: F811
    ids: dict[str, str],
) -> None:
    """The report gives each question its JAMB topic and time, and each subject its topics."""
    paper = await start(client, ids)
    subject = paper["subjects"][0]
    first, second, third = subject["questions"]
    # The paper names no topic: it would hint at what a question is about.
    assert "subtopic_name" not in first

    # Time is the browser's running total for the question: a later, smaller figure (an
    # out-of-order save) never lowers it.
    await save(
        client,
        paper["mock_id"],
        [
            {
                "question_version_id": first["question_version_id"],
                "selected_option_key": "A",
                "response_ms": 30_000,
            },
            {"question_version_id": third["question_version_id"], "response_ms": 5_000},
        ],
    )
    await save(
        client,
        paper["mock_id"],
        [
            {
                "question_version_id": first["question_version_id"],
                "selected_option_key": "A",
                "response_ms": 12_000,
            }
        ],
    )
    response = await client.post(
        f"/v1/mock/{paper['mock_id']}/submit",
        json={
            "answers": [
                {
                    "question_version_id": second["question_version_id"],
                    "selected_option_key": "C",
                    "response_ms": 90_000,
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()["subjects"][0]
    by_id = {item["question_version_id"]: item for item in result["items"]}
    assert by_id[first["question_version_id"]]["response_ms"] == 30_000
    assert by_id[second["question_version_id"]]["response_ms"] == 90_000
    assert by_id[third["question_version_id"]]["response_ms"] == 5_000
    assert result["time_ms"] == 125_000

    async with get_engine().connect() as conn:
        subtopic = (
            await conn.execute(
                text("SELECT parent_id FROM curriculum_items WHERE id = CAST(:skill AS uuid)"),
                {"skill": ids["skill_id"]},
            )
        ).scalar()
    for item in result["items"]:
        assert item["subtopic_id"] == str(subtopic)
        assert item["subtopic_name"] == "The subtopic"
        assert item["topic_name"] == "The topic"
    assert result["topics"] == [
        {
            "subtopic_id": str(subtopic),
            "name": "The subtopic",
            "topic_name": "The topic",
            "questions": 3,
            "correct": 1,
            "wrong": 1,
            "unanswered": 1,
        }
    ]

    # History stays light: no questions, no topics.
    history = (await client.get(f"/v1/mock/history/{ids['student']}")).json()
    assert history[0]["subjects"][0]["items"] == []
    assert history[0]["subjects"][0]["topics"] == []


def test_topics_put_the_most_wrong_first() -> None:
    import uuid

    from app.routers.mock import ReportItem, topics_of

    a, b = uuid.uuid4(), uuid.uuid4()

    def item(subtopic: uuid.UUID | None, name: str, outcome: str) -> ReportItem:
        return ReportItem(
            position=1,
            question_version_id=uuid.uuid4(),
            stem="",
            instructions=None,
            passage_title=None,
            passage_body=None,
            options=[],
            selected_option_key=None,
            correct_option_key="A",
            flagged=False,
            outcome=outcome,  # type: ignore[arg-type]
            subtopic_id=subtopic,
            subtopic_name=name,
        )

    topics = topics_of(
        [
            item(a, "Algebra", "right"),
            item(a, "Algebra", "right"),
            item(b, "Vectors", "wrong"),
            item(None, "", "wrong"),  # unclassified: left out, not invented
            item(b, "Vectors", "unanswered"),
        ]
    )
    assert [(t.name, t.questions, t.correct, t.wrong, t.unanswered) for t in topics] == [
        ("Vectors", 2, 0, 1, 1),
        ("Algebra", 2, 2, 0, 0),
    ]
