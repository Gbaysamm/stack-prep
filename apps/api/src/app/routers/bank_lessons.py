"""The Lessons page of the reviewer side: every subtopic's lessons, read and corrected in the app.

A subtopic's lessons are loaded from docs/lessons/subtopics/<subject>/<slug>_N.yaml by
database/load_subtopic_lessons.py. Here a reviewer sees which subtopics have lessons and which
have none, reads a lesson as it is taught (what is said, what is written), and corrects the
words. An edit keeps the lesson's timing sound: the moments stay as they are, every cue word
(`on`) must still be said in its moment, and every mark (`at`) must still be in the line it
marks. The edit is marked (migration 049) so the loader does not overwrite it from the file.

The lesson's package is versioned by a hash of its content, and each voice clip by its words, so
a corrected lesson is rebuilt and re-voiced the next time it is played.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, reviewer_session
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/bank", tags=["bank"], dependencies=[Depends(reviewer_session)])

#: Speech at a teacher's pace, with the board being written: about 130 words a minute.
WORDS_A_MINUTE = 130


def _minutes(moments: list[dict[str, Any]]) -> float:
    words = sum(len(str(m.get("say") or "").split()) for m in moments)
    return round(words / WORDS_A_MINUTE, 1)


class LessonPart(BaseModel):
    part: int
    title: str | None
    moments: int
    minutes: float
    problems: int
    edited_at: datetime | None
    edited_by: str | None


class SubtopicLessons(BaseModel):
    subtopic_id: UUID
    code: str
    name: str
    questions: int
    parts: list[LessonPart]


class TopicLessons(BaseModel):
    name: str
    subtopics: list[SubtopicLessons]


class LessonsPage(BaseModel):
    subject_id: UUID
    subject: str
    exam_id: UUID | None
    exam: str | None
    topics: list[TopicLessons]


@router.get(
    "/subjects/{subject_id}/lessons",
    response_model=LessonsPage,
    summary="A subject's topics and subtopics, with the lessons each has",
)
async def subject_lessons(
    subject_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> LessonsPage:
    found = await fetch_all(
        conn,
        """
        SELECT s.name, e.id AS exam_id, e.short_name AS exam
        FROM subjects s LEFT JOIN examinations e ON e.id = s.examination_id
        WHERE s.id = :subject
        """,
        subject=subject_id,
    )
    if not found:
        raise HTTPException(status_code=404, detail="no such subject")
    rows = await fetch_all(
        conn,
        """
        SELECT sub.id AS subtopic_id, sub.code, sub.name, topic.name AS topic,
               (SELECT count(DISTINCT q.id)
                  FROM curriculum_items skill
                  JOIN question_classifications c
                    ON c.curriculum_item_id = skill.id AND c.classification_role = 'primary'
                  JOIN questions q ON q.id = c.question_id AND q.retired_at IS NULL
                 WHERE skill.parent_id = sub.id) AS questions,
               coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'part', l.part, 'title', l.title, 'moments', l.moments,
                          'problems', jsonb_array_length(l.problems),
                          'edited_at', l.edited_at, 'edited_by', l.edited_by)
                        ORDER BY l.part)
                   FROM subtopic_lesson_content l WHERE l.subtopic_id = sub.id),
                 '[]'::jsonb) AS parts
        FROM curriculum_items sub
        JOIN syllabus_versions sv ON sv.id = sub.syllabus_version_id AND sv.is_current
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        WHERE sub.subject_id = :subject AND sub.item_type = 'subtopic'
        ORDER BY topic.display_order, sub.display_order, sub.code
        """,
        subject=subject_id,
    )
    topics: dict[str, list[SubtopicLessons]] = {}
    for row in rows:
        parts = [
            LessonPart(
                part=p["part"],
                title=p["title"],
                moments=len(p["moments"]),
                minutes=_minutes(p["moments"]),
                problems=p["problems"] or 0,
                edited_at=p["edited_at"],
                edited_by=p["edited_by"],
            )
            for p in row["parts"]
        ]
        topics.setdefault(row["topic"], []).append(
            SubtopicLessons(
                subtopic_id=row["subtopic_id"],
                code=row["code"],
                name=row["name"],
                questions=row["questions"],
                parts=parts,
            )
        )
    return LessonsPage(
        subject_id=subject_id,
        subject=found[0]["name"],
        exam_id=found[0]["exam_id"],
        exam=found[0]["exam"],
        topics=[TopicLessons(name=name, subtopics=subs) for name, subs in topics.items()],
    )


class MomentLine(BaseModel):
    index: int
    section: str | None
    say: str
    write: str | None
    #: The words each mark on this moment's line points at (underline, circle ...).
    marks: list[str]


class Problem(BaseModel):
    ask: str
    answer: str
    working: list[str]


class LessonDetail(BaseModel):
    subtopic_id: UUID
    subtopic: str
    code: str
    part: int
    parts: int
    title: str | None
    source_file: str
    minutes: float
    edited_at: datetime | None
    edited_by: str | None
    moments: list[MomentLine]
    problems: list[Problem]


async def _lesson(conn: AsyncConnection, subtopic_id: UUID, part: int) -> dict[str, Any]:
    rows = await fetch_all(
        conn,
        """
        SELECT l.moments, l.problems, l.title, l.source_file, l.edited_at, l.edited_by,
               sub.name AS subtopic, sub.code,
               (SELECT count(*) FROM subtopic_lesson_content x
                 WHERE x.subtopic_id = l.subtopic_id) AS parts
        FROM subtopic_lesson_content l
        JOIN curriculum_items sub ON sub.id = l.subtopic_id
        WHERE l.subtopic_id = :subtopic AND l.part = :part
        """,
        subtopic=subtopic_id,
        part=part,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no such lesson")
    return rows[0]


def _detail(subtopic_id: UUID, part: int, row: dict[str, Any]) -> LessonDetail:
    moments: list[dict[str, Any]] = row["moments"]
    return LessonDetail(
        subtopic_id=subtopic_id,
        subtopic=row["subtopic"],
        code=row["code"],
        part=part,
        parts=row["parts"],
        title=row["title"],
        source_file=row["source_file"],
        minutes=_minutes(moments),
        edited_at=row["edited_at"],
        edited_by=row["edited_by"],
        moments=[
            MomentLine(
                index=n,
                section=m.get("section"),
                say=str(m.get("say") or ""),
                write=m.get("write") or None,
                marks=[
                    str(p["at"])
                    for p in (m.get("point") or [])
                    if isinstance(p, dict) and p.get("at")
                ],
            )
            for n, m in enumerate(moments)
        ],
        problems=[
            Problem(
                ask=str(p.get("ask") or ""),
                answer=str(p.get("answer") or ""),
                working=[str(w) for w in p.get("working") or []],
            )
            for p in row["problems"] or []
        ],
    )


@router.get(
    "/lessons/{subtopic_id}/{part}",
    response_model=LessonDetail,
    summary="One lesson as it is taught: what is said and what is written",
)
async def lesson(
    subtopic_id: UUID, part: int, conn: Annotated[AsyncConnection, Depends(connection)]
) -> LessonDetail:
    return _detail(subtopic_id, part, await _lesson(conn, subtopic_id, part))


class MomentEdit(BaseModel):
    index: int = Field(ge=0)
    say: str = Field(min_length=1, max_length=900)
    write: str | None = Field(default=None, max_length=300)


class LessonEdit(BaseModel):
    moments: list[MomentEdit] = Field(min_length=1)


def _said(words: str, say: str, nth: int = 1) -> bool:
    found = re.findall(re.escape(words.strip().lower()), say.lower())
    return len(found) >= nth


def _cues(item: object) -> list[tuple[str, int]]:
    """Every cue (`on`, `on_nth`) in a moment, its marks, doodles and actions."""
    found: list[tuple[str, int]] = []
    if isinstance(item, dict):
        words = item.get("on")
        if isinstance(words, str) and words.strip():
            nth = item.get("on_nth")
            found.append((words, nth if isinstance(nth, int) and nth >= 1 else 1))
        for key, value in item.items():
            if key not in ("on", "on_nth"):
                found.extend(_cues(value))
    elif isinstance(item, list):
        for value in item:
            found.extend(_cues(value))
    return found


def check_edit(
    moments: list[dict[str, Any]], edits: list[MomentEdit]
) -> tuple[list[dict[str, Any]], list[str]]:
    """The lesson with the edits made, and every reason it cannot be saved (none when it can)."""
    problems: list[str] = []
    new = json.loads(json.dumps(moments))
    seen: set[int] = set()
    for edit in edits:
        where = f"Moment {edit.index + 1}"
        if edit.index >= len(new) or edit.index in seen:
            problems.append(f"{where}: no such moment.")
            continue
        seen.add(edit.index)
        moment = new[edit.index]
        say = " ".join(edit.say.split())
        write = " ".join((edit.write or "").split())
        if not say:
            problems.append(f"{where}: it must say something.")
        had_write = bool(moment.get("write"))
        if had_write and not write:
            problems.append(f"{where}: it writes a line on the board; the line cannot be empty.")
        if not had_write and write:
            problems.append(
                f"{where}: it writes nothing on the board, so a line cannot be added here."
            )
        for words, nth in _cues(moment):
            if not _said(words, say, nth):
                problems.append(
                    f"{where}: something comes on the board at “{words}”, "
                    "so the voice must still say it."
                )
        for mark in moment.get("point") or []:
            at = mark.get("at") if isinstance(mark, dict) else None
            if (
                isinstance(at, str)
                and at.strip()
                and at.lower() in str(moment.get("write") or "").lower()
                and at.lower() not in write.lower()
            ):
                problems.append(
                    f"{where}: a mark points at “{at}”, so the line must still contain it."
                )
        moment["say"] = say
        if had_write:
            moment["write"] = write
    # A mark on a moment can point at an earlier line: it must still be there.
    lines = " \n ".join(str(m.get("write") or "") for m in new).lower()
    for n, moment in enumerate(new):
        for mark in moment.get("point") or []:
            at = mark.get("at") if isinstance(mark, dict) else None
            if isinstance(at, str) and at.strip() and at.lower() not in lines:
                message = (
                    f"Moment {n + 1}: a mark points at “{at}”, which is no longer on the board."
                )
                if message not in problems:
                    problems.append(message)
    return new, problems


class EditResult(BaseModel):
    saved: bool
    problems: list[str]
    lesson: LessonDetail


@router.put(
    "/lessons/{subtopic_id}/{part}",
    response_model=EditResult,
    summary="Correct what a lesson says and writes, keeping its timing",
)
async def edit_lesson(
    subtopic_id: UUID,
    part: int,
    body: LessonEdit,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> EditResult:
    row = await _lesson(conn, subtopic_id, part)
    moments, problems = check_edit(row["moments"], body.moments)
    if problems:
        return EditResult(saved=False, problems=problems, lesson=_detail(subtopic_id, part, row))
    changed = [e.index for e in body.moments if row["moments"][e.index] != moments[e.index]]
    if not changed:
        return EditResult(
            saved=False, problems=["Nothing was changed."], lesson=_detail(subtopic_id, part, row)
        )
    await conn.execute(
        text(
            """
            UPDATE subtopic_lesson_content
               SET moments = CAST(:moments AS jsonb), updated_at = now(),
                   edited_at = now(), edited_by = :who
             WHERE subtopic_id = :subtopic AND part = :part
            """
        ),
        {
            "moments": json.dumps(moments),
            "who": staff.display_name,
            "subtopic": subtopic_id,
            "part": part,
        },
    )
    await audit.record(
        conn,
        staff,
        "bank.lesson.edit",
        f"Edited {len(changed)} moment(s) of {row['subtopic']}, lesson {part}",
        target_kind="lesson",
        target_id=f"{subtopic_id}:{part}",
        detail={"moments": changed, "file": row["source_file"]},
    )
    await conn.commit()
    return EditResult(
        saved=True,
        problems=[],
        lesson=_detail(subtopic_id, part, await _lesson(conn, subtopic_id, part)),
    )
