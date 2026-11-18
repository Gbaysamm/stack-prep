-- Lessons and questions expansion on today's plan (founder, 18 Nov 2026), after the
-- notifications and gamification.

BEGIN;
SET LOCAL search_path = stackprep, public;

UPDATE tracker_items
   SET planned_for = (now() AT TIME ZONE 'Africa/Lagos')::date, updated_at = now(),
       updated_by = 'Stack Prep', position = v.position
  FROM (VALUES
    ('More subject lessons', -36),
    ('More questions', -35)
  ) AS v(title, position)
 WHERE tracker_items.title = v.title AND tracker_items.status NOT IN ('done', 'committed', 'deployed');

COMMIT;
