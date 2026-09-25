"""The diagrams printed with a question, as a student is shown them.

A figure is a question_assets row pointing at a file in our own store. Two things read it:
the student's screen, which loads it by URL from the endpoint here, and the coach, which is
sent the picture itself (see routers/practice.py). Both take only what a person has cleared —
a verified licence — and only formats a browser shows as an image.

WHY A URL AND NOT THE MARKUP. The redrawn Mathematics figures are SVG, and SVG put into a page
is live markup. Loaded through <img> it is only ever a picture: no script runs, nothing it
links to is fetched. That holds even for a file nobody has read closely, which is the property
worth having for something served to children.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated
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
    if not rows or rows[0]["mime_type"] not in DISPLAYABLE:
        raise HTTPException(status_code=404, detail="no such figure")
    path = resolve(str(rows[0]["storage_uri"]))
    if path is None:
        raise HTTPException(status_code=404, detail="the figure's file is missing")
    return FileResponse(
        path,
        media_type=str(rows[0]["mime_type"]),
        headers={
            # A figure never changes under its id: a corrected one is a new asset.
            "Cache-Control": "public, max-age=86400",
            # Belt and braces for SVG opened on its own rather than through <img>.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
    )
