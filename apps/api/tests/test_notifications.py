"""What the hourly notifications job decides (app/notifications.py)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4

from app.notifications import Facts, decide, usual_hour

TODAY = date(2026, 11, 17)


def facts(*days_ago: int, hours: list[int] | None = None) -> Facts:
    return Facts(
        student_id=uuid4(),
        first_name="Ada",
        timezone="Africa/Lagos",
        days=[TODAY - timedelta(days=n) for n in days_ago],
        hours=hours or [],
    )


def at(hour: int) -> datetime:
    return datetime(TODAY.year, TODAY.month, TODAY.day, hour, 5)


def kinds(f: Facts, hour: int) -> list[str]:
    return [n.kind for n in decide(f, at(hour))]


def test_never_studied_hears_nothing() -> None:
    assert kinds(facts(), 18) == []


def test_streak_at_risk_only_in_the_evening() -> None:
    f = facts(1, 2, 3)
    assert kinds(f, 18) == []
    assert kinds(f, 19) == ["streak_risk"]
    assert "3-day streak" in decide(f, at(19))[0].title


def test_studied_today_gets_no_nudge() -> None:
    assert kinds(facts(0, 1, 2, 3, 5), 20) == []


def test_missed_day_at_their_usual_hour() -> None:
    f = facts(2, 3, hours=[16, 16, 16, 20])
    assert kinds(f, 15) == []
    assert kinds(f, 16) == ["missed_day"]


def test_away_on_days_3_7_14_then_quiet() -> None:
    assert kinds(facts(3), 17) == ["away"]
    assert kinds(facts(7), 17) == ["away"]
    assert kinds(facts(14), 17) == ["away"]
    assert kinds(facts(5), 17) == []
    assert kinds(facts(21), 17) == []


def test_quiet_hours() -> None:
    assert kinds(facts(1, 2, 3), 21) == []
    assert kinds(facts(3), 7) == []


def test_milestone_on_the_day_it_is_reached() -> None:
    f = facts(0, 1, 2, 3, 4, 5, 6)
    notes = decide(f, at(10))
    assert [n.kind for n in notes] == ["streak_milestone"]
    assert notes[0].category == "reward"
    assert kinds(facts(0, 1, 2, 3, 4, 5), 10) == []


def test_the_same_day_gives_the_same_key() -> None:
    f = facts(1, 2)
    assert decide(f, at(19))[0].dedupe_key == decide(f, at(20))[0].dedupe_key


def test_usual_hour_stays_inside_the_day() -> None:
    assert usual_hour([]) == 17
    assert usual_hour([23, 23, 1]) == 20
    assert usual_hour([6, 6]) == 8
