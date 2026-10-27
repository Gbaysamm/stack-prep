"""Signed-in staff for the tests: a reviewer or an admin account, made and removed by the test.

    async with staff_login(client, "reviewer", reviewer_id=ids["reviewer"]) as person:
        ...  # the client now carries a reviewer's session cookie

`reviewer_id` links an academic_reviewers row the test already made to the new account, so the
decisions the test checks are recorded under the reviewer it expects.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import httpx
from sqlalchemy import text

from app.db import get_engine

PASSWORD = "correct horse battery"


@dataclass
class Person:
    student_id: str
    login: str


async def signed_up(client: httpx.AsyncClient, name: str = "Staff Test") -> Person:
    login = f"staff-{uuid.uuid4().hex[:12]}@example.test"
    response = await client.post(
        "/v1/auth/signup", json={"display_name": name, "login": login, "password": PASSWORD}
    )
    assert response.status_code == 201, response.text
    return Person(student_id=response.json()["student_id"], login=login)


async def remove(people: list[Person], keep: str | None = None) -> None:
    """Delete the accounts; `keep` is a reviewer row the test made itself and removes itself."""
    async with get_engine().begin() as conn:
        ids = [p.student_id for p in people]
        mine = "student_id::text = ANY(:i)"
        if keep:
            await conn.execute(
                text("UPDATE academic_reviewers SET student_id = NULL WHERE id = :k"), {"k": keep}
            )
        # The reviewer row the dashboard made for the account the first time it was used.
        await conn.execute(text(f"DELETE FROM academic_reviewers WHERE {mine}"), {"i": ids})
        await conn.execute(text(f"DELETE FROM consents WHERE {mine}"), {"i": ids})
        await conn.execute(text("DELETE FROM students WHERE id::text = ANY(:i)"), {"i": ids})
        logins = [p.login for p in people]
        await conn.execute(text("DELETE FROM auth_attempts WHERE login = ANY(:l)"), {"l": logins})


@asynccontextmanager
async def staff_login(
    client: httpx.AsyncClient, role: str, reviewer_id: str | None = None
) -> AsyncIterator[Person]:
    """Sign up, take the role, and stay signed in on `client` until the block ends."""
    person = await signed_up(client)
    async with get_engine().begin() as conn:
        await conn.execute(
            text("INSERT INTO account_roles (student_id, role) VALUES (:id, :role)"),
            {"id": person.student_id, "role": role},
        )
        if reviewer_id:
            await conn.execute(
                text("UPDATE academic_reviewers SET student_id = :s WHERE id = :r"),
                {"s": person.student_id, "r": reviewer_id},
            )
    try:
        yield person
    finally:
        client.cookies.clear()
        await remove([person], keep=reviewer_id)
