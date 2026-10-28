-- Premium: plans, Paystack payments, and the periods of Premium they buy.
--
-- Free basics, paid Premium (docs/plans/2026-10-27-accounts-admin-payments-and-fixes.md).
-- An admin sets everything here from the dashboard: whether the free limits apply at all, how
-- much is free, and the plans on sale. Until `limits_on` is turned on, nobody is held back, so
-- this can ship before there is anything to buy.
--
-- A payment buys a plan once (no saved card, no renewal): its days are added after any Premium
-- the student already has. An admin can also give Premium, with no payment behind it.
BEGIN;
SET LOCAL search_path = stackprep, public;

-- One row: the free allowance.
CREATE TABLE billing_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  limits_on             boolean NOT NULL DEFAULT false,
  free_practice_per_day integer NOT NULL DEFAULT 20 CHECK (free_practice_per_day >= 0),
  free_mocks            integer NOT NULL DEFAULT 1 CHECK (free_mocks >= 0),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES students(id) ON DELETE SET NULL
);
INSERT INTO billing_settings DEFAULT VALUES;

CREATE TABLE premium_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  blurb         text CHECK (length(blurb) <= 200),
  -- In kobo, as Paystack takes it: ₦2,500 is 250000.
  price_kobo    integer NOT NULL CHECK (price_kobo >= 10000),
  days          integer NOT NULL CHECK (days BETWEEN 1 AND 730),
  on_sale       boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_id     uuid REFERENCES premium_plans(id) ON DELETE SET NULL,
  -- The plan as it was bought, so a later change of name or price leaves the receipt alone.
  plan_name   text NOT NULL,
  days        integer NOT NULL,
  amount_kobo integer NOT NULL,
  currency    text NOT NULL DEFAULT 'NGN',
  -- Ours, sent to Paystack; Paystack's webhook and the return both name it.
  reference   text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'paid', 'failed', 'abandoned')),
  channel     text,
  paid_at     timestamptz,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_student_idx ON payments(student_id, created_at DESC);
CREATE INDEX payments_paid_idx ON payments(paid_at) WHERE status = 'paid';

CREATE TABLE premium_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
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
