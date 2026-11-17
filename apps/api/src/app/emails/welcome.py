"""The welcome, the moment they sign up: what to do first, in three steps."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, link, page, para, steps, text

FIRST_STEPS = [
    ("Take a short check-up", "About ten minutes per subject. It shows where you stand today."),
    ("Follow your roadmap", "Built from your check-ups and your exam date: what to do each day."),
    ("Practise a little every day", "Short runs that teach as you go. Streaks keep you going."),
]


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = para(f"Hi {name}, your account is ready. Here is how to start.", top=12)
    body += steps(FIRST_STEPS)
    body += button("Start your first check-up", link(base, "/roadmap"))
    words = [f"Hi {name},", "", "Your Stack Prep account is ready. Here is how to start:", ""]
    words += [f"{n}. {title}: {line}" for n, (title, line) in enumerate(FIRST_STEPS, start=1)]
    words += ["", f"Start your first check-up: {link(base, '/roadmap')}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(label="Welcome", title=note["title"], body=body, base=base),
    )
