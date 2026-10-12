-- The mock exam: a JAMB-style computer-based test the student sets up and sits on their own.
--
-- It is not practice. Practice chooses one question at a time and stops to teach; a mock fixes
-- its whole paper before the clock starts, gives no help of any kind until it is submitted, and
-- keeps time on the server. So it has its own records:
--
--   mock_exams         one sitting: the clock (started_at, deadline_at), how it ended, and
--                      whether the student has deleted it from their history.
--   study_sessions     one per subject sat, `session_type = 'full_mock'`, linked to its mock by
--                      `mock_exam_id`. The subject's attempts hang off it, as every attempt does.
--   mock_exam_items    the paper: each question in the order this sitting shows it, and the
--                      student's live answer sheet (choice, flag, time spent) while it runs.
--   mock_exam_events   what the browser saw while the test ran: leaving full screen, switching
--                      tab or window, a blocked copy or paste. Shown in the report, never scored.
--
-- WHY THE ANSWER SHEET IS NOT `attempts`. Attempts cannot be updated or deleted (the history
-- guard), and a student changes their mind during a test. So the sheet is kept here while the
-- test runs, and on submission each answered question becomes exactly one attempt with
-- `context = 'full_mock'`: the final answer, unaided. An unanswered question gets no attempt;
-- it is unanswered, not wrong.
--
-- Migration 008 took the mock types out of study_sessions in favour of published assessments.
-- A student-built mock has no published form to sit, so `full_mock` comes back as a session
-- type for this one purpose; `mini_mock` stays out.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE study_sessions DROP CONSTRAINT study_sessions_session_type_check;
ALTER TABLE study_sessions
  ADD CONSTRAINT study_sessions_session_type_check
  CHECK (session_type IN ('checkup', 'practice', 'review', 'guided', 'mixed', 'timed',
                          'full_mock'));

CREATE TABLE mock_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  examination_id uuid NOT NULL REFERENCES examinations(id),
  -- 'utme' when the student took the Real UTME preset, 'custom' when they set it themselves.
  preset text NOT NULL DEFAULT 'custom' CHECK (preset IN ('utme', 'custom')),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 300),
  started_at timestamptz NOT NULL DEFAULT now(),
  -- The server's deadline. A device clock is not evidence of when time ran out.
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  -- True when the clock ran out rather than the student pressing Submit.
  auto_submitted boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,
  CHECK (deadline_at > started_at),
  CHECK (submitted_at IS NULL OR submitted_at >= started_at)
);
CREATE INDEX mock_exams_student_idx ON mock_exams(student_id, started_at DESC);

COMMENT ON TABLE mock_exams IS
  'One mock exam sitting: up to four subjects under one server-kept clock.';
COMMENT ON COLUMN mock_exams.hidden_at IS
  'When the student deleted this mock from their history. Its attempts still count.';

ALTER TABLE study_sessions
  ADD COLUMN mock_exam_id uuid REFERENCES mock_exams(id),
  ADD CONSTRAINT study_sessions_mock_exam_check
    CHECK ((session_type = 'full_mock') = (mock_exam_id IS NOT NULL));
CREATE INDEX study_sessions_mock_exam_idx ON study_sessions(mock_exam_id)
  WHERE mock_exam_id IS NOT NULL;

COMMENT ON COLUMN study_sessions.mock_exam_id IS
  'The mock exam this subject was sat in; set exactly when session_type = ''full_mock''.';

CREATE TABLE mock_exam_items (
  mock_exam_id uuid NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  -- 1-based, within its subject, in the order this sitting shows it.
  position integer NOT NULL CHECK (position > 0),
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  selected_option_key text CHECK (selected_option_key IS NULL OR selected_option_key ~ '^[A-F]$'),
  answered_at timestamptz,
  flagged boolean NOT NULL DEFAULT false,
  -- Time the question was on screen, as the browser counted it. Advisory only.
  response_ms integer NOT NULL DEFAULT 0 CHECK (response_ms >= 0),
  PRIMARY KEY (session_id, question_version_id),
  UNIQUE (session_id, position),
  CHECK ((selected_option_key IS NULL) = (answered_at IS NULL))
);
CREATE INDEX mock_exam_items_mock_idx ON mock_exam_items(mock_exam_id);

COMMENT ON TABLE mock_exam_items IS
  'A mock''s paper and its live answer sheet. Becomes attempts on submission.';

CREATE TABLE mock_exam_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mock_exam_id uuid NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'fullscreen_enter', 'fullscreen_exit', 'tab_hidden', 'tab_visible',
    'window_blur', 'window_focus', 'copy_blocked', 'paste_blocked', 'menu_blocked')),
  at_client timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mock_exam_events_mock_idx ON mock_exam_events(mock_exam_id, received_at);

COMMENT ON TABLE mock_exam_events IS
  'Integrity events seen by the browser during a mock: full screen left, tab or window '
  'switched, copy or paste blocked. Reported with the result; never changes a mark.';

COMMIT;
