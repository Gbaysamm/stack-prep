-- Today's design plan (founder, 17 Nov 2026). The founder marked Home, Roadmap and Lesson done
-- yesterday on one server; this says the same on both. The check-up report is committed; the
-- nine pages chosen for today are planned for today. The mock exam room takes the new
-- question screen and gets no redesign of its own.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET status = 'done', done_at = coalesce(done_at, '2026-11-16 17:00+01'), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE area = 'Page redesigns' AND title IN ('Home', 'Roadmap', 'Lesson (the board)')
   AND status NOT IN ('done', 'committed', 'deployed');

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'One result card (score, target bar, facts, one button), got wrong and got right '
              || 'lists, the weakest topics as cards, one line on how it is worked out.'
 WHERE area = 'Page redesigns' AND title = 'Check-up report';

UPDATE tracker_items
   SET planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date,
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE area = 'Page redesigns' AND status = 'todo'
   AND title IN ('Run report', 'Mock report', 'Practice run (the question screen)',
                 'Check-up sitting', 'Subject page', 'After the lesson', 'Saved questions',
                 'Mock set-up');

UPDATE tracker_items
   SET note = 'Takes the new question screen; no redesign of its own.',
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE area = 'Page redesigns' AND title = 'Mock exam room';

COMMIT;
