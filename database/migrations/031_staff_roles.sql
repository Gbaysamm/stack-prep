-- Staff roles: who may use the reviewer dashboard and the admin dashboard.
--
-- Everyone signs in with the same account (students + student_credentials + auth_sessions,
-- ADR-0013). An account with no row here is a student. A row makes it staff:
--
--   reviewer  the reviewer dashboard only: not the student app, not the admin dashboard.
--   admin     the admin dashboard, the reviewer dashboard and the student app.
--
-- Nobody becomes staff by signing up: a role is granted by an admin (or, for the first admin,
-- by database/create_admin.py on the server), and `granted_by` records who.
--
-- Review decisions are recorded against academic_reviewers (their ids are on every decision
-- already made), so each staff account is linked to its reviewer row by `student_id`; the
-- dashboard takes the reviewer from the session, never from a name picked from a list.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE account_roles (
  student_id   uuid PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('reviewer', 'admin')),
  granted_by   uuid REFERENCES students (id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_reviewers
  ADD COLUMN student_id uuid UNIQUE REFERENCES students (id) ON DELETE SET NULL;

COMMIT;
