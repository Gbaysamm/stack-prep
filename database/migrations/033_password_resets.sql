-- Forgotten passwords: a six-digit code sent to the student's email, good for 15 minutes.
--
-- Only a hash of the code is kept (sha256 over the row id and the code, so the same code in
-- two rows never hashes alike). A code allows five wrong tries, then it is spent; a used code
-- is spent too. A new request replaces any code still open for that student. Rows older than
-- a day are deleted as new ones are made.
BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  code_hash   text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  tries       smallint NOT NULL DEFAULT 0 CHECK (tries >= 0),
  spent_at    timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX password_resets_student_idx ON password_resets(student_id, created_at);

COMMIT;
