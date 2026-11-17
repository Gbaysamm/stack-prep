-- The tracker's own order (founder, 17 Nov 2026): the admin drags tasks into the order they
-- matter, by priority or by what is being worked on. A new task goes to the top; the order
-- today (moving first, then waiting, then to do) is where everyone starts.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE tracker_items
  ADD COLUMN position double precision NOT NULL DEFAULT -extract(epoch FROM clock_timestamp());

UPDATE tracker_items i SET position = o.n
  FROM (SELECT id, row_number() OVER (
          ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'waiting' THEN 1 WHEN 'todo' THEN 2
                               WHEN 'done' THEN 3 WHEN 'committed' THEN 4 ELSE 5 END,
                   planned_for NULLS LAST, updated_at DESC) AS n
        FROM tracker_items) o
 WHERE o.id = i.id;

COMMENT ON COLUMN tracker_items.position IS
  'The order on the tracker, smallest first; a new task takes a smaller one, so it goes on top.';

INSERT INTO tracker_items (area, status, title, note, done_at, updated_by, position) VALUES
  ('Tracker', 'committed', 'Tasks in your own order; the box opens a menu',
   'Drag tasks (or Move to the top, up, down) by priority or what is being worked on. The box '
   || 'no longer marks a task done at once: it offers Done, a stage, Today, Move, Open, Delete.',
   now(), 'Stack Prep', 0);

COMMIT;
