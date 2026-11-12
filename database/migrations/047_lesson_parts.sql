-- A subtopic holds several short lessons (founder, 12 Nov 2026): a broad subtopic is taught
-- as two to four lessons of about five minutes, each its own stop on the roadmap, and the run
-- again comes after the last. Every subtopic so far has one lesson, part 1.
--
-- docs/lessons/subtopics/<subject>/<slug>.yaml says `part:` (1 when absent) and `title:`
-- (what that lesson covers). Everything recorded about a lesson says which part it was.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE subtopic_lesson_content
  ADD COLUMN part smallint NOT NULL DEFAULT 1 CHECK (part >= 1),
  ADD COLUMN title text;
ALTER TABLE subtopic_lesson_content DROP CONSTRAINT subtopic_lesson_content_pkey;
ALTER TABLE subtopic_lesson_content ADD PRIMARY KEY (subtopic_id, part);

ALTER TABLE subtopic_lessons ADD COLUMN part smallint NOT NULL DEFAULT 1 CHECK (part >= 1);
ALTER TABLE lesson_ratings ADD COLUMN part smallint NOT NULL DEFAULT 1 CHECK (part >= 1);
ALTER TABLE lesson_problem_attempts ADD COLUMN part smallint NOT NULL DEFAULT 1 CHECK (part >= 1);
ALTER TABLE lesson_coach_turns ADD COLUMN part smallint NOT NULL DEFAULT 1 CHECK (part >= 1);

-- A lesson stop on the roadmap says which of the subtopic's lessons it is.
ALTER TABLE roadmap_items ADD COLUMN part smallint CHECK (part IS NULL OR part >= 1);

COMMENT ON COLUMN subtopic_lesson_content.part IS
  'Which of the subtopic''s lessons this is, from 1; each is its own stop on the roadmap.';
COMMENT ON COLUMN subtopic_lesson_content.title IS
  'What this lesson covers, when a subtopic has several (e.g. "The laws of chemical combination").';

COMMIT;
