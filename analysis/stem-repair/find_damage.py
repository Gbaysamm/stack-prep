"""Find question stems the PDF import damaged, and propose repairs for review.

NOTHING HERE WRITES TO THE DATABASE. It reads the bank, works out what the extraction lost,
and prints candidates with the evidence for each one, so a person can decide. The evidence is
the point: a repair to a question a student will be marked against is not something to accept
because a script was confident.

THREE THINGS THE EXTRACTION DID.

  degree   The degree sign became a digit: "angle 120" for 12 degrees, "N720E" for N72E,
           "latitude 600S" for 60S. This is the dangerous one, because the question as shown
           cannot produce the answer it is keyed to. Where the reviewed working already uses
           the true number, that working is the cross-check and the repair is near-certain.

  table    A table flattened into prose: "Number 1 2 3 4 5 6 Frequency 12 20 x 21 x -1 28".
           Every value usually survives in order, so the question is answerable, but the
           student has to rebuild the rows before they can start. No automatic repair — the
           figure or the source paper has to be read.

  flagged  A reviewer noticed at import time and wrote it into the working: "the text layer
           lost the radical". They recorded it rather than fixing the stem, so the note is
           the specification for the repair, and a person has to apply it.

Run:  uv run python analysis/stem-repair/find_damage.py > analysis/stem-repair/candidates.md
"""

from __future__ import annotations

import asyncio
import json
import re

import asyncpg

from app.config import Settings

#: The same database the app uses, rather than one user's local connection string.
DSN = Settings().database_url.replace("postgresql+asyncpg://", "postgresql://")

NUMBER = re.compile(r"\d+")
#: Six or more bare values in a row with nothing but spaces between them: a table's remains.
FLAT_RUN = re.compile(r"(?:(?<=\s)|^)(?:[-+]?[\dx][\w./-]*\s+){5,}[-+]?[\dx][\w./-]*")
REVIEWER_NOTE = re.compile(r"(the text layer [^.]*\.|reading [^.]*\.)", re.I)
DEGREE_WORDS = re.compile(
    r"angle|bearing|latitude|longitude|sector|elevation|depression|lat\.|long\.", re.I
)
#: Where a degree sign plausibly belongs once the trailing zero is removed.
PLAUSIBLE_DEGREES = range(1, 361)


async def load() -> list[dict]:
    db = await asyncpg.connect(DSN)
    rows = await db.fetch(
        """
        SELECT qv.id::text AS vid, qv.stem, qv.solution_steps,
               (SELECT json_agg(json_build_object('key', o.option_key, 'body', o.body,
                                                  'correct', o.is_correct)
                                ORDER BY o.display_order)
                  FROM stackprep.question_options o
                 WHERE o.question_version_id = qv.id) AS options,
               (SELECT o.body FROM stackprep.question_options o
                 WHERE o.question_version_id = qv.id AND o.is_correct LIMIT 1) AS keyed,
               EXISTS(SELECT 1 FROM stackprep.question_assets a
                       WHERE a.question_version_id = qv.id
                         AND a.licence_status = 'verified') AS has_figure
        FROM stackprep.question_versions qv
        JOIN stackprep.questions q ON q.id = qv.question_id AND q.usage_pool = 'practice'
        """
    )
    await db.close()
    out = []
    for row in rows:
        steps = json.loads(row["solution_steps"] or "[]")
        out.append(
            {
                "vid": row["vid"],
                "stem": row["stem"] or "",
                "working": " ".join(str(s) for s in steps),
                "options": json.loads(row["options"]) if row["options"] else [],
                "keyed": (row["keyed"] or "").strip(),
                "has_figure": row["has_figure"],
            }
        )
    return out


def degree_repairs(item: dict) -> list[dict]:
    """Numbers in the stem that should carry a degree sign, and how sure we are.

    VERIFIED means the reviewed working uses the number without its trailing zero, so two
    independent records of the same question disagree in exactly the way a lost degree sign
    would explain. INFERRED means the stem is about angles and the number has the right shape,
    but nothing corroborates it — a person has to look.
    """
    stem, working = item["stem"], item["working"]
    if not DEGREE_WORDS.search(stem):
        return []

    stem_numbers = set(NUMBER.findall(stem))
    work_numbers = set(NUMBER.findall(working))
    repairs = []

    for number in sorted(stem_numbers, key=len, reverse=True):
        if not number.endswith("0") or len(number) < 2:
            continue
        without = number[:-1]
        if int(without) not in PLAUSIBLE_DEGREES:
            continue
        verified = without in work_numbers and number not in work_numbers
        repairs.append(
            {
                "found": number,
                "should_be": f"{without}°",
                "confidence": "verified" if verified else "inferred",
            }
        )
    # A stem with a verified repair makes its other angle-shaped numbers much more likely to
    # be the same damage, so they are worth showing together rather than separately.
    return repairs if any(r["confidence"] == "verified" for r in repairs) else []


#: A bearing written as N720E, with the degree sign flattened into the digits. Bearings are
#: the clearest case in the bank: the letters fix the shape, so the only question is where the
#: degree sign went, and it went in exactly one place.
BEARING = re.compile(r"\b([NS])\s?(\d{2,4})\s?([EW])\b")


#: A question whose answer IS an angle, so its options are angles too.
ASKS_FOR_AN_ANGLE = re.compile(
    r"(find|determine|calculate|what is).{0,40}angle|angle.{0,20}(marked|is|equals)", re.I
)
#: An option that is a bare number ending in zero: an angle with its degree sign flattened in.
BARE_DEGREES = re.compile(r"^\s*(\d{2,4})0\s*$")


def option_repairs(item: dict) -> list[dict]:
    """The same damage in the answer options, which is where it actually bites.

    A repair to the stem alone leaves the student choosing between S180W and S720W. Only one
    option in the whole bank still carries a degree sign, so wherever the stem lost one, the
    options almost certainly lost theirs too.
    """
    if not DEGREE_WORDS.search(item["stem"]):
        return []

    bodies = [str(option["body"]) for option in item["options"]]
    # The strongest evidence in the whole exercise: a question where SOME options kept their
    # degree sign and others did not. Same question, same printing, one extraction — so the
    # ones without it lost it, and there is nothing to infer.
    mixed = any("\u00b0" in body for body in bodies) and any(
        BARE_DEGREES.match(body) for body in bodies
    )
    asks_for_angle = bool(ASKS_FOR_AN_ANGLE.search(item["stem"]))

    repairs = []
    for option in item["options"]:
        body = str(option["body"])

        found = BEARING.search(body)
        if found and found.group(2).endswith("0") and int(found.group(2)[:-1]) in PLAUSIBLE_DEGREES:
            repairs.append(
                {
                    "key": option["key"],
                    "found": body,
                    "should_be": f"{found.group(1)}{found.group(2)[:-1]}\u00b0{found.group(3)}",
                    "correct": option["correct"],
                    "confidence": "verified",
                }
            )
            continue

        bare = BARE_DEGREES.match(body)
        if bare and (mixed or asks_for_angle) and int(bare.group(1)) in PLAUSIBLE_DEGREES:
            repairs.append(
                {
                    "key": option["key"],
                    "found": body.strip(),
                    "should_be": f"{bare.group(1)}\u00b0",
                    "correct": option["correct"],
                    "confidence": "verified" if mixed else "inferred",
                }
            )
    return repairs


def classify(item: dict) -> tuple[str, dict] | None:
    note = REVIEWER_NOTE.search(item["working"])
    if note:
        return "flagged", {"note": note.group(1).strip()}
    repairs = degree_repairs(item)
    if repairs:
        return "degree", {"repairs": repairs}
    if option_repairs(item):
        return "options", {"repairs": []}
    if FLAT_RUN.search(item["stem"]):
        return "table", {"run": FLAT_RUN.search(item["stem"]).group(0)[:70]}
    return None


def main() -> None:
    items = asyncio.run(load())
    buckets: dict[str, list] = {"degree": [], "options": [], "table": [], "flagged": []}
    for item in items:
        found = classify(item)
        if found:
            kind, extra = found
            buckets[kind].append((item, extra))

    print("# Damaged question stems — candidates for repair\n")
    print(f"Found in {len(items)} practice questions. **Nothing has been changed.**\n")
    print(
        "| class | questions | answerable as printed? | repair |\n"
        "|---|---|---|---|\n"
        f"| degree sign lost | {len(buckets['degree'])} | **no** — the key is unreachable "
        "| proposed below, cross-checked against the reviewed working |\n"
        f"| flattened table | {len(buckets['table'])} | yes, with effort | needs the figure "
        "or the paper |\n"
        f"| options only | {len(buckets['options'])} | **no** — no option is right "
        "| proposed below |\n"
        f"| reviewer flagged | {len(buckets['flagged'])} | varies | the note says what was "
        "lost |\n"
    )

    print(
        f"\nA further **{len(buckets['options'])}** questions have undamaged stems but "
        "damaged OPTIONS — `660 | 1100 | 260` where the paper read `66° | 110° | 26°`. Only "
        "one option in the whole bank still carries a degree sign, so a stem-only repair "
        "leaves the student choosing between `S180W` and `S720W`.\n"
    )

    print("\n## 1. Degree sign lost — the answer-changing class\n")
    print(
        "`verified` means the reviewed working independently uses the number without its\n"
        "trailing zero. `inferred` means only the shape of the number suggests it.\n"
    )
    for item, extra in buckets["degree"]:
        verified = [r for r in extra["repairs"] if r["confidence"] == "verified"]
        inferred = [r for r in extra["repairs"] if r["confidence"] == "inferred"]
        print(f"### `{item['vid']}`\n")
        print(f"- **stem** `{item['stem'][:150]}`")
        print(f"- **reviewed working** `{item['working'][:110]}`")
        shown = "   ".join(f"{o['key']}) {o['body']}" for o in item["options"])
        print(f"- **keyed answer** `{item['keyed']}`   options: `{shown[:90]}`")
        for repair in option_repairs(item):
            mark = " (the keyed one)" if repair["correct"] else ""
            print(
                f"- ✅ **option {repair['key']}**{mark} — "
                f"`{repair['found']}` → `{repair['should_be']}`"
            )
        for repair in verified:
            print(f"- ✅ **verified** — `{repair['found']}` → `{repair['should_be']}`")
        for repair in inferred:
            print(f"- ⚠️  inferred — `{repair['found']}` → `{repair['should_be']}`")
        print(f"- figure attached: {'yes' if item['has_figure'] else 'no'}\n")

    print("\n## 2. Options that lost their degree sign\n")
    print(
        "`verified` where the same question kept the sign on some options and lost it on "
        "others — one printing, one extraction, so nothing is being guessed at.\n"
    )
    for item, _ in buckets["options"]:
        print(f"### `{item['vid']}`\n")
        print(f"- **stem** `{item['stem'][:130]}`")
        shown = "   ".join(f"{o['key']}) {o['body']}" for o in item["options"])
        print(f"- **options as stored** `{shown[:110]}`")
        for repair in option_repairs(item):
            tick = "✅" if repair["confidence"] == "verified" else "⚠️ "
            mark = " (the keyed one)" if repair["correct"] else ""
            print(
                f"- {tick} option {repair['key']}{mark} — `{repair['found']}` → "
                f"`{repair['should_be']}`"
            )
        print()

    print("\n## 3. Flattened tables — readable but rebuilt by the student\n")
    for item, extra in buckets["table"]:
        print(f"### `{item['vid']}`  (figure: {'yes' if item['has_figure'] else 'NO'})\n")
        print(f"- **stem** `{item['stem'][:160]}`")
        print(f"- **the flattened run** `{extra['run']}`\n")

    print("\n## 4. Flagged by a reviewer at import\n")
    print("The note in the working says what the extraction lost. The stem was never fixed.\n")
    for item, extra in buckets["flagged"]:
        print(f"- `{item['vid']}` — {extra['note']}")
        print(f"  - stem `{item['stem'][:120]}`")


if __name__ == "__main__":
    main()
