"""Student sign-in: passwords, session cookies, and who is asking (ADR-0013, amended).

Kept apart from the router so that any route can ask `current_student` without importing
the sign-up endpoints. Nothing here enforces anything on its own; a route that wants a
signed-in student depends on `current_student` and decides what a `None` means for it.

Sessions are opaque: the cookie carries a random token, the database keeps only its SHA-256,
and signing out deletes the row, so revocation is immediate (the reason ADR-0013 rules out
JWTs in the browser).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from functools import lru_cache
from typing import Annotated
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection
from starlette.concurrency import run_in_threadpool

from app.db import connection
from app.routers.dev import SANDBOX_PREFIX

#: The cookie that carries the session token.
SESSION_COOKIE = "sp_session"
#: How long a session lives without being used.
SESSION_LIFETIME = timedelta(days=30)
#: A session seen less recently than this has its expiry pushed out again on `me`.
SESSION_REFRESH_AFTER = timedelta(days=1)

#: argon2-cffi's defaults are Argon2id with RFC 9106's low-memory profile (t=3, 64 MiB, p=4).
_hasher = PasswordHasher()


async def hash_password(password: str) -> str:
    """Argon2id, off the event loop: a hash takes tens of milliseconds of CPU on purpose."""
    return await run_in_threadpool(_hasher.hash, password)


async def verify_password(password_hash: str, password: str) -> bool:
    def verify() -> bool:
        try:
            return _hasher.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False

    return await run_in_threadpool(verify)


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return _hasher.hash(secrets.token_urlsafe(16))


async def verify_against_nothing(password: str) -> None:
    """Spend the time a real check would, so an unknown login is not faster to reject."""
    dummy = await run_in_threadpool(_dummy_hash)
    await verify_password(dummy, password)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _is_https(request: Request) -> bool:
    """True when the browser reached us over https, including through Caddy."""
    if request.url.scheme == "https":
        return True
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip().lower() == "https"


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
    )


def clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
    )


async def open_session(conn: AsyncConnection, student_id: UUID) -> str:
    """Record a new session for the student and return the token for the cookie.

    The caller commits.
    """
    token = new_session_token()
    await conn.execute(
        text(
            """
            INSERT INTO auth_sessions (token_hash, student_id, expires_at)
            VALUES (:token_hash, :student, now() + make_interval(secs => :lifetime))
            """
        ),
        {
            "token_hash": hash_token(token),
            "student": student_id,
            "lifetime": SESSION_LIFETIME.total_seconds(),
        },
    )
    return token


async def current_student(
    request: Request, conn: Annotated[AsyncConnection, Depends(connection)]
) -> UUID | None:
    """The signed-in student's id, or None when there is no live session.

    Usable as a FastAPI dependency (`Depends(current_student)`) or called directly. Read
    only: it neither extends the session nor commits anything.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    student_id: UUID | None = (
        await conn.execute(
            text(
                """
                SELECT s.student_id
                FROM auth_sessions s
                JOIN students st ON st.id = s.student_id
                WHERE s.token_hash = :token_hash
                  AND s.expires_at > now()
                  AND st.status = 'active'
                """
            ),
            {"token_hash": hash_token(token)},
        )
    ).scalar_one_or_none()
    return student_id


async def require_student(request: Request, conn: AsyncConnection, student_id: UUID) -> None:
    """Refuse unless the caller may act as this student.

    The signed-in student may act as themselves and nobody else (403). With no session, only a
    legacy sandbox tester — a `sandbox:` student who never set a password — gets through, as
    they did before accounts existed; anyone else must log in (401). An unknown student is
    let past, so the route's own 404 still answers.
    """
    me = await current_student(request, conn)
    if me == student_id:
        return
    if me is not None:
        raise HTTPException(status_code=403, detail="That isn't your account.")
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT coalesce(s.external_ref LIKE :prefix || '%', false) AS sandbox,
                           EXISTS (SELECT 1 FROM student_credentials c
                                   WHERE c.student_id = s.id) AS claimed
                    FROM students s
                    WHERE s.id = :id
                    """
                ),
                {"id": student_id, "prefix": SANDBOX_PREFIX},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    if row["sandbox"] and not row["claimed"]:
        return
    raise HTTPException(status_code=401, detail="Log in to continue.")


async def require_session_owner(request: Request, conn: AsyncConnection, session_id: UUID) -> None:
    """`require_student` for whoever owns this study session; an unknown one is let past."""
    owner: UUID | None = (
        await conn.execute(
            text("SELECT student_id FROM study_sessions WHERE id = :id"), {"id": session_id}
        )
    ).scalar_one_or_none()
    if owner is not None:
        await require_student(request, conn, owner)
