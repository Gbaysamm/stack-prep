"""A subject's topics, edited by reviewers (docs/plans/2026-11-10-reviewer-question-bank.md).

A subject's syllabus is a tree: topics, subtopics under them, skills under those. A question
is filed under a skill (its approved primary classification), and is only served under an
approved skill. Here a reviewer sees the tree with how many questions sit under each part,
adds a topic, subtopic or skill, renames one (migration 038), and removes one.

The guardrail on removing: a part with questions under it is only removed once they have a new
home. The reviewer names a skill to move them to (in the same subject); the questions are
re-filed there, approved, and then the part and everything under it is withdrawn. Nothing is
deleted, so a mistake can be put right in the database.

A subject with no syllabus yet gets one the first time a topic is added: an approved syllabus
version, filed under a document that says it was written by reviewers.
"""

from __future__ import annotations

import hashlib
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app import audit
from app.auth import Staff, reviewer_session
from app.db import connection, fetch_all
from app.routers.bank import _message, _one

router = APIRouter(prefix="/v1/bank", tags=["bank"], dependencies=[Depends(reviewer_session)])

Kind = Literal["topic", "subtopic", "skill"]
CHILD: dict[str | None, Kind] = {None: "topic", "topic": "subtopic", "subtopic": "skill"}

#: Live questions filed under each skill: an approved primary classification, not retired.
FILED = """
    SELECT c.curriculum_item_id AS skill_id, count(*) AS n
    FROM question_classifications c JOIN questions q ON q.id = c.question_id
    WHERE c.classification_role = 'primary' AND c.review_status = 'approved'
      AND q.retired_at IS NULL
    GROUP BY c.curriculum_item_id
"""


class TopicNode(BaseModel):
    id: UUID
    kind: Kind
    code: str
    name: str
    parent_id: UUID | None
    #: Questions under it: its own for a skill, its skills' together for a topic or subtopic.
    questions: int


class TopicTree(BaseModel):
    subject_id: UUID
    subject_name: str
    exam_id: UUID
    exam_short_name: str
    syllabus_version_id: UUID | None
    items: list[TopicNode]


async def _syllabus(conn: AsyncConnection, subject_id: UUID) -> UUID | None:
    rows = await fetch_all(
        conn,
        """
        SELECT id FROM syllabus_versions
        WHERE subject_id = :subject AND status = 'approved' AND is_current
        """,
        subject=subject_id,
    )
    return rows[0]["id"] if rows else None


@router.get("/subjects/{subject_id}/topics", response_model=TopicTree, summary="A subject's topics")
async def topic_tree(
    subject_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> TopicTree:
    subject = await _one(
        conn,
        """
        SELECT s.id AS subject_id, s.name AS subject_name, e.id AS exam_id,
               e.short_name AS exam_short_name
        FROM subjects s JOIN examinations e ON e.id = s.examination_id WHERE s.id = :id
        """,
        "We couldn't find that subject.",
        id=subject_id,
    )
    version = await _syllabus(conn, subject_id)
    items: list[dict[str, Any]] = []
    if version:
        items = await fetch_all(
            conn,
            f"""
            WITH filed AS ({FILED})
            SELECT ci.id, ci.item_type AS kind, ci.code, ci.name, ci.parent_id,
                   CASE ci.item_type
                     WHEN 'skill' THEN coalesce((SELECT n FROM filed WHERE skill_id = ci.id), 0)
                     WHEN 'subtopic' THEN coalesce((
                       SELECT sum(f.n) FROM curriculum_items k JOIN filed f ON f.skill_id = k.id
                       WHERE k.parent_id = ci.id AND k.review_status = 'approved'), 0)
                     ELSE coalesce((
                       SELECT sum(f.n) FROM curriculum_items st
                       JOIN curriculum_items k ON k.parent_id = st.id
                         AND k.review_status = 'approved'
                       JOIN filed f ON f.skill_id = k.id
                       WHERE st.parent_id = ci.id AND st.review_status = 'approved'), 0)
                   END AS questions
            FROM curriculum_items ci
            WHERE ci.syllabus_version_id = :version AND ci.review_status = 'approved'
            ORDER BY ci.display_order, ci.code
            """,
            version=version,
        )
    return TopicTree(
        **subject, syllabus_version_id=version, items=[TopicNode(**row) for row in items]
    )


async def _start_syllabus(conn: AsyncConnection, subject_id: UUID, staff: Staff) -> UUID:
    """An approved syllabus for a subject that has none, filed under a reviewers' document."""
    exam_id = (
        await fetch_all(conn, "SELECT examination_id FROM subjects WHERE id = :id", id=subject_id)
    )[0]["examination_id"]
    document_id, version_id = uuid4(), uuid4()
    await conn.execute(
        text(
            """
            INSERT INTO source_documents (id, examination_id, subject_id, document_type, title,
              issuer, file_uri, file_sha256, mime_type, licence_status, storage_permission,
              student_delivery_permission, model_context_permission, processing_status,
              review_status, uploaded_by, reviewed_by, reviewed_at)
            VALUES (:doc, :exam, :subject, 'syllabus', 'Topics written by reviewers',
                    'Stack Prep reviewers', 'reviewer-dashboard', :sha, 'text/plain',
                    'verified', true, true, true, 'processed', 'approved', :reviewer,
                    :reviewer, now())
            """
        ),
        {
            "doc": document_id,
            "exam": exam_id,
            "subject": subject_id,
            "sha": hashlib.sha256(f"reviewer-topics:{subject_id}".encode()).hexdigest(),
            "reviewer": staff.reviewer_id,
        },
    )
    await conn.execute(
        text(
            """
            INSERT INTO syllabus_versions (id, subject_id, version_label, source_document_id,
              status, is_current, approved_by, approved_at)
            VALUES (:id, :subject, 'reviewers-1', :doc, 'approved', true, :reviewer, now())
            """
        ),
        {
            "id": version_id,
            "subject": subject_id,
            "doc": document_id,
            "reviewer": staff.reviewer_id,
        },
    )
    return version_id


class NewTopic(BaseModel):
    #: None for a topic; a topic for a subtopic; a subtopic for a skill.
    parent_id: UUID | None = None
    name: str = Field(min_length=2, max_length=160)


@router.post(
    "/subjects/{subject_id}/topics",
    response_model=TopicNode,
    status_code=201,
    summary="Add a topic, subtopic or skill",
)
async def add_topic(
    subject_id: UUID,
    body: NewTopic,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> TopicNode:
    name = " ".join(body.name.split())
    try:
        version = await _syllabus(conn, subject_id) or await _start_syllabus(
            conn, subject_id, staff
        )
        parent: dict[str, Any] | None = None
        if body.parent_id:
            parent = await _one(
                conn,
                """
                SELECT id, item_type, code FROM curriculum_items
                WHERE id = :id AND syllabus_version_id = :version AND review_status = 'approved'
                """,
                "We couldn't find where to add it.",
                id=body.parent_id,
                version=version,
            )
            if parent["item_type"] == "skill":
                raise HTTPException(status_code=422, detail="A skill can't have anything under it.")
        kind = CHILD[parent["item_type"] if parent else None]
        siblings = (
            await fetch_all(
                conn,
                """
            SELECT count(*) AS n, coalesce(max(display_order), 0) AS last
            FROM curriculum_items WHERE syllabus_version_id = :version
              AND parent_id IS NOT DISTINCT FROM :parent
            """,
                version=version,
                parent=body.parent_id,
            )
        )[0]
        prefix = (
            parent["code"]
            if parent
            else (await fetch_all(conn, "SELECT code FROM subjects WHERE id = :id", id=subject_id))[
                0
            ]["code"]
        )
        index = siblings["n"] + 1
        while True:
            code = f"{prefix}.{index}"
            clash = await fetch_all(
                conn,
                "SELECT 1 FROM curriculum_items WHERE syllabus_version_id = :v AND code = :c",
                v=version,
                c=code,
            )
            if not clash:
                break
            index += 1
        item_id = uuid4()
        await conn.execute(
            text(
                """
                INSERT INTO curriculum_items (id, syllabus_version_id, subject_id, parent_id,
                  item_type, code, name, syllabus_status, pilot_support_status, display_order,
                  review_status)
                VALUES (:id, :version, :subject, :parent, :kind, :code, :name, 'explicit',
                        'supported', :order, 'draft')
                """
            ),
            {
                "id": item_id,
                "version": version,
                "subject": subject_id,
                "parent": body.parent_id,
                "kind": kind,
                "code": code,
                "name": name,
                "order": siblings["last"] + 1,
            },
        )
        await conn.execute(
            text(
                """
                INSERT INTO curriculum_evidence (curriculum_item_id, evidence_kind,
                  decision_rationale, decision_evidence_reference, review_status, reviewed_by,
                  reviewed_at)
                VALUES (:item, 'academic_boundary', 'Added by a reviewer in the dashboard',
                        'Reviewer dashboard', 'approved', :reviewer, now())
                """
            ),
            {"item": item_id, "reviewer": staff.reviewer_id},
        )
        await conn.execute(
            text(
                """
                UPDATE curriculum_items
                SET review_status = 'approved', approved_by = :reviewer, approved_at = now()
                WHERE id = :id
                """
            ),
            {"id": item_id, "reviewer": staff.reviewer_id},
        )
        await audit.record(
            conn,
            staff,
            "bank.topic.add",
            f"Added the {kind} “{name}”",
            target_kind="curriculum_item",
            target_id=str(item_id),
        )
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        raise HTTPException(status_code=409, detail=_message(error)) from error
    return TopicNode(
        id=item_id, kind=kind, code=code, name=name, parent_id=body.parent_id, questions=0
    )


class Rename(BaseModel):
    name: str = Field(min_length=2, max_length=160)


@router.put("/topics/{item_id}", response_model=TopicNode, summary="Rename a topic")
async def rename_topic(
    item_id: UUID,
    body: Rename,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> TopicNode:
    item = await _one(
        conn,
        """
        SELECT id, item_type AS kind, code, name, parent_id FROM curriculum_items
        WHERE id = :id AND review_status = 'approved'
        """,
        "We couldn't find that topic.",
        id=item_id,
    )
    name = " ".join(body.name.split())
    await conn.execute(
        text("UPDATE curriculum_items SET name = :name WHERE id = :id"),
        {"id": item_id, "name": name},
    )
    await audit.record(
        conn,
        staff,
        "bank.topic.rename",
        f"Renamed the {item['kind']} “{item['name']}” to “{name}”",
        target_kind="curriculum_item",
        target_id=str(item_id),
    )
    await conn.commit()
    return TopicNode(**{**item, "name": name}, questions=0)


async def _descendants(conn: AsyncConnection, item_id: UUID) -> list[UUID]:
    rows = await fetch_all(
        conn,
        """
        WITH RECURSIVE tree(id) AS (
          SELECT id FROM curriculum_items WHERE id = :id
          UNION ALL
          SELECT c.id FROM curriculum_items c JOIN tree t ON c.parent_id = t.id
          WHERE c.review_status = 'approved'
        ) SELECT id FROM tree
        """,
        id=item_id,
    )
    return [row["id"] for row in rows]


class Removal(BaseModel):
    #: Where its questions go. Needed when it has any; a skill in the same subject.
    move_to_skill_id: UUID | None = None


class Removed(BaseModel):
    moved: int


@router.post("/topics/{item_id}/remove", response_model=Removed, summary="Remove a topic")
async def remove_topic(
    item_id: UUID,
    body: Removal,
    conn: Annotated[AsyncConnection, Depends(connection)],
    staff: Annotated[Staff, Depends(reviewer_session)],
) -> Removed:
    item = await _one(
        conn,
        """
        SELECT id, item_type AS kind, name, subject_id, syllabus_version_id
        FROM curriculum_items WHERE id = :id AND review_status = 'approved'
        """,
        "We couldn't find that topic.",
        id=item_id,
    )
    inside = await _descendants(conn, item_id)
    filed = await fetch_all(
        conn,
        """
        SELECT c.question_id FROM question_classifications c
        JOIN questions q ON q.id = c.question_id
        WHERE c.curriculum_item_id = ANY(:items) AND c.classification_role = 'primary'
          AND c.review_status <> 'withdrawn' AND q.retired_at IS NULL
        """,
        items=inside,
    )
    if filed and body.move_to_skill_id is None:
        raise HTTPException(
            status_code=409,
            detail=f"{len(filed)} questions are filed under it. Choose a skill to move them to "
            "first.",
        )
    try:
        if filed:
            target = await _one(
                conn,
                """
                SELECT id, syllabus_version_id FROM curriculum_items
                WHERE id = :id AND item_type = 'skill' AND review_status = 'approved'
                  AND subject_id = :subject
                """,
                "Choose a skill in this subject to move the questions to.",
                id=body.move_to_skill_id,
                subject=item["subject_id"],
            )
            if target["id"] in inside:
                raise HTTPException(
                    status_code=422, detail="Move them to a skill outside what you're removing."
                )
            questions = [row["question_id"] for row in filed]
            await conn.execute(
                text(
                    """
                    UPDATE question_classifications SET review_status = 'withdrawn'
                    WHERE question_id = ANY(:q) AND classification_role = 'primary'
                      AND review_status <> 'withdrawn' AND curriculum_item_id <> :target
                    """
                ),
                {"q": questions, "target": target["id"]},
            )
            await conn.execute(
                text(
                    """
                    INSERT INTO question_classifications (question_id, subject_id,
                      curriculum_item_id, syllabus_version_id, classification_role,
                      proposed_by, classification_reason, review_status, reviewed_by,
                      reviewed_at)
                    SELECT q, :subject, :target, :syllabus, 'primary', 'human',
                           'Moved here when its topic was removed', 'approved', :reviewer, now()
                    FROM unnest(CAST(:q AS uuid[])) AS q
                    ON CONFLICT (question_id, curriculum_item_id) DO UPDATE
                      SET review_status = 'approved', reviewed_by = :reviewer,
                          reviewed_at = now()
                    """
                ),
                {
                    "q": questions,
                    "subject": item["subject_id"],
                    "target": target["id"],
                    "syllabus": target["syllabus_version_id"],
                    "reviewer": staff.reviewer_id,
                },
            )
        await conn.execute(
            text("UPDATE curriculum_items SET review_status = 'withdrawn' WHERE id = ANY(:ids)"),
            {"ids": inside},
        )
        await audit.record(
            conn,
            staff,
            "bank.topic.remove",
            f"Removed the {item['kind']} “{item['name']}”"
            + (f", moving {len(filed)} questions" if filed else ""),
            target_kind="curriculum_item",
            target_id=str(item_id),
        )
        await conn.commit()
    except DBAPIError as error:
        await conn.rollback()
        raise HTTPException(status_code=409, detail=_message(error)) from error
    return Removed(moved=len(filed))


class FiledQuestion(BaseModel):
    question_id: UUID
    question_number: str | None
    stem: str
    paper_id: UUID | None
    paper_title: str | None
    state: str


@router.get(
    "/topics/{item_id}/questions",
    response_model=list[FiledQuestion],
    summary="The questions under a topic",
)
async def topic_questions(
    item_id: UUID, conn: Annotated[AsyncConnection, Depends(connection)]
) -> list[FiledQuestion]:
    inside = await _descendants(conn, item_id)
    rows = await fetch_all(
        conn,
        """
        SELECT q.id AS question_id, q.question_number, v.stem, p.id AS paper_id,
               p.name AS paper_title, v.review_status AS state
        FROM question_classifications c JOIN questions q ON q.id = c.question_id
        JOIN question_versions v ON v.id = q.current_version_id
        LEFT JOIN exam_papers p ON p.id = q.exam_paper_id
        WHERE c.curriculum_item_id = ANY(:items) AND c.classification_role = 'primary'
          AND c.review_status = 'approved' AND q.retired_at IS NULL
        ORDER BY p.exam_year DESC NULLS LAST, length(q.question_number), q.question_number
        LIMIT 300
        """,
        items=inside,
    )
    return [FiledQuestion(**row) for row in rows]
