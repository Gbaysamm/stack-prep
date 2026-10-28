/**
 * Premium: plans, where the student stands, and paying through Paystack. Mirrors
 * apps/api/src/app/routers/billing.py.
 */
import { failure, reach } from '../lib/friendlyError.js';

export interface Plan {
  id: string;
  name: string;
  blurb: string | null;
  price_kobo: number;
  days: number;
}

export interface FreeAllowance {
  /** False until an admin turns the limits on: nothing is held back before then. */
  limits_on: boolean;
  practice_per_day: number;
  mocks: number;
}

export interface Catalogue {
  plans: Plan[];
  free: FreeAllowance;
  checkout_open: boolean;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'abandoned';

export interface Receipt {
  reference: string;
  plan_name: string;
  days: number;
  amount_kobo: number;
  status: PaymentStatus;
  channel: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Standing {
  premium: boolean;
  premium_until: string | null;
  free: FreeAllowance;
  practice_used_today: number;
  mocks_used: number;
  email: string | null;
  receipts: Receipt[];
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
  standing: (studentId: string) => call<Standing>(`/student/${studentId}/billing`),
  checkout: (studentId: string, planId: string, email?: string) =>
    call<{ authorization_url: string; reference: string }>(`/student/${studentId}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, email: email || undefined }),
    }),
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
