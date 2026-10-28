"""Premium: the free allowance, plans, paying through Paystack (stubbed), and gifts.

Paystack is never called: `initialize` and `verify` are replaced, and the secret key is a test
value, so the webhook's signature can be made here. The free limits are one row shared by the
whole database; `free_limits` sets them for a test and puts them back after.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import AsyncIterator, Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from staff import remove, signed_up, staff_login
from test_practice import client, fixture, start

from app import paystack
from app.config import Settings
from app.db import get_engine

pytestmark = pytest.mark.integration

# Used by name; imported so pytest can find them here.
__all__ = ["client", "fixture"]

KEY = "sk_test_billing"


@pytest.fixture
async def free_limits() -> AsyncIterator[Callable[..., Any]]:
    async with get_engine().connect() as conn:
        before = (
            (await conn.execute(text("SELECT limits_on, free_practice_per_day, free_mocks "
                                     "FROM billing_settings")))
            .mappings()
            .one()
        )

    async def set_limits(on: bool, practice: int = 20, mocks: int = 1) -> None:
        async with get_engine().begin() as conn:
            await conn.execute(
                text(
                    "UPDATE billing_settings SET limits_on = :on, "
                    "free_practice_per_day = :p, free_mocks = :m"
                ),
                {"on": on, "p": practice, "m": mocks},
            )

    yield set_limits
    await set_limits(
        before["limits_on"], before["free_practice_per_day"], before["free_mocks"]
    )


@pytest.fixture
def paystack_stub(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    """A Paystack that says whatever `said` holds, and remembers what it was asked."""
    said: dict[str, Any] = {"status": "success", "amount": None, "initialized": []}
    monkeypatch.setattr(
        paystack, "get_settings", lambda: Settings(paystack_secret_key=KEY)
    )

    async def initialize(**kwargs: Any) -> str:
        said["initialized"].append(kwargs)
        return f"https://checkout.paystack.test/{kwargs['reference']}"

    async def verify(reference: str) -> paystack.Verified:
        paid = next(i for i in said["initialized"] if i["reference"] == reference)
        return paystack.Verified(
            status=said["status"],
            amount_kobo=said["amount"] if said["amount"] is not None else paid["amount_kobo"],
            currency="NGN",
            channel="card",
        )

    monkeypatch.setattr(paystack, "initialize", initialize)
    monkeypatch.setattr(paystack, "verify", verify)
    yield said


@pytest.fixture
async def plan() -> AsyncIterator[str]:
    async with get_engine().begin() as conn:
        plan_id = str(
            (
                await conn.execute(
                    text(
                        "INSERT INTO premium_plans (name, price_kobo, days, display_order) "
                        "VALUES ('Test month', 250000, 30, -100) RETURNING id"
                    )
                )
            ).scalar_one()
        )
    yield plan_id
    async with get_engine().begin() as conn:
        await conn.execute(text("UPDATE payments SET plan_id = NULL WHERE plan_id = :p"),
                           {"p": plan_id})
        await conn.execute(text("DELETE FROM premium_plans WHERE id = :p"), {"p": plan_id})


async def _answer(
    client: httpx.AsyncClient, session: str, version: str, key: str
) -> httpx.Response:
    return await client.post(
        f"/v1/practice/{session}/answer",
        json={"question_version_id": version, "selected_option_key": key, "response_ms": 5000},
    )


async def _key(version: str) -> str:
    async with get_engine().connect() as conn:
        return str(
            (
                await conn.execute(
                    text(
                        "SELECT option_key FROM question_options "
                        "WHERE question_version_id = :v AND is_correct"
                    ),
                    {"v": version},
                )
            ).scalar_one()
        )


async def _gift(student: str, days: int) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO premium_periods (student_id, starts_at, ends_at) "
                "VALUES (:s, now(), now() + make_interval(days => :d))"
            ),
            {"s": student, "d": days},
        )


async def test_nothing_is_held_back_while_the_limits_are_off(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(False, practice=0, mocks=0)
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    assert (await _answer(client, state["session_id"], version, "A")).status_code == 200
    standing = (await client.get(f"/v1/student/{fixture['student']}/billing")).json()
    assert standing["free"]["limits_on"] is False
    assert standing["premium"] is False


async def test_the_free_questions_run_out_for_the_day(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(True, practice=1)
    state = await start(client, fixture)
    session = state["session_id"]
    first = state["question"]["question_version_id"]
    right = await _key(first)
    wrong = "B" if right == "A" else "A"
    # The first question counts once, however many tries it takes.
    missed = await _answer(client, session, first, wrong)
    assert missed.status_code == 200 and missed.json()["stage"] == "hint"
    moved_on = await _answer(client, session, first, right)
    assert moved_on.status_code == 200, moved_on.text
    second = moved_on.json()["question"]["question_version_id"]
    refused = await _answer(client, session, second, "A")
    assert refused.status_code == 402
    assert "1 free practice questions" in refused.json()["detail"]
    standing = (await client.get(f"/v1/student/{fixture['student']}/billing")).json()
    assert standing["practice_used_today"] == 1
    again = await client.post(
        "/v1/practice/start",
        json={"student_id": fixture["student"], "subject_id": fixture["subject_id"], "length": 3},
    )
    assert again.status_code == 402
    # Premium lifts it.
    await _gift(fixture["student"], 3)
    assert (await _answer(client, session, second, "A")).status_code == 200


async def test_the_voice_and_coach_are_premium_but_the_board_is_not(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(True, practice=50)
    state = await start(client, fixture)
    session, version = state["session_id"], state["question"]["question_version_id"]
    base = f"/v1/practice/{session}/lesson/{version}"
    warmed = await client.post(f"{base}/warm")
    assert warmed.status_code == 202 and warmed.json() == {"beats": 0}
    assert (await client.get(f"{base}/voice/0")).status_code == 402
    asked = await client.post(
        f"/v1/practice/{session}/ask",
        json={"question_version_id": version, "asked": "Why is it B?"},
    )
    assert asked.status_code == 402


async def test_the_free_mocks_run_out(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(True, mocks=0)
    refused = await client.post(
        "/v1/mock/start",
        json={
            "student_id": fixture["student"],
            "subjects": [{"subject_id": fixture["subject_id"], "questions": 3}],
            "minutes": 10,
        },
    )
    assert refused.status_code == 402
    assert "free mock" in refused.json()["detail"]


async def test_checkout_is_closed_without_a_key(
    client: httpx.AsyncClient, plan: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paystack, "get_settings", lambda: Settings(paystack_secret_key=""))
    person = await signed_up(client)
    try:
        catalogue = (await client.get("/v1/billing/plans")).json()
        assert catalogue["checkout_open"] is False
        assert plan in [p["id"] for p in catalogue["plans"]]
        closed = await client.post(
            f"/v1/student/{person.student_id}/billing/checkout", json={"plan_id": plan}
        )
        assert closed.status_code == 503
    finally:
        await remove([person])


async def test_paying_gives_premium_once(
    client: httpx.AsyncClient, plan: str, paystack_stub: dict[str, Any]
) -> None:
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/billing"
    try:
        started = await client.post(f"{path}/checkout", json={"plan_id": plan})
        assert started.status_code == 200, started.text
        reference = started.json()["reference"]
        assert started.json()["authorization_url"].endswith(reference)
        sent = paystack_stub["initialized"][0]
        assert sent["amount_kobo"] == 250000 and sent["email"] == person.login
        assert sent["callback_url"].endswith("/plans/paid")

        confirmed = await client.post(f"{path}/confirm", json={"reference": reference})
        assert confirmed.status_code == 200, confirmed.text
        body = confirmed.json()
        assert body["status"] == "paid" and body["plan_name"] == "Test month"
        until = datetime.fromisoformat(body["standing"]["premium_until"])
        assert abs(until - (datetime.now(UTC) + timedelta(days=30))) < timedelta(minutes=5)
        assert body["standing"]["receipts"][0]["status"] == "paid"

        # The webhook arriving too, or the page reloaded, adds nothing more.
        again = await client.post(f"{path}/confirm", json={"reference": reference})
        assert again.json()["standing"]["premium_until"] == body["standing"]["premium_until"]

        # A second month starts when the first ends.
        second = (await client.post(f"{path}/checkout", json={"plan_id": plan})).json()
        later = (await client.post(f"{path}/confirm", json={"reference": second["reference"]}))
        extended = datetime.fromisoformat(later.json()["standing"]["premium_until"])
        assert abs(extended - until - timedelta(days=30)) < timedelta(minutes=1)
    finally:
        await remove([person])


async def test_a_short_or_failed_payment_gives_nothing(
    client: httpx.AsyncClient, plan: str, paystack_stub: dict[str, Any]
) -> None:
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/billing"
    try:
        paystack_stub["amount"] = 100
        short = (await client.post(f"{path}/checkout", json={"plan_id": plan})).json()
        result = await client.post(f"{path}/confirm", json={"reference": short["reference"]})
        assert result.json()["status"] == "failed"
        assert result.json()["standing"]["premium"] is False

        paystack_stub["amount"] = None
        paystack_stub["status"] = "abandoned"
        left = (await client.post(f"{path}/checkout", json={"plan_id": plan})).json()
        result = await client.post(f"{path}/confirm", json={"reference": left["reference"]})
        assert result.json()["status"] == "abandoned"
        assert result.json()["standing"]["premium"] is False
    finally:
        await remove([person])


async def test_someone_elses_payment_cannot_be_confirmed(
    client: httpx.AsyncClient, plan: str, paystack_stub: dict[str, Any]
) -> None:
    payer = await signed_up(client)
    reference = (
        await client.post(
            f"/v1/student/{payer.student_id}/billing/checkout", json={"plan_id": plan}
        )
    ).json()["reference"]
    other = await signed_up(client)  # now signed in as the other
    try:
        refused = await client.post(
            f"/v1/student/{other.student_id}/billing/confirm", json={"reference": reference}
        )
        assert refused.status_code == 404
    finally:
        await remove([payer, other])


async def test_the_webhook_needs_paystacks_signature(
    client: httpx.AsyncClient, plan: str, paystack_stub: dict[str, Any]
) -> None:
    person = await signed_up(client)
    try:
        reference = (
            await client.post(
                f"/v1/student/{person.student_id}/billing/checkout", json={"plan_id": plan}
            )
        ).json()["reference"]
        client.cookies.clear()
        body = json.dumps({"event": "charge.success", "data": {"reference": reference}}).encode()
        forged = await client.post(
            "/v1/billing/webhook", content=body, headers={"x-paystack-signature": "nope"}
        )
        assert forged.status_code == 401
        signature = hmac.new(KEY.encode(), body, hashlib.sha512).hexdigest()
        real = await client.post(
            "/v1/billing/webhook", content=body, headers={"x-paystack-signature": signature}
        )
        assert real.status_code == 200
        async with get_engine().connect() as conn:
            status = (
                await conn.execute(
                    text("SELECT status FROM payments WHERE reference = :r"), {"r": reference}
                )
            ).scalar_one()
        assert status == "paid"
    finally:
        await remove([person])


async def test_an_admin_sets_limits_plans_and_gives_premium(
    client: httpx.AsyncClient, free_limits: Callable[..., Any]
) -> None:
    student = await signed_up(client)
    assert (await client.get("/v1/admin/billing")).status_code == 403
    plan_id = None
    try:
        async with staff_login(client, "admin"):
            limits = {"limits_on": True, "free_practice_per_day": 15, "free_mocks": 2}
            assert (await client.put("/v1/admin/billing/limits", json=limits)).status_code == 200
            made = await client.post(
                "/v1/admin/billing/plans",
                json={"name": "Exam season", "price_kobo": 900000, "days": 120},
            )
            assert made.status_code == 201, made.text
            plan_id = made.json()["id"]
            assert made.json()["sold"] == 0
            changed = await client.put(
                f"/v1/admin/billing/plans/{plan_id}",
                json={"name": "Exam season", "price_kobo": 800000, "days": 120,
                      "on_sale": False},
            )
            assert changed.json()["price_kobo"] == 800000
            overview = (await client.get("/v1/admin/billing")).json()
            assert overview["limits"] == limits
            assert plan_id in [p["id"] for p in overview["plans"]]
            gifted = await client.post(
                f"/v1/admin/billing/students/{student.student_id}/gift",
                json={"days": 7, "note": "Scholarship"},
            )
            assert gifted.status_code == 200, gifted.text
            assert gifted.json()["premium_until"]
        catalogue = (await client.get("/v1/billing/plans")).json()
        assert plan_id not in [p["id"] for p in catalogue["plans"]]  # off sale
    finally:
        await remove([student])
        if plan_id:
            async with get_engine().begin() as conn:
                await conn.execute(text("DELETE FROM premium_plans WHERE id = :p"),
                                   {"p": plan_id})
