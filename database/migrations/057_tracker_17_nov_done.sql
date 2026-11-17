-- The tracker after the 17 Nov 2026 redesigns. Finished work is marked Committed; the deployment
-- that runs this moves it to Deployed.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'Result band (ring, answer marks, bar to target), topic tiles, every question with '
              || 'its working, three next cards; fetched once, so it opens fast.'
 WHERE area = 'Page redesigns' AND title = 'Check-up report';

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'The exam in the dark hero with its countdown; your subjects in one list; UTME '
              || 'subjects swapped, never removed; no question counts.'
 WHERE area = 'Page redesigns' AND title = 'Exams and goals';

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'No tabs for other subjects; topics and runs as on Progress; the address is the '
              || 'subject''s name.'
 WHERE area = 'Page redesigns' AND title = 'Subject page';

UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep',
       note = 'Who you are, your record and the account; goals moved to Subjects.'
 WHERE area = 'Page redesigns' AND title = 'Profile';

INSERT INTO tracker_items (area, status, title, note, done_at, updated_by) VALUES
  ('Page redesigns', 'committed', 'Subjects page (new)',
   'Each subject as its goal ticket with the score now; Swap on the ticket; the compulsory '
   || 'subject first.', now(), 'Stack Prep'),
  ('Page redesigns', 'committed', 'One design standard across the app',
   'Every card a sticker; tighter corners; built on the Stackjunior Design System '
   || '(docs/design-standard.md).', now(), 'Stack Prep'),
  ('Page redesigns', 'committed', 'The app no longer stalls when the voice service is down',
   'Inworld fails fast and is left alone for two minutes, so lesson downloads cannot hold '
   || 'every connection.', now(), 'Stack Prep');

COMMIT;
