"""To a confirmed parent, Sunday evening: their child's week in four figures and three lines."""

from __future__ import annotations

from typing import Any

from app.emails.layout import Email, figures, greeting, lines, page, para, text


def build(parent_name: str, student_name: str, data: dict[str, Any], base: str) -> Email:
    student = student_name.split()[0]
    answered = int(data.get("answered", 0))
    title = (
        f"{student}'s week: {answered} questions at {data.get('accuracy', 0)}%"
        if answered
        else f"{student}'s week: no practice"
    )
    numbers = [
        ("Days studied", str(data.get("days", 0))),
        ("Time", str(data.get("time", "0 min"))),
        ("Questions", str(answered)),
        ("Accuracy", f"{data.get('accuracy', 0)}%"),
    ]
    pairs: list[tuple[str, str]] = []
    if data.get("change"):
        pairs.append(("Compared with last week", str(data["change"])))
    if data.get("most"):
        pairs.append(("Most practised", ", ".join(data["most"])))
    if data.get("focus"):
        pairs.append(("Their focus next week", str(data["focus"])))

    body = greeting(parent_name.split()[0], f"here is {student}'s week on Stack Prep.")
    if answered:
        body += figures(numbers) + lines(pairs)
        body += para(
            "A few minutes of interest from you on Sunday goes a long way: ask what they "
            f"practised, and what {data.get('focus') or 'they will work on'} next week.",
            top=18,
        )
    else:
        body += para(
            f"{student} did not practise this week. A short session each day is what moves a "
            "score; a word from you tonight can get them going again.",
            top=14,
        )
    words = [f"Hi {parent_name.split()[0]},", "", title, ""]
    words += [f"{k}: {v}" for k, v in numbers + pairs] if answered else []
    return Email(
        subject=title,
        text=text(words),
        html=page(eyebrow="For parents", title=title, body=body, base=base, preheader=title),
    )
