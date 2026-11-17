-- The tracker, combined (founder, 17 Nov 2026): 24 open items were too many and too small.
-- Related pieces become one item each, with the pieces as its checklist; items that are not
-- ours to track are gone (the OpenAI credit, the lawyer, the Lagos and Ibadan pronunciation,
-- the Mock exam room, which takes the new question screen with no redesign of its own).

BEGIN;
SET LOCAL search_path = stackprep, public;

DELETE FROM tracker_items
 WHERE status NOT IN ('done', 'committed', 'deployed')
   AND title IN (
     -- Not ours to track
     'Lagos, Ibadan, garri pronunciation',
     'Add credit to the OpenAI account',
     'A lawyer to review the legal pages',
     'Mock exam room',
     -- Lessons: one item
     'Second, independent check of every AI-written problem',
     'More subjects'' lessons (beyond Chemistry, the cell, indices)',
     'Timing check of every lesson moment',
     'Draw the brine electrolysis cell',
     'Switch on "Write a lesson" on the Lessons page',
     'Listen to one AI-written lesson end to end',
     'Board lessons for imported AI questions',
     'Write lessons with AI; LaTeX never broken; correct answers; a moderately priced model',
     -- More questions: one item
     'Elements, compounds and mixtures has only 3 questions (all check-up)',
     'More questions per subtopic (about 5,000 to give every subtopic 10; thin subjects: Biology, Chemistry, Physics, Economics, Government, Accounts, Commerce)',
     'Review the uploaded questions one by one next week',
     -- Notifications: three items
     'Notifications and reports: the plan',
     'The engine and the hourly job',
     'In-app notifications: a bell and an inbox',
     'Email reminders after a missed day',
     'Weekly report by email',
     'Rewards and plan notifications',
     'Parents: weekly report and missed-days alert',
     'Notification settings',
     'Push notifications on the phone'
   );

-- One item and its checklist, in order.
CREATE FUNCTION pg_temp.add_item(p_area text, p_status text, p_title text, p_note text,
                                 p_today boolean, p_steps text[]) RETURNS void AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO tracker_items (area, status, title, note, planned_for, updated_by)
  VALUES (p_area, p_status, p_title, p_note,
          CASE WHEN p_today THEN (now() AT TIME ZONE 'Africa/Lagos')::date END, 'Stack Prep')
  RETURNING id INTO new_id;
  INSERT INTO tracker_steps (item_id, text, position)
  SELECT new_id, step, n FROM unnest(p_steps) WITH ORDINALITY AS s(step, n);
END $$ LANGUAGE plpgsql;

SELECT pg_temp.add_item('Lessons', 'doing', 'More subject lessons',
  'Written with AI at a moderate price and checked before they are saved. Later, subject by subject.',
  false, ARRAY[
    'Write lessons with AI: format, LaTeX never broken, correct answers',
    'A second, blind check of every AI-written problem',
    'Every board line and mark on its own word',
    'Drawings where a lesson needs one (the brine electrolysis cell)',
    'Board lessons for the imported AI questions',
    'Switch on "Write a lesson" on the Lessons page',
    'Founder listens to one AI-written lesson end to end'
  ]);

SELECT pg_temp.add_item('Question bank', 'todo', 'More questions',
  'About 5,000, so every subtopic has at least 10; the thin subjects first.',
  false, ARRAY[
    'Generate outside Claude Code: an external AI pasting JSON, or the plan''s monthly API credit',
    'Thin subjects first: Biology, Chemistry, Physics, Economics, Government, Accounts, Commerce',
    'Review the uploaded questions one by one'
  ]);

SELECT pg_temp.add_item('Notifications', 'doing', 'Notifications: in-app, email reminders and rewards',
  'Like Duolingo: the right nudge at the right stage, never more than one a day.',
  true, ARRAY[
    'The engine and the hourly job (on the existing worker)',
    'A bell and an inbox in the app',
    'Email the day after a missed day; gentler on days 3 and 7; stop after two weeks',
    'Streak at risk in the evening',
    'Rewards (streak milestones, a topic mastered, score up) and plan notes (check-up due, exam countdown)'
  ]);

SELECT pg_temp.add_item('Notifications', 'todo', 'Weekly reports by email, to students and parents',
  'Progress is the report page; the email links to it.',
  false, ARRAY[
    'Student report: time studied, runs, score change, topics improved, next week''s focus',
    'Parent report and an alert after about 3 missed days (email first, with consent)',
    'Daily as an option'
  ]);

SELECT pg_temp.add_item('Notifications', 'todo', 'Push notifications and settings',
  NULL, false, ARRAY[
    'Settings: which notifications, which channel, quiet hours, a parent''s contact',
    'Web push with the student''s permission (iPhone: once the app is on the home screen)'
  ]);

COMMIT;
