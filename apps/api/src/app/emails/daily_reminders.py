"""Several reminders due at once, in one email (reminders are one email a day at most)."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, greeting, items, link, page, text


def build(notes: list[Note], base: str) -> Email:
    name = first_name(notes[0])
    body = greeting(name, "here is what needs you today.")
    body += items([(n["title"], n.get("body")) for n in notes])
    body += button("Open today's plan", link(base, "/home"))
    words = [f"Hi {name},", "", "Here is what needs you today:", ""]
    for n in notes:
        words += [n["title"], *([n["body"]] if n.get("body") else []), ""]
    words.append(f"Open today's plan: {link(base, '/home')}")
    return Email(
        subject=f"{notes[0]['title']} (and {len(notes) - 1} more)",
        text=text(words),
        html=page(
            eyebrow="Today",
            title="What needs you today",
            body=body,
            base=base,
            preheader=" · ".join(n["title"] for n in notes),
        ),
    )
