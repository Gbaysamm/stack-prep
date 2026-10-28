/**
 * Premium: the free allowance, the plans on sale, what has been taken, and recent payments.
 *
 * Nothing is held back from students until "Free limits" is turned on, so plans and prices can
 * be set up first. Prices are entered in naira and stored in kobo, as Paystack takes them. A
 * plan is never deleted, only taken off sale, so old receipts keep what was bought.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendly, request } from '../lib/friendlyError.js';
import { naira, planLength } from '../prep/billingApi.js';
import { StaffPageHead } from '../staff/StaffShell.js';

interface Limits {
  limits_on: boolean;
  free_practice_per_day: number;
  free_mocks: number;
}

interface AdminPlan {
  id: string;
  name: string;
  blurb: string | null;
  price_kobo: number;
  days: number;
  on_sale: boolean;
  display_order: number;
  created_at: string;
  sold: number;
}

interface Billing {
  limits: Limits;
  plans: AdminPlan[];
  premium_now: number;
  paid_kobo_30_days: number;
  paid_kobo_all_time: number;
}

interface Payment {
  reference: string;
  student_id: string;
  display_name: string;
  login: string | null;
  plan_name: string;
  days: number;
  amount_kobo: number;
  status: 'pending' | 'paid' | 'failed' | 'abandoned';
  channel: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PlanDraft {
  id: string | null;
  name: string;
  blurb: string;
  naira: string;
  days: string;
  on_sale: boolean;
  display_order: string;
}

const EMPTY: PlanDraft = { id: null, name: '', blurb: '', naira: '', days: '30', on_sale: true, display_order: '0' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<Payment['status'], [string, string]> = {
  paid: ['Paid', 'good'],
  pending: ['Not finished', 'warn'],
  failed: ['Failed', 'bad'],
  abandoned: ['Cancelled', 'bad'],
};

export function PremiumPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    request<Billing>('/v1/admin/billing')
      .then((next) => {
        setBilling(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    setPayments(null);
    request<Payment[]>(`/v1/admin/billing/payments?status=${showAll ? 'all' : 'paid'}`)
      .then(setPayments)
      .catch((error) => setProblem(friendly(error)));
  }, [showAll]);

  return (
    <>
      <StaffPageHead
        title="Premium"
        sub="What is free, the plans on sale, and the money taken through Paystack."
      />
      {problem && <p className="st-error">{problem}</p>}
      {!billing && !problem && <p className="st-muted">Loading…</p>}
      {billing && (
        <>
          <div className="st-stats">
            <div className="st-panel st-stat">
              <span>Premium students now</span>
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
          </div>
          <LimitsPanel limits={billing.limits} onSaved={load} />
          <PlansPanel plans={billing.plans} onSaved={load} />
        </>
      )}
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
        {!payments && <p className="st-muted">Loading…</p>}
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
                        <span className="st-muted">{planLength(payment.days)}</span>
                      </span>
                    </td>
                    <td data-label="Amount">
                      <span className="st-cell">
                        {naira(payment.amount_kobo)}
                        {payment.channel && <span className="st-muted">{payment.channel.replace('_', ' ')}</span>}
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
    </>
  );
}

function LimitsPanel({ limits, onSaved }: { limits: Limits; onSaved: () => void }) {
  const [draft, setDraft] = useState({
    on: limits.limits_on,
    practice: String(limits.free_practice_per_day),
    mocks: String(limits.free_mocks),
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const practice = Number(draft.practice);
    const mocks = Number(draft.mocks);
    if (!Number.isInteger(practice) || practice < 0 || !Number.isInteger(mocks) || mocks < 0) {
      setNotice({ ok: false, text: 'Enter whole numbers, 0 or more.' });
      return;
    }
    if (draft.on && !limits.limits_on && !window.confirm('Turn the free limits on for every student now?')) return;
    setBusy(true);
    setNotice(null);
    try {
      await request('/v1/admin/billing/limits', {
        method: 'PUT',
        body: JSON.stringify({ limits_on: draft.on, free_practice_per_day: practice, free_mocks: mocks }),
      });
      setNotice({ ok: true, text: 'Saved.' });
      onSaved();
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-panel">
      <h2>Free limits</h2>
      <p className="st-muted">
        Check-ups and the board's written working are always free. While the limits are off, every student has
        everything.
      </p>
      <form className="st-inline-form st-limits-form" onSubmit={save}>
        <label className="st-field">
          <span>Limits</span>
          <select value={draft.on ? 'on' : 'off'} onChange={(event) => setDraft({ ...draft, on: event.target.value === 'on' })}>
            <option value="off">Off: everything free</option>
            <option value="on">On</option>
          </select>
        </label>
        <label className="st-field">
          <span>Free practice questions a day</span>
          <input
            inputMode="numeric"
            value={draft.practice}
            onChange={(event) => setDraft({ ...draft, practice: event.target.value })}
          />
        </label>
        <label className="st-field">
          <span>Free mocks</span>
          <input inputMode="numeric" value={draft.mocks} onChange={(event) => setDraft({ ...draft, mocks: event.target.value })} />
        </label>
        <button type="submit" className="sj-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
      <p className={`st-pill ${limits.limits_on ? 'warn' : 'good'}`} style={{ marginTop: 12 }}>
        {limits.limits_on
          ? `On: ${limits.free_practice_per_day} practice questions a day and ${limits.free_mocks} ${limits.free_mocks === 1 ? 'mock' : 'mocks'} free.`
          : 'Off: nothing is held back.'}
      </p>
      {notice && (
        <p className={notice.ok ? 'st-muted' : 'st-error'} role="status">
          {notice.text}
        </p>
      )}
    </section>
  );
}

function PlansPanel({ plans, onSaved }: { plans: AdminPlan[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (plan: AdminPlan) =>
    setDraft({
      id: plan.id,
      name: plan.name,
      blurb: plan.blurb ?? '',
      naira: String(plan.price_kobo / 100),
      days: String(plan.days),
      on_sale: plan.on_sale,
      display_order: String(plan.display_order),
    });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const price = Math.round(Number(draft.naira.replace(/[,₦\s]/g, '')) * 100);
    const days = Number(draft.days);
    if (!draft.name.trim()) return setError('Give the plan a name.');
    if (!Number.isFinite(price) || price < 10000) return setError('The price must be at least ₦100.');
    if (!Number.isInteger(days) || days < 1 || days > 730) return setError('Days must be a whole number from 1 to 730.');
    setBusy(true);
    setError(null);
    try {
      await request(draft.id ? `/v1/admin/billing/plans/${draft.id}` : '/v1/admin/billing/plans', {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          blurb: draft.blurb.trim() || null,
          price_kobo: price,
          days,
          on_sale: draft.on_sale,
          display_order: Number(draft.display_order) || 0,
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

  return (
    <section className="st-panel">
      <div className="st-panel-head">
        <h2>Plans</h2>
        {!draft && (
          <button type="button" className="sj-btn sm" onClick={() => setDraft(EMPTY)}>
            Add a plan
          </button>
        )}
      </div>
      {draft && (
        <form className="st-form st-plan-form" onSubmit={save}>
          <label className="st-field">
            <span>Name</span>
            <input value={draft.name} maxLength={60} placeholder="One month" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="st-field">
            <span>Price (₦)</span>
            <input inputMode="decimal" value={draft.naira} placeholder="2500" onChange={(event) => setDraft({ ...draft, naira: event.target.value })} />
          </label>
          <label className="st-field">
            <span>Days of Premium</span>
            <input inputMode="numeric" value={draft.days} onChange={(event) => setDraft({ ...draft, days: event.target.value })} />
          </label>
          <label className="st-field">
            <span>Order on the page</span>
            <input inputMode="numeric" value={draft.display_order} onChange={(event) => setDraft({ ...draft, display_order: event.target.value })} />
          </label>
          <label className="st-field st-span">
            <span>One line about it (optional)</span>
            <input value={draft.blurb} maxLength={200} placeholder="Best for the last month before the exam." onChange={(event) => setDraft({ ...draft, blurb: event.target.value })} />
          </label>
          <label className="st-check">
            <input type="checkbox" checked={draft.on_sale} onChange={(event) => setDraft({ ...draft, on_sale: event.target.checked })} />
            On sale
          </label>
          {error && <p className="st-error st-span">{error}</p>}
          <div className="st-row st-span">
            <button type="button" className="sj-btn ghost sm" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="sj-btn sm" disabled={busy}>
              {busy ? 'Saving…' : draft.id ? 'Save the plan' : 'Add the plan'}
            </button>
          </div>
        </form>
      )}
      {plans.length === 0 && !draft && <p className="st-empty">No plans yet. Add one to start selling Premium.</p>}
      {plans.length > 0 && (
        <div className="st-table-wrap">
          <table className="st-table st-stack">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Length</th>
                <th>Sold</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td data-label="Plan">
                    <span className="st-cell">
                      <strong>{plan.name}</strong>
                      {plan.blurb && <span className="st-muted">{plan.blurb}</span>}
                    </span>
                  </td>
                  <td data-label="Price">{naira(plan.price_kobo)}</td>
                  <td data-label="Length">{planLength(plan.days)}</td>
                  <td data-label="Sold">{plan.sold}</td>
                  <td data-label="Status">
                    <span className={`st-pill ${plan.on_sale ? 'good' : 'reviewer'}`}>{plan.on_sale ? 'On sale' : 'Off sale'}</span>
                  </td>
                  <td data-label="" style={{ textAlign: 'right' }}>
                    <button type="button" className="sj-btn ghost sm" onClick={() => edit(plan)}>
                      Change
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
