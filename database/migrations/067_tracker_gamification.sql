-- The tracker on 18 Nov 2026: notifications built (what is left is in
-- docs/notifications-pending.md and waits on server settings); gamification planned and started.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), updated_at = now(),
       updated_by = 'Stack Prep'
 WHERE title IN ('Notifications: in-app, email reminders and rewards',
                 'Weekly reports by email, to students and parents',
                 'Push notifications and settings')
   AND status NOT IN ('done', 'committed', 'deployed');

INSERT INTO tracker_items (area, status, title, note, planned_for, position, updated_by) VALUES
  ('Notifications', 'waiting', 'Server settings for email and push',
   'On each server: SMTP_* and MAIL_FROM, PUBLIC_URL, VAPID keys (python -m app.cli '
   || 'vapid-keys); SPF and DKIM for the sending domain. Full list: '
   || 'docs/notifications-pending.md.',
   (now() AT TIME ZONE 'Africa/Lagos')::date, -41, 'Stack Prep');

UPDATE tracker_items
   SET status = 'doing', updated_at = now(), updated_by = 'Stack Prep',
       note = 'Plan in docs/gamification-plan.md: points and the answer loop, daily goal and '
              || 'streak freeze, badges, levels, leagues later. Decisions with the founder first.'
 WHERE title = 'Gamification across the app' AND status NOT IN ('done', 'committed', 'deployed');

COMMIT;
