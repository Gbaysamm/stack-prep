"""The student's home and run history, against the local database.

Built on the guided loop's own fixture: one subject, one topic, three questions. What has to
hold is that the home page reports what the loop and the report already say, and nothing
they do not.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import text
from test_practice import answer, client, fixture, start

from app.db import get_engine
from app.routers.progress import stem_excerpt, streak

pytestmark = pytest.mark.integration

# Fixtures used by name; imported so pytest can find them here.
__all__ = ["client", "fixture"]


def test_a_streak_counts_back_from_today() -> None:
    today = date(2026, 9, 28)
    days = [today, today - timedelta(days=1), today - timedelta(days=2), today - timedelta(4)]
    assert streak(days, today) == (3, True)


def test_a_streak_survives_until_today_is_over() -> None:
    """Nothing yet today does not break yesterday's streak; nothing yesterday does."""
    today = date(2026, 9, 28)
    assert streak([today - timedelta(days=1), today - timedelta(days=2)], today) == (2, False)
    assert streak([today - timedelta(days=2)], today) == (0, False)
    assert streak([], today) == (0, False)


async def test_an_unknown_student_has_no_home(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    unknown = uuid.uuid4()
    assert (await client.get(f"/v1/student/{unknown}/overview")).status_code == 404
    assert (await client.get(f"/v1/student/{unknown}/practice")).status_code == 404


async def test_a_run_in_progress_is_on_the_home_page(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=3)
    session = state["session_id"]
    state = await answer(client, session, state, "A", confidence="sure")
    state = await answer(client, session, state, "B")

    response = await client.get(f"/v1/student/{fixture['student']}/overview")
    assert response.status_code == 200, response.text
    home = response.json()
    assert home["student"]["student_id"] == fixture["student"]
    assert home["streak_days"] == 1
    assert home["active_today"] is True

    [subject] = home["subjects"]
    assert subject["subject_id"] == fixture["subject_id"]
    assert subject["goal"] is None
    assert subject["latest_checkup"] is None
    # Waiting on its second try, so it is the run to go back to.
    assert subject["open_practice_session_id"] == session
    assert subject["practice"] == {
        "runs_finished": 0,
        "questions_answered": 2,
        "correct_unaided": 1,
        "taught": 0,
        "guessed_right": 0,
    }

    [run] = home["recent_runs"]
    assert run["session_id"] == session
    assert run["finished"] is False
    assert (run["answered"], run["correct_unaided"], run["length"]) == (2, 1, 3)
    # The hint on the last question is still showing, so the resume lands on it.
    assert (await client.get(f"/v1/practice/{session}")).json()["stage"] == "hint"


async def test_a_finished_run_is_counted_and_not_offered_again(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=1)
    state = await answer(client, state["session_id"], state, "A", confidence="sure")
    assert state["stage"] == "finished"

    subject = (await client.get(f"/v1/student/{fixture['student']}/overview")).json()["subjects"][0]
    assert subject["open_practice_session_id"] is None
    assert subject["practice"]["runs_finished"] == 1


async def test_the_run_list_pages_and_names_its_topics(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    first = await start(client, fixture, length=1)
    await answer(client, first["session_id"], first, "A", confidence="sure")
    second = await start(client, fixture, length=1)

    url = f"/v1/student/{fixture['student']}/practice"
    page = (await client.get(url, params={"limit": 1})).json()
    [newest] = page["runs"]
    assert newest["session_id"] == second["session_id"]
    assert newest["topics"] == []
    assert page["next_before"] is not None

    rest = (await client.get(url, params={"limit": 1, "before": page["next_before"]})).json()
    [older] = rest["runs"]
    assert older["session_id"] == first["session_id"]
    assert older["topics"] == ["The topic"]
    assert older["finished"] is True

    assert (await client.get(url, params={"limit": 101})).status_code == 422


async def test_the_home_page_reads_the_latest_check_up_through_the_report(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    """Same numbers as the report page, because it is the report page's function."""
    await client.put(
        f"/v1/student/{fixture['student']}/goals/{fixture['subject_id']}",
        json={
            "target_score": 70,
            "exam_date": (date.today() + timedelta(days=60)).isoformat(),
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
    subject = (await client.get(f"/v1/student/{fixture['student']}/overview")).json()["subjects"][0]
    assert subject["goal"]["target_score"] == 70
    assert subject["goal"]["days_to_exam"] in (59, 60, 61)
    latest = subject["latest_checkup"]
    assert latest["session_id"] == session
    assert latest["score_now"] == report["projection"]["score_now"]
    assert latest["score_projected"] == report["projection"]["score_projected"]
    assert [line["name"] for line in latest["weakest_subtopics"]] == ["The subtopic"]
    assert subject["open_checkup_session_id"] is None


async def test_a_lucky_guess_is_not_counted_as_known_on_the_home_page(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    state = await start(client, fixture, length=2)
    state = await answer(client, state["session_id"], state, "A", confidence="guessed")
    state = await answer(client, state["session_id"], state, "A", confidence="unsure")
    assert state["stage"] == "finished"

    home = (await client.get(f"/v1/student/{fixture['student']}/overview")).json()
    [run] = home["recent_runs"]
    assert (run["answered"], run["correct_unaided"], run["guessed_right"]) == (2, 1, 1)
    totals = home["subjects"][0]["practice"]
    assert (totals["correct_unaided"], totals["guessed_right"]) == (1, 1)
    [listed] = (await client.get(f"/v1/student/{fixture['student']}/practice")).json()["runs"]
    assert (listed["correct_unaided"], listed["guessed_right"]) == (1, 1)


async def test_lesson_feedback_is_summarised_from_the_latest_word(
    client: httpx.AsyncClient, fixture: dict[str, str]
) -> None:
    url = f"/v1/student/{fixture['student']}/lesson-feedback"
    empty = (await client.get(url)).json()
    assert empty == {
        "counts": {
            "got_it": 0,
            "unsure": 0,
            "too_hard": 0,
            "matched_yes": 0,
            "matched_partly": 0,
            "matched_no": 0,
        },
        "total": 0,
        "to_revisit": [],
    }

    state = await start(client, fixture, length=3)
    session = state["session_id"]
    first = state["question"]["question_version_id"]
    state = await answer(client, session, state, "A", confidence="guessed")
    second = state["question"]["question_version_id"]
    state = await answer(client, session, state, "A", confidence="unsure")

    def feedback(version: str) -> str:
        return f"/v1/practice/{session}/lesson/{version}/feedback"

    for version, body in (
        (first, {"context": "after_guess", "understood": "got_it"}),
        # Changed their mind: the latest word is the one that counts.
        (first, {"context": "after_guess", "understood": "too_hard", "matched_working": "no"}),
        (second, {"context": "after_unsure", "understood": "got_it", "matched_working": "yes"}),
    ):
        response = await client.post(feedback(version), json=body)
        assert response.status_code == 201, response.text

    summary = (await client.get(url)).json()
    assert summary["total"] == 2
    assert summary["counts"] == {
        "got_it": 1,
        "unsure": 0,
        "too_hard": 1,
        "matched_yes": 1,
        "matched_partly": 0,
        "matched_no": 1,
    }
    # The fixture's exam is a test exam (PR...), which students never see listed.
    assert summary["to_revisit"] == []

    async with get_engine().begin() as conn:
        short = (
            await conn.execute(
                text(
                    "SELECT e.short_name FROM examinations e JOIN subjects s "
                    "ON s.examination_id = e.id WHERE s.id = CAST(:s AS uuid)"
                ),
                {"s": fixture["subject_id"]},
            )
        ).scalar_one()
        await conn.execute(
            text("UPDATE examinations SET short_name = :new WHERE short_name = :old"),
            {"new": "X" + short, "old": short},
        )
    try:
        [revisit] = (await client.get(url)).json()["to_revisit"]
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(
                text("UPDATE examinations SET short_name = :old WHERE short_name = :new"),
                {"new": "X" + short, "old": short},
            )
    assert revisit["question_version_id"] == first
    assert revisit["subject_id"] == fixture["subject_id"]
    assert revisit["subject_name"] == "Practice subject"
    assert (revisit["topic_name"], revisit["subtopic_name"]) == ("The topic", "The subtopic")
    assert revisit["understood"] == "too_hard"
    assert revisit["stem_excerpt"]
    assert revisit["at"]


def test_a_stem_excerpt_is_plain_and_short() -> None:
    assert stem_excerpt("  <b>Find</b>   **x**\n if  x+1=2 ") == "Find x if x+1=2"
    long = stem_excerpt("word " * 100)
    assert len(long) <= 120
    assert long.endswith("…")
