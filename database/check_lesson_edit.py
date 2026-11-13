#!/usr/bin/env python3
"""Check a language edit of one question-bank lessons file against what is committed.

    python database/check_lesson_edit.py docs/questions/utme/<subject>/lessons_<year>.yaml

A language pass may change only words: each moment's `say` and `write`, and the `traps`
lines. This says so when anything else moved (a lesson, a moment, a doodle, a mark, an
answer flag), when a moment's cue word is no longer in what it says (lesson_cues), and when
a mark's `at` text is no longer in the line it points at. Only problems the edit made are
reported: a mark that already missed before the edit is not the editor's.

Prints "ok" and the number of changed lines, or each problem with its address; exits 1 on
a problem.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "database"))

from lesson_cues import split_cues  # noqa: E402

TEXT = ("say", "write")


def committed(path: Path) -> dict[str, Any]:
    rel = path.resolve().relative_to(ROOT).as_posix()
    shown = subprocess.run(
        ["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode("utf-8")
    return yaml.safe_load(shown)


def without_text(moment: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in moment.items() if key not in TEXT}


def marks(value: Any) -> list[tuple[int, str]]:
    """Every (line, at) a moment's marks point at, however deep."""
    found: list[tuple[int, str]] = []
    if isinstance(value, dict):
        if isinstance(value.get("line"), int) and isinstance(value.get("at"), str):
            found.append((value["line"], value["at"]))
        for inner in value.values():
            found.extend(marks(inner))
    elif isinstance(value, list):
        for inner in value:
            found.extend(marks(inner))
    return found


def missed_marks(moments: list[dict[str, Any]]) -> set[tuple[int, int, str]]:
    missed: set[tuple[int, int, str]] = set()
    for index, moment in enumerate(moments):
        for line, at in marks(moment.get("point")):
            target = moments[line] if 0 <= line < len(moments) else {}
            text = f"{target.get('write') or ''}\n{target.get('say') or ''}"
            if at not in text:
                missed.add((index, line, at))
    return missed


def cue_problems(moments: list[dict[str, Any]], where: str) -> dict[int, str]:
    problems: dict[int, str] = {}
    for index, moment in enumerate(moments):
        try:
            split_cues(moment, f"{where} moment {index}")
        except SystemExit as stopped:
            problems[index] = str(stopped)
    return problems


#: `--teaching`: a teaching pass may also split a moment into several and add moments that
#: only say and write; every action (doodle, diagram, mark, sketch, answer flag) stays, in its
#: order, and every cue and mark still lands. Mark line numbers may move with the moments.
TEACHING = "--teaching" in sys.argv


def _no_lines(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _no_lines(v) for k, v in value.items() if k != "line"}
    if isinstance(value, list):
        return [_no_lines(v) for v in value]
    return value


def actions(moments: list[dict[str, Any]]) -> list[Any]:
    """Each moment's actions (all but its words and section), marks without line numbers, in
    order; moments that only say and write are left out."""
    found = []
    for moment in moments:
        acts = {k: v for k, v in moment.items() if k not in (*TEXT, "section")}
        if acts:
            found.append(_no_lines(acts))
    return found


def teaching_problems(
    where: str, old: list[dict[str, Any]], new: list[dict[str, Any]]
) -> list[str]:
    problems: list[str] = []
    if actions(old) != actions(new):
        problems.append(
            f"{where}: an action changed, moved out of order, or was lost (only say, write "
            "and section may change; a split moment keeps its actions on the part that says "
            "their cue word)"
        )
    for index, moment in enumerate(new):
        if not isinstance(moment.get("say"), str) or not moment["say"].strip():
            problems.append(f"{where} moment {index}: every moment needs something said")
    old_cues, new_cues = cue_problems(old, where), cue_problems(new, where)
    if len(new_cues) > len(old_cues):
        problems.extend(f"{p} (the cue word must be in the say)" for p in new_cues.values())
    old_missed = sorted(at for _, _, at in missed_marks(old))
    new_missed = missed_marks(new)
    if len(new_missed) > len(old_missed):
        problems.extend(
            f"{where} moment {index}: its mark's at {at!r} is not in moment {line} "
            "(renumber line: when moments are added)"
            for index, line, at in sorted(new_missed)
            if at not in old_missed
        )
    return problems


def check(path: Path) -> tuple[list[str], int]:
    before = committed(path)
    after = yaml.safe_load(path.read_text(encoding="utf-8"))
    problems: list[str] = []
    changed = 0
    if {k: v for k, v in before.items() if k != "lessons"} != {
        k: v for k, v in after.items() if k != "lessons"
    }:
        problems.append("the file's header changed")
    old_lessons, new_lessons = before.get("lessons") or {}, after.get("lessons") or {}
    if set(old_lessons) != set(new_lessons):
        problems.append("lessons were added or removed")
    for number in old_lessons:
        if number not in new_lessons:
            continue
        where = f"{path.name} Q{number}"
        old, new = old_lessons[number], new_lessons[number]
        if {k for k in old if k not in ("moments", "traps")} != {
            k for k in new if k not in ("moments", "traps")
        } or any(old[k] != new.get(k) for k in old if k not in ("moments", "traps")):
            problems.append(f"{where}: something other than moments and traps changed")
        old_moments, new_moments = old.get("moments") or [], new.get("moments") or []
        if TEACHING:
            problems.extend(teaching_problems(where, old_moments, new_moments))
            changed += abs(len(new_moments) - len(old_moments)) + sum(
                a != b for a, b in zip(old_moments, new_moments, strict=False)
            )
        elif len(old_moments) != len(new_moments):
            problems.append(f"{where}: moments were added or removed")
            continue
        for index, (a, b) in enumerate(zip(old_moments, new_moments, strict=True)):
            if without_text(a) != without_text(b):
                problems.append(f"{where} moment {index}: changed beyond say and write")
            if set(a) & set(TEXT) != set(b) & set(TEXT):
                problems.append(f"{where} moment {index}: a say or write was added or removed")
            for key in TEXT:
                value = b.get(key)
                if key in b and (not isinstance(value, str) or not value.strip()):
                    problems.append(f"{where} moment {index}: an empty {key}")
                if a.get(key) != b.get(key):
                    changed += 1
        old_traps, new_traps = old.get("traps") or {}, new.get("traps") or {}
        if set(old_traps) != set(new_traps):
            problems.append(f"{where}: trap letters changed")
        changed += sum(old_traps.get(k) != new_traps.get(k) for k in new_traps)
        if any(not str(v).strip() for v in new_traps.values()):
            problems.append(f"{where}: an empty trap")
        if TEACHING:
            continue
        before_cues = cue_problems(old_moments, where)
        for index, problem in cue_problems(new_moments, where).items():
            if index not in before_cues:
                problems.append(f"{problem} (the cue word must stay in the say)")
        for index, line, at in sorted(missed_marks(new_moments) - missed_marks(old_moments)):
            problems.append(
                f"{where} moment {index}: its mark's at {at!r} is no longer in moment {line}"
            )
    return problems, changed


def main() -> int:
    failed = False
    for name in [a for a in sys.argv[1:] if not a.startswith("--")]:
        problems, changed = check(Path(name))
        if problems:
            failed = True
            print(f"{name}: {len(problems)} problem(s)")
            for problem in problems:
                print(f"  {problem}")
        else:
            print(f"{name}: ok, {changed} line(s) changed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
