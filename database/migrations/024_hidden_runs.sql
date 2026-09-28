-- A run the student chose, and a run the student put away.
--
-- A guided run may now be narrowed by the student: to some topics, some subtopics, some exam
-- years. The choice is kept on the session rather than in the browser, so a reload or a
-- second device carries on drawing from the same questions. Null is an ordinary run, planned
-- by the engine as before.
--
-- A student may also delete a run from their lists. It is hidden, not erased: the attempts in
-- it happened and still count toward mastery and the projection, because a record that could
-- be tidied away to improve a number would not be a record. `hidden_at` only takes the run
-- out of what the student is shown.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE study_sessions
  ADD COLUMN practice_filters jsonb
    CHECK (practice_filters IS NULL OR jsonb_typeof(practice_filters) = 'object'),
  ADD COLUMN hidden_at timestamptz;

COMMENT ON COLUMN study_sessions.practice_filters IS
  'The student''s choice for a custom guided run: {topic_ids, subtopic_ids, exam_years}. '
  'Null for an ordinary run planned by the engine.';
COMMENT ON COLUMN study_sessions.hidden_at IS
  'When the student deleted this run from their lists. Its attempts still count; the run is '
  'only no longer shown.';

COMMIT;
