-- The subtopic lesson bank: one written lesson per subtopic, played on the board when the
-- roadmap's lesson stop comes up (a run left the subtopic below the 80% bar).
--
-- The same shape as a question's written lesson (021, 027): MOMENTS, each one thing said and at
-- most one line written while it is said, with the doodles they bring in. Written ahead of
-- time from docs/lessons/subtopics/<subject>/<slug>.yaml and checked by the same modules
-- (database/load_subtopic_lessons.py), so what a student hears and sees is the same every time.
-- A subtopic with no row here falls back to the reviewed working of the questions missed.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE subtopic_lesson_content (
  subtopic_id uuid PRIMARY KEY REFERENCES curriculum_items (id) ON DELETE CASCADE,
  moments jsonb NOT NULL
    CHECK (jsonb_typeof(moments) = 'array' AND jsonb_array_length(moments) > 0),
  doodles jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(doodles) = 'array'),
  -- The repository file it was loaded from, so a reviewer can find and correct it.
  source_file text NOT NULL CHECK (btrim(source_file) <> ''),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subtopic_lesson_content IS
  'A subtopic''s written lesson for the board: moments of speech, each with at most one line '
  'written while it is said, and the doodles they bring in.';

COMMIT;
