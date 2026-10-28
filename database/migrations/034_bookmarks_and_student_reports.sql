-- Bookmarks, and problem reports from students.
--
-- Bookmarks: a student keeps a question to come back to. Keyed by the question, so a new
-- version of it stays bookmarked; `question_version_id` is the version they saw, which the
-- list shows. A bookmark can be revised as a practice run (routers/practice.py, `bookmarked`).
--
-- Reports: question_reports (migration 003) already takes reports from students, waiting for
-- a students table to point at. Now it has one. A student's reports go with the student. The
-- report also says where it was made (practice, check-up, mock, a review, a lesson), in
-- `attempt_context`, so the admin dashboard can show it.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE question_bookmarks (
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id         uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, question_id)
);
CREATE INDEX question_bookmarks_recent_idx ON question_bookmarks(student_id, created_at DESC);

-- No student reports exist yet without a student, but make sure before the key goes on.
DELETE FROM question_reports r
WHERE r.reporter_kind = 'student'
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = r.reporter_student_id);

ALTER TABLE question_reports
  ADD CONSTRAINT question_reports_reporter_student_fk
  FOREIGN KEY (reporter_student_id) REFERENCES students(id) ON DELETE CASCADE;
CREATE INDEX question_reports_student_idx ON question_reports(reporter_student_id, created_at)
  WHERE reporter_student_id IS NOT NULL;

COMMIT;
