-- Student accounts: a password, the sessions it opens, and the attempts made against it.
--
-- ADR-0013 (amended 2026-09-28): students sign up with an email address or a phone number
-- and a password, hashed with Argon2id. The login itself lives on `students` (its unique
-- `email` / `phone` columns and their CHECKs); only the secret lives here, so a student
-- without a password — a school-enrolled one, or a sandbox tester — is simply a student
-- with no row in `student_credentials`.
--
-- Unlike the evidence tables, these cascade on a student's deletion. A password hash and a
-- session are not the student's record; they are the means of reaching it, and keeping
-- them after the student is gone would only be a liability.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE student_credentials (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  -- The full Argon2id encoding ($argon2id$v=19$m=...,t=...,p=...$salt$hash), parameters
  -- included, so they can be raised later and old hashes rehashed on the next sign-in.
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One signed-in browser. The cookie carries a random token; only its SHA-256 is kept, so a
-- leaked copy of this table cannot be replayed as a session.
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_student_idx ON auth_sessions(student_id);

-- Every sign-in attempt, by the login as typed (normalised), for the lockout. Keyed by the
-- login rather than a student so that guessing at an unknown login is counted too.
CREATE TABLE auth_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL
);
CREATE INDEX auth_attempts_login_time_idx ON auth_attempts(login, attempted_at);

COMMIT;
