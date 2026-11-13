"""AI-written questions brought in as JSON (founder, 13 Nov 2026).

Questions written by an outside AI (pasted from another tool, or written with the plan's API
credit) come in here, into an AI-generated set of our own (migration 048), never a past paper.
The format and the prompt for the outside AI are in docs/questions/ai-question-format.md.

Two guards the founder asked for:

- **No invented subtopics.** Every question names a subtopic by its code from the subject's
  syllabus (`CHEM.1.a`), which the outside AI is given in the prompt
  (`GET /v1/bank/subjects/{id}/subtopics`). A code that is not in the syllabus is refused with
  its reason; nothing is ever created from an import.
- **A person checks every one.** Imported questions are drafts whose answer, working and level
  are "model proposed": the database will not let one be approved, or served, until a reviewer
  has checked them (`question_versions` constraints).

`apply: false` checks the batch and returns each question's verdict without saving anything;
`apply: true` saves the questions that pass and reports the rest.
"""

from __future__ import annotations

import base64
import json
import re
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, reviewer_session
from app.db import connection, fetch_all
from app.routers.bank import OptionIn, QuestionIn, _content_hash, _one, _set_skill

router = APIRouter(prefix="/v1/bank", tags=["bank"], dependencies=[Depends(reviewer_session)])

#: How many questions one import may carry (a subject's thin subtopics, in batches).
MAX_BATCH = 200
#: A drawn figure, at most: about 60 KB of SVG.
MAX_SVG = 60_000
_UNSAFE_SVG = re.compile(
    r"<script|\son\w+\s*=|javascript:|<foreignObject|xlink:href\s*=\s*[\"']?https?:", re.I
)


class SubtopicLine(BaseModel):
    code: str
    name: str
    topic: str
    #: What the syllabus says the subtopic covers, for the outside AI's prompt.
    covers: str | None
    questions: int


@router.get(
    "/subjects/{subject_id}/subtopics",
    response_model=list[SubtopicLine],
    summary="A subject's subtopics, their codes and how many questions each has",
)
async def subtopics(
    subject_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[SubtopicLine]:
    rows = await fetch_all(
        conn,
        """
        SELECT sub.code, sub.name, topic.name AS topic,
               nullif(concat_ws(' ', sub.learning_objective, sub.examinable_scope), '') AS covers,
               count(DISTINCT q.id) FILTER (WHERE q.retired_at IS NULL) AS questions
        FROM curriculum_items sub
        JOIN syllabus_versions sv ON sv.id = sub.syllabus_version_id AND sv.is_current
        JOIN curriculum_items topic ON topic.id = sub.parent_id
        LEFT JOIN curriculum_items skill ON skill.parent_id = sub.id
        LEFT JOIN question_classifications c
          ON c.curriculum_item_id = skill.id AND c.classification_role = 'primary'
        LEFT JOIN questions q ON q.id = c.question_id
        WHERE sub.subject_id = :subject AND sub.item_type = 'subtopic'
        GROUP BY sub.id, sub.code, sub.name, topic.name, topic.display_order, sub.display_order
        ORDER BY topic.display_order, sub.display_order, sub.code
        """,
        subject=subject_id,
    )
    return [SubtopicLine(**row) for row in rows]


class ImportIn(BaseModel):
    questions: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_BATCH)
    #: False: check only, nothing saved. True: save the questions that pass.
    apply: bool = False


class Verdict(BaseModel):
    index: int
    ok: bool
    problems: list[str]
    #: Things a reviewer must still do (a figure to draw), when it is otherwise sound.
    notes: list[str]
    subtopic: str | None
    stem: str | None
    question_id: UUID | None = None


class ImportOut(BaseModel):
    checked: int
    passed: int
    saved: int
    verdicts: list[Verdict]


def _text(value: Any) -> str:
    return " ".join(str(value).split()) if isinstance(value, str | int | float) else ""


def _read(
    raw: dict[str, Any], skills: dict[str, tuple[UUID, str]]
) -> tuple[dict[str, Any], list[str], list[str]]:
    """One question, as the bank stores it, and what is wrong with it."""
    problems: list[str] = []
    notes: list[str] = []
    code = _text(raw.get("subtopic"))
    if not code:
        problems.append("No subtopic code.")
    elif code not in skills:
        problems.append(f"Subtopic code {code} is not in this subject's syllabus.")
    stem = str(raw.get("stem") or "").strip()
    if not stem:
        problems.append("No question (stem).")
    options = raw.get("options")
    keys: list[str] = []
    bodies: dict[str, str] = {}
    if not isinstance(options, dict) or not 2 <= len(options) <= 6:
        problems.append("Options must be an object of two to six lettered options, A to D.")
    else:
        for key, body in options.items():
            key = str(key).strip().upper()
            if key not in "ABCDEF" or len(key) != 1:
                problems.append(f"Option {key!r} is not a letter A to F.")
            elif not str(body).strip():
                problems.append(f"Option {key} is empty.")
            else:
                keys.append(key)
                bodies[key] = str(body).strip()
        if len(set(bodies.values())) != len(bodies):
            problems.append("Two options are the same.")
    answer = _text(raw.get("answer")).upper()
    if answer not in bodies:
        problems.append(f"The answer {answer or '(none)'} is not one of the options.")
    steps = raw.get("steps") or []
    if not isinstance(steps, list) or not [s for s in steps if str(s).strip()]:
        problems.append("No worked steps.")
        steps = []
    why = raw.get("why") or {}
    if not isinstance(why, dict):
        problems.append("`why` must be an object: a reason for each wrong option.")
        why = {}
    for key in keys:
        if key != answer and not str(why.get(key) or "").strip():
            problems.append(f"No reason why option {key} is wrong.")
    level = raw.get("level")
    if level is not None and (
        isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= 5
    ):
        problems.append("Level must be a whole number 1 to 5.")
        level = None
    svg = raw.get("figure_svg")
    needed = _text(raw.get("figure_needed"))
    if svg is not None:
        svg = str(svg).strip()
        if not svg.startswith("<svg") or "</svg>" not in svg:
            problems.append("figure_svg must be one <svg>…</svg> drawing.")
        elif len(svg) > MAX_SVG:
            problems.append("figure_svg is too large (keep it under 60 KB).")
        elif _UNSAFE_SVG.search(svg):
            problems.append("figure_svg holds scripts or links; drawings only.")
    if needed and not svg:
        notes.append(f"Figure needed: {needed}. Held back until a reviewer adds the drawing.")
    if needed and not svg:
        stem = f"[Figure needed: {needed}] {stem}"
    question = {
        "code": code,
        "stem": stem,
        "options": [(k, bodies[k]) for k in sorted(bodies)],
        "answer": answer,
        "steps": [str(s).strip() for s in steps if str(s).strip()],
        "hint": str(raw.get("hint") or "").strip(),
        "why": {k: str(v).strip() for k, v in why.items()},
        "level": level,
        "svg": svg,
        "alt": _text(raw.get("figure_alt")) or "A diagram for the question.",
    }
    return question, problems, notes


@router.post(
    "/papers/{paper_id}/import",
    response_model=ImportOut,
    summary="Check, or bring in, AI-written questions (JSON)",
)
async def import_questions(
    paper_id: UUID,
    body: ImportIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> ImportOut:
    paper = await _one(
        conn,
        "SELECT id, subject_id, own, ai_generated, exam_year, paper_code FROM exam_papers"
        " WHERE id = :id AND status <> 'retired'",
        "We couldn't find that set.",
        id=paper_id,
    )
    if not paper["ai_generated"]:
        raise HTTPException(
            status_code=409,
            detail="Questions are imported only into an AI-generated set, never a past paper.",
        )
    subject_id = paper["subject_id"]
    skills = {
        str(r["code"]): (r["skill_id"], str(r["name"]))
        for r in await fetch_all(
            conn,
            """
            SELECT sub.code, sub.name, min(skill.id::text)::uuid AS skill_id
            FROM curriculum_items sub
            JOIN syllabus_versions sv ON sv.id = sub.syllabus_version_id AND sv.is_current
            JOIN curriculum_items skill ON skill.parent_id = sub.id AND skill.item_type = 'skill'
            WHERE sub.subject_id = :s AND sub.item_type = 'subtopic'
            GROUP BY sub.code, sub.name
            """,
            s=subject_id,
        )
    }
    seen: set[str] = set()
    verdicts: list[Verdict] = []
    passed: list[tuple[int, dict[str, Any]]] = []
    for index, raw in enumerate(body.questions):
        if not isinstance(raw, dict):
            verdicts.append(
                Verdict(
                    index=index,
                    ok=False,
                    problems=["Not a question object."],
                    notes=[],
                    subtopic=None,
                    stem=None,
                )
            )
            continue
        question, problems, notes = _read(raw, skills)
        key = " ".join(question["stem"].lower().split())
        if key and key in seen:
            problems.append("The same question appears twice in this batch.")
        seen.add(key)
        name = skills.get(question["code"], (None, None))[1]
        verdicts.append(
            Verdict(
                index=index,
                ok=not problems,
                problems=problems,
                notes=notes,
                subtopic=f"{question['code']} {name}" if name else question["code"] or None,
                stem=question["stem"][:240] or None,
            )
        )
        if not problems:
            passed.append((index, question))
    saved = 0
    if body.apply and passed:
        count = (
            await fetch_all(
                conn, "SELECT count(*) AS n FROM questions WHERE exam_paper_id = :p", p=paper_id
            )
        )[0]["n"]
        for index, q in passed:
            count += 1
            verdicts[index].question_id = await _save(conn, paper, q, str(count), skills, staff)
            saved += 1
        await audit.record(
            conn,
            staff,
            "bank.question.import",
            f"Imported {saved} AI-written question(s) into {paper['paper_code']}",
            target_kind="paper",
            target_id=str(paper_id),
        )
        await conn.commit()
    return ImportOut(
        checked=len(body.questions), passed=len(passed), saved=saved, verdicts=verdicts
    )


async def _save(
    conn: AsyncConnection,
    paper: dict[str, Any],
    q: dict[str, Any],
    number: str,
    skills: dict[str, tuple[UUID, str]],
    staff: Staff,
) -> UUID:
    subject_id = paper["subject_id"]
    question_id, version_id = uuid4(), uuid4()
    shaped = QuestionIn(
        stem=q["stem"],
        options=[OptionIn(key=k, body=b) for k, b in q["options"]],
        answer=q["answer"],
    )
    await conn.execute(
        text(
            """
            INSERT INTO questions (id, subject_id, exam_paper_id, origin, exam_year, paper_code,
              question_number, usage_pool, created_by)
            VALUES (:id, :subject, :paper, 'authored', NULL, :code, :number, 'practice',
                    :reviewer)
            """
        ),
        {
            "id": question_id,
            "subject": subject_id,
            "paper": paper["id"],
            "code": paper["paper_code"],
            "number": number,
            "reviewer": staff.reviewer_id,
        },
    )
    await conn.execute(
        text(
            """
            INSERT INTO question_versions (id, question_id, subject_id, version, stem,
              response_format, marking_method, solution_steps, solution_source, hints,
              expected_seconds, option_count, content_hash, authored_by, answer_source,
              mastery_level_number, level_source, review_status)
            VALUES (:v, :q, :subject, 1, :stem, 'mcq_single', 'auto_key', CAST(:steps AS jsonb),
                    'model_proposed', CAST(:hints AS jsonb), 60, :options, :hash, :reviewer,
                    'model_proposed', :level, 'unverified', 'draft')
            """
        ),
        {
            "v": version_id,
            "q": question_id,
            "subject": subject_id,
            "stem": q["stem"],
            "steps": json.dumps(q["steps"]),
            "hints": json.dumps([q["hint"]] if q["hint"] else []),
            "options": len(q["options"]),
            "hash": _content_hash(shaped),
            "reviewer": staff.reviewer_id,
            "level": q["level"],
        },
    )
    for position, (key, option) in enumerate(q["options"], start=1):
        await conn.execute(
            text(
                """
                INSERT INTO question_options (question_version_id, subject_id, option_key, body,
                  is_correct, distractor_note, display_order)
                VALUES (:v, :subject, :key, :body, :right, :note, :position)
                """
            ),
            {
                "v": version_id,
                "subject": subject_id,
                "key": key,
                "body": option,
                "right": key == q["answer"],
                "note": q["why"].get(key) or None,
                "position": position,
            },
        )
    if q["svg"]:
        data = q["svg"].encode()
        await conn.execute(
            text(
                """
                INSERT INTO question_assets (question_version_id, storage_uri, mime_type,
                  byte_size, alt_text, alt_text_source, source_location, licence_status,
                  display_order)
                VALUES (:v, :uri, 'image/svg+xml', :size, :alt, 'model_proposed',
                        'AI-written figure, imported', 'pending', 0)
                """
            ),
            {
                "v": version_id,
                "uri": "data:image/svg+xml;base64," + base64.b64encode(data).decode(),
                "size": len(data),
                "alt": q["alt"],
            },
        )
    await conn.execute(
        text("UPDATE questions SET current_version_id = :v WHERE id = :q"),
        {"v": version_id, "q": question_id},
    )
    await _set_skill(conn, question_id, subject_id, skills[q["code"]][0], staff.reviewer_id)
    return question_id
