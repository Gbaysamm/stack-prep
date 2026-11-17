"""Notifications by email: what the emails and the weekly report say (migration 062)."""

from __future__ import annotations

from app.emails import render
from app.emails.words import button_words
from app.notification_email import report_data, report_words


def row(title: str, kind: str = "streak_risk", category: str = "nudge") -> dict[str, object]:
    return {
        "display_name": "Ada Obi",
        "kind": kind,
        "category": category,
        "title": title,
        "body": "One short practice keeps it going.",
        "link_url": "/home",
    }


def test_one_email_holds_every_reminder() -> None:
    rows = [row("Your 6-day streak ends at midnight"), row("Your exam is tomorrow")]
    email = render(rows, "https://app.example")
    subject, body, html = email.subject, email.text, email.html
    assert subject == "Your 6-day streak ends at midnight (and 1 more)"
    assert body.startswith("Hi Ada,")
    assert "Your exam is tomorrow" in body and "https://app.example/home" in body
    assert "Your exam is tomorrow" in html and 'href="https://app.example/home"' in html
    # No way to turn them off (founder, 17 Nov 2026).
    assert "unsubscribe" not in (body + html).lower()


def test_one_notification_has_its_own_button() -> None:
    note = {
        **row("We replied to your message", "support_reply", "system"),
        "link_url": "/messages/1",
    }
    email = render([note], "https://app.example")
    subject, body, html = email.subject, email.text, email.html
    assert subject == "We replied to your message"
    assert "Read the reply" in html and "https://app.example/messages/1" in body
    # Words are escaped, so a title can never break the email.
    assert "&lt;b&gt;" in render([{**note, "title": "<b>"}], "https://x").html
    assert button_words("/checkup/9/report") == "See the report"


def test_the_weekly_report_email_shows_the_figures() -> None:
    week = {
        "answered": 80,
        "correct": 60,
        "days": 4,
        "ms": 4_800_000,
        "answered_before": 50,
        "correct_before": 30,
    }
    topics = [{"topic": "Genetics", "answered": 20, "accuracy": 0.5}]
    data = report_data(week, topics)
    assert data == {
        "days": 4,
        "time": "1 h 20 min",
        "answered": 80,
        "accuracy": 75,
        "change": "Up from 60%",
        "most": ["Genetics"],
        "focus": "Genetics",
    }
    report = {
        **row("Your week: 80 questions at 75%", "weekly_report", "report"),
        "link_url": "/progress",
        "data": data,
    }
    email = render([report], "https://app.example")
    body, html = email.text, email.html
    assert "Accuracy: 75%" in body and "Next week's focus: Genetics" in body
    assert "1 h 20 min" in html and "See your progress" in html


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
