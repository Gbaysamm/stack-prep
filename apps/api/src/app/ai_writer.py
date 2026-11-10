"""The question writer's AI settings: which provider and model, the API key, prices and an
optional monthly spending cap (migration 040). Used by the reviewer's "Add with AI".

The key is stored sealed (app/secret_box.py) and never leaves the server: the dashboard only
ever sees its last four characters. Checking a key lists the provider's models, which costs
nothing. Spend is the sum of ai_writer_runs this calendar month (Africa/Lagos).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import secret_box
from app.db import fetch_all

Provider = Literal["anthropic", "openai"]


@dataclass(frozen=True)
class KnownModel:
    id: str
    label: str
    input_usd_per_million: float
    output_usd_per_million: float
    note: str


#: Anthropic's own price list (first-party API, November 2026). OpenAI's models are listed
#: from the key once it is checked, and their prices are entered by the admin.
ANTHROPIC_MODELS: tuple[KnownModel, ...] = (
    KnownModel(
        "claude-opus-5-5",
        "Claude Opus 5.5",
        4.0,
        20.0,
        "Recommended: careful solving and checking.",
    ),
    KnownModel("claude-sonnet-5-5", "Claude Sonnet 5.5", 2.0, 10.0, "Half the price of Opus."),
    KnownModel(
        "claude-haiku-5-5",
        "Claude Haiku 5.5",
        0.10,
        0.50,
        "Cheapest; for simple reading, not for solving.",
    ),
    KnownModel(
        "claude-fable-5-2", "Claude Fable 5.2", 8.0, 40.0, "Most capable, twice the price of Opus."
    ),
)


@dataclass
class WriterSettings:
    provider: Provider
    model: str
    api_key: str | None
    api_key_hint: str | None
    #: A key is stored but can no longer be opened (the database password changed).
    key_unreadable: bool
    input_usd_per_million: float
    output_usd_per_million: float
    monthly_cap_usd: float | None
    updated_at: Any
    updated_by_name: str | None


async def load(conn: AsyncConnection) -> WriterSettings:
    rows = await fetch_all(
        conn,
        """
        SELECT w.*, s.display_name AS updated_by_name
        FROM ai_writer_settings w LEFT JOIN students s ON s.id = w.updated_by
        """,
    )
    if not rows:
        first = ANTHROPIC_MODELS[0]
        return WriterSettings(
            "anthropic",
            first.id,
            None,
            None,
            False,
            first.input_usd_per_million,
            first.output_usd_per_million,
            None,
            None,
            None,
        )
    row = rows[0]
    key = secret_box.open_secret(row["api_key_encrypted"])
    return WriterSettings(
        provider=row["provider"],
        model=row["model"],
        api_key=key,
        api_key_hint=row["api_key_hint"],
        key_unreadable=bool(row["api_key_encrypted"]) and key is None,
        input_usd_per_million=float(row["input_usd_per_million"]),
        output_usd_per_million=float(row["output_usd_per_million"]),
        monthly_cap_usd=None if row["monthly_cap_usd"] is None else float(row["monthly_cap_usd"]),
        updated_at=row["updated_at"],
        updated_by_name=row["updated_by_name"],
    )


#: Keep the key as it is.
KEEP = object()


async def save(
    conn: AsyncConnection,
    *,
    provider: Provider,
    model: str,
    api_key: str | object | None,
    input_usd_per_million: float,
    output_usd_per_million: float,
    monthly_cap_usd: float | None,
    by: UUID,
) -> None:
    """Write the settings. `api_key`: KEEP leaves it, None removes it, a string replaces it."""
    sealed_sql = ""
    params: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "pin": Decimal(str(input_usd_per_million)),
        "pout": Decimal(str(output_usd_per_million)),
        "cap": None if monthly_cap_usd is None else Decimal(str(monthly_cap_usd)),
        "by": by,
    }
    if api_key is not KEEP:
        sealed_sql = (
            ", api_key_encrypted = excluded.api_key_encrypted, api_key_hint = excluded.api_key_hint"
        )
        if isinstance(api_key, str):
            params["sealed"], params["hint"] = secret_box.seal(api_key), api_key[-4:]
        else:
            params["sealed"] = params["hint"] = None
    else:
        params["sealed"] = params["hint"] = None
    await conn.execute(
        text(
            f"""
            INSERT INTO ai_writer_settings AS w (id, provider, model, api_key_encrypted,
              api_key_hint, input_usd_per_million, output_usd_per_million, monthly_cap_usd,
              updated_by, updated_at)
            VALUES (true, :provider, :model, :sealed, :hint, :pin, :pout, :cap, :by, now())
            ON CONFLICT (id) DO UPDATE SET provider = excluded.provider,
              model = excluded.model, input_usd_per_million = excluded.input_usd_per_million,
              output_usd_per_million = excluded.output_usd_per_million,
              monthly_cap_usd = excluded.monthly_cap_usd, updated_by = excluded.updated_by,
              updated_at = now(){sealed_sql}
            """
        ),
        params,
    )


async def spent_this_month(conn: AsyncConnection) -> tuple[float, int]:
    """US dollars spent and runs made since the 1st of this month, Lagos time."""
    row = (
        await fetch_all(
            conn,
            """
            SELECT coalesce(sum(cost_usd), 0) AS spent, count(*) AS runs
            FROM ai_writer_runs
            WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')
                                AT TIME ZONE 'Africa/Lagos'
            """,
        )
    )[0]
    return float(row["spent"]), int(row["runs"])


def cost_usd(settings: WriterSettings, input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens / 1e6 * settings.input_usd_per_million
        + output_tokens / 1e6 * settings.output_usd_per_million
    )


async def room_under_cap(conn: AsyncConnection, settings: WriterSettings) -> float | None:
    """US dollars left this month under the cap, or None when there is no cap."""
    if settings.monthly_cap_usd is None:
        return None
    spent, _ = await spent_this_month(conn)
    return max(settings.monthly_cap_usd - spent, 0.0)


@dataclass
class KeyCheck:
    ok: bool
    message: str
    models: list[str]


async def check_key(provider: Provider, api_key: str) -> KeyCheck:
    """Whether the key works, by listing the provider's models. Free: no tokens are used."""
    try:
        if provider == "anthropic":
            import anthropic

            async with anthropic.AsyncAnthropic(
                api_key=api_key, max_retries=0, timeout=20.0
            ) as client:
                page = await client.models.list(limit=100)
                ids = [model.id for model in page.data]
        else:
            import openai

            async with openai.AsyncOpenAI(api_key=api_key, max_retries=0, timeout=20.0) as oa:
                listed = await oa.models.list()
                ids = sorted(model.id for model in listed.data)
    except Exception as error:
        name = type(error).__name__
        if "Authentication" in name or "PermissionDenied" in name:
            return KeyCheck(False, "The provider refused this key. Check it was copied whole.", [])
        if "Connection" in name or "Timeout" in name:
            return KeyCheck(False, "We couldn't reach the provider. Try again in a moment.", [])
        return KeyCheck(False, f"The provider said no ({name}).", [])
    return KeyCheck(True, f"The key works: {len(ids)} models available.", ids)
