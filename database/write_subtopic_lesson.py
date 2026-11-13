"""Write one subtopic lesson with an AI, in our lesson format, checked as our own lessons are.

A trial of the Lessons page's "write a lesson" button (founder, 13 Nov 2026). The AI is given the
lesson guide, the writer and review briefs, the board style guide, the doodle and diagram
contract, the names of the library doodles, one finished lesson as an example, and the subtopic
with a few of its bank questions. Its reply is written to
docs/lessons/subtopics/<subject>/<slug>_<part>.yaml and checked three ways:

- the loader's own checks (load_subtopic_lessons.read_lesson: cues on said words, marks on
  their lines, doodle names that exist, problems in shape);
- every piece of LaTeX renders, with the KaTeX and mhchem the board uses (check_latex.mjs);
- every `say` is plain speech: no $, no LaTeX, no powers or units in symbols.

A failed check goes back to the AI with the faults, up to twice more.

The model is OpenAI's middle tier, gpt-6.1-terra, with high reasoning effort: the budget tier
(gpt-6-luna) was not good enough at LaTeX and teaching, and the top tier costs twice as much
(founder, 13 Nov 2026). The key comes from the API's settings and is never printed.

    python database/write_subtopic_lesson.py --subtopic-id <uuid> --part 1 \\
        --slug chem_ph_poh --title 'What pH means' --focus 'what pH measures, the scale ...'
"""

# ruff: noqa: RUF001  (the times sign is quoted on purpose: it is what the speech rule forbids)
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import asyncpg
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "database"))
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))

from lesson_doodles import library_names  # noqa: E402
from load_subtopic_lessons import BANK, read_lesson  # noqa: E402

from app.config import get_settings  # noqa: E402

MODEL = "gpt-6.1-terra"
#: Dollars per million tokens (input, output), for the cost line printed at the end.
PRICES = {"gpt-6.1-terra": (1.0, 5.0), "gpt-6.1-sol": (2.0, 10.0), "gpt-6-luna": (0.1, 0.5)}
ATTEMPTS = 3

DOCS = [
    "docs/lessons/subtopic-lesson-guide.md",
    "docs/lessons/writer-brief.md",
    "docs/lessons/review-brief.md",
    "docs/lesson-style-guide.md",
    "docs/plans/doodles-v2-contract.md",
]
EXAMPLE = "docs/lessons/subtopics/chemistry/chem_elements_compounds_mixtures_1.yaml"

SYSTEM = """You write lessons for Stack Prep, a JAMB UTME preparation app for Nigerian students.
A lesson is played on a whiteboard: a teacher's voice says each moment's `say`, and the board
writes that moment's `write` line as the words it belongs to are said. What is said and what is
written are different things: the voice explains in full spoken sentences; the board holds the
short note a good teacher writes (a definition, a rule, a working line), never a copy of the
speech. You follow the guides you are given exactly, and you reply with one YAML document only,
in exactly the format of the example lesson, with no other text."""

RULES = r"""=== Rules that are checked automatically (a lesson that breaks one is sent back) ===
1. `say` is exactly what the voice speaks, so it is written the way it is said. No $, no
   LaTeX, no backslashes, no superscript or subscript powers, no × sign. Write numbers, powers
   and units in words: "one times ten to the power minus three moles per cubic decimetre",
   not "1.0 × 10⁻³ mol dm⁻³"; "log to base ten", not "log₁₀". A chemical formula may be
   written plainly (H₂O, Na⁺, H₂SO₄): the voice spells it letter by letter.
2. All mathematics and chemistry on the board (`write`, problems, captions) is LaTeX inside
   $...$, and it must render in KaTeX with the mhchem extension: balanced braces, real
   commands only (\frac{a}{b}, \times, \log_{10}, ^{-3}, \mathrm{...}, \text{...}), chemistry
   as \ce{...} (\ce{H2SO4}, \ce{2H+ + 2e- -> H2}). Never a lone $. Plain words need no $.
3. In YAML, put every say, write and caption in single quotes, and double any single quote
   inside ('Today''s'). A backslash inside single quotes is kept as it is.
4. Say each thing once: no sentence that repeats an earlier one, and the recap's board lines
   name every rule taught. Use Nigerian school names consistently (tetraoxosulphate(VI),
   sulphur), never mixing them with other spellings."""


def _prompt(subject: str, subtopic: dict, questions: list[str], args: argparse.Namespace) -> str:
    docs = "\n\n".join(
        f"=== {name} ===\n{(ROOT / name).read_text(encoding='utf-8')}" for name in DOCS
    )
    example = (ROOT / EXAMPLE).read_text(encoding="utf-8")
    library = ", ".join(sorted(n for n in library_names() if n != "index"))
    asked = "\n".join(f"- {q}" for q in questions) or "- (none in the bank yet)"
    return f"""{docs}

=== The library doodles you may use (name: '<one of these>'); you may not invent others ===
{library}
You may not use custom doodles (names starting custom:), because nobody has drawn them. Where a
picture is truly needed and no library doodle or diagram kind shows it, use a `diagram` of a kind
in the contract if one fits; otherwise teach it in words and add a YAML comment
"# PICTURE NEEDED: <what to draw>" on the moment, for a person to draw later.

=== An example lesson, finished and approved (copy its format exactly) ===
{example}

{RULES}

=== Write this lesson ===
subject: {subject}
subtopic: {subtopic["name"]} (code {subtopic["code"]})
subtopic_id: {subtopic["id"]}
part: {args.part}
title: {args.title}
What this lesson covers (one main idea, about 3 to 4 minutes): {args.focus}
Some bank questions on this subtopic (the level to aim at, not to copy):
{asked}

Reply with the YAML document only: the comment line at the top, format_version, subject,
subtopic, subtopic_id, part, title, sources, moments, and problems (one problem, with ask,
answer, accept, working, needs_working)."""


def _yaml_of(reply: str) -> str:
    found = re.search(r"```(?:yaml)?\s*\n(.*?)```", reply, re.S)
    return (found.group(1) if found else reply).strip() + "\n"


def _ask(client, model: str, messages: list[dict], effort: str) -> tuple[str, dict]:
    options: dict = {"max_completion_tokens": 40000}
    if effort:
        options["reasoning_effort"] = effort
    reply = client.chat.completions.create(model=model, messages=messages, **options)
    usage = getattr(reply, "usage", None)
    return reply.choices[0].message.content or "", {
        "in": getattr(usage, "prompt_tokens", 0),
        "out": getattr(usage, "completion_tokens", 0),
    }


#: What a spoken line may not contain: maths markup, powers, the times sign, units in symbols.
#: An ion's charge (Fe³⁺, SO₄²⁻) is allowed: the voice spells it.
_NOT_SPOKEN = re.compile(r"[$\\×]|10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]|\b(?:mol|dm|cm|kg|g|m|s)⁻|[a-z][²³](?![⁺⁻])|₁₀")


def _content_faults(path: Path) -> list[str]:
    """Faults the loader does not look for: LaTeX that will not render, speech in symbols."""
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    faults: list[str] = []
    board: list[str] = []
    for n, moment in enumerate(doc.get("moments") or [], 1):
        say = str(moment.get("say") or "")
        if _NOT_SPOKEN.search(say):
            faults.append(
                f"moment {n}: its say is not written as spoken (no $, LaTeX, powers, × or "
                f"unit symbols in speech): {say!r}"
            )
        for key in ("write",):
            if moment.get(key):
                board.append(str(moment[key]))
        for item in [moment.get("doodle"), moment.get("diagram")]:
            if isinstance(item, dict) and item.get("caption"):
                board.append(str(item["caption"]))
    for problem in doc.get("problems") or []:
        answer = str(problem.get("answer") or "").strip()
        working = [str(line) for line in problem.get("working") or []]
        # The key must be sure, and the working must end on it (a trial wrote "+3?" over
        # working that gave -3).
        plain = re.sub(r"[\s$°]|\\,|\\ce\{|\}|\\mathrm\{", "", answer).replace("−", "-").lower()
        last = re.sub(r"[\s$°]|\\,|\\ce\{|\}|\\mathrm\{", "", working[-1] if working else "")
        if "?" in answer or not plain:
            faults.append(f"problem answer {answer!r} is not a sure answer")
        elif plain.lstrip("+") not in last.replace("−", "-").lower():
            faults.append(
                f"problem answer {answer!r} is not what its last working line gives: "
                f"{working[-1] if working else '(no working)'!r}; solve it again and make "
                "them agree"
            )
        board += [str(problem.get("ask") or ""), answer]
        board += [str(line) for line in problem.get("working") or []]
    found = subprocess.run(
        ["node", str(ROOT / "database" / "check_latex.mjs")],
        input=json.dumps(board),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    for fault in json.loads(found.stdout or "[]"):
        faults.append(f"LaTeX that does not render ({fault['error']}) in: {fault['line']!r}")
    return faults


async def _subtopic(dsn: str, subtopic_id: str) -> tuple[str, dict, list[str]]:
    conn = await asyncpg.connect(dsn=dsn)
    try:
        await conn.execute("SET search_path = stackprep, public")
        row = await conn.fetchrow(
            "SELECT sub.id, sub.code, sub.name, s.name AS subject FROM curriculum_items sub"
            " JOIN subjects s ON s.id = sub.subject_id WHERE sub.id = $1",
            subtopic_id,
        )
        if row is None:
            raise SystemExit(f"no subtopic {subtopic_id}")
        stems = await conn.fetch(
            """
            SELECT v.stem FROM curriculum_items skill
            JOIN question_classifications c
              ON c.curriculum_item_id = skill.id AND c.classification_role = 'primary'
            JOIN questions q ON q.id = c.question_id AND q.retired_at IS NULL
            JOIN question_versions v ON v.id = q.current_version_id
            WHERE skill.parent_id = $1 LIMIT 4
            """,
            subtopic_id,
        )
        return row["subject"], dict(row), [r["stem"] for r in stems]
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subtopic-id", required=True)
    parser.add_argument("--part", type=int, default=1)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--focus", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--effort", default="high")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()

    settings = get_settings()
    if not settings.openai_api_key:
        raise SystemExit("no OpenAI key in the API's settings")
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key, timeout=900)
    subject, subtopic, questions = asyncio.run(
        _subtopic(args.database_url.replace("+asyncpg", "", 1), args.subtopic_id)
    )
    path = BANK / subject.lower() / f"{args.slug}_{args.part}.yaml"
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": _prompt(subject.lower(), subtopic, questions, args)},
    ]
    spent = {"in": 0, "out": 0}
    started = time.time()
    for attempt in range(1, ATTEMPTS + 1):
        reply, usage = _ask(client, args.model, messages, args.effort)
        spent = {k: spent[k] + usage[k] for k in spent}
        path.write_text(_yaml_of(reply), encoding="utf-8")
        try:
            read_lesson(path)
            faults = _content_faults(path)
        except SystemExit as error:
            faults = [str(error)]
        except yaml.YAMLError as error:
            faults = [f"the YAML does not parse: {error}"]
        if not faults:
            print(f"attempt {attempt}: passed every check")
            print(f"OK {path.relative_to(ROOT).as_posix()}")
            break
        print(f"attempt {attempt}: {len(faults)} fault(s): " + " | ".join(faults)[:600])
        if attempt == ATTEMPTS:
            print(f"FAILED {path.relative_to(ROOT).as_posix()}")
            break
        messages += [
            {"role": "assistant", "content": reply},
            {
                "role": "user",
                "content": "The checks refused it:\n- "
                + "\n- ".join(faults)
                + "\nFix exactly these (and anything else of the same kind) and reply with the "
                "whole corrected YAML document only.",
            },
        ]
    cost_in, cost_out = PRICES.get(args.model, (0.0, 0.0))
    dollars = spent["in"] / 1e6 * cost_in + spent["out"] / 1e6 * cost_out
    print(
        f"model {args.model} ({args.effort}), tokens in {spent['in']}, out {spent['out']}, "
        f"about ${dollars:.3f}, {time.time() - started:.0f}s"
    )


if __name__ == "__main__":
    main()
