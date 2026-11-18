"""Every email with sample data, for the review page at /dev/emails (local and test only).

GET /v1/dev/emails renders these with the real templates; nothing is sent.
"""

from __future__ import annotations

from typing import Any

from app.emails.layout import Email


def note(
    kind: str,
    category: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "display_name": "Chiamaka Okafor",
        "kind": kind,
        "category": category,
        "title": title,
        "body": body,
        "link_url": link,
        "data": data,
    }


SAMPLES: list[tuple[str, str, list[dict[str, Any]]]] = [
    (
        "Welcome",
        "The moment they sign up.",
        [
            note(
                "welcome",
                "system",
                "Welcome to Stack Prep, Chiamaka",
                "Start with your roadmap.",
                "/roadmap",
            )
        ],
    ),
    (
        "Weekly report",
        "Sunday evening, 6 pm their time, to everyone who studied in the last 30 days.",
        [
            note(
                "weekly_report",
                "report",
                "Your week: 86 questions at 72%",
                "4 days, 1 h 35 min, 86 questions at 72%.",
                "/progress",
                {
                    "days": 4,
                    "time": "1 h 35 min",
                    "answered": 86,
                    "accuracy": 72,
                    "change": "Up from 64%",
                    "most": ["Cell structure", "Indices"],
                    "focus": "Electrolysis",
                },
            )
        ],
    ),
    (
        "Weekly report, a quiet week",
        "When they did not practise that week.",
        [
            note(
                "weekly_report",
                "report",
                "Your week: a quiet one",
                "No practice this week. One short session tomorrow gets you going again; "
                "your roadmap has kept your place.",
                "/progress",
                {"answered": 0},
            )
        ],
    ),
    (
        "Today's reminders together",
        "When more than one reminder is due at once. One reminder email a day at most.",
        [
            note(
                "roadmap_checkup",
                "plan",
                "A Biology check-up is on today's plan",
                "It takes about ten minutes and updates your roadmap.",
                "/roadmap",
            ),
            note(
                "exam_countdown",
                "plan",
                "7 days to your exam",
                "One week left. Revise your weakest topics rather than new ones.",
                "/roadmap",
            ),
            note(
                "streak_risk",
                "nudge",
                "Your 6-day streak ends at midnight",
                "One short practice keeps it going.",
                "/home",
            ),
        ],
    ),
    (
        "Streak at risk",
        "7 pm their time, after a streak of 2 days or more, if they have not studied today.",
        [
            note(
                "streak_risk",
                "nudge",
                "Your 6-day streak ends at midnight",
                "One short practice keeps it going.",
                "/home",
            )
        ],
    ),
    (
        "Missed a day",
        "The next day, at the hour they usually study.",
        [
            note(
                "missed_day",
                "nudge",
                "We missed you yesterday, Chiamaka",
                "Today's plan is ready. Ten minutes is enough to get back on track.",
                "/home",
            )
        ],
    ),
    (
        "Away for a week",
        "Days 3, 7 and 14 away, gentler each time, then nothing.",
        [
            note(
                "away",
                "nudge",
                "Your plan is waiting, Chiamaka",
                "A week away. Start small: one topic, ten minutes.",
                "/home",
            )
        ],
    ),
    (
        "Exam countdown",
        "30, 14 and 7 days before, and the day before.",
        [
            note(
                "exam_countdown",
                "plan",
                "Your exam is tomorrow",
                "Rest well tonight. You have prepared for this.",
                "/roadmap",
            )
        ],
    ),
    (
        "Scheduled mock open",
        "When a mock set for their exam opens.",
        [
            note(
                "mock_open",
                "plan",
                "UTME Mock 3 is open",
                "Sit it by Sunday 23 Nov. It is timed and marked like the real exam.",
                "/mock",
            )
        ],
    ),
    (
        "Plan started",
        "Within seconds of paying, or of an admin giving a plan.",
        [
            note(
                "plan_started",
                "system",
                "Your Standard plan is active",
                "It runs until Wednesday 17 December 2026. Everything in it is open to you.",
                "/plans",
            )
        ],
    ),
    (
        "Plan ending",
        "Three days before a paid plan ends.",
        [
            note(
                "plan_ending",
                "system",
                "Your Standard plan ends soon",
                "It ends on Friday 19 Dec. Renew to keep everything open.",
                "/plans",
            )
        ],
    ),
    (
        "Plan ended",
        "The day a paid plan ends.",
        [
            note(
                "plan_ended",
                "system",
                "Your Standard plan has ended",
                "You are on the Free plan now. Your progress is all kept.",
                "/plans",
            )
        ],
    ),
    (
        "Password changed",
        "Within seconds, from Settings.",
        [
            note(
                "password_changed",
                "system",
                "Your password was changed",
                "Your Stack Prep password was changed just now, and other devices were signed out.",
                "/settings",
            )
        ],
    ),
    (
        "Password reset",
        "Within seconds, after a reset with an emailed code.",
        [
            note(
                "password_reset",
                "system",
                "Your password was reset",
                "Your Stack Prep password was reset with a code sent to this email.",
                "/settings",
            )
        ],
    ),
    (
        "Login details changed",
        "Within seconds, when their email or phone for signing in changes.",
        [
            note(
                "login_changed",
                "system",
                "Your login details were changed",
                "The email or phone you sign in with was changed just now.",
                "/settings",
            )
        ],
    ),
    (
        "Account paused",
        "Within seconds of an admin suspending the account. Sent although they cannot sign in.",
        [
            note(
                "account_suspended",
                "system",
                "Your Stack Prep account is paused",
                "You can't sign in for now. If you think this is a mistake, write to us "
                "through the Contact page on our website.",
            )
        ],
    ),
    (
        "Account open again",
        "Within seconds of an admin restoring it.",
        [
            note(
                "account_restored",
                "system",
                "Your account is open again",
                "You can sign in again and carry on where you stopped. "
                "Everything is as you left it.",
                "/home",
            )
        ],
    ),
]


def parent_samples(base: str) -> list[tuple[str, str, Email]]:
    """The emails to parents, with sample data (they are not notifications)."""
    from app.emails import parent_invite, parent_missed_days, parent_weekly_report

    week = {
        "days": 4,
        "time": "1 h 35 min",
        "answered": 86,
        "accuracy": 72,
        "change": "Up from 64%",
        "most": ["Cell structure", "Indices"],
        "focus": "Electrolysis",
    }
    return [
        (
            "Parent: confirm",
            "When a student adds a parent or guardian in Settings.",
            parent_invite.build("Ngozi Okafor", "Chiamaka Okafor", f"{base}/parent/sample", base),
        ),
        (
            "Parent: weekly report",
            "Sunday evening, to every parent who confirmed.",
            parent_weekly_report.build("Ngozi Okafor", "Chiamaka Okafor", week, base),
        ),
        (
            "Parent: missed days",
            "After 3 days without study, and again at 7, to every parent who confirmed.",
            parent_missed_days.build("Ngozi Okafor", "Chiamaka Okafor", 3, base),
        ),
    ]
