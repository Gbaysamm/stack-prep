"""The weekly report, Sunday evening: four figures, the change, the topics, Progress."""

from __future__ import annotations

from app.emails.layout import (
    Email,
    Note,
    button,
    figures,
    first_name,
    greeting,
    lines,
    link,
    page,
    para,
    text,
)


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    data = note.get("data") or {}
    numbers = [
        ("Days studied", str(data.get("days", 0))),
        ("Time", str(data.get("time", "0 min"))),
        ("Questions", str(data.get("answered", 0))),
        ("Accuracy", f"{data.get('accuracy', 0)}%"),
    ]
    pairs: list[tuple[str, str]] = []
    if data.get("change"):
        pairs.append(("Compared with last week", str(data["change"])))
    if data.get("most"):
        pairs.append(("Most practised", ", ".join(data["most"])))
    if data.get("focus"):
        pairs.append(("Next week's focus", str(data["focus"])))
    if not data.get("answered"):
        # A quiet week: no figures to show, only the nudge back.
        body = greeting(name) + (para(note["body"]) if note.get("body") else "")
    else:
        body = greeting(name, "here is your week in practice.")
        body += figures(numbers) + lines(pairs)
    body += button("See your progress", link(base, "/progress"))
    words = [f"Hi {name},", "", note["title"], ""]
    if data.get("answered"):
        words += [f"{k}: {v}" for k, v in numbers + pairs]
    else:
        words.append(note.get("body") or "")
    words += ["", f"See your progress: {link(base, '/progress')}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(
            eyebrow="Your week",
            title=note["title"],
            body=body,
            base=base,
            preheader=note.get("body") or "",
        ),
    )
