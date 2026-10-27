"""Student sign-up, sign-in and sign-out (ADR-0013, amended 2026-09-28).

A student signs up with an email address or a Nigerian phone number and a password. The
student row is made the way the sandbox makes one — active, with a real `in_app` consent
record — except that it has a login instead of a `sandbox:` reference. A sandbox tester who
signs up can pass `claim_student_id` to put the login on the student they have been using,
so their progress comes with them.

Errors on the fields a person types are plain sentences in `detail`, not pydantic's list of
locations, because the sign-up screen shows them as they are.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import (
    SESSION_COOKIE,
    SESSION_LIFETIME,
    SESSION_REFRESH_AFTER,
    clear_session_cookie,
    hash_password,
    hash_token,
    needs_rehash,
    open_session,
    role_of,
    set_session_cookie,
    verify_against_nothing,
    verify_password,
)
from app.db import connection
from app.routers.dev import SANDBOX_PREFIX

router = APIRouter(prefix="/v1/auth", tags=["auth"])

TAKEN = "An account with that email or phone number already exists."
BAD_LOGIN = "Enter a valid email address or Nigerian phone number."
NO_MATCH = "That email/phone and password don't match."
LOCKED = "Too many attempts. Wait a few minutes and try again."
NOT_SIGNED_IN = "Not signed in."

#: Failed sign-ins allowed for one login inside the window before it is refused outright.
MAX_FAILED_ATTEMPTS = 10
LOCKOUT_WINDOW_MINUTES = 15

MIN_PASSWORD = 8
MAX_PASSWORD = 128
MAX_NAME = 60

# The same shape as the CHECK on students.email, so a login that passes here is storable.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_NIGERIAN = re.compile(r"^(?:\+?234|0)([0-9]{10})$")


class SignUp(BaseModel):
    display_name: str
    login: str
    password: str
    claim_student_id: UUID | None = None


class SignIn(BaseModel):
    login: str
    password: str


class Account(BaseModel):
    student_id: UUID
    display_name: str
    #: The email address or +234 phone number the student signs in with.
    login: str
    #: student, reviewer or admin (migration 031). Staff are sent to their dashboard.
    role: Literal["student", "reviewer", "admin"] = "student"


def normalise_login(raw: str) -> tuple[str, str] | None:
    """(`email` | `phone`, the stored form), or None when it is neither.

    Emails are trimmed and lowercased. Phone numbers lose spaces and dashes, and every
    Nigerian form (0XXXXXXXXXX, 234XXXXXXXXXX, +234XXXXXXXXXX) becomes +234XXXXXXXXXX.
    """
    value = raw.strip()
    if "@" in value:
        email = value.lower()
        if len(email) > 254 or not _EMAIL.match(email):
            return None
        return "email", email
    digits = re.sub(r"[\s-]", "", value)
    match = _NIGERIAN.match(digits)
    if not match:
        return None
    return "phone", f"+234{match.group(1)}"


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def _is_unique_violation(error: IntegrityError) -> bool:
    original = error.orig
    code = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    return code == "23505"


@router.post("/signup", response_model=Account, status_code=201, summary="Create an account")
async def signup(
    body: SignUp,
    request: Request,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Account:
    name = body.display_name.strip()
    if not name:
        raise _invalid("Enter your name.")
    if len(name) > MAX_NAME:
        raise _invalid(f"Keep your name to {MAX_NAME} characters or fewer.")

    login = normalise_login(body.login)
    if login is None:
        raise _invalid(BAD_LOGIN)
    kind, value = login

    password = body.password
    if len(password) < MIN_PASSWORD:
        raise _invalid(f"Use at least {MIN_PASSWORD} characters for your password.")
    if len(password) > MAX_PASSWORD:
        raise _invalid(f"Use {MAX_PASSWORD} characters or fewer for your password.")
    if password.strip().lower() in {body.login.strip().lower(), value.lower()}:
        raise _invalid("Your password can't be your email or phone number.")

    password_hash = await hash_password(password)
    email = value if kind == "email" else None
    phone = value if kind == "phone" else None

    try:
        taken = (
            await conn.execute(
                text("SELECT 1 FROM students WHERE email = :email OR phone = :phone"),
                {"email": email, "phone": phone},
            )
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail=TAKEN)

        student_id = await _claim(conn, body.claim_student_id, name, email, phone)
        if student_id is None:
            student_id = await _create(conn, name, email, phone)

        await conn.execute(
            text(
                """
                INSERT INTO student_credentials (student_id, password_hash)
                VALUES (:student, :hash)
                """
            ),
            {"student": student_id, "hash": password_hash},
        )
        token = await open_session(conn, student_id)
        await conn.commit()
    except IntegrityError as error:
        await conn.rollback()
        if _is_unique_violation(error):
            raise HTTPException(status_code=409, detail=TAKEN) from error
        raise

    set_session_cookie(response, request, token)
    return Account(student_id=student_id, display_name=name, login=value)


async def _claim(
    conn: AsyncConnection,
    claim_id: UUID | None,
    name: str,
    email: str | None,
    phone: str | None,
) -> UUID | None:
    """Put the login on a sandbox student that has none yet; None when that is not possible.

    A claim that cannot be honoured (unknown id, not a sandbox student, already has a
    password) is not an error: the sign-up goes ahead with a new student, and the caller can
    tell from the returned `student_id`.
    """
    if claim_id is None:
        return None
    claimed: UUID | None = (
        await conn.execute(
            text(
                """
                UPDATE students s
                SET display_name = :name, email = :email, phone = :phone,
                    status = 'active', updated_at = now()
                WHERE s.id = :id
                  AND s.external_ref LIKE :prefix || '%'
                  AND NOT EXISTS (SELECT 1 FROM student_credentials c WHERE c.student_id = s.id)
                RETURNING s.id
                """
            ),
            {
                "id": claim_id,
                "name": name,
                "email": email,
                "phone": phone,
                "prefix": SANDBOX_PREFIX,
            },
        )
    ).scalar_one_or_none()
    if claimed is not None:
        # The sandbox made one already; this only fills the gap if it has been revoked.
        await conn.execute(
            text(
                """
                INSERT INTO consents (student_id, consent_type, granted, source, evidence_note)
                VALUES (:student, 'data_processing', true, 'in_app',
                        'Agreed to data processing when signing up in the app.')
                ON CONFLICT (student_id, consent_type) WHERE revoked_at IS NULL DO NOTHING
                """
            ),
            {"student": claimed},
        )
    return claimed


async def _create(conn: AsyncConnection, name: str, email: str | None, phone: str | None) -> UUID:
    """A new student, made the way the sandbox makes one, with a login instead of a ref."""
    student_id: UUID = (
        await conn.execute(
            text(
                """
                INSERT INTO students (display_name, email, phone, requires_guardian_consent,
                  country_code, timezone, status)
                VALUES (:name, :email, :phone, false, 'NG', 'Africa/Lagos', 'active')
                RETURNING id
                """
            ),
            {"name": name, "email": email, "phone": phone},
        )
    ).scalar_one()
    await conn.execute(
        text(
            """
            INSERT INTO consents (student_id, consent_type, granted, source, evidence_note)
            VALUES (:student, 'data_processing', true, 'in_app',
                    'Agreed to data processing when signing up in the app.')
            """
        ),
        {"student": student_id},
    )
    return student_id


@router.post("/login", response_model=Account, summary="Sign in")
async def login(
    body: SignIn,
    request: Request,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Account:
    parsed = normalise_login(body.login)
    # An unparseable login is still counted, under what was typed, so it cannot be used to
    # guess without limit either.
    key = parsed[1] if parsed else body.login.strip().lower()[:254]

    failures = (
        await conn.execute(
            text(
                """
                SELECT count(*) FROM auth_attempts
                WHERE login = :login
                  AND NOT succeeded
                  AND attempted_at > greatest(
                    now() - make_interval(mins => :window),
                    coalesce((SELECT max(attempted_at) FROM auth_attempts
                              WHERE login = :login AND succeeded), '-infinity'))
                """
            ),
            {"login": key, "window": LOCKOUT_WINDOW_MINUTES},
        )
    ).scalar_one()
    if failures >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail=LOCKED)

    row = None
    if parsed:
        row = (
            (
                await conn.execute(
                    text(
                        """
                        SELECT s.id, s.display_name, c.password_hash
                        FROM students s
                        JOIN student_credentials c ON c.student_id = s.id
                        WHERE (s.email = :login OR s.phone = :login) AND s.status = 'active'
                        """
                    ),
                    {"login": key},
                )
            )
            .mappings()
            .first()
        )

    if row is None:
        await verify_against_nothing(body.password)
        ok = False
    else:
        ok = await verify_password(row["password_hash"], body.password)

    await conn.execute(
        text("INSERT INTO auth_attempts (login, succeeded) VALUES (:login, :ok)"),
        {"login": key, "ok": ok},
    )
    await conn.execute(
        text(
            "DELETE FROM auth_attempts WHERE login = :login "
            "AND attempted_at < now() - interval '1 day'"
        ),
        {"login": key},
    )
    if not ok or row is None:
        await conn.commit()
        raise HTTPException(status_code=401, detail=NO_MATCH)

    student_id: UUID = row["id"]
    if needs_rehash(row["password_hash"]):
        await conn.execute(
            text(
                """
                UPDATE student_credentials SET password_hash = :hash, updated_at = now()
                WHERE student_id = :student
                """
            ),
            {"hash": await hash_password(body.password), "student": student_id},
        )
    token = await open_session(conn, student_id)
    await conn.commit()

    set_session_cookie(response, request, token)
    return Account(
        student_id=student_id,
        display_name=row["display_name"],
        login=key,
        role=await role_of(conn, student_id),
    )


@router.post("/logout", status_code=204, summary="Sign out")
async def logout(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await conn.execute(
            text("DELETE FROM auth_sessions WHERE token_hash = :token_hash"),
            {"token_hash": hash_token(token)},
        )
        await conn.commit()
    response = Response(status_code=204)
    clear_session_cookie(response, request)
    return response


@router.get("/me", response_model=Account, summary="Who is signed in")
async def me(
    request: Request,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Account:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)
    token_hash = hash_token(token)
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT st.id, st.display_name, coalesce(st.email, st.phone) AS login,
                           a.last_seen_at < now() - make_interval(secs => :refresh) AS stale
                    FROM auth_sessions a
                    JOIN students st ON st.id = a.student_id
                    WHERE a.token_hash = :token_hash
                      AND a.expires_at > now()
                      AND st.status = 'active'
                    """
                ),
                {"token_hash": token_hash, "refresh": SESSION_REFRESH_AFTER.total_seconds()},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)

    if row["stale"]:
        # Sliding expiry: a session in use keeps living, one left alone for 30 days does not.
        await conn.execute(
            text(
                """
                UPDATE auth_sessions
                SET last_seen_at = now(),
                    expires_at = now() + make_interval(secs => :lifetime)
                WHERE token_hash = :token_hash
                """
            ),
            {"token_hash": token_hash, "lifetime": SESSION_LIFETIME.total_seconds()},
        )
        await conn.commit()
        set_session_cookie(response, request, token)

    return Account(
        student_id=row["id"],
        display_name=row["display_name"],
        login=row["login"],
        role=await role_of(conn, row["id"]),
    )
