-- What the student said after a lesson: did it land, and did it match their own working.
--
-- A lesson is opened three ways: at the board after two misses, or from a right answer the
-- student doubted — one they said they guessed, or were unsure of ("Show me why"). Afterwards
-- they are asked whether they understood it, and optionally whether the working matched what
-- they did. `context` records which door they came through, so "too hard after two misses"
-- and "too hard after a lucky guess" can be read apart.
--
-- One row per answer they give. A student may change their mind and answer again; summaries
-- read the latest row per question. Nothing here is scored: it tells the plan and the home
-- page what to bring back, not what the student knows.
--
-- The rows are the means of bringing a question back, not the student's record, so they go
-- with the student or the session they belong to.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE lesson_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL,
  context text NOT NULL CHECK (context IN ('after_misses', 'after_guess', 'after_unsure')),
  understood text NOT NULL CHECK (understood IN ('got_it', 'unsure', 'too_hard')),
  matched_working text CHECK (matched_working IN ('yes', 'partly', 'no')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lesson_feedback IS
  'What a student said after a lesson: whether they understood it and whether it matched their '
  'working. One row per submission; the latest per question is the one that counts.';

CREATE INDEX lesson_feedback_student_idx ON lesson_feedback(student_id, created_at DESC);

COMMIT;
