"""What every email shares: the frame and the pieces a template builds its body from.

The app's own look (founder, 17 Nov 2026): Clash Display for titles, Poppins for words, Space
Mono for small labels and figures, loaded from the same places the app loads them. Apple Mail,
iPhone and most Android mail apps show them; Gmail and Outlook fall back to the stack after.

The frame: the Stack Prep mark, then one sticker card (1.5px ink outline, the pale purple
shadow, 12px corners) that opens on the app's dark hero band (the lime label, the title in
white), then the body on white, then a quiet footer. Tables and inline styles only, the HTML
every mail app draws the same.

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
PURPLE_PALE = "#d7bdff"
LILAC = "#f3ebff"
PAGE = "#f6f3fb"
LIME = "#85de4c"
PINK = "#fe7698"
TEXT = "#3b3947"
GREY = "#5e5a6b"
QUIET = "#817c8f"
LINE = "#e9e4f2"

DISPLAY = "'Clash Display','Poppins','Segoe UI',Helvetica,Arial,sans-serif"
BODY = "'Poppins','Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'Space Mono',ui-monospace,Menlo,Consolas,monospace"
FONTS = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;'
    '600;700&family=Space+Mono:wght@400;700&display=swap">'
    '<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600'
    '&display=swap">'
)
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


def _table(inner: str, style: str = "", width: bool = True) -> str:
    full = 'width="100%" ' if width else ""
    return (
        f'<table role="presentation" {full}cellpadding="0" cellspacing="0" border="0" '
        f'style="border-collapse:separate;{style}">{inner}</table>'
    )


def para(words: str, *, size: int = 14, colour: str = TEXT, top: int = 12) -> str:
    return (
        f'<p style="margin:{top}px 0 0;font-family:{BODY};font-size:{size}px;line-height:1.65;'
        f'color:{colour}">{escape(words)}</p>'
    )


def greeting(name: str, words: str = "") -> str:
    """ "Hi Ada," in bold ink, and the opening line after it."""
    return (
        f'<p style="margin:0;font-family:{BODY};font-size:15px;line-height:1.6;color:{TEXT}">'
        f'<strong style="color:{INK}">Hi {escape(name)},</strong>'
        + (f" {escape(words)}" if words else "")
        + "</p>"
    )


def button(label: str, url: str) -> str:
    """The one action: flat purple, 8px corners, as in the app."""
    return _table(
        f'<tr><td style="background:{PURPLE};border-radius:8px">'
        f'<a href="{escape(url)}" style="display:inline-block;padding:12px 20px;'
        f"font-family:{BODY};font-size:14px;font-weight:600;line-height:1;color:#ffffff;"
        f'text-decoration:none;border-radius:8px">{escape(label)}&nbsp;&nbsp;&rarr;</a>'
        "</td></tr>",
        "margin:26px 0 2px",
        width=False,
    )


def label(words: str, colour: str = PURPLE) -> str:
    return (
        f'<div style="font-family:{MONO};font-size:11px;font-weight:700;letter-spacing:.08em;'
        f'text-transform:uppercase;color:{colour}">{escape(words)}</div>'
    )


def callout(title: str, words: str) -> str:
    """A flat lilac panel for something to notice, such as "Wasn't you?"."""
    return _table(
        f'<tr><td style="background:{LILAC};border-radius:10px;padding:16px 18px">'
        + label(title)
        + f'<div style="font-family:{BODY};font-size:14px;line-height:1.6;color:{TEXT};'
        f'margin-top:6px">{escape(words)}</div></td></tr>',
        "margin:20px 0 0",
    )


def lines(pairs: Sequence[tuple[str, str]]) -> str:
    """Name on the left, value on the right, a hairline between; the columns fixed at 55/45."""
    rows = "".join(
        f'<tr><td width="55%" style="padding:12px 12px 12px 0;border-top:1px solid {LINE};'
        f'font-family:{BODY};font-size:13px;line-height:1.45;color:{GREY}">{escape(name)}</td>'
        f'<td width="45%" align="right" style="padding:12px 0;border-top:1px solid {LINE};'
        f'font-family:{BODY};font-size:13px;line-height:1.45;font-weight:600;color:{INK}">'
        f"{escape(value)}</td></tr>"
        for name, value in pairs
    )
    return _table(rows, "margin:16px 0 0;table-layout:fixed")


def items(entries: Sequence[tuple[str, str | None]]) -> str:
    """Titled entries, each in a flat lilac row with a dot before it."""
    rows = "".join(
        '<tr><td style="padding:0 0 8px">'
        + _table(
            f'<tr><td width="22" style="vertical-align:top;padding:18px 0 0 16px">'
            f'<div style="width:8px;height:8px;border-radius:4px;background:{PURPLE}"></div></td>'
            f'<td style="padding:13px 16px 13px 4px;font-family:{BODY}">'
            f'<div style="font-size:14px;font-weight:600;line-height:1.45;color:{INK}">'
            f"{escape(title)}</div>"
            + (
                f'<div style="font-size:13px;line-height:1.55;color:{GREY};margin-top:2px">'
                f"{escape(words)}</div>"
                if words
                else ""
            )
            + "</td></tr>",
            f"background:{LILAC};border-radius:10px",
        )
        + "</td></tr>"
        for title, words in entries
    )
    return _table(rows, "margin:20px 0 0")


def steps(entries: Sequence[tuple[str, str]]) -> str:
    """Numbered steps: the number in a purple square, a bold line, a sentence."""
    rows = "".join(
        f'<tr><td width="40" style="vertical-align:top;padding:15px 0 0">'
        f'<div style="width:26px;height:26px;border-radius:7px;background:{PURPLE};'
        f"color:#ffffff;font-family:{MONO};font-size:12px;font-weight:700;line-height:26px;"
        f'text-align:center">{number}</div></td>'
        f'<td style="vertical-align:top;padding:15px 0 0;font-family:{BODY}">'
        f'<div style="font-size:14px;font-weight:600;color:{INK}">{escape(title)}</div>'
        f'<div style="font-size:13px;line-height:1.55;color:{GREY};margin-top:2px">'
        f"{escape(words)}</div></td></tr>"
        for number, (title, words) in enumerate(entries, start=1)
    )
    return _table(rows, "margin:6px 0 0")


def figures(pairs: Sequence[tuple[str, str]]) -> str:
    """Figures two to a row in flat lilac tiles of equal width: the number, its name under it."""

    def tile(name: str, value: str) -> str:
        return (
            f'<td width="48%" style="background:{LILAC};border-radius:10px;padding:13px 14px 12px;'
            f'vertical-align:top"><div style="font-family:{DISPLAY};font-size:22px;'
            f"font-weight:600;line-height:1.15;color:{INK};white-space:nowrap;overflow:hidden;"
            f'text-overflow:ellipsis">{escape(value)}</div>'
            f'<div style="margin-top:5px">{label(name, GREY)}</div></td>'
        )

    gap = '<td width="4%" style="font-size:0;line-height:0">&nbsp;</td>'
    rows: list[str] = []
    for i in range(0, len(pairs), 2):
        if rows:
            rows.append(
                '<tr><td colspan="3" style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>'
            )
        pair = list(pairs[i : i + 2])
        cells = [tile(*pair[0]), gap, tile(*pair[1]) if len(pair) > 1 else '<td width="48%"></td>']
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return _table("".join(rows), "margin:16px 0 0;table-layout:fixed")


def page(*, eyebrow: str, title: str, body: str, base: str, preheader: str = "") -> str:
    """The whole email around a template's body."""
    logo = f"{base}/brand/mark-96.png"
    site = base.replace("https://", "").replace("http://", "")
    hidden = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(preheader)}'
        "</div>"
        if preheader
        else ""
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>{FONTS}</head>
<body style="margin:0;padding:0;background:{PAGE};-webkit-text-size-adjust:100%">{hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{PAGE}"><tr><td align="center" style="padding:32px 14px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="max-width:560px">
<tr><td style="padding:0 2px 18px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle"><img src="{escape(logo)}" width="34" height="34" alt=""
        style="display:block;border:0"></td>
    <td style="vertical-align:middle;padding-left:10px;font-family:{DISPLAY};font-size:17px;
        font-weight:600;letter-spacing:-.01em;color:{INK}">Stack Prep</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1.5px solid {INK};border-radius:12px;
               box-shadow:5px 5px 0 {PURPLE_PALE};overflow:hidden">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:{INK};background-image:radial-gradient(70% 90% at 100% 0%,
        rgba(107,11,255,.6),transparent 65%),radial-gradient(50% 70% at 80% 120%,
        rgba(254,118,152,.32),transparent 70%);border-radius:10px 10px 0 0;
        padding:24px 26px 22px">
      {label(eyebrow, LIME)}
      <h1 style="margin:8px 0 0;font-family:{DISPLAY};font-size:22px;font-weight:600;
          line-height:1.25;letter-spacing:-.01em;color:#ffffff">{escape(title)}</h1>
    </td></tr>
    <tr><td style="padding:24px 26px 26px">{body}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:22px 4px 0;font-family:{BODY};font-size:12px;line-height:1.7;
               color:{QUIET}">
  {FOOTER}<br>
  Stack Prep by Stackjunior &middot;
  <a href="{escape(base)}" style="color:{QUIET};text-decoration:underline">{escape(site)}</a>
</td></tr>
</table></td></tr></table></body></html>"""


def text(parts: Sequence[str]) -> str:
    """The plain-text copy: the parts, then the sign-off and the footer."""
    return "\n".join([*parts, "", "Stack Prep", "", "--", FOOTER])
