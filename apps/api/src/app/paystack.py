"""Paystack: start a payment, check one, and recognise Paystack's webhook.

Only three calls are used. `initialize` hands back the page the student pays on, `verify` asks
Paystack how a payment went (never trusting what the browser says), and `signed` checks a
webhook really came from Paystack: its body is signed with the secret key (HMAC SHA-512).

The secret key comes from `PAYSTACK_SECRET_KEY`. Without it every call raises
`PaystackUnavailable`, and checkout says payments are not open yet.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

_log = logging.getLogger(__name__)
API = "https://api.paystack.co"


class PaystackUnavailable(Exception):
    """No key, or Paystack could not be reached or refused the call."""


@dataclass(frozen=True)
class Verified:
    #: Paystack's word for it: "success", "failed", "abandoned", "ongoing", "pending", ...
    status: str
    amount_kobo: int
    currency: str
    channel: str | None


def _key() -> str:
    key = get_settings().paystack_secret_key
    if not key:
        raise PaystackUnavailable("PAYSTACK_SECRET_KEY is not set")
    return key


async def _call(method: str, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {_key()}"}
    try:
        async with httpx.AsyncClient(base_url=API, timeout=20) as client:
            response = await client.request(method, path, json=json, headers=headers)
    except httpx.HTTPError as error:
        _log.warning("paystack %s %s failed: %s", method, path, error)
        raise PaystackUnavailable(str(error)) from error
    body: dict[str, Any] = response.json() if response.content else {}
    if response.status_code >= 400 or not body.get("status"):
        _log.warning("paystack %s %s refused: %s %s", method, path, response.status_code,
                     body.get("message"))
        raise PaystackUnavailable(str(body.get("message") or response.status_code))
    data: dict[str, Any] = body.get("data") or {}
    return data


def configured() -> bool:
    return bool(get_settings().paystack_secret_key)


async def initialize(
    *, email: str, amount_kobo: int, reference: str, callback_url: str, metadata: dict[str, Any]
) -> str:
    """Start a payment; the address of Paystack's page to send the student to."""
    data = await _call(
        "POST",
        "/transaction/initialize",
        {
            "email": email,
            "amount": amount_kobo,
            "currency": "NGN",
            "reference": reference,
            "callback_url": callback_url,
            "metadata": metadata,
        },
    )
    return str(data["authorization_url"])


async def verify(reference: str) -> Verified:
    """How the payment with this reference went, according to Paystack."""
    data = await _call("GET", f"/transaction/verify/{reference}")
    return Verified(
        status=str(data.get("status") or ""),
        amount_kobo=int(data.get("amount") or 0),
        currency=str(data.get("currency") or ""),
        channel=data.get("channel"),
    )


def signed(body: bytes, signature: str | None) -> bool:
    """True when the webhook body carries Paystack's signature for our key."""
    key = get_settings().paystack_secret_key
    if not key or not signature:
        return False
    expected = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)
