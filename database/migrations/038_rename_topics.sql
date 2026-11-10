-- Reviewers edit a subject's topics from the dashboard (docs/plans/2026-11-10-reviewer-question-bank.md):
-- an approved topic, subtopic or skill may now be renamed. Its code, its place in the tree and
-- what it covers stay frozen, as before; removing one is withdrawing it, after its questions
-- have moved to another skill (routers/topics.py).
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE OR REPLACE FUNCTION check_curriculum_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO p FROM curriculum_items WHERE id = NEW.parent_id;
    IF p.id IS NULL OR p.syllabus_version_id <> NEW.syllabus_version_id OR
       (NEW.item_type = 'subtopic' AND p.item_type <> 'topic') OR
       (NEW.item_type = 'skill' AND p.item_type <> 'subtopic') THEN
      RAISE EXCEPTION 'item parent must be a topic/subtopic in the same syllabus version';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (
      WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM curriculum_items WHERE id = NEW.parent_id
        UNION ALL
        SELECT c.id, c.parent_id FROM curriculum_items c JOIN ancestors a ON c.id = a.parent_id
      ) SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'curriculum hierarchy cannot contain a cycle';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.review_status = 'approved' THEN
    -- The name may be reworded (a reviewer tidying the topic list); what the item is, where it
    -- sits and what it covers stay frozen.
    IF ROW(NEW.syllabus_version_id, NEW.subject_id, NEW.parent_id, NEW.item_type,
           NEW.code, NEW.learning_objective, NEW.examinable_scope,
           NEW.expected_depth, NEW.boundary_notes, NEW.syllabus_status)
       IS DISTINCT FROM
       ROW(OLD.syllabus_version_id, OLD.subject_id, OLD.parent_id, OLD.item_type,
           OLD.code, OLD.learning_objective, OLD.examinable_scope,
           OLD.expected_depth, OLD.boundary_notes, OLD.syllabus_status) THEN
      RAISE EXCEPTION 'approved curriculum content is immutable; create a new syllabus version';
    END IF;
  END IF;
  IF NEW.review_status = 'approved' AND (TG_OP = 'INSERT' OR OLD.review_status <> 'approved') THEN
    IF NOT EXISTS (SELECT 1 FROM syllabus_versions WHERE id = NEW.syllabus_version_id AND status = 'approved') THEN
      RAISE EXCEPTION 'curriculum approval requires an approved syllabus version';
    END IF;
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM curriculum_items WHERE id = NEW.parent_id AND review_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'curriculum approval requires an approved parent';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM curriculum_evidence WHERE curriculum_item_id = NEW.id AND review_status = 'approved') THEN
      RAISE EXCEPTION 'curriculum approval requires reviewed evidence';
    END IF;
    IF NEW.syllabus_status = 'excluded' AND NOT EXISTS (
      SELECT 1 FROM curriculum_evidence WHERE curriculum_item_id = NEW.id
        AND review_status = 'approved' AND evidence_kind IN ('explicit_exclusion', 'academic_boundary')
    ) THEN
      RAISE EXCEPTION 'exclusion requires an approved explicit boundary or academic decision';
    END IF;
    IF NEW.syllabus_status = 'prerequisite_only' AND NOT EXISTS (
      SELECT 1 FROM curriculum_evidence WHERE curriculum_item_id = NEW.id
        AND review_status = 'approved' AND evidence_kind IN ('prerequisite', 'academic_boundary')
    ) THEN
      RAISE EXCEPTION 'prerequisite-only item requires reviewed prerequisite evidence';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

COMMIT;
