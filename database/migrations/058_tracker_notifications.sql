-- Notifications and reports, the next piece of work (founder, 17 Nov 2026): reminders after a
-- missed day, rewards, plan nudges, weekly reports by email to students and parents, an in-app
-- inbox, and later push. The plan is in progress today; the parts follow in this order.

BEGIN;
SET LOCAL search_path = stackprep, public;

INSERT INTO tracker_items (area, status, title, note, planned_for, updated_by) VALUES
  ('Notifications', 'doing', 'Notifications and reports: the plan',
   'Stages (missed a day, streak at risk, away for days, parent alert, rewards, plan, reports), '
   || 'channels (in-app, email, push, parents) and how often, as Duolingo does it. Progress is the '
   || 'report page; the weekly email links to it.',
   (now() AT TIME ZONE 'Africa/Lagos')::date, 'Stack Prep');

INSERT INTO tracker_items (area, status, title, note, updated_by) VALUES
  ('Notifications', 'todo', 'The engine and the hourly job',
   'One list of every notification, a job each hour that decides who gets what, never more than '
   || 'one nudge a day per channel, quiet hours.', 'Stack Prep'),
  ('Notifications', 'todo', 'In-app notifications: a bell and an inbox',
   'Reminders, rewards and plan notes inside the app, read or unread.', 'Stack Prep'),
  ('Notifications', 'todo', 'Email reminders after a missed day',
   'Next day at their usual time; gentler on days 3 and 7; then weekly, stopping after two weeks.',
   'Stack Prep'),
  ('Notifications', 'todo', 'Weekly report by email',
   'Time studied, runs, score change, topics improved, next week''s focus; links to Progress. '
   || 'Daily as an option.', 'Stack Prep'),
  ('Notifications', 'todo', 'Rewards and plan notifications',
   'Streak milestones, a topic mastered, score up after a check-up; check-up due, mock scheduled, '
   || 'exam countdown.', 'Stack Prep'),
  ('Notifications', 'todo', 'Parents: weekly report and missed-days alert',
   'Email first (WhatsApp or SMS later, they cost per message); with consent.', 'Stack Prep'),
  ('Notifications', 'todo', 'Notification settings',
   'Which notifications, which channel, quiet hours, a parent''s contact.', 'Stack Prep'),
  ('Notifications', 'todo', 'Push notifications on the phone',
   'Web push with the student''s permission; on iPhone once the app is on the home screen.',
   'Stack Prep');

COMMIT;
