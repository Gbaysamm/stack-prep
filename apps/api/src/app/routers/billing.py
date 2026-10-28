"""Premium for students: the plans on sale, where a student stands, and paying with Paystack.

Paying: `checkout` records a pending payment under a fresh reference and returns Paystack's page.
The student pays there and comes back to `/plans/paid`, which calls `confirm`; Paystack also
calls `webhook`. Either one asks Paystack itself whether the money arrived (`paystack.verify`),
and whichever gets there first marks the payment paid and adds the plan's days after any
Premium the student already has. The other finds it done. Nothing the browser says is trusted.
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

from app import paystack, premium
from app.auth import require_student
from app.config import get_settings
from app.db import connection, fetch_all

_log = logging.getLogger(__name__)
router = APIRouter(tags=["billing"])

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CLOSED = "Payments aren't open yet. Please try again later."
NO_PLAN = "That plan isn't on sale any more."


class Plan(BaseModel):
    id: UUID
    name: str
    blurb: str | None
    price_kobo: int
    days: int


class FreeAllowance(BaseModel):
    #: False until an admin turns the limits on; nothing is held back before then.
    limits_on: bool
    practice_per_day: int
    mocks: int


class Catalogue(BaseModel):
    plans: list[Plan]
    free: FreeAllowance
    #: Paystack is set up, so a plan can be bought.
    checkout_open: bool


class Receipt(BaseModel):
    reference: str
    plan_name: str
    days: int
    amount_kobo: int
    status: Literal["pending", "paid", "failed", "abandoned"]
    channel: str | None
    paid_at: datetime | None
    created_at: datetime


class Standing(BaseModel):
    premium: bool
    premium_until: datetime | None
    free: FreeAllowance
    practice_used_today: int
    mocks_used: int
    #: The email a receipt goes to, when the account has one.
    email: str | None
    receipts: list[Receipt]


class Checkout(BaseModel):
    plan_id: UUID
    #: For an account with no email: Paystack needs one to send the receipt to.
    email: str | None = Field(default=None, max_length=254)


class CheckoutStarted(BaseModel):
    authorization_url: str
    reference: str


class Confirm(BaseModel):
    reference: str = Field(min_length=4, max_length=100)


class Confirmed(BaseModel):
    status: Literal["pending", "paid", "failed", "abandoned"]
    plan_name: str
    standing: Standing


PLANS_SQL = """
    SELECT id, name, blurb, price_kobo, days FROM premium_plans
    WHERE on_sale ORDER BY display_order, price_kobo
"""


def _free(limits: premium.Limits) -> FreeAllowance:
    return FreeAllowance(
        limits_on=limits.on, practice_per_day=limits.practice_per_day, mocks=limits.mocks
    )


@router.get("/v1/billing/plans", response_model=Catalogue, summary="Premium plans on sale")
async def plans(conn: Annotated[AsyncConnection, Depends(connection)]) -> Catalogue:
    rows = await fetch_all(conn, PLANS_SQL)
    return Catalogue(
        plans=[Plan(**row) for row in rows],
        free=_free(await premium.limits(conn)),
        checkout_open=paystack.configured(),
    )


async def _standing(conn: AsyncConnection, student_id: UUID) -> Standing:
    current = await premium.standing(conn, student_id)
    email: str | None = (
        await conn.execute(text("SELECT email FROM students WHERE id = :s"), {"s": student_id})
    ).scalar_one_or_none()
    receipts = await fetch_all(
        conn,
        """
        SELECT reference, plan_name, days, amount_kobo, status, channel, paid_at, created_at
        FROM payments
        WHERE student_id = :s AND (status = 'paid' OR created_at > now() - interval '1 day')
        ORDER BY created_at DESC LIMIT 50
        """,
        s=student_id,
    )
    return Standing(
        premium=current.premium,
        premium_until=current.premium_until,
        free=_free(current.limits),
        practice_used_today=await premium.practice_used_today(conn, student_id),
        mocks_used=await premium.mocks_used(conn, student_id),
        email=email,
        receipts=[Receipt(**row) for row in receipts],
    )


@router.get(
    "/v1/student/{student_id}/billing", response_model=Standing, summary="Premium and allowance"
)
async def standing(
    request: Request, student_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> Standing:
    await require_student(request, conn, student_id)
    return await _standing(conn, student_id)


def _return_url(request: Request) -> str:
    base = get_settings().public_url or request.headers.get("origin") or str(request.base_url)
    return base.rstrip("/") + "/plans/paid"


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
    if not paystack.configured():
        raise HTTPException(status_code=503, detail=CLOSED)
    plan = (
        (
            await conn.execute(
                text(
                    "SELECT id, name, price_kobo, days FROM premium_plans"
                    " WHERE id = :p AND on_sale"
                ),
                {"p": body.plan_id},
            )
        )
        .mappings()
        .first()
    )
    if plan is None:
        raise HTTPException(status_code=404, detail=NO_PLAN)
    account_email: str | None = (
        await conn.execute(text("SELECT email FROM students WHERE id = :s"), {"s": student_id})
    ).scalar_one_or_none()
    email = (account_email or (body.email or "")).strip().lower()
    if not _EMAIL.match(email):
        raise HTTPException(
            status_code=422, detail="Enter an email address for your receipt."
        )
    reference = f"sp_{uuid4().hex}"
    await conn.execute(
        text(
            """
            INSERT INTO payments (student_id, plan_id, plan_name, days, amount_kobo,
              reference, email)
            VALUES (:s, :p, :name, :days, :amount, :ref, :email)
            """
        ),
        {
            "s": student_id,
            "p": plan["id"],
            "name": plan["name"],
            "days": plan["days"],
            "amount": plan["price_kobo"],
            "ref": reference,
            "email": email,
        },
    )
    await conn.commit()
    try:
        url = await paystack.initialize(
            email=email,
            amount_kobo=int(plan["price_kobo"]),
            reference=reference,
            callback_url=_return_url(request),
            metadata={"student_id": str(student_id), "plan": str(plan["name"])},
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

    Paid: the plan's days begin when the student's current Premium ends (or now). Safe to call
    any number of times, from the return page and the webhook at once: only the call that moves
    the payment to paid adds the days.
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
        await conn.execute(
            text(
                """
                INSERT INTO premium_periods (student_id, starts_at, ends_at, payment_id)
                SELECT :s, start, start + make_interval(days => :days), :payment
                FROM (SELECT greatest(now(), coalesce(max(ends_at), now())) AS start
                      FROM premium_periods WHERE student_id = :s) latest
                """
            ),
            {"s": payment["student_id"], "days": payment["days"], "payment": moved[0]},
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
