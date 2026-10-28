"""Settings an admin changes from the dashboard, without a release (migration 036).

Each setting is declared here with its type, its default and a sentence about it; the table
holds only the ones an admin has changed. Reading a setting that was never changed gives its
default, so a new setting needs no migration.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True)
class Setting:
    key: str
    kind: str  # "bool", "text", "number"
    default: Any
    label: str
    help: str
    group: str


SETTINGS: tuple[Setting, ...] = (
    Setting("signups_open", "bool", True, "New accounts can sign up",
            "Switch off to stop new sign-ups for a while. Existing students can still sign in.",
            "Accounts"),
    Setting("coach_enabled", "bool", True, "The coach answers questions",
            "Switch off to pause the coach for everyone (it costs money per question). Students "
            "still get the written working.", "Learning"),
    Setting("notice", "text", "", "Notice for every student",
            "A short line shown at the top of the student app, for planned downtime and the like."
            " Empty shows nothing.", "Learning"),
    Setting("support_email", "text", "", "Support email",
            "Shown on the Help and Contact pages.", "Contact"),
    Setting("support_whatsapp", "text", "", "Support WhatsApp number",
            "Shown on the Help and Contact pages, e.g. +234 803 000 0000.", "Contact"),
    Setting("ai_input_usd_per_million", "number", 0.0, "Coach: US$ per million input tokens",
            "The model's price, for the cost estimate in AI usage.", "Costs"),
    Setting("ai_output_usd_per_million", "number", 0.0, "Coach: US$ per million output tokens",
            "The model's price, for the cost estimate in AI usage.", "Costs"),
    Setting("naira_per_usd", "number", 1600.0, "Naira to the US dollar",
            "For showing AI costs in naira.", "Costs"),
)
BY_KEY = {setting.key: setting for setting in SETTINGS}


def _coerce(setting: Setting, value: Any) -> Any:
    if setting.kind == "bool":
        if not isinstance(value, bool):
            raise ValueError(f"{setting.label}: on or off")
        return value
    if setting.kind == "number":
        if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
            raise ValueError(f"{setting.label}: a number, 0 or more")
        return float(value)
    if not isinstance(value, str) or len(value) > 300:
        raise ValueError(f"{setting.label}: text of at most 300 characters")
    return " ".join(value.split())


async def all_values(conn: AsyncConnection) -> dict[str, Any]:
    rows = (await conn.execute(text("SELECT key, value FROM app_settings"))).all()
    stored = {key: value for key, value in rows}
    return {s.key: stored.get(s.key, s.default) for s in SETTINGS}


async def get(conn: AsyncConnection, key: str) -> Any:
    setting = BY_KEY[key]
    value = (
        await conn.execute(text("SELECT value FROM app_settings WHERE key = :k"), {"k": key})
    ).scalar_one_or_none()
    return setting.default if value is None else value


async def change(
    conn: AsyncConnection, changes: dict[str, Any], by: UUID
) -> dict[str, tuple[Any, Any]]:
    """Store the changed settings; what changed, as (before, after). The caller commits.

    Raises ValueError for an unknown key or a value of the wrong kind.
    """
    before = await all_values(conn)
    changed: dict[str, tuple[Any, Any]] = {}
    for key, raw in changes.items():
        if key not in BY_KEY:
            raise ValueError(f"There is no setting called {key}.")
        value = _coerce(BY_KEY[key], raw)
        if value == before[key]:
            continue
        await conn.execute(
            text(
                """
                INSERT INTO app_settings (key, value, updated_by)
                VALUES (:k, CAST(:v AS jsonb), :by)
                ON CONFLICT (key) DO UPDATE
                  SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
                """
            ),
            {"k": key, "v": json.dumps(value), "by": by},
        )
        changed[key] = (before[key], value)
    return changed
