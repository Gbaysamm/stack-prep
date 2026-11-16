-- Scheduled mocks (founder, 16 Nov 2026).
--
-- A mock is either set for the student or set by them. Set for them: the roadmap's weekly mock
-- before the exam (roadmap_items, kind 'mock'), or a mock Stack Prep schedules for every
-- student of an examination, kept here. Each is open from its first day to its last, in the
-- student's own calendar, and is sat in JAMB's format with the student's own subjects. Set by
-- them: a custom mock.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE scheduled_mocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES examinations (id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  opens_on date NOT NULL,
  closes_on date NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Cancelled ones stay on record; students stop seeing them.
  cancelled_at timestamptz,
  CHECK (closes_on >= opens_on)
);
CREATE INDEX scheduled_mocks_exam_idx ON scheduled_mocks (examination_id, closes_on)
  WHERE cancelled_at IS NULL;

ALTER TABLE mock_exams
  ADD COLUMN scheduled_mock_id uuid REFERENCES scheduled_mocks (id);
CREATE UNIQUE INDEX mock_exams_one_per_schedule_idx ON mock_exams (student_id, scheduled_mock_id)
  WHERE scheduled_mock_id IS NOT NULL AND hidden_at IS NULL;

COMMENT ON TABLE scheduled_mocks IS
  'A mock Stack Prep sets for every student of an examination, open between two days.';

COMMIT;
