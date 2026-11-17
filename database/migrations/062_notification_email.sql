-- Notifications by email (founder, 17 Nov 2026): what each student wants by email, and which
-- notifications were emailed. Every email carries a link that turns that kind off without
-- signing in (`unsubscribe_token`).

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE notification_prefs (
  student_id uuid PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  -- Streak, missed days, the exam countdown, mocks and the roadmap.
  email_reminders boolean NOT NULL DEFAULT true,
  -- The weekly report.
  email_reports boolean NOT NULL DEFAULT true,
  -- Plans starting and ending, password and login changes.
  email_account boolean NOT NULL DEFAULT true,
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Reminders are one email a day at most.
  last_reminder_email_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_prefs IS
  'What a student wants by email. No row means the defaults (everything on).';

ALTER TABLE notifications ADD COLUMN emailed_at timestamptz;
CREATE INDEX notifications_to_email ON notifications (created_at) WHERE emailed_at IS NULL;

UPDATE tracker_items
   SET status = 'doing', planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date,
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE title = 'Weekly reports by email, to students and parents';

COMMIT;
