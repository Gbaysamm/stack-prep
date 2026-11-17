-- Notifications by email (founder, 17 Nov 2026). Every student gets them; none can be turned
-- off (a student who could would not be serious). This records which notifications were
-- emailed, and when each student last had a reminder email, so reminders are one a day at most.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE notification_email_state (
  student_id uuid PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  last_reminder_email_at timestamptz
);

ALTER TABLE notifications ADD COLUMN emailed_at timestamptz;
CREATE INDEX notifications_to_email ON notifications (created_at) WHERE emailed_at IS NULL;

UPDATE tracker_items
   SET status = 'doing', planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date,
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE title = 'Weekly reports by email, to students and parents';

COMMIT;
