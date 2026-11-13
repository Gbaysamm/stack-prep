/**
 * Premium: plans, where the student stands, and paying through Paystack. Mirrors
 * apps/api/src/app/routers/billing.py.
 */
import { failure, reach } from '../lib/friendlyError.js';
import { KEEP, shared } from '../lib/shared.js';

export interface Length {
  id: string;
  label: string;
  days: number;
}

export type MocksPer = 'day' | 'week' | 'month' | 'total';

/** What a plan gives. Null is unlimited. */
export interface Features {
  practice_per_day: number | null;
  mocks_allowed: number | null;
  mocks_per: MocksPer;
  voice: boolean;
  coach_per_day: number;
  custom_runs: boolean;
  bookmark_runs: boolean;
  /** Selling points shown on the card, one a line. */
  extras: string[];
}

export interface Plan {
  id: string;
  kind: 'free' | 'paid';
  name: string;
  blurb: string | null;
  featured: boolean;
  features: Features;
  /** Length id to price in kobo, for each length the plan is sold for. Empty for Free. */
  prices: Record<string, number>;
}

export interface Catalogue {
  lengths: Length[];
  /** Free first, then the paid plans, lowest first. */
  plans: Plan[];
  /** False until an admin turns the limits on: nothing is held back before then. */
  limits_on: boolean;
  checkout_open: boolean;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'abandoned';

export interface Receipt {
  reference: string;
  plan_name: string;
  length_label: string;
  days: number;
  list_price_kobo: number;
  amount_kobo: number;
  discount_label: string | null;
  status: PaymentStatus;
  channel: string | null;
  paid_at: string | null;
  created_at: string;
}

/** What the student may do now. Null is unlimited. */
export interface Allowance {
  practice_per_day: number | null;
  mocks: number | null;
  mocks_per: MocksPer;
  voice: boolean;
  /** Null is the server's own daily allowance. */
  coach_per_day: number | null;
  custom_runs: boolean;
  bookmark_runs: boolean;
}

/** A discount an admin made for this student. */
export interface Offer {
  id: string;
  percent_off: number;
  plan_id: string | null;
  plan_name: string | null;
  length_id: string | null;
  length_label: string | null;
  expires_at: string | null;
  note: string | null;
}

export interface Standing {
  /** Has a paid plan running, or is an admin. */
  premium: boolean;
  plan_id: string | null;
  plan_name: string | null;
  plan_until: string | null;
  limits_on: boolean;
  allowance: Allowance;
  practice_used_today: number;
  /** Counted over the allowance's period. */
  mocks_used: number;
  email: string | null;
  offers: Offer[];
  receipts: Receipt[];
}

export interface Quote {
  plan_name: string;
  length_label: string;
  days: number;
  list_price_kobo: number;
  amount_kobo: number;
  percent_off: number;
  discount_label: string | null;
}

export interface Confirmed {
  status: PaymentStatus;
  plan_name: string;
  standing: Standing;
}

/** Sent when Premium may have changed (a payment confirmed), so badges can catch up. */
export const PREMIUM_CHANGED = 'stackprep:premium-changed';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(`/v1${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

export const billingApi = {
  plans: () => call<Catalogue>('/billing/plans'),
  standing: (studentId: string) =>
    shared(`billing:${studentId}`, KEEP.account, () => call<Standing>(`/student/${studentId}/billing`)),
  quote: (studentId: string, planId: string, lengthId: string, code?: string) =>
    call<Quote>(`/student/${studentId}/billing/quote`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, length_id: lengthId, code: code || undefined }),
    }),
  checkout: (studentId: string, planId: string, lengthId: string, code?: string, email?: string) =>
    call<{ authorization_url: string | null; reference: string; granted: boolean }>(
      `/student/${studentId}/billing/checkout`,
      {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planId,
          length_id: lengthId,
          code: code || undefined,
          email: email || undefined,
        }),
      },
    ),
  confirm: (studentId: string, reference: string) =>
    call<Confirmed>(`/student/${studentId}/billing/confirm`, {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }).then((done) => {
      window.dispatchEvent(new Event(PREMIUM_CHANGED));
      return done;
    }),
};

/** ₦2,500 from 250000 kobo; kobo shown only when there are any. */
export function naira(kobo: number): string {
  const amount = kobo / 100;
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "30 days", "1 month", "3 months", "1 year": the plan's length as a person says it. */
export function planLength(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** A plan's features as lines a student reads, each included or not. */
export function featureLines(features: Features): { text: string; on: boolean }[] {
  const per: Record<MocksPer, string> = { day: 'a day', week: 'a week', month: 'a month', total: 'to try' };
  const mocks =
    features.mocks_allowed === null
      ? 'Unlimited mock exams'
      : features.mocks_allowed === 0
        ? 'Mock exams'
        : `${features.mocks_allowed} ${features.mocks_allowed === 1 ? 'mock exam' : 'mock exams'} ${per[features.mocks_per]}`;
  return [
    {
      text:
        features.practice_per_day === null
          ? 'Unlimited practice questions'
          : `${features.practice_per_day} practice questions a day`,
      on: features.practice_per_day !== 0,
    },
    { text: mocks, on: features.mocks_allowed !== 0 },
    { text: 'Check-ups and the full written working', on: true },
    { text: 'Lessons explained aloud', on: features.voice },
    {
      text: features.coach_per_day > 0 ? `Ask the coach ${features.coach_per_day} times a day` : 'Ask the coach',
      on: features.coach_per_day > 0,
    },
    { text: 'Choose your own topics and years', on: features.custom_runs },
    { text: 'Revise your bookmarks as a run', on: features.bookmark_runs },
    ...features.extras.map((extra) => ({ text: extra, on: true })),
  ];
}
