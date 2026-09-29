"""The guided loop, against the local database.

The tests are about the rules that protect the numbers, not about the wording of a hint. If
one of these breaks, the product has started counting help as knowledge.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import database_is_reachable, get_engine
from app.main import app
from app.routers.practice import _figures, _points, _practice_history, _prior_turns, _record_in

pytestmark = pytest.mark.integration

FIXTURE = """
WITH reviewer AS (
  INSERT INTO academic_reviewers (display_name) VALUES (:author) RETURNING id
), checker AS (
  INSERT INTO academic_reviewers (display_name) VALUES (:reviewer) RETURNING id
), exam AS (
  INSERT INTO examinations (name, short_name, exam_body, country_code, status)
  VALUES (:exam_name, :short, 'Test body', 'NG', 'active') RETURNING id
), subject AS (
  INSERT INTO subjects (examination_id, code, name, status)
  SELECT exam.id, 'PRA', 'Practice subject', 'active' FROM exam RETURNING id, examination_id
), document AS (
  INSERT INTO source_documents (examination_id, subject_id, document_type, title, file_uri,
    file_sha256, mime_type, licence_status, storage_permission, student_delivery_permission,
    review_status, reviewed_by, reviewed_at)
  SELECT subject.examination_id, subject.id, 'syllabus', :doc_title, :doc_uri, :doc_hash,
    'application/pdf', 'verified', true, true, 'approved', checker.id, now()
  FROM subject, checker RETURNING id
), version AS (
  INSERT INTO syllabus_versions (subject_id, version_label, source_document_id, status,
    is_current, approved_by, approved_at)
  SELECT subject.id, :label, document.id, 'approved', true, checker.id, now()
  FROM subject, document, checker RETURNING id, subject_id
), topic AS (
  INSERT INTO curriculum_items (syllabus_version_id, subject_id, item_type, code, name,
    syllabus_status, pilot_support_status, review_status, approved_by, approved_at)
  SELECT version.id, version.subject_id, 'topic', 'PRA.I', 'The topic', 'explicit',
    'supported', 'draft', NULL, NULL
  FROM version, checker RETURNING id, syllabus_version_id, subject_id
), sub AS (
  INSERT INTO curriculum_items (syllabus_version_id, subject_id, parent_id, item_type, code,
    name, syllabus_status, pilot_support_status, review_status, approved_by, approved_at)
  SELECT topic.syllabus_version_id, topic.subject_id, topic.id, 'subtopic', 'PRA.I.1',
    'The subtopic', 'explicit', 'supported', 'draft', NULL, NULL
  FROM topic, checker RETURNING id, syllabus_version_id, subject_id
), skill AS (
  INSERT INTO curriculum_items (syllabus_version_id, subject_id, parent_id, item_type, code,
    name, syllabus_status, pilot_support_status, review_status, approved_by, approved_at)
  SELECT sub.syllabus_version_id, sub.subject_id, sub.id, 'skill', 'PRA.I.1.i', 'The skill',
    'explicit', 'supported', 'draft', NULL, NULL
  FROM sub, checker RETURNING id, subject_id
), evidence AS (
  INSERT INTO curriculum_evidence (curriculum_item_id, source_document_id, evidence_kind,
    source_location, source_excerpt, review_status, reviewed_by, reviewed_at)
  SELECT item.id, document.id, 'inclusion', 'page 1', 'printed', 'approved', checker.id, now()
  FROM (SELECT id FROM topic UNION ALL SELECT id FROM sub UNION ALL SELECT id FROM skill) item,
       document, checker RETURNING id
)
SELECT (SELECT id FROM subject) AS subject_id, (SELECT id FROM skill) AS skill_id,
       (SELECT id FROM version) AS version_id,
       (SELECT id FROM reviewer) AS author_id, (SELECT id FROM checker) AS reviewer_id
"""


@pytest.fixture
async def fixture() -> AsyncIterator[dict[str, str]]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    engine = get_engine()
    suffix = uuid.uuid4().hex[:8]
    async with engine.begin() as conn:
        row = (
            (
                await conn.execute(
                    text(FIXTURE),
                    {
                        "author": f"Practice author {suffix}",
                        "reviewer": f"Practice reviewer {suffix}",
                        "exam_name": f"Practice exam {suffix}",
                        "short": f"PR{suffix[:5]}",
                        "doc_title": f"Practice syllabus {suffix}",
                        "doc_uri": f"test://practice/{suffix}",
                        "doc_hash": uuid.uuid4().hex + uuid.uuid4().hex,
                        "label": f"pra-{suffix}",
                    },
                )
            )
            .mappings()
            .one()
        )
        ids = {key: str(value) for key, value in row.items()}
        # Parents before children: the trigger refuses a child of a draft parent.
        for item_type in ("topic", "subtopic", "skill"):
            await conn.execute(
                text(
                    """
                    UPDATE curriculum_items
                       SET review_status = 'approved', approved_by = CAST(:r AS uuid),
                           approved_at = now()
                     WHERE subject_id = CAST(:s AS uuid) AND item_type = :t
                    """
                ),
                {"s": ids["subject_id"], "t": item_type, "r": ids["reviewer_id"]},
            )
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
                    {"n": f"Practice student {suffix}", "ref": f"sandbox:test-{suffix}"},
                )
            ).scalar_one()
        )
        # Three deliverable questions, so the loop always has something to offer next.
        for index in range(3):
            question_id = (
                await conn.execute(
                    text(
                        """
                        INSERT INTO questions (subject_id, origin, usage_pool, created_by)
                        VALUES (CAST(:s AS uuid), 'authored', 'practice', CAST(:a AS uuid))
                        RETURNING id
                        """
                    ),
                    {"s": ids["subject_id"], "a": ids["author_id"]},
                )
            ).scalar_one()
            version_id = (
                await conn.execute(
                    text(
                        """
                        INSERT INTO question_versions (question_id, subject_id, version, stem,
                          response_format, marking_method, solution_steps, hints, marks,
                          expected_seconds, option_count, content_hash, authored_by,
                          answer_source, mastery_level_number, level_source, review_status,
                          reviewed_by, reviewed_at)
                        VALUES (:q, CAST(:s AS uuid), 1, :stem, 'mcq_single', 'auto_key',
                          CAST(:steps AS jsonb), CAST(:hints AS jsonb), 1, 45, 4,
                          :hash, CAST(:a AS uuid),
                          'expert_verified', 3, 'expert_verified', 'draft', NULL, NULL)
                        RETURNING id
                        """
                    ),
                    {
                        "q": question_id,
                        "s": ids["subject_id"],
                        "stem": f"Question {index}",
                        "steps": '["first step", "second step"]',
                        "hints": '["the general hint"]',
                        "hash": uuid.uuid4().hex + uuid.uuid4().hex,
                        "a": ids["author_id"],
                        "r": ids["reviewer_id"],
                    },
                )
            ).scalar_one()
            for order, letter in enumerate("ABCD", 1):
                await conn.execute(
                    text(
                        """
                        INSERT INTO question_options (question_version_id, subject_id,
                          option_key, body, is_correct, display_order)
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
                    INSERT INTO question_classifications (question_id, subject_id,
                      curriculum_item_id, syllabus_version_id, classification_role,
                      classification_reason, review_status, reviewed_by, reviewed_at,
                      proposed_by)
                    VALUES (:q, CAST(:s AS uuid), CAST(:skill AS uuid), CAST(:ver AS uuid),
                      'primary', 'fixture', 'approved', CAST(:r AS uuid), now(), 'human')
                    """
                ),
                {
                    "q": question_id,
                    "s": ids["subject_id"],
                    "skill": ids["skill_id"],
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
                       SET review_status = 'approved', reviewed_by = CAST(:r AS uuid),
                           reviewed_at = now()
                     WHERE id = :v
                    """
                ),
                {"v": version_id, "r": ids["reviewer_id"]},
            )
    yield ids
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
        for statement in (
            "DELETE FROM tutor_turns WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM attempts WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM study_sessions WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM student_exam_goals WHERE student_id = CAST(:student AS uuid)",
            "DELETE FROM students WHERE id = CAST(:student AS uuid)",
            "DELETE FROM question_classifications WHERE subject_id = CAST(:subject_id AS uuid)",
            # Approved content is immutable by design, so a fixture has to withdraw before it
            # can clean up after itself.
            "UPDATE question_versions SET review_status = 'withdrawn' "
            "WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM question_options WHERE subject_id = CAST(:subject_id AS uuid)",
            "UPDATE questions SET current_version_id = NULL "
            "WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM question_versions WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM questions WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM curriculum_evidence WHERE curriculum_item_id IN "
            "(SELECT id FROM curriculum_items WHERE subject_id = CAST(:subject_id AS uuid))",
            "DELETE FROM curriculum_items WHERE subject_id = CAST(:subject_id AS uuid) "
            "AND item_type = 'skill'",
            "DELETE FROM curriculum_items WHERE subject_id = CAST(:subject_id AS uuid) "
            "AND item_type = 'subtopic'",
            "DELETE FROM curriculum_items WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM syllabus_versions WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM source_documents WHERE subject_id = CAST(:subject_id AS uuid)",
            "DELETE FROM subjects WHERE id = CAST(:subject_id AS uuid)",
            "DELETE FROM examinations WHERE short_name = :short",
        ):
            await conn.execute(text(statement), {**ids, "short": f"PR{suffix[:5]}"})


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def start(client: httpx.AsyncClient, ids: dict[str, str], length: int = 3) -> dict[str, Any]:
    response = await client.post(
        "/v1/practice/start",
        json={"student_id": ids["student"], "subject_id": ids["subject_id"], "length": length},
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def answer(
    client: httpx.AsyncClient,
    session: str,
    state: dict[str, Any],
    key: str,
    confidence: str | None = None,
) -> dict[str, Any]:
    response = await client.post(
        f"/v1/practice/{session}/answer",
        json={
            "question_version_id": state["question"]["question_version_id"],
            "selected_option_key": key,
            "response_ms": 9000,
            "confidence": confidence,
        },
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_a_miss_brings_a_hint_and_the_same_question_back(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    asked = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    assert state["stage"] == "hint"
    assert state["hint"] == "the general hint"
    # The same question, not the next one: the point is to try again with help.
    assert state["question"]["question_version_id"] == asked
    assert state["question"]["hints_used"] == 1


async def test_a_second_miss_opens_the_board(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"
    assert state["solution_steps"] == ["first step", "second step"]
    assert state["correct_option_key"] == "A"
    assert state["taught"] == 1
    # Taught is not known, and the session's own counters say so.
    assert state["correct_unaided"] == 0


async def test_a_right_answer_after_a_hint_is_not_evidence(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "A")
    assert state["stage"] == "asking"
    # Right, but with help. It moves the student on and not the estimate.
    assert state["correct_unaided"] == 0


async def test_a_right_answer_the_student_calls_a_guess_is_not_evidence(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    state = await answer(client, state["session_id"], state, "A", confidence="guessed")
    assert state["correct_unaided"] == 0
    state = await answer(client, state["session_id"], state, "A", confidence="sure")
    assert state["correct_unaided"] == 1


async def test_the_ladder_cannot_be_talked_past(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """A client that replays the first wrong answer does not get a second first hint.

    The stage is read from what is stored, so the second miss opens the board however the
    client numbers its calls.
    """
    state = await start(client, fixture)
    first = state
    state = await answer(client, state["session_id"], first, "B")
    assert state["stage"] == "hint"
    state = await answer(client, state["session_id"], first, "B")
    assert state["stage"] == "explain"


async def test_a_reload_at_the_hint_keeps_the_hint(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """A refresh after the first miss is the same hint on the same question, not a new one."""
    state = await start(client, fixture)
    hinted = await answer(client, state["session_id"], state, "B")
    response = await client.get(f"/v1/practice/{state['session_id']}")
    assert response.status_code == 200, response.text
    resumed = response.json()
    assert resumed["stage"] == "hint"
    assert resumed["hint"] == hinted["hint"] == "the general hint"
    assert resumed["misconception"] == hinted["misconception"]
    assert resumed["question"] == hinted["question"]
    assert resumed["position"] == hinted["position"]


async def test_a_reload_at_the_board_keeps_the_board(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    state = await answer(client, state["session_id"], state, "B")
    board = await answer(client, state["session_id"], state, "C")
    response = await client.get(f"/v1/practice/{state['session_id']}")
    assert response.status_code == 200, response.text
    resumed = response.json()
    assert resumed["stage"] == "explain"
    assert resumed["solution_steps"] == board["solution_steps"] == ["first step", "second step"]
    assert resumed["correct_option_key"] == "A"
    assert resumed["question"] == board["question"]
    assert resumed["taught"] == 1


async def test_a_reload_after_a_right_retry_moves_on(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    asked = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "A")
    resumed = (await client.get(f"/v1/practice/{state['session_id']}")).json()
    assert resumed["stage"] == "asking"
    assert resumed["question"]["question_version_id"] != asked


async def test_a_finished_session_is_stamped_and_stays_finished(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """The last question ending at the board still ends the sitting once the board is read."""
    state = await start(client, fixture, length=1)
    session = state["session_id"]
    state = await answer(client, session, state, "B")
    state = await answer(client, session, state, "C")
    assert state["stage"] == "explain"
    done = (await client.post(f"/v1/practice/{session}/taught")).json()
    assert done["stage"] == "finished"
    # Not the board again: the sitting is over, and the table says so.
    assert (await client.get(f"/v1/practice/{session}")).json()["stage"] == "finished"
    async with get_engine().connect() as conn:
        ended = (
            await conn.execute(
                text("SELECT ended_at FROM study_sessions WHERE id = :id"), {"id": session}
            )
        ).scalar()
    assert ended is not None


async def test_a_session_ends_when_its_questions_are_used_up(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=2)
    for _ in range(2):
        state = await answer(client, state["session_id"], state, "A", confidence="sure")
    assert state["stage"] == "finished"
    assert state["question"] is None
    assert "2 of 2 answered without help" in (state["closing_note"] or "")


async def test_a_lucky_guess_is_counted_apart_and_named_at_the_end(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """Right, but the student said they guessed: not unaided, and the closing note says so."""
    state = await start(client, fixture, length=2)
    state = await answer(client, state["session_id"], state, "A", confidence="guessed")
    assert state["stage"] == "asking"
    assert (state["correct_unaided"], state["guessed_right"]) == (0, 1)
    state = await answer(client, state["session_id"], state, "A", confidence="sure")
    assert state["stage"] == "finished"
    assert (state["correct_unaided"], state["guessed_right"]) == (1, 1)
    note = state["closing_note"] or ""
    assert "1 of 2 answered without help" in note
    assert "1 was right but guessed" in note


async def test_a_guess_after_a_hint_is_help_not_a_lucky_guess(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture)
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "A", confidence="guessed")
    assert (state["correct_unaided"], state["guessed_right"]) == (0, 0)


@pytest.fixture
def quiet_settings() -> Iterator[None]:
    """No model and no voice: the lesson is the reviewed steps, and nothing is spoken."""
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="", ai_speak=False)
    yield
    app.dependency_overrides.pop(get_settings, None)


def lesson_url(session: str, version: str, tail: str = "") -> str:
    return f"/v1/practice/{session}/lesson/{version}{tail}"


@pytest.mark.parametrize("said", ["guessed", "unsure"])
async def test_a_doubted_right_answer_opens_the_lesson(
    client: httpx.AsyncClient, fixture: dict[str, str], quiet_settings: None, said: str
) -> None:
    state = await start(client, fixture)
    session, version = state["session_id"], state["question"]["question_version_id"]
    await answer(client, session, state, "A", confidence=said)

    response = await client.get(lesson_url(session, version))
    assert response.status_code == 200, response.text
    assert response.json()["beats"]
    warmed = await client.post(lesson_url(session, version, "/warm"))
    assert warmed.status_code == 202, warmed.text
    # The lesson opens; the coach's own door does not. `/ask` is still for the board.
    assert (await ask(client, session, version, "why?"))["status"] == 409


async def test_a_sure_right_answer_has_no_lesson(
    client: httpx.AsyncClient, fixture: dict[str, str], quiet_settings: None
) -> None:
    state = await start(client, fixture)
    session, version = state["session_id"], state["question"]["question_version_id"]
    # Nothing answered yet: no lesson, as before.
    assert (await client.get(lesson_url(session, version))).status_code == 409
    assert (await client.post(lesson_url(session, version, "/warm"))).status_code == 409

    await answer(client, session, state, "A", confidence="sure")
    assert (await client.get(lesson_url(session, version))).status_code == 409
    assert (await client.post(lesson_url(session, version, "/warm"))).status_code == 409
    assert (await client.get(lesson_url(session, version, "/voice/0"))).status_code == 409


async def test_the_lesson_opens_at_the_board_as_before(
    client: httpx.AsyncClient, fixture: dict[str, str], quiet_settings: None
) -> None:
    state = await start(client, fixture)
    session, version = state["session_id"], state["question"]["question_version_id"]
    state = await answer(client, session, state, "B")
    # One miss: the lesson may be prepared, but not opened.
    assert (await client.post(lesson_url(session, version, "/warm"))).status_code == 202
    assert (await client.get(lesson_url(session, version))).status_code == 409
    await answer(client, session, state, "C")
    assert (await client.get(lesson_url(session, version))).status_code == 200


async def test_lesson_feedback_is_taken_only_where_the_lesson_opens(
    client: httpx.AsyncClient, fixture: dict[str, str], quiet_settings: None
) -> None:
    state = await start(client, fixture)
    session, guessed = state["session_id"], state["question"]["question_version_id"]
    state = await answer(client, session, state, "A", confidence="guessed")
    sure = state["question"]["question_version_id"]
    await answer(client, session, state, "A", confidence="sure")

    url = lesson_url(session, guessed, "/feedback")
    made = await client.post(url, json={"context": "after_guess", "understood": "too_hard"})
    assert made.status_code == 201, made.text
    again = await client.post(
        url, json={"context": "after_guess", "understood": "got_it", "matched_working": "partly"}
    )
    assert again.status_code == 201, again.text
    assert again.json()["id"] != made.json()["id"]

    for bad in (
        {"context": "after_guess", "understood": "maybe"},
        {"context": "whenever", "understood": "got_it"},
        {"context": "after_guess", "understood": "got_it", "matched_working": "kind of"},
        {"understood": "got_it"},
    ):
        assert (await client.post(url, json=bad)).status_code == 422, bad

    refused = await client.post(
        lesson_url(session, sure, "/feedback"),
        json={"context": "after_unsure", "understood": "got_it"},
    )
    assert refused.status_code == 409
    missing = await client.post(
        lesson_url(str(uuid.uuid4()), guessed, "/feedback"),
        json={"context": "after_guess", "understood": "got_it"},
    )
    assert missing.status_code == 404

    async with get_engine().connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT understood, matched_working FROM lesson_feedback "
                    "WHERE session_id = :s ORDER BY created_at"
                ),
                {"s": session},
            )
        ).all()
    assert [tuple(row) for row in rows] == [("too_hard", None), ("got_it", "partly")]


# ---------------------------------------------------------------------------
# Asking the coach
#
# The tests below never reach a model: the settings they install carry no API key, so every
# answer is the reviewed fallback. That is deliberate. What has to hold here is which
# questions may be asked at all, that the student always gets something readable back, and
# that the turn is written down — none of which should depend on a network call.
# ---------------------------------------------------------------------------


@pytest.fixture
def tutor_settings() -> Iterator[None]:
    """No API key and a small allowance, so the budget is reachable inside a test."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="", ai_daily_calls_per_student=2
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


async def ask(client: httpx.AsyncClient, session: str, version: str, asked: str) -> dict[str, Any]:
    response = await client.post(
        f"/v1/practice/{session}/ask",
        json={"question_version_id": version, "step_index": 0, "asked": asked},
    )
    return {"status": response.status_code, **(response.json() if response.content else {})}


async def turns_for(student: str) -> list[dict[str, Any]]:
    async with get_engine().connect() as conn:
        rows = await conn.execute(
            text(
                """
                SELECT asked, reply, source, model, step_index
                FROM tutor_turns WHERE student_id = CAST(:s AS uuid) ORDER BY asked_at
                """
            ),
            {"s": student},
        )
        return [dict(row) for row in rows.mappings()]


async def test_the_coach_will_not_answer_about_a_live_question(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """A question still being answered is not open to the coach.

    This is the guard that keeps the tutor pointed at the practice pool and at an item whose
    answer is already on the screen. If it ever softens, a client can ask for help on a
    question the student is mid-attempt at, which is a different product.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]

    # Nothing attempted yet.
    assert (await ask(client, state["session_id"], version, "how?"))["status"] == 409

    # One miss and a hint is not the board either.
    state = await answer(client, state["session_id"], state, "B")
    assert state["stage"] == "hint"
    assert (await ask(client, state["session_id"], version, "how?"))["status"] == 409


async def test_a_question_at_the_board_is_answered_and_recorded(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"

    reply = await ask(client, state["session_id"], version, "why the first step?")
    assert reply["status"] == 200
    # No key, so the reviewed step stands in — and it says so rather than pretending.
    assert reply["source"] == "fallback"
    assert "first step" in reply["reply"]
    assert reply["asks_left"] == 1

    stored = await turns_for(fixture["student"])
    assert len(stored) == 1
    assert stored[0]["asked"] == "why the first step?"
    assert stored[0]["source"] == "fallback"
    # A turn that did not come from a model does not name one.
    assert stored[0]["model"] is None


async def test_the_daily_allowance_is_counted_by_the_server(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """Past the allowance the student still gets the working, and the turn is still stored.

    A budget the client keeps is not a budget, and a budget that returns an error loses the
    question the student typed. So it degrades to the reviewed step and is recorded as having
    done so, which is the only way the allowance can later be sized against real use.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")

    for _ in range(2):
        assert (await ask(client, state["session_id"], version, "again?"))["status"] == 200

    spent = await ask(client, state["session_id"], version, "one more?")
    assert spent["status"] == 200
    assert spent["source"] == "budget"
    assert spent["asks_left"] == 0
    assert "first step" in spent["reply"]

    assert [turn["source"] for turn in await turns_for(fixture["student"])] == [
        "fallback",
        "fallback",
        "budget",
    ]


async def test_a_blank_question_never_becomes_a_turn(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """An accidental send spends nothing and records nothing."""
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    response = await client.post(
        f"/v1/practice/{state['session_id']}/ask",
        json={"question_version_id": version, "step_index": 0, "asked": "   "},
    )
    assert response.status_code == 422, response.text
    assert await turns_for(fixture["student"]) == []


async def _add_question_in_pool(ids: dict[str, str], pool: str, stem: str) -> str:
    """A question in the same subtopic as the fixture's, in the pool named. Returns its version."""
    async with get_engine().connect() as conn:
        question_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO questions (subject_id, origin, usage_pool, created_by)
                    VALUES (CAST(:s AS uuid), 'authored', :pool, CAST(:a AS uuid))
                    RETURNING id
                    """
                ),
                {"s": ids["subject_id"], "a": ids["author_id"], "pool": pool},
            )
        ).scalar_one()
        version_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO question_versions (question_id, subject_id, version, stem,
                      response_format, marking_method, solution_steps, hints, marks,
                      expected_seconds, option_count, content_hash, authored_by,
                      answer_source, mastery_level_number, level_source, review_status)
                    VALUES (:q, CAST(:s AS uuid), 1, :stem, 'mcq_single', 'auto_key',
                      '["a step"]'::jsonb, '["a hint"]'::jsonb, 1, 45, 4, :hash,
                      CAST(:a AS uuid), 'expert_verified', 3, 'expert_verified', 'draft')
                    RETURNING id
                    """
                ),
                {
                    "q": question_id,
                    "s": ids["subject_id"],
                    "stem": stem,
                    "hash": uuid.uuid4().hex + uuid.uuid4().hex,
                    "a": ids["author_id"],
                },
            )
        ).scalar_one()
        await conn.execute(
            text(
                """
                INSERT INTO question_classifications (question_id, subject_id,
                  curriculum_item_id, syllabus_version_id, classification_role,
                  classification_reason, review_status, reviewed_by, reviewed_at, proposed_by)
                VALUES (:q, CAST(:s AS uuid), CAST(:skill AS uuid), CAST(:ver AS uuid),
                  'primary', 'fixture', 'approved', CAST(:r AS uuid), now(), 'human')
                """
            ),
            {
                "q": question_id,
                "s": ids["subject_id"],
                "skill": ids["skill_id"],
                "ver": ids["version_id"],
                "r": ids["reviewer_id"],
            },
        )
        # An attempt belongs to exactly one sitting, so the measured pools need one of their
        # own: this is the check-up, which is where a diagnostic item is actually met.
        session_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO study_sessions (student_id, subject_id, session_type,
                      engine_version)
                    VALUES (CAST(:student AS uuid), CAST(:s AS uuid), 'checkup', 'test')
                    RETURNING id
                    """
                ),
                {"student": ids["student"], "s": ids["subject_id"]},
            )
        ).scalar_one()
        await conn.execute(
            text(
                """
                INSERT INTO attempts (id, student_id, question_version_id, session_id, context,
                  selected_option_key, is_correct, answered_at_client, engine_version)
                VALUES (gen_random_uuid(), CAST(:student AS uuid), :v, :session, 'checkup',
                  'B', false, now(), 'test')
                """
            ),
            {"student": ids["student"], "v": version_id, "session": session_id},
        )
        await conn.commit()
    return str(version_id)


async def test_the_protected_pools_never_reach_the_packet(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """The line the whole richer context rests on.

    Practice items the student has already sat are ordinary teaching context. Diagnostic and
    held-out items are how this student is MEASURED, and REQ-13 keeps their text out of
    tutoring: a tutor that has read the baseline paper makes every score built on it
    meaningless, and S5-AC6 tests for exactly that. Both are attempts by the same student in
    the same subtopic, so nothing but the pool tells them apart.
    """
    await _add_question_in_pool(fixture, "held_out", "HELD OUT: this must never be shown")
    await _add_question_in_pool(fixture, "diagnostic", "DIAGNOSTIC: this must never be shown")

    # One practice question answered and left behind, then a second one missed twice: the
    # history is about the questions BEFORE this one, so there has to be one.
    state = await start(client, fixture)
    earlier = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "A", confidence="sure")
    assert state["stage"] == "asking"
    version = state["question"]["question_version_id"]
    assert version != earlier
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"

    async with get_engine().connect() as conn:
        subtopic = (
            await conn.execute(
                text("SELECT parent_id FROM curriculum_items WHERE id = CAST(:s AS uuid)"),
                {"s": fixture["skill_id"]},
            )
        ).scalar_one()
        history = await _practice_history(
            conn, uuid.UUID(fixture["student"]), str(subtopic), uuid.UUID(version)
        )

    stems = [past.stem for past in history]
    assert not any("HELD OUT" in stem for stem in stems), stems
    assert not any("DIAGNOSTIC" in stem for stem in stems), stems
    # And the practice questions they really did meet are there, or the filter is just
    # returning nothing and proving nothing.
    assert any(stem.startswith("Question ") for stem in stems), stems


async def test_the_record_counts_every_pool_even_though_the_text_stays_out(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """A skill-level result summary is what a protected assessment may contribute: a number.

    So the check-up attempt is counted in `seen` while its stem is refused by the test above.
    """
    await _add_question_in_pool(fixture, "held_out", "HELD OUT: this must never be shown")

    async with get_engine().connect() as conn:
        subtopic = (
            await conn.execute(
                text("SELECT parent_id FROM curriculum_items WHERE id = CAST(:s AS uuid)"),
                {"s": fixture["skill_id"]},
            )
        ).scalar_one()
        record = await _record_in(conn, uuid.UUID(fixture["student"]), str(subtopic))

    assert record["seen"] == 1


async def test_the_history_is_one_row_per_question_not_per_attempt(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """Every question that reaches the board was attempted twice; it is still one question.

    Listing attempts would show it twice, spend half the coach's history on it, and leave the
    coach believing the student has met twice as much of this topic as they have. And a
    question that ended at the board reads as taught, which is not what
    `solution_viewed_before_answer` records — that marks an answer given AFTER the board, so
    it is false for exactly the questions this is about.
    """
    state = await start(client, fixture)
    missed_stem = state["question"]["stem"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"

    # Move on, so the missed question becomes history rather than the current item.
    response = await client.post(f"/v1/practice/{state['session_id']}/taught")
    assert response.status_code == 200, response.text
    state = response.json()
    current = state["question"]["question_version_id"]

    async with get_engine().connect() as conn:
        subtopic = (
            await conn.execute(
                text("SELECT parent_id FROM curriculum_items WHERE id = CAST(:s AS uuid)"),
                {"s": fixture["skill_id"]},
            )
        ).scalar_one()
        history = await _practice_history(
            conn, uuid.UUID(fixture["student"]), str(subtopic), uuid.UUID(current)
        )

    mine = [past for past in history if past.stem == missed_stem]
    assert len(mine) == 1, [past.stem for past in history]
    assert mine[0].was_taught is True
    assert mine[0].was_correct is False
    assert mine[0].chose == "C"


# --- the figure and the conversation ---------------------------------------------------

#: A real reviewed figure from the bank, so the test exercises the file read rather than a
#: fixture that only looks like one.
A_REAL_FIGURE = "docs/questions/utme/mathematics/figures/" + (
    "0037e3d10093a64618a4b996b26acd1db5802c432de803ddb6ecb2ff8878345d.png"
)


async def _attach_asset(version: str, **overrides: object) -> None:
    row = {
        "storage_uri": A_REAL_FIGURE,
        "mime_type": "image/png",
        "licence_status": "verified",
        "alt_text": "A triangle with the right angle at B.",
    } | overrides
    async with get_engine().connect() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO question_assets (question_version_id, storage_uri, mime_type,
                  licence_status, alt_text)
                VALUES (CAST(:v AS uuid), :storage_uri, :mime_type, :licence_status, :alt_text)
                """
            ),
            {"v": version, **row},
        )
        await conn.commit()


async def test_only_a_reviewed_image_is_sent_as_a_figure(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """Three filters, and each one is a way a bad file could reach the model.

    An unverified licence is content we have not cleared to send anywhere. A non-image is not
    a diagram. A path outside the asset tree is the one that matters most: `storage_uri` is a
    string in a table, and resolving it without checking where it lands would let a bad row
    read a file off the box and post it to a third party.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]

    await _attach_asset(version, licence_status="pending")
    await _attach_asset(version, mime_type="application/pdf")
    await _attach_asset(version, storage_uri="../../../../../etc/passwd")
    await _attach_asset(version, storage_uri="docs/questions/nothing-here.png")

    async with get_engine().connect() as conn:
        assert await _figures(conn, uuid.UUID(version)) == []

    # And the good row does come through, or the filters above prove nothing.
    await _attach_asset(version)
    async with get_engine().connect() as conn:
        figures = await _figures(conn, uuid.UUID(version))
    assert len(figures) == 1
    assert figures[0].mime_type == "image/png"
    assert figures[0].alt_text == "A triangle with the right angle at B."
    assert figures[0].data_uri.startswith("data:image/png;base64,iVBOR")


async def test_the_conversation_is_this_question_in_this_sitting(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """Memory is scoped, and a fallback is not something the coach said.

    Replaying a fallback as an assistant turn would have the coach building on an apology it
    never wrote. Replaying another question's turns would put text from a different lesson
    into this packet without anyone choosing to.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    other_version = await _add_question_in_pool(
        fixture, "practice", "A different question in the same subtopic."
    )
    session = state["session_id"]

    async with get_engine().connect() as conn:
        for asked, reply, source, version_id in [
            ("first question", "first answer", "model", version),
            ("a turn the coach could not take", "the reviewed step", "fallback", version),
            ("about a different question", "different answer", "model", other_version),
            ("second question", "second answer", "model", version),
        ]:
            await conn.execute(
                text(
                    """
                    INSERT INTO tutor_turns (student_id, session_id, question_version_id,
                      asked, reply, source, model)
                    VALUES (CAST(:student AS uuid), CAST(:session AS uuid),
                      CAST(:version AS uuid), :asked, :reply, :source, :model)
                    """
                ),
                {
                    "student": fixture["student"],
                    "session": session,
                    "version": version_id,
                    "asked": asked,
                    "reply": reply,
                    "source": source,
                    # The schema holds `source = 'model'` and a named model together.
                    "model": "gpt-4o" if source == "model" else None,
                },
            )
        await conn.commit()

        turns = await _prior_turns(conn, uuid.UUID(session), uuid.UUID(version))

    assert [turn.asked for turn in turns] == ["first question", "second question"]
    assert [turn.replied for turn in turns] == ["first answer", "second answer"]


# --- watching the coach write ----------------------------------------------------------


async def ask_streaming(
    client: httpx.AsyncClient, session: str, version: str, asked: str
) -> tuple[int, list[tuple[str, dict[str, Any]]]]:
    """Post to the streaming endpoint and read the frames back."""
    events: list[tuple[str, dict[str, Any]]] = []
    async with client.stream(
        "POST",
        f"/v1/practice/{session}/ask/stream",
        json={"question_version_id": version, "step_index": 0, "asked": asked},
    ) as response:
        if response.status_code != 200:
            await response.aread()
            return response.status_code, events
        body = "".join([chunk async for chunk in response.aiter_text()])

    for frame in body.split("\n\n"):
        rows = frame.splitlines()
        name = next((row[7:] for row in rows if row.startswith("event: ")), None)
        data = next((row[6:] for row in rows if row.startswith("data: ")), None)
        if name and data:
            events.append((name, json.loads(data)))
    return 200, events


async def test_the_streaming_coach_uses_the_same_door(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """The board guard is the whole of what keeps protected content out of the tutor.

    A second way in that skipped it would be a way to ask about a question the student is
    still answering, so the streaming endpoint is refused in exactly the places `/ask` is.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]

    status, _ = await ask_streaming(client, state["session_id"], version, "how?")
    assert status == 409

    state = await answer(client, state["session_id"], state, "B")
    status, _ = await ask_streaming(client, state["session_id"], version, "how?")
    assert status == 409


async def test_a_streamed_answer_is_written_and_stored(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """Whatever reaches the board also reaches the table.

    There is no key in these tests, so the reviewed step stands in — which is the case worth
    holding anyway: a fallback was fetched rather than written, so it arrives whole, and the
    turn is stored exactly as the unstreamed endpoint stores it.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"

    status, events = await ask_streaming(
        client, state["session_id"], version, "why the first step?"
    )
    assert status == 200

    names = [name for name, _ in events]
    assert names[-1] == "done"
    done = events[-1][1]
    assert done["source"] == "fallback"
    assert done["asks_left"] == 1

    # The fallback arrives in both channels like any other answer: the reviewed step is put
    # on the board, and the route to a person is said aloud.
    board = [payload["text"] for name, payload in events if name == "board"]
    said = " ".join(payload["text"] for name, payload in events if name == "say")
    # Whatever the board was showing is what the coach writes back up, not a paraphrase.
    assert board == [(state["solution_steps"] or [])[0]]
    assert "ask a person" in said
    # No key in these tests, so every spoken line says plainly that it has no voice. The
    # client waits on this before revealing a line, so silence has to be stated rather than
    # simply never arriving.
    voices = [payload for name, payload in events if name == "voice"]
    assert voices, "a spoken line must say whether it can be heard"
    assert all(payload["url"] is None for payload in voices)

    stored = await turns_for(fixture["student"])
    assert len(stored) == 1
    assert stored[0]["asked"] == "why the first step?"
    assert stored[0]["source"] == "fallback"
    assert stored[0]["model"] is None


# --- the student's own voice, which is switched off ------------------------------------


@pytest.fixture
def listening_settings() -> Iterator[None]:
    """The default: the mic on, and no key to transcribe with."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="", ai_daily_calls_per_student=2, ai_listen=True
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def deaf_settings() -> Iterator[None]:
    """A deployment that has deliberately switched the mic off."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="", ai_daily_calls_per_student=2, ai_listen=False
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


async def _speak_up(client: httpx.AsyncClient, session: str, version: str) -> httpx.Response:
    return await client.post(
        f"/v1/practice/{session}/listen",
        data={"question_version_id": version},
        files={"audio": ("question.webm", b"not really audio", "audio/webm")},
    )


async def test_a_deployment_can_switch_the_mic_off_entirely(
    client: httpx.AsyncClient, fixture: dict[str, str], deaf_settings: None
) -> None:
    """Off is still a supported state, and 404 rather than 403 while it is.

    A switched-off feature should not advertise that it exists, and `/v1/features` has to
    agree with the endpoint — otherwise a client draws a microphone the server will refuse.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"

    assert (await _speak_up(client, state["session_id"], version)).status_code == 404

    # And the client is told the same thing, so it knows not to draw the button.
    features = (await client.get("/v1/features")).json()
    assert features["student_voice"] is False


async def test_the_mic_answers_at_the_board_and_nowhere_else(
    client: httpx.AsyncClient, fixture: dict[str, str], listening_settings: None
) -> None:
    """Switched on, it is still only reachable where the ask box is.

    Without this the mic would be a way to spend a deployment's transcription budget from any
    session, on any question, without ever being at a board.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]

    assert (await _speak_up(client, state["session_id"], version)).status_code == 409

    state = await answer(client, state["session_id"], state, "B")
    assert (await _speak_up(client, state["session_id"], version)).status_code == 409

    state = await answer(client, state["session_id"], state, "C")
    assert state["stage"] == "explain"
    # At the board it is reachable — and with no key there is nothing to transcribe with, so
    # the student is told to type rather than left with a broken button.
    assert (await _speak_up(client, state["session_id"], version)).status_code == 422

    features = (await client.get("/v1/features")).json()
    assert features["student_voice"] is True


async def test_a_spoken_question_never_becomes_a_turn_on_its_own(
    client: httpx.AsyncClient, fixture: dict[str, str], listening_settings: None
) -> None:
    """Transcribing is not asking. The words go in the box; the student presses Ask.

    Transcription gets things wrong, and a question the student never approved should not
    reach the coach — nor the stored record of what they asked.
    """
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    state = await answer(client, state["session_id"], state, "B")
    state = await answer(client, state["session_id"], state, "C")

    await _speak_up(client, state["session_id"], version)
    assert await turns_for(fixture["student"]) == []


async def test_a_speech_handle_belongs_to_its_own_sitting(
    client: httpx.AsyncClient, fixture: dict[str, str], tutor_settings: None
) -> None:
    """The handle is the permission, so it cannot be carried to another session.

    It is only ever a sentence the student is about to hear anyway, but a handle that worked
    anywhere would be a way to spend a deployment's speech budget from outside a lesson.
    """
    assert (
        await client.get(f"/v1/practice/{uuid.uuid4()}/speech/not-a-real-handle")
    ).status_code == 404


def test_a_lessons_marks_pass_through_and_a_bad_one_is_dropped() -> None:
    """A moment's `point` reaches the board as written; a malformed mark is left out.

    The marks are decoration over a lesson that teaches without them, so one that is wrong
    must not take the lesson down with it.
    """
    points = _points(
        [
            {"line": 0, "kind": "circle", "at": "0 <= y <= 3", "text": "the limits"},
            {"line": -1, "kind": "arrow"},
            {"line": "2", "kind": "arrow"},
            {"line": 1, "kind": "scribble"},
            {"line": True, "kind": "box"},
            "not a mark",
        ]
    )
    assert points is not None
    blank = {"from": None, "figure": None, "target": None, "to": None}
    assert [point.model_dump() for point in points] == [
        {"line": 0, "kind": "circle", "text": "the limits", "at": "0 <= y <= 3", **blank},
        {"line": -1, "kind": "arrow", "text": None, "at": None, **blank},
    ]
    assert _points(None) is None
    assert _points([{"line": 1, "kind": "nope"}]) is None


def test_piece_to_piece_and_diagram_marks_pass_through() -> None:
    """An arrow or a move may start from a piece; a diagram mark names a figure and a target.

    Each kind only where it makes sense: a move needs somewhere to come from, an arc belongs on
    a diagram, a box does not, and a diagram mark with nothing to find is dropped.
    """
    points = _points(
        [
            {"line": 1, "kind": "move", "at": "6[[2]]", "from": {"line": 1, "at": "[[2]]log"}},
            {"line": -1, "kind": "arrow", "from": {"line": "x"}},
            {"line": 2, "kind": "move"},
            {"figure": 0, "kind": "arc", "target": "QRP", "text": "34°"},
            {"figure": 0, "kind": "highlight", "target": ["P", "Q"]},
            {"figure": 0, "kind": "label", "target": {"x": 40, "y": 12.5}, "text": "O"},
            {"figure": "sketch", "kind": "label", "target": "A", "text": "40 m"},
            {"figure": "sketch_d", "kind": "circle", "target": "A"},
            {"figure": 0, "kind": "box", "target": "B"},
            {"figure": 0, "kind": "circle"},
            {"line": 0, "kind": "arc"},
        ]
    )
    assert points is not None
    dumped = [point.model_dump(exclude_none=True) for point in points]
    assert dumped == [
        {"line": 1, "kind": "move", "at": "6[[2]]", "from": {"line": 1, "at": "[[2]]log"}},
        {"line": -1, "kind": "arrow"},
        {"kind": "arc", "text": "34°", "figure": 0, "target": "QRP"},
        {"kind": "highlight", "figure": 0, "target": ["P", "Q"]},
        {"kind": "label", "text": "O", "figure": 0, "target": {"x": 40.0, "y": 12.5}},
        {"kind": "label", "text": "40 m", "figure": "sketch", "target": "A"},
    ]


def test_arrows_across_between_the_working_and_a_diagram() -> None:
    """An arrow may go across: from a piece of the working to a point on a diagram, or from a
    diagram mark to a piece of the working. A `to` that names nowhere is left off, and only an
    arrow keeps one."""
    points = _points(
        [
            {
                "line": 6,
                "kind": "arrow",
                "at": "(2, 0)",
                "to": {"figure": "sketch", "target": "A"},
                "text": "here",
            },
            {"figure": "sketch", "kind": "arrow", "target": "A", "to": {"line": 6, "at": "(2, 0)"}},
            {"line": 6, "kind": "arrow", "to": {"figure": "sketch_d", "target": "A"}},
            {"figure": 0, "kind": "circle", "target": "B", "to": {"line": 2}},
            {"line": 3, "kind": "circle", "to": {"figure": 0, "target": "B"}},
        ]
    )
    assert points is not None
    dumped = [point.model_dump(exclude_none=True) for point in points]
    assert dumped == [
        {
            "line": 6,
            "kind": "arrow",
            "text": "here",
            "at": "(2, 0)",
            "to": {"figure": "sketch", "target": "A"},
        },
        {"kind": "arrow", "figure": "sketch", "target": "A", "to": {"line": 6, "at": "(2, 0)"}},
        {"line": 6, "kind": "arrow"},
        {"kind": "circle", "figure": 0, "target": "B"},
        {"line": 3, "kind": "circle"},
    ]


def test_a_moment_brings_in_the_sketch_it_names() -> None:
    """`show_sketch` is true for the first sketch, or the name of a later one."""
    from app.routers.practice import _show_sketch

    assert _show_sketch(True) is True
    assert _show_sketch("sketch") is True
    assert _show_sketch("sketch_b") == "sketch_b"
    assert _show_sketch("sketch_c") == "sketch_c"
    assert _show_sketch(None) is False
    assert _show_sketch("sketch_z") is False
