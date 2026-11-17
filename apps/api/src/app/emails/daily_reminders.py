"""Several reminders due at once, in one email (reminders are one email a day at most)."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, items, link, page, para, text


def build(notes: list[Note], base: str) -> Email:
    name = first_name(notes[0])
    body = para(f"Hi {name}, here is what needs you today.", top=12)
    body += '<div style="height:8px"></div>' + items([(n["title"], n.get("body")) for n in notes])
    body += button("Open today's plan", link(base, "/home"))
    words = [f"Hi {name},", "", "Here is what needs you today:", ""]
    for n in notes:
        words += [n["title"], *([n["body"]] if n.get("body") else []), ""]
    words.append(f"Open today's plan: {link(base, '/home')}")
    return Email(
        subject=f"{notes[0]['title']} (and {len(notes) - 1} more)",
        text=text(words),
        html=page(label="Reminder", title="Today on Stack Prep", body=body, base=base),
    )
