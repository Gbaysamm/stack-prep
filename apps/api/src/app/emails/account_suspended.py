"""An admin paused the account: they cannot sign in until it is opened again."""

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
        html=page(label="Your account", title=note["title"], body=body, base=base),
    )
