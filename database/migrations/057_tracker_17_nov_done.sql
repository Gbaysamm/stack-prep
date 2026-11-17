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

-- The rest of the day's pages (founder, 17 Nov 2026).
UPDATE tracker_items
   SET status = 'committed', done_at = coalesce(done_at, now()), planned_for = NULL,
       updated_at = now(), updated_by = 'Stack Prep', note = v.note
  FROM (VALUES
    ('Run report', 'Kept as it is (the founder''s call); the question card head tidied.'),
    ('Mock report', 'Kept as it is, the best page on the platform; Practise starts a run in place.'),
    ('Practice run (the question screen)', 'One topic tag, Bookmark and Report at the right, a flat Check answer.'),
    ('Check-up sitting', 'Shares the question screen; tools at the right end of the line.'),
    ('After the lesson', 'A clear locked Continue, working photo only where there is working, a reward when the lesson is done.'),
    ('Saved questions', 'A page of subjects with figures, a page per subject; each question opens to its answer and working.'),
    ('Mock set-up', 'Only your subjects, no question counts.'),
    ('Onboarding', 'Flat buttons and a reward when the plan is saved.'),
    ('Plans and payment', 'Lined up, the plan most students need stands out, honest Coming soon.'),
    ('Settings', 'In the sidebar; the scores section as two plain rows.'),
    ('Help and messages', 'Messages on their own page and a help button on every page; Help is the guide only.')
  ) AS v(title, note)
 WHERE tracker_items.area = 'Page redesigns' AND tracker_items.title = v.title;

INSERT INTO tracker_items (area, status, title, note, done_at, updated_by) VALUES
  ('Page redesigns', 'committed', 'Phones: pages no longer wider than the screen',
   'A stray hidden label stretched every page with the subject chips to 482 px on a 390 px phone.',
   now(), 'Stack Prep'),
  ('Page redesigns', 'committed', 'Done roadmap items open again',
   'A check-up or run opens its report, a lesson plays again.', now(), 'Stack Prep');

COMMIT;
