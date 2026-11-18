-- Streak freezes (founder, 18 Nov 2026; docs/gamification-plan.md): one earned at every 7 days
-- of streak, two held at most; a missed day uses one, and that day counts as studied for the
-- streak. Each row is a freeze; `used_on` is the day it covered.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE streak_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  earned_on date NOT NULL,
  used_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, earned_on),
  UNIQUE (student_id, used_on)
);

COMMIT;
