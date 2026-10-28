-- The admin dashboard's own tools (docs/plans/2026-10-28-plans-admin-and-public-site.md, B):
-- an audit log of what staff did, app settings an admin can change without a release, support
-- messages from students, and announcements shown in the app.
BEGIN;
SET LOCAL search_path = stackprep, public;

-- Every change an admin (or reviewer) makes from a dashboard: who, what, to what, when. Kept
-- when the actor's account goes, under the name they had.
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES students(id) ON DELETE SET NULL,
  actor_name  text NOT NULL,
  -- A short machine name ('plan.change', 'student.suspend', ...) and a sentence for people.
  action      text NOT NULL,
  summary     text NOT NULL,
  -- What it was done to, when it was one thing: a student, a plan, a report.
  target_kind text,
  target_id   text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_recent_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_id, created_at DESC);
CREATE INDEX audit_log_target_idx ON audit_log(target_kind, target_id);

-- One row per setting; the API knows each key, its type and its default.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES students(id) ON DELETE SET NULL
);

-- A conversation a student starts from the app's Help page (or the public contact form, with
-- no account), and staff answer from the dashboard.
CREATE TABLE support_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid REFERENCES students(id) ON DELETE CASCADE,
  -- For someone writing without an account (the public contact form).
  name        text CHECK (length(name) <= 80),
  email       text CHECK (length(email) <= 254),
  topic       text NOT NULL CHECK (topic IN ('account', 'payment', 'question', 'app', 'other')),
  subject     text NOT NULL CHECK (length(subject) BETWEEN 1 AND 120),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  -- When the student last read it, so the app can show an unread reply.
  student_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (student_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX support_threads_status_idx ON support_threads(status, updated_at DESC);
CREATE INDEX support_threads_student_idx ON support_threads(student_id, updated_at DESC);

CREATE TABLE support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  -- Null author with from_staff false: the person who started the thread.
  author_id   uuid REFERENCES students(id) ON DELETE SET NULL,
  from_staff  boolean NOT NULL DEFAULT false,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_thread_idx ON support_messages(thread_id, created_at);

-- A message shown in the student app: a banner along the top, or a pop-up once after sign-in.
CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('banner', 'popup')),
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body        text CHECK (length(body) <= 600),
  link_label  text CHECK (length(link_label) <= 30),
  link_url    text CHECK (length(link_url) <= 300),
  -- Who sees it: everyone, students without a plan, students on any plan, or one class.
  audience    text NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all', 'free', 'paid', 'ss1', 'ss2', 'ss3', 'graduated')),
  tone        text NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'good', 'warning')),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES students(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, student_id)
);

COMMIT;
