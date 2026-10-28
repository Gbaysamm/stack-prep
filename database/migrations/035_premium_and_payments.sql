-- Plans: what each gives, the lengths they're sold for, discounts, Paystack payments, and the
-- periods of a plan that payments (or an admin) give a student.
--
-- docs/plans/2026-10-28-plans-admin-and-public-site.md, part A. An admin sets all of it:
--   * whether limits apply at all (`billing_settings.limits_on`). Until they are turned on
--     nobody is held back, so this can ship before anything is for sale;
--   * every plan, the Free plan included (`kind = 'free'`, exactly one), with its features:
--     practice questions a day, mocks per day/week/month/in total, lessons explained aloud,
--     questions to the coach a day, custom runs, revising bookmarks, and selling points that
--     are shown but not enforced. A plan's order is also its rank: higher is better;
--   * the lengths a plan is sold for, and each paid plan's price for each length;
--   * discounts: a promo code anyone can enter, or an offer for one student; 100% off grants
--     the plan without a payment.
--
-- A plan's time follows on from any time the student already has on that same plan; while two
-- plans run, the higher one applies.
BEGIN;
SET LOCAL search_path = stackprep, public;

-- One row.
CREATE TABLE billing_settings (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  limits_on  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES students(id) ON DELETE SET NULL
);
INSERT INTO billing_settings DEFAULT VALUES;

CREATE TABLE premium_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL DEFAULT 'paid' CHECK (kind IN ('free', 'paid')),
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  blurb            text CHECK (length(blurb) <= 200),
  -- Null is unlimited.
  practice_per_day integer CHECK (practice_per_day >= 0),
  mocks_allowed    integer CHECK (mocks_allowed >= 0),
  mocks_per        text NOT NULL DEFAULT 'week' CHECK (mocks_per IN ('day', 'week', 'month', 'total')),
  -- The lesson explained aloud on the board. The written working is always there.
  voice            boolean NOT NULL DEFAULT true,
  -- Questions to the coach a day; 0 is none.
  coach_per_day    integer NOT NULL DEFAULT 20 CHECK (coach_per_day >= 0),
  -- Choosing topics and years for a run.
  custom_runs      boolean NOT NULL DEFAULT true,
  -- Revising bookmarked questions as a run.
  bookmark_runs    boolean NOT NULL DEFAULT true,
  -- Shown on the plan's card, one line each, not enforced ("WhatsApp study group").
  extras           text[] NOT NULL DEFAULT '{}',
  featured         boolean NOT NULL DEFAULT false,
  on_sale          boolean NOT NULL DEFAULT true,
  display_order    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX premium_plans_one_free ON premium_plans(kind) WHERE kind = 'free';
INSERT INTO premium_plans (kind, name, blurb, practice_per_day, mocks_allowed, mocks_per, voice,
  coach_per_day, custom_runs, bookmark_runs, display_order)
VALUES ('free', 'Free', 'Start practising today.', 20, 1, 'total', false, 0, true, true, 0);

CREATE TABLE plan_lengths (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 30),
  days          integer NOT NULL CHECK (days BETWEEN 1 AND 730),
  on_sale       boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0
);
INSERT INTO plan_lengths (label, days, display_order) VALUES
  ('1 month', 30, 1), ('3 months', 90, 2), ('Exam season', 180, 3);

CREATE TABLE plan_prices (
  plan_id    uuid NOT NULL REFERENCES premium_plans(id) ON DELETE CASCADE,
  length_id  uuid NOT NULL REFERENCES plan_lengths(id) ON DELETE CASCADE,
  -- In kobo, as Paystack takes it: ₦2,500 is 250000.
  price_kobo integer NOT NULL CHECK (price_kobo >= 10000),
  PRIMARY KEY (plan_id, length_id)
);

CREATE TABLE discounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A promo code, kept in capitals; null for an offer made to one student.
  code        text UNIQUE CHECK (code ~ '^[A-Z0-9-]{3,30}$'),
  -- An offer for this student only; shown on their plans page.
  student_id  uuid REFERENCES students(id) ON DELETE CASCADE,
  -- Only for this plan / this length; null is any.
  plan_id     uuid REFERENCES premium_plans(id) ON DELETE CASCADE,
  length_id   uuid REFERENCES plan_lengths(id) ON DELETE CASCADE,
  percent_off integer NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  -- Times it can be used in all; null is no cap. An offer to one student is used once.
  max_uses    integer CHECK (max_uses >= 1),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  active      boolean NOT NULL DEFAULT true,
  note        text CHECK (length(note) <= 200),
  created_by  uuid REFERENCES students(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (code IS NOT NULL OR student_id IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX discounts_student_idx ON discounts(student_id) WHERE student_id IS NOT NULL;

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_id          uuid NOT NULL REFERENCES premium_plans(id),
  -- What was bought, as it was then, so a later change leaves the receipt alone.
  plan_name        text NOT NULL,
  length_label     text NOT NULL,
  days             integer NOT NULL,
  -- The price before any discount, and what was charged.
  list_price_kobo  integer NOT NULL,
  amount_kobo      integer NOT NULL,
  discount_id      uuid REFERENCES discounts(id) ON DELETE SET NULL,
  discount_label   text,
  currency         text NOT NULL DEFAULT 'NGN',
  -- Ours, sent to Paystack; Paystack's webhook and the return both name it.
  reference        text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed', 'abandoned')),
  -- How it was paid: card, bank_transfer, ussd, ... or 'free' for 100% off.
  channel          text,
  paid_at          timestamptz,
  email            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_student_idx ON payments(student_id, created_at DESC);
CREATE INDEX payments_paid_idx ON payments(paid_at) WHERE status = 'paid';
CREATE INDEX payments_discount_idx ON payments(discount_id) WHERE discount_id IS NOT NULL;

CREATE TABLE premium_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL REFERENCES premium_plans(id),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL CHECK (ends_at > starts_at),
  -- One of the two: what paid for it, or the admin who gave it.
  payment_id  uuid UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES students(id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX premium_periods_student_idx ON premium_periods(student_id, ends_at DESC);

COMMIT;
