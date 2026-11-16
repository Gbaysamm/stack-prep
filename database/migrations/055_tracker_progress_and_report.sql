-- The tracker after the Progress and Practice redesigns (founder, 16 Nov 2026). Finished work is
-- marked Committed; the deployment that runs this moves it to Deployed. The check-up report
-- page is next, in progress today.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'Subject cards (tap to focus), run cards with their own bar, topics that fold under '
              || 'their sections, no score before 3 answers, one subject filter.'
 WHERE area = 'Page redesigns' AND title = 'Progress page';

INSERT INTO tracker_items (area, status, title, note, done_at, updated_by) VALUES
  ('Page redesigns', 'committed', 'Practice page, second pass',
   'How it''s going first, then the subjects, then the weak topics as tappable cards; one sticker shadow.',
   now(), 'Stack Prep'),
  ('Page redesigns', 'committed', 'A held run is said in a popup, never a page change',
   'Start a run and Practise on a topic, on Practice, Progress and the subject page.',
   now(), 'Stack Prep');

UPDATE tracker_items
   SET status = 'doing', planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date,
       updated_at = now(), updated_by = 'Stack Prep'
 WHERE area = 'Page redesigns' AND title = 'Check-up report';

COMMIT;
