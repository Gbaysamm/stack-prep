-- Parents (founder, 17-18 Nov 2026): a student adds a parent or guardian by email; the parent
-- confirms from the email (most students are minors, so nothing about them goes to an adult
-- until that adult says yes); then the parent gets the weekly report and an alert after missed
-- days. Builds on guardians, guardian_students and consents (migration 007).

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE guardian_students
  ADD COLUMN invite_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN invited_at timestamptz;

-- Every email sent to a parent, once per key (the week, or the missed-days run).
CREATE TABLE parent_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_student_id uuid NOT NULL REFERENCES guardian_students (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invite', 'weekly_report', 'missed_days')),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) <= 120),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guardian_student_id, dedupe_key)
);

UPDATE tracker_steps s SET done = true
  FROM tracker_items i
 WHERE s.item_id = i.id AND i.title = 'Weekly reports by email, to students and parents'
   AND s.text LIKE 'Student report:%';

COMMIT;
