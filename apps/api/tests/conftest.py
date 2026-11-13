"""Shared test setup.

Each test runs in its own event loop, and the database engine caches connections
bound to the loop that created them. Disposing it between tests keeps a pooled
connection from being reused on a loop that has already closed.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

# Tests never spend money: whatever the checkout's .env holds, the paid services see no key
# (environment variables win over .env). A test that wants a key sets one itself.
os.environ["OPENAI_API_KEY"] = ""
os.environ["PAYSTACK_SECRET_KEY"] = ""
os.environ["INWORLD_API_KEY"] = ""
os.environ["LESSON_PACKAGES_WARM"] = "false"
# Reference data read afresh in every test (app/subject_cache.py).
os.environ["SUBJECT_CACHE_SECONDS"] = "0"

import pytest

from app.db import dispose_engine


@pytest.fixture(autouse=True)
async def _fresh_engine() -> AsyncIterator[None]:
    yield
    await dispose_engine()
