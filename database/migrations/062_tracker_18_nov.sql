-- Today's plan (founder, 18 Nov 2026): finish the notifications, then gamification. Both on
-- today's plan and at the top of the tracker, in that order; the rest keeps its order below.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date, updated_at = now(),
       updated_by = 'Stack Prep', status = v.status, position = v.position,
       note = coalesce(v.note, tracker_items.note)
  FROM (VALUES
    ('Notifications: in-app, email reminders and rewards', 'doing', -40,
     'Finish today: emails live (welcome, security, plan, reminders), the email designs '
     || 'approved, then the rest below.'),
    ('Weekly reports by email, to students and parents', 'doing', -39,
     'Student report built; parents next (email first, with consent).'),
    ('Push notifications and settings', 'todo', -38, NULL),
    ('Gamification across the app', 'todo', -37,
     'Next after notifications, today: to plan together first.')
  ) AS v(title, status, position, note)
 WHERE tracker_items.title = v.title AND tracker_items.status NOT IN ('done', 'committed', 'deployed');

COMMIT;
