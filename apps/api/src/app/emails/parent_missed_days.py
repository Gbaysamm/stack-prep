"""To a confirmed parent, when their child has not studied for three days (and again at seven)."""

from __future__ import annotations

from app.emails.layout import Email, callout, greeting, page, para, text


def build(parent_name: str, student_name: str, days: int, base: str) -> Email:
    student = student_name.split()[0]
    title = f"{student} hasn't studied for {days} days"
    body = greeting(parent_name.split()[0])
    body += para(
        f"{student_name} has not practised on Stack Prep for {days} days. Their plan is still "
        "there, and it has kept their place."
    )
    body += callout(
        "What helps",
        "Ask them to do one short session today: about ten minutes. Small daily practice is "
        "what moves an exam score.",
    )
    words = [
        f"Hi {parent_name.split()[0]},",
        "",
        f"{student_name} has not practised on Stack Prep for {days} days. Their plan is still "
        "there, and it has kept their place.",
        "",
        "What helps: ask them to do one short session today, about ten minutes.",
    ]
    return Email(
        subject=title,
        text=text(words),
        html=page(eyebrow="For parents", title=title, body=body, base=base, preheader=title),
    )
