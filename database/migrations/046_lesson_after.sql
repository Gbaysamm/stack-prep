-- After a subtopic lesson (founder, 12 Nov 2026): the student rates how well they understood,
-- tries one or two short problems (a typed answer, or a photo of the working that the coach
-- marks), and may ask the coach their own question. docs/lessons/subtopic-lesson-guide.md §9.
--
-- The problems are written with the lesson (docs/lessons/subtopics/<subject>/<slug>.yaml,
-- `problems:`) and loaded beside its moments. Ratings say which lessons work; answers and
-- the coach's turns are kept as a practice run's are, because assistance is recorded.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE subtopic_lesson_content
  ADD COLUMN problems jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(problems) = 'array');

COMMENT ON COLUMN subtopic_lesson_content.problems IS
  'One or two short problems tried after the lesson: [{ask, answer, accept[], working[], '
  'needs_working}]. The answer and working are never sent before the student tries.';

CREATE TABLE lesson_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES curriculum_items (id),
  -- 1 not yet, 2 mostly, 3 got it.
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 3),
  rated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_ratings_subtopic ON lesson_ratings (subtopic_id, rated_at DESC);

CREATE TABLE lesson_problem_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES curriculum_items (id),
  problem_index smallint NOT NULL CHECK (problem_index >= 0),
  -- What was typed, or null for a photo (the photo itself is not kept).
  answer_text text,
  by_photo boolean NOT NULL DEFAULT false,
  correct boolean,
  feedback text NOT NULL DEFAULT '',
  -- Who marked it: the answer key, the coach, or the coach's fallback.
  marked_by text NOT NULL CHECK (marked_by IN ('key', 'coach', 'fallback')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tried_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_problem_attempts_student
  ON lesson_problem_attempts (student_id, subtopic_id, tried_at DESC);

CREATE TABLE lesson_coach_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES curriculum_items (id),
  asked text NOT NULL,
  reply text NOT NULL,
  source text NOT NULL CHECK (source IN ('model', 'fallback', 'budget')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  asked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_coach_turns_student ON lesson_coach_turns (student_id, asked_at DESC);

COMMENT ON TABLE lesson_ratings IS
  'How well a student said they understood a subtopic lesson, to learn which lessons work.';
COMMENT ON TABLE lesson_problem_attempts IS
  'A student''s answer to a problem set after a subtopic lesson, and how it was marked.';
COMMENT ON TABLE lesson_coach_turns IS
  'A question a student asked the coach after a subtopic lesson, and the reply.';

COMMIT;
