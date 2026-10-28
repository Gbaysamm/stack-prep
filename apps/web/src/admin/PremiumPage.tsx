/**
 * Pricing & plans: the limits switch, every plan and what it gives (Free included), the lengths
 * plans are sold for and each plan's price for each, discounts (promo codes and offers to one
 * student), and payments.
 *
 * Nothing is held back from students until the limits are switched on, so plans and prices can
 * be set up first. Prices are entered in naira and stored in kobo, as Paystack takes them.
 * Nothing is deleted, only taken off sale or switched off, so receipts keep what was bought.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { featureLines, naira, type MocksPer, type Plan } from '../prep/billingApi.js';
import { StaffPageHead } from '../staff/StaffShell.js';

export interface Length {
  id: string;
  label: string;
  days: number;
  on_sale: boolean;
  display_order: number;
}

export interface AdminPlan extends Plan {
  on_sale: boolean;
  display_order: number;
  sold: number;
  active: number;
}

export interface Billing {
  limits_on: boolean;
  lengths: Length[];
  plans: AdminPlan[];
  premium_now: number;
  paid_kobo_30_days: number;
  paid_kobo_all_time: number;
}

export interface Discount {
  id: string;
  code: string | null;
  student_id: string | null;
  student_name: string | null;
  plan_id: string | null;
  plan_name: string | null;
  length_id: string | null;
  length_label: string | null;
  percent_off: number;
  max_uses: number | null;
  used: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
}

interface Payment {
  reference: string;
  student_id: string;
  display_name: string;
  login: string | null;
  plan_name: string;
  length_label: string;
  days: number;
  list_price_kobo: number;
  amount_kobo: number;
  discount_label: string | null;
  status: 'pending' | 'paid' | 'failed' | 'abandoned';
  channel: string | null;
  paid_at: string | null;
  created_at: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS: Record<Payment['status'], [string, string]> = {
  paid: ['Paid', 'good'],
  pending: ['Not finished', 'warn'],
  failed: ['Failed', 'bad'],
  abandoned: ['Cancelled', 'bad'],
};

type Tab = 'plans' | 'lengths' | 'discounts' | 'payments';
const TABS: { value: Tab; label: string }[] = [
  { value: 'plans', label: 'Plans' },
  { value: 'lengths', label: 'Lengths' },
  { value: 'discounts', label: 'Discounts' },
  { value: 'payments', label: 'Payments' },
];

export function PremiumPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('plans');

  const load = useCallback(() => {
    request<Billing>('/v1/admin/billing')
      .then((next) => {
        setBilling(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <StaffPageHead
        title="Pricing & plans"
        sub="What each plan gives, how long it's sold for and at what price, discounts, and the money taken."
        actions={
          <div className="st-seg" role="tablist" aria-label="Section">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                className={tab === item.value ? 'on' : undefined}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!billing && !problem && <p className="st-muted">Loading…</p>}
      {billing && (
        <>
          <div className="st-stats four">
            <div className="st-panel st-stat">
              <span>Students on a plan now</span>
              <strong>{billing.premium_now.toLocaleString('en-NG')}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Taken, last 30 days</span>
              <strong>{naira(billing.paid_kobo_30_days)}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Taken, all time</span>
              <strong>{naira(billing.paid_kobo_all_time)}</strong>
            </div>
            <LimitsSwitch on={billing.limits_on} onSaved={load} />
          </div>
          {tab === 'plans' && <PlansPanel plans={billing.plans} lengths={billing.lengths} onSaved={load} />}
          {tab === 'lengths' && <LengthsPanel lengths={billing.lengths} onSaved={load} />}
          {tab === 'discounts' && <DiscountsPanel plans={billing.plans} lengths={billing.lengths} />}
          {tab === 'payments' && <PaymentsPanel />}
        </>
      )}
    </>
  );
}

function LimitsSwitch({ on, onSaved }: { on: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flip = async () => {
    if (!on && !window.confirm('Switch the plan limits on? Every student without a plan gets the Free plan’s allowance from now.')) return;
    setBusy(true);
    try {
      await request('/v1/admin/billing/limits', { method: 'PUT', body: JSON.stringify({ limits_on: !on }) });
      onSaved();
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`st-panel st-stat st-switchtile ${on ? 'on' : ''}`}>
      <span>Plan limits</span>
      <strong>{on ? 'On' : 'Off'}</strong>
      <small className="st-muted">{on ? 'Each student gets their plan’s allowance.' : 'Every student has everything.'}</small>
      <button type="button" className={`sj-btn sm ${on ? 'ghost' : ''}`} disabled={busy} onClick={() => void flip()}>
        {on ? 'Switch off' : 'Switch on'}
      </button>
      {error && <small className="st-error">{error}</small>}
    </div>
  );
}

/* ------------------------------------------------------------------ plans */

interface PlanDraft {
  id: string | null;
  kind: 'free' | 'paid';
  name: string;
  blurb: string;
  practice: string;
  mocks: string;
  mocks_per: MocksPer;
  voice: boolean;
  coach: string;
  custom_runs: boolean;
  bookmark_runs: boolean;
  extras: string;
  featured: boolean;
  on_sale: boolean;
  order: string;
  prices: Record<string, string>;
}

const blank = (lengths: Length[]): PlanDraft => ({
  id: null,
  kind: 'paid',
  name: '',
  blurb: '',
  practice: '',
  mocks: '',
  mocks_per: 'week',
  voice: true,
  coach: '20',
  custom_runs: true,
  bookmark_runs: true,
  extras: '',
  featured: false,
  on_sale: true,
  order: '10',
  prices: Object.fromEntries(lengths.map((length) => [length.id, ''])),
});

const draftOf = (plan: AdminPlan, lengths: Length[]): PlanDraft => ({
  id: plan.id,
  kind: plan.kind,
  name: plan.name,
  blurb: plan.blurb ?? '',
  practice: plan.features.practice_per_day === null ? '' : String(plan.features.practice_per_day),
  mocks: plan.features.mocks_allowed === null ? '' : String(plan.features.mocks_allowed),
  mocks_per: plan.features.mocks_per,
  voice: plan.features.voice,
  coach: String(plan.features.coach_per_day),
  custom_runs: plan.features.custom_runs,
  bookmark_runs: plan.features.bookmark_runs,
  extras: plan.features.extras.join('\n'),
  featured: plan.featured,
  on_sale: plan.on_sale,
  order: String(plan.display_order),
  prices: Object.fromEntries(
    lengths.map((length) => [length.id, plan.prices[length.id] !== undefined ? String(plan.prices[length.id]! / 100) : '']),
  ),
});

/** "" is unlimited (null); a whole number; undefined when it isn't one. */
const amount = (value: string): number | null | undefined => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

function PlansPanel({ plans, lengths, onSaved }: { plans: AdminPlan[]; lengths: Length[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const practice = amount(draft.practice);
    const mocks = amount(draft.mocks);
    const coach = Number(draft.coach);
    if (!draft.name.trim()) return setError('Give the plan a name.');
    if (practice === undefined || mocks === undefined) return setError('Allowances are whole numbers; leave empty for unlimited.');
    if (!Number.isInteger(coach) || coach < 0) return setError('Coach questions are a whole number, 0 for none.');
    const prices = [];
    for (const length of lengths) {
      const raw = (draft.prices[length.id] ?? '').replace(/[,₦\s]/g, '');
      if (!raw) {
        prices.push({ length_id: length.id, price_kobo: null });
        continue;
      }
      const kobo = Math.round(Number(raw) * 100);
      if (!Number.isFinite(kobo) || kobo < 10000) return setError(`The ${length.label} price must be at least ₦100, or empty.`);
      prices.push({ length_id: length.id, price_kobo: kobo });
    }
    setBusy(true);
    setError(null);
    try {
      await request(draft.id ? `/v1/admin/billing/plans/${draft.id}` : '/v1/admin/billing/plans', {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          blurb: draft.blurb.trim() || null,
          practice_per_day: practice,
          mocks_allowed: mocks,
          mocks_per: draft.mocks_per,
          voice: draft.voice,
          coach_per_day: coach,
          custom_runs: draft.custom_runs,
          bookmark_runs: draft.bookmark_runs,
          extras: draft.extras.split('\n'),
          featured: draft.featured,
          on_sale: draft.on_sale,
          display_order: Number(draft.order) || 0,
          prices,
        }),
      });
      setDraft(null);
      onSaved();
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <section className="st-panel">
      <div className="st-panel-head">
        <h2>Plans</h2>
        {!draft && (
          <button type="button" className="sj-btn sm" onClick={() => setDraft(blank(lengths))}>
            Add a plan
          </button>
        )}
      </div>
      <p className="st-muted" style={{ marginTop: 0 }}>
        A plan's order is also its rank: a student with two plans running gets the higher one. Free is what every student
        has without a plan.
      </p>

      {draft && (
        <form className="st-plan-editor" onSubmit={save}>
          <h3>{draft.id ? `Change ${draft.name || 'the plan'}` : 'A new plan'}</h3>
          <div className="st-form st-plan-form">
            <label className="st-field">
              <span>Name</span>
              <input value={draft.name} maxLength={40} placeholder="Standard" onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="st-field st-span2">
              <span>One line about it</span>
              <input value={draft.blurb} maxLength={200} placeholder="For steady practice every day." onChange={(e) => set('blurb', e.target.value)} />
            </label>
            {draft.kind === 'paid' && (
              <label className="st-field">
                <span>Order (rank)</span>
                <input inputMode="numeric" value={draft.order} onChange={(e) => set('order', e.target.value)} />
              </label>
            )}
          </div>

          <h4>What it gives</h4>
          <div className="st-form st-plan-form">
            <label className="st-field">
              <span>Practice questions a day</span>
              <input inputMode="numeric" value={draft.practice} placeholder="Unlimited" onChange={(e) => set('practice', e.target.value)} />
            </label>
            <label className="st-field">
              <span>Mock exams</span>
              <input inputMode="numeric" value={draft.mocks} placeholder="Unlimited" onChange={(e) => set('mocks', e.target.value)} />
            </label>
            <div className="st-field">
              <span>Mocks counted</span>
              <Select<MocksPer>
                aria-label="Mocks counted"
                value={draft.mocks_per}
                onChange={(value) => set('mocks_per', value)}
                options={[
                  { value: 'day', label: 'A day' },
                  { value: 'week', label: 'A week' },
                  { value: 'month', label: 'A month' },
                  { value: 'total', label: 'In total' },
                ]}
              />
            </div>
            <label className="st-field">
              <span>Coach questions a day</span>
              <input inputMode="numeric" value={draft.coach} onChange={(e) => set('coach', e.target.value)} />
            </label>
          </div>
          <div className="st-toggles">
            <label className="st-check">
              <input type="checkbox" checked={draft.voice} onChange={(e) => set('voice', e.target.checked)} />
              Lessons explained aloud
            </label>
            <label className="st-check">
              <input type="checkbox" checked={draft.custom_runs} onChange={(e) => set('custom_runs', e.target.checked)} />
              Choose own topics and years
            </label>
            <label className="st-check">
              <input type="checkbox" checked={draft.bookmark_runs} onChange={(e) => set('bookmark_runs', e.target.checked)} />
              Revise bookmarks as a run
            </label>
            {draft.kind === 'paid' && (
              <>
                <label className="st-check">
                  <input type="checkbox" checked={draft.featured} onChange={(e) => set('featured', e.target.checked)} />
                  Most popular
                </label>
                <label className="st-check">
                  <input type="checkbox" checked={draft.on_sale} onChange={(e) => set('on_sale', e.target.checked)} />
                  On sale
                </label>
              </>
            )}
          </div>
          <label className="st-field">
            <span>Selling points, one a line (shown on the card, not enforced)</span>
            <textarea rows={3} value={draft.extras} placeholder={'WhatsApp study group\nPriority support'} onChange={(e) => set('extras', e.target.value)} />
          </label>

          {draft.kind === 'paid' && (
            <>
              <h4>Price for each length (₦; leave empty if not sold for it)</h4>
              <div className="st-form st-plan-form">
                {lengths.map((length) => (
                  <label key={length.id} className="st-field">
                    <span>
                      {length.label} ({length.days} days){length.on_sale ? '' : ', off sale'}
                    </span>
                    <input
                      inputMode="decimal"
                      value={draft.prices[length.id] ?? ''}
                      placeholder="Not sold"
                      onChange={(e) => set('prices', { ...draft.prices, [length.id]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {error && <p className="st-error">{error}</p>}
          <div className="st-row">
            <button type="button" className="sj-btn ghost sm" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="sj-btn sm" disabled={busy}>
              {busy ? 'Saving…' : draft.id ? 'Save the plan' : 'Add the plan'}
            </button>
          </div>
        </form>
      )}

      <div className="st-plan-cards">
        {plans.map((plan) => (
          <article key={plan.id} className={`st-plan-card ${plan.on_sale || plan.kind === 'free' ? '' : 'off'}`}>
            <header>
              <div>
                <strong>{plan.name}</strong>
                <span className="st-tags">
                  {plan.kind === 'free' && <span className="st-pill reviewer">Free</span>}
                  {plan.featured && <span className="st-pill admin">Most popular</span>}
                  {plan.kind === 'paid' && !plan.on_sale && <span className="st-pill bad">Off sale</span>}
                </span>
              </div>
              <button type="button" className="sj-btn ghost sm" onClick={() => setDraft(draftOf(plan, lengths))}>
                Change
              </button>
            </header>
            {plan.kind === 'paid' && (
              <p className="st-plan-prices">
                {lengths
                  .filter((length) => plan.prices[length.id] !== undefined)
                  .map((length) => `${length.label}: ${naira(plan.prices[length.id]!)}`)
                  .join(' · ') || 'No prices yet: not on sale for any length.'}
              </p>
            )}
            <ul className="st-plan-features">
              {featureLines(plan.features).map((line) => (
                <li key={line.text} className={line.on ? undefined : 'off'}>
                  {line.on ? '✓' : '✕'} {line.text}
                </li>
              ))}
            </ul>
            {plan.kind === 'paid' && (
              <p className="st-muted st-plan-counts">
                {plan.active} on it now · {plan.sold} sold · rank {plan.display_order}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ lengths */

interface LengthDraft {
  id: string | null;
  label: string;
  days: string;
  on_sale: boolean;
  order: string;
}

function LengthsPanel({ lengths, onSaved }: { lengths: Length[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<LengthDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const days = Number(draft.days);
    if (!draft.label.trim()) return setError('Give the length a name, e.g. "3 months".');
    if (!Number.isInteger(days) || days < 1 || days > 730) return setError('Days must be a whole number from 1 to 730.');
    setBusy(true);
    setError(null);
    try {
      await request(draft.id ? `/v1/admin/billing/lengths/${draft.id}` : '/v1/admin/billing/lengths', {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify({ label: draft.label.trim(), days, on_sale: draft.on_sale, display_order: Number(draft.order) || 0 }),
      });
      setDraft(null);
      onSaved();
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-panel">
      <div className="st-panel-head">
        <h2>Lengths</h2>
        {!draft && (
          <button
            type="button"
            className="sj-btn sm"
            onClick={() => setDraft({ id: null, label: '', days: '30', on_sale: true, order: String(lengths.length + 1) })}
          >
            Add a length
          </button>
        )}
      </div>
      <p className="st-muted" style={{ marginTop: 0 }}>
        How long a plan can be bought for. Each plan sets its own price for each length, in Plans.
      </p>
      {draft && (
        <form className="st-form st-plan-form" onSubmit={save}>
          <label className="st-field">
            <span>Name</span>
            <input value={draft.label} maxLength={30} placeholder="Exam season" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
          <label className="st-field">
            <span>Days</span>
            <input inputMode="numeric" value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} />
          </label>
          <label className="st-field">
            <span>Order</span>
            <input inputMode="numeric" value={draft.order} onChange={(e) => setDraft({ ...draft, order: e.target.value })} />
          </label>
          <label className="st-check">
            <input type="checkbox" checked={draft.on_sale} onChange={(e) => setDraft({ ...draft, on_sale: e.target.checked })} />
            On sale
          </label>
          {error && <p className="st-error st-span">{error}</p>}
          <div className="st-row st-span">
            <button type="button" className="sj-btn ghost sm" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="sj-btn sm" disabled={busy}>
              {busy ? 'Saving…' : draft.id ? 'Save the length' : 'Add the length'}
            </button>
          </div>
        </form>
      )}
      <div className="st-table-wrap">
        <table className="st-table st-compact">
          <thead>
            <tr>
              <th>Length</th>
              <th style={{ textAlign: 'right' }}>Days</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {lengths.map((length) => (
              <tr key={length.id}>
                <td>
                  <strong>{length.label}</strong>
                </td>
                <td style={{ textAlign: 'right' }}>{length.days}</td>
                <td>
                  <span className={`st-pill ${length.on_sale ? 'good' : 'bad'}`}>{length.on_sale ? 'On sale' : 'Off sale'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="sj-btn ghost sm"
                    onClick={() =>
                      setDraft({
                        id: length.id,
                        label: length.label,
                        days: String(length.days),
                        on_sale: length.on_sale,
                        order: String(length.display_order),
                      })
                    }
                  >
                    Change
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ discounts */

export function discountWords(discount: Pick<Discount, 'percent_off' | 'plan_name' | 'length_label'>): string {
  const what = discount.percent_off === 100 ? 'Free' : `${discount.percent_off}% off`;
  const on = [discount.plan_name ?? 'any plan', discount.length_label?.toLowerCase()].filter(Boolean).join(', ');
  return `${what}: ${on}`;
}

function DiscountsPanel({ plans, lengths }: { plans: AdminPlan[]; lengths: Length[] }) {
  const [rows, setRows] = useState<Discount[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    request<Discount[]>('/v1/admin/billing/discounts')
      .then(setRows)
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);

  const toggle = async (discount: Discount) => {
    try {
      await request(`/v1/admin/billing/discounts/${discount.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !discount.active }),
      });
      load();
    } catch (error) {
      setProblem(friendly(error));
    }
  };

  return (
    <section className="st-panel">
      <div className="st-panel-head">
        <h2>Discounts</h2>
        {!adding && (
          <button type="button" className="sj-btn sm" onClick={() => setAdding(true)}>
            Add a promo code
          </button>
        )}
      </div>
      <p className="st-muted" style={{ marginTop: 0 }}>
        A promo code is typed at checkout. An offer for one student is made from their page in Students, and applies by
        itself. 100% off gives the plan with no payment.
      </p>
      {adding && (
        <DiscountForm
          plans={plans}
          lengths={lengths}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {problem && <p className="st-error">{problem}</p>}
      {!rows && !problem && <p className="st-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="st-empty">No discounts yet.</p>}
      {rows && rows.length > 0 && (
        <div className="st-table-wrap">
          <table className="st-table st-stack">
            <thead>
              <tr>
                <th>Code or student</th>
                <th>Discount</th>
                <th>Used</th>
                <th>Ends</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((discount) => (
                <tr key={discount.id}>
                  <td data-label="Code or student">
                    <span className="st-cell">
                      <strong>{discount.code ?? discount.student_name ?? 'A student'}</strong>
                      <span className="st-muted">{discount.code ? 'Promo code' : 'Offer to one student'}</span>
                    </span>
                  </td>
                  <td data-label="Discount">
                    <span className="st-cell">
                      {discountWords(discount)}
                      {discount.note && <span className="st-muted">{discount.note}</span>}
                    </span>
                  </td>
                  <td data-label="Used">
                    {discount.used}
                    {discount.max_uses !== null ? ` of ${discount.max_uses}` : ''}
                  </td>
                  <td data-label="Ends" className="st-muted">
                    {discount.expires_at ? day(discount.expires_at) : 'No end'}
                  </td>
                  <td data-label="Status">
                    <span className={`st-pill ${discount.active ? 'good' : 'bad'}`}>{discount.active ? 'Active' : 'Off'}</span>
                  </td>
                  <td data-label="" style={{ textAlign: 'right' }}>
                    <button type="button" className="sj-btn ghost sm" onClick={() => void toggle(discount)}>
                      {discount.active ? 'Switch off' : 'Switch on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A promo code, or (with `studentId`) an offer to one student. */
export function DiscountForm({
  plans,
  lengths,
  studentId,
  onDone,
}: {
  plans: Pick<AdminPlan, 'id' | 'name' | 'kind'>[];
  lengths: Pick<Length, 'id' | 'label'>[];
  studentId?: string;
  onDone: (made?: Discount) => void;
}) {
  const [code, setCode] = useState('');
  const [planId, setPlanId] = useState('');
  const [lengthId, setLengthId] = useState('');
  const [percent, setPercent] = useState(studentId ? '100' : '20');
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const off = Number(percent);
    if (!Number.isInteger(off) || off < 1 || off > 100) return setError('The discount is a whole percentage from 1 to 100.');
    if (!studentId && !code.trim()) return setError('Give the code, e.g. BACKTOSCHOOL.');
    setBusy(true);
    setError(null);
    try {
      const made = await request<Discount>('/v1/admin/billing/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: studentId ? null : code,
          student_id: studentId ?? null,
          plan_id: planId || null,
          length_id: lengthId || null,
          percent_off: off,
          max_uses: maxUses ? Number(maxUses) : null,
          expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          note: note.trim() || null,
        }),
      });
      onDone(made);
    } catch (failure) {
      setError(friendly(failure));
      setBusy(false);
    }
  };

  return (
    <form className="st-form st-plan-form" onSubmit={save}>
      {!studentId && (
        <label className="st-field">
          <span>Code</span>
          <input value={code} maxLength={30} placeholder="BACKTOSCHOOL" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
      )}
      <div className="st-field">
        <span>Plan</span>
        <Select
          aria-label="Plan"
          value={planId}
          onChange={setPlanId}
          options={[
            { value: '', label: 'Any plan' },
            ...plans.filter((plan) => plan.kind === 'paid').map((plan) => ({ value: plan.id, label: plan.name })),
          ]}
        />
      </div>
      <div className="st-field">
        <span>Length</span>
        <Select
          aria-label="Length"
          value={lengthId}
          onChange={setLengthId}
          options={[{ value: '', label: 'Any length' }, ...lengths.map((length) => ({ value: length.id, label: length.label }))]}
        />
      </div>
      <label className="st-field">
        <span>Percent off (100 is free)</span>
        <input inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} />
      </label>
      {!studentId && (
        <label className="st-field">
          <span>Times it can be used</span>
          <input inputMode="numeric" value={maxUses} placeholder="No limit" onChange={(e) => setMaxUses(e.target.value)} />
        </label>
      )}
      <label className="st-field">
        <span>Ends on</span>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </label>
      <label className="st-field st-span">
        <span>Note {studentId ? '(the student sees it)' : '(for staff)'}</span>
        <input
          value={note}
          maxLength={200}
          placeholder={studentId ? 'A scholarship from your school' : 'Back-to-school campaign'}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && <p className="st-error st-span">{error}</p>}
      <div className="st-row st-span">
        <button type="button" className="sj-btn ghost sm" onClick={() => onDone()} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="sj-btn sm" disabled={busy}>
          {busy ? 'Saving…' : studentId ? 'Make the offer' : 'Add the code'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ payments */

function PaymentsPanel() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setPayments(null);
    request<Payment[]>(`/v1/admin/billing/payments?status=${showAll ? 'all' : 'paid'}`)
      .then(setPayments)
      .catch((error) => setProblem(friendly(error)));
  }, [showAll]);

  return (
    <section className="st-panel">
      <div className="st-panel-head">
        <h2>Payments</h2>
        <div className="st-seg" role="tablist" aria-label="Which payments">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              role="tab"
              aria-selected={showAll === all}
              className={showAll === all ? 'on' : undefined}
              onClick={() => setShowAll(all)}
            >
              {all ? 'All tries' : 'Paid'}
            </button>
          ))}
        </div>
      </div>
      {problem && <p className="st-error">{problem}</p>}
      {!payments && !problem && <p className="st-muted">Loading…</p>}
      {payments && payments.length === 0 && <p className="st-empty">No payments yet.</p>}
      {payments && payments.length > 0 && (
        <div className="st-table-wrap">
          <table className="st-table st-stack">
            <thead>
              <tr>
                <th>Student</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.reference}>
                  <td data-label="Student">
                    <span className="st-cell">
                      <strong>{payment.display_name}</strong>
                      <span className="st-muted">{payment.login ?? '—'}</span>
                    </span>
                  </td>
                  <td data-label="Plan">
                    <span className="st-cell">
                      {payment.plan_name}
                      <span className="st-muted">{payment.length_label}</span>
                    </span>
                  </td>
                  <td data-label="Amount">
                    <span className="st-cell">
                      {payment.amount_kobo === 0 ? 'Free' : naira(payment.amount_kobo)}
                      <span className="st-muted">
                        {[payment.discount_label, payment.channel && payment.channel !== 'free' ? payment.channel.replace('_', ' ') : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`st-pill ${STATUS[payment.status][1]}`}>{STATUS[payment.status][0]}</span>
                  </td>
                  <td data-label="When" className="st-muted">
                    {when(payment.paid_at ?? payment.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
