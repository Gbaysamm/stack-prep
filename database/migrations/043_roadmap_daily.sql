-- The roadmap is re-built each morning (and after a check-up or a goal change), not weekly:
-- a weak run shows in the next day's path instead of a week later. Today's stops are never
-- changed under the student; only a check-up or a goal change re-plans the same day.
-- `new_week` stays allowed for the plans already kept on record.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE roadmaps DROP CONSTRAINT roadmaps_reason_check;
ALTER TABLE roadmaps ADD CONSTRAINT roadmaps_reason_check
  CHECK (reason IN ('first', 'checkup', 'goal', 'new_day', 'new_week'));

COMMIT;
