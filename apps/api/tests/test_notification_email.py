"""Notifications by email: what the emails and the weekly report say (migration 062)."""

from __future__ import annotations

from app.notification_email import email_text, report_words, subject_for


def row(title: str) -> dict[str, object]:
    return {
        "display_name": "Ada Obi",
        "title": title,
        "body": "One short practice keeps it going.",
        "link_url": "/home",
    }


def test_one_email_holds_every_reminder() -> None:
    rows = [row("Your 6-day streak ends at midnight"), row("Your exam is tomorrow")]
    body = email_text(rows, "https://app.example")
    assert body.startswith("Hi Ada,")
    assert "Your exam is tomorrow" in body and "https://app.example/home" in body
    # No way to turn them off (founder, 17 Nov 2026).
    assert "unsubscribe" not in body.lower()
    assert subject_for(rows) == "Your 6-day streak ends at midnight (and 1 more)"
    assert subject_for(rows[:1]) == "Your 6-day streak ends at midnight"


def test_the_weekly_report_words() -> None:
    week = {
        "answered": 80,
        "correct": 60,
        "days": 4,
        "ms": 4_800_000,
        "answered_before": 50,
        "correct_before": 30,
    }
    topics = [
        {"topic": "Cell biology", "answered": 40, "accuracy": 0.9},
        {"topic": "Genetics", "answered": 20, "accuracy": 0.5},
    ]
    title, body = report_words(week, topics)
    assert title == "Your week: 80 questions at 75%"
    assert body.startswith("4 days, 1 h 20 min, 80 questions at 75%.")
    assert "Up from 60% the week before." in body
    assert "Most practised: Cell biology, Genetics." in body
    assert "Next week's focus: Genetics." in body
    quiet = {**week, "answered": 0, "correct": 0}
    assert report_words(quiet, [])[0] == "Your week: a quiet one"
