"""The admin dashboard's Premium page: the free allowance, the plans, payments, and gifts.

Everything here needs a signed-in admin. Prices are in kobo, as Paystack takes them. A plan
is never deleted, only taken off sale, so every receipt keeps pointing at what was bought.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import premium
from app.auth import Staff, admin_session
from app.db import connection, fetch_all

router = APIRouter(
    prefix="/v1/admin/billing", tags=["admin"], dependencies=[Depends(admin_session)]
)


class FreeLimits(BaseModel):
    limits_on: bool
    free_practice_per_day: int = Field(ge=0, le=1000)
    free_mocks: int = Field(ge=0, le=100)


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    blurb: str | None = Field(default=None, max_length=200)
    price_kobo: int = Field(ge=10000, le=100_000_000)
    days: int = Field(ge=1, le=730)
    on_sale: bool = True
    display_order: int = 0


class AdminPlan(PlanIn):
    id: UUID
    created_at: datetime
    sold: int


class Payment(BaseModel):
    reference: str
    student_id: UUID
    display_name: str
    login: str | None
    plan_name: str
    days: int
    amount_kobo: int
    status: Literal["pending", "paid", "failed", "abandoned"]
    channel: str | None
    paid_at: datetime | None
    created_at: datetime


class Billing(BaseModel):
    limits: FreeLimits
    plans: list[AdminPlan]
    #: Students with Premium right now.
    premium_now: int
    paid_kobo_30_days: int
    paid_kobo_all_time: int


class Gift(BaseModel):
    days: int = Field(ge=1, le=730)
    note: str | None = Field(default=None, max_length=200)


class GiftResult(BaseModel):
    premium_until: datetime | None


PLAN_SQL = """
    SELECT p.id, p.name, p.blurb, p.price_kobo, p.days, p.on_sale, p.display_order,
           p.created_at,
           (SELECT count(*) FROM payments pay WHERE pay.plan_id = p.id
              AND pay.status = 'paid') AS sold
    FROM premium_plans p
"""


@router.get("", response_model=Billing, summary="Free limits, plans and takings")
async def billing(conn: Annotated[AsyncConnection, Depends(connection)]) -> Billing:
    current = await premium.limits(conn)
    plans = await fetch_all(
        conn, PLAN_SQL + " ORDER BY p.on_sale DESC, p.display_order, p.price_kobo"
    )
    totals = (
        (
            await conn.execute(
                text(
                    """
                    SELECT
                      (SELECT count(DISTINCT student_id) FROM premium_periods
                        WHERE starts_at <= now() AND ends_at > now()) AS premium_now,
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
        limits=FreeLimits(
            limits_on=current.on,
            free_practice_per_day=current.practice_per_day,
            free_mocks=current.mocks,
        ),
        plans=[AdminPlan(**row) for row in plans],
        premium_now=int(totals["premium_now"]),
        paid_kobo_30_days=int(totals["last_30"]),
        paid_kobo_all_time=int(totals["all_time"]),
    )


@router.put("/limits", response_model=FreeLimits, summary="Set the free allowance")
async def set_limits(
    body: FreeLimits,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(admin_session)],
) -> FreeLimits:
    await conn.execute(
        text(
            """
            UPDATE billing_settings
            SET limits_on = :on, free_practice_per_day = :practice, free_mocks = :mocks,
                updated_at = now(), updated_by = :by
            """
        ),
        {
            "on": body.limits_on,
            "practice": body.free_practice_per_day,
            "mocks": body.free_mocks,
            "by": staff.student_id,
        },
    )
    await conn.commit()
    return body


@router.post("/plans", response_model=AdminPlan, status_code=201, summary="Add a plan")
async def add_plan(
    body: PlanIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminPlan:
    plan_id = (
        await conn.execute(
            text(
                """
                INSERT INTO premium_plans (name, blurb, price_kobo, days, on_sale, display_order)
                VALUES (:name, :blurb, :price_kobo, :days, :on_sale, :display_order)
                RETURNING id
                """
            ),
            body.model_dump(),
        )
    ).scalar_one()
    await conn.commit()
    rows = await fetch_all(conn, PLAN_SQL + " WHERE p.id = :id", id=plan_id)
    return AdminPlan(**rows[0])


@router.put("/plans/{plan_id}", response_model=AdminPlan, summary="Change a plan")
async def change_plan(
    plan_id: UUID, body: PlanIn, conn: Annotated[AsyncConnection, Depends(connection)]
) -> AdminPlan:
    result = await conn.execute(
        text(
            """
            UPDATE premium_plans
            SET name = :name, blurb = :blurb, price_kobo = :price_kobo, days = :days,
                on_sale = :on_sale, display_order = :display_order
            WHERE id = :id
            """
        ),
        {**body.model_dump(), "id": plan_id},
    )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="We couldn't find that plan.")
    rows = await fetch_all(conn, PLAN_SQL + " WHERE p.id = :id", id=plan_id)
    return AdminPlan(**rows[0])


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
               p.plan_name, p.days, p.amount_kobo, p.status, p.channel, p.paid_at, p.created_at
        FROM payments p JOIN students s ON s.id = p.student_id
        {"WHERE p.status = 'paid'" if status == "paid" else ""}
        ORDER BY coalesce(p.paid_at, p.created_at) DESC
        LIMIT :limit
        """,
        limit=limit,
    )
    return [Payment(**row) for row in rows]


@router.post(
    "/students/{student_id}/gift", response_model=GiftResult, summary="Give a student Premium"
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
    await conn.execute(
        text(
            """
            INSERT INTO premium_periods (student_id, starts_at, ends_at, granted_by, note)
            SELECT :s, start, start + make_interval(days => :days), :by, :note
            FROM (SELECT greatest(now(), coalesce(max(ends_at), now())) AS start
                  FROM premium_periods WHERE student_id = :s) latest
            """
        ),
        {"s": student_id, "days": body.days, "by": staff.student_id, "note": body.note},
    )
    await conn.commit()
    return GiftResult(premium_until=await premium.premium_until(conn, student_id))
