"""Streak freezes: earned at every 7 days, used on a missed day (notifications.freezes)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, timedelta
from uuid import UUID

import httpx
import pytest
from sqlalchemy import text
from staff import remove, signed_up

from app.db import database_is_reachable, get_engine
from app.main import app
from app.notifications import freezes

pytestmark = pytest.mark.integration
TODAY = date(2026, 11, 18)


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    if not await database_is_reachable():
        pytest.skip("database unreachable — run `make db-start && make migrate`")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def days_back(*ago: int) -> list[date]:
    return [TODAY - timedelta(days=n) for n in ago]


async def test_a_freeze_is_earned_then_saves_a_missed_day(client: httpx.AsyncClient) -> None:
    student = await signed_up(client, "Freeze Test Student")
    sid = UUID(student.student_id)
    try:
        async with get_engine().connect() as conn:
            # Seven days in a row up to today: one freeze earned, and only once that day.
            await freezes(conn, sid, days_back(0, 1, 2, 3, 4, 5, 6), TODAY)
            await freezes(conn, sid, days_back(0, 1, 2, 3, 4, 5, 6), TODAY)
            await conn.commit()
            held = await conn.scalar(
                text("SELECT count(*) FROM streak_freezes WHERE student_id = :s"), {"s": sid}
            )
            assert held == 1

            # Two days later, having missed yesterday: the freeze covers it.
            later = TODAY + timedelta(days=2)
            studied = days_back(0, 1, 2, 3, 4, 5, 6)
            out = await freezes(conn, sid, studied, later)
            await conn.commit()
            assert later - timedelta(days=1) in out
            used = await conn.scalar(
                text("SELECT used_on FROM streak_freezes WHERE student_id = :s"), {"s": sid}
            )
            assert used == later - timedelta(days=1)
            kinds = [
                row[0]
                for row in (
                    await conn.execute(
                        text("SELECT kind FROM notifications WHERE student_id = :s"), {"s": sid}
                    )
                ).all()
            ]
            assert "streak_freeze_earned" in kinds and "streak_freeze_used" in kinds

            # With none left, a missed day is just missed.
            much_later = later + timedelta(days=3)
            out = await freezes(
                conn,
                sid,
                [*studied, later - timedelta(days=1), later + timedelta(days=1)],
                much_later,
            )
            assert much_later - timedelta(days=1) not in out
    finally:
        await remove([student])
