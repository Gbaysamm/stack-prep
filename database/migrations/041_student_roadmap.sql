-- The student's roadmap (docs/plans/2026-11-10-student-roadmap.md; engine/roadmap.py).
--
-- Stack Prep plans each student's work towards their target; the student follows it. A
-- roadmap is built for one day and fixes the next seven; it is replaced (not edited) when a
-- check-up finishes, the goal changes, or its week runs out, so what was planned and what
-- happened to it stay on record. That record, item by item and linked to the sitting that did
-- it, is the evidence a later money-back promise needs ("did the student follow the plan?").

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced')),
  -- The day it was built for, in the student's own calendar.
  built_for date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('first', 'checkup', 'goal', 'new_week')),
  -- What it was built from (targets, time, standings) and what it said (totals, status,
  -- advice, milestones), so any roadmap can be explained and re-checked later.
  inputs jsonb NOT NULL,
  summary jsonb NOT NULL,
  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_at timestamptz,
  CHECK ((status = 'replaced') = (replaced_at IS NOT NULL))
);
CREATE UNIQUE INDEX roadmaps_one_active_idx ON roadmaps (student_id) WHERE status = 'active';

CREATE TABLE roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  day date NOT NULL,
  position smallint NOT NULL CHECK (position >= 0),
  kind text NOT NULL CHECK (kind IN ('run', 'mixed', 'mock', 'checkup')),
  subject_id uuid REFERENCES subjects (id),
  subtopic_id uuid REFERENCES curriculum_items (id),
  length smallint NOT NULL CHECK (length >= 0),
  reason text NOT NULL CHECK (reason IN ('high_value_gap', 'coverage', 'mixed_practice', 'mock',
                                         'checkup', 'first_checkup')),
  value text CHECK (value IN ('high', 'medium', 'low')),
  -- The sitting that did it. Done, in progress, missed or to do is read from this.
  session_id uuid REFERENCES study_sessions (id) ON DELETE SET NULL,
  started_at timestamptz,
  UNIQUE (roadmap_id, day, position),
  CHECK ((kind = 'run') = (subtopic_id IS NOT NULL)),
  CHECK (kind = 'mock' OR subject_id IS NOT NULL)
);
CREATE INDEX roadmap_items_student_day_idx ON roadmap_items (student_id, day);
CREATE INDEX roadmap_items_session_idx ON roadmap_items (session_id) WHERE session_id IS NOT NULL;

COMMIT;
