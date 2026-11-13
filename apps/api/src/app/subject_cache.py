"""A subject's reference data, kept in memory for a few minutes.

Founder, 13 Nov 2026: every page was slow, and the roadmap took seconds. Much of each request
was re-reading what changes only when content is loaded: a subject's syllabus tree and paper
shares, which questions are deliverable and under which subtopic, how many lessons each
subtopic has. The roadmap read the syllabus eight times a request. These now come from memory,
read again after `SUBJECT_CACHE_SECONDS` (default five minutes; a content load is seen within
that, and a deploy restarts the process anyway). Tests set it to 0, so they always read afresh.

Only data that is the same for every student goes here, never a student's own.
"""

from __future__ import annotations

import asyncio
import copy
import os
import time
from collections.abc import Awaitable, Callable, Hashable
from typing import Any

_store: dict[Hashable, tuple[float, Any]] = {}
_locks: dict[Hashable, asyncio.Lock] = {}


def _seconds() -> float:
    try:
        return float(os.environ.get("SUBJECT_CACHE_SECONDS", "300"))
    except ValueError:
        return 300.0


async def remembered[T](key: Hashable, make: Callable[[], Awaitable[T]]) -> T:
    """`make()`'s value for `key`, from memory while it is fresh. A copy is handed out, so a
    caller that changes what it gets does not change it for the next one."""
    ttl = _seconds()
    if ttl <= 0:
        return await make()
    hit = _store.get(key)
    if hit is not None and time.monotonic() - hit[0] < ttl:
        return copy.copy(hit[1])  # type: ignore[no-any-return]
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:  # Many requests at once make it once.
        hit = _store.get(key)
        if hit is not None and time.monotonic() - hit[0] < ttl:
            return copy.copy(hit[1])  # type: ignore[no-any-return]
        value = await make()
        _store[key] = (time.monotonic(), value)
        return copy.copy(value)


def forget() -> None:
    """Everything read again on next use (after loading content in the same process)."""
    _store.clear()
