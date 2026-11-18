-- XP (founder, 18 Nov 2026; docs/gamification-plan.md): every point a student earns, one row
-- per reason, so nothing counts twice and every total can be explained. Levels are worked out
-- from the total (app/xp.py), not stored.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  -- answer, combo, lesson, checkup, mock, daily_goal, ...
  reason text NOT NULL CHECK (length(reason) <= 40),
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 1000),
  -- The run, check-up, mock or lesson it came from, when there is one.
  session_id uuid,
  dedupe_key text NOT NULL CHECK (length(dedupe_key) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, dedupe_key)
);
CREATE INDEX xp_events_student ON xp_events (student_id, created_at DESC);
CREATE INDEX xp_events_session ON xp_events (session_id) WHERE session_id IS NOT NULL;

COMMIT;
