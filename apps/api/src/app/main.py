"""Score Pilot API.

Routes are thin: validate, call the engine or SQL, return typed models. Decisions
live in packages/engine so they can be tested and replayed (ADR-0005).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import figures
from app.config import get_settings
from app.db import dispose_engine
from app.routers import (
    accounts,
    admin,
    admin_ai,
    admin_billing,
    admin_content,
    admin_reports,
    admin_students,
    admin_system,
    announcements,
    bank,
    bank_import,
    bank_lessons,
    billing,
    checkup,
    curriculum,
    dev,
    health,
    lesson_after,
    mock,
    mouth,
    notifications,
    pool,
    practice,
    progress,
    publishing,
    review,
    roadmap,
    runs,
    saved,
    site,
    student,
    support,
    topics,
    tracker,
)

API_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    import asyncio

    from app import lesson_package

    settings = get_settings()
    warming = (
        asyncio.create_task(lesson_package.warm_all(settings))
        if settings.lesson_packages_warm
        else None
    )
    yield
    if warming is not None:
        warming.cancel()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Score Pilot API",
        version=API_VERSION,
        summary="Adaptive exam preparation: curriculum, practice, mastery and plans",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["content-type", "authorization"],
    )
    app.include_router(health.router)
    app.include_router(lesson_after.router)
    app.include_router(accounts.router)
    app.include_router(admin.router)
    app.include_router(admin_ai.router)
    app.include_router(admin_billing.router)
    app.include_router(admin_content.router)
    app.include_router(admin_reports.router)
    app.include_router(admin_students.router)
    app.include_router(admin_system.router)
    app.include_router(admin_system.public)
    app.include_router(site.router)
    app.include_router(billing.router)
    app.include_router(curriculum.router)
    app.include_router(review.router)
    app.include_router(bank.router)
    app.include_router(bank_import.router)
    app.include_router(bank_lessons.router)
    app.include_router(tracker.router)
    app.include_router(topics.router)
    app.include_router(publishing.router)
    app.include_router(checkup.router)
    app.include_router(pool.router)
    app.include_router(practice.router)
    app.include_router(mouth.router)
    app.include_router(figures.router)
    app.include_router(student.router)
    app.include_router(saved.router)
    app.include_router(support.student_router)
    app.include_router(support.public_router)
    app.include_router(support.admin_router)
    app.include_router(announcements.student_router)
    app.include_router(announcements.admin_router)
    app.include_router(notifications.router)
    app.include_router(notifications.public_router)
    app.include_router(progress.router)
    app.include_router(roadmap.router)
    app.include_router(runs.router)
    app.include_router(mock.router)
    # Student creation without a login, for building the student side. The router refuses to
    # answer unless app_env is local or ci, so shipping it is not the same as exposing it.
    app.include_router(dev.router)
    return app


app = create_app()
