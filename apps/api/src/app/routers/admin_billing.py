"""The admin dashboard's Pricing & plans: the limits switch, every plan and what it gives, the
lengths plans are sold for and their prices, discounts, takings, payments, and gifts.

Everything here needs a signed-in admin. Prices are in kobo, as Paystack takes them. Nothing is
deleted, only taken off sale or switched off, so every receipt keeps what was bought. The Free
plan is edited like any other, but has no prices and cannot be taken off sale.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import premium
from app.auth import Staff, admin_session
from app.db import connection, fetch_all
from app.routers.billing import MocksPer, Plan, add_plan_time, plan_rows

router = APIRouter(
    prefix="/v1/admin/billing", tags=["admin"], dependencies=[Depends(admin_session)]
)


class LimitsSwitch(BaseModel):
    limits_on: bool


class LengthIn(BaseModel):
    label: str = Field(min_length=1, max_length=30)
    days: int = Field(ge=1, le=730)
    on_sale: bool = True
    display_order: int = 0


class AdminLength(LengthIn):
    id: UUID


class PriceIn(BaseModel):
    length_id: UUID
    #: Null takes the plan off sale for that length.
    price_kobo: int | None = Field(default=None, ge=10000, le=100_000_000)


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    blurb: str | None = Field(default=None, max_length=200)
    #: Null is unlimited.
    practice_per_day: int | None = Field(default=None, ge=0, le=10000)
    mocks_allowed: int | None = Field(default=None, ge=0, le=1000)
    mocks_per: MocksPer = "week"
    voice: bool = True
    coach_per_day: int = Field(default=20, ge=0, le=1000)
    custom_runs: bool = True
    bookmark_runs: bool = True
    extras: list[str] = Field(default_factory=list, max_length=12)
    featured: bool = False
    on_sale: bool = True
    display_order: int = 0
    prices: list[PriceIn] = Field(default_factory=list)

    @field_validator("extras")
    @classmethod
    def _tidy(cls, value: list[str]) -> list[str]:
        lines = [" ".join(line.split()) for line in value]
        if any(len(line) > 80 for line in lines):
            raise ValueError("each selling point is at most 80 characters")
        return [line for line in lines if line]


class AdminPlan(Plan):
    on_sale: bool
    display_order: int
    sold: int
    #: Students with this plan running now.
    active: int


class DiscountIn(BaseModel):
    #: A promo code; leave empty for an offer to one student.
    code: str | None = Field(default=None, max_length=30)
    student_id: UUID | None = None
    plan_id: UUID | None = None
    length_id: UUID | None = None
    percent_off: int = Field(ge=1, le=100)
    max_uses: int | None = Field(default=None, ge=1, le=100000)
    expires_at: datetime | None = None
    note: str | None = Field(default=None, max_length=200)


class Discount(BaseModel):
    id: UUID
    code: str | None
    student_id: UUID | None
    student_name: str | None
    plan_id: UUID | None
    plan_name: str | None
    length_id: UUID | None
    length_label: str | None
    percent_off: int
    max_uses: int | None
    used: int
    expires_at: datetime | None
    active: bool
    note: str | None
    created_at: datetime


class Payment(BaseModel):
    reference: str
    student_id: UUID
    display_name: str
    login: str | None
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


class Billing(BaseModel):
    limits_on: bool
    lengths: list[AdminLength]
    plans: list[AdminPlan]
    #: Students with a paid plan running now.
    premium_now: int
    paid_kobo_30_days: int
    paid_kobo_all_time: int


class Gift(BaseModel):
    plan_id: UUID
    days: int = Field(ge=1, le=730)
    note: str | None = Field(default=None, max_length=200)


class GiftResult(BaseModel):
    plan_name: str
    plan_until: datetime | None


async def _plans(conn: AsyncConnection) -> list[AdminPlan]:
    counts = await fetch_all(
        conn,
        """
        SELECT p.id,
               (SELECT count(*) FROM payments pay WHERE pay.plan_id = p.id
                  AND pay.status = 'paid') AS sold,
               (SELECT count(DISTINCT pp.student_id) FROM premium_periods pp
                 WHERE pp.plan_id = p.id AND pp.starts_at <= now() AND pp.ends_at > now())
                 AS active
        FROM premium_plans p
        """,
    )
    by_id = {row["id"]: row for row in counts}
    return [
        AdminPlan(
            **plan.model_dump(),
            on_sale=row["on_sale"],
            display_order=row["display_order"],
            sold=int(by_id[plan.id]["sold"]),
            active=int(by_id[plan.id]["active"]),
        )
        for row, plan in await plan_rows(conn, on_sale_only=False)
    ]


@router.get("", response_model=Billing, summary="Plans, lengths and takings")
async def billing(conn: Annotated[AsyncConnection, Depends(connection)]) -> Billing:
    lengths = await fetch_all(
        conn,
        "SELECT id, label, days, on_sale, display_order FROM plan_lengths"
        " ORDER BY display_order, days",
    )
    totals = (
        (
            await conn.execute(
                text(
                    """
                    SELECT
                      (SELECT count(DISTINCT pp.student_id) FROM premium_periods pp
                        JOIN premium_plans p ON p.id = pp.plan_id AND p.kind = 'paid'
                        WHERE pp.starts_at <= now() AND pp.ends_at > now()) AS premium_now,
                      coalesce((SELECT sum(amount_kobo) FROM payments WHERE status = 'paid'
                        AND paid_at > now() - interval '30 days'), 0) AS last_30,
                      coalesce((SELECT sum(amount_kobo) FROM payments
                        WHERE status = 'paid'), 0) AS all_time
                    """
                )
            )
        )
        .mappings()
        .one()
    )
    return Billing(
        limits_on=await premium.limits_on(conn),
        lengths=[AdminLength(**row) for row in lengths],
        plans=await _plans(conn),
        premium_now=int(totals["premium_now"]),
        paid_kobo_30_days=int(totals["last_30"]),
        paid_kobo_all_time=int(totals["all_time"]),
    )


@router.put("/limits", response_model=LimitsSwitch, summary="Turn the plan limits on or off")
async def set_limits(
    body: LimitsSwitch,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> LimitsSwitch:
    await conn.execute(
        text(
            "UPDATE billing_settings SET limits_on = :on, updated_at = now(), updated_by = :by"
        ),
        {"on": body.limits_on, "by": staff.student_id},
    )
    await conn.commit()
    return body


@router.post("/lengths", response_model=AdminLength, status_code=201, summary="Add a length")
async def add_length(
    body: LengthIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminLength:
    length_id = (
        await conn.execute(
            text(
                """
                INSERT INTO plan_lengths (label, days, on_sale, display_order)
                VALUES (:label, :days, :on_sale, :display_order) RETURNING id
                """
            ),
            body.model_dump(),
        )
    ).scalar_one()
    await conn.commit()
    return AdminLength(id=length_id, **body.model_dump())


@router.put("/lengths/{length_id}", response_model=AdminLength, summary="Change a length")
async def change_length(
    length_id: UUID, body: LengthIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminLength:
    result = await conn.execute(
        text(
            """
            UPDATE plan_lengths SET label = :label, days = :days, on_sale = :on_sale,
              display_order = :display_order
            WHERE id = :id
            """
        ),
        {**body.model_dump(), "id": length_id},
    )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="We couldn't find that length.")
    return AdminLength(id=length_id, **body.model_dump())


_PLAN_FIELDS = (
    "name", "blurb", "practice_per_day", "mocks_allowed", "mocks_per", "voice", "coach_per_day",
    "custom_runs", "bookmark_runs", "extras", "featured", "on_sale", "display_order",
)


async def _save_prices(conn: AsyncConnection, plan_id: UUID, body: PlanIn) -> AdminPlan:
    kind: str = (
        await conn.execute(text("SELECT kind FROM premium_plans WHERE id = :p"), {"p": plan_id})
    ).scalar_one()
    for price in body.prices if kind == "paid" else []:
        if price.price_kobo is None:
            await conn.execute(
                text("DELETE FROM plan_prices WHERE plan_id = :p AND length_id = :l"),
                {"p": plan_id, "l": price.length_id},
            )
        else:
            await conn.execute(
                text(
                    """
                    INSERT INTO plan_prices (plan_id, length_id, price_kobo)
                    VALUES (:p, :l, :price)
                    ON CONFLICT (plan_id, length_id) DO UPDATE SET price_kobo = EXCLUDED.price_kobo
                    """
                ),
                {"p": plan_id, "l": price.length_id, "price": price.price_kobo},
            )
    if body.featured:
        # One plan is shown as the one most students choose.
        await conn.execute(
            text("UPDATE premium_plans SET featured = false WHERE id <> :p"), {"p": plan_id}
        )
    await conn.commit()
    return next(plan for plan in await _plans(conn) if plan.id == plan_id)


@router.post("/plans", response_model=AdminPlan, status_code=201, summary="Add a plan")
async def add_plan(
    body: PlanIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminPlan:
    plan_id = (
        await conn.execute(
            text(
                f"""
                INSERT INTO premium_plans ({", ".join(_PLAN_FIELDS)})
                VALUES ({", ".join(f":{field}" for field in _PLAN_FIELDS)})
                RETURNING id
                """
            ),
            body.model_dump(include=set(_PLAN_FIELDS)),
        )
    ).scalar_one()
    return await _save_prices(conn, plan_id, body)


@router.put("/plans/{plan_id}", response_model=AdminPlan, summary="Change a plan")
async def change_plan(
    plan_id: UUID, body: PlanIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminPlan:
    kind: str | None = (
        await conn.execute(text("SELECT kind FROM premium_plans WHERE id = :p"), {"p": plan_id})
    ).scalar_one_or_none()
    if kind is None:
        raise HTTPException(status_code=404, detail="We couldn't find that plan.")
    values = body.model_dump(include=set(_PLAN_FIELDS))
    if kind == "free":
        # Free is always there for everyone, and is never the featured plan.
        values.update(on_sale=True, featured=False, display_order=0)
    await conn.execute(
        text(
            f"""
            UPDATE premium_plans
            SET {", ".join(f"{field} = :{field}" for field in _PLAN_FIELDS)}
            WHERE id = :id
            """
        ),
        {**values, "id": plan_id},
    )
    if kind == "free":
        body = body.model_copy(update={"featured": False, "prices": []})
    return await _save_prices(conn, plan_id, body)


# ------------------------------------------------------------------ discounts

DISCOUNT_SQL = """
    SELECT d.id, d.code, d.student_id, s.display_name AS student_name, d.plan_id,
           p.name AS plan_name, d.length_id, l.label AS length_label, d.percent_off,
           d.max_uses, d.expires_at, d.active, d.note, d.created_at,
           (SELECT count(*) FROM payments pay WHERE pay.discount_id = d.id
              AND pay.status = 'paid') AS used
    FROM discounts d
    LEFT JOIN students s ON s.id = d.student_id
    LEFT JOIN premium_plans p ON p.id = d.plan_id
    LEFT JOIN plan_lengths l ON l.id = d.length_id
"""


@router.get("/discounts", response_model=list[Discount], summary="Codes and offers")
async def discounts(
    conn: Annotated[AsyncConnection, Depends(connection)],
    student_id: UUID | None = None,
) -> list[Discount]:
    rows = await fetch_all(
        conn,
        DISCOUNT_SQL
        + (" WHERE d.student_id = :s" if student_id else "")
        + " ORDER BY d.active DESC, d.created_at DESC LIMIT 500",
        **({"s": student_id} if student_id else {}),
    )
    return [Discount(**row) for row in rows]


@router.post("/discounts", response_model=Discount, status_code=201, summary="Add a discount")
async def add_discount(
    body: DiscountIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> Discount:
    code = "".join(body.code.split()).upper() if body.code else None
    if code is None and body.student_id is None:
        raise HTTPException(
            status_code=422, detail="Give the discount a code, or choose the student it's for."
        )
    if code is not None:
        clash = (
            await conn.execute(text("SELECT 1 FROM discounts WHERE code = :c"), {"c": code})
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="That code is already in use.")
        if not 3 <= len(code) <= 30 or not all(ch.isalnum() or ch == "-" for ch in code):
            raise HTTPException(
                status_code=422, detail="A code is 3 to 30 letters, numbers or dashes."
            )
    discount_id = (
        await conn.execute(
            text(
                """
                INSERT INTO discounts (code, student_id, plan_id, length_id, percent_off,
                  max_uses, expires_at, note, created_by)
                VALUES (:code, :student, :plan, :length, :percent, :max_uses, :expires,
                  :note, :by)
                RETURNING id
                """
            ),
            {
                "code": code,
                "student": body.student_id,
                "plan": body.plan_id,
                "length": body.length_id,
                "percent": body.percent_off,
                "max_uses": body.max_uses,
                "expires": body.expires_at,
                "note": body.note,
                "by": staff.student_id,
            },
        )
    ).scalar_one()
    await conn.commit()
    rows = await fetch_all(conn, DISCOUNT_SQL + " WHERE d.id = :id", id=discount_id)
    return Discount(**rows[0])


class DiscountSwitch(BaseModel):
    active: bool


@router.put("/discounts/{discount_id}", response_model=Discount, summary="Switch a discount")
async def switch_discount(
    discount_id: UUID,
    body: DiscountSwitch,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Discount:
    result = await conn.execute(
        text("UPDATE discounts SET active = :a WHERE id = :id"),
        {"a": body.active, "id": discount_id},
    )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="We couldn't find that discount.")
    rows = await fetch_all(conn, DISCOUNT_SQL + " WHERE d.id = :id", id=discount_id)
    return Discount(**rows[0])


# ------------------------------------------------------------------ payments and gifts


@router.get("/payments", response_model=list[Payment], summary="Payments, newest first")
async def payments(
    conn: Annotated[AsyncConnection, Depends(connection)],
    status: Literal["paid", "all"] = "paid",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[Payment]:
    rows = await fetch_all(
        conn,
        f"""
        SELECT p.reference, p.student_id, s.display_name, coalesce(s.email, s.phone) AS login,
               p.plan_name, p.length_label, p.days, p.list_price_kobo, p.amount_kobo,
               p.discount_label, p.status, p.channel, p.paid_at, p.created_at
        FROM payments p JOIN students s ON s.id = p.student_id
        {"WHERE p.status = 'paid'" if status == "paid" else ""}
        ORDER BY coalesce(p.paid_at, p.created_at) DESC
        LIMIT :limit
        """,
        limit=limit,
    )
    return [Payment(**row) for row in rows]


@router.post(
    "/students/{student_id}/gift", response_model=GiftResult, summary="Give a student a plan"
)
async def gift(
    student_id: UUID,
    body: Gift,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> GiftResult:
    known = (
        await conn.execute(text("SELECT 1 FROM students WHERE id = :s"), {"s": student_id})
    ).first()
    if known is None:
        raise HTTPException(status_code=404, detail="We couldn't find that student.")
    name: str | None = (
        await conn.execute(
            text("SELECT name FROM premium_plans WHERE id = :p AND kind = 'paid'"),
            {"p": body.plan_id},
        )
    ).scalar_one_or_none()
    if name is None:
        raise HTTPException(status_code=404, detail="We couldn't find that plan.")
    await add_plan_time(
        conn, student_id, body.plan_id, body.days, granted_by=staff.student_id, note=body.note
    )
    await conn.commit()
    return GiftResult(
        plan_name=name, plan_until=await premium.plan_until(conn, student_id, body.plan_id)
    )
