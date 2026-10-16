"""The diagrams printed with a question, as a student is shown them.

A figure is a question_assets row pointing at a file in our own store. Two things read it:
the student's screen, which loads it by URL from the endpoint here, and the coach, which is
sent the picture itself (see routers/practice.py). Both take only what a person has cleared —
a verified licence — and only formats a browser shows as an image.

WHY A URL AND NOT THE MARKUP. The redrawn Mathematics figures are SVG, and SVG put into a page
is live markup. Loaded through <img> it is only ever a picture: no script runs, nothing it
links to is fetched. That holds even for a file nobody has read closely, which is the property
worth having for something served to children.

OPTION PICTURES. Some questions answer in drawings: four transistor symbols, four graphs. Each
drawn option is its own asset row with `option_key` set to its letter, and its option's text is
only a neutral label ("Symbol A"). Those rows are never the question's figure: every query for
the question's own diagrams keeps to `option_key IS NULL`, and the option
pictures travel on their options instead (`option_figures_for`).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import get_settings
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/figures", tags=["figures"])

#: What a student's browser is given as a picture.
DISPLAYABLE = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"}

#: The repository root, for an API running from a checkout.
_REPO_ROOT = Path(__file__).resolve().parents[4]


class QuestionFigure(BaseModel):
    url: str
    alt_text: str | None
    width: int | None
    height: int | None


class OptionFigure(BaseModel):
    """The drawing that is one option's answer, shown inside that option."""

    id: UUID
    url: str
    alt_text: str | None
    width: int | None
    height: int | None


def option_figure(row: Mapping[str, Any], *, url_prefix: str = "/v1/figures") -> OptionFigure:
    return OptionFigure(
        id=row["id"],
        url=f"{url_prefix}/{row['id']}",
        alt_text=row["alt_text"],
        width=row["width"],
        height=row["height"],
    )


@lru_cache
def asset_root() -> Path:
    configured = get_settings().asset_root.strip()
    return Path(configured).resolve() if configured else _REPO_ROOT


def resolve(storage_uri: str) -> Path | None:
    """The file an asset row points at, or None if it is missing or outside the store.

    Checked to still be under the root after resolving, so a stored path cannot walk out of
    the asset tree and read something else off the box.
    """
    root = asset_root()
    path = (root / storage_uri).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return None
    return path


async def figures_for(conn: AsyncConnection, version_id: UUID) -> list[QuestionFigure]:
    """The cleared figures on one question version, in print order."""
    rows = await fetch_all(
        conn,
        """
        SELECT id, mime_type, alt_text, width, height
        FROM question_assets
        WHERE question_version_id = :version AND licence_status = 'verified'
          AND option_key IS NULL
        ORDER BY display_order, id
        """,
        version=version_id,
    )
    return [
        QuestionFigure(
            url=f"/v1/figures/{row['id']}",
            alt_text=row["alt_text"],
            width=row["width"],
            height=row["height"],
        )
        for row in rows
        if row["mime_type"] in DISPLAYABLE
    ]


async def option_figures_for(
    conn: AsyncConnection,
    version_ids: Iterable[UUID],
    *,
    cleared_only: bool = True,
    url_prefix: str = "/v1/figures",
) -> dict[tuple[str, str], OptionFigure]:
    """Each drawn option's picture, keyed by (version id as text, option letter).

    One picture per option: should a letter ever carry two rows, the first in print order is
    the one shown. `cleared_only` is the student's rule (a verified licence); the reviewer sees
    a figure before anyone has cleared it, since clearing it is part of what they are doing.
    """
    ids = list(dict.fromkeys(str(version) for version in version_ids))
    if not ids:
        return {}
    rows = await fetch_all(
        conn,
        f"""
        SELECT question_version_id, option_key, id, mime_type, alt_text, width, height
        FROM question_assets
        WHERE question_version_id = ANY(CAST(:versions AS uuid[]))
          AND option_key IS NOT NULL
          {"AND licence_status = 'verified'" if cleared_only else ""}
        ORDER BY display_order, id
        """,
        versions=ids,
    )
    found: dict[tuple[str, str], OptionFigure] = {}
    for row in rows:
        if row["mime_type"] not in DISPLAYABLE:
            continue
        found.setdefault(
            (str(row["question_version_id"]), str(row["option_key"])),
            option_figure(row, url_prefix=url_prefix),
        )
    return found


def serve(storage_uri: str, mime_type: str) -> FileResponse:
    """A stored figure as an image response, with the headers every figure is sent with."""
    if mime_type not in DISPLAYABLE:
        raise HTTPException(status_code=404, detail="no such figure")
    path = resolve(storage_uri)
    if path is None:
        raise HTTPException(status_code=404, detail="the figure's file is missing")
    return FileResponse(
        path,
        media_type=mime_type,
        headers={
            # A figure never changes under its id: a corrected one is a new asset.
            "Cache-Control": "public, max-age=86400",
            # Belt and braces for SVG opened on its own rather than through <img>.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
    )


@router.get("/{asset_id}", summary="A question's figure, as an image")
async def figure(
    conn: Annotated[AsyncConnection, Depends(connection)], asset_id: UUID
) -> FileResponse:
    rows = await fetch_all(
        conn,
        """
        SELECT a.storage_uri, a.mime_type
        FROM question_assets a
        JOIN question_versions v ON v.id = a.question_version_id
        WHERE a.id = :asset AND a.licence_status = 'verified' AND v.review_status = 'approved'
        """,
        asset=asset_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no such figure")
    return serve(str(rows[0]["storage_uri"]), str(rows[0]["mime_type"]))
