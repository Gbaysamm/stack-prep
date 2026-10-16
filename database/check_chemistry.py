#!/usr/bin/env python3
"""Check the UTME Chemistry write-ups before they are loaded.

    uv run --frozen python database/check_chemistry.py            # every year
    uv run --frozen python database/check_chemistry.py 2010 2011  # some years
    uv run --frozen python database/check_chemistry.py --lessons 2010  # and the board lessons

Checks retranscribed_YYYY.yaml against explanations_YYYY.yaml, following the rules in
docs/questions/utme/chemistry/README.md:

- every question has four options and a right answer, a subtopic and a level;
- the paper-type question is left out;
- each figure file exists;
- each kept question has an explanation with the same answer, and a `why` for each wrong
  option only;
- no explanation tells the student the key or the paper is wrong;
- every $...$ formula typesets in KaTeX with mhchem.

Exits 0 and prints OK when all is well. Otherwise it lists every problem and exits 1.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CHEM = ROOT / "docs" / "questions" / "utme" / "chemistry"
LETTERS = ("A", "B", "C", "D")
#: Words that would tell a student the paper or its key was wrong. Lessons never do that.
FORBIDDEN = re.compile(
    r"\b(printed key|the key|answer key|misprint|typo|JAMB (?:got|is|was)|examiner|"
    r"corrected|correction|the paper (?:prints|printed|says)|wrongly printed)\b",
    re.IGNORECASE,
)
MATH = re.compile(r"\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$")
PAPER_TYPE = re.compile(r"paper\s*type", re.IGNORECASE)


def subtopic_codes() -> set[str]:
    doc = yaml.safe_load((CHEM / "subtopics.yaml").read_text(encoding="utf-8"))
    return {code for topic in doc["topics"].values() for code in topic["subtopics"]}


def formulas(text: str) -> list[str]:
    return [m.group(1) or m.group(2) for m in MATH.finditer(text or "")]


def typeset_errors(expressions: list[tuple[str, str]]) -> list[str]:
    """Each (where, expression) KaTeX with mhchem refuses, rendered by the web app's own KaTeX."""
    if not expressions:
        return []
    script = r"""
const katex = require('katex');
require('katex/contrib/mhchem');
let data = '';
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  const bad = [];
  for (const [where, tex] of JSON.parse(data)) {
    try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); }
    catch (e) { bad.push(`${where}: $${tex}$ -> ${String(e.message).split('\n')[0]}`); }
  }
  process.stdout.write(JSON.stringify(bad));
});
"""
    result = subprocess.run(
        ["node", "-e", script],
        input=json.dumps(expressions),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT / "apps" / "web",
        check=False,
    )
    if result.returncode != 0:
        return [f"could not run KaTeX: {result.stderr.strip()[:300]}"]
    return json.loads(result.stdout)


#: What the voice must never meet in a spoken line (docs/lesson-style-guide.md §2).
SPOKEN_BREAKS = re.compile("[:;\u2014\u2013$\\\\]| - ")
LETTER_SAID = re.compile(r"\boption ([ABCD])\b")


def check_lessons(year: int, paper: dict, expressions: list[tuple[str, str]]) -> list[str]:
    """lessons_YYYY.yaml: one lesson per kept question, spoken lines the voice can say."""
    path = CHEM / f"lessons_{year}.yaml"
    if not path.exists():
        return [f"{year}: no {path.name}"]
    lessons = {
        int(k): v
        for k, v in (yaml.safe_load(path.read_text(encoding="utf-8")) or {})
        .get("lessons", {})
        .items()
    }
    problems: list[str] = []
    kept = {int(q["number"]): q for q in paper["questions"] if not q.get("drop")}
    for n, q in kept.items():
        where = f"{year} Q{n} lesson"
        lesson = lessons.get(n)
        if lesson is None:
            problems.append(f"{where}: missing")
            continue
        moments = lesson.get("moments") or []
        if not 6 <= len(moments) <= 16:
            problems.append(f"{where}: {len(moments)} moments (6-16 wanted)")
        answers = [m for m in moments if m.get("answer")]
        if len(answers) != 1:
            problems.append(f"{where}: {len(answers)} answer moments (one wanted)")
        else:
            said = LETTER_SAID.findall(answers[0].get("say") or "")
            if said != [q["answer"]]:
                problems.append(f"{where}: the answer moment must say 'option {q['answer']}'")
        for i, m in enumerate(moments, 1):
            say = m.get("say") or ""
            if not say.strip():
                problems.append(f"{where} moment {i}: empty say")
            if SPOKEN_BREAKS.search(say):
                problems.append(
                    f"{where} moment {i}: say has a symbol the voice stops on: {say[:80]!r}"
                )
            if FORBIDDEN.search(say):
                problems.append(f"{where} moment {i}: mentions the key or a correction")
            name = (m.get("doodle") or {}).get("name", "")
            if name.startswith("custom:") and not (CHEM / "doodles" / f"{name[7:]}.svg").exists():
                problems.append(f"{where} moment {i}: doodle {name} has no file")
            expressions += [(f"{where} moment {i}", f) for f in formulas(m.get("write") or "")]
        traps = lesson.get("traps") or {}
        wrong = {letter for letter in LETTERS if letter != q["answer"]}
        if set(traps) != wrong:
            problems.append(
                f"{where}: traps must cover exactly {sorted(wrong)}, has {sorted(traps)}"
            )
        for text in traps.values():
            if SPOKEN_BREAKS.search(str(text)) or FORBIDDEN.search(str(text)):
                problems.append(
                    f"{where}: a trap line the voice cannot say cleanly: {str(text)[:80]!r}"
                )
    for n in sorted(set(lessons) - set(kept)):
        problems.append(f"{year} Q{n} lesson: no such kept question")
    return problems


def check_year(year: int, codes: set[str], lessons_wanted: bool = False) -> list[str]:
    problems: list[str] = []
    paper_path = CHEM / f"retranscribed_{year}.yaml"
    notes_path = CHEM / f"explanations_{year}.yaml"
    if not paper_path.exists():
        return [f"{year}: no {paper_path.name}"]
    paper = yaml.safe_load(paper_path.read_text(encoding="utf-8"))
    explained = {}
    if notes_path.exists():
        explained = {
            int(k): v
            for k, v in (yaml.safe_load(notes_path.read_text(encoding="utf-8")) or {})
            .get("explanations", {})
            .items()
        }
    else:
        problems.append(f"{year}: no {notes_path.name}")

    if int(paper["source"]["exam_year"]) != year:
        problems.append(f"{year}: source.exam_year is {paper['source']['exam_year']}")
    seen: set[int] = set()
    expressions: list[tuple[str, str]] = []
    for q in paper["questions"]:
        n = int(q["number"])
        where = f"{year} Q{n}"
        if n in seen:
            problems.append(f"{where}: number used twice")
        seen.add(n)
        stem = q.get("stem") or ""
        if PAPER_TYPE.search(stem):
            problems.append(f"{where}: the paper-type question must be left out")
        if q.get("drop"):
            if not q.get("drop_reason"):
                problems.append(f"{where}: drop without drop_reason")
            continue
        options = q.get("options") or {}
        if tuple(options) != LETTERS:
            problems.append(f"{where}: options must be exactly A, B, C, D in order")
        if any(not str(v).strip() for v in options.values()):
            problems.append(f"{where}: an empty option")
        if len({str(v).strip() for v in options.values()}) != len(options):
            problems.append(f"{where}: two options are the same")
        answer = q.get("answer")
        if answer not in LETTERS:
            problems.append(f"{where}: answer {answer!r} is not A-D")
        if "printed_key" not in q:
            problems.append(f"{where}: printed_key missing (null when none was printed)")
        elif q["printed_key"] not in (*LETTERS, None):
            problems.append(f"{where}: printed_key {q['printed_key']!r}")
        elif q["printed_key"] != answer and not q.get("key_note"):
            problems.append(f"{where}: answer differs from printed_key without key_note")
        if q.get("subtopic") not in codes:
            problems.append(f"{where}: subtopic {q.get('subtopic')!r} not in subtopics.yaml")
        if q.get("level") not in (1, 2, 3, 4, 5) or not q.get("level_reason"):
            problems.append(f"{where}: level 1-5 with level_reason needed")
        if q.get("figure"):
            if not (CHEM / q["figure"]).exists():
                problems.append(f"{where}: figure {q['figure']} not found")
            if not q.get("figure_alt"):
                problems.append(f"{where}: figure without figure_alt")
        if q.get("figure_svg") and 'aria-label="' not in q["figure_svg"]:
            problems.append(f"{where}: figure_svg needs an aria-label")
        expressions += [(where, f) for f in formulas(stem)]
        for letter, text in options.items():
            expressions += [(f"{where} {letter}", f) for f in formulas(str(text))]

        note = explained.get(n)
        if note is None:
            problems.append(f"{where}: no explanation")
            continue
        if note.get("answer") != answer:
            problems.append(f"{where}: explanation answer {note.get('answer')} != {answer}")
        steps = note.get("steps") or []
        if not 3 <= len(steps) <= 8:
            problems.append(f"{where}: {len(steps)} steps (3-7 wanted)")
        if not note.get("hint"):
            problems.append(f"{where}: no hint")
        why = note.get("why") or {}
        wrong = {letter for letter in LETTERS if letter != answer}
        if set(why) != wrong:
            problems.append(f"{where}: why must cover exactly {sorted(wrong)}, has {sorted(why)}")
        taught = [*steps, note.get("hint") or "", *map(str, why.values())]
        for text in taught:
            if FORBIDDEN.search(text):
                problems.append(
                    f"{where}: tells the student about the key or a correction: {text[:90]!r}"
                )
            if "\u2014" in text or ("\u2013" in text and not re.search("\\d\u2013\\d", text)):
                problems.append(f"{where}: a dash in {text[:60]!r}; use a comma or full stop")
            expressions += [(f"{where} explanation", f) for f in formulas(text)]

    for n in sorted(set(explained) - seen):
        problems.append(f"{year} Q{n}: explanation with no question")
    if lessons_wanted:
        problems += check_lessons(year, paper, expressions)
    problems += typeset_errors(expressions)
    return problems


def main() -> None:
    codes = subtopic_codes()
    args = sys.argv[1:]
    lessons_wanted = "--lessons" in args
    years = [int(a) for a in args if a != "--lessons"] or sorted(
        int(p.stem.split("_")[1]) for p in CHEM.glob("retranscribed_*.yaml")
    )
    problems = [p for year in years for p in check_year(year, codes, lessons_wanted)]
    if problems:
        print("\n".join(problems))
        print(f"\n{len(problems)} problem(s)")
        sys.exit(1)
    print(f"OK: {', '.join(map(str, years))}")


if __name__ == "__main__":
    main()
