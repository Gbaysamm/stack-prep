-- The page redesigns, one task per page, and today's work on record (founder, 16 Nov 2026).
--
-- "Redesign the remaining pages" was one task; it is now one per page of the student app, so
-- each page gets its own design and the list shows what is left. The pages redesigned on
-- 16 Nov 2026 are recorded as finished that day.

BEGIN;
SET LOCAL search_path = stackprep, public;

DELETE FROM tracker_items WHERE title = 'Redesign the remaining pages and cut the text';

INSERT INTO tracker_items (area, status, title, note, done_at, planned_for, updated_by) VALUES
  ('Page redesigns', 'deployed', 'Practice page',
   'No banner; a sticker card per subject with its history; one run at a time; Your practice stats.',
   '2026-11-16 15:30+01', NULL, 'Stack Prep'),
  ('Page redesigns', 'deployed', 'Check-up page',
   'No banner; one purple card per subject, score coloured by level; check-up history popup.',
   '2026-11-16 15:30+01', NULL, 'Stack Prep'),
  ('Page redesigns', 'deployed', 'Mock exam page',
   'Scheduled (set for you) and custom (set yourself), each locked until it may be sat; admin scheduling.',
   '2026-11-16 15:30+01', NULL, 'Stack Prep'),
  ('Tracker', 'deployed', 'Today shows what was finished today; one list by day, not by area',
   NULL, '2026-11-16 15:30+01', NULL, 'Stack Prep'),
  ('Tracker', 'committed', 'True finished dates; calmer rows on a phone',
   NULL, '2026-11-16 17:00+01', NULL, 'Stack Prep'),
  ('Page redesigns', 'doing', 'Progress page',
   'One subject filter; the run bars; recent runs with all in a popup; topics fold away; no score before 3 answers.',
   NULL, '2026-11-16', 'Stack Prep'),
  ('Page redesigns', 'todo', 'Home', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Roadmap', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Subject page', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Practice run (the question screen)', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Run report', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Check-up sitting', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Check-up report', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Mock set-up', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Mock exam room', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Mock report', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Lesson (the board)', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'After the lesson', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Saved questions', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Exams and goals', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Onboarding', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Plans and payment', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Profile', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Settings', NULL, NULL, NULL, 'Stack Prep'),
  ('Page redesigns', 'todo', 'Help and messages', NULL, NULL, NULL, 'Stack Prep');

COMMIT;
