"""After a subtopic lesson (docs/lessons/subtopic-lesson-guide.md §9, founder 12 Nov 2026).

The student rates how well they understood, tries the lesson's one or two short problems (a
typed answer, marked against the answer key; or a photo of the working, marked by the coach),
and asks the coach their own questions. The conversation is kept: coming back to the lesson
shows it, and the coach is sent it with each new question (app/lesson_coach.py).

The answer and the working of a problem are sent only once the student has tried it.
Questions to the coach and photos marked by it come out of the same daily allowance as the
coach's answers in a run (premium.coach_allowance), so a lesson is not a way round the budget.
"""

from __future__ import annotations

import json
import re
from fractions import Fraction
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import app_settings, lesson_coach, premium
from app.auth import require_student
from app.config import Settings, get_settings
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/roadmap", tags=["roadmap"])

#: A photo of working: what a phone camera makes, small enough to send on.
PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
PHOTO_MAX_BYTES = 8 * 1024 * 1024
ASK_MAX_CHARS = 600


class Tried(BaseModel):
    correct: bool | None
    feedback: str
    answer_text: str | None
    by_photo: bool
    #: The expected answer and its working: sent once the student has tried.
    answer: str
    working: list[str]


class ProblemOut(BaseModel):
    ask: str
    needs_working: bool
    tried: Tried | None


class Turn(BaseModel):
    asked: str
    reply: str


class AfterOut(BaseModel):
    title: str
    subject: str
    problems: list[ProblemOut]
    rating: int | None
    conversation: list[Turn]
    #: The coach is on, and on this student's plan.
    can_ask: bool
    asks_left: int


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=3)


class AnswerIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=ASK_MAX_CHARS)


class AskOut(BaseModel):
    reply: str
    source: str
    asks_left: int


async def _lesson(conn: AsyncConnection, subtopic_id: UUID, part: int) -> dict[str, Any]:
    """One of the subtopic's lessons (migration 047: a subtopic may have several)."""
    rows = await fetch_all(
        conn,
        """
        SELECT c.moments, c.problems, coalesce(c.title, sub.name) AS title, s.name AS subject
        FROM subtopic_lesson_content c
        JOIN curriculum_items sub ON sub.id = c.subtopic_id
        JOIN subjects s ON s.id = sub.subject_id
        WHERE c.subtopic_id = :sub AND c.part = :part
        """,
        sub=subtopic_id,
        part=part,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No written lesson for this topic yet.")
    row = rows[0]

    def loaded(value: Any) -> Any:
        return json.loads(value) if isinstance(value, str) else value

    return {
        "moments": loaded(row["moments"]),
        "problems": loaded(row["problems"]) or [],
        "title": str(row["title"]),
        "subject": str(row["subject"]),
    }


def _problem(lesson: dict[str, Any], index: int) -> dict[str, Any]:
    problems = lesson["problems"]
    if not 0 <= index < len(problems):
        raise HTTPException(status_code=404, detail="No such problem.")
    return dict(problems[index])


# ---------------------------------------------------------------- marking a typed answer

_SPACE = re.compile(r"\s+")


def _plain(answer: str) -> str:
    """An answer as it is compared: case, spaces, $ and the usual ways of typing a sign gone."""
    s = answer.strip().lower().replace("$", "")
    signs = (
        ("\u2212", "-"),
        ("\u2013", "-"),
        ("\u00d7", "x"),
        ("\u00f7", "/"),
        ("^", ""),
        ("**", ""),
    )
    for a, b in signs:
        s = s.replace(a, b)
    s = re.sub(r"^[a-z]\s*=\s*", "", s)  # "x = 4" is 4
    s = re.sub(r"^\(?([a-e])\)?[.)]?$", r"\1", s)  # "(b)", "b." are b
    return _SPACE.sub("", s)


def _number(answer: str) -> Fraction | None:
    s = _plain(answer).replace(",", "")
    try:
        return Fraction(s)
    except (ValueError, ZeroDivisionError):
        return None


def matches(typed: str, answer: str, accept: list[str]) -> bool:
    """Is the typed answer one of the right ones? Numbers compare by value (0.5 is 1/2)."""
    wanted = [answer, *accept]
    plain = _plain(typed)
    if any(plain == _plain(right) for right in wanted):
        return True
    value = _number(typed)
    if value is None:
        return False
    for right in wanted:
        target = _number(right)
        if target is not None and abs(value - target) <= abs(target) * Fraction(1, 1000):
            return True
    return False


# ---------------------------------------------------------------- the coach's budget


async def _coach_left(
    conn: AsyncConnection, student_id: UUID, settings: Settings
) -> tuple[bool, int]:
    """Whether the coach is open to this student, and how many turns are left today: the
    run's questions, the lesson's questions and its photos marked, together."""
    if not await app_settings.get(conn, "coach_enabled"):
        return False, 0
    standing = await premium.standing(conn, student_id)
    if standing.allowance.coach_per_day == 0:
        return False, 0
    allowance = await premium.coach_allowance(conn, student_id, settings.ai_daily_calls_per_student)
    rows = await fetch_all(
        conn,
        """
        WITH today AS (
          SELECT date_trunc('day', now() AT TIME ZONE coalesce(s.timezone, 'UTC'))
                   AT TIME ZONE coalesce(s.timezone, 'UTC') AS since
          FROM students s WHERE s.id = :s
        )
        SELECT
          (SELECT count(*) FROM tutor_turns t, today WHERE t.student_id = :s
             AND t.asked_at >= today.since)
          + (SELECT count(*) FROM lesson_coach_turns t, today WHERE t.student_id = :s
             AND t.asked_at >= today.since)
          + (SELECT count(*) FROM lesson_problem_attempts a, today WHERE a.student_id = :s
             AND a.marked_by = 'coach' AND a.tried_at >= today.since) AS used
        """,
        s=student_id,
    )
    used = int(rows[0]["used"]) if rows else 0
    return True, max(0, allowance - used)


# ---------------------------------------------------------------- the page


@router.get(
    "/{student_id}/lessons/{subtopic_id}/after",
    response_model=AfterOut,
    summary="After the lesson: its problems, the rating, the conversation with the coach",
)
async def after(
    student_id: UUID,
    subtopic_id: UUID,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    part: int = 1,
) -> AfterOut:
    await require_student(request, conn, student_id)
    lesson = await _lesson(conn, subtopic_id, part)
    tried = await fetch_all(
        conn,
        """
        SELECT DISTINCT ON (problem_index) problem_index, correct, feedback, answer_text,
               by_photo
        FROM lesson_problem_attempts
        WHERE student_id = :s AND subtopic_id = :sub AND part = :part
        ORDER BY problem_index, tried_at DESC
        """,
        s=student_id,
        sub=subtopic_id,
        part=part,
    )
    last = {int(r["problem_index"]): r for r in tried}
    problems = []
    for n, problem in enumerate(lesson["problems"]):
        row = last.get(n)
        problems.append(
            ProblemOut(
                ask=problem["ask"],
                needs_working=bool(problem.get("needs_working")),
                tried=None
                if row is None
                else Tried(
                    correct=row["correct"],
                    feedback=row["feedback"],
                    answer_text=row["answer_text"],
                    by_photo=row["by_photo"],
                    answer=problem["answer"],
                    working=list(problem.get("working") or []),
                ),
            )
        )
    rating = await fetch_all(
        conn,
        "SELECT rating FROM lesson_ratings WHERE student_id = :s AND subtopic_id = :sub"
        " AND part = :part ORDER BY rated_at DESC LIMIT 1",
        s=student_id,
        sub=subtopic_id,
        part=part,
    )
    turns = await fetch_all(
        conn,
        "SELECT asked, reply FROM lesson_coach_turns WHERE student_id = :s AND subtopic_id = :sub"
        " AND part = :part ORDER BY asked_at",
        s=student_id,
        sub=subtopic_id,
        part=part,
    )
    can_ask, left = await _coach_left(conn, student_id, settings)
    return AfterOut(
        title=lesson["title"],
        subject=lesson["subject"],
        problems=problems,
        rating=int(rating[0]["rating"]) if rating else None,
        conversation=[Turn(asked=t["asked"], reply=t["reply"]) for t in turns],
        can_ask=can_ask,
        asks_left=left,
    )


@router.post("/{student_id}/lessons/{subtopic_id}/rating", status_code=204)
async def rate(
    student_id: UUID,
    subtopic_id: UUID,
    body: RatingIn,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    part: int = 1,
) -> None:
    """How well the student says they understood: 1 not yet, 2 mostly, 3 got it."""
    await require_student(request, conn, student_id)
    await _lesson(conn, subtopic_id, part)
    await conn.execute(
        text(
            "INSERT INTO lesson_ratings (student_id, subtopic_id, part, rating)"
            " VALUES (:s, :sub, :part, :r)"
        ),
        {"s": student_id, "sub": subtopic_id, "part": part, "r": body.rating},
    )
    await conn.commit()


async def _record(
    conn: AsyncConnection,
    student_id: UUID,
    subtopic_id: UUID,
    part: int,
    index: int,
    answer_text: str | None,
    marked: lesson_coach.Marked,
) -> None:
    await conn.execute(
        text(
            """
            INSERT INTO lesson_problem_attempts (student_id, subtopic_id, part, problem_index,
              answer_text, by_photo, correct, feedback, marked_by, input_tokens, output_tokens)
            VALUES (:s, :sub, :part, :i, :typed, :photo, :correct, :feedback, :by, :tin, :tout)
            """
        ),
        {
            "s": student_id,
            "sub": subtopic_id,
            "part": part,
            "i": index,
            "typed": answer_text,
            "photo": answer_text is None,
            "correct": marked.correct,
            "feedback": marked.feedback,
            "by": marked.source,
            "tin": marked.input_tokens,
            "tout": marked.output_tokens,
        },
    )
    await conn.commit()


def _tried(problem: dict[str, Any], marked: lesson_coach.Marked, typed: str | None) -> Tried:
    return Tried(
        correct=marked.correct,
        feedback=marked.feedback,
        answer_text=typed,
        by_photo=typed is None,
        answer=problem["answer"],
        working=list(problem.get("working") or []),
    )


@router.post(
    "/{student_id}/lessons/{subtopic_id}/problems/{index}/answer",
    response_model=Tried,
    summary="A typed answer to one of the lesson's problems, marked against its answer key",
)
async def answer_problem(
    student_id: UUID,
    subtopic_id: UUID,
    index: int,
    body: AnswerIn,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    part: int = 1,
) -> Tried:
    await require_student(request, conn, student_id)
    problem = _problem(await _lesson(conn, subtopic_id, part), index)
    right = matches(body.text, problem["answer"], list(problem.get("accept") or []))
    feedback = (
        "Correct."
        if right
        else "Not quite. Look at the working below, step by step, and see where yours differs."
    )
    marked = lesson_coach.Marked(right, feedback, "key")
    await _record(conn, student_id, subtopic_id, part, index, body.text.strip(), marked)
    return _tried(problem, marked, body.text.strip())


@router.post(
    "/{student_id}/lessons/{subtopic_id}/problems/{index}/photo",
    response_model=Tried,
    summary="A photo of the working on one of the lesson's problems, marked by the coach",
)
async def photo_problem(
    student_id: UUID,
    subtopic_id: UUID,
    index: int,
    photo: Annotated[UploadFile, File()],
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    part: int = 1,
) -> Tried:
    """The photo is read and dropped inside this request; only the marking is kept."""
    await require_student(request, conn, student_id)
    lesson = await _lesson(conn, subtopic_id, part)
    problem = _problem(lesson, index)
    mime = (photo.content_type or "").lower()
    if mime not in PHOTO_TYPES:
        raise HTTPException(status_code=415, detail="Send a photo (JPEG or PNG).")
    data = await photo.read(PHOTO_MAX_BYTES + 1)
    if len(data) > PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="That photo is too large. Try a smaller one.")
    open_, left = await _coach_left(conn, student_id, settings)
    if not open_:
        raise HTTPException(
            status_code=402, detail="Marking a photo of your working comes with a plan."
        )
    if left <= 0:
        marked = lesson_coach.Marked(
            None,
            "You've used today's questions to the coach. Compare your working with the working "
            "shown, step by step.",
            "fallback",
        )
    else:
        marked = await lesson_coach.mark_photo(
            subtopic=lesson["title"],
            subject=lesson["subject"],
            problem=problem,
            photo=data,
            mime=mime,
            settings=settings,
        )
    await _record(conn, student_id, subtopic_id, part, index, None, marked)
    return _tried(problem, marked, None)


@router.post(
    "/{student_id}/lessons/{subtopic_id}/ask",
    response_model=AskOut,
    summary="Ask the coach about the lesson; the conversation is kept and sent with it",
)
async def ask(
    student_id: UUID,
    subtopic_id: UUID,
    body: AskIn,
    request: Request,
    conn: Annotated[AsyncConnection, Depends(connection)],
    settings: Annotated[Settings, Depends(get_settings)],
    part: int = 1,
) -> AskOut:
    await require_student(request, conn, student_id)
    lesson = await _lesson(conn, subtopic_id, part)
    open_, left = await _coach_left(conn, student_id, settings)
    if not open_:
        raise HTTPException(status_code=402, detail="Asking the coach comes with a plan.")
    asked = body.question.strip()
    if left <= 0:
        reply = lesson_coach.Reply(
            text="You've used today's questions to the coach. They come back tomorrow.",
            source="budget",
        )
    else:
        history = await fetch_all(
            conn,
            "SELECT asked, reply FROM lesson_coach_turns WHERE student_id = :s"
            " AND subtopic_id = :sub AND part = :part AND source = 'model' ORDER BY asked_at",
            s=student_id,
            sub=subtopic_id,
            part=part,
        )
        lines = [str(m["write"]) for m in lesson["moments"] if m.get("write")]
        reply = await lesson_coach.answer(
            subtopic=lesson["title"],
            subject=lesson["subject"],
            lines=lines,
            history=[(str(h["asked"]), str(h["reply"])) for h in history],
            asked=asked,
            settings=settings,
        )
    await conn.execute(
        text(
            """
            INSERT INTO lesson_coach_turns (student_id, subtopic_id, part, asked, reply, source,
              input_tokens, output_tokens)
            VALUES (:s, :sub, :part, :asked, :reply, :source, :tin, :tout)
            """
        ),
        {
            "s": student_id,
            "sub": subtopic_id,
            "part": part,
            "asked": asked,
            "reply": reply.text,
            "source": reply.source,
            "tin": reply.input_tokens or 0,
            "tout": reply.output_tokens or 0,
        },
    )
    await conn.commit()
    return AskOut(
        reply=reply.text,
        source=reply.source,
        asks_left=max(0, left - 1) if reply.source == "model" else left,
    )
