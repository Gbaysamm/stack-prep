"""One reminder: streak at risk, a missed day, time away, the exam countdown, a mock, a check-up.

Each kind says more than its one line (founder, 18 Nov 2026: too short): what to do now, in
steps, and what it is worth or what to expect, so the email gives a reason to act.
"""

from __future__ import annotations

import re

from app.emails.layout import (
    Email,
    Note,
    button,
    callout,
    first_name,
    greeting,
    link,
    page,
    para,
    steps,
    text,
)
from app.emails.words import button_words

Steps = list[tuple[str, str]]


def _streak(note: Note) -> int:
    found = re.search(r"(\d+)-day streak", str(note.get("title", "")))
    return int(found.group(1)) if found else 0


def _days_to_exam(note: Note) -> int:
    title = str(note.get("title", ""))
    if "tomorrow" in title:
        return 1
    found = re.search(r"(\d+) days to your exam", title)
    return int(found.group(1)) if found else 0


def extra(note: Note) -> tuple[str, Steps, tuple[str, str] | None]:
    """For each kind: the line above the steps, the steps, and a note to end on."""
    kind = note["kind"]
    if kind == "streak_risk":
        days = _streak(note)
        return (
            "Ten minutes before midnight is enough:",
            [
                ("Open today's plan", "It is ready: the topic that matters most for you today."),
                ("Answer a few questions", "Any practice, check-up or lesson counts for the day."),
                (f"Day {days + 1} is yours", "Your streak carries on, and so does the habit."),
            ],
            (
                "Why it matters",
                "Students who practise a little every day improve far more than those who cram.",
            ),
        )
    if kind == "missed_day":
        return (
            "Getting back takes one short session:",
            [
                ("Open today's plan", "Your roadmap has moved on with you: nothing to catch up."),
                ("Do one run", "About ten minutes, on the topic it picks."),
                ("Come back tomorrow", "Two days in a row and you have a streak again."),
            ],
            None,
        )
    if kind == "away":
        return (
            "Start small:",
            [
                ("One topic", "Your roadmap shows the one that matters most now."),
                ("Ten minutes", "That is all it takes to get going again."),
            ],
            ("Nothing is lost", "Your scores, runs and plan are exactly where you left them."),
        )
    if kind == "exam_countdown":
        left = _days_to_exam(note)
        if left >= 30:
            plan: Steps = [
                ("Keep to your roadmap", "It covers what is left, in the order that pays most."),
                ("A mock every week", "Timed, like the real paper. It shows what to fix."),
                ("Practise daily", "Short and often beats long and rare."),
            ]
        elif left >= 14:
            plan = [
                ("Sit a full mock now", "Your score out of 400 shows where marks are waiting."),
                ("Fix your weakest topics", "Your mock report lists them, worst first."),
                ("Keep the streak", "A little every day until the exam."),
            ]
        elif left >= 7:
            plan = [
                ("Revise, don't start new", "Go over your weakest topics, not new ones."),
                ("One last full mock", "Under exam time, in one sitting."),
                ("Sleep well", "Rest does more for your score this week than late nights."),
            ]
        else:
            plan = [
                ("Light revision only", "A short look over your notes; nothing new."),
                ("Get ready tonight", "Your exam slip, ID, pencils, and the route there."),
                ("Sleep early", "Arrive rested and on time."),
            ]
        return ("What to do now:", plan, None)
    if kind in ("mock_open", "mock_closing", "roadmap_mock"):
        return (
            "What to expect:",
            [
                ("Like the real exam", "Your four subjects, timed, in one sitting."),
                ("About two hours", "Find a quiet time when you will not be stopped."),
                ("Your score out of 400", "And each subject, with what to practise next."),
            ],
            None,
        )
    if kind == "roadmap_checkup":
        return (
            "What to expect:",
            [
                ("About ten minutes", "A short set of questions in this subject."),
                ("Your score today", "What you would get if the exam were today."),
                ("A sharper roadmap", "It moves your plan to what you need most."),
            ],
            None,
        )
    return ("", [], None)


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = greeting(name) + (para(note["body"]) if note.get("body") else "")
    words = [f"Hi {name},", "", note["title"]]
    if note.get("body"):
        words += ["", note["body"]]

    lead, todo, ending = extra(note)
    if todo:
        body += para(lead, top=18) + steps(todo)
        words += ["", lead, *[f"- {title}: {line}" for title, line in todo]]
    if note.get("link_url"):
        body += button(button_words(note["link_url"]), link(base, note["link_url"]))
        words += ["", f"{button_words(note['link_url'])}: {link(base, note['link_url'])}"]
    if ending:
        body += callout(*ending)
        words += ["", f"{ending[0]}: {ending[1]}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(
            eyebrow="Reminder",
            title=note["title"],
            body=body,
            base=base,
            preheader=note.get("body") or "",
        ),
    )
