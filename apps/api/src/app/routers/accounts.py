"""Student sign-up, sign-in and sign-out (ADR-0013, amended 2026-09-28), and the account itself.

A student signs up with an email address or a Nigerian phone number and a password. The
student row is made the way the sandbox makes one — active, with a real `in_app` consent
record — except that it has a login instead of a `sandbox:` reference. A sandbox tester who
signs up can pass `claim_student_id` to put the login on the student they have been using,
so their progress comes with them.

A signed-in person can change their password and their login details (both need the current
password). A forgotten password is reset with a six-digit code sent to the account's email
(migration 033); the reply never says whether an account has that email.

Errors on the fields a person types are plain sentences in `detail`, not pydantic's list of
locations, because the sign-up screen shows them as they are.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app import app_settings, notifications
from app.auth import (
    SESSION_COOKIE,
    SESSION_LIFETIME,
    SESSION_REFRESH_AFTER,
    clear_session_cookie,
    current_student,
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
from app.mailer import send_email
from app.routers.dev import SANDBOX_PREFIX

router = APIRouter(prefix="/v1/auth", tags=["auth"])

TAKEN = "An account with that email or phone number already exists."
BAD_LOGIN = "Enter a valid email address or Nigerian phone number."
BAD_EMAIL = "Enter a valid email address."
BAD_PHONE = "Enter a valid Nigerian phone number, like 0803 123 4567."
EMAIL_TAKEN = "An account already uses that email."
PHONE_TAKEN = "An account already uses that phone number."
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
    #: The sign-up form sends both, and both are required there: an email for reset codes and
    #: receipts, a phone number to reach the student. Either one then signs in.
    email: str | None = None
    phone: str | None = None
    #: The older shape, one login (email or phone), still accepted from clients not yet updated.
    login: str | None = None
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


def _check_password(password: str, *logins: str | None) -> None:
    """The rules every new password meets, at sign-up, reset and change."""
    if len(password) < MIN_PASSWORD:
        raise _invalid(f"Use at least {MIN_PASSWORD} characters for your password.")
    if len(password) > MAX_PASSWORD:
        raise _invalid(f"Use {MAX_PASSWORD} characters or fewer for your password.")
    if password.strip().lower() in {login.strip().lower() for login in logins if login}:
        raise _invalid("Your password can't be your email or phone number.")


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
    if not await app_settings.get(conn, "signups_open"):
        raise HTTPException(
            status_code=403,
            detail="New sign-ups are closed for now. Please try again soon.",
        )
    name = body.display_name.strip()
    if not name:
        raise _invalid("Enter your name.")
    if len(name) > MAX_NAME:
        raise _invalid(f"Keep your name to {MAX_NAME} characters or fewer.")

    email: str | None
    phone: str | None
    if body.email is not None or body.phone is not None:
        given_email = normalise_login(body.email or "")
        if given_email is None or given_email[0] != "email":
            raise _invalid(BAD_EMAIL)
        given_phone = normalise_login(body.phone or "")
        if given_phone is None or given_phone[0] != "phone":
            raise _invalid(BAD_PHONE)
        email, phone = given_email[1], given_phone[1]
        value = email
        typed: tuple[str | None, ...] = (body.email, body.phone, email, phone)
    else:
        login = normalise_login(body.login or "")
        if login is None:
            raise _invalid(BAD_LOGIN)
        kind, value = login
        email = value if kind == "email" else None
        phone = value if kind == "phone" else None
        typed = (body.login, value)

    password = body.password
    _check_password(password, *typed)

    password_hash = await hash_password(password)

    try:
        taken = (
            await conn.execute(
                text(
                    """
                    SELECT bool_or(email = :email) AS email_taken,
                           bool_or(phone = :phone) AS phone_taken
                    FROM students WHERE email = :email OR phone = :phone
                    """
                ),
                {"email": email, "phone": phone},
            )
        ).first()
        if taken and (taken.email_taken or taken.phone_taken):
            detail = (
                TAKEN if body.email is None and body.phone is None
                else EMAIL_TAKEN if taken.email_taken
                else PHONE_TAKEN
            )
            raise HTTPException(status_code=409, detail=detail)

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
        await notifications.notify(
            conn,
            student_id,
            kind="welcome",
            category="system",
            title=f"Welcome to Stack Prep, {name.split()[0]}",
            body="Start with your roadmap: a short check-up in each subject shows where you "
            "stand, and your plan builds from there.",
            link_url="/roadmap",
            key="welcome",
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


# ------------------------------------------------------------------ forgotten passwords

RESET_MINUTES = 15
RESET_TRIES = 5
RESETS_PER_HOUR = 3
RESET_SENT = (
    "If an account uses that email, we've sent it a 6-digit code. "
    f"It works for {RESET_MINUTES} minutes."
)
EMAIL_ONLY = "Enter the email address on your account. Reset codes are sent by email."
BAD_CODE = "That code isn't right, or it has expired. Check it, or ask for a new one."


class ForgotPassword(BaseModel):
    login: str


class ResetPassword(BaseModel):
    login: str
    code: str
    password: str


class Sent(BaseModel):
    detail: str


def _code_hash(reset_id: UUID, code: str) -> str:
    return hashlib.sha256(f"{reset_id}:{code}".encode()).hexdigest()


def _reset_email(name: str, code: str) -> str:
    return (
        f"Hello {name},\n\n"
        f"Your Stack Prep password reset code is {code}.\n\n"
        f"Enter it on the reset screen within {RESET_MINUTES} minutes. If you didn't ask to "
        "reset your password, ignore this email: your password stays as it is.\n\n"
        "Stack Prep by Stackjunior\n"
    )


async def _email_account(conn: AsyncConnection, raw: str) -> tuple[str, UUID | None, str]:
    """(the normalised email, the active student with a password who uses it or None, name)."""
    login = normalise_login(raw)
    if login is None or login[0] != "email":
        raise _invalid(EMAIL_ONLY)
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT s.id, s.display_name
                    FROM students s
                    JOIN student_credentials c ON c.student_id = s.id
                    WHERE s.email = :email AND s.status = 'active'
                    """
                ),
                {"email": login[1]},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return login[1], None, ""
    return login[1], row["id"], row["display_name"]


@router.post("/forgot", response_model=Sent, status_code=202, summary="Email a reset code")
async def forgot_password(
    body: ForgotPassword,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Sent:
    email, student_id, name = await _email_account(conn, body.login)
    if student_id is None:
        return Sent(detail=RESET_SENT)
    recent = (
        await conn.execute(
            text(
                "SELECT count(*) FROM password_resets "
                "WHERE student_id = :student AND created_at > now() - interval '1 hour'"
            ),
            {"student": student_id},
        )
    ).scalar_one()
    if recent >= RESETS_PER_HOUR:
        # Quietly: saying so would tell a stranger the account exists.
        return Sent(detail=RESET_SENT)

    reset_id = uuid4()
    code = f"{secrets.randbelow(10**6):06d}"
    await conn.execute(
        text(
            """
            UPDATE password_resets SET spent_at = now()
            WHERE student_id = :student AND spent_at IS NULL
            """
        ),
        {"student": student_id},
    )
    await conn.execute(
        text("DELETE FROM password_resets WHERE created_at < now() - interval '1 day'")
    )
    await conn.execute(
        text(
            """
            INSERT INTO password_resets (id, student_id, code_hash, expires_at)
            VALUES (:id, :student, :hash, now() + make_interval(mins => :minutes))
            """
        ),
        {
            "id": reset_id,
            "student": student_id,
            "hash": _code_hash(reset_id, code),
            "minutes": RESET_MINUTES,
        },
    )
    await conn.commit()
    await send_email(email, "Your Stack Prep reset code", _reset_email(name, code))
    return Sent(detail=RESET_SENT)


@router.post("/reset", response_model=Account, summary="Set a new password with a code")
async def reset_password(
    body: ResetPassword,
    request: Request,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Account:
    email, student_id, name = await _email_account(conn, body.login)
    # The new password is checked first, so a weak one doesn't use up a try of the code.
    _check_password(body.password, body.login, email)
    if student_id is None:
        raise _invalid(BAD_CODE)
    reset = (
        (
            await conn.execute(
                text(
                    """
                    SELECT id, code_hash FROM password_resets
                    WHERE student_id = :student AND spent_at IS NULL AND expires_at > now()
                    ORDER BY created_at DESC LIMIT 1
                    FOR UPDATE
                    """
                ),
                {"student": student_id},
            )
        )
        .mappings()
        .first()
    )
    if reset is None:
        raise _invalid(BAD_CODE)
    code = re.sub(r"\s", "", body.code)
    if not secrets.compare_digest(_code_hash(reset["id"], code), reset["code_hash"]):
        await conn.execute(
            text(
                """
                UPDATE password_resets
                SET tries = tries + 1,
                    spent_at = CASE WHEN tries + 1 >= :limit THEN now() END
                WHERE id = :id
                """
            ),
            {"id": reset["id"], "limit": RESET_TRIES},
        )
        await conn.commit()
        raise _invalid(BAD_CODE)

    await conn.execute(
        text("UPDATE password_resets SET spent_at = now() WHERE id = :id"), {"id": reset["id"]}
    )
    await conn.execute(
        text(
            """
            UPDATE student_credentials SET password_hash = :hash, updated_at = now()
            WHERE student_id = :student
            """
        ),
        {"hash": await hash_password(body.password), "student": student_id},
    )
    # Every device signed in with the old password is signed out.
    await conn.execute(
        text("DELETE FROM auth_sessions WHERE student_id = :student"), {"student": student_id}
    )
    # A success ends any lockout from the wrong guesses that led here.
    await conn.execute(
        text("INSERT INTO auth_attempts (login, succeeded) VALUES (:login, true)"),
        {"login": email},
    )
    await notifications.notify(
        conn,
        student_id,
        kind="password_reset",
        category="system",
        title="Your password was reset",
        body="If this wasn't you, reset your password now and write to us in Messages.",
        link_url="/settings",
        key=f"password_reset-{secrets.token_hex(6)}",
    )
    token = await open_session(conn, student_id)
    await conn.commit()
    set_session_cookie(response, request, token)
    return Account(
        student_id=student_id,
        display_name=name,
        login=email,
        role=await role_of(conn, student_id),
    )


# ------------------------------------------------------------------ the signed-in account

WRONG_PASSWORD = "Your current password isn't right."


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class LoginChange(BaseModel):
    current_password: str
    #: Leave out to keep; "" or null to remove (one of the two must remain).
    email: str | None = None
    phone: str | None = None


class LoginDetails(BaseModel):
    email: str | None
    phone: str | None


async def _signed_in_with_password(
    request: Request, conn: AsyncConnection, password: str
) -> tuple[UUID, str | None, str | None]:
    """(student id, email, phone) of the signed-in person, once their password is checked.

    A wrong password is a 422, not a 401: the session is fine, and a 401 would sign them out.
    """
    me = await current_student(request, conn)
    if me is None:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)
    row = (
        (
            await conn.execute(
                text(
                    """
                    SELECT s.email, s.phone, c.password_hash
                    FROM students s
                    JOIN student_credentials c ON c.student_id = s.id
                    WHERE s.id = :id
                    """
                ),
                {"id": me},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=409, detail="This account has no password yet.")
    if not await verify_password(row["password_hash"], password):
        raise _invalid(WRONG_PASSWORD)
    return me, row["email"], row["phone"]


@router.post("/password", status_code=204, summary="Change your password")
async def change_password(
    body: ChangePassword,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Response:
    me, email, phone = await _signed_in_with_password(request, conn, body.current_password)
    _check_password(body.new_password, email, phone)
    if body.new_password == body.current_password:
        raise _invalid("Choose a password different from your current one.")
    await conn.execute(
        text(
            """
            UPDATE student_credentials SET password_hash = :hash, updated_at = now()
            WHERE student_id = :student
            """
        ),
        {"hash": await hash_password(body.new_password), "student": me},
    )
    # Signed out everywhere else; this device stays signed in.
    await conn.execute(
        text("DELETE FROM auth_sessions WHERE student_id = :student AND token_hash <> :keep"),
        {"student": me, "keep": hash_token(request.cookies.get(SESSION_COOKIE, ""))},
    )
    await notifications.notify(
        conn,
        me,
        kind="password_changed",
        category="system",
        title="Your password was changed",
        body="If this wasn't you, reset your password now and write to us in Messages.",
        link_url="/settings",
        key=f"password_changed-{secrets.token_hex(6)}",
    )
    await conn.commit()
    return Response(status_code=204)


@router.get("/login-details", response_model=LoginDetails, summary="Your email and phone")
async def login_details(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> LoginDetails:
    me = await current_student(request, conn)
    if me is None:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)
    row = (
        (await conn.execute(text("SELECT email, phone FROM students WHERE id = :id"), {"id": me}))
        .mappings()
        .one()
    )
    return LoginDetails(email=row["email"], phone=row["phone"])


@router.post("/login-details", response_model=LoginDetails, summary="Change your email or phone")
async def change_login_details(
    body: LoginChange,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> LoginDetails:
    me, email, phone = await _signed_in_with_password(request, conn, body.current_password)
    sent = body.model_dump(exclude_unset=True)
    if "email" in sent:
        raw = (body.email or "").strip()
        parsed = normalise_login(raw) if raw else None
        if raw and (parsed is None or parsed[0] != "email"):
            raise _invalid("Enter a valid email address.")
        email = parsed[1] if parsed else None
    if "phone" in sent:
        raw = (body.phone or "").strip()
        parsed = normalise_login(raw) if raw else None
        if raw and (parsed is None or parsed[0] != "phone"):
            raise _invalid("Enter a valid Nigerian phone number.")
        phone = parsed[1] if parsed else None
    if email is None and phone is None:
        raise _invalid("Keep an email or a phone number, so you can still sign in.")
    try:
        taken = (
            await conn.execute(
                text(
                    "SELECT 1 FROM students WHERE id <> :id AND (email = :email OR phone = :phone)"
                ),
                {"id": me, "email": email, "phone": phone},
            )
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail=TAKEN)
        await conn.execute(
            text(
                """
                UPDATE students SET email = :email, phone = :phone, updated_at = now()
                WHERE id = :id
                """
            ),
            {"id": me, "email": email, "phone": phone},
        )
        await notifications.notify(
            conn,
            me,
            kind="login_changed",
            category="system",
            title="Your login details were changed",
            body="If this wasn't you, reset your password now and write to us in Messages.",
            link_url="/settings",
            key=f"login_changed-{secrets.token_hex(6)}",
        )
        await conn.commit()
    except IntegrityError as error:
        await conn.rollback()
        if _is_unique_violation(error):
            raise HTTPException(status_code=409, detail=TAKEN) from error
        raise
    return LoginDetails(email=email, phone=phone)
