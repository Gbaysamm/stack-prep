-- The question writer's AI settings (reviewer "Add with AI"; docs/plans/2026-11-10-reviewer-
-- question-bank.md, part 2), and what each run cost, so a monthly cap can be kept.
--
-- One row of settings. The API key is stored encrypted (app/secret_box.py): the key that opens
-- it lives in the server's environment, never in this database, so a copy of the database
-- does not give the API key away. Only its last four characters are kept in the clear, so an
-- admin can tell which key is set.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE ai_writer_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic', 'openai')),
  model text NOT NULL DEFAULT 'claude-opus-5-5' CHECK (length(model) BETWEEN 1 AND 80),
  api_key_encrypted text,
  api_key_hint text CHECK (api_key_hint IS NULL OR length(api_key_hint) <= 8),
  -- US dollars per million tokens, for the estimate before a run and the spend after it.
  input_usd_per_million numeric(10, 4) NOT NULL DEFAULT 0 CHECK (input_usd_per_million >= 0),
  output_usd_per_million numeric(10, 4) NOT NULL DEFAULT 0 CHECK (output_usd_per_million >= 0),
  -- Null: no cap. Runs that would take the month past it are refused.
  monthly_cap_usd numeric(10, 2) CHECK (monthly_cap_usd IS NULL OR monthly_cap_usd >= 0),
  updated_by uuid REFERENCES students (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((api_key_encrypted IS NULL) = (api_key_hint IS NULL))
);

CREATE TABLE ai_writer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What it was for: 'read' a paper, 'solve', 'check', 'write', 'draw', or 'test'.
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 40),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  exam_paper_id uuid REFERENCES exam_papers (id) ON DELETE SET NULL,
  created_by uuid REFERENCES students (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_writer_runs_month_idx ON ai_writer_runs (created_at);

COMMIT;
