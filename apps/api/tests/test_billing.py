"""Plans: each plan's features, discounts, paying through Paystack (stubbed), and gifts.

Paystack is never called: `initialize` and `verify` are replaced, and the secret key is a test
value, so the webhook's signature can be made here. The limits switch and the Free plan are
shared by the whole database; `free_limits` sets them for a test and puts them back after.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
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
MakePlan = Callable[..., Awaitable[dict[str, str]]]
FREE_COLUMNS = "practice_per_day, mocks_allowed, mocks_per, voice, coach_per_day, custom_runs"


@pytest.fixture
async def free_limits() -> AsyncIterator[Callable[..., Any]]:
    async with get_engine().connect() as conn:
        on = (await conn.execute(text("SELECT limits_on FROM billing_settings"))).scalar_one()
        free = (
            (
                await conn.execute(
                    text(f"SELECT {FREE_COLUMNS} FROM premium_plans WHERE kind = 'free'")
                )
            )
            .mappings()
            .one()
        )

    async def set_limits(
        limits_on: bool,
        practice: int | None = 20,
        mocks: int | None = 1,
        custom_runs: bool = True,
    ) -> None:
        async with get_engine().begin() as conn:
            await conn.execute(
                text("UPDATE billing_settings SET limits_on = :on"), {"on": limits_on}
            )
            await conn.execute(
                text(
                    "UPDATE premium_plans SET practice_per_day = :p, mocks_allowed = :m,"
                    " mocks_per = 'total', voice = false, coach_per_day = 0, custom_runs = :c"
                    " WHERE kind = 'free'"
                ),
                {"p": practice, "m": mocks, "c": custom_runs},
            )

    yield set_limits
    async with get_engine().begin() as conn:
        await conn.execute(text("UPDATE billing_settings SET limits_on = :on"), {"on": on})
        await conn.execute(
            text(
                "UPDATE premium_plans SET practice_per_day = :practice_per_day,"
                " mocks_allowed = :mocks_allowed, mocks_per = :mocks_per, voice = :voice,"
                " coach_per_day = :coach_per_day, custom_runs = :custom_runs WHERE kind = 'free'"
            ),
            dict(free),
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
async def make_plan() -> AsyncIterator[MakePlan]:
    """Paid plans made by the test, priced for a 30-day length of their own, removed after."""
    made: list[str] = []
    lengths: list[str] = []

    async def make(
        name: str = "Test plan",
        practice: int | None = None,
        mocks: int | None = None,
        voice: bool = True,
        coach: int = 20,
        price: int = 250000,
        order: int = 50,
    ) -> dict[str, str]:
        async with get_engine().begin() as conn:
            plan = str(
                (
                    await conn.execute(
                        text(
                            "INSERT INTO premium_plans (name, practice_per_day, mocks_allowed,"
                            " voice, coach_per_day, display_order)"
                            " VALUES (:n, :p, :m, :v, :c, :o) RETURNING id"
                        ),
                        {"n": name, "p": practice, "m": mocks, "v": voice, "c": coach, "o": order},
                    )
                ).scalar_one()
            )
            length = str(
                (
                    await conn.execute(
                        text(
                            "INSERT INTO plan_lengths (label, days, display_order)"
                            " VALUES ('Test month', 30, -100) RETURNING id"
                        )
                    )
                ).scalar_one()
            )
            await conn.execute(
                text("INSERT INTO plan_prices VALUES (:p, :l, :price)"),
                {"p": plan, "l": length, "price": price},
            )
        made.append(plan)
        lengths.append(length)
        return {"plan_id": plan, "length_id": length}

    yield make
    async with get_engine().begin() as conn:
        for plan in made:
            await conn.execute(text("DELETE FROM premium_periods WHERE plan_id = :p"), {"p": plan})
            await conn.execute(text("DELETE FROM payments WHERE plan_id = :p"), {"p": plan})
            await conn.execute(text("DELETE FROM discounts WHERE plan_id = :p"), {"p": plan})
            await conn.execute(text("DELETE FROM premium_plans WHERE id = :p"), {"p": plan})
        for length in lengths:
            await conn.execute(text("DELETE FROM plan_lengths WHERE id = :l"), {"l": length})


async def _discount(
    plan: str, percent: int, *, code: str | None = None, student: str | None = None
) -> str:
    async with get_engine().begin() as conn:
        return str(
            (
                await conn.execute(
                    text(
                        "INSERT INTO discounts (code, student_id, plan_id, percent_off)"
                        " VALUES (:c, :s, :p, :pc) RETURNING id"
                    ),
                    {"c": code, "s": student, "p": plan, "pc": percent},
                )
            ).scalar_one()
        )


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


async def _give(student: str, plan: str, days: int) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO premium_periods (student_id, plan_id, starts_at, ends_at) "
                "VALUES (:s, :p, now(), now() + make_interval(days => :d))"
            ),
            {"s": student, "p": plan, "d": days},
        )


async def test_nothing_is_held_back_while_the_limits_are_off(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(False, practice=0, mocks=0)
    state = await start(client, fixture)
    version = state["question"]["question_version_id"]
    assert (await _answer(client, state["session_id"], version, "A")).status_code == 200
    standing = (await client.get(f"/v1/student/{fixture['student']}/billing")).json()
    assert standing["limits_on"] is False and standing["premium"] is False
    assert standing["allowance"]["practice_per_day"] is None


async def test_the_free_questions_run_out_and_a_higher_plan_gives_more(
    client: httpx.AsyncClient,
    fixture: dict[str, str],
    free_limits: Callable[..., Any],
    make_plan: MakePlan,
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
    assert "1 practice questions" in refused.json()["detail"]
    assert "free plan" in refused.json()["detail"]
    body = {"student_id": fixture["student"], "subject_id": fixture["subject_id"], "length": 3}
    assert (await client.post("/v1/practice/start", json=body)).status_code == 402

    # A plan of two a day lets one more through, then refuses by name.
    basic = await make_plan("Basic", practice=2, order=51)
    await _give(fixture["student"], basic["plan_id"], 3)
    assert (await _answer(client, session, second, "A")).status_code == 200
    standing = (await client.get(f"/v1/student/{fixture['student']}/billing")).json()
    assert standing["plan_name"] == "Basic" and standing["allowance"]["practice_per_day"] == 2
    assert standing["practice_used_today"] == 2
    over = await client.post("/v1/practice/start", json=body)
    assert over.status_code == 402 and "Basic" in over.json()["detail"]

    # A higher-ranked plan running at the same time applies: unlimited.
    pro = await make_plan("Pro", practice=None, order=52)
    await _give(fixture["student"], pro["plan_id"], 3)
    standing = (await client.get(f"/v1/student/{fixture['student']}/billing")).json()
    assert standing["plan_name"] == "Pro" and standing["allowance"]["practice_per_day"] is None


async def test_a_custom_run_needs_a_plan_that_includes_it(
    client: httpx.AsyncClient, fixture: dict[str, str], free_limits: Callable[..., Any]
) -> None:
    await free_limits(True, practice=50, custom_runs=False)
    refused = await client.post(
        "/v1/practice/start",
        json={"student_id": fixture["student"], "subject_id": fixture["subject_id"],
              "length": 3, "exam_years": [2016]},
    )
    assert refused.status_code == 402 and "topics and years" in refused.json()["detail"]
    await start(client, fixture)  # an ordinary run is still fine


async def test_the_voice_and_coach_come_with_a_plan_but_the_board_is_free(
    client: httpx.AsyncClient,
    fixture: dict[str, str],
    free_limits: Callable[..., Any],
    make_plan: MakePlan,
) -> None:
    await free_limits(True, practice=50)
    state = await start(client, fixture)
    session, version = state["session_id"], state["question"]["question_version_id"]
    base = f"/v1/practice/{session}/lesson/{version}"
    warmed = await client.post(f"{base}/warm")
    assert warmed.status_code == 202 and warmed.json() == {"beats": 0}
    assert (await client.get(f"{base}/voice/0")).status_code == 402
    ask = {"question_version_id": version, "asked": "Why is it B?"}
    assert (await client.post(f"/v1/practice/{session}/ask", json=ask)).status_code == 402

    # A plan with the voice but no coach: the voice opens, asking still doesn't.
    quiet = await make_plan("Quiet", voice=True, coach=0)
    await _give(fixture["student"], quiet["plan_id"], 3)
    assert (await client.get(f"{base}/voice/0")).status_code != 402
    assert (await client.post(f"/v1/practice/{session}/ask", json=ask)).status_code == 402


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
    assert "free plan" in refused.json()["detail"]


async def test_the_catalogue_shows_free_first_and_checkout_needs_a_key(
    client: httpx.AsyncClient, make_plan: MakePlan, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paystack, "get_settings", lambda: Settings(paystack_secret_key=""))
    offer = await make_plan()
    person = await signed_up(client)
    try:
        catalogue = (await client.get("/v1/billing/plans")).json()
        assert catalogue["checkout_open"] is False
        assert catalogue["plans"][0]["kind"] == "free"
        plan = next(p for p in catalogue["plans"] if p["id"] == offer["plan_id"])
        assert plan["prices"] == {offer["length_id"]: 250000}
        assert plan["features"]["coach_per_day"] == 20
        closed = await client.post(
            f"/v1/student/{person.student_id}/billing/checkout", json=offer
        )
        assert closed.status_code == 503
    finally:
        await remove([person])


async def test_paying_gives_the_plan_once(
    client: httpx.AsyncClient, make_plan: MakePlan, paystack_stub: dict[str, Any]
) -> None:
    offer = await make_plan("Standard")
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/billing"
    try:
        started = await client.post(f"{path}/checkout", json=offer)
        assert started.status_code == 200, started.text
        reference = started.json()["reference"]
        assert started.json()["authorization_url"].endswith(reference)
        sent = paystack_stub["initialized"][0]
        assert sent["amount_kobo"] == 250000 and sent["email"] == person.login
        assert sent["callback_url"].endswith("/plans/paid")

        confirmed = await client.post(f"{path}/confirm", json={"reference": reference})
        assert confirmed.status_code == 200, confirmed.text
        body = confirmed.json()
        assert body["status"] == "paid" and body["plan_name"] == "Standard"
        assert body["standing"]["plan_name"] == "Standard"
        until = datetime.fromisoformat(body["standing"]["plan_until"])
        assert abs(until - (datetime.now(UTC) + timedelta(days=30))) < timedelta(minutes=5)
        assert body["standing"]["receipts"][0]["length_label"] == "Test month"

        # The webhook arriving too, or the page reloaded, adds nothing more.
        again = await client.post(f"{path}/confirm", json={"reference": reference})
        assert again.json()["standing"]["plan_until"] == body["standing"]["plan_until"]

        # A second month of the same plan starts when the first ends.
        second = (await client.post(f"{path}/checkout", json=offer)).json()
        later = await client.post(f"{path}/confirm", json={"reference": second["reference"]})
        extended = datetime.fromisoformat(later.json()["standing"]["plan_until"])
        assert abs(extended - until - timedelta(days=30)) < timedelta(minutes=1)
    finally:
        await remove([person])


async def test_a_promo_code_takes_money_off(
    client: httpx.AsyncClient, make_plan: MakePlan, paystack_stub: dict[str, Any]
) -> None:
    offer = await make_plan("Coded")
    await _discount(offer["plan_id"], 40, code="EXAM40")
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/billing"
    try:
        bad = await client.post(f"{path}/quote", json={**offer, "code": "NOPE"})
        assert bad.status_code == 422
        quote = (await client.post(f"{path}/quote", json={**offer, "code": "exam40"})).json()
        assert quote["list_price_kobo"] == 250000 and quote["amount_kobo"] == 150000
        assert quote["discount_label"] == "40% off with EXAM40"
        started = await client.post(f"{path}/checkout", json={**offer, "code": "exam40"})
        assert started.status_code == 200, started.text
        assert paystack_stub["initialized"][0]["amount_kobo"] == 150000
        await client.post(f"{path}/confirm", json={"reference": started.json()["reference"]})
        # Used once by this student: not again.
        again = await client.post(f"{path}/quote", json={**offer, "code": "EXAM40"})
        assert again.status_code == 422
    finally:
        await remove([person])


async def test_a_full_offer_to_one_student_gives_the_plan_without_paying(
    client: httpx.AsyncClient, make_plan: MakePlan, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paystack, "get_settings", lambda: Settings(paystack_secret_key=""))
    offer = await make_plan("Scholarship")
    person = await signed_up(client)
    other = None
    path = f"/v1/student/{person.student_id}/billing"
    try:
        await _discount(offer["plan_id"], 100, student=person.student_id)
        standing = (await client.get(path)).json()
        assert [o["percent_off"] for o in standing["offers"]] == [100]
        quote = (await client.post(f"{path}/quote", json=offer)).json()
        assert quote["amount_kobo"] == 0
        granted = await client.post(f"{path}/checkout", json=offer)
        assert granted.status_code == 200, granted.text
        assert granted.json()["granted"] is True and granted.json()["authorization_url"] is None
        after = (await client.get(path)).json()
        assert after["plan_name"] == "Scholarship" and after["offers"] == []
        assert after["receipts"][0]["amount_kobo"] == 0

        # Nobody else sees it.
        other = await signed_up(client)
        theirs = (await client.get(f"/v1/student/{other.student_id}/billing")).json()
        assert theirs["offers"] == []
    finally:
        await remove([person] + ([other] if other else []))


async def test_a_short_or_failed_payment_gives_nothing(
    client: httpx.AsyncClient, make_plan: MakePlan, paystack_stub: dict[str, Any]
) -> None:
    offer = await make_plan()
    person = await signed_up(client)
    path = f"/v1/student/{person.student_id}/billing"
    try:
        paystack_stub["amount"] = 100
        short = (await client.post(f"{path}/checkout", json=offer)).json()
        result = await client.post(f"{path}/confirm", json={"reference": short["reference"]})
        assert result.json()["status"] == "failed"
        assert result.json()["standing"]["premium"] is False

        paystack_stub["amount"] = None
        paystack_stub["status"] = "abandoned"
        left = (await client.post(f"{path}/checkout", json=offer)).json()
        result = await client.post(f"{path}/confirm", json={"reference": left["reference"]})
        assert result.json()["status"] == "abandoned"
        assert result.json()["standing"]["premium"] is False
    finally:
        await remove([person])


async def test_someone_elses_payment_cannot_be_confirmed(
    client: httpx.AsyncClient, make_plan: MakePlan, paystack_stub: dict[str, Any]
) -> None:
    offer = await make_plan()
    payer = await signed_up(client)
    reference = (
        await client.post(f"/v1/student/{payer.student_id}/billing/checkout", json=offer)
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
    client: httpx.AsyncClient, make_plan: MakePlan, paystack_stub: dict[str, Any]
) -> None:
    offer = await make_plan()
    person = await signed_up(client)
    try:
        reference = (
            await client.post(
                f"/v1/student/{person.student_id}/billing/checkout", json=offer
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


async def test_an_admin_runs_plans_lengths_discounts_and_gifts(
    client: httpx.AsyncClient, free_limits: Callable[..., Any]
) -> None:
    student = await signed_up(client)
    assert (await client.get("/v1/admin/billing")).status_code == 403
    plan_id = length_id = None
    try:
        async with staff_login(client, "admin"):
            switched = await client.put("/v1/admin/billing/limits", json={"limits_on": True})
            assert switched.status_code == 200
            length = await client.post(
                "/v1/admin/billing/lengths", json={"label": "Two weeks", "days": 14}
            )
            assert length.status_code == 201, length.text
            length_id = length.json()["id"]
            made = await client.post(
                "/v1/admin/billing/plans",
                json={
                    "name": "Exam pro",
                    "practice_per_day": None,
                    "mocks_allowed": 3,
                    "mocks_per": "week",
                    "coach_per_day": 40,
                    "custom_runs": False,
                    "extras": ["  WhatsApp   study group ", ""],
                    "featured": True,
                    "display_order": 90,
                    "prices": [{"length_id": length_id, "price_kobo": 150000}],
                },
            )
            assert made.status_code == 201, made.text
            plan = made.json()
            plan_id = plan["id"]
            assert plan["prices"] == {length_id: 150000}
            assert plan["features"]["mocks_allowed"] == 3
            assert plan["features"]["custom_runs"] is False
            assert plan["features"]["extras"] == ["WhatsApp study group"]
            assert plan["sold"] == 0 and plan["active"] == 0

            changed = await client.put(
                f"/v1/admin/billing/plans/{plan_id}",
                json={"name": "Exam pro", "mocks_allowed": 5, "on_sale": False,
                      "prices": [{"length_id": length_id, "price_kobo": None}]},
            )
            assert changed.status_code == 200, changed.text
            assert changed.json()["prices"] == {}
            assert changed.json()["features"]["mocks_allowed"] == 5

            overview = (await client.get("/v1/admin/billing")).json()
            assert overview["limits_on"] is True
            free = next(p for p in overview["plans"] if p["kind"] == "free")
            edited = await client.put(
                f"/v1/admin/billing/plans/{free['id']}",
                json={"name": "Free", "practice_per_day": 25, "mocks_allowed": 1,
                      "mocks_per": "total", "voice": False, "coach_per_day": 0,
                      "on_sale": False},
            )
            assert edited.json()["features"]["practice_per_day"] == 25
            assert edited.json()["on_sale"] is True  # Free is always there

            code = await client.post(
                "/v1/admin/billing/discounts",
                json={"code": "back to school!", "percent_off": 20, "max_uses": 100},
            )
            assert code.status_code == 422  # spaces are taken out, other characters refused
            code = await client.post(
                "/v1/admin/billing/discounts",
                json={"code": "back-to-school", "percent_off": 20, "max_uses": 100},
            )
            assert code.status_code == 201, code.text
            assert code.json()["code"] == "BACK-TO-SCHOOL"
            clash = await client.post(
                "/v1/admin/billing/discounts", json={"code": "BACK-TO-SCHOOL", "percent_off": 5}
            )
            assert clash.status_code == 409
            personal = await client.post(
                "/v1/admin/billing/discounts",
                json={"student_id": student.student_id, "plan_id": plan_id, "percent_off": 100,
                      "note": "Scholarship"},
            )
            assert personal.status_code == 201, personal.text
            off = await client.put(
                f"/v1/admin/billing/discounts/{code.json()['id']}", json={"active": False}
            )
            assert off.json()["active"] is False
            listed = (
                await client.get(f"/v1/admin/billing/discounts?student_id={student.student_id}")
            ).json()
            assert [d["percent_off"] for d in listed] == [100]

            gifted = await client.post(
                f"/v1/admin/billing/students/{student.student_id}/gift",
                json={"plan_id": plan_id, "days": 7, "note": "Scholarship"},
            )
            assert gifted.status_code == 200, gifted.text
            assert gifted.json()["plan_name"] == "Exam pro" and gifted.json()["plan_until"]
            refused = await client.post(
                f"/v1/admin/billing/students/{student.student_id}/gift",
                json={"plan_id": free["id"], "days": 7},
            )
            assert refused.status_code == 404  # Free is not given; everyone has it
            async with get_engine().begin() as conn:
                await conn.execute(text("DELETE FROM discounts WHERE id = :d"),
                                   {"d": code.json()["id"]})
        catalogue = (await client.get("/v1/billing/plans")).json()
        assert plan_id not in [p["id"] for p in catalogue["plans"]]  # off sale
    finally:
        await remove([student])
        async with get_engine().begin() as conn:
            if plan_id:
                await conn.execute(text("DELETE FROM premium_periods WHERE plan_id = :p"),
                                   {"p": plan_id})
                await conn.execute(text("DELETE FROM premium_plans WHERE id = :p"), {"p": plan_id})
            if length_id:
                await conn.execute(text("DELETE FROM plan_lengths WHERE id = :l"), {"l": length_id})
