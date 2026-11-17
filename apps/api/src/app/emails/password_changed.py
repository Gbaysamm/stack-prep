"""Their password was changed while signed in."""

from __future__ import annotations

from app.emails.layout import Email, Note, button, callout, first_name, link, page, para, text
from app.emails.words import button_words


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = para(f"Hi {name},", top=12)
    words = [f"Hi {name},", "", note["title"]]
    if note.get("body"):
        body += para(note["body"])
        words += ["", note["body"]]
    body += callout(
        "Wasn't you?",
        "Reset your password from the sign-in page now, then write to us in Messages.",
    )
    words += ["", "Wasn't you? Reset your password from the sign-in page now, then write to us."]

    if note.get("link_url"):
        body += button(button_words(note["link_url"]), link(base, note["link_url"]))
        words += ["", f"{button_words(note['link_url'])}: {link(base, note['link_url'])}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(label="Security", title=note["title"], body=body, base=base),
    )
