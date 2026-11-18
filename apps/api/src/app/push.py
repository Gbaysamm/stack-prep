"""Push notifications to phones and browsers (founder, 18 Nov 2026; migration 066).

A student turns them on from the bell (the browser asks their permission; no site can do it for
them). The browser gives a subscription, kept in `push_subscriptions`. After each hourly run,
and within seconds for the instant kinds, every notification of the last day that has not been
pushed goes to each of the student's subscriptions: the title, the words, and where a tap
leads. A subscription the push service says is gone (404, 410) is deleted.

Off until the key pair is set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY): `python -m app.cli
vapid-keys` makes one, on the server, to put in its .env.local. On iPhone, push works only
once Stack Prep is on the home screen (Apple's rule).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import get_settings

log = logging.getLogger(__name__)

PER_RUN = 500

CLAIM = """
    WITH due AS (
      SELECT n.id FROM notifications n
      WHERE n.pushed_at IS NULL AND n.dismissed_at IS NULL
        AND n.created_at > now() - interval '1 day'
        AND (CAST(:student AS uuid) IS NULL OR n.student_id = CAST(:student AS uuid))
        AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.student_id = n.student_id)
      ORDER BY n.created_at
      LIMIT :n
      FOR UPDATE OF n SKIP LOCKED
    )
    UPDATE notifications n SET pushed_at = now() FROM due WHERE n.id = due.id
    RETURNING n.id, n.student_id, n.kind, n.title, n.body, n.link_url
"""


def configured() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def make_keys() -> tuple[str, str]:
    """A new key pair: (public, private), both URL-safe base64, for the .env file."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid01

    vapid = Vapid01()
    vapid.generate_keys()
    raw = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64(public), _b64(raw)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def payload(note: dict[str, Any]) -> str:
    """What the service worker shows: title, words, where a tap leads, and a tag so a newer
    notification of the same kind replaces an older one on the phone."""
    return json.dumps(
        {
            "title": note["title"],
            "body": note.get("body") or "",
            "url": note.get("link_url") or "/notifications",
            "tag": note["kind"],
        }
    )


def _send(subscription: dict[str, Any], data: str) -> int:
    """One push; returns the HTTP status (201 sent, 404 or 410 gone, 0 failed)."""
    from pywebpush import WebPushException, webpush

    settings = get_settings()
    try:
        response = webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=data,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=12 * 3600,
            timeout=10,
        )
        return int(getattr(response, "status_code", 201))
    except WebPushException as error:
        return int(getattr(error.response, "status_code", 0) or 0)
    except Exception:  # a network fault: logged, never fatal
        log.exception("push to %s failed", subscription["endpoint"][:60])
        return 0


async def send_due(conn: AsyncConnection, student_id: UUID | None = None) -> int:
    """Push what is due (for everyone, or one student); returns how many pushes went."""
    if not configured():
        return 0
    notes = [
        dict(r)
        for r in (
            await conn.execute(
                text(CLAIM), {"student": str(student_id) if student_id else None, "n": PER_RUN}
            )
        ).mappings()
    ]
    await conn.commit()
    sent = 0
    for note in notes:
        subscriptions = [
            dict(r)
            for r in (
                await conn.execute(
                    text(
                        "SELECT id, endpoint, p256dh, auth FROM push_subscriptions"
                        " WHERE student_id = :s"
                    ),
                    {"s": note["student_id"]},
                )
            ).mappings()
        ]
        data = payload(note)
        for subscription in subscriptions:
            status = await asyncio.to_thread(_send, subscription, data)
            if status in (404, 410):
                await conn.execute(
                    text("DELETE FROM push_subscriptions WHERE id = :id"),
                    {"id": subscription["id"]},
                )
            elif 200 <= status < 300:
                sent += 1
                await conn.execute(
                    text("UPDATE push_subscriptions SET last_sent_at = now() WHERE id = :id"),
                    {"id": subscription["id"]},
                )
        await conn.commit()
    if notes:
        log.info("push: %s sent for %s notifications", sent, len(notes))
    return sent
