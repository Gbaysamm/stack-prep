-- Push notifications to phones (founder, 18 Nov 2026): each browser or installed app that
-- turned them on, and which notifications were pushed. A subscription the push service says is
-- gone is deleted when a push to it fails.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) <= 200),
  auth text NOT NULL CHECK (length(auth) <= 100),
  user_agent text CHECK (user_agent IS NULL OR length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
CREATE INDEX push_subscriptions_student ON push_subscriptions (student_id);

ALTER TABLE notifications ADD COLUMN pushed_at timestamptz;

COMMIT;
