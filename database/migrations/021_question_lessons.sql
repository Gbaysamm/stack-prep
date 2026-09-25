-- A question's worked solution as a lesson: what the teacher says, and what goes on the board.
--
-- The board was built to write `solution_steps`, which are written to be READ: whole sentences,
-- with working folded into them and intermediate lines left out because a reader fills them in.
-- Spoken over a board, that fails twice. Read aloud word for word, the voice adds nothing the
-- student could not read. Taught live by a model over the same steps, the board can only show
-- what the steps contain, so "0 = 4x - 8" is followed by "(2, 0)" with the two lines between
-- them missing — and the lesson has to be written, and voiced, while the student waits.
--
-- A lesson is written ahead of time instead, the way a good whiteboard teacher prepares one:
-- a run of MOMENTS, each one thing said and at most one line written while it is said, with
-- every line of working present. It is written against a question version and checked like
-- the rest of that version's content, so what a student hears and sees is the same every time
-- and nothing on the board is generated for them.
--
-- Kept beside the version rather than in it: the lesson is how the question is taught, not
-- what the question is, and rewriting it must not re-version or re-approve the question.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE question_lessons (
  question_version_id uuid PRIMARY KEY REFERENCES question_versions(id) ON DELETE CASCADE,
  -- [{"say": text, "write": text|null, "answer": bool}, ...] in the order they happen.
  moments jsonb NOT NULL
    CHECK (jsonb_typeof(moments) = 'array' AND jsonb_array_length(moments) > 0),
  -- {"A": text, ...}: what is said at the end to a student who chose that wrong option.
  traps jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(traps) = 'object'),
  -- The repository file the lesson was loaded from, so a reviewer can find and correct it.
  source_file text NOT NULL CHECK (btrim(source_file) <> ''),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE question_lessons IS
  'A question version''s worked solution written as a lesson: moments of speech, each with at '
  'most one line of working written while it is said. Prepared and checked ahead of time; the '
  'board plays it, and a version without one falls back to its solution_steps.';

COMMIT;
