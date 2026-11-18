"""To a parent the student named: confirm, and get their weekly report and missed-days alerts."""

from __future__ import annotations

from app.emails.layout import Email, button, callout, greeting, page, para, steps, text

WHAT_YOU_GET = [
    (
        "A weekly report",
        "Every Sunday evening: days studied, questions, accuracy, and next week's focus.",
    ),
    ("An alert if they stop", "When three days pass without any study, so you can step in early."),
]


def build(parent_name: str, student_name: str, confirm_url: str, base: str) -> Email:
    student = student_name.split()[0]
    title = f"{student} added you on Stack Prep"
    body = greeting(parent_name.split()[0])
    body += para(
        f"{student_name} is preparing for their exams with Stack Prep and added you as their "
        "parent or guardian. Confirm, and we will keep you up to date on their study."
    )
    body += steps(WHAT_YOU_GET)
    body += button("Confirm", confirm_url)
    body += callout(
        "Not you?",
        f"If you don't know {student}, ignore this email. Nothing is shared until you confirm.",
    )
    words = [
        f"Hi {parent_name.split()[0]},",
        "",
        f"{student_name} is preparing for their exams with Stack Prep and added you as their "
        "parent or guardian. Confirm, and we will keep you up to date on their study:",
        "",
        *[f"- {name}: {line}" for name, line in WHAT_YOU_GET],
        "",
        f"Confirm: {confirm_url}",
        "",
        f"Not you? If you don't know {student}, ignore this email. Nothing is shared until you "
        "confirm.",
    ]
    return Email(
        subject=title,
        text=text(words),
        html=page(
            eyebrow="For parents",
            title=title,
            body=body,
            base=base,
            preheader="Confirm to get a weekly report on their study.",
        ),
    )
