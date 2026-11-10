"""Secrets an admin stores in the database (the question writer's API key), kept encrypted.

The key that opens them is never in the database: it is SECRETS_KEY from the environment, or,
when that is unset, one derived from the database password (in the server's environment, not
in the database). A copy of the database alone therefore gives no secret away. Changing the
database password without setting SECRETS_KEY means stored secrets must be entered again;
`open_secret` then returns None rather than failing.
"""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet:
    settings = get_settings()
    material = settings.secrets_key
    if not material:
        password = urlsplit(settings.database_url.replace("+asyncpg", "")).password or ""
        material = f"stackprep-secret-box:{password}"
    digest = hashlib.sha256(material.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def seal(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def open_secret(sealed: str | None) -> str | None:
    """The secret, or None when there is none or it can no longer be opened."""
    if not sealed:
        return None
    try:
        return _fernet().decrypt(sealed.encode()).decode()
    except InvalidToken:
        return None
