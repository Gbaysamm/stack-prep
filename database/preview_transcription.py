#!/usr/bin/env python3
"""Build a page showing a transcription beside what the database holds today.

    uv run python database/preview_transcription.py --year 2003

Writes docs/questions/<exam>/<subject>/preview/index.html, which is gitignored. Open that
file; the path does not change between runs.

WHY THIS IS PRE-RENDERED. The maths is set at build time by the same
``katex.renderToString`` call the app's ``Maths.tsx`` makes, through ``render_maths.js``,
and KaTeX's stylesheet and fonts are copied in beside the page. So it needs no network and
runs no script: a reviewer never sees raw ``$x^2$`` flash before the page settles, and --
more to the point -- what is reviewed is what a student will actually be shown, rather than
a second renderer that agrees with the first most of the time.

The left column is read from the database, so the comparison is against what is really
deployed rather than against a memory of it. Without a reachable database the page still
builds, with that column blank.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
KATEX = ROOT / "node_modules" / "katex" / "dist"


def escape(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def stems_in_database(dsn: str | None, subject_code: str, year: int) -> dict[str, str]:
    """What the deployed bank currently says, keyed by question number."""
    import asyncpg

    conn = await asyncpg.connect(
        dsn=dsn,
        host=None if dsn else "127.0.0.1",
        port=None if dsn else 55439,
        database=None if dsn else "scorepilot",
    )
    try:
        await conn.execute("SET search_path = stackprep, public")
        rows = await conn.fetch(
            """
            SELECT q.question_number, v.stem
            FROM question_versions v
            JOIN questions q ON q.id = v.question_id
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.code = $1 AND q.exam_year = $2 AND q.current_version_id = v.id
            """,
            subject_code,
            year,
        )
        # question_number is text in the schema, not an integer: papers number questions
        # "12a" and "12b". Keyed as it is stored, and looked up the same way.
        return {str(row["question_number"]): row["stem"] for row in rows}
    finally:
        await conn.close()


def render(questions: list[dict]) -> list[dict]:
    """Hand the strings to KaTeX and get HTML back."""
    if not (KATEX / "katex.min.js").exists():
        raise SystemExit(f"KaTeX is not installed at {KATEX}; run `npm ci` first")
    with tempfile.TemporaryDirectory() as work:
        source = Path(work) / "in.json"
        target = Path(work) / "out.json"
        source.write_text(json.dumps(questions, ensure_ascii=False), encoding="utf-8")
        subprocess.run(
            ["node", str(ROOT / "database" / "render_maths.js"),
             str(KATEX.parent), str(source), str(target)],
            check=True, capture_output=True, text=True, encoding="utf-8",
        )
        return json.loads(target.read_text(encoding="utf-8"))


STYLE = """\nbody{font:16px/1.6 system-ui,sans-serif;margin:0;background:#faf9fb;color:#1a1a1f}
header{padding:18px 24px;background:#fff;border-bottom:1px solid #e4e4ea;
  position:sticky;top:0;z-index:5}
h1{margin:0 0 4px;font-size:19px}.sub{color:#666;font-size:14px}
.wrap{padding:14px 24px;max-width:1200px}
.q{background:#fff;border:1px solid #e4e4ea;border-radius:10px;margin:12px 0;overflow:hidden}
.hd{display:flex;gap:8px;align-items:center;padding:8px 14px;background:#f4f3f7;font-size:13px}
.num{font-weight:700}
.tag{font-size:11px;padding:2px 8px;border-radius:99px;background:#e2e2e8}
.tag.fig{background:#dbeafe;color:#1e3a8a}.tag.sus{background:#fde3c8;color:#7c2d12}
.tag.fix{background:#ede9fe;color:#5b21b6}.tag.pend{background:#fee2e2;color:#991b1b}
.fix{margin-top:10px;padding:8px 10px;background:#f5f3ff;border-left:3px solid #8b5cf6;
  font-size:13px;color:#4c1d95}
.cols{display:grid;grid-template-columns:1fr 1fr}
.cell{padding:12px 14px}.cell+.cell{border-left:1px solid #eee}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:6px}
.before{color:#7c2d12;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap}
.stem{font-size:16px}
.opts{margin:10px 0 0;padding:0;list-style:none;font-size:15px}
.opts li{padding:4px 0}.k{display:inline-block;width:22px;color:#888}
.bad{background:#fee;color:#b91c1c;padding:0 3px;border-radius:3px}
li.right{background:#f0fdf4;border-radius:6px;padding:4px 8px;margin-left:-8px}
.ok{font-size:10px;color:#15803d;margin-left:8px;text-transform:uppercase;letter-spacing:.06em}
.work{margin-top:14px;padding:12px 14px;background:#f8fafc;
  border:1px solid #e2e8f0;border-radius:8px}
.work ol{margin:6px 0 0;padding-left:20px}.work li{padding:4px 0;font-size:15px}
.hint{margin-top:10px;padding:8px 10px;background:#eef2ff;border-radius:6px;
  font-size:14px;color:#3730a3}
.unres{margin-top:14px;padding:10px 12px;background:#fef2f2;border-left:3px solid #ef4444;
  font-size:14px;color:#7f1d1d}
.note{margin-top:10px;padding:8px 10px;background:#fff7ed;
  border-left:3px solid #fb923c;font-size:13px;color:#7c2d12}
@media(max-width:860px){.cols{grid-template-columns:1fr}
  .cell+.cell{border-left:0;border-top:1px solid #eee}}"""


def build(transcription: Path, out_dir: Path, before: dict[str, str], label: str,
          explanations: Path | None = None) -> Path:
    document = yaml.safe_load(transcription.read_text(encoding="utf-8"))
    worked: dict[int, dict] = {}
    if explanations and explanations.exists():
        worked = yaml.safe_load(explanations.read_text(encoding="utf-8"))["explanations"]
    questions = [
        {
            "n": q["number"],
            "stem": q["stem"],
            "options": {key: str(value) for key, value in (q.get("options") or {}).items()},
            "figure": bool(q.get("needs_figure")),
            "uncertain": q.get("uncertain") or "",
            "corrected": q.get("corrected") or "",
            "pending": bool(q.get("pending")),
            "answer": (worked.get(q["number"]) or {}).get("answer") or "",
            "steps": (worked.get(q["number"]) or {}).get("steps") or [],
            "hint": (worked.get(q["number"]) or {}).get("hint") or "",
            "unresolved": (worked.get(q["number"]) or {}).get("unresolved") or "",
        }
        for q in document["questions"]
    ]
    rendered = render(questions)

    cards = []
    for q in rendered:
        tags = '<span class="tag fig">needs the diagram</span>' if q["figure"] else ""
        tags += '<span class="tag sus">ambiguous in print</span>' if q["uncertain"] else ""
        tags += '<span class="tag fix">option repaired</span>' if q["corrected"] else ""
        tags += '<span class="tag pend">pending an answer</span>' if q["pending"] else ""
        options = "".join(
            f'<li class="right"><span class="k">{key}.</span> {value}'
            f'<span class="ok">correct</span></li>'
            if key == q["answer"] else
            f'<li><span class="k">{key}.</span> {value}</li>'
            for key, value in q["options_html"].items()
        )
        working = ""
        if q["steps_html"]:
            steps = "".join(f"<li>{s}</li>" for s in q["steps_html"])
            hint = (f'<div class="hint"><b>Hint after a wrong answer:</b> {q["hint_html"]}</div>'
                    if q["hint_html"] else "")
            working += ('<div class="work"><div class="lbl">explanation</div>'
                        f'<ol>{steps}</ol>{hint}</div>')

        note = f'<div class="note">{escape(q["uncertain"])}</div>' if q["uncertain"] else ""
        if q["corrected"]:
            note += f'<div class="fix">Option set repaired: {escape(q["corrected"])}</div>'
        was = escape(before.get(str(q["n"]), "(not in the database)"))
        cards.append(
            f'<div class="q"><div class="hd"><span class="num">Q{q["n"]}</span>{tags}</div>'
            f'<div class="cols">'
            f'<div class="cell"><div class="lbl">in the database now</div>'
            f'<div class="before">{was}</div></div>'
            f'<div class="cell"><div class="lbl">re-transcribed</div>'
            f'<div class="stem">{q["stem_html"]}</div>'
            f'<ul class="opts">{options}</ul>{note}{working}</div>'
            f"</div></div>"
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    fonts = out_dir / "katex" / "fonts"
    fonts.mkdir(parents=True, exist_ok=True)
    shutil.copy2(KATEX / "katex.min.css", out_dir / "katex" / "katex.min.css")
    for font in (KATEX / "fonts").glob("*.woff2"):
        shutil.copy2(font, fonts / font.name)

    needs_figure = sum(1 for q in rendered if q["figure"])
    uncertain = sum(1 for q in rendered if q["uncertain"])
    page = (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
        f"<title>{escape(label)}</title>\n"
        '<link rel="stylesheet" href="./katex/katex.min.css">\n'
        f"<style>{STYLE}</style></head><body>\n"
        f"<header><h1>{escape(label)}</h1><div class=\"sub\">"
        f"Left: the database today. Right: the transcription, set with KaTeX. "
        f"{len(rendered)} questions · {needs_figure} need their diagram · "
        f"{uncertain} ambiguous in print. Rendered at build time — no scripts, no network."
        "</div></header>\n"
        f'<div class="wrap">{"".join(cards)}</div>\n</body></html>'
    )
    target = out_dir / f"{label.split()[-1]}.html"
    target.write_text(page, encoding="utf-8")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--exam", default="utme")
    parser.add_argument("--subject", default="mathematics")
    parser.add_argument("--subject-code", default="MATH")
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--no-database", action="store_true",
                        help="Skip the comparison column instead of failing if unreachable")
    args = parser.parse_args()

    folder = ROOT / "docs" / "questions" / args.exam / args.subject
    # A hand transcription wins when there is one. It carries only stem and options -- the
    # page, figures and proposed skill stay with the extracted file, which is why the two are
    # separate files rather than one overwriting the other.
    transcription = folder / f"retranscribed_{args.year}.yaml"
    if not transcription.exists():
        transcription = folder / f"transcription_{args.year}.yaml"
    if not transcription.exists():
        raise SystemExit(f"no transcription for {args.year} in {folder}")
    print(f"Reading {transcription.name}")

    before: dict[str, str] = {}
    if not args.no_database:
        try:
            before = asyncio.run(
                stems_in_database(args.database_url, args.subject_code, args.year))
        except Exception as error:
            print(f"Could not read the database ({error}); building without that column.")

    target = build(transcription, folder / "preview", before,
                   f"{args.exam.upper()} {args.subject.title()} {args.year}",
                   folder / f"explanations_{args.year}.yaml")
    index = folder / "preview" / "index.html"
    years = sorted(p.stem for p in (folder / "preview").glob("[0-9][0-9][0-9][0-9].html"))
    links = "".join(f'<li><a href="./{y}.html">{y}</a></li>' for y in years)
    index.write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{args.subject.title()} transcriptions</title>"
        "<style>body{font:16px/1.6 system-ui,sans-serif;margin:40px;max-width:640px}"
        "li{padding:4px 0}</style></head><body>"
        f"<h1>{args.exam.upper()} {args.subject.title()}</h1>"
        f"<p>Years transcribed so far:</p><ul>{links}</ul></body></html>",
        encoding="utf-8")
    print(f"Open {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
