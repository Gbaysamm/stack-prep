-- Lessons edited from the reviewer side (founder, 13 Nov 2026).
--
-- A reviewer can now correct what a lesson says or writes from the Lessons page. The repository
-- file stays the source the loader reads, so an edit made in the app is marked here: the loader
-- leaves a marked lesson alone (and names it) until the edit is copied into the file, or it is
-- told to overwrite edits.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE subtopic_lesson_content
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN edited_by text;

COMMENT ON COLUMN subtopic_lesson_content.edited_at IS
  'When a reviewer last edited this lesson in the app; NULL when it is exactly as loaded from its file.';
COMMENT ON COLUMN subtopic_lesson_content.edited_by IS
  'Who made that edit.';

COMMIT;
