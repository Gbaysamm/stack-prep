"""Plans for students: what's on sale, where a student stands, discounts, and paying.

A student chooses a plan (what it gives) and a length (1 month, 3 months, ...); each paid plan
has a price for each length (migration 035). The Free plan is shown first, for comparison.

Discounts: a promo code typed at checkout, or an offer an admin made for this one student,
which is applied by itself (the best one, when there are several). `quote` shows the price
before paying. 100% off grants the plan at once with no payment page.

Paying: `checkout` records a pending payment under a fresh reference and returns Paystack's
page. The student pays there and comes back to `/plans/paid`, which calls `confirm`; Paystack
also calls `webhook`. Either one asks Paystack itself whether the money arrived, and whichever
gets there first marks the payment paid and adds the days, after any time the student already
has on that plan. Nothing the browser says is trusted.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import notifications, paystack, premium
from app.auth import require_student
from app.config import get_settings
from app.db import connection, fetch_all

_log = logging.getLogger(__name__)
router = APIRouter(tags=["billing"])

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CLOSED = "Payments aren't open yet. Please try again later."
NO_PLAN = "That plan isn't on sale for that length any more."
BAD_CODE = "That code isn't valid for this plan."
#: Paystack's smallest charge, in kobo: a discount never takes a paid price below it.
LEAST_CHARGE = 10000

MocksPer = Literal["day", "week", "month", "total"]


class Length(BaseModel):
    id: UUID
    label: str
    days: int


class Features(BaseModel):
    """What a plan gives. Null is unlimited."""

    practice_per_day: int | None
    mocks_allowed: int | None
    mocks_per: MocksPer
    voice: bool
    coach_per_day: int
    custom_runs: bool
    bookmark_runs: bool
    #: Selling points shown on the card, one a line; not enforced.
    extras: list[str]


class Plan(BaseModel):
    id: UUID
    kind: Literal["free", "paid"]
    name: str
    blurb: str | None
    featured: bool
    features: Features
    #: Length id to price in kobo, for each length the plan is sold for. Empty for Free.
    prices: dict[str, int]


class Catalogue(BaseModel):
    lengths: list[Length]
    #: Free first, then the paid plans on sale, lowest first.
    plans: list[Plan]
    #: False until an admin turns the limits on; nothing is held back before then.
    limits_on: bool
    #: Paystack is set up, so a plan can be bought.
    checkout_open: bool


class Receipt(BaseModel):
    reference: str
    plan_name: str
    length_label: str
    days: int
    list_price_kobo: int
    amount_kobo: int
    discount_label: str | None
    status: Literal["pending", "paid", "failed", "abandoned"]
    channel: str | None
    paid_at: datetime | None
    created_at: datetime


class Allowance(BaseModel):
    #: Null is unlimited.
    practice_per_day: int | None
    mocks: int | None
    mocks_per: str
    voice: bool
    #: Null is the server's own daily allowance.
    coach_per_day: int | None
    custom_runs: bool
    bookmark_runs: bool


class Offer(BaseModel):
    """A discount an admin made for this student."""

    id: UUID
    percent_off: int
    #: Null is any plan / any length.
    plan_id: UUID | None
    plan_name: str | None
    length_id: UUID | None
    length_label: str | None
    expires_at: datetime | None
    note: str | None


class Standing(BaseModel):
    #: Has a paid plan running, or is an admin.
    premium: bool
    plan_id: UUID | None
    plan_name: str | None
    plan_until: datetime | None
    limits_on: bool
    allowance: Allowance
    practice_used_today: int
    #: Counted over the allowance's period.
    mocks_used: int
    #: The email a receipt goes to, when the account has one.
    email: str | None
    offers: list[Offer]
    receipts: list[Receipt]


class Choice(BaseModel):
    plan_id: UUID
    length_id: UUID
    code: str | None = Field(default=None, max_length=30)


class Checkout(Choice):
    #: For an account with no email: Paystack needs one to send the receipt to.
    email: str | None = Field(default=None, max_length=254)


class Quote(BaseModel):
    plan_name: str
    length_label: str
    days: int
    list_price_kobo: int
    amount_kobo: int
    percent_off: int
    discount_label: str | None


class CheckoutStarted(BaseModel):
    #: Null when nothing is owed (100% off): the plan is already the student's.
    authorization_url: str | None
    reference: str
    granted: bool = False


class Confirm(BaseModel):
    reference: str = Field(min_length=4, max_length=100)


class Confirmed(BaseModel):
    status: Literal["pending", "paid", "failed", "abandoned"]
    plan_name: str
    standing: Standing


PLAN_SQL = """
    SELECT id, kind, name, blurb, featured, practice_per_day, mocks_allowed, mocks_per, voice,
           coach_per_day, custom_runs, bookmark_runs, extras, on_sale, display_order
    FROM premium_plans
"""


def _plan(row: Any, prices: dict[str, int]) -> Plan:
    return Plan(
        id=row["id"],
        kind=row["kind"],
        name=row["name"],
        blurb=row["blurb"],
        featured=row["featured"],
        features=Features(
            practice_per_day=row["practice_per_day"],
            mocks_allowed=row["mocks_allowed"],
            mocks_per=row["mocks_per"],
            voice=row["voice"],
            coach_per_day=row["coach_per_day"],
            custom_runs=row["custom_runs"],
            bookmark_runs=row["bookmark_runs"],
            extras=list(row["extras"] or []),
        ),
        prices=prices,
    )


async def plan_rows(conn: AsyncConnection, *, on_sale_only: bool) -> list[tuple[Any, Plan]]:
    """Every plan (Free first), each with its prices; on sale only, for students."""
    rows = await fetch_all(
        conn,
        PLAN_SQL
        + (" WHERE on_sale OR kind = 'free'" if on_sale_only else "")
        + " ORDER BY kind = 'paid', display_order, created_at",
    )
    prices = await fetch_all(
        conn,
        """
        SELECT pr.plan_id, pr.length_id, pr.price_kobo
        FROM plan_prices pr JOIN plan_lengths l ON l.id = pr.length_id
        """
        + (" WHERE l.on_sale" if on_sale_only else ""),
    )
    by_plan: dict[UUID, dict[str, int]] = {}
    for row in prices:
        by_plan.setdefault(row["plan_id"], {})[str(row["length_id"])] = int(row["price_kobo"])
    return [(row, _plan(row, by_plan.get(row["id"], {}))) for row in rows]


@router.get("/v1/billing/plans", response_model=Catalogue, summary="Plans on sale")
async def plans(conn: Annotated[AsyncConnection, Depends(connection)]) -> Catalogue:
    lengths = await fetch_all(
        conn, "SELECT id, label, days FROM plan_lengths WHERE on_sale ORDER BY display_order, days"
    )
    shown = [
        plan
        for _, plan in await plan_rows(conn, on_sale_only=True)
        if plan.kind == "free" or plan.prices
    ]
    return Catalogue(
        lengths=[Length(**row) for row in lengths],
        plans=shown,
        limits_on=await premium.limits_on(conn),
        checkout_open=paystack.configured(),
    )


# ------------------------------------------------------------------ discounts

DISCOUNT_SQL = """
    SELECT d.id, d.code, d.student_id, d.plan_id, d.length_id, d.percent_off, d.max_uses,
           d.expires_at, d.note, p.name AS plan_name, l.label AS length_label,
           (SELECT count(*) FROM payments pay WHERE pay.discount_id = d.id
              AND pay.status = 'paid') AS used
    FROM discounts d
    LEFT JOIN premium_plans p ON p.id = d.plan_id
    LEFT JOIN plan_lengths l ON l.id = d.length_id
    WHERE d.active AND d.starts_at <= now() AND (d.expires_at IS NULL OR d.expires_at > now())
"""


def _usable(row: Any, student_id: UUID, used_by_me: set[UUID]) -> bool:
    if row["student_id"] is not None and row["student_id"] != student_id:
        return False
    if row["id"] in used_by_me:
        return False  # a code or an offer is used once by each student
    cap = row["max_uses"] if row["max_uses"] is not None else (1 if row["student_id"] else None)
    return cap is None or int(row["used"]) < cap


async def _used_by(conn: AsyncConnection, student_id: UUID) -> set[UUID]:
    rows = await fetch_all(
        conn,
        "SELECT DISTINCT discount_id FROM payments"
        " WHERE student_id = :s AND status = 'paid' AND discount_id IS NOT NULL",
        s=student_id,
    )
    return {row["discount_id"] for row in rows}


async def offers_for(conn: AsyncConnection, student_id: UUID) -> list[Offer]:
    rows = await fetch_all(
        conn, DISCOUNT_SQL + " AND d.student_id = :s ORDER BY d.percent_off DESC", s=student_id
    )
    used = await _used_by(conn, student_id)
    return [
        Offer(
            id=row["id"],
            percent_off=row["percent_off"],
            plan_id=row["plan_id"],
            plan_name=row["plan_name"],
            length_id=row["length_id"],
            length_label=row["length_label"],
            expires_at=row["expires_at"],
            note=row["note"],
        )
        for row in rows
        if _usable(row, student_id, used)
    ]


async def quote_for(conn: AsyncConnection, student_id: UUID, choice: Choice) -> tuple[Quote, Any]:
    """The price of a plan for a length, with the code given or the student's best offer."""
    offer = (
        (
            await conn.execute(
                text(
                    """
                    SELECT p.name, l.label, l.days, pr.price_kobo
                    FROM plan_prices pr
                    JOIN premium_plans p ON p.id = pr.plan_id
                    JOIN plan_lengths l ON l.id = pr.length_id
                    WHERE pr.plan_id = :p AND pr.length_id = :l AND p.on_sale AND l.on_sale
                      AND p.kind = 'paid'
                    """
                ),
                {"p": choice.plan_id, "l": choice.length_id},
            )
        )
        .mappings()
        .first()
    )
    if offer is None:
        raise HTTPException(status_code=404, detail=NO_PLAN)
    used = await _used_by(conn, student_id)
    fits = "AND (d.plan_id IS NULL OR d.plan_id = :p) AND (d.length_id IS NULL OR d.length_id = :l)"
    params = {"p": choice.plan_id, "l": choice.length_id, "s": student_id}
    discount = None
    if choice.code and choice.code.strip():
        rows = await fetch_all(
            conn, DISCOUNT_SQL + f" AND d.code = :code {fits}",
            code=choice.code.strip().upper(), **params,
        )
        discount = next((row for row in rows if _usable(row, student_id, used)), None)
        if discount is None:
            raise HTTPException(status_code=422, detail=BAD_CODE)
    else:
        rows = await fetch_all(
            conn,
            DISCOUNT_SQL + f" AND d.student_id = :s {fits} ORDER BY d.percent_off DESC",
            **params,
        )
        discount = next((row for row in rows if _usable(row, student_id, used)), None)
    price = int(offer["price_kobo"])
    percent = int(discount["percent_off"]) if discount else 0
    amount = 0 if percent == 100 else max(LEAST_CHARGE, price * (100 - percent) // 100)
    label = None
    if discount:
        label = f"{percent}% off" + (f" with {discount['code']}" if discount["code"] else "")
    return (
        Quote(
            plan_name=offer["name"],
            length_label=offer["label"],
            days=offer["days"],
            list_price_kobo=price,
            amount_kobo=amount,
            percent_off=percent,
            discount_label=label,
        ),
        discount,
    )


# ------------------------------------------------------------------ standing


async def _standing(conn: AsyncConnection, student_id: UUID) -> Standing:
    current = await premium.standing(conn, student_id)
    email: str | None = (
        await conn.execute(text("SELECT email FROM students WHERE id = :s"), {"s": student_id})
    ).scalar_one_or_none()
    receipts = await fetch_all(
        conn,
        """
        SELECT reference, plan_name, length_label, days, list_price_kobo, amount_kobo,
               discount_label, status, channel, paid_at, created_at
        FROM payments
        WHERE student_id = :s AND (status = 'paid' OR created_at > now() - interval '1 day')
        ORDER BY created_at DESC LIMIT 50
        """,
        s=student_id,
    )
    allowance = current.allowance
    return Standing(
        premium=current.premium,
        plan_id=current.plan_id,
        plan_name=current.plan_name,
        plan_until=current.plan_until,
        limits_on=current.limits_on,
        allowance=Allowance(
            practice_per_day=allowance.practice_per_day,
            mocks=allowance.mocks,
            mocks_per=allowance.mocks_per,
            voice=allowance.voice,
            coach_per_day=allowance.coach_per_day,
            custom_runs=allowance.custom_runs,
            bookmark_runs=allowance.bookmark_runs,
        ),
        practice_used_today=await premium.practice_used_today(conn, student_id),
        mocks_used=await premium.mocks_used(conn, student_id, allowance.mocks_per),
        email=email,
        offers=await offers_for(conn, student_id),
        receipts=[Receipt(**row) for row in receipts],
    )


@router.get(
    "/v1/student/{student_id}/billing", response_model=Standing, summary="Plan and allowance"
)
async def standing(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Standing:
    await require_student(request, conn, student_id)
    return await _standing(conn, student_id)


@router.post(
    "/v1/student/{student_id}/billing/quote", response_model=Quote, summary="The price to pay"
)
async def quote(
    request: Request,
    student_id: UUID,
    body: Choice,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Quote:
    await require_student(request, conn, student_id)
    found, _ = await quote_for(conn, student_id, body)
    return found


# ------------------------------------------------------------------ paying


def _return_url(request: Request) -> str:
    base = get_settings().public_url or request.headers.get("origin") or str(request.base_url)
    return base.rstrip("/") + "/plans/paid"


async def add_plan_time(
    conn: AsyncConnection,
    student_id: UUID,
    plan_id: UUID,
    days: int,
    *,
    payment_id: UUID | None = None,
    granted_by: UUID | None = None,
    note: str | None = None,
) -> None:
    """Days on a plan, following on from any time the student has on that plan already.

    The caller commits.
    """
    await conn.execute(
        text(
            """
            INSERT INTO premium_periods (student_id, plan_id, starts_at, ends_at, payment_id,
              granted_by, note)
            SELECT :s, :p, start, start + make_interval(days => :days), :payment, :by, :note
            FROM (SELECT greatest(now(), coalesce(max(ends_at), now())) AS start
                  FROM premium_periods WHERE student_id = :s AND plan_id = :p) latest
            """
        ),
        {
            "s": student_id,
            "p": plan_id,
            "days": days,
            "payment": payment_id,
            "by": granted_by,
            "note": note,
        },
    )
    plan = (
        (
            await conn.execute(
                text(
                    "SELECT pl.name, max(p.ends_at) AS ends_at FROM premium_plans pl"
                    " JOIN premium_periods p ON p.plan_id = pl.id AND p.student_id = :s"
                    " WHERE pl.id = :p GROUP BY pl.name"
                ),
                {"s": student_id, "p": plan_id},
            )
        )
        .mappings()
        .first()
    )
    if plan is not None:
        await notifications.notify(
            conn,
            student_id,
            kind="plan_started",
            category="system",
            title=f"Your {plan['name']} plan is active",
            body=f"It runs until {plan['ends_at']:%A %d %B %Y}. Everything in it is open to you.",
            link_url="/plans",
            key=f"plan-start-{payment_id or plan['ends_at'].isoformat()}",
        )


@router.post(
    "/v1/student/{student_id}/billing/checkout",
    response_model=CheckoutStarted,
    summary="Start paying for a plan",
)
async def checkout(
    request: Request,
    student_id: UUID,
    body: Checkout,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> CheckoutStarted:
    await require_student(request, conn, student_id)
    price, discount = await quote_for(conn, student_id, body)
    free = price.amount_kobo == 0
    if not free and not paystack.configured():
        raise HTTPException(status_code=503, detail=CLOSED)
    account_email: str | None = (
        await conn.execute(text("SELECT email FROM students WHERE id = :s"), {"s": student_id})
    ).scalar_one_or_none()
    email = (account_email or (body.email or "")).strip().lower() or None
    if not free and (email is None or not _EMAIL.match(email)):
        raise HTTPException(status_code=422, detail="Enter an email address for your receipt.")
    reference = f"sp_{uuid4().hex}"
    payment_id = (
        await conn.execute(
            text(
                """
                INSERT INTO payments (student_id, plan_id, plan_name, length_label, days,
                  list_price_kobo, amount_kobo, discount_id, discount_label, reference, email,
                  status, channel, paid_at)
                VALUES (:s, :p, :name, :label, :days, :list, :amount, :discount, :dlabel,
                  :ref, :email, :status, :channel, :paid_at)
                RETURNING id
                """
            ),
            {
                "s": student_id,
                "p": body.plan_id,
                "name": price.plan_name,
                "label": price.length_label,
                "days": price.days,
                "list": price.list_price_kobo,
                "amount": price.amount_kobo,
                "discount": discount["id"] if discount else None,
                "dlabel": price.discount_label,
                "ref": reference,
                "email": email,
                "status": "paid" if free else "pending",
                "channel": "free" if free else None,
                "paid_at": datetime.now().astimezone() if free else None,
            },
        )
    ).scalar_one()
    if free:
        # 100% off: nothing to pay, so the plan is theirs now.
        await add_plan_time(conn, student_id, body.plan_id, price.days, payment_id=payment_id)
        await conn.commit()
        return CheckoutStarted(authorization_url=None, reference=reference, granted=True)
    await conn.commit()
    assert email is not None
    try:
        url = await paystack.initialize(
            email=email,
            amount_kobo=price.amount_kobo,
            reference=reference,
            callback_url=_return_url(request),
            metadata={
                "student_id": str(student_id),
                "plan": price.plan_name,
                "length": price.length_label,
            },
        )
    except paystack.PaystackUnavailable as error:
        await conn.execute(
            text("UPDATE payments SET status = 'failed' WHERE reference = :r"), {"r": reference}
        )
        await conn.commit()
        raise HTTPException(
            status_code=502,
            detail="We couldn't reach the payment page. Please try again in a moment.",
        ) from error
    return CheckoutStarted(authorization_url=url, reference=reference)


async def settle(conn: AsyncConnection, reference: str) -> dict[str, Any] | None:
    """Ask Paystack how this payment went and record it; the payment row, or None if unknown.

    Safe to call any number of times, from the return page and the webhook at once: only the
    call that moves the payment to paid adds the days.
    """
    row = (
        (
            await conn.execute(
                text("SELECT * FROM payments WHERE reference = :r"), {"r": reference}
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    payment: dict[str, Any] = {str(key): value for key, value in row.items()}
    if payment["status"] == "paid":
        return payment
    verified = await paystack.verify(reference)
    if verified.status != "success":
        status = verified.status if verified.status in ("failed", "abandoned") else "pending"
        await conn.execute(
            text("UPDATE payments SET status = :st WHERE reference = :r AND status <> 'paid'"),
            {"st": status, "r": reference},
        )
        await conn.commit()
        return {**payment, "status": status}
    if verified.amount_kobo < payment["amount_kobo"] or verified.currency != payment["currency"]:
        _log.error(
            "payment %s: paid %s %s, expected %s %s", reference, verified.amount_kobo,
            verified.currency, payment["amount_kobo"], payment["currency"],
        )
        await conn.execute(
            text("UPDATE payments SET status = 'failed' WHERE reference = :r AND status <> 'paid'"),
            {"r": reference},
        )
        await conn.commit()
        return {**payment, "status": "failed"}
    moved = (
        await conn.execute(
            text(
                """
                UPDATE payments SET status = 'paid', paid_at = now(), channel = :channel
                WHERE reference = :r AND status <> 'paid'
                RETURNING id
                """
            ),
            {"r": reference, "channel": verified.channel},
        )
    ).first()
    if moved is not None:
        await add_plan_time(
            conn, payment["student_id"], payment["plan_id"], payment["days"], payment_id=moved[0]
        )
    await conn.commit()
    return {**payment, "status": "paid"}


@router.post(
    "/v1/student/{student_id}/billing/confirm",
    response_model=Confirmed,
    summary="Check a payment on the way back from Paystack",
)
async def confirm(
    request: Request,
    student_id: UUID,
    body: Confirm,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Confirmed:
    await require_student(request, conn, student_id)
    owner: UUID | None = (
        await conn.execute(
            text("SELECT student_id FROM payments WHERE reference = :r"), {"r": body.reference}
        )
    ).scalar_one_or_none()
    if owner != student_id:
        raise HTTPException(status_code=404, detail="We couldn't find that payment.")
    try:
        payment = await settle(conn, body.reference)
    except paystack.PaystackUnavailable as error:
        raise HTTPException(
            status_code=502,
            detail="We couldn't check your payment just now. Refresh this page in a moment.",
        ) from error
    assert payment is not None
    return Confirmed(
        status=payment["status"],
        plan_name=payment["plan_name"],
        standing=await _standing(conn, student_id),
    )


@router.post("/v1/billing/webhook", status_code=200, summary="Paystack's word on a payment")
async def webhook(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Response:
    """Paystack calls this; the body must carry its signature. Only `charge.success` matters,
    and even then the payment is verified with Paystack before anything is granted."""
    body = await request.body()
    if not paystack.signed(body, request.headers.get("x-paystack-signature")):
        raise HTTPException(status_code=401, detail="Bad signature.")
    try:
        event = json.loads(body)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Not JSON.") from error
    if event.get("event") == "charge.success":
        reference = str((event.get("data") or {}).get("reference") or "")
        if reference:
            try:
                await settle(conn, reference)
            except paystack.PaystackUnavailable as error:
                # Paystack retries a webhook that fails, so let it.
                raise HTTPException(status_code=502, detail="Try again.") from error
    return Response(status_code=200)
