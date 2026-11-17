"""The emails (founder, 17 Nov 2026): one file per email, the shared frame in layout.py.

`render` picks the template for a notification's kind. Reminders due together go in one
email (daily_reminders); anything without a template of its own uses notice.py. To add an
email: a file here with `build(note, base) -> Email`, and its kind in `TEMPLATES`.
"""

from __future__ import annotations

from collections.abc import Callable

from app.emails import (
    account_restored,
    account_suspended,
    daily_reminders,
    login_changed,
    notice,
    password_changed,
    password_reset,
    plan_ended,
    plan_ending,
    plan_started,
    reminder,
    weekly_report,
    welcome,
)
from app.emails.layout import Email, Note

TEMPLATES: dict[str, Callable[[Note, str], Email]] = {
    "welcome": welcome.build,
    "weekly_report": weekly_report.build,
    "password_changed": password_changed.build,
    "password_reset": password_reset.build,
    "login_changed": login_changed.build,
    "plan_started": plan_started.build,
    "plan_ending": plan_ending.build,
    "plan_ended": plan_ended.build,
    "account_suspended": account_suspended.build,
    "account_restored": account_restored.build,
}


def render(notes: list[Note], base: str) -> Email:
    """The email for one notification, or for the day's reminders together."""
    if len(notes) > 1:
        return daily_reminders.build(notes, base)
    note = notes[0]
    if note["kind"] in TEMPLATES:
        return TEMPLATES[note["kind"]](note, base)
    if note["category"] in ("nudge", "plan"):
        return reminder.build(note, base)
    return notice.build(note, base)


__all__ = ["TEMPLATES", "Email", "render"]
