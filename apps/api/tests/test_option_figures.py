"""Options that are drawings: each picture rides on its option, never as the question's figure.

Some UTME Physics questions answer in pictures (four transistor symbols). Each drawn option is
a question_assets row with `option_key` set (migration 030), and the option's text is only a
label. Two things must hold everywhere a question reaches a screen: the option carries its
picture, and the question's own figures never include one.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from test_practice import client, fixture  # noqa: F401  (pytest fixtures)

from app import figures as figures_module
from app.db import get_engine
from app.figures import OptionFigure, figures_for, option_figures_for
from app.routers import checkup as checkup_module
from app.routers.practice import Option, _option_for_coach

#: A real figure from the bank, so the routes serve a file that exists.
A_REAL_FIGURE = "docs/questions/utme/mathematics/figures/svg/2001_q13.svg"


# --- without a database ---------------------------------------------------------------------


class _Recorder:
    """Stands in for `fetch_all`: hands back canned rows and keeps the SQL it was sent."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.sql: list[str] = []

    async def __call__(self, conn: object, sql: str, **params: object) -> list[dict[str, Any]]:
        self.sql.append(sql)
        return self.rows


def _row(version: uuid.UUID, key: str | None, **overrides: object) -> dict[str, Any]:
    return {
        "question_version_id": version,
        "option_key": key,
        "id": uuid.uuid4(),
        "mime_type": "image/svg+xml",
        "alt_text": f"Symbol {key}",
        "width": 120,
        "height": 90,
    } | overrides


async def test_the_question_figure_query_leaves_option_pictures_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = _Recorder([])
    monkeypatch.setattr(figures_module, "fetch_all", recorder)
    await figures_for(None, uuid.uuid4())  # type: ignore[arg-type]
    assert "option_key IS NULL" in recorder.sql[0]


async def test_each_option_gets_its_own_picture(monkeypatch: pytest.MonkeyPatch) -> None:
    version = uuid.uuid4()
    first_b = _row(version, "B")
    recorder = _Recorder(
        [
            _row(version, "A"),
            first_b,
            _row(version, "B", alt_text="a second drawing for B"),
            _row(version, "C", mime_type="application/pdf"),
        ]
    )
    monkeypatch.setattr(figures_module, "fetch_all", recorder)
    found = await option_figures_for(None, [version, version])  # type: ignore[arg-type]

    assert set(found) == {(str(version), "A"), (str(version), "B")}, "a PDF is not a picture"
    b = found[(str(version), "B")]
    assert b.id == first_b["id"], "the first in print order wins"
    assert b.url == f"/v1/figures/{first_b['id']}"
    assert (b.alt_text, b.width, b.height) == ("Symbol B", 120, 90)
    assert "option_key IS NOT NULL" in recorder.sql[0]
    assert "licence_status = 'verified'" in recorder.sql[0]


async def test_the_reviewer_sees_uncleared_pictures_from_its_own_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    version = uuid.uuid4()
    row = _row(version, "A")
    recorder = _Recorder([row])
    monkeypatch.setattr(figures_module, "fetch_all", recorder)
    found = await option_figures_for(
        None,  # type: ignore[arg-type]
        [version],
        cleared_only=False,
        url_prefix="/v1/review/figures",
    )
    assert "licence_status" not in recorder.sql[0]
    assert found[(str(version), "A")].url == f"/v1/review/figures/{row['id']}"


async def test_no_versions_means_no_query(monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = _Recorder([])
    monkeypatch.setattr(figures_module, "fetch_all", recorder)
    assert await option_figures_for(None, []) == {}  # type: ignore[arg-type]
    assert recorder.sql == []


async def test_the_checkup_puts_each_picture_on_its_option(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    version = uuid.uuid4()
    picture = _row(version, "B")

    async def options(conn: object, sql: str, **params: object) -> list[dict[str, Any]]:
        return [{"option_key": "A", "body": "Symbol A"}, {"option_key": "B", "body": "Symbol B"}]

    monkeypatch.setattr(checkup_module, "fetch_all", options)
    monkeypatch.setattr(figures_module, "fetch_all", _Recorder([picture]))
    found = await checkup_module._options(None, version)  # type: ignore[arg-type]
    assert found[0].figure is None
    assert found[1].figure is not None and found[1].figure.id == picture["id"]
    assert found[0].model_dump() == {"option_key": "A", "body": "Symbol A", "figure": None}


def test_an_option_without_a_picture_keeps_its_old_shape() -> None:
    assert Option(option_key="A", body="2 m/s").model_dump() == {
        "option_key": "A",
        "body": "2 m/s",
        "figure": None,
    }


def test_the_coach_reads_a_drawn_option_by_its_description() -> None:
    picture = OptionFigure(
        id=uuid.uuid4(),
        url="/v1/figures/x",
        alt_text="An NPN transistor symbol",
        width=None,
        height=None,
    )
    assert _option_for_coach(Option(option_key="A", body="Symbol A", figure=picture)) == (
        "A",
        "Symbol A (drawn: An NPN transistor symbol)",
    )
    assert _option_for_coach(Option(option_key="B", body="2 m/s")) == ("B", "2 m/s")


# --- against the local database -------------------------------------------------------------


@pytest.fixture
async def drawn(fixture: dict[str, str]) -> AsyncIterator[dict[str, Any]]:  # noqa: F811
    """Every fixture question gets a figure of its own and a drawing for each of A to D."""
    async with get_engine().connect() as conn:
        has_column = (
            await conn.execute(
                text(
                    """
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'question_assets' AND column_name = 'option_key'
                      AND table_schema = current_schema()
                    """
                )
            )
        ).first()
    if has_column is None:
        pytest.skip("question_assets.option_key is not there yet — apply migration 030")

    async with get_engine().begin() as conn:
        versions = [
            str(row[0])
            for row in await conn.execute(
                text("SELECT id FROM question_versions WHERE subject_id = CAST(:s AS uuid)"),
                {"s": fixture["subject_id"]},
            )
        ]
        for version in versions:
            for order, key in enumerate([None, "A", "B", "C", "D"]):
                await conn.execute(
                    text(
                        """
                        INSERT INTO question_assets (question_version_id, storage_uri,
                          mime_type, licence_status, alt_text, display_order, option_key)
                        VALUES (CAST(:v AS uuid), :uri, 'image/svg+xml', 'verified', :alt,
                          :order, :key)
                        """
                    ),
                    {
                        "v": version,
                        "uri": A_REAL_FIGURE,
                        "alt": "The circuit" if key is None else f"Transistor symbol {key}",
                        "order": order,
                        "key": key,
                    },
                )
    yield {**fixture, "versions": versions}
    async with get_engine().begin() as conn:
        await conn.execute(
            text("DELETE FROM question_assets WHERE question_version_id = ANY(CAST(:v AS uuid[]))"),
            {"v": versions},
        )


def _check_question(question: dict[str, Any]) -> None:
    """The question's own figure stays; each option carries its own drawing."""
    assert [figure["alt_text"] for figure in question["figures"]] == ["The circuit"]
    for option in question["options"]:
        figure = option["figure"]
        assert figure is not None, option
        assert figure["alt_text"] == f"Transistor symbol {option['option_key']}"
        assert figure["url"] == f"/v1/figures/{figure['id']}"


@pytest.mark.integration
async def test_practice_sends_each_option_its_picture(
    client: httpx.AsyncClient,  # noqa: F811
    drawn: dict[str, Any],
) -> None:
    response = await client.post(
        "/v1/practice/start",
        json={"student_id": drawn["student"], "subject_id": drawn["subject_id"], "length": 3},
    )
    assert response.status_code == 200, response.text
    question = response.json()["question"]
    _check_question(question)

    # The picture is served to the student like any figure.
    served = await client.get(question["options"][0]["figure"]["url"])
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/svg+xml")


@pytest.mark.integration
async def test_the_mock_paper_and_report_send_each_option_its_picture(
    client: httpx.AsyncClient,  # noqa: F811
    drawn: dict[str, Any],
) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO student_exam_goals (student_id, subject_id, status)
                VALUES (CAST(:student AS uuid), CAST(:subject_id AS uuid), 'active')
                """
            ),
            drawn,
        )
    try:
        started = await client.post(
            "/v1/mock/start",
            json={
                "student_id": drawn["student"],
                "subjects": [{"subject_id": drawn["subject_id"], "questions": 3}],
                "minutes": 30,
            },
        )
        assert started.status_code == 200, started.text
        paper = started.json()
        for question in paper["subjects"][0]["questions"]:
            _check_question(question)

        handed_in = await client.post(f"/v1/mock/{paper['mock_id']}/submit", json={"answers": []})
        assert handed_in.status_code == 200, handed_in.text
        for item in handed_in.json()["subjects"][0]["items"]:
            _check_question(item)
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("SET LOCAL scorepilot.allow_erasure = 'on'"))
            for statement in (
                "DELETE FROM attempts WHERE student_id = CAST(:student AS uuid)",
                "DELETE FROM study_sessions WHERE student_id = CAST(:student AS uuid)",
                "DELETE FROM mock_exams WHERE student_id = CAST(:student AS uuid)",
            ):
                await conn.execute(text(statement), drawn)


@pytest.mark.integration
async def test_the_reviewer_sees_each_option_picture(
    client: httpx.AsyncClient,  # noqa: F811
    drawn: dict[str, Any],
) -> None:
    async with get_engine().connect() as conn:
        question_id = (
            await conn.execute(
                text("SELECT question_id FROM question_versions WHERE id = CAST(:v AS uuid)"),
                {"v": drawn["versions"][0]},
            )
        ).scalar_one()
    response = await client.get(f"/v1/review/questions/{question_id}")
    assert response.status_code == 200, response.text
    options = response.json()["options"]
    assert [option["option_key"] for option in options] == list("ABCD")
    for option in options:
        assert option["figure"]["alt_text"] == f"Transistor symbol {option['option_key']}"
        assert option["figure"]["url"] == f"/v1/review/figures/{option['figure']['id']}"
    served = await client.get(options[0]["figure"]["url"])
    assert served.status_code == 200
    assert (await client.get(f"/v1/review/figures/{uuid.uuid4()}")).status_code == 404
