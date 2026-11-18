-- Badges (founder, 18 Nov 2026; docs/gamification-plan.md): which a student has unlocked, and
-- whether they have seen the unlock moment yet. What each badge is lives in app/badges.py.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE student_badges (
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  badge text NOT NULL CHECK (length(badge) <= 40),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  -- Set when the student has seen the unlock moment, so it shows once.
  seen_at timestamptz,
  PRIMARY KEY (student_id, badge)
);

COMMIT;
