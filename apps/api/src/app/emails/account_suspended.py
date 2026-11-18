"""An admin paused the account: they cannot sign in until it is opened again."""

from __future__ import annotations

from app.emails.layout import (
    Email,
    Note,
    button,
    callout,
    first_name,
    greeting,
    link,
    page,
    para,
    text,
)
from app.emails.words import button_words


def build(note: Note, base: str) -> Email:
    name = first_name(note)
    body = greeting(name) + (para(note["body"]) if note.get("body") else "")
    words = [f"Hi {name},", "", note["title"]]
    if note.get("body"):
        words += ["", note["body"]]
    body += callout(
        "What happens to your work",
        "Nothing is deleted. Your progress, runs and reports are kept for when it opens again.",
    )
    words += ["", "Nothing is deleted. Your progress is kept for when it opens again."]

    if note.get("link_url"):
        body += button(button_words(note["link_url"]), link(base, note["link_url"]))
        words += ["", f"{button_words(note['link_url'])}: {link(base, note['link_url'])}"]
    return Email(
        subject=note["title"],
        text=text(words),
        html=page(
            eyebrow="Your account",
            title=note["title"],
            body=body,
            base=base,
            preheader=note.get("body") or "",
        ),
    )
