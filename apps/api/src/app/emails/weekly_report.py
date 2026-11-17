"""The weekly report, Sunday evening: four figures, the change, the topics, Progress."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, lines, link, page, para, text, tiles


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    data = note.get("data") or {}
    figures = [
        ("Days", str(data.get("days", 0))),
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
        body = para(f"Hi {name},", top=12) + para(note.get("body") or "")
    else:
        body = para(f"Hi {name}, here is your week in practice.", top=12)
        body += tiles(figures) + lines(pairs)
    body += button("See your progress", link(base, "/progress"))
    words = [f"Hi {name},", "", note["title"], ""]
    words += (
        [f"{k}: {v}" for k, v in figures + pairs]
        if data.get("answered")
        else [note.get("body") or ""]
    )
    words += ["", f"See your progress: {link(base, '/progress')}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(label="Your week", title=note["title"], body=body, base=base),
    )
