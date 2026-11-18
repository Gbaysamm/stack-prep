"""A plan has started, paid or given."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, greeting, link, page, para, text
from app.emails.words import button_words


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = greeting(name) + (para(note["body"]) if note.get("body") else "")
    words = [f"Hi {name},", "", note["title"]]
    if note.get("body"):
        words += ["", note["body"]]

    if note.get("link_url"):
        body += button(button_words(note["link_url"]), link(base, note["link_url"]))
        words += ["", f"{button_words(note['link_url'])}: {link(base, note['link_url'])}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(
            eyebrow="Your plan",
            title=note["title"],
            body=body,
            base=base,
            preheader=note.get("body") or "",
        ),
    )
