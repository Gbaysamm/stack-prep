"""The student's roadmap (docs/plans/2026-11-10-student-roadmap.md; engine/roadmap.py).

Stack Prep plans the work; the student follows it. Reading the roadmap builds it the first
time, and re-builds it when a check-up has finished since, the goal or study time changed, or
its seven days have run out. The old one is kept (replaced), with what happened to each item,
so following the plan is on record from day one.

An item's state is read from the sitting linked to it: done when that sitting has ended, in
progress while it is open, missed when its day has passed without one, and to do otherwise. A
check-up or mock the student takes from their own pages counts for the matching item.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import require_student
from app.db import connection, fetch_all
from app.routers import checkup as checkup_router
from app.routers.checkup import _subtopics
from app.routers.practice import (
    EXCLUDED_POOL,
    OWN_RUNS_AFTER,
    RunFilters,
    _standings_from_history,
    begin_run,
)
from engine import roadmap as engine
from engine.projection import UnitStanding
from engine.version import ENGINE_VERSION

router = APIRouter(prefix="/v1/roadmap", tags=["roadmap"])

DEFAULT_MINUTES = 30
DEFAULT_DAYS = (1, 2, 3, 4, 5, 6)

ItemState = Literal["done", "in_progress", "missed", "to_do"]


class ItemOut(BaseModel):
    id: UUID
    day: date
    position: int
    kind: Literal["run", "mixed", "mock", "checkup"]
    subject_id: UUID | None
    subject_name: str | None
    subtopic_id: UUID | None
    subtopic_name: str | None
    length: int
    reason: str
    value: Literal["high", "medium", "low"] | None
    state: ItemState
    session_id: UUID | None
    #: The subtopic's level, 1 (weak) to 5 (mastered), from the spec's mastery bands; 0 when
    #: it has fewer than 3 answers; None for an item that is not a single subtopic.
    level: int | None = None


class Milestone(BaseModel):
    week_end: date
    score: float


class SubjectOut(BaseModel):
    subject_id: UUID
    name: str
    measured: bool
    score_now: float
    target: float | None
    expected: float
    milestones: list[Milestone]


class Record(BaseModel):
    """Following the plan: items whose day has come, and how many were done."""

    due: int
    done: int
    last_7_days_due: int
    last_7_days_done: int
    #: Planned items still to finish before the student may choose their own runs; 0 when
    #: they may (practice.OWN_RUNS_AFTER).
    own_runs_in: int


class RoadmapOut(BaseModel):
    built_for: date
    reason: str
    today: date
    exam_date: date | None
    study_days_left: int
    runs_per_day: int
    status: str
    advice: str | None
    #: When the rest of the syllabus would not fit by exam day: the time a day that would.
    pace_advice: str | None = None
    total_now: float | None
    total_expected: float | None
    target_total: float | None
    subjects: list[SubjectOut]
    items: list[ItemOut]
    record: Record


async def _today(conn: AsyncConnection, student_id: UUID) -> tuple[date, str]:
    rows = await fetch_all(
        conn,
        "SELECT (now() AT TIME ZONE timezone)::date AS today, timezone FROM students WHERE id = :s",
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="unknown student")
    return rows[0]["today"], rows[0]["timezone"]


async def _inputs(
    conn: AsyncConnection, student_id: UUID, today: date, tz: str
) -> tuple[engine.RoadmapInput, dict[str, Any]]:
    """What the roadmap is built from, and a snapshot of it to store and compare."""
    subjects = await fetch_all(
        conn,
        """
        WITH checked AS (
          SELECT subject_id, max(ended_at) AS last
          FROM study_sessions
          WHERE student_id = :s AND session_type = 'checkup' AND ended_at IS NOT NULL
          GROUP BY subject_id
        )
        SELECT sub.id, sub.name, g.target_score, g.exam_date, g.minutes_per_day, g.study_days,
               (c.last AT TIME ZONE :tz)::date AS last_checkup
        FROM subjects sub
        LEFT JOIN student_exam_goals g
          ON g.subject_id = sub.id AND g.student_id = :s AND g.status = 'active'
        LEFT JOIN checked c ON c.subject_id = sub.id
        WHERE g.id IS NOT NULL OR c.last IS NOT NULL
        ORDER BY sub.name
        """,
        s=student_id,
        tz=tz,
    )
    target_total = (
        await fetch_all(conn, "SELECT target_aggregate FROM students WHERE id = :s", s=student_id)
    )[0]["target_aggregate"]
    exam_dates = [row["exam_date"] for row in subjects if row["exam_date"]]
    minutes = next((r["minutes_per_day"] for r in subjects if r["minutes_per_day"]), None)
    days = next((r["study_days"] for r in subjects if r["study_days"]), None)
    inputs: list[engine.SubjectInput] = []
    for row in subjects:
        standings = await _standings(conn, student_id, row["id"])
        inputs.append(
            engine.SubjectInput(
                subject_id=str(row["id"]),
                name=row["name"],
                units=tuple(standings),
                target=float(row["target_score"]) if row["target_score"] is not None else None,
                last_checkup=row["last_checkup"],
            )
        )
    spec = engine.RoadmapInput(
        today=today,
        exam_date=min(exam_dates) if exam_dates else None,
        study_days=tuple(days) if days else DEFAULT_DAYS,
        minutes_per_day=minutes or DEFAULT_MINUTES,
        subjects=tuple(inputs),
        target_total=float(target_total) if target_total is not None else None,
        run_minutes=await _run_minutes(conn, student_id),
    )
    snapshot = {
        "target_total": spec.target_total,
        "exam_date": spec.exam_date.isoformat() if spec.exam_date else None,
        "minutes_per_day": spec.minutes_per_day,
        "study_days": list(spec.study_days),
        "subjects": [
            {
                "subject_id": s.subject_id,
                "target": s.target,
                "last_checkup": s.last_checkup.isoformat() if s.last_checkup else None,
            }
            for s in spec.subjects
        ],
    }
    return spec, snapshot


async def _teachable(conn: AsyncConnection, subject_id: UUID) -> set[str]:
    """The subject's subtopics with questions a run can serve."""
    rows = await fetch_all(
        conn,
        """
        SELECT DISTINCT skill.parent_id AS sub
        FROM deliverable_questions dq
        JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
        JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
        WHERE dq.subject_id = :subject
        """,
        subject=subject_id,
        pool=EXCLUDED_POOL,
    )
    return {str(r["sub"]) for r in rows}


async def _standings(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> list[UnitStanding]:
    """Where the student stands in each subtopic, in syllabus order, marked teachable or not."""
    units, _ = await _subtopics(conn, subject_id)
    found = await _standings_from_history(conn, student_id, subject_id, units)
    taught = await _teachable(conn, subject_id)
    runs = await _runs_by_subtopic(conn, student_id, subject_id)
    fresh = await _fresh_by_subtopic(conn, student_id, subject_id)
    return [
        replace(
            u,
            teachable=u.unit_id in taught,
            runs=runs.get(u.unit_id, 0),
            fresh=fresh.get(u.unit_id, 0),
        )
        for u in found
    ]


async def _fresh_by_subtopic(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> dict[str, int]:
    """Practice questions per subtopic this student has not met yet (what a run can serve)."""
    rows = await fetch_all(
        conn,
        """
        SELECT skill.parent_id AS sub, count(DISTINCT dq.question_id) AS fresh
        FROM deliverable_questions dq
        JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
        JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
        WHERE dq.subject_id = :subject
          AND NOT EXISTS (
            SELECT 1 FROM student_question_history h
            WHERE h.student_id = :s AND h.question_id = dq.question_id
          )
        GROUP BY skill.parent_id
        """,
        s=student_id,
        subject=subject_id,
        pool=EXCLUDED_POOL,
    )
    return {str(r["sub"]): int(r["fresh"]) for r in rows}


async def _runs_by_subtopic(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> dict[str, int]:
    """Practice runs this student has had on each subtopic (for the planner's run limit)."""
    rows = await fetch_all(
        conn,
        """
        SELECT skill.parent_id AS sub, count(DISTINCT a.session_id) AS runs
        FROM attempts a
        JOIN study_sessions ss ON ss.id = a.session_id AND ss.session_type = 'guided'
        JOIN question_versions v ON v.id = a.question_version_id
        JOIN question_classifications c
          ON c.question_id = v.question_id AND c.classification_role = 'primary'
        JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
        WHERE a.student_id = :s AND ss.subject_id = :subject
        GROUP BY skill.parent_id
        """,
        s=student_id,
        subject=subject_id,
    )
    return {str(r["sub"]): int(r["runs"]) for r in rows}


#: A run's minutes, measured: from this many finished runs, held between these bounds (a run
#: left open overnight, or skimmed in a minute, says nothing about the student's pace).
RUN_MINUTES_FROM = 3
RUN_MINUTES_RANGE = (10, 30)


async def _run_minutes(conn: AsyncConnection, student_id: UUID) -> int:
    """How long a run of ten takes this student: the median of their last ten finished runs."""
    rows = await fetch_all(
        conn,
        """
        SELECT extract(epoch FROM ss.ended_at - ss.started_at) / 60.0
               / greatest(1, (SELECT count(DISTINCT a.question_version_id) FROM attempts a
                              WHERE a.session_id = ss.id)) * :per_run AS minutes
        FROM study_sessions ss
        WHERE ss.student_id = :s AND ss.session_type = 'guided' AND ss.ended_at IS NOT NULL
        ORDER BY ss.ended_at DESC
        LIMIT 10
        """,
        s=student_id,
        per_run=engine.RUN_LENGTH,
    )
    if len(rows) < RUN_MINUTES_FROM:
        return engine.RUN_MINUTES
    found = sorted(float(r["minutes"]) for r in rows)
    middle = found[len(found) // 2]
    low, high = RUN_MINUTES_RANGE
    return round(min(high, max(low, middle)))


async def opened_subtopics(conn: AsyncConnection, student_id: UUID, subject_id: UUID) -> list[str]:
    """The subtopics this student may be given now, in syllabus order (engine.open_units)."""
    return [u.unit_id for u in engine.open_units(await _standings(conn, student_id, subject_id))]


def _goal_part(snapshot: dict[str, Any]) -> dict[str, Any]:
    """The parts of the inputs a student changes on purpose (not their scores)."""
    return {
        "target_total": snapshot["target_total"],
        "exam_date": snapshot["exam_date"],
        "minutes_per_day": snapshot["minutes_per_day"],
        "study_days": snapshot["study_days"],
        "subjects": [(s["subject_id"], s["target"]) for s in snapshot["subjects"]],
    }


def _rebuild_reason(
    active: dict[str, Any] | None, snapshot: dict[str, Any], today: date
) -> str | None:
    if active is None:
        return "first"
    stored = active["inputs"]
    old = {s["subject_id"]: s["last_checkup"] for s in stored["subjects"]}
    if any(
        s["last_checkup"] and s["last_checkup"] != old.get(s["subject_id"])
        for s in snapshot["subjects"]
    ):
        return "checkup"
    if _goal_part(stored) != _goal_part(snapshot):
        return "goal"
    # Each morning: yesterday's results shape today. Today's stops are never re-planned under
    # the student except by a check-up or a goal change above.
    if today > active["built_for"]:
        return "new_day"
    return None


def _summary(plan: engine.Roadmap) -> dict[str, Any]:
    return {
        "exam_date": plan.exam_date.isoformat() if plan.exam_date else None,
        "study_days_left": plan.study_days_left,
        "runs_per_day": plan.runs_per_day,
        "status": plan.status,
        "advice": plan.advice,
        "pace_advice": plan.pace_advice,
        "total_now": plan.total_now,
        "total_expected": plan.total_expected,
        "target_total": plan.target_total,
        "subjects": [
            {
                "subject_id": s.subject_id,
                "name": s.name,
                "measured": s.measured,
                "score_now": s.score_now,
                "target": s.target,
                "expected": s.expected,
                "milestones": [
                    {"week_end": end.isoformat(), "score": score}
                    for end, score in zip(plan.week_ends, s.milestones, strict=False)
                ],
            }
            for s in plan.subjects
        ],
    }


async def _active(conn: AsyncConnection, student_id: UUID) -> dict[str, Any] | None:
    rows = await fetch_all(
        conn,
        """
        SELECT id, built_for, reason, inputs, summary FROM roadmaps
        WHERE student_id = :s AND status = 'active'
        """,
        s=student_id,
    )
    return rows[0] if rows else None


async def ensure_roadmap(conn: AsyncConnection, student_id: UUID) -> dict[str, Any]:
    """The active roadmap, built or re-built first when it needs to be."""
    today, tz = await _today(conn, student_id)
    spec, snapshot = await _inputs(conn, student_id, today, tz)
    active = await _active(conn, student_id)
    reason = _rebuild_reason(active, snapshot, today)
    if reason is None and active is not None:
        return active
    plan = engine.build(spec)
    try:
        if active is not None:
            await conn.execute(
                text(
                    "UPDATE roadmaps SET status = 'replaced', replaced_at = now()"
                    " WHERE id = :id AND status = 'active'"
                ),
                {"id": active["id"]},
            )
        roadmap_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO roadmaps (student_id, built_for, reason, inputs, summary,
                      engine_version)
                    VALUES (:s, :day, :reason, CAST(:inputs AS jsonb), CAST(:summary AS jsonb),
                      :engine)
                    RETURNING id
                    """
                ),
                {
                    "s": student_id,
                    "day": today,
                    "reason": reason,
                    "inputs": json.dumps(snapshot),
                    "summary": json.dumps(_summary(plan)),
                    "engine": ENGINE_VERSION,
                },
            )
        ).scalar_one()
        for item in plan.items:
            await conn.execute(
                text(
                    """
                    INSERT INTO roadmap_items (roadmap_id, student_id, day, position, kind,
                      subject_id, subtopic_id, length, reason, value)
                    VALUES (:r, :s, :day, :pos, :kind, :subject, :subtopic, :length, :reason,
                      :value)
                    """
                ),
                {
                    "r": roadmap_id,
                    "s": student_id,
                    "day": item.day,
                    "pos": item.order,
                    "kind": item.kind,
                    "subject": item.subject_id,
                    "subtopic": item.subtopic_id,
                    "length": item.length,
                    "reason": item.reason,
                    "value": item.value,
                },
            )
        await conn.commit()
    except IntegrityError:
        # Built at the same moment by another request: theirs stands.
        await conn.rollback()
    built = await _active(conn, student_id)
    assert built is not None
    return built


async def _link_outside_sittings(conn: AsyncConnection, student_id: UUID, tz: str) -> None:
    """A check-up or mock taken from the student's own pages counts for the matching item."""
    await conn.execute(
        text(
            """
            UPDATE roadmap_items i
            SET (session_id, started_at) = (
              SELECT ss.id, ss.started_at FROM study_sessions ss
              WHERE ss.student_id = i.student_id
                AND ss.session_type = CASE i.kind WHEN 'mock' THEN 'full_mock' ELSE 'checkup' END
                AND (i.kind = 'mock' OR ss.subject_id = i.subject_id)
                AND (ss.started_at AT TIME ZONE :tz)::date BETWEEN i.day - 6 AND i.day + 6
                AND NOT EXISTS (SELECT 1 FROM roadmap_items o WHERE o.session_id = ss.id)
              ORDER BY abs((ss.started_at AT TIME ZONE :tz)::date - i.day), ss.started_at
              LIMIT 1
            )
            WHERE i.student_id = :s AND i.kind IN ('checkup', 'mock') AND i.session_id IS NULL
              AND i.day <= (now() AT TIME ZONE :tz)::date
            """
        ),
        {"s": student_id, "tz": tz},
    )
    # A run left half-done carries over to the current plan: the first stop on its subtopic
    # takes it, so the path says "Carry on", not "Start", after a re-plan.
    await conn.execute(
        text(
            """
            UPDATE roadmap_items i
            SET (session_id, started_at) = (SELECT ss.id, ss.started_at FROM study_sessions ss
              WHERE ss.student_id = i.student_id AND ss.session_type = 'guided'
                AND ss.ended_at IS NULL AND ss.hidden_at IS NULL
                AND ss.practice_filters -> 'subtopic_ids' = jsonb_build_array(i.subtopic_id::text)
                AND NOT EXISTS (SELECT 1 FROM roadmap_items o
                                WHERE o.session_id = ss.id AND o.roadmap_id = i.roadmap_id)
              ORDER BY ss.started_at DESC LIMIT 1)
            WHERE i.id IN (
              SELECT DISTINCT ON (f.subtopic_id) f.id FROM roadmap_items f
              JOIN roadmaps r ON r.id = f.roadmap_id AND r.status = 'active'
              WHERE f.student_id = :s AND f.kind = 'run' AND f.session_id IS NULL
                AND f.day >= (now() AT TIME ZONE :tz)::date
              ORDER BY f.subtopic_id, f.day, f.position)
              AND EXISTS (SELECT 1 FROM study_sessions ss
                WHERE ss.student_id = i.student_id AND ss.session_type = 'guided'
                  AND ss.ended_at IS NULL AND ss.hidden_at IS NULL
                  AND ss.practice_filters -> 'subtopic_ids'
                      = jsonb_build_array(i.subtopic_id::text))
            """
        ),
        {"s": student_id, "tz": tz},
    )
    await conn.commit()


ITEM_SQL = """
    SELECT i.id, i.day, i.position, i.kind, i.subject_id, sub.name AS subject_name,
           i.subtopic_id, ci.name AS subtopic_name, i.length, i.reason, i.value, i.session_id,
           CASE
             WHEN ss.ended_at IS NOT NULL THEN 'done'
             WHEN ss.id IS NOT NULL THEN 'in_progress'
             WHEN i.day < :today THEN 'missed'
             ELSE 'to_do'
           END AS state
    FROM roadmap_items i
    LEFT JOIN subjects sub ON sub.id = i.subject_id
    LEFT JOIN curriculum_items ci ON ci.id = i.subtopic_id
    LEFT JOIN study_sessions ss ON ss.id = i.session_id
"""


#: Spec §9.1's mastery bands as levels: Weak, Developing, Exam-ready, Strong, Mastered.
LEVEL_FROM = (0.40, 0.65, 0.80, 0.90)
#: Fewer answers than this and a subtopic is not yet levelled.
LEVEL_AFTER = 3


def level_of(mastery: float | None, answered: int) -> int:
    if mastery is None or answered < LEVEL_AFTER:
        return 0
    return 1 + sum(1 for edge in LEVEL_FROM if mastery >= edge)


async def _levels(
    conn: AsyncConnection, student_id: UUID, items: list[dict[str, Any]]
) -> dict[str, int]:
    """Each planned subtopic's level, from the student's answers in its subject."""
    out: dict[str, int] = {}
    for subject_id in {row["subject_id"] for row in items if row["subtopic_id"] is not None}:
        units, _ = await _subtopics(conn, subject_id)
        for standing in await _standings_from_history(conn, student_id, subject_id, units):
            out[standing.unit_id] = level_of(standing.mastery, standing.answered)
    return out


@router.get("/{student_id}", response_model=RoadmapOut, summary="The student's roadmap")
async def read(
    student_id: UUID, request: Request, conn: Annotated[AsyncConnection, Depends(connection)]
) -> RoadmapOut:
    await require_student(request, conn, student_id)
    active = await ensure_roadmap(conn, student_id)
    today, tz = await _today(conn, student_id)
    await _link_outside_sittings(conn, student_id, tz)
    items = await fetch_all(
        conn,
        ITEM_SQL + " WHERE i.roadmap_id = :r ORDER BY i.day, i.position",
        r=active["id"],
        today=today,
    )
    history = (
        await fetch_all(
            conn,
            f"""
        SELECT count(*) FILTER (WHERE state <> 'to_do') AS due,
               count(*) FILTER (WHERE state = 'done') AS done,
               count(*) FILTER (WHERE state <> 'to_do' AND day > :week_ago) AS due7,
               count(*) FILTER (WHERE state = 'done' AND day > :week_ago) AS done7
        FROM ({ITEM_SQL} WHERE i.student_id = :s AND i.day <= :today
              -- A stop counts while its plan was the current one, or when it was taken: a plan
              -- replaced (each morning, or by a check-up) leaves no phantom missed stops.
              AND (i.session_id IS NOT NULL OR NOT EXISTS (
                SELECT 1 FROM roadmaps mine, roadmaps later
                WHERE mine.id = i.roadmap_id AND later.student_id = i.student_id
                  AND later.created_at > mine.created_at AND later.built_for <= i.day))
             ) AS everything
        """,
            s=student_id,
            today=today,
            week_ago=today - timedelta(days=7),
        )
    )[0]
    finished = (
        await fetch_all(
            conn,
            "SELECT count(*) AS n FROM roadmap_items i JOIN study_sessions ss"
            " ON ss.id = i.session_id WHERE i.student_id = :s AND ss.ended_at IS NOT NULL",
            s=student_id,
        )
    )[0]["n"]
    levels = await _levels(conn, student_id, items)
    summary = active["summary"]
    return RoadmapOut(
        built_for=active["built_for"],
        reason=active["reason"],
        today=today,
        exam_date=summary["exam_date"],
        study_days_left=summary["study_days_left"],
        runs_per_day=summary["runs_per_day"],
        status=summary["status"],
        advice=summary["advice"],
        pace_advice=summary.get("pace_advice"),
        total_now=summary["total_now"],
        total_expected=summary["total_expected"],
        target_total=summary["target_total"],
        subjects=[SubjectOut(**s) for s in summary["subjects"]],
        items=[ItemOut(**row, level=levels.get(str(row["subtopic_id"]))) for row in items],
        record=Record(
            due=history["due"],
            done=history["done"],
            last_7_days_due=history["due7"],
            last_7_days_done=history["done7"],
            own_runs_in=max(0, OWN_RUNS_AFTER - int(finished)),
        ),
    )


class Started(BaseModel):
    kind: str
    session_id: UUID | None
    #: Where the app goes next.
    path: str


@router.post(
    "/{student_id}/items/{item_id}/start", response_model=Started, summary="Start a planned item"
)
async def start_item(
    student_id: UUID,
    item_id: UUID,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Started:
    await require_student(request, conn, student_id)
    rows = await fetch_all(
        conn,
        """
        SELECT i.id, i.kind, i.subject_id, i.subtopic_id, i.length, i.session_id,
               ss.ended_at
        FROM roadmap_items i LEFT JOIN study_sessions ss ON ss.id = i.session_id
        WHERE i.id = :i AND i.student_id = :s
        """,
        i=item_id,
        s=student_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That isn't on your roadmap.")
    item = rows[0]
    if item["kind"] == "mock":
        return Started(kind="mock", session_id=None, path="/mock/new")
    if item["session_id"] is not None and item["ended_at"] is None:
        session_id = item["session_id"]  # already open: carry on with it
    elif item["kind"] == "checkup":
        state = await checkup_router.start(
            request,
            conn,
            checkup_router.StartCheckup(student_id=student_id, subject_id=item["subject_id"]),
        )
        session_id = state.session_id
    else:
        # A mixed run mixes only what the syllabus order has opened for this student.
        opened = await opened_subtopics(conn, student_id, item["subject_id"])
        mixed = RunFilters(subtopic_ids=[UUID(u) for u in opened]) if opened else None
        filters = RunFilters(subtopic_ids=[item["subtopic_id"]]) if item["kind"] == "run" else mixed
        try:
            session_id = await begin_run(
                conn, student_id, item["subject_id"], item["length"] or 10, filters, planned=True
            )
        except HTTPException as error:
            if error.status_code != 422 or item["kind"] != "run":
                raise
            # Nothing new left in that subtopic for this student: a mixed run instead.
            session_id = await begin_run(
                conn, student_id, item["subject_id"], item["length"] or 10, mixed, planned=True
            )
    await conn.execute(
        text(
            "UPDATE roadmap_items SET session_id = :ss, started_at = coalesce(started_at, now())"
            " WHERE id = :i"
        ),
        {"ss": session_id, "i": item_id},
    )
    await conn.commit()
    path = f"/checkup/{session_id}" if item["kind"] == "checkup" else f"/practice/{session_id}"
    return Started(kind=item["kind"], session_id=session_id, path=path)
