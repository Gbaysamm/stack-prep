/**
 * /plans — Premium: what the student has now, what is free, the plans on sale, and their
 * receipts. Paying goes to Paystack's own page; /plans/paid is where Paystack sends them back.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { billingApi, naira, planLength, type Confirmed, type Plan, type Standing } from '../billingApi.js';
import { IconArrowRight, IconCheck, IconClock, IconSparkles } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, PageHero, Skeleton } from '../ui.js';
import { AboutField } from '../AboutFields.js';
import { Note, Section } from './Home.js';
import './Plans.css';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const PREMIUM_GIVES = [
  'Unlimited practice questions, every day',
  'As many full mock exams as you want',
  'Every lesson explained aloud on the board',
  'Ask the coach about any step you don’t follow',
];

function Allowance({ standing }: { standing: Standing }) {
  if (standing.premium) {
    return (
      <div className="sj-card pl-now premium">
        <span className="pl-now-icon" aria-hidden="true">
          <IconSparkles size={22} />
        </span>
        <div>
          <h2 className="sj-display sj-h3">You have Premium</h2>
          <p>
            {standing.premium_until
              ? `It runs until ${longDate(standing.premium_until)}. Buying another plan adds its time after that.`
              : 'Everything in Stack Prep is open to you.'}
          </p>
        </div>
      </div>
    );
  }
  if (!standing.free.limits_on) {
    return (
      <div className="sj-card pl-now">
        <span className="pl-now-icon" aria-hidden="true">
          <IconCheck size={22} />
        </span>
        <div>
          <h2 className="sj-display sj-h3">Everything is open for now</h2>
          <p>There are no limits on your account at the moment. Premium keeps it that way when they start.</p>
        </div>
      </div>
    );
  }
  const left = Math.max(0, standing.free.practice_per_day - standing.practice_used_today);
  const mocksLeft = Math.max(0, standing.free.mocks - standing.mocks_used);
  return (
    <div className="sj-card pl-now">
      <span className="pl-now-icon" aria-hidden="true">
        <IconClock size={22} />
      </span>
      <div>
        <h2 className="sj-display sj-h3">You're on the free plan</h2>
        <ul className="pl-free">
          <li>
            <b>{left}</b> of {standing.free.practice_per_day} practice questions left today
          </li>
          <li>
            <b>{mocksLeft}</b> of {standing.free.mocks} free {standing.free.mocks === 1 ? 'mock' : 'mocks'} left
          </li>
          <li>Check-ups and the written working on the board are always free</li>
        </ul>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  open,
  onBuy,
  busy,
}: {
  plan: Plan;
  open: boolean;
  onBuy: (plan: Plan) => void;
  busy: boolean;
}) {
  // Rounded to the naira: it is a rough guide, not a price.
  const perMonth = plan.days >= 60 ? Math.round((plan.price_kobo * 30) / plan.days / 100) * 100 : null;
  return (
    <li className="sj-card pl-plan">
      <div className="pl-plan-head">
        <h3 className="sj-display sj-h3">{plan.name}</h3>
        <span className="pl-length">{planLength(plan.days)}</span>
      </div>
      <p className="pl-price">
        <span className="sj-display">{naira(plan.price_kobo)}</span>
        {perMonth ? <span className="pl-per">about {naira(perMonth)} a month</span> : null}
      </p>
      {plan.blurb ? <p className="pl-blurb">{plan.blurb}</p> : null}
      <Button block busy={busy} disabled={!open} onClick={() => onBuy(plan)} trailing={<IconArrowRight size={18} />}>
        Pay {naira(plan.price_kobo)}
      </Button>
    </li>
  );
}

export function Plans() {
  usePageTitle('Premium');
  const student = useStudent();
  const catalogue = useLoad(() => billingApi.plans(), []);
  const standing = useLoad(() => billingApi.standing(student.studentId), [student.studentId]);
  const [buying, setBuying] = useState<Plan | null>(null);
  const [asking, setAsking] = useState<Plan | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pay = async (plan: Plan, withEmail?: string) => {
    if (!standing.data?.email && !withEmail) {
      setAsking(plan);
      return;
    }
    setBuying(plan);
    setError(null);
    try {
      const started = await billingApi.checkout(student.studentId, plan.id, withEmail);
      window.location.assign(started.authorization_url);
    } catch (failure) {
      setError(friendly(failure));
      setBuying(null);
    }
  };

  const loading = !catalogue.data || !standing.data;
  const failed = catalogue.error || standing.error;

  return (
    <div className="sj-page pro-page pl-page">
      <PageHero
        eyebrow="Premium"
        title="Practise without limits"
        sub="Pay once for the time you want. Nothing renews by itself, and you can pay by card, bank transfer or USSD."
      />

      {failed && loading ? (
        <Note
          card
          icon={<IconSparkles size={18} />}
          tone="pink"
          title="We couldn't load the plans"
          action={
            <Button
              tone="soft"
              onClick={() => {
                catalogue.reload();
                standing.reload();
              }}
            >
              Try again
            </Button>
          }
        >
          {friendly(failed)}
        </Note>
      ) : loading ? (
        <>
          <Skeleton height={120} radius={16} />
          <Skeleton height={240} radius={16} />
        </>
      ) : (
        <>
          <Allowance standing={standing.data!} />

          <Section eyebrow="Plans" title={standing.data!.premium ? 'Add more time' : 'Choose a plan'} id="pl-plans">
            <ul className="pl-gives">
              {PREMIUM_GIVES.map((line) => (
                <li key={line}>
                  <IconCheck size={16} /> {line}
                </li>
              ))}
            </ul>
            {error ? (
              <p className="pl-error" role="alert">
                {error}
              </p>
            ) : null}
            {!catalogue.data!.checkout_open ? (
              <p className="pl-quiet">Payments aren't open yet. Check back soon.</p>
            ) : null}
            {catalogue.data!.plans.length === 0 ? (
              <Note card icon={<IconClock size={18} />} tone="yellow" title="No plans on sale yet">
                Premium plans will appear here soon.
              </Note>
            ) : (
              <ul className="pl-plans">
                {catalogue.data!.plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    open={catalogue.data!.checkout_open && buying === null}
                    busy={buying?.id === plan.id}
                    onBuy={(chosen) => void pay(chosen)}
                  />
                ))}
              </ul>
            )}
          </Section>

          {standing.data!.receipts.length > 0 ? (
            <Section eyebrow="Receipts" title="Your payments" id="pl-receipts">
              <ul className="sj-card pl-receipts">
                {standing.data!.receipts.map((receipt) => (
                  <li key={receipt.reference}>
                    <div>
                      <b>{receipt.plan_name}</b>
                      <span className="pl-quiet">
                        {longDate(receipt.paid_at ?? receipt.created_at)} · {planLength(receipt.days)}
                        {receipt.channel ? ` · ${receipt.channel.replace('_', ' ')}` : ''}
                      </span>
                    </div>
                    <div className="pl-receipt-right">
                      <b>{naira(receipt.amount_kobo)}</b>
                      <span className={`sj-badge ${receipt.status === 'paid' ? 'green' : receipt.status === 'pending' ? 'yellow' : 'pink'}`}>
                        {receipt.status === 'paid'
                          ? 'Paid'
                          : receipt.status === 'pending'
                            ? 'Not finished'
                            : receipt.status === 'abandoned'
                              ? 'Cancelled'
                              : 'Failed'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}

      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        icon={<IconSparkles size={24} />}
        title="Where should the receipt go?"
        actions={
          <>
            <Button tone="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
              onClick={() => {
                const plan = asking;
                setAsking(null);
                if (plan) void pay(plan, email.trim());
              }}
            >
              Continue to pay
            </Button>
          </>
        }
      >
        <p style={{ margin: '0 0 14px' }}>
          Paystack sends a receipt by email. Your account has no email, so enter one here. To sign in with
          it too, add it in Account settings.
        </p>
        <AboutField label="Email for the receipt">
          {(id) => (
            <input
              id={id}
              className="sj-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </AboutField>
      </Dialog>
    </div>
  );
}

/** /plans/paid?reference=… — back from Paystack: check the payment and say how it went. */
export function PlanPaid() {
  usePageTitle('Payment');
  const student = useStudent();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const [result, setResult] = useState<Confirmed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reference) {
      setError("We couldn't tell which payment this was.");
      return;
    }
    let live = true;
    setError(null);
    billingApi
      .confirm(student.studentId, reference)
      .then((done) => {
        if (!live) return;
        setResult(done);
        // Paystack can take a moment to settle a bank transfer: look again shortly.
        if (done.status === 'pending' && attempt < 5) {
          window.setTimeout(() => live && setAttempt((n) => n + 1), 4000);
        }
      })
      .catch((failure) => live && setError(friendly(failure)));
    return () => {
      live = false;
    };
  }, [reference, student.studentId, attempt]);

  const paid = result?.status === 'paid';
  return (
    <div className="sj-page pro-page pl-page">
      <PageHero eyebrow="Premium" title={paid ? 'Payment received' : 'Your payment'} />
      {error ? (
        <Note
          card
          icon={<IconClock size={18} />}
          tone="pink"
          title="We couldn't check your payment"
          action={
            reference ? (
              <Button tone="soft" onClick={() => setAttempt((n) => n + 1)}>
                Check again
              </Button>
            ) : (
              <Button tone="soft" to="/plans">
                Back to plans
              </Button>
            )
          }
        >
          {error} If money left your account, it is safe: we'll add your Premium as soon as Paystack confirms it.
        </Note>
      ) : !result ? (
        <Skeleton height={140} radius={16} />
      ) : paid ? (
        <Note
          card
          icon={<IconSparkles size={18} />}
          tone="lime"
          title={`${result.plan_name}: you have Premium`}
          action={
            <Button onClick={() => navigate('/practice')} trailing={<IconArrowRight size={18} />}>
              Start practising
            </Button>
          }
        >
          {result.standing.premium_until
            ? `It runs until ${longDate(result.standing.premium_until)}. A receipt is on its way to your email.`
            : 'A receipt is on its way to your email.'}
        </Note>
      ) : result.status === 'pending' ? (
        <Note card icon={<IconClock size={18} />} tone="yellow" title="Waiting for Paystack">
          Your payment hasn't been confirmed yet. Bank transfers can take a few minutes. This page checks again by
          itself; you can also come back to Premium later.
        </Note>
      ) : (
        <Note
          card
          icon={<IconClock size={18} />}
          tone="pink"
          title={result.status === 'abandoned' ? 'The payment was cancelled' : 'The payment didn’t go through'}
          action={
            <Button tone="soft" to="/plans">
              Try again
            </Button>
          }
        >
          {result.status === 'abandoned'
            ? 'Nothing was paid. You can choose a plan and pay again.'
            : 'Paystack did not complete the payment. You can choose a plan and pay again.'}
        </Note>
      )}
    </div>
  );
}
