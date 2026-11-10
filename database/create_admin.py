#!/usr/bin/env python3
"""Make an account an admin: the first admin on a server, or a lost one put back.

    uv run --frozen python database/create_admin.py --login ada@example.com
    uv run --frozen python database/create_admin.py --login ada@example.com --name "Ada Obi"

Every other role is granted from the admin dashboard; this is the one way in when there is no
admin yet. If an account already signs in with that login it becomes an admin and keeps its
password. If none does, one is created: give --name, and the password is asked for at the
prompt (never on the command line, where it would land in the shell history).

Reads DATABASE_URL like the loaders. All of it is one transaction.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import re
import sys

import asyncpg
from argon2 import PasswordHasher

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_NIGERIAN = re.compile(r"^(?:\+?234|0)([789][01]\d{8})$")


def normalise(raw: str) -> tuple[str, str]:
    """('email' | 'phone', stored form), as the sign-in does (apps/api accounts.normalise_login)."""
    value = raw.strip()
    if "@" in value:
        if not _EMAIL.match(value.lower()):
            raise SystemExit(f"not an email address: {raw}")
        return "email", value.lower()
    match = _NIGERIAN.match(re.sub(r"[\s-]", "", value))
    if not match:
        raise SystemExit(f"not an email address or a Nigerian phone number: {raw}")
    return "phone", f"+234{match.group(1)}"


async def run(login: str, name: str | None) -> None:
    kind, value = normalise(login)
    url = os.environ.get("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")
    if not url:
        raise SystemExit("set DATABASE_URL")
    conn = await asyncpg.connect(url, server_settings={"search_path": "stackprep, public"})
    try:
        async with conn.transaction():
            student_id = await conn.fetchval(f"SELECT id FROM students WHERE {kind} = $1", value)
            if student_id is None:
                if not name:
                    raise SystemExit("no account signs in with that; pass --name to create one")
                password = getpass.getpass("Password for the new admin (10+ characters): ")
                if len(password) < 10 or password != getpass.getpass("Again: "):
                    raise SystemExit("passwords must match and be at least 10 characters")
                # Made the way signing up makes an account: an adult who agrees to data
                # processing, so their answers can be stored (check_attempt_consent).
                student_id = await conn.fetchval(
                    f"INSERT INTO students (display_name, {kind}, requires_guardian_consent, "
                    "country_code, timezone, status) "
                    "VALUES ($1, $2, false, 'NG', 'Africa/Lagos', 'active') RETURNING id",
                    name,
                    value,
                )
                await conn.execute(
                    "INSERT INTO consents"
                    " (student_id, consent_type, granted, source, evidence_note)"
                    " VALUES ($1, 'data_processing', true, 'in_app',"
                    " 'Staff account made on the server by its owner (create_admin).')",
                    student_id,
                )
                await conn.execute(
                    "INSERT INTO student_credentials (student_id, password_hash) VALUES ($1, $2)",
                    student_id,
                    PasswordHasher().hash(password),
                )
                print(f"Created {name} ({value}).")
            await conn.execute(
                """
                INSERT INTO account_roles (student_id, role) VALUES ($1, 'admin')
                ON CONFLICT (student_id) DO UPDATE SET role = 'admin', granted_at = now()
                """,
                student_id,
            )
        print(f"{value} is an admin. Sign in at /admin.")
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--login", required=True, help="email or Nigerian phone number")
    parser.add_argument("--name", help="display name, when the account does not exist yet")
    args = parser.parse_args()
    asyncio.run(run(args.login, args.name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
