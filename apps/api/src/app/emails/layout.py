"""What every email shares: the frame and the pieces a template builds its body from.

One layout for all (founder, 17 Nov 2026): the Stack Prep mark, a small label, a title, the
body, a quiet footer. Tables and inline styles only, the HTML that Gmail, Outlook and phone
mail apps all draw the same. Our colours only: ink, purple, the pale lilac page.

A template returns an `Email`: the subject, a plain-text copy, and the HTML. The pieces below
each return HTML; the template keeps its plain text beside them.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from html import escape
from typing import Any

INK = "#1f0050"
PURPLE = "#6b0bff"
LILAC = "#f3ebff"
PAGE = "#f6f3fb"
GREY = "#5e5a6b"
QUIET = "#817c8f"
LINE = "#e4e0ec"
FONT = "'Poppins','Segoe UI',Helvetica,Arial,sans-serif"
FOOTER = "These emails come with your Stack Prep account."

#: One notification as the templates read it (a `notifications` row with the student's name).
Note = dict[str, Any]


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


def first_name(note: Note) -> str:
    return str(note.get("display_name") or "there").split()[0]


def link(base: str, path: str | None) -> str:
    return f"{base}{path or '/home'}"


def para(words: str, *, size: int = 15, colour: str = GREY, top: int = 10) -> str:
    return (
        f'<p style="margin:{top}px 0 0;font-family:{FONT};font-size:{size}px;line-height:1.6;'
        f'color:{colour}">{escape(words)}</p>'
    )


def button(label: str, url: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:24px 0 4px"><tr>'
        f'<td style="background:{PURPLE};border-radius:8px">'
        f'<a href="{escape(url)}" style="display:inline-block;padding:13px 22px;'
        f"font-family:{FONT};font-size:15px;font-weight:600;color:#ffffff;"
        f'text-decoration:none;border-radius:8px">{escape(label)} &rarr;</a></td></tr></table>'
    )


def callout(title: str, words: str) -> str:
    """A pale box for something to notice, such as "if this wasn't you"."""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:18px 0 0"><tr><td style="background:{LILAC};border-radius:10px;'
        f'padding:14px 16px;font-family:{FONT}">'
        f'<div style="font-size:14px;font-weight:700;color:{INK}">{escape(title)}</div>'
        f'<div style="font-size:14px;line-height:1.55;color:{GREY};margin-top:3px">'
        f"{escape(words)}</div></td></tr></table>"
    )


def lines(pairs: Sequence[tuple[str, str]]) -> str:
    """Name on the left, value on the right, a hairline between."""
    return "".join(
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-top:1px solid {LINE}"><tr>'
        f'<td style="padding:11px 0;font-family:{FONT};font-size:14px;color:{GREY}">'
        f"{escape(name)}</td>"
        f'<td align="right" style="padding:11px 0;font-family:{FONT};font-size:14px;'
        f'font-weight:600;color:{INK}">{escape(value)}</td></tr></table>'
        for name, value in pairs
    )


def items(entries: Sequence[tuple[str, str | None]]) -> str:
    """A short list of titled entries, each with a line under it."""
    return "".join(
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-top:1px solid {LINE}"><tr><td style="padding:12px 0;font-family:{FONT}">'
        f'<div style="font-size:15px;font-weight:600;color:{INK}">{escape(title)}</div>'
        + (
            f'<div style="font-size:14px;line-height:1.55;color:{GREY};margin-top:3px">'
            f"{escape(words)}</div>"
            if words
            else ""
        )
        + "</td></tr></table>"
        for title, words in entries
    )


def steps(entries: Sequence[tuple[str, str]]) -> str:
    """Numbered steps, each a bold line and a sentence."""
    return "".join(
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin-top:12px"><tr>'
        f'<td width="34" style="vertical-align:top"><div style="width:26px;height:26px;'
        f"border-radius:8px;background:{LILAC};color:{PURPLE};font-family:{FONT};font-size:13px;"
        f'font-weight:700;line-height:26px;text-align:center">{number}</div></td>'
        f'<td style="vertical-align:top;font-family:{FONT}">'
        f'<div style="font-size:15px;font-weight:600;color:{INK}">{escape(title)}</div>'
        f'<div style="font-size:14px;line-height:1.55;color:{GREY};margin-top:2px">'
        f"{escape(words)}</div></td></tr></table>"
        for number, (title, words) in enumerate(entries, start=1)
    )


def tiles(figures: Sequence[tuple[str, str]]) -> str:
    """Figures side by side, each in a pale tile: the number, its name under it."""
    width = f"{100 // max(len(figures), 1)}%"
    cells = "".join(
        f'<td width="{width}" style="padding:4px"><table role="presentation" width="100%" '
        f'cellpadding="0" cellspacing="0" border="0"><tr><td style="background:{LILAC};'
        f'border-radius:10px;padding:12px 10px;font-family:{FONT}">'
        f'<div style="font-size:21px;font-weight:700;color:{INK}">{escape(value)}</div>'
        f'<div style="font-size:12px;color:{GREY};margin-top:2px">{escape(name)}</div>'
        "</td></tr></table></td>"
        for name, value in figures
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:18px 0 6px"><tr>{cells}</tr></table>'
    )


def page(*, label: str, title: str, body: str, base: str) -> str:
    """The whole email around a template's body."""
    logo = f"{base}/brand/mark-96.png"
    site = base.replace("https://", "").replace("http://", "")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{PAGE}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="max-width:560px">
<tr><td style="padding:0 4px 16px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle"><img src="{escape(logo)}" width="36" height="36" alt=""
        style="display:block;border:0"></td>
    <td style="vertical-align:middle;padding-left:10px;font-family:{FONT};font-size:18px;
        font-weight:700;color:{INK}">Stack Prep</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1.5px solid {INK};border-radius:12px;
               border-bottom-width:5px;padding:28px 28px 26px">
  <p style="margin:0;font-family:{FONT};font-size:11px;font-weight:700;letter-spacing:.08em;
     text-transform:uppercase;color:{PURPLE}">{escape(label)}</p>
  <h1 style="margin:8px 0 0;font-family:{FONT};font-size:23px;line-height:1.3;color:{INK}">
    {escape(title)}</h1>
  {body}
</td></tr>
<tr><td style="padding:18px 6px 0;font-family:{FONT};font-size:12px;line-height:1.6;
               color:{QUIET}">
  {FOOTER}<br>
  Stack Prep by Stackjunior &middot;
  <a href="{escape(base)}" style="color:{QUIET}">{escape(site)}</a>
</td></tr>
</table></td></tr></table></body></html>"""


def text(parts: Sequence[str]) -> str:
    """The plain-text copy: the parts, then the sign-off and the footer."""
    return "\n".join([*parts, "", "Stack Prep", "", "--", FOOTER])
