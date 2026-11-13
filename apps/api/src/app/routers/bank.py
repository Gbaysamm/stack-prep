"""The reviewer's question bank: exams, their subjects, each subject's papers, and the questions
in each paper (docs/plans/2026-11-10-reviewer-question-bank.md).

A reviewer adds an exam (WAEC, Post-UTME), a subject in it, a paper (a past year, or a set of
our own), and questions in a paper; edits a question; and removes one. Checking a question
(its answer, level and skill) and approving it stay in routers/review.py, which the dashboard
calls for the open question.

Two things the database insists on, and how this router meets them:

- An approved question is frozen except its working and hints (migration 017). Changing what
  it asks, its options or its key makes a new version: a draft copy that becomes the current
  one, while the approved version is withdrawn. Until the draft is approved again the question
  is not served, so nobody is taught from a version nobody checked.
- A question can only be served under a skill from an approved syllabus. A new subject has
  none, so adding one can copy the topics of an existing subject (WAEC Mathematics from UTME
  Mathematics); without that its questions wait until a syllabus is loaded.

A question is never deleted: removing one retires it (`retired_at`), so students' answers and
scores that point at it stay whole, and it stops being served at once.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, reviewer_session
from app.db import connection, fetch_all

router = APIRouter(prefix="/v1/bank", tags=["bank"], dependencies=[Depends(reviewer_session)])

#: Exams made by tests and the sandbox, which reviewers have no business with.
HIDDEN_BODIES = ("Score Pilot", "Test body")
OptionKey = Literal["A", "B", "C", "D", "E", "F"]

#: How each question in a paper stands, worked out from its current version.
QUESTION_STATE = """
    CASE
      WHEN v.review_status = 'approved' THEN 'approved'
      WHEN v.answer_source IN ('expert_verified', 'official_key')
       AND v.level_source IN ('expert_verified', 'calibrated')
       AND EXISTS (SELECT 1 FROM question_classifications c WHERE c.question_id = q.id
                   AND c.classification_role = 'primary' AND c.review_status = 'approved')
        THEN 'ready'
      ELSE 'needs_review'
    END
"""
OPEN_REPORTS = """
    (SELECT count(*) FROM question_reports rep
     WHERE rep.question_version_id = v.id AND rep.status IN ('open', 'triaged'))
"""


def _message(error: DBAPIError) -> str:
    """The database's own sentence for what is wrong, without the driver's wrapping."""
    raw = str(error.orig) if error.orig is not None else str(error)
    found = re.search(r"(?:RaiseError|Exception|Error)[^:]*:\s*(.+?)(?:\n|$)", raw)
    return (found.group(1) if found else raw.splitlines()[0]).strip()


async def _one(conn: AsyncConnection, sql: str, missing: str, **params: Any) -> dict[str, Any]:
    rows = await fetch_all(conn, sql, **params)
    if not rows:
        raise HTTPException(status_code=404, detail=missing)
    return rows[0]


# ------------------------------------------------------------------ exams


class ExamLine(BaseModel):
    id: UUID
    name: str
    short_name: str
    exam_body: str
    subjects: int
    questions: int


class NewExam(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    short_name: str = Field(min_length=2, max_length=24)
    exam_body: str = Field(min_length=2, max_length=120)


@router.get("/exams", response_model=list[ExamLine], summary="The exams in the bank")
async def exams(conn: Annotated[AsyncConnection, Depends(connection)]) -> list[ExamLine]:
    rows = await fetch_all(
        conn,
        """
        SELECT e.id, e.name, e.short_name, e.exam_body,
               (SELECT count(*) FROM subjects s
                WHERE s.examination_id = e.id AND s.status <> 'retired') AS subjects,
               (SELECT count(*) FROM questions q JOIN subjects s ON s.id = q.subject_id
                WHERE s.examination_id = e.id AND q.retired_at IS NULL) AS questions
        FROM examinations e
        WHERE e.status <> 'retired' AND e.exam_body <> ALL(:hidden)
        ORDER BY questions DESC, e.short_name
        """,
        hidden=list(HIDDEN_BODIES),
    )
    return [ExamLine(**row) for row in rows]


@router.post("/exams", response_model=ExamLine, status_code=201, summary="Add an exam")
async def add_exam(
    body: NewExam,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> ExamLine:
    short = " ".join(body.short_name.split()).upper()
    taken = await fetch_all(
        conn, "SELECT 1 FROM examinations WHERE upper(short_name) = :short", short=short
    )
    if taken:
        raise HTTPException(status_code=409, detail=f"There is already an exam called {short}.")
    exam_id = uuid4()
    await conn.execute(
        text(
            """
            INSERT INTO examinations (id, name, short_name, exam_body, country_code, status)
            VALUES (:id, :name, :short, :body, 'NG', 'active')
            """
        ),
        {"id": exam_id, "name": " ".join(body.name.split()), "short": short,
         "body": " ".join(body.exam_body.split())},
    )
    await audit.record(conn, staff, "bank.exam.add", f"Added the exam {short}",
                       target_kind="examination", target_id=str(exam_id))
    await conn.commit()
    return ExamLine(id=exam_id, name=body.name, short_name=short, exam_body=body.exam_body,
                    subjects=0, questions=0)


# ------------------------------------------------------------------ subjects


class SubjectCard(BaseModel):
    subject_id: UUID
    name: str
    code: str
    papers: int
    questions: int
    approved: int
    needs_review: int
    flagged: int
    #: Whether it has an approved syllabus, so its questions can be classified and served.
    has_topics: bool


class ExamPage(BaseModel):
    exam: ExamLine
    subjects: list[SubjectCard]
    #: Subjects in other exams whose topics a new subject can start from.
    topic_sources: list[dict[str, Any]]


class NewSubject(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str | None = Field(default=None, max_length=12)
    #: An existing subject whose topics (its syllabus) the new subject starts from.
    copy_topics_from: UUID | None = None


SUBJECT_COUNTS = f"""
    SELECT s.id AS subject_id, s.name, s.code,
           (SELECT count(*) FROM exam_papers p
            WHERE p.subject_id = s.id AND p.status <> 'retired') AS papers,
           count(q.id) AS questions,
           count(q.id) FILTER (WHERE v.review_status = 'approved') AS approved,
           count(q.id) FILTER (WHERE v.review_status <> 'approved') AS needs_review,
           count(q.id) FILTER (WHERE {OPEN_REPORTS} > 0) AS flagged,
           EXISTS (SELECT 1 FROM syllabus_versions sv WHERE sv.subject_id = s.id
                   AND sv.status = 'approved' AND sv.is_current) AS has_topics
    FROM subjects s
    LEFT JOIN questions q ON q.subject_id = s.id AND q.retired_at IS NULL
    LEFT JOIN question_versions v ON v.id = q.current_version_id
"""


@router.get("/exams/{exam_id}", response_model=ExamPage, summary="An exam and its subjects")
async def exam_page(
    exam_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> ExamPage:
    exam = next((e for e in await exams(conn) if e.id == exam_id), None)
    if exam is None:
        raise HTTPException(status_code=404, detail="We couldn't find that exam.")
    rows = await fetch_all(
        conn,
        f"""{SUBJECT_COUNTS}
        WHERE s.examination_id = :exam AND s.status <> 'retired'
        GROUP BY s.id ORDER BY s.name
        """,
        exam=exam_id,
    )
    sources = await fetch_all(
        conn,
        """
        SELECT s.id AS subject_id, s.name, e.short_name AS exam
        FROM subjects s JOIN examinations e ON e.id = s.examination_id
        JOIN syllabus_versions sv ON sv.subject_id = s.id
          AND sv.status = 'approved' AND sv.is_current
        WHERE e.exam_body <> ALL(:hidden)
        ORDER BY e.short_name, s.name
        """,
        hidden=list(HIDDEN_BODIES),
    )
    return ExamPage(exam=exam, subjects=[SubjectCard(**row) for row in rows],
                    topic_sources=sources)


async def _copy_topics(
    conn: AsyncConnection, *, from_subject: UUID, to_subject: UUID, exam_id: UUID,
    name: str, reviewer: UUID,
) -> None:
    """Copy a subject's current approved syllabus (topics, subtopics, skills, their evidence and
    mastery levels) to a new subject, approved, so its questions can be classified at once."""
    source = await _one(
        conn,
        """
        SELECT sv.id AS version_id, sv.version_label, sv.authority_identifier, sv.valid_from,
               sv.valid_to, d.id AS document_id, d.file_sha256
        FROM syllabus_versions sv JOIN source_documents d ON d.id = sv.source_document_id
        WHERE sv.subject_id = :subject AND sv.status = 'approved' AND sv.is_current
        """,
        "That subject has no approved topics to copy.",
        subject=from_subject,
    )
    document_id, version_id = uuid4(), uuid4()
    sha = hashlib.sha256(f"{source['file_sha256']}:{to_subject}".encode()).hexdigest()
    await conn.execute(
        text(
            """
            INSERT INTO source_documents (id, examination_id, subject_id, document_type, title,
              issuer, file_uri, file_sha256, mime_type, page_count, document_year,
              licence_status, storage_permission, student_delivery_permission,
              model_context_permission, processing_status, review_status, uploaded_by,
              reviewed_by, reviewed_at)
            SELECT :doc, :exam, :subject, 'syllabus', d.title || ' (topics for ' || :name || ')',
                   d.issuer, d.file_uri, :sha, d.mime_type, d.page_count, d.document_year,
                   d.licence_status, d.storage_permission, d.student_delivery_permission,
                   d.model_context_permission, d.processing_status, d.review_status,
                   :reviewer, :reviewer, now()
            FROM source_documents d WHERE d.id = :from_doc
            """
        ),
        {"doc": document_id, "exam": exam_id, "subject": to_subject, "name": name, "sha": sha,
         "reviewer": reviewer, "from_doc": source["document_id"]},
    )
    await conn.execute(
        text(
            """
            INSERT INTO syllabus_versions (id, subject_id, version_label, authority_identifier,
              valid_from, valid_to, source_document_id, status, is_current, approved_by,
              approved_at)
            VALUES (:id, :subject, :label, :authority, :valid_from, :valid_to, :doc,
                    'approved', true, :reviewer, now())
            """
        ),
        {"id": version_id, "subject": to_subject, "label": source["version_label"],
         "authority": source["authority_identifier"], "valid_from": source["valid_from"],
         "valid_to": source["valid_to"], "doc": document_id, "reviewer": reviewer},
    )
    await conn.execute(
        text(
            """
            CREATE TEMP TABLE item_map ON COMMIT DROP AS
            SELECT id AS old_id, gen_random_uuid() AS new_id, item_type, review_status
            FROM curriculum_items WHERE syllabus_version_id = :from_version
            """
        ),
        {"from_version": source["version_id"]},
    )
    # Parents before children (the database checks each item's parent), all as drafts first:
    # an item can only be approved once its evidence is in.
    for kind in ("topic", "subtopic", "skill"):
        await conn.execute(
            text(
                """
                INSERT INTO curriculum_items (id, syllabus_version_id, subject_id, parent_id,
                  item_type, code, name, learning_objective, examinable_scope, expected_depth,
                  boundary_notes, syllabus_status, pilot_support_status, display_order,
                  review_status)
                SELECT m.new_id, :version, :subject, pm.new_id, c.item_type, c.code, c.name,
                       c.learning_objective, c.examinable_scope, c.expected_depth,
                       c.boundary_notes, c.syllabus_status, c.pilot_support_status,
                       c.display_order, 'draft'
                FROM curriculum_items c JOIN item_map m ON m.old_id = c.id
                LEFT JOIN item_map pm ON pm.old_id = c.parent_id
                WHERE c.item_type = :kind
                """
            ),
            {"version": version_id, "subject": to_subject, "kind": kind},
        )
    await conn.execute(
        text(
            """
            INSERT INTO curriculum_evidence (curriculum_item_id, source_document_id,
              evidence_kind, source_location, source_excerpt, decision_rationale,
              decision_evidence_reference, review_status, reviewed_by, reviewed_at)
            SELECT m.new_id,
                   CASE WHEN ev.source_document_id IS NULL THEN NULL ELSE CAST(:doc AS uuid) END,
                   ev.evidence_kind, ev.source_location, ev.source_excerpt,
                   ev.decision_rationale, ev.decision_evidence_reference, ev.review_status,
                   CASE WHEN ev.review_status = 'approved' THEN CAST(:reviewer AS uuid) END,
                   CASE WHEN ev.review_status = 'approved' THEN now() END
            FROM curriculum_evidence ev JOIN item_map m ON m.old_id = ev.curriculum_item_id
            WHERE ev.review_status <> 'withdrawn'
            """
        ),
        {"doc": document_id, "reviewer": reviewer},
    )
    for kind in ("topic", "subtopic", "skill"):
        await conn.execute(
            text(
                """
                UPDATE curriculum_items c
                SET review_status = m.review_status,
                    approved_by = CASE WHEN m.review_status = 'approved'
                                       THEN CAST(:reviewer AS uuid) END,
                    approved_at = CASE WHEN m.review_status = 'approved' THEN now() END
                FROM item_map m
                WHERE c.id = m.new_id AND m.item_type = :kind AND m.review_status <> 'draft'
                """
            ),
            {"reviewer": reviewer, "kind": kind},
        )
    await conn.execute(
        text(
            """
            INSERT INTO curriculum_mastery_levels (curriculum_item_id, level_number, name,
              description, cognitive_demand, entry_criteria, exit_criteria,
              recommended_question_count, review_status, reviewed_by, reviewed_at)
            SELECT m.new_id, l.level_number, l.name, l.description, l.cognitive_demand,
                   l.entry_criteria, l.exit_criteria, l.recommended_question_count,
                   l.review_status,
                   CASE WHEN l.review_status = 'approved' THEN CAST(:reviewer AS uuid) END,
                   CASE WHEN l.review_status = 'approved' THEN now() END
            FROM curriculum_mastery_levels l JOIN item_map m ON m.old_id = l.curriculum_item_id
            WHERE l.review_status <> 'withdrawn'
            """
        ),
        {"reviewer": reviewer},
    )


@router.post(
    "/exams/{exam_id}/subjects", response_model=SubjectCard, status_code=201,
    summary="Add a subject",
)
async def add_subject(
    exam_id: UUID,
    body: NewSubject,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> SubjectCard:
    await _one(conn, "SELECT 1 FROM examinations WHERE id = :id", "We couldn't find that exam.",
               id=exam_id)
    name = " ".join(body.name.split())
    code = (body.code or re.sub(r"[^A-Z]", "", name.upper())[:4] or "SUBJ").upper()
    clash = await fetch_all(
        conn,
        """
        SELECT 1 FROM subjects WHERE examination_id = :exam
          AND (lower(name) = lower(:name) OR upper(code) = :code)
        """,
        exam=exam_id, name=name, code=code,
    )
    if clash:
        raise HTTPException(
            status_code=409, detail=f"This exam already has {name} (or the code {code})."
        )
    subject_id = uuid4()
    try:
        await conn.execute(
            text(
                """
                INSERT INTO subjects (id, examination_id, code, name, status)
                VALUES (:id, :exam, :code, :name, 'active')
                """
            ),
            {"id": subject_id, "exam": exam_id, "code": code, "name": name},
        )
        if body.copy_topics_from:
            await _copy_topics(conn, from_subject=body.copy_topics_from, to_subject=subject_id,
                               exam_id=exam_id, name=name, reviewer=staff.reviewer_id)
        await audit.record(
            conn, staff, "bank.subject.add",
            f"Added the subject {name}" + (" with copied topics" if body.copy_topics_from else ""),
            target_kind="subject", target_id=str(subject_id),
        )
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        raise HTTPException(status_code=409, detail=_message(error)) from error
    rows = await fetch_all(conn, f"{SUBJECT_COUNTS} WHERE s.id = :id GROUP BY s.id",
                           id=subject_id)
    return SubjectCard(**rows[0])


# ------------------------------------------------------------------ papers


class PaperLine(BaseModel):
    paper_id: UUID
    title: str
    exam_year: int | None
    own: bool
    #: A set of AI-written questions (migration 048): badged, and the only place questions
    #: are imported or written with AI.
    ai_generated: bool = False
    questions: int
    approved: int
    needs_review: int
    flagged: int


class SubjectPage(BaseModel):
    exam: ExamLine
    subject: SubjectCard
    papers: list[PaperLine]


class NewPaper(BaseModel):
    #: A past paper's year, or none for a set of our own (which then needs a title).
    exam_year: int | None = Field(default=None, ge=1900, le=2200)
    title: str | None = Field(default=None, max_length=80)
    #: A set of AI-written questions (own sets only).
    ai_generated: bool = False

    @model_validator(mode="after")
    def _one_or_other(self) -> NewPaper:
        if self.exam_year is None and not (self.title or "").strip():
            raise ValueError("Give the paper's year, or a name for a set of your own.")
        if self.ai_generated and self.exam_year is not None:
            raise ValueError("An AI-generated set is one of our own sets, never a year.")
        return self


PAPER_COUNTS = f"""
    SELECT p.id AS paper_id, p.name AS title, p.exam_year, p.own, p.ai_generated,
           count(q.id) AS questions,
           count(q.id) FILTER (WHERE v.review_status = 'approved') AS approved,
           count(q.id) FILTER (WHERE v.review_status <> 'approved') AS needs_review,
           count(q.id) FILTER (WHERE {OPEN_REPORTS} > 0) AS flagged
    FROM exam_papers p
    LEFT JOIN questions q ON q.exam_paper_id = p.id AND q.retired_at IS NULL
    LEFT JOIN question_versions v ON v.id = q.current_version_id
"""


async def _subject(conn: AsyncConnection, subject_id: UUID) -> tuple[ExamLine, SubjectCard]:
    rows = await fetch_all(conn, f"{SUBJECT_COUNTS} WHERE s.id = :id GROUP BY s.id",
                           id=subject_id)
    if not rows:
        raise HTTPException(status_code=404, detail="We couldn't find that subject.")
    exam_id = (await fetch_all(conn, "SELECT examination_id FROM subjects WHERE id = :id",
                               id=subject_id))[0]["examination_id"]
    exam = next((e for e in await exams(conn) if e.id == exam_id), None)
    if exam is None:
        raise HTTPException(status_code=404, detail="We couldn't find that subject.")
    return exam, SubjectCard(**rows[0])


@router.get("/subjects/{subject_id}", response_model=SubjectPage, summary="A subject's papers")
async def subject_page(
    subject_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> SubjectPage:
    exam, subject = await _subject(conn, subject_id)
    rows = await fetch_all(
        conn,
        f"""{PAPER_COUNTS}
        WHERE p.subject_id = :subject AND p.status <> 'retired'
        GROUP BY p.id
        ORDER BY p.own, p.exam_year DESC NULLS LAST, p.name
        """,
        subject=subject_id,
    )
    return SubjectPage(exam=exam, subject=subject, papers=[PaperLine(**row) for row in rows])


@router.post(
    "/subjects/{subject_id}/papers", response_model=PaperLine, status_code=201,
    summary="Add a paper",
)
async def add_paper(
    subject_id: UUID,
    body: NewPaper,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> PaperLine:
    exam, subject = await _subject(conn, subject_id)
    own = body.exam_year is None
    title = (
        " ".join((body.title or "").split())
        if own
        else f"{exam.short_name} {body.exam_year} {subject.name}"
    )
    code = (
        f"OWN-{uuid4().hex[:6].upper()}-{subject.code}" if own
        else f"{exam.short_name}-{body.exam_year}-{subject.code}"
    )
    try:
        paper_id = (
            await conn.execute(
                text(
                    """
                    INSERT INTO exam_papers (subject_id, paper_code, name, response_mode,
                      options_per_question, exam_year, own, ai_generated, created_by)
                    VALUES (:subject, :code, :name, 'objective', 4, :year, :own, :ai, :by)
                    RETURNING id
                    """
                ),
                {"subject": subject_id, "code": code, "name": title, "year": body.exam_year,
                 "own": own, "ai": body.ai_generated, "by": staff.student_id},
            )
        ).scalar_one()
        await audit.record(conn, staff, "bank.paper.add", f"Added the paper {title}",
                           target_kind="paper", target_id=str(paper_id))
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        if "exam_papers_one_year_idx" in str(error) or "exam_papers_own_name_idx" in str(error):
            raise HTTPException(status_code=409, detail=f"{title} is already here.") from error
        raise HTTPException(status_code=409, detail=_message(error)) from error
    return PaperLine(paper_id=paper_id, title=title, exam_year=body.exam_year, own=own,
                     ai_generated=body.ai_generated, questions=0, approved=0,
                     needs_review=0, flagged=0)


class PaperChange(BaseModel):
    #: A set of our own: its new name. A past paper: its corrected year.
    title: str | None = Field(default=None, max_length=80)
    exam_year: int | None = Field(default=None, ge=1900, le=2200)


@router.patch("/papers/{paper_id}", response_model=PaperLine, summary="Rename a paper")
async def change_paper(
    paper_id: UUID,
    body: PaperChange,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> PaperLine:
    """A set's name, or a past paper's year, put right (founder, 13 Nov 2026: a year could not
    be renamed). A past paper's code and title follow its year."""
    paper = await _one(
        conn,
        "SELECT id, subject_id, own, exam_year, name FROM exam_papers"
        " WHERE id = :id AND status <> 'retired'",
        "We couldn't find that paper.", id=paper_id,
    )
    exam, subject = await _subject(conn, paper["subject_id"])
    try:
        if paper["own"]:
            title = " ".join((body.title or "").split())
            if not title:
                raise HTTPException(status_code=422, detail="Give the set a name.")
            await conn.execute(text("UPDATE exam_papers SET name = :n WHERE id = :id"),
                               {"n": title, "id": paper_id})
        else:
            if body.exam_year is None:
                raise HTTPException(status_code=422, detail="Give the paper's year.")
            title = f"{exam.short_name} {body.exam_year} {subject.name}"
            await conn.execute(
                text("UPDATE exam_papers SET exam_year = :y, name = :n, paper_code = :c"
                     " WHERE id = :id"),
                {"y": body.exam_year, "n": title, "id": paper_id,
                 "c": f"{exam.short_name}-{body.exam_year}-{subject.code}"},
            )
        await audit.record(conn, staff, "bank.paper.rename",
                           f"Renamed the paper {paper['name']} to {title}",
                           target_kind="paper", target_id=str(paper_id))
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        if "exam_papers_one_year_idx" in str(error) or "exam_papers_own_name_idx" in str(error):
            raise HTTPException(status_code=409, detail=f"{title} is already here.") from error
        raise HTTPException(status_code=409, detail=_message(error)) from error
    rows = await fetch_all(conn, f"{PAPER_COUNTS} WHERE p.id = :id GROUP BY p.id", id=paper_id)
    return PaperLine(**rows[0])


@router.delete("/papers/{paper_id}", status_code=204, summary="Remove a paper")
async def remove_paper(
    paper_id: UUID,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
    with_questions: bool = False,
) -> Response:
    """Retire a paper. With `with_questions`, its questions are retired with it (never deleted:
    students' answers and scores that point at them stay whole), and stop being served."""
    paper = await _one(
        conn,
        f"{PAPER_COUNTS} WHERE p.id = :id AND p.status <> 'retired' GROUP BY p.id",
        "We couldn't find that paper.", id=paper_id,
    )
    if paper["questions"] and not with_questions:
        raise HTTPException(
            status_code=409,
            detail="This paper has questions. Remove it with its questions, or remove them first.",
        )
    if paper["questions"]:
        await conn.execute(
            text("UPDATE questions SET retired_at = now(), retired_reason = :reason,"
                 " retired_by = :by WHERE exam_paper_id = :id AND retired_at IS NULL"),
            {"id": paper_id, "by": staff.student_id,
             "reason": f"Removed with its paper, {paper['title']}"},
        )
    await conn.execute(text("UPDATE exam_papers SET status = 'retired' WHERE id = :id"),
                       {"id": paper_id})
    await audit.record(conn, staff, "bank.paper.remove", f"Removed the paper {paper['title']}",
                       target_kind="paper", target_id=str(paper_id))
    await conn.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ questions in a paper


class QuestionLine(BaseModel):
    question_id: UUID
    question_number: str | None
    stem: str
    state: Literal["approved", "ready", "needs_review"]
    answer_checked: bool
    level_checked: bool
    skill_checked: bool
    has_working: bool
    open_reports: int


class PaperPage(BaseModel):
    exam: ExamLine
    subject: SubjectCard
    paper: PaperLine
    questions: list[QuestionLine]
    #: The subject's current syllabus, for choosing a question's skill; none without topics.
    syllabus_version_id: UUID | None


@router.get("/papers/{paper_id}", response_model=PaperPage, summary="A paper's questions")
async def paper_page(
    paper_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> PaperPage:
    paper = await _one(
        conn,
        f"{PAPER_COUNTS} WHERE p.id = :id AND p.status <> 'retired' GROUP BY p.id",
        "We couldn't find that paper.", id=paper_id,
    )
    subject_id = (await fetch_all(conn, "SELECT subject_id FROM exam_papers WHERE id = :id",
                                  id=paper_id))[0]["subject_id"]
    exam, subject = await _subject(conn, subject_id)
    rows = await fetch_all(
        conn,
        f"""
        SELECT q.id AS question_id, q.question_number, v.stem, {QUESTION_STATE} AS state,
               v.answer_source IN ('expert_verified', 'official_key') AS answer_checked,
               v.level_source IN ('expert_verified', 'calibrated') AS level_checked,
               EXISTS (SELECT 1 FROM question_classifications c WHERE c.question_id = q.id
                       AND c.classification_role = 'primary'
                       AND c.review_status = 'approved') AS skill_checked,
               jsonb_array_length(v.solution_steps) > 0 AS has_working,
               {OPEN_REPORTS} AS open_reports
        FROM questions q JOIN question_versions v ON v.id = q.current_version_id
        WHERE q.exam_paper_id = :paper AND q.retired_at IS NULL
        ORDER BY length(coalesce(q.question_number, '')), q.question_number, q.created_at
        """,
        paper=paper_id,
    )
    syllabus = await fetch_all(
        conn,
        """
        SELECT id FROM syllabus_versions
        WHERE subject_id = :subject AND status = 'approved' AND is_current
        """,
        subject=subject_id,
    )
    return PaperPage(
        exam=exam, subject=subject, paper=PaperLine(**paper),
        questions=[QuestionLine(**row) for row in rows],
        syllabus_version_id=syllabus[0]["id"] if syllabus else None,
    )


class OptionIn(BaseModel):
    key: OptionKey
    body: str = Field(min_length=1, max_length=2000)


class QuestionIn(BaseModel):
    question_number: str | None = Field(default=None, max_length=12)
    instructions: str | None = Field(default=None, max_length=1000)
    stem: str = Field(min_length=1, max_length=8000)
    options: list[OptionIn] = Field(min_length=2, max_length=6)
    answer: OptionKey
    solution_steps: list[str] = Field(default_factory=list, max_length=40)
    hints: list[str] = Field(default_factory=list, max_length=10)
    #: 1 to 5. Given by the reviewer, so it counts as checked.
    level: int | None = Field(default=None, ge=1, le=5)
    #: The skill it tests, from the subject's syllabus. Chosen by the reviewer: approved.
    skill_id: UUID | None = None

    @model_validator(mode="after")
    def _sound(self) -> QuestionIn:
        keys = [o.key for o in self.options]
        if len(set(keys)) != len(keys):
            raise ValueError("Each option needs its own letter.")
        if self.answer not in keys:
            raise ValueError("The answer must be one of the options.")
        self.stem = self.stem.strip()
        self.solution_steps = [s.strip() for s in self.solution_steps if s.strip()]
        self.hints = [h.strip() for h in self.hints if h.strip()]
        return self


def _content_hash(body: QuestionIn) -> str:
    raw = json.dumps(
        {"stem": body.stem, "instructions": body.instructions,
         "options": sorted((o.key, o.body.strip()) for o in body.options)},
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode()).hexdigest()


async def _paper_document(conn: AsyncConnection, subject_id: UUID) -> UUID | None:
    """The source document a past-paper question added by hand is filed under: the one most of
    the subject's past questions already cite (its rights were checked when it was loaded)."""
    rows = await fetch_all(
        conn,
        """
        SELECT q.source_document_id AS id FROM questions q
        JOIN source_documents d ON d.id = q.source_document_id
        WHERE q.subject_id = :subject AND q.origin = 'past_paper'
        GROUP BY q.source_document_id ORDER BY count(*) DESC LIMIT 1
        """,
        subject=subject_id,
    )
    return rows[0]["id"] if rows else None


async def _write_options(
    conn: AsyncConnection, version_id: UUID, subject_id: UUID, body: QuestionIn
) -> None:
    for position, option in enumerate(body.options, start=1):
        await conn.execute(
            text(
                """
                INSERT INTO question_options (question_version_id, subject_id, option_key, body,
                  is_correct, display_order)
                VALUES (:v, :subject, :key, :body, :right, :position)
                """
            ),
            {"v": version_id, "subject": subject_id, "key": option.key,
             "body": option.body.strip(), "right": option.key == body.answer,
             "position": position},
        )


async def _set_skill(
    conn: AsyncConnection, question_id: UUID, subject_id: UUID, skill_id: UUID, reviewer: UUID
) -> None:
    syllabus = await _one(
        conn,
        """
        SELECT ci.syllabus_version_id FROM curriculum_items ci
        JOIN syllabus_versions sv ON sv.id = ci.syllabus_version_id
        WHERE ci.id = :skill AND ci.item_type = 'skill' AND sv.subject_id = :subject
        """,
        "That skill isn't in this subject's topics.", skill=skill_id, subject=subject_id,
    )
    await conn.execute(
        text(
            """
            UPDATE question_classifications SET review_status = 'withdrawn'
            WHERE question_id = :q AND classification_role = 'primary'
              AND review_status <> 'withdrawn' AND curriculum_item_id <> :skill
            """
        ),
        {"q": question_id, "skill": skill_id},
    )
    await conn.execute(
        text(
            """
            INSERT INTO question_classifications (question_id, subject_id, curriculum_item_id,
              syllabus_version_id, classification_role, proposed_by, classification_reason,
              review_status, reviewed_by, reviewed_at)
            VALUES (:q, :subject, :skill, :syllabus, 'primary', 'human',
                    'Chosen by the reviewer who wrote or edited the question', 'approved',
                    :reviewer, now())
            ON CONFLICT (question_id, curriculum_item_id) DO UPDATE
              SET review_status = 'approved', reviewed_by = :reviewer, reviewed_at = now()
            """
        ),
        {"q": question_id, "subject": subject_id, "skill": skill_id,
         "syllabus": syllabus["syllabus_version_id"], "reviewer": reviewer},
    )


class Saved(BaseModel):
    question_id: UUID


@router.post(
    "/papers/{paper_id}/questions", response_model=Saved, status_code=201,
    summary="Add a question to a paper",
)
async def add_question(
    paper_id: UUID,
    body: QuestionIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> Saved:
    paper = await _one(
        conn,
        """
        SELECT id, subject_id, exam_year, own, paper_code FROM exam_papers
        WHERE id = :id AND status <> 'retired'
        """,
        "We couldn't find that paper.", id=paper_id,
    )
    subject_id = paper["subject_id"]
    number = body.question_number
    if not number:
        count = (await fetch_all(
            conn, "SELECT count(*) AS n FROM questions WHERE exam_paper_id = :p", p=paper_id
        ))[0]["n"]
        number = str(count + 1)
    document_id = None if paper["own"] else await _paper_document(conn, subject_id)
    origin = "authored" if paper["own"] or document_id is None else "past_paper"
    question_id, version_id = uuid4(), uuid4()
    try:
        await conn.execute(
            text(
                """
                INSERT INTO questions (id, subject_id, exam_paper_id, origin, source_document_id,
                  exam_year, paper_code, question_number, usage_pool, created_by)
                VALUES (:id, :subject, :paper, :origin, :doc, :year, :code, :number,
                        'practice', :reviewer)
                """
            ),
            {"id": question_id, "subject": subject_id, "paper": paper_id, "origin": origin,
             "doc": document_id, "year": paper["exam_year"], "code": paper["paper_code"],
             "number": number, "reviewer": staff.reviewer_id},
        )
        await conn.execute(
            text(
                """
                INSERT INTO question_versions (id, question_id, subject_id, version, stem,
                  instructions, response_format, marking_method, solution_steps,
                  solution_source, hints, expected_seconds, option_count, content_hash,
                  authored_by, answer_source, mastery_level_number, level_source, review_status)
                VALUES (:v, :q, :subject, 1, :stem, :instructions, 'mcq_single', 'auto_key',
                        CAST(:steps AS jsonb), 'expert_verified', CAST(:hints AS jsonb), 60,
                        :options, :hash, :reviewer, 'expert_verified', :level, :level_source,
                        'draft')
                """
            ),
            {"v": version_id, "q": question_id, "subject": subject_id, "stem": body.stem,
             "level_source": "unverified" if body.level is None else "expert_verified",
             "instructions": (body.instructions or "").strip() or None,
             "steps": json.dumps(body.solution_steps), "hints": json.dumps(body.hints),
             "options": len(body.options), "hash": _content_hash(body),
             "reviewer": staff.reviewer_id, "level": body.level},
        )
        await _write_options(conn, version_id, subject_id, body)
        await conn.execute(
            text("UPDATE questions SET current_version_id = :v WHERE id = :q"),
            {"v": version_id, "q": question_id},
        )
        if body.skill_id:
            await _set_skill(conn, question_id, subject_id, body.skill_id, staff.reviewer_id)
        await audit.record(conn, staff, "bank.question.add",
                           f"Added question {number} to {paper['paper_code']}",
                           target_kind="question", target_id=str(question_id))
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        raise HTTPException(status_code=409, detail=_message(error)) from error
    return Saved(question_id=question_id)


@router.put("/questions/{question_id}", response_model=Saved, summary="Edit a question")
async def edit_question(
    question_id: UUID,
    body: QuestionIn,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> Saved:
    current = await _one(
        conn,
        """
        SELECT q.subject_id, q.question_number, v.id AS version_id, v.version, v.review_status,
               v.content_hash, v.stem, v.instructions, v.mastery_level_number, v.level_source,
               v.answer_source, v.expected_seconds, v.marks, v.passage_id,
               (SELECT option_key FROM question_options o
                WHERE o.question_version_id = v.id AND o.is_correct) AS answer
        FROM questions q JOIN question_versions v ON v.id = q.current_version_id
        WHERE q.id = :id AND q.retired_at IS NULL
        """,
        "We couldn't find that question.", id=question_id,
    )
    subject_id = current["subject_id"]
    new_hash = _content_hash(body)
    asked_changed = (
        new_hash != current["content_hash"]
        or body.answer != current["answer"]
    )
    level = body.level if body.level is not None else current["mastery_level_number"]
    # A level the reviewer set counts as checked; one left as it was keeps its own standing.
    level_source = "expert_verified" if body.level is not None else current["level_source"]
    try:
        if current["review_status"] == "approved" and asked_changed:
            # Frozen once approved: the change becomes a new draft version, and the approved
            # one is withdrawn, so the question waits for a reviewer before it is served again.
            version_id = uuid4()
            await conn.execute(
                text(
                    """
                    INSERT INTO question_versions (id, question_id, subject_id, version, stem,
                      instructions, passage_id, response_format, marking_method, solution_steps,
                      solution_source, hints, marks, expected_seconds, option_count,
                      content_hash, authored_by, answer_source, mastery_level_number,
                      level_source, review_status)
                    VALUES (:v, :q, :subject, :version, :stem, :instructions, :passage,
                            'mcq_single', 'auto_key', CAST(:steps AS jsonb), 'expert_verified',
                            CAST(:hints AS jsonb), :marks, :seconds, :options, :hash,
                            :reviewer, 'expert_verified', :level, :level_source, 'draft')
                    """
                ),
                {"v": version_id, "q": question_id, "subject": subject_id,
                 "level_source": level_source, "version": current["version"] + 1, "stem": body.stem,
                 "instructions": (body.instructions or "").strip() or None,
                 "passage": current["passage_id"], "steps": json.dumps(body.solution_steps),
                 "hints": json.dumps(body.hints), "marks": current["marks"],
                 "seconds": current["expected_seconds"] or 60, "options": len(body.options),
                 "hash": new_hash, "reviewer": staff.reviewer_id, "level": level},
            )
            await _write_options(conn, version_id, subject_id, body)
            await conn.execute(
                text(
                    """
                    INSERT INTO question_assets (question_version_id, storage_uri, mime_type,
                      byte_size, width, height, alt_text, alt_text_source, source_location,
                      licence_status, display_order)
                    SELECT :new, storage_uri, mime_type, byte_size, width, height, alt_text,
                           alt_text_source, source_location, licence_status, display_order
                    FROM question_assets WHERE question_version_id = :old
                    """
                ),
                {"new": version_id, "old": current["version_id"]},
            )
            await conn.execute(
                text("UPDATE question_versions SET review_status = 'withdrawn' WHERE id = :v"),
                {"v": current["version_id"]},
            )
            await conn.execute(
                text("UPDATE questions SET current_version_id = :v WHERE id = :q"),
                {"v": version_id, "q": question_id},
            )
            summary = "Edited question {n}: a new version, waiting for approval"
        elif current["review_status"] == "approved":
            # Only the working and hints changed: improved in place, still served.
            await conn.execute(
                text(
                    """
                    UPDATE question_versions SET solution_steps = CAST(:steps AS jsonb),
                      hints = CAST(:hints AS jsonb), solution_source = 'expert_verified'
                    WHERE id = :v
                    """
                ),
                {"v": current["version_id"], "steps": json.dumps(body.solution_steps),
                 "hints": json.dumps(body.hints)},
            )
            summary = "Improved the working of question {n}"
        else:
            version_id = current["version_id"]
            await conn.execute(
                text("DELETE FROM question_options WHERE question_version_id = :v"),
                {"v": version_id},
            )
            await conn.execute(
                text(
                    """
                    UPDATE question_versions SET stem = :stem, instructions = :instructions,
                      solution_steps = CAST(:steps AS jsonb), hints = CAST(:hints AS jsonb),
                      solution_source = 'expert_verified', option_count = :options,
                      content_hash = :hash,
                      answer_source = 'expert_verified', mastery_level_number = :level,
                      level_source = :level_source
                    WHERE id = :v
                    """
                ),
                {"v": version_id, "level_source": level_source, "stem": body.stem,
                 "instructions": (body.instructions or "").strip() or None,
                 "steps": json.dumps(body.solution_steps), "hints": json.dumps(body.hints),
                 "options": len(body.options), "hash": new_hash, "level": level},
            )
            await _write_options(conn, version_id, subject_id, body)
            summary = "Edited question {n}"
        if body.question_number and body.question_number != current["question_number"]:
            await conn.execute(
                text("UPDATE questions SET question_number = :n WHERE id = :q"),
                {"n": body.question_number, "q": question_id},
            )
        if body.skill_id:
            await _set_skill(conn, question_id, subject_id, body.skill_id, staff.reviewer_id)
        await audit.record(
            conn, staff, "bank.question.edit",
            summary.format(n=body.question_number or current["question_number"] or ""),
            target_kind="question", target_id=str(question_id),
        )
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        raise HTTPException(status_code=409, detail=_message(error)) from error
    return Saved(question_id=question_id)


class Removal(BaseModel):
    reason: str = Field(default="Removed by a reviewer", max_length=300)


@router.post("/questions/{question_id}/remove", status_code=204, summary="Remove a question")
async def remove_question(
    question_id: UUID,
    body: Removal,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> Response:
    question = await _one(
        conn,
        "SELECT question_number, paper_code FROM questions WHERE id = :id AND retired_at IS NULL",
        "We couldn't find that question.", id=question_id,
    )
    await conn.execute(
        text(
            """
            UPDATE questions SET retired_at = now(), retired_reason = :reason, retired_by = :by
            WHERE id = :id
            """
        ),
        {"id": question_id, "reason": body.reason.strip() or "Removed by a reviewer",
         "by": staff.student_id},
    )
    await audit.record(
        conn, staff, "bank.question.remove",
        f"Removed question {question['question_number']} from {question['paper_code']}",
        target_kind="question", target_id=str(question_id), detail={"reason": body.reason},
    )
    await conn.commit()
    return Response(status_code=204)


class PaperOf(BaseModel):
    paper_id: UUID


@router.get("/questions/{question_id}/paper", response_model=PaperOf, summary="A question's paper")
async def paper_of(
    question_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> PaperOf:
    found = await _one(
        conn,
        "SELECT exam_paper_id AS paper_id FROM questions"
        " WHERE id = :id AND exam_paper_id IS NOT NULL",
        "That question isn't in a paper.", id=question_id,
    )
    return PaperOf(**found)
