"""Turn the verified repairs into a migration, and file the rest for review.

Run:  uv run python analysis/stem-repair/write_migration.py

WHY THIS IS GENERATED RATHER THAN HAND-WRITTEN. `content_hash` is a sha256 over the
normalised stem and options, so a repair changes it and SQL cannot recompute it. The hashes
are worked out here and written into the migration as literals, which also makes the file
reviewable: every change is visible, guarded by the text it expects to replace, and applies
once.

WHY APPROVED QUESTIONS ARE NOT TOUCHED. `question_version_guard` raises "approved question
content is immutable; create a new version", and it is right to. A repair to an approved
question is a new version and a re-review, which is a person's job and not a migration's. So
those are filed as `question_reports` — the table the review queue already reads, with
`reporter_kind = 'system'` and the proposed repair in `detail`.
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import re
import unicodedata
from pathlib import Path

import asyncpg

HERE = Path(__file__).parent
MIGRATION = HERE.parents[1] / "database" / "migrations" / "020_restore_the_degree_sign.sql"

spec = importlib.util.spec_from_file_location("find_damage", HERE / "find_damage.py")
assert spec and spec.loader
damage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(damage)


def normalise(text: str) -> str:
    """Exactly what `database/load_questions.py` does before hashing."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def content_hash(stem: str, options: dict[str, str]) -> str:
    payload = (
        normalise(stem)
        + "|"
        + "|".join(f"{key}:{normalise(options[key])}" for key in sorted(options))
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def sql(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def repairs_for(item: dict) -> tuple[str, dict[str, str]]:
    """The repaired stem, and the repaired option bodies keyed by option letter.

    Only `verified` repairs are applied: either the reviewed working independently uses the
    number without its trailing zero, or the same question kept a degree sign on some options
    and lost it on others. Anything merely `inferred` is left alone.
    """
    stem = item["stem"]
    for repair in damage.degree_repairs(item):
        if repair["confidence"] == "verified":
            # Bounded by word edges so that repairing 120 does not also touch 1200.
            stem = re.sub(rf"(?<!\d){re.escape(repair['found'])}(?!\d)", repair["should_be"], stem)

    options = {}
    for repair in damage.option_repairs(item):
        if repair["confidence"] == "verified":
            options[repair["key"]] = repair["should_be"]
    return stem, options


async def already_applied(db: asyncpg.Connection) -> bool:
    """Has this migration already run against this database?

    ONCE IT HAS, IT MUST NOT BE REGENERATED. The repairs it makes are exactly what this script
    looks for, so after it runs there is nothing left to find: regenerating produces a
    migration that repairs none of the draft questions. That file would differ from the one
    recorded in `schema_migrations`, the runner would report the checksum mismatch, and a
    fresh database built from it would never get the repairs at all. Running this once, as a
    check, did exactly that before this guard existed.
    """
    try:
        return bool(
            await db.fetchval(
                "SELECT 1 FROM public.schema_migrations WHERE version = $1",
                MIGRATION.stem,
            )
        )
    except asyncpg.UndefinedTableError:
        return False


async def main() -> None:
    items = await damage.load()
    db = await asyncpg.connect(damage.DSN)
    if await already_applied(db):
        await db.close()
        raise SystemExit(
            f"{MIGRATION.name} has already been applied to this database, so regenerating it "
            "would produce a different file with none of the repairs in it. Leave it as it is. "
            "A new repair belongs in a new, higher-numbered migration."
        )
    status = {
        row["id"]: row["review_status"]
        for row in await db.fetch(
            "SELECT id::text AS id, review_status FROM stackprep.question_versions"
        )
    }
    await db.close()

    fixable, to_review = [], []
    for item in items:
        found = damage.classify(item)
        if not found or found[0] not in ("degree", "options"):
            continue
        stem, options = repairs_for(item)
        if stem == item["stem"] and not options:
            continue
        entry = (item, stem, options)
        (fixable if status.get(item["vid"]) == "draft" else to_review).append(entry)

    lines = [
        "-- Restore the degree sign the PDF import turned into a zero.",
        "--",
        '-- A student was shown a pie chart question whose sector had "angle 120" and four',
        "-- options, none of which was the answer: 120/360 of 150 is 50. The reviewed working",
        "-- said (12/360)(150) = 5, which is option D. The angle was twelve degrees, and the",
        "-- degree sign had become a zero. It happened across the import — bearings written",
        '-- "N720E", latitudes "600S", options reading "660 | 1100 | 260" for 66, 110 and 26',
        "-- degrees. One option in the whole bank still carries a degree sign.",
        "--",
        "-- Only repairs with independent corroboration are applied here: the reviewed working",
        "-- uses the number without its trailing zero, or the same question kept the sign on",
        "-- some options and lost it on others. Everything merely plausible is left alone.",
        "--",
        "-- Each change is guarded by the text it expects to find, so this applies once and",
        "-- does nothing to a row that has since been corrected or edited by hand — and",
        "-- nothing at all to a database built from the migrations alone, which has no",
        "-- questions in it yet.",
        "--",
        "-- Generated by analysis/stem-repair/write_migration.py. Do not edit, and once it has",
        "-- been applied do not regenerate it either: its repairs are what the generator looks",
        "-- for, so a second run finds nothing and writes a migration that repairs nothing.",
        "",
        "BEGIN;",
        "SET LOCAL search_path = stackprep, public;",
        "",
        f"-- {len(fixable)} draft questions, repaired in place.",
        "",
    ]

    for item, stem, options in fixable:
        vid = item["vid"]
        bodies = {str(o["key"]): str(o["body"]) for o in item["options"]}
        bodies.update(options)
        digest = content_hash(stem, bodies)
        lines.append(f"-- {vid}  {normalise(item['stem'])[:72]}")
        if stem != item["stem"]:
            lines += [
                "UPDATE question_versions",
                f"   SET stem = {sql(stem)}",
                f" WHERE id = {sql(vid)}::uuid AND stem = {sql(item['stem'])};",
            ]
        for key, body in sorted(options.items()):
            was = next(str(o["body"]) for o in item["options"] if str(o["key"]) == key)
            lines += [
                "UPDATE question_options",
                f"   SET body = {sql(body)}",
                f" WHERE question_version_id = {sql(vid)}::uuid"
                f" AND option_key = {sql(key)} AND body = {sql(was)};",
            ]
        lines += [
            "-- sha256 over the repaired stem and options, the way the loader computes it.",
            "UPDATE question_versions",
            f"   SET content_hash = {sql(digest)}",
            f" WHERE id = {sql(vid)}::uuid AND stem = {sql(stem)};",
            "",
        ]

    lines += [
        "",
        f"-- {len(to_review)} approved questions. Their content is frozen and a repair is a new",
        "-- version, which is a reviewer's decision rather than a migration's. Each is filed",
        "-- where the review queue will find it, with the proposed repair written out.",
        "",
    ]
    for item, stem, options in to_review:
        vid = item["vid"]
        proposed = [f"stem -> {normalise(stem)[:160]}"] if stem != item["stem"] else []
        proposed += [f"option {key} -> {body}" for key, body in sorted(options.items())]
        detail = (
            "The PDF import turned a degree sign into a zero. Corroborated by the reviewed "
            "working, which uses the number without its trailing zero. Proposed: "
            + "; ".join(proposed)
        )
        lines += [
            f"-- {vid}  {normalise(item['stem'])[:72]}",
            "INSERT INTO question_reports (question_version_id, reporter_kind, reason, detail)",
            f"SELECT {sql(vid)}::uuid, 'system', 'typo', {sql(detail)}",
            # A migration has to apply to an empty database as well as a full one, and on an
            # empty one this question does not exist yet: without this the foreign key fires
            # and every test that builds a database from the migrations fails.
            f" WHERE EXISTS (SELECT 1 FROM question_versions WHERE id = {sql(vid)}::uuid)",
            "   AND NOT EXISTS (SELECT 1 FROM question_reports",
            f"                    WHERE question_version_id = {sql(vid)}::uuid",
            "                      AND reporter_kind = 'system' AND reason = 'typo');",
            "",
        ]

    lines += [
        "",
        "-- Say plainly what this did, so a run that quietly matched nothing is visible.",
        "DO $$",
        "DECLARE repaired integer; filed integer;",
        "BEGIN",
        "  SELECT count(*) INTO repaired FROM question_versions WHERE stem LIKE '%°%';",
        "  SELECT count(*) INTO filed FROM question_reports",
        "   WHERE reporter_kind = 'system' AND reason = 'typo';",
        "  RAISE NOTICE 'stems carrying a degree sign: %; questions filed for review: %',",
        "    repaired, filed;",
        "END $$;",
        "",
        "COMMIT;",
        "",
    ]

    MIGRATION.write_text("\n".join(lines))
    print(f"wrote {MIGRATION}")
    print(f"  repaired in place (draft)   {len(fixable)}")
    print(f"  filed for review (approved) {len(to_review)}")


if __name__ == "__main__":
    asyncio.run(main())
