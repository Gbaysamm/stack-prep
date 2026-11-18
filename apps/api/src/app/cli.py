"""Command line entry points.

uv run python -m app.cli migrate     apply pending SQL migrations
uv run python -m app.cli baseline    record existing migrations as applied
uv run python -m app.cli openapi     print the OpenAPI schema
uv run python -m app.cli voice-lessons  make the audio for written lessons not yet voiced
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.migrations import apply_pending, baseline


def _migrate() -> int:
    applied = asyncio.run(apply_pending())
    if not applied:
        print("Schema is up to date.")
    else:
        for version in applied:
            print(f"Applied {version}")
    return 0


def _baseline() -> int:
    recorded = asyncio.run(baseline())
    if not recorded:
        print("Every migration was already recorded.")
    else:
        for version in recorded:
            print(f"Recorded {version} as applied (not run)")
        print("Verify the schema matches these files before trusting the ledger.")
    return 0


def _voice_lessons() -> int:
    """Make the audio for every written lesson that does not have it yet.

    Not run by a release: lesson audio is made one question at a time, when a student first
    needs it (see `warm_lesson`). This is for voicing a chosen set by hand, knowing it sends
    every missing line to the speech service. A line already made is skipped.
    """
    from sqlalchemy import text

    from app import voice_store
    from app.config import get_settings
    from app.db import get_engine

    async def run() -> int:
        settings = get_settings()
        if not settings.ai_speak or not settings.openai_api_key:
            print("No voice configured here; nothing made.")
            return 0
        async with get_engine().connect() as conn:
            rows = (
                (
                    await conn.execute(
                        text(
                            """
                            SELECT l.moments, l.traps FROM question_lessons l
                            JOIN questions q ON q.current_version_id = l.question_version_id
                            """
                        )
                    )
                )
                .mappings()
                .all()
            )
        lines: list[str] = []
        for row in rows:
            moments, traps = row["moments"], row["traps"]
            moments = moments if isinstance(moments, list) else json.loads(moments)
            traps = traps if isinstance(traps, dict) else json.loads(traps)
            lines += [str(moment["say"]) for moment in moments]
            lines += [str(said) for said in traps.values()]
        unique = list(dict.fromkeys(lines))
        missing = [line for line in unique if not voice_store.path_for(line, settings).is_file()]
        print(f"{len(unique)} lines across {len(rows)} lessons; {len(missing)} to make.")
        made, failed = await voice_store.voice_all(missing, settings, patient=True)
        print(f"Made {made}; {failed} could not be voiced.")
        return 0

    return asyncio.run(run())


def _openapi() -> int:
    from app.main import app

    json.dump(app.openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def _notify() -> int:
    """Run the hourly notifications job once now (the worker runs it every hour)."""
    from app import notification_email, notifications
    from app.db import get_engine

    async def run() -> int:
        async with get_engine().connect() as conn:
            added = await notifications.run_hourly(conn)
            added += await notification_email.weekly_reports(conn)
            sent = await notification_email.send_due(conn)
        print(f"{added} notifications added, {sent} emailed.")
        return 0

    return asyncio.run(run())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    commands = {
        "migrate": _migrate,
        "baseline": _baseline,
        "openapi": _openapi,
        "voice-lessons": _voice_lessons,
        "notify": _notify,
    }
    parser.add_argument("command", choices=list(commands))
    args = parser.parse_args(argv)
    return commands[args.command]()


if __name__ == "__main__":
    raise SystemExit(main())
