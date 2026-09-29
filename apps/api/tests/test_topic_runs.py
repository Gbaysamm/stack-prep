"""A run started on one topic stays on that topic, from its first question to its last.

The web's topic buttons ("Practise Indices") send `subtopic_ids`. What has to hold is that the
run never drifts back to the engine's own plan, even when the plan would put another topic
first, and even when questions are missed, hinted and taught along the way. And once every
question there has been met, a new run on it is refused plainly rather than widened.

Built on the custom-run bank: the fixture's own topic (which the plan puts first), Algebra and
Geometry.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from test_access import people
from test_practice import answer, client, fixture
from test_runs import bank, start

pytestmark = pytest.mark.integration

# Used by name; imported so pytest can find them here.
__all__ = ["bank", "client", "fixture", "people"]


async def test_a_subtopic_run_only_ever_serves_that_subtopic(
    client: httpx.AsyncClient, fixture: dict[str, str], bank: dict[str, Any]
) -> None:
    # A general run starts elsewhere: the plan's own first topic, not Algebra.
    general = await start(client, fixture, length=1)
    assert general.status_code == 200, general.text
    assert general.json()["question"]["topic_name"] != "Algebra"

    response = await start(client, fixture, length=10, subtopic_ids=[bank["Algebra"]["subtopic"]])
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["filters"] == {
        "topic_ids": [],
        "subtopic_ids": [bank["Algebra"]["subtopic"]],
        "exam_years": [],
    }
    # Algebra has three questions, so a run of ten is three.
    assert state["length"] == 3

    asked: list[str] = []
    missed_once = False
    while state["stage"] != "finished":
        question = state["question"]
        assert question["subtopic_name"] == "Algebra basics", question
        assert question["topic_name"] == "Algebra", question
        if question["question_version_id"] not in asked:
            asked.append(question["question_version_id"])
        session = state["session_id"]
        if not missed_once:
            # Miss twice: a hint, then the lesson. The next question is still Algebra.
            missed_once = True
            state = await answer(client, session, state, "B")
            if state["stage"] == "hint":
                state = await answer(client, session, state, "C")
            if state["stage"] == "explain":
                taught = await client.post(f"/v1/practice/{session}/taught")
                assert taught.status_code == 200, taught.text
                state = taught.json()
            continue
        state = await answer(client, session, state, "A", confidence="sure")

    assert len(asked) == 3
    assert {bank["versions"][version]["topic"] for version in asked} == {"Algebra"}

    # Everything in Algebra has been met now: a new run there is refused, never widened.
    again = await start(client, fixture, length=10, subtopic_ids=[bank["Algebra"]["subtopic"]])
    assert again.status_code == 422, again.text
    assert again.json() == {
        "detail": "No questions match that choice yet. Try more topics or years."
    }
