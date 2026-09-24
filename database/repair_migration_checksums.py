#!/usr/bin/env python3
"""Correct ledger checksums that were recorded while files were read as cp1252.

    uv run python database/repair_migration_checksums.py --apply

WHY THIS IS NEEDED. Every migration is recorded with a SHA-256 of its text, and
`apply_pending` refuses to run if a recorded checksum no longer matches the file --
"was edited after it was applied". That guard is right, and it fired for real.

The cause was not an edited migration. Before the repository read its files as UTF-8,
`read_text()` on Windows decoded them as cp1252, so a file containing a character such
as an ellipsis produced a different string and therefore a different hash. Those wrong
hashes were written into the ledger, and fixing the code did not retract them. Any
database created or restored from a Windows machine before that fix carries them, and
the next deploy is where it surfaces.

WHAT THIS WILL AND WILL NOT DO. It only rewrites a checksum where the recorded value is
exactly the cp1252 reading of the file that is on disk now. That equality is the proof
the content never changed -- the same bytes, decoded two ways. Anything it cannot
explain that way is reported and left alone, because a checksum that matches neither
reading may well be the edited migration the guard exists to catch, and that is a person's
decision, not a script's.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import sys
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "database" / "migrations"


def readings(path: Path) -> tuple[str, str | None]:
    """The file's hash as UTF-8, and as cp1252 if it decodes that way at all."""
    raw = path.read_bytes()

    def digest(text: str) -> str:
        return hashlib.sha256(text.replace("\r\n", "\n").encode()).hexdigest()

    correct = digest(raw.decode("utf-8"))
    try:
        fossil = digest(raw.decode("cp1252"))
    except UnicodeDecodeError:
        return correct, None
    return correct, fossil


async def run(dsn: str | None, apply: bool) -> int:
    conn = await asyncpg.connect(
        dsn=dsn,
        host=None if dsn else "127.0.0.1",
        port=None if dsn else 55439,
        database=None if dsn else "scorepilot",
    )
    try:
        recorded = {
            row["version"]: row["checksum"]
            for row in await conn.fetch("SELECT version, checksum FROM public.schema_migrations")
        }
        repairs: list[tuple[str, str]] = []
        unexplained: list[str] = []

        for path in sorted(MIGRATIONS.glob("*.sql")):
            was = recorded.get(path.stem)
            if was is None:
                continue
            correct, fossil = readings(path)
            if was == correct:
                continue
            if fossil is not None and was == fossil:
                repairs.append((path.stem, correct))
            else:
                unexplained.append(path.stem)

        for version, _ in repairs:
            print(f"  {version}: recorded as the cp1252 reading of the same file")
        for version in unexplained:
            print(f"  {version}: MATCHES NEITHER READING - left alone, look at it yourself")

        if not repairs and not unexplained:
            print("Every recorded checksum matches its file.")
            return 0

        if apply and repairs:
            async with conn.transaction():
                for version, correct in repairs:
                    await conn.execute(
                        "UPDATE public.schema_migrations SET checksum = $2 WHERE version = $1",
                        version,
                        correct,
                    )
            print(f"\n{len(repairs)} checksum(s) corrected.")
        elif repairs:
            print(f"\n{len(repairs)} would be corrected. Dry run; pass --apply.")

        # An unexplained checksum is the case this script exists to not paper over.
        return 1 if unexplained else 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    return asyncio.run(run(args.database_url, args.apply))


if __name__ == "__main__":
    sys.exit(main())
