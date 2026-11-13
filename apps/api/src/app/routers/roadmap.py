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

from app import premium, scoring, voice_store
from app.auth import require_student
from app.config import Settings, get_settings
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
    kind: Literal["run", "mixed", "mock", "checkup", "lesson", "topic_test"]
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
    #: Still below the bar after its lessons and a run again: labelled on the path, practised
    #: on, no second round of lessons (founder, 13 Nov 2026).
    still_weak: bool = False
    #: A lesson stop: which of the subtopic's lessons it is, what it covers, and how many
    #: lessons the subtopic has (founder, 12 Nov 2026: a broad subtopic is several lessons).
    part: int | None = None
    lesson_title: str | None = None
    lesson_parts: int | None = None


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
    #: What the student did on the last few days, from the plans those days had (founder, 13 Nov
    #: 2026: a run done yesterday vanished when the plan was re-made this morning). Newest
    #: last; each sitting once.
    earlier: list[ItemOut] = []
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
                tested_topics=frozenset(await _tested_topics(conn, student_id, row["id"])),
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


async def _run_questions(conn: AsyncConnection, subject_id: UUID) -> dict[str, frozenset[str]]:
    """The questions a run can serve in each of the subject's subtopics (the same for every
    student, so from memory while fresh: subject_cache.py)."""
    from app import subject_cache

    async def read() -> dict[str, frozenset[str]]:
        rows = await fetch_all(
            conn,
            """
            SELECT skill.parent_id AS sub, dq.question_id
            FROM deliverable_questions dq
            JOIN questions q ON q.id = dq.question_id AND q.usage_pool <> :pool
            JOIN curriculum_items skill ON skill.id = dq.primary_skill_id
            WHERE dq.subject_id = :subject
            """,
            subject=subject_id,
            pool=EXCLUDED_POOL,
        )
        found: dict[str, set[str]] = {}
        for r in rows:
            found.setdefault(str(r["sub"]), set()).add(str(r["question_id"]))
        return {sub: frozenset(ids) for sub, ids in found.items()}

    return await subject_cache.remembered(("run_questions", str(subject_id)), read)


async def _teachable(conn: AsyncConnection, subject_id: UUID) -> set[str]:
    """The subject's subtopics with questions a run can serve."""
    return set(await _run_questions(conn, subject_id))


async def _standings(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> list[UnitStanding]:
    """Where the student stands in each subtopic, in syllabus order, marked teachable or not."""
    units, _ = await _subtopics(conn, subject_id)
    found = await _standings_from_history(conn, student_id, subject_id, units)
    taught = await _teachable(conn, subject_id)
    runs = await _runs_by_subtopic(conn, student_id, subject_id)
    fresh = await _fresh_by_subtopic(conn, student_id, subject_id)
    lessoned = await _parts_taught_since_last_run(conn, student_id, subject_id)
    ever = await _parts_taught_ever(conn, student_id, subject_id)
    parts = await _lesson_parts(conn, subject_id)
    return [
        replace(
            u,
            teachable=u.unit_id in taught,
            runs=runs.get(u.unit_id, 0),
            fresh=fresh.get(u.unit_id, 0),
            taught=lessoned.get(u.unit_id, 0) >= parts.get(u.unit_id, 1),
            lesson_parts=parts.get(u.unit_id, 1),
            taught_parts=min(lessoned.get(u.unit_id, 0), parts.get(u.unit_id, 1)),
            lessons_taken=ever.get(u.unit_id, 0) >= parts.get(u.unit_id, 1),
        )
        for u in found
    ]


async def _parts_taught_ever(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> dict[str, int]:
    """How many of each subtopic's lessons the student has ever finished."""
    rows = await fetch_all(
        conn,
        """
        SELECT l.subtopic_id AS sub, count(DISTINCT l.part) AS parts
        FROM subtopic_lessons l
        JOIN curriculum_items sub ON sub.id = l.subtopic_id AND sub.subject_id = :subject
        WHERE l.student_id = :s
        GROUP BY l.subtopic_id
        """,
        s=student_id,
        subject=subject_id,
    )
    return {str(r["sub"]): int(r["parts"]) for r in rows}


async def _parts_taught_since_last_run(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> dict[str, int]:
    """How many of each subtopic's lessons the student has finished since their last run
    there (a subtopic may have several: migration 047)."""
    rows = await fetch_all(
        conn,
        """
        SELECT l.subtopic_id AS sub, count(DISTINCT l.part) AS parts
        FROM subtopic_lessons l
        JOIN curriculum_items sub ON sub.id = l.subtopic_id AND sub.subject_id = :subject
        WHERE l.student_id = :s
          AND l.finished_at > coalesce((
            SELECT max(a.answered_at_client) FROM attempts a
            JOIN study_sessions ss ON ss.id = a.session_id AND ss.session_type = 'guided'
            JOIN question_versions v ON v.id = a.question_version_id
            JOIN question_classifications c
              ON c.question_id = v.question_id AND c.classification_role = 'primary'
            JOIN curriculum_items skill ON skill.id = c.curriculum_item_id
            WHERE a.student_id = :s AND skill.parent_id = l.subtopic_id
          ), '-infinity'::timestamptz)
        GROUP BY l.subtopic_id
        """,
        s=student_id,
        subject=subject_id,
    )
    return {str(r["sub"]): int(r["parts"]) for r in rows}


async def _lesson_parts(conn: AsyncConnection, subject_id: UUID) -> dict[str, int]:
    """How many written lessons each of the subject's subtopics has (from memory while fresh)."""
    from app import subject_cache

    async def read() -> dict[str, int]:
        rows = await fetch_all(
            conn,
            """
            SELECT c.subtopic_id AS sub, count(*) AS parts
            FROM subtopic_lesson_content c
            JOIN curriculum_items sub ON sub.id = c.subtopic_id AND sub.subject_id = :subject
            GROUP BY c.subtopic_id
            """,
            subject=subject_id,
        )
        return {str(r["sub"]): int(r["parts"]) for r in rows}

    return await subject_cache.remembered(("lesson_parts", str(subject_id)), read)


async def _tested_topics(conn: AsyncConnection, student_id: UUID, subject_id: UUID) -> set[str]:
    """Topics whose topic test the student has finished (a run across that one topic)."""
    rows = await fetch_all(
        conn,
        """
        SELECT DISTINCT jsonb_array_elements_text(ss.practice_filters -> 'topic_ids') AS topic
        FROM study_sessions ss
        WHERE ss.student_id = :s AND ss.subject_id = :subject AND ss.session_type = 'guided'
          AND ss.ended_at IS NOT NULL
          AND jsonb_array_length(coalesce(ss.practice_filters -> 'topic_ids', '[]'::jsonb)) = 1
        """,
        s=student_id,
        subject=subject_id,
    )
    return {str(r["topic"]) for r in rows}


async def _fresh_by_subtopic(
    conn: AsyncConnection, student_id: UUID, subject_id: UUID
) -> dict[str, int]:
    """Practice questions per subtopic this student has not met yet (what a run can serve):
    the subject's run questions (from memory) less the ones in the student's history."""
    by_sub = await _run_questions(conn, subject_id)
    met = {
        str(r["question_id"])
        for r in await fetch_all(
            conn,
            "SELECT DISTINCT question_id FROM student_question_history WHERE student_id = :s",
            s=student_id,
        )
    }
    left = {sub: len(ids - met) for sub, ids in by_sub.items()}
    return {sub: n for sub, n in left.items() if n}


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
                      subject_id, subtopic_id, length, reason, value, part)
                    VALUES (:r, :s, :day, :pos, :kind, :subject, :subtopic, :length, :reason,
                      :value, :part)
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
                    "part": item.part,
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


async def _lessons_after_weak_runs(
    conn: AsyncConnection, student_id: UUID, roadmap_id: UUID, today: date
) -> None:
    """A run finished below the bar puts its lesson next in today's plan, then the run again.

    Founder, 12 Nov 2026: the lesson is the very next thing after a weak run, and after it the
    student runs the subtopic again to show they have it. Each is its own stop on the path. The
    plan is otherwise only re-made each morning, so without this the lesson would wait for
    tomorrow. The engine's own test decides (engine.needs_lesson: run on, below the bar, not
    taught since, not moved past), so a passed run adds nothing, and a subtopic past
    STUCK_AFTER_RUNS is not looped on. A later run of the same subtopic already planned today
    moves up to follow the lesson, rather than a second one being added.
    """
    for _ in range(8):  # Each pass handles one subtopic; a day never has more than a few.
        rows = await fetch_all(
            conn,
            ITEM_SQL + " WHERE i.roadmap_id = :r AND i.day = :today ORDER BY i.position",
            r=roadmap_id,
            today=today,
        )
        done = [
            row
            for row in rows
            if row["kind"] == "run" and row["state"] == "done" and row["subtopic_id"] is not None
        ]
        if not done:
            return
        standing: dict[str, UnitStanding] = {}
        for subject_id in {row["subject_id"] for row in done}:
            for unit in await _standings(conn, student_id, subject_id):
                standing[unit.unit_id] = unit
        target = None
        for row in reversed(done):  # The latest run of each subtopic is the one that counts.
            sub = str(row["subtopic_id"])
            if any(
                str(other["subtopic_id"]) == sub and other["position"] > row["position"]
                for other in done
            ):
                continue
            found = standing.get(sub)
            if found is None or not engine.needs_lesson(found):
                continue
            after = [other for other in rows if other["position"] > row["position"]]
            if any(o["kind"] == "lesson" and str(o["subtopic_id"]) == sub for o in after):
                continue
            target = (row, after)
            break
        if target is None:
            return
        row, after = target
        sub, at = row["subtopic_id"], row["position"]
        weak = standing[str(sub)]
        parts = list(range(weak.taught_parts + 1, weak.lesson_parts + 1)) or [1]
        # The run again only where there are questions left to run on (weak.fresh == 0: the
        # lessons alone).
        rerun = weak.fresh != 0
        room = len(parts) + (1 if rerun else 0)
        again = next(
            (
                o
                for o in after
                if o["kind"] == "run" and o["subtopic_id"] == sub and o["state"] == "to_do"
            ),
            None,
        )
        # Make room for the lessons and the run after it (in two moves: a position is unique
        # per day).
        await conn.execute(
            text(
                "UPDATE roadmap_items SET position = position + 10000"
                " WHERE roadmap_id = :r AND day = :today AND position > :at"
            ),
            {"r": roadmap_id, "today": today, "at": at},
        )
        await conn.execute(
            text(
                "UPDATE roadmap_items SET position = position - 10000 + :room"
                " WHERE roadmap_id = :r AND day = :today AND position > 10000"
            ),
            {"r": roadmap_id, "today": today, "room": room},
        )
        insert = text(
            """
            INSERT INTO roadmap_items (roadmap_id, student_id, day, position, kind, subject_id,
              subtopic_id, length, reason, value, part)
            VALUES (:r, :s, :today, :pos, :kind, :subject, :sub, :length, :reason, :value,
              :part)
            """
        )
        common = {
            "r": roadmap_id,
            "s": student_id,
            "today": today,
            "subject": row["subject_id"],
            "sub": sub,
            "value": row["value"],
        }
        for n, part in enumerate(parts, 1):
            await conn.execute(
                insert,
                {
                    **common,
                    "pos": at + n,
                    "kind": "lesson",
                    "length": 0,
                    "reason": "reteach",
                    "part": part,
                },
            )
        if not rerun:
            pass
        elif again is not None:
            await conn.execute(
                text("UPDATE roadmap_items SET position = :pos WHERE id = :id"),
                {"pos": at + room, "id": again["id"]},
            )
        else:
            await conn.execute(
                insert,
                {
                    **common,
                    "pos": at + room,
                    "kind": "run",
                    "length": engine.RUN_LENGTH,
                    "reason": "high_value_gap",
                    "part": None,
                },
            )
        await conn.commit()


ITEM_SQL = """
    SELECT i.id, i.day, i.position, i.kind, i.subject_id, sub.name AS subject_name,
           i.subtopic_id, ci.name AS subtopic_name, i.length, i.reason, i.value, i.session_id,
           i.part, lc.title AS lesson_title,
           CASE WHEN i.kind = 'lesson' THEN (SELECT count(*) FROM subtopic_lesson_content x
             WHERE x.subtopic_id = i.subtopic_id) END AS lesson_parts,
           CASE
             WHEN i.done_at IS NOT NULL OR ss.ended_at IS NOT NULL THEN 'done'
             WHEN ss.id IS NOT NULL THEN 'in_progress'
             WHEN i.day < :today THEN 'missed'
             ELSE 'to_do'
           END AS state
    FROM roadmap_items i
    LEFT JOIN subjects sub ON sub.id = i.subject_id
    LEFT JOIN curriculum_items ci ON ci.id = i.subtopic_id
    LEFT JOIN study_sessions ss ON ss.id = i.session_id
    LEFT JOIN subtopic_lesson_content lc
      ON i.kind = 'lesson' AND lc.subtopic_id = i.subtopic_id AND lc.part = coalesce(i.part, 1)
"""


#: How many days back the roadmap shows what the student did.
EARLIER_DAYS = 7

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
) -> tuple[dict[str, int], set[str]]:
    """Each planned subtopic's level, from the student's answers in its subject, and the
    subtopics still below the bar after their lessons and a run again ("Still needs work")."""
    out: dict[str, int] = {}
    still: set[str] = set()
    for subject_id in {row["subject_id"] for row in items if row["subtopic_id"] is not None}:
        for standing in await _standings(conn, student_id, subject_id):
            out[standing.unit_id] = level_of(standing.mastery, standing.answered)
            if engine.still_needs_work(standing):
                still.add(standing.unit_id)
    return out, still


@router.get("/{student_id}", response_model=RoadmapOut, summary="The student's roadmap")
async def read(
    student_id: UUID, request: Request, conn: Annotated[AsyncConnection, Depends(connection)]
) -> RoadmapOut:
    await require_student(request, conn, student_id)
    active = await ensure_roadmap(conn, student_id)
    today, tz = await _today(conn, student_id)
    await _link_outside_sittings(conn, student_id, tz)
    await _lessons_after_weak_runs(conn, student_id, active["id"], today)
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
    taken = await fetch_all(
        conn,
        ITEM_SQL + " WHERE i.student_id = :s AND i.day < :today AND i.day >= :since"
        " AND i.session_id IS NOT NULL ORDER BY i.day, i.position",
        s=student_id,
        today=today,
        since=today - timedelta(days=EARLIER_DAYS),
    )
    # A sitting carried from one morning's plan to the next is on each: shown once.
    earlier: dict[Any, dict[str, Any]] = {}
    for row in taken:
        earlier[row["session_id"]] = row
    levels, still = await _levels(conn, student_id, items + list(earlier.values()))
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
        items=[
            ItemOut(
                **row,
                level=levels.get(str(row["subtopic_id"])),
                still_weak=row["kind"] == "run" and str(row["subtopic_id"]) in still,
            )
            for row in items
        ],
        earlier=[
            ItemOut(**row, level=levels.get(str(row["subtopic_id"])))
            for row in sorted(earlier.values(), key=lambda r: (r["day"], r["position"]))
        ],
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
               i.part, ss.ended_at
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
    if item["kind"] == "lesson":
        return Started(
            kind="lesson",
            session_id=None,
            path=f"/lesson/{item['subtopic_id']}?item={item_id}&part={item['part'] or 1}",
        )
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
        filters: RunFilters | None
        if item["kind"] == "topic_test":
            # One run across the whole topic: every subtopic under it, at mixed levels.
            filters = RunFilters(topic_ids=[item["subtopic_id"]])
        elif item["kind"] == "run":
            filters = RunFilters(subtopic_ids=[item["subtopic_id"]])
        else:
            filters = mixed
        try:
            session_id = await begin_run(
                conn, student_id, item["subject_id"], item["length"] or 10, filters, planned=True
            )
        except HTTPException as error:
            if error.status_code != 422 or item["kind"] not in ("run", "topic_test"):
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


class LessonOption(BaseModel):
    option_key: str
    body: str
    correct: bool


class LessonQuestion(BaseModel):
    question_version_id: UUID
    stem: str
    options: list[LessonOption]
    #: The reviewed working, step by step.
    steps: list[str]


class Lesson(BaseModel):
    subtopic_id: UUID
    subtopic_name: str
    topic_name: str
    subject_name: str
    #: The questions the student missed here (latest answer wrong), each with its working.
    questions: list[LessonQuestion]


@router.get(
    "/{student_id}/lessons/{subtopic_id}", response_model=Lesson, summary="A weak subtopic's lesson"
)
async def lesson(
    student_id: UUID,
    subtopic_id: UUID,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> Lesson:
    """Until the written lesson bank exists, the lesson is the reviewed working of the questions
    this student missed in the subtopic: the answer to each and how it is reached."""
    await require_student(request, conn, student_id)
    found = await fetch_all(
        conn,
        """
        SELECT sub.name AS subtopic_name, topic.name AS topic_name, s.name AS subject_name,
               sub.subject_id
        FROM curriculum_items sub
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        JOIN subjects s ON s.id = sub.subject_id
        WHERE sub.id = :sub AND sub.item_type = 'subtopic'
        """,
        sub=subtopic_id,
    )
    if not found:
        raise HTTPException(status_code=404, detail="No such topic.")
    head = found[0]
    answers = await scoring.answers_for(conn, student_id, head["subject_id"])
    missed = [
        UUID(a.question_id)
        for a in scoring.latest(answers).values()
        if a.unit_id == str(subtopic_id) and not a.is_correct
    ]
    rows = await fetch_all(
        conn,
        """
        SELECT DISTINCT ON (dq.question_id) dq.question_version_id, v.stem, v.solution_steps
        FROM deliverable_questions dq
        JOIN question_versions v ON v.id = dq.question_version_id
        WHERE dq.question_id = ANY(CAST(:ids AS uuid[]))
        ORDER BY dq.question_id, v.version DESC
        """,
        ids=[str(m) for m in missed],
    )
    questions: list[LessonQuestion] = []
    for row in rows:
        options = await fetch_all(
            conn,
            """
            SELECT o.option_key, o.body, coalesce(k.is_correct, false) AS correct
            FROM candidate_question_options o
            LEFT JOIN question_options k
              ON k.question_version_id = o.question_version_id AND k.option_key = o.option_key
            WHERE o.question_version_id = :v ORDER BY o.display_order, o.option_key
            """,
            v=row["question_version_id"],
        )
        questions.append(
            LessonQuestion(
                question_version_id=row["question_version_id"],
                stem=row["stem"],
                options=[LessonOption(**o) for o in options],
                steps=[str(step) for step in (row["solution_steps"] or [])],
            )
        )
    return Lesson(
        subtopic_id=subtopic_id,
        subtopic_name=head["subtopic_name"],
        topic_name=head["topic_name"],
        subject_name=head["subject_name"],
        questions=questions,
    )


class LessonDone(BaseModel):
    #: The roadmap stop it was taken from, ticked off with it.
    item_id: UUID | None = None
    #: Which of the subtopic's lessons was taken.
    part: int = 1


@router.post("/{student_id}/lessons/{subtopic_id}/done", status_code=204, summary="Finish a lesson")
async def lesson_done(
    student_id: UUID,
    subtopic_id: UUID,
    body: LessonDone,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> None:
    """The lesson is taken: the subtopic's next stop is its run, and the answers from here on
    are the student's real attempt at it (scoring.after_lessons)."""
    await require_student(request, conn, student_id)
    await conn.execute(
        text(
            "INSERT INTO subtopic_lessons (student_id, subtopic_id, part) VALUES (:s, :sub, :part)"
        ),
        {"s": student_id, "sub": subtopic_id, "part": body.part},
    )
    if body.item_id is not None:
        await conn.execute(
            text(
                "UPDATE roadmap_items SET done_at = now() WHERE id = :i AND student_id = :s"
                " AND kind = 'lesson'"
            ),
            {"i": body.item_id, "s": student_id},
        )
    await conn.commit()


async def _bank_lesson(
    conn: AsyncConnection, subtopic_id: UUID, part: int = 1
) -> dict[str, Any] | None:
    """One of the subtopic's written lessons from the bank (migrations 045, 047), or None."""
    rows = await fetch_all(
        conn,
        "SELECT moments, doodles FROM subtopic_lesson_content"
        " WHERE subtopic_id = :sub AND part = :part",
        sub=subtopic_id,
        part=part,
    )
    if not rows:
        return None
    moments = rows[0]["moments"]
    doodles = rows[0]["doodles"]
    return {
        "moments": json.loads(moments) if isinstance(moments, str) else moments,
        "doodles": json.loads(doodles) if isinstance(doodles, str) else (doodles or []),
    }


async def _bank_beats(
    conn: AsyncConnection, subtopic_id: UUID, part: int = 1
) -> tuple[list[Any], list[Any]] | None:
    """The lesson's beats and its doodles: the same lesson for every student (the run's own
    board already went over each question they missed)."""
    from app.lesson_doodles import LessonDoodle
    from app.routers.practice import beats_from_moments

    bank = await _bank_lesson(conn, subtopic_id, part)
    if bank is None:
        return None
    doodles = []
    for raw in bank["doodles"]:
        try:
            doodles.append(LessonDoodle.model_validate(raw))
        except ValueError:
            continue
    return beats_from_moments(bank["moments"]), doodles


@router.get(
    "/{student_id}/lessons/{subtopic_id}/board",
    summary="The subtopic's written lesson, as the board plays it",
)
async def lesson_board(
    student_id: UUID,
    subtopic_id: UUID,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    part: int = 1,
) -> Any:
    """404 when the bank has no lesson for this subtopic yet: the page shows the missed
    questions' working instead."""
    import hashlib

    from app.routers.practice import LessonBeat, NarratedLesson

    await require_student(request, conn, student_id)
    found = await _bank_beats(conn, subtopic_id, part)
    if found is None:
        raise HTTPException(status_code=404, detail="No written lesson for this topic yet.")
    beats, doodles = found
    base = f"/v1/roadmap/{student_id}/lessons/{subtopic_id}/voice"
    return NarratedLesson(
        source="script",
        beats=[
            LessonBeat(
                board_index=beat.board_index,
                write=beat.write,
                write_at=beat.at,
                say=beat.say,
                voice_url=f"{base}/{index}?part={part}"
                f"&v={hashlib.sha256(beat.say.encode()).hexdigest()[:12]}",
                answer=beat.answer,
                point=beat.point,
                show_sketch=beat.show_sketch,
                doodle=beat.doodle,
                doodles=beat.doodles,
                doodle_do=beat.doodle_do,
                on=beat.on,
                section=beat.section,
                mouth=beat.mouth,
                diagram=beat.diagram,
                diagram_do=beat.diagram_do,
            )
            for index, beat in enumerate(beats)
        ],
        doodles=doodles,
    )


async def _said(
    conn: AsyncConnection, student_id: UUID, subtopic_id: UUID, beat: int, part: int = 1
) -> str:
    found = await _bank_beats(conn, subtopic_id, part)
    if found is None or not 0 <= beat < len(found[0]):
        raise HTTPException(status_code=404, detail="no such beat")
    return str(found[0][beat].say)


@router.get("/{student_id}/lessons/{subtopic_id}/voice/{beat}", summary="One beat, spoken")
async def lesson_voice(
    student_id: UUID,
    subtopic_id: UUID,
    beat: int,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    engine: voice_store.Engine = "studio",
    part: int = 1,
) -> Any:
    from fastapi.responses import FileResponse

    await require_student(request, conn, student_id)
    if not (await premium.standing(conn, student_id)).allowance.voice:
        raise HTTPException(status_code=402, detail=premium.PREMIUM_FOR_VOICE)
    path = await voice_store.voiced(
        await _said(conn, student_id, subtopic_id, beat, part), settings, engine=engine
    )
    if path is None:
        raise HTTPException(status_code=404, detail="no voice for this beat")
    return FileResponse(
        path,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Voice-Engine": voice_store.engine_for(engine, settings),
        },
    )


@router.get(
    "/{student_id}/lessons/{subtopic_id}/voice/{beat}/words",
    summary="When each word of one beat is said",
)
async def lesson_voice_words(
    student_id: UUID,
    subtopic_id: UUID,
    beat: int,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    engine: voice_store.Engine = "studio",
    part: int = 1,
) -> dict[str, Any]:
    await require_student(request, conn, student_id)
    said = await _said(conn, student_id, subtopic_id, beat, part)
    if voice_store.engine_for(engine, settings) in voice_store.TIMED:
        await voice_store.voiced(said, settings, engine=engine)
    found = voice_store.timings(said, settings, engine)
    if found is None:
        raise HTTPException(status_code=404, detail="no word timings for this beat")
    return dict(found)


@router.get(
    "/{student_id}/lessons/{subtopic_id}/package",
    summary="The subtopic's whole lesson in one download: its board, voice and word timings",
)
async def lesson_package(
    student_id: UUID,
    subtopic_id: UUID,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    engine: Literal["studio", "kokoro", "inworld", "none"] = "studio",
    part: int = 1,
) -> Any:
    """One file the phone keeps, so the lesson plays to the end with no network (app/
    lesson_package.py). 304 when the phone already has this version (`If-None-Match`).
    Without the voice on the student's plan, the package is the board alone."""
    from fastapi.responses import Response

    from app import lesson_package

    await require_student(request, conn, student_id)
    voice: lesson_package.Voice = engine
    if voice != "none":
        studio_off = voice_store.engine_for(voice, settings) == "studio" and not (
            settings.ai_speak and settings.openai_api_key
        )
        if studio_off or not (await premium.standing(conn, student_id)).allowance.voice:
            voice = "none"
    found = await lesson_package.describe(conn, subtopic_id, settings, voice, part)
    if found is None:
        raise HTTPException(status_code=404, detail="No written lesson for this topic yet.")
    etag = f'"{found.version}"'
    caching = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=caching)
    built = await lesson_package.build(conn, subtopic_id, settings, voice, part=part)
    if built is None:
        raise HTTPException(status_code=404, detail="No written lesson for this topic yet.")
    # The version built, which differs from the one asked about when the voice fell back.
    caching["ETag"] = f'"{built.version}"'
    return Response(
        content=built.data,
        media_type="application/octet-stream",
        headers={
            **(caching if built.complete else {"Cache-Control": "no-store"}),
            "X-Lesson-Complete": "1" if built.complete else "0",
        },
    )
