-- The tracker's finished dates, put right (founder, 16 Nov 2026).
--
-- Migrations 050 and 051 loaded work already finished long before, and stamped it finished at
-- the moment they ran, so the tracker said it was all done today. A task's finished date is
-- now the first time a person moved it to Done, Committed or Deployed in the tracker; work that
-- was finished before the tracker existed has no date and shows as finished earlier.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items i
   SET done_at = (
     SELECT min(a.at) FROM tracker_activity a
     WHERE a.item_id = i.id
       AND a.by_name IS NOT NULL AND a.by_name <> 'Deployment'
       AND a.what IN ('Moved to Done', 'Moved to Committed', 'Moved to Deployed')
   )
 WHERE i.done_at IS NOT NULL;

COMMIT;
