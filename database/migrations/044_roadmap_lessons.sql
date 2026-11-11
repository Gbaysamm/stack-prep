-- Lessons and topic tests on the roadmap (founder, 11 Nov 2026).
--
-- * A run that leaves a subtopic below the mastery bar (80%) puts a LESSON on the path before
--   that subtopic's next run. The lesson is the reviewed working of the questions the student
--   missed there (a written lesson bank replaces it later). Answers after the lesson are the
--   student's real attempt at the subtopic: earlier ones stop counting toward its score.
-- * When every subtopic of a topic has been passed, a TOPIC TEST (one run across the whole
--   topic) goes on the path. Its item keeps the topic's id in `subtopic_id`, the curriculum
--   item it is about.
--
-- `done_at` marks an item finished that has no session behind it (a lesson).

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE roadmap_items DROP CONSTRAINT roadmap_items_kind_check;
ALTER TABLE roadmap_items ADD CONSTRAINT roadmap_items_kind_check
  CHECK (kind IN ('run', 'mixed', 'mock', 'checkup', 'lesson', 'topic_test'));

ALTER TABLE roadmap_items DROP CONSTRAINT roadmap_items_check;
ALTER TABLE roadmap_items ADD CONSTRAINT roadmap_items_check
  CHECK ((kind IN ('run', 'lesson', 'topic_test')) = (subtopic_id IS NOT NULL));

ALTER TABLE roadmap_items DROP CONSTRAINT roadmap_items_reason_check;
ALTER TABLE roadmap_items ADD CONSTRAINT roadmap_items_reason_check
  CHECK (reason IN ('high_value_gap', 'coverage', 'mixed_practice', 'mock', 'checkup',
                    'first_checkup', 'reteach', 'topic_test'));

ALTER TABLE roadmap_items ADD COLUMN done_at timestamptz;

CREATE TABLE subtopic_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id),
  subtopic_id uuid NOT NULL REFERENCES curriculum_items (id),
  finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subtopic_lessons_student ON subtopic_lessons (student_id, subtopic_id, finished_at DESC);

COMMENT ON TABLE subtopic_lessons IS
  'A lesson a student finished on a subtopic. Answers in that subtopic before it stop counting '
  'toward its score once there are answers after it.';

COMMIT;
