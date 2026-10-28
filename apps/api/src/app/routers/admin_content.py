"""The admin dashboard's content and activity pages: subjects and their topics, the question
bank, question quality, and every mock and check-up sat. Everything here needs an admin.

Question quality looks for the questions most likely to be wrong or badly taught: the most
missed, the most reported, the lessons students said didn't help, and, most telling, questions
where more students chose one wrong option than the keyed answer, which is often a wrong key.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncConnection

from app.auth import admin_session
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(admin_session)])

#: A question's topic: its skill's parent (a subtopic, which students call a topic), whose
#: parent is the section.
TOPIC_JOIN = """
    LEFT JOIN curriculum_items sk ON sk.id = d.primary_skill_id
    LEFT JOIN curriculum_items st ON st.id = sk.parent_id
    LEFT JOIN curriculum_items sec ON sec.id = st.parent_id
"""

#: Answers to a version: how many, and how many right. First tries only would be stricter;
#: every answer is what the student-facing accuracy uses.
STATS_JOIN = """
    LEFT JOIN LATERAL (
      SELECT count(*) AS answered, count(*) FILTER (WHERE a.is_correct) AS right_count
      FROM attempts a WHERE a.question_version_id = d.question_version_id
    ) stats ON TRUE
"""


def _pct(right: Any, answered: Any) -> int | None:
    return round(100 * int(right) / int(answered)) if answered else None


# ------------------------------------------------------------------ subjects and topics


class SubjectContent(BaseModel):
    subject_id: UUID
    name: str
    examination: str
    questions: int
    topics: int
    years: int
    with_working: int
    answered: int
    accuracy: int | None
    open_reports: int
    students: int


@router.get("/content/subjects", response_model=list[SubjectContent], summary="Each subject")
async def subjects(
    conn: Annotated[AsyncConnection, Depends(connection)],
) -> list[SubjectContent]:
    rows = await fetch_all(
        conn,
        f"""
        SELECT sub.id AS subject_id, sub.name, e.short_name AS examination,
               count(DISTINCT d.question_version_id) AS questions,
               count(DISTINCT st.id) AS topics,
               count(DISTINCT q.exam_year) AS years,
               count(DISTINCT d.question_version_id) FILTER (
                 WHERE jsonb_array_length(coalesce(v.solution_steps, '[]'::jsonb)) > 0)
                 AS with_working,
               coalesce(sum(stats.answered), 0) AS answered,
               coalesce(sum(stats.right_count), 0) AS right_count,
               (SELECT count(*) FROM question_reports r
                  JOIN question_versions rv ON rv.id = r.question_version_id
                 WHERE rv.subject_id = sub.id AND r.status IN ('open', 'triaged'))
                 AS open_reports,
               (SELECT count(DISTINCT g.student_id) FROM student_exam_goals g
                 WHERE g.subject_id = sub.id AND g.status = 'active') AS students
        FROM subjects sub
        JOIN examinations e ON e.id = sub.examination_id
        JOIN deliverable_questions d ON d.subject_id = sub.id
        JOIN questions q ON q.id = d.question_id
        JOIN question_versions v ON v.id = d.question_version_id
        {TOPIC_JOIN}
        {STATS_JOIN}
        GROUP BY sub.id, sub.name, e.short_name
        ORDER BY sub.name
        """,
    )
    return [
        SubjectContent(
            **{k: v for k, v in row.items() if k != "right_count"},
            accuracy=_pct(row["right_count"], row["answered"]),
        )
        for row in rows
    ]


class TopicContent(BaseModel):
    topic_id: UUID
    name: str
    section: str | None
    questions: int
    answered: int
    accuracy: int | None
    first_year: int | None
    last_year: int | None


@router.get(
    "/content/subjects/{subject_id}",
    response_model=list[TopicContent],
    summary="A subject's topics",
)
async def topics(
    subject_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[TopicContent]:
    rows = await fetch_all(
        conn,
        f"""
        SELECT st.id AS topic_id, st.name, sec.name AS section,
               count(DISTINCT d.question_version_id) AS questions,
               coalesce(sum(stats.answered), 0) AS answered,
               coalesce(sum(stats.right_count), 0) AS right_count,
               min(q.exam_year) AS first_year, max(q.exam_year) AS last_year
        FROM deliverable_questions d
        JOIN questions q ON q.id = d.question_id
        {TOPIC_JOIN}
        {STATS_JOIN}
        WHERE d.subject_id = :subject AND st.id IS NOT NULL
        GROUP BY st.id, st.name, sec.name, sec.code, st.code
        ORDER BY sec.code NULLS LAST, st.code
        """,
        subject=subject_id,
    )
    return [
        TopicContent(
            **{k: v for k, v in row.items() if k != "right_count"},
            accuracy=_pct(row["right_count"], row["answered"]),
        )
        for row in rows
    ]


# ------------------------------------------------------------------ question bank


class BankQuestion(BaseModel):
    question_id: UUID
    question_version_id: UUID
    subject_name: str
    topic_name: str | None
    exam_year: int | None
    question_number: str | None
    stem: str
    review_status: str
    answered: int
    accuracy: int | None
    open_reports: int


class BankPage(BaseModel):
    total: int
    questions: list[BankQuestion]


BankSort = Literal["paper", "most_answered", "least_accurate", "most_reported"]
BANK_ORDER = {
    "paper": "q.exam_year DESC NULLS LAST, length(q.question_number), q.question_number",
    "most_answered": "answered DESC, q.exam_year DESC",
    "least_accurate": "(CASE WHEN answered = 0 THEN 2 ELSE right_count::float / answered END),"
                      " answered DESC",
    "most_reported": "open_reports DESC, answered DESC",
}


@router.get("/questions", response_model=BankPage, summary="Search the question bank")
async def questions(
    conn: Annotated[AsyncConnection, Depends(connection)],
    q: Annotated[str | None, Query(max_length=120)] = None,
    subject_id: UUID | None = None,
    topic_id: UUID | None = None,
    exam_year: int | None = None,
    sort: BankSort = "paper",
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BankPage:
    conditions = ["TRUE"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if q and q.strip():
        conditions.append("(v.stem ILIKE :q OR q.question_number = :exact)")
        params["q"] = f"%{q.strip()}%"
        params["exact"] = q.strip()
    if subject_id:
        conditions.append("d.subject_id = :subject")
        params["subject"] = subject_id
    if topic_id:
        conditions.append("st.id = :topic")
        params["topic"] = topic_id
    if exam_year:
        conditions.append("q.exam_year = :year")
        params["year"] = exam_year
    base = f"""
        FROM deliverable_questions d
        JOIN questions q ON q.id = d.question_id
        JOIN question_versions v ON v.id = d.question_version_id
        JOIN subjects sub ON sub.id = d.subject_id
        {TOPIC_JOIN}
        WHERE {" AND ".join(conditions)}
    """
    total = (await fetch_all(conn, f"SELECT count(*) AS n {base}", **params))[0]["n"]
    rows = await fetch_all(
        conn,
        f"""
        SELECT * FROM (
          SELECT d.question_id, d.question_version_id, sub.name AS subject_name,
                 st.name AS topic_name, q.exam_year, q.question_number, v.stem, v.review_status,
                 coalesce(stats.answered, 0) AS answered,
                 coalesce(stats.right_count, 0) AS right_count,
                 (SELECT count(*) FROM question_reports r
                   WHERE r.question_version_id = d.question_version_id
                     AND r.status IN ('open', 'triaged')) AS open_reports
          {base.replace("WHERE", STATS_JOIN + " WHERE", 1)}
        ) found
        ORDER BY {BANK_ORDER[sort].replace("q.", "found.")}
        LIMIT :limit OFFSET :offset
        """,
        **params,
    )
    return BankPage(
        total=int(total),
        questions=[
            BankQuestion(
                **{k: v for k, v in row.items() if k != "right_count"},
                accuracy=_pct(row["right_count"], row["answered"]),
            )
            for row in rows
        ],
    )


class OptionStat(BaseModel):
    option_key: str
    body: str
    is_correct: bool
    chosen: int


class ReportLine(BaseModel):
    reason: str
    detail: str | None
    status: str
    created_at: datetime


class QuestionInDepth(BaseModel):
    question_id: UUID
    question_version_id: UUID
    subject_name: str
    topic_name: str | None
    section_name: str | None
    exam_year: int | None
    question_number: str | None
    instructions: str | None
    stem: str
    review_status: str
    solution_steps: list[str]
    hints: list[str]
    options: list[OptionStat]
    answered: int
    accuracy: int | None
    students: int
    #: What students said after its lesson: got_it, unsure, too_hard.
    lesson_feedback: dict[str, int]
    reports: list[ReportLine]


@router.get(
    "/questions/{question_id}", response_model=QuestionInDepth, summary="One question in depth"
)
async def question(
    question_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> QuestionInDepth:
    rows = await fetch_all(
        conn,
        f"""
        SELECT d.question_id, d.question_version_id, sub.name AS subject_name,
               st.name AS topic_name, sec.name AS section_name, q.exam_year,
               q.question_number, v.instructions, v.stem, v.review_status,
               v.solution_steps, v.hints
        FROM deliverable_questions d
        JOIN questions q ON q.id = d.question_id
        JOIN question_versions v ON v.id = d.question_version_id
        JOIN subjects sub ON sub.id = d.subject_id
        {TOPIC_JOIN}
        WHERE d.question_id = :q
        """,
        q=question_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That question isn't live.")
    row = rows[0]
    version = row["question_version_id"]
    options = await fetch_all(
        conn,
        """
        SELECT o.option_key, o.body, o.is_correct,
               (SELECT count(*) FROM attempts a WHERE a.question_version_id = o.question_version_id
                  AND a.selected_option_key = o.option_key) AS chosen
        FROM question_options o WHERE o.question_version_id = :v
        ORDER BY o.display_order, o.option_key
        """,
        v=version,
    )
    stats = (
        await fetch_all(
            conn,
            """
            SELECT count(*) AS answered, count(*) FILTER (WHERE is_correct) AS right_count,
                   count(DISTINCT student_id) AS students
            FROM attempts WHERE question_version_id = :v
            """,
            v=version,
        )
    )[0]
    feedback = await fetch_all(
        conn,
        """
        SELECT understood, count(*) AS n FROM lesson_feedback
        WHERE question_version_id = :v GROUP BY understood
        """,
        v=version,
    )
    reports = await fetch_all(
        conn,
        """
        SELECT reason, detail, status, created_at FROM question_reports
        WHERE question_version_id = :v ORDER BY created_at DESC LIMIT 20
        """,
        v=version,
    )
    return QuestionInDepth(
        **{k: row[k] for k in (
            "question_id", "question_version_id", "subject_name", "topic_name", "section_name",
            "exam_year", "question_number", "instructions", "stem", "review_status",
        )},
        solution_steps=[str(step) for step in (row["solution_steps"] or [])],
        hints=[str(hint) for hint in (row["hints"] or [])],
        options=[OptionStat(**option) for option in options],
        answered=int(stats["answered"]),
        accuracy=_pct(stats["right_count"], stats["answered"]),
        students=int(stats["students"]),
        lesson_feedback={str(f["understood"]): int(f["n"]) for f in feedback},
        reports=[ReportLine(**report) for report in reports],
    )


# ------------------------------------------------------------------ question quality


class QualityItem(BaseModel):
    question_id: UUID
    subject_name: str
    exam_year: int | None
    question_number: str | None
    stem: str
    answered: int
    accuracy: int | None
    #: Why it is listed, in a few words.
    note: str


class Quality(BaseModel):
    #: More students chose one wrong option than the keyed answer: check the key first.
    key_doubts: list[QualityItem]
    most_missed: list[QualityItem]
    most_reported: list[QualityItem]
    lessons_not_landing: list[QualityItem]
    minimum_answers: int


@router.get("/quality", response_model=Quality, summary="Questions to look at first")
async def quality(
    conn: Annotated[AsyncConnection, Depends(connection)],
    subject_id: UUID | None = None,
    minimum: Annotated[int, Query(ge=1, le=500)] = 5,
) -> Quality:
    subject = "AND d.subject_id = :subject" if subject_id else ""
    params: dict[str, Any] = {"minimum": minimum, **({"subject": subject_id} if subject_id else {})}
    head = """
        SELECT d.question_id, sub.name AS subject_name, q.exam_year, q.question_number, v.stem
    """
    base = """
        FROM deliverable_questions d
        JOIN questions q ON q.id = d.question_id
        JOIN question_versions v ON v.id = d.question_version_id
        JOIN subjects sub ON sub.id = d.subject_id
    """
    doubts = await fetch_all(
        conn,
        f"""
        WITH picks AS (
          SELECT a.question_version_id, a.selected_option_key AS k, count(*) AS n
          FROM attempts a WHERE a.selected_option_key IS NOT NULL
          GROUP BY 1, 2
        ),
        per AS (
          SELECT p.question_version_id,
                 sum(p.n) AS answered,
                 max(p.n) FILTER (WHERE o.is_correct) AS key_n,
                 max(p.n) FILTER (WHERE NOT o.is_correct) AS top_wrong_n,
                 (array_agg(p.k ORDER BY p.n DESC) FILTER (WHERE NOT o.is_correct))[1] AS top_wrong,
                 (SELECT min(c.option_key) FROM question_options c
                  WHERE c.question_version_id = p.question_version_id AND c.is_correct) AS key
          FROM picks p JOIN question_options o
            ON o.question_version_id = p.question_version_id AND o.option_key = p.k
          GROUP BY p.question_version_id
        )
        {head}, per.answered, coalesce(per.key_n, 0) AS right_count,
               per.top_wrong_n || ' chose ' || per.top_wrong || '; '
                 || coalesce(per.key_n, 0) || ' chose the key, ' || per.key AS note
        {base} JOIN per ON per.question_version_id = d.question_version_id
        WHERE per.answered >= :minimum AND per.top_wrong_n > coalesce(per.key_n, 0) {subject}
        ORDER BY per.top_wrong_n - coalesce(per.key_n, 0) DESC LIMIT 15
        """,
        **params,
    )
    missed = await fetch_all(
        conn,
        f"""
        {head}, stats.answered, stats.right_count, 'Missed by most' AS note
        {base} {STATS_JOIN}
        WHERE stats.answered >= :minimum {subject}
        ORDER BY stats.right_count::float / stats.answered, stats.answered DESC LIMIT 15
        """,
        **params,
    )
    reported = await fetch_all(
        conn,
        f"""
        {head}, coalesce(stats.answered, 0) AS answered, coalesce(stats.right_count, 0)
                 AS right_count,
               rep.n || ' open ' || CASE WHEN rep.n = 1 THEN 'report' ELSE 'reports' END AS note
        {base} {STATS_JOIN}
        JOIN LATERAL (
          SELECT count(*) AS n FROM question_reports r
          WHERE r.question_version_id = d.question_version_id
            AND r.status IN ('open', 'triaged')
        ) rep ON rep.n > 0
        WHERE TRUE {subject}
        ORDER BY rep.n DESC LIMIT 15
        """,
        **params,
    )
    lessons = await fetch_all(
        conn,
        f"""
        {head}, coalesce(stats.answered, 0) AS answered,
               coalesce(stats.right_count, 0) AS right_count,
               fb.hard || ' of ' || fb.total || ' said the lesson didn''t help' AS note
        {base} {STATS_JOIN}
        JOIN LATERAL (
          SELECT count(*) AS total, count(*) FILTER (WHERE understood <> 'got_it') AS hard
          FROM lesson_feedback f WHERE f.question_version_id = d.question_version_id
        ) fb ON fb.total >= 2 AND fb.hard * 2 >= fb.total
        WHERE TRUE {subject}
        ORDER BY fb.hard::float / fb.total DESC, fb.total DESC LIMIT 15
        """,
        **params,
    )

    def items(rows: list[dict[str, Any]]) -> list[QualityItem]:
        return [
            QualityItem(
                **{k: v for k, v in row.items() if k != "right_count"},
                accuracy=_pct(row["right_count"], row["answered"]),
            )
            for row in rows
        ]

    return Quality(
        key_doubts=items(doubts),
        most_missed=items(missed),
        most_reported=items(reported),
        lessons_not_landing=items(lessons),
        minimum_answers=minimum,
    )


# ------------------------------------------------------------------ mocks and check-ups


class MockRow(BaseModel):
    mock_id: UUID
    student_id: UUID
    display_name: str
    subjects: str
    preset: str
    started_at: datetime
    submitted_at: datetime | None
    auto_submitted: bool
    questions: int
    right: int
    percent: int | None
    integrity_flags: int


class MockPage(BaseModel):
    total: int
    mocks: list[MockRow]
    submitted: int
    average_percent: int | None


@router.get("/mocks", response_model=MockPage, summary="Every mock sat, newest first")
async def mocks(
    conn: Annotated[AsyncConnection, Depends(connection)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    flagged: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MockPage:
    conditions = ["TRUE"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if q and q.strip():
        conditions.append("s.display_name ILIKE :q")
        params["q"] = f"%{q.strip()}%"
    if flagged:
        conditions.append(
            "EXISTS (SELECT 1 FROM mock_exam_events e WHERE e.mock_exam_id = m.id"
            " AND e.kind IN ('fullscreen_exit', 'tab_hidden'))"
        )
    where = " AND ".join(conditions)
    rows = await fetch_all(
        conn,
        f"""
        SELECT m.id AS mock_id, s.id AS student_id, s.display_name, m.preset, m.started_at,
               m.submitted_at, m.auto_submitted,
               coalesce((SELECT string_agg(sub.name, ', ' ORDER BY sub.name)
                  FROM study_sessions ss JOIN subjects sub ON sub.id = ss.subject_id
                 WHERE ss.mock_exam_id = m.id), '') AS subjects,
               (SELECT count(*) FROM mock_exam_items i WHERE i.mock_exam_id = m.id) AS questions,
               (SELECT count(*) FROM mock_exam_items i JOIN question_options o
                  ON o.question_version_id = i.question_version_id
                 AND o.option_key = i.selected_option_key AND o.is_correct
                 WHERE i.mock_exam_id = m.id) AS "right",
               (SELECT count(*) FROM mock_exam_events e WHERE e.mock_exam_id = m.id
                  AND e.kind IN ('fullscreen_exit', 'tab_hidden')) AS integrity_flags
        FROM mock_exams m JOIN students s ON s.id = m.student_id
        WHERE {where}
        ORDER BY m.started_at DESC LIMIT :limit OFFSET :offset
        """,
        **params,
    )
    totals = (
        await fetch_all(
            conn,
            f"""
            SELECT count(*) AS total, count(*) FILTER (WHERE m.submitted_at IS NOT NULL)
                     AS submitted
            FROM mock_exams m JOIN students s ON s.id = m.student_id WHERE {where}
            """,
            **{k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
    )[0]
    scored = [r for r in rows if r["submitted_at"] is not None and r["questions"]]
    return MockPage(
        total=int(totals["total"]),
        submitted=int(totals["submitted"]),
        average_percent=round(sum(100 * r["right"] / r["questions"] for r in scored) / len(scored))
        if scored else None,
        mocks=[
            MockRow(
                **row,
                percent=round(100 * row["right"] / row["questions"])
                if row["submitted_at"] is not None and row["questions"] else None,
            )
            for row in rows
        ],
    )


class CheckupRow(BaseModel):
    session_id: UUID
    student_id: UUID
    display_name: str
    subject_name: str
    started_at: datetime
    ended_at: datetime | None
    answered: int
    right: int
    percent: int | None


class CheckupPage(BaseModel):
    total: int
    finished: int
    checkups: list[CheckupRow]


@router.get("/checkups", response_model=CheckupPage, summary="Every check-up, newest first")
async def checkups(
    conn: Annotated[AsyncConnection, Depends(connection)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    subject_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CheckupPage:
    conditions = ["ss.session_type = 'checkup'"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if q and q.strip():
        conditions.append("s.display_name ILIKE :q")
        params["q"] = f"%{q.strip()}%"
    if subject_id:
        conditions.append("ss.subject_id = :subject")
        params["subject"] = subject_id
    where = " AND ".join(conditions)
    rows = await fetch_all(
        conn,
        f"""
        SELECT ss.id AS session_id, s.id AS student_id, s.display_name,
               sub.name AS subject_name, ss.started_at, ss.ended_at,
               count(a.id) AS answered, count(a.id) FILTER (WHERE a.is_correct) AS "right"
        FROM study_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN subjects sub ON sub.id = ss.subject_id
        LEFT JOIN attempts a ON a.session_id = ss.id
        WHERE {where}
        GROUP BY ss.id, s.id, s.display_name, sub.name
        ORDER BY ss.started_at DESC LIMIT :limit OFFSET :offset
        """,
        **params,
    )
    totals = (
        await fetch_all(
            conn,
            f"""
            SELECT count(*) AS total, count(*) FILTER (WHERE ss.ended_at IS NOT NULL) AS finished
            FROM study_sessions ss JOIN students s ON s.id = ss.student_id WHERE {where}
            """,
            **{k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
    )[0]
    return CheckupPage(
        total=int(totals["total"]),
        finished=int(totals["finished"]),
        checkups=[CheckupRow(**row, percent=_pct(row["right"], row["answered"])) for row in rows],
    )
