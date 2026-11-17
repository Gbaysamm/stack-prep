-- Notifications (founder, 17 Nov 2026): one list of everything a student is told, by the hourly
-- job on the worker (app/notifications.py) or by the app when something happens. The inbox reads
-- it; email and push will send from it later. `dedupe_key` makes each one happen once, so the
-- job can run any number of times.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  -- What happened: missed_day, away, streak_risk, streak_milestone, ...
  kind text NOT NULL CHECK (length(kind) <= 40),
  -- nudge: bring them back (one a day at most); reward; plan; report; system.
  category text NOT NULL CHECK (category IN ('nudge', 'reward', 'plan', 'report', 'system')),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
  body text CHECK (body IS NULL OR length(body) <= 600),
  link_url text CHECK (link_url IS NULL OR length(link_url) <= 300),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  -- Deleted by the student: hidden, but kept so the job never sends the same one again.
  dismissed_at timestamptz,
  UNIQUE (student_id, dedupe_key)
);
CREATE INDEX notifications_student ON notifications (student_id, created_at DESC);

COMMENT ON TABLE notifications IS
  'Everything a student is told (in-app now; email and push later). One row per event.';

UPDATE tracker_steps s SET done = true
  FROM tracker_items i
 WHERE s.item_id = i.id AND i.title = 'Notifications: in-app, email reminders and rewards'
   AND s.text IN ('The engine and the hourly job (on the existing worker)',
                  'A bell and an inbox in the app',
                  'Streak at risk in the evening');

-- Today's work the tracker missed (founder, 17 Nov 2026); already live.
INSERT INTO tracker_items (area, status, title, note, done_at, updated_by) VALUES
  ('Page redesigns', 'deployed', 'Help button on every page',
   'Bottom right; opens a write-to-us panel just above it (a bottom sheet on a phone); the reply '
   || 'comes to Messages.', now(), 'Stack Prep'),
  ('Page redesigns', 'deployed', 'Loading skeletons on every page',
   'No spinners: each page loads as a skeleton of its own layout; a dark header only where the '
   || 'page has one.', now(), 'Stack Prep'),
  ('Page redesigns', 'deployed', 'Pages open faster',
   'Page code is fetched ahead on the live site, and shared answers are fetched once.',
   now(), 'Stack Prep'),
  ('Page redesigns', 'deployed', 'Sidebar: brand at the top, account at the foot',
   'Only the list between them scrolls.', now(), 'Stack Prep');

INSERT INTO tracker_items (area, status, title, note, done_at, updated_by) VALUES
  ('Notifications', 'committed', 'The notifications engine, the hourly job and the bell',
   'Streak at risk (7 pm), missed a day (their usual hour), away 3/7/14 days, streak milestones; '
   || 'one nudge a day, none 9 pm to 8 am. A bell in the top bar shows the latest five; a '
   || 'Notifications page shows them all: open one for more, mark read or unread, delete.'
   || ' Also told: a reply to their message, a plan starting, ending soon or ended, a check-up '
   || 'or mock marked, a password or login change, the welcome, the exam countdown (30, 14, 7, '
   || '1 days), a scheduled mock opening or closing tomorrow, today''s roadmap check-up or mock.', now(), 'Stack Prep');

-- Next after notifications (founder, 17 Nov 2026).
INSERT INTO tracker_items (area, status, title, note, updated_by) VALUES
  ('Gamification', 'todo', 'Gamification across the app',
   'Comes after notifications. To plan together.', 'Stack Prep');

COMMIT;
