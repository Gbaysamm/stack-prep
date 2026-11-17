"""The words on an email's button, from where it goes (as the Notifications page says them)."""

from __future__ import annotations


def button_words(path: str | None) -> str:
    path = path or ""
    if path.startswith("/messages"):
        return "Read the reply"
    if path.startswith("/settings"):
        return "Open your settings"
    if path.startswith("/plans"):
        return "See your plan"
    if path.endswith("/report"):
        return "See the report"
    if path.startswith("/progress"):
        return "See your progress"
    if path.startswith("/roadmap"):
        return "Open your roadmap"
    if path.startswith("/mock"):
        return "Go to mock exams"
    return "Open today's plan"
