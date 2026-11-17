"""A plan has started, paid or given."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, first_name, link, page, para, text
from app.emails.words import button_words


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = para(f"Hi {name},", top=12)
    words = [f"Hi {name},", "", note["title"]]
    if note.get("body"):
        body += para(note["body"])
        words += ["", note["body"]]

    if note.get("link_url"):
        body += button(button_words(note["link_url"]), link(base, note["link_url"]))
        words += ["", f"{button_words(note['link_url'])}: {link(base, note['link_url'])}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(label="Your plan", title=note["title"], body=body, base=base),
    )
