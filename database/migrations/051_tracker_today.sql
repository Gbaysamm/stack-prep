-- The tracker's day plan, and its first corrections (founder, 16 Nov 2026).
--
-- A task can be planned for a day. The Today list shows what was planned for today and what
-- was planned earlier and is not finished yet, so unfinished work carries over by itself.
-- Then the stages the tracker started with that were already behind: work that went out with
-- the push of 16 Nov 2026, and two items the founder marked done.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE tracker_items ADD COLUMN planned_for date;
CREATE INDEX tracker_items_planned ON tracker_items (planned_for) WHERE planned_for IS NOT NULL;

COMMENT ON COLUMN tracker_items.planned_for IS
  'The day the task is planned for. Shown under Today from that day on until it is finished.';

WITH fixed AS (
  UPDATE tracker_items
     SET status = 'deployed', done_at = coalesce(done_at, now()), updated_at = now(),
         updated_by = 'Claude'
   WHERE status <> 'deployed'
     AND title IN (
       'Project tracker for the team',
       'Practice page redesign',
       'Check-up page redesign',
       'One run at a time',
       'Measure on a built app (development sends ~90 files a page)'
     )
  RETURNING id
)
INSERT INTO tracker_activity (item_id, by_name, what)
SELECT id, 'Claude', 'Moved to Deployed (went out on 16 Nov 2026)' FROM fixed;

COMMIT;
