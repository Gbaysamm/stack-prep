/**
 * /plans — the plans side by side, Free first, each with what it gives; a switch for how long
 * (1 month, 3 months, ...); any offer made for this student; and their receipts. Where the
 * student stands is said in the hero. Paying goes to Paystack's own page; /plans/paid is where
 * Paystack sends them back. 100% off gives the plan at once.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { AboutField } from '../AboutFields.js';
import {
  PREMIUM_CHANGED,
  billingApi,
  featureLines,
  naira,
  type Catalogue,
  type Confirmed,
  type Length,
  type Plan,
  type Quote,
  type Standing,
} from '../billingApi.js';
import { IconArrowRight, IconCheck, IconClock, IconClose, IconSparkles } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, PageHero, Skeleton, useToast } from '../ui.js';
import { Note, Section } from './Home.js';
import './Plans.css';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** What the hero says: the plan they're on, or what's left of the free allowance. */
function heroWords(standing: Standing | null, open = true): { title: string; sub: string } {
  if (standing?.premium && standing.plan_name) {
    return {
      title: `You're on ${standing.plan_name}`,
      sub: standing.plan_until
        ? `It runs until ${longDate(standing.plan_until)}. More time on ${standing.plan_name} follows on from that; a higher plan starts at once.`
        : 'Everything in your plan is open to you.',
    };
  }
  const intro = open
    ? 'Pay once for the time you want. Nothing renews by itself; pay by card, bank transfer or USSD.'
    : 'Payments open soon. Until then, see what each plan gives; nothing renews by itself when they do.';
  if (!standing || !standing.limits_on || standing.premium) return { title: 'Choose your plan', sub: intro };
  const allowance = standing.allowance;
  const parts: string[] = [];
  if (allowance.practice_per_day !== null) {
    parts.push(
      `${Math.max(0, allowance.practice_per_day - standing.practice_used_today)} of ${allowance.practice_per_day} practice questions left today`,
    );
  }
  if (allowance.mocks !== null && allowance.mocks > 0) {
    parts.push(`${Math.max(0, allowance.mocks - standing.mocks_used)} of ${allowance.mocks} free ${allowance.mocks === 1 ? 'mock' : 'mocks'} left`);
  }
  return {
    title: 'Choose your plan',
    sub: parts.length ? `You're on the free plan: ${parts.join(', ')}. ${intro}` : intro,
  };
}

function PlanCard({
  plan,
  featured,
  length,
  current,
  open,
  offer,
  onChoose,
}: {
  plan: Plan;
  featured: boolean;
  length: Length | null;
  current: boolean;
  open: boolean;
  /** Percent off this student's offer gives this plan at this length. */
  offer: number;
  onChoose: (plan: Plan) => void;
}) {
  const listed = length ? plan.prices[length.id] : undefined;
  const price = listed !== undefined && offer ? (offer === 100 ? 0 : Math.max(10000, Math.floor((listed * (100 - offer)) / 100))) : listed;
  const perMonth = price !== undefined && length && length.days >= 60 ? Math.round((price * 30) / length.days / 100) * 100 : null;
  const [whole, setWhole] = useState(false);
  const lines = featureLines(plan.features);
  return (
    <li className={`sj-card pl-plan ${featured ? 'featured' : ''} ${current ? 'current' : ''}`}>
      <div className="pl-plan-top">
        <h3 className="sj-display sj-h3">{plan.name}</h3>
        {current ? <span className="pl-tag mine">Your plan</span> : featured ? <span className="pl-tag">Most chosen</span> : null}
      </div>
      {/* Every plan says what it is for, so prices and lists line up across the row. */}
      <p className="pl-blurb">{plan.blurb || (plan.kind === 'free' ? 'Start here. No card needed.' : '')}</p>
      <p className="pl-price">
        {plan.kind === 'free' ? (
          <>
            <span className="sj-display">₦0</span>
            <span className="pl-per">Always free</span>
          </>
        ) : price !== undefined ? (
          <>
            <span className="sj-display">
              {price === 0 ? 'Free' : naira(price)}
              {offer && listed !== undefined ? <s className="pl-was">{naira(listed)}</s> : null}
            </span>
            {offer ? <span className="pl-offer-tag">Your offer: {offer === 100 ? 'free' : `${offer}% off`}</span> : null}
            <span className="pl-per">
              for {length ? length.label.toLowerCase() : ''}
              {perMonth ? ` · about ${naira(perMonth)} a month` : ''}
            </span>
          </>
        ) : (
          <span className="pl-per">Not sold for {length?.label.toLowerCase() ?? 'this length'}</span>
        )}
      </p>
      <ul className={`pl-features ${whole ? 'whole' : ''}`}>
        {lines.map((line, index) => (
          <li key={line.text} className={`${line.on ? '' : 'off'} ${index >= LINES_SHOWN ? 'later' : ''}`}>
            {line.on ? <IconCheck size={16} /> : <IconClose size={16} />}
            <span>{line.text}</span>
          </li>
        ))}
      </ul>
      {lines.length > LINES_SHOWN && !whole ? (
        <button type="button" className="pl-more" onClick={() => setWhole(true)}>
          See everything in {plan.name}
        </button>
      ) : null}
      <div className="pl-plan-foot">
        {current ? (
          <Button block tone="soft" disabled>
            Your plan
          </Button>
        ) : plan.kind === 'free' ? (
          <Button block tone="ghost" disabled>
            Included for everyone
          </Button>
        ) : (
          open ? (
            <Button
              block
              tone={featured ? 'primary' : 'soft'}
              disabled={price === undefined}
              onClick={() => onChoose(plan)}
              trailing={<IconArrowRight size={18} />}
            >
              Choose {plan.name}
            </Button>
          ) : (
            <Button block tone="ghost" disabled className="pl-soon">
              Coming soon
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function CheckoutDialog({
  plan,
  length,
  standing,
  onClose,
}: {
  plan: Plan | null;
  length: Length | null;
  standing: Standing | null;
  onClose: () => void;
}) {
  const student = useStudent();
  const toast = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode('');
    setApplied('');
    setError(null);
    setBusy(false);
  }, [plan?.id, length?.id]);

  useEffect(() => {
    if (!plan || !length) return;
    let live = true;
    setQuote(null);
    billingApi
      .quote(student.studentId, plan.id, length.id, applied || undefined)
      .then((next) => live && setQuote(next))
      .catch((failure) => {
        if (!live) return;
        setError(friendly(failure));
        if (applied) setApplied('');
      });
    return () => {
      live = false;
    };
  }, [plan, length, applied, student.studentId]);

  if (!plan || !length) return null;
  const needsEmail = !standing?.email && (quote?.amount_kobo ?? 1) > 0;
  const pay = async () => {
    if (!quote || busy) return;
    if (needsEmail && !EMAIL.test(email.trim())) {
      setError('Enter an email address for your receipt.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const started = await billingApi.checkout(student.studentId, plan.id, length.id, applied || undefined, email.trim());
      if (started.granted || !started.authorization_url) {
        window.dispatchEvent(new Event(PREMIUM_CHANGED));
        toast(`${plan.name} is yours`);
        onClose();
        navigate(`/plans/paid?reference=${started.reference}`);
        return;
      }
      window.location.assign(started.authorization_url);
    } catch (failure) {
      setError(friendly(failure));
      setBusy(false);
    }
  };

  const free = quote?.amount_kobo === 0;
  return (
    <Dialog
      open
      onClose={onClose}
      icon={<IconSparkles size={24} />}
      title={`${plan.name}, ${length.label.toLowerCase()}`}
      actions={
        <>
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!quote} onClick={() => void pay()}>
            {!quote ? 'Working out the price…' : free ? 'Get it free' : `Pay ${naira(quote.amount_kobo)}`}
          </Button>
        </>
      }
    >
      <div className="pl-checkout">
        {quote ? (
          <dl className="pl-sum">
            <div>
              <dt>Price</dt>
              <dd>{naira(quote.list_price_kobo)}</dd>
            </div>
            {quote.discount_label ? (
              <div className="off">
                <dt>{quote.discount_label}</dt>
                <dd>−{naira(quote.list_price_kobo - quote.amount_kobo)}</dd>
              </div>
            ) : null}
            <div className="total">
              <dt>To pay</dt>
              <dd>{free ? 'Nothing' : naira(quote.amount_kobo)}</dd>
            </div>
          </dl>
        ) : (
          <Skeleton height={90} radius={12} />
        )}
        <form
          className="pl-code"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setApplied(code.trim());
          }}
        >
          <AboutField label="Promo code">
            {(id) => (
              <input
                id={id}
                className="sj-input"
                value={code}
                autoCapitalize="characters"
                placeholder="If you have one"
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </AboutField>
          <Button type="submit" tone="soft" disabled={!code.trim() || code.trim() === applied}>
            Apply
          </Button>
        </form>
        {needsEmail ? (
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
        ) : null}
        {error ? (
          <p className="pl-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="pl-quiet">
          {free
            ? `${plan.name} is added to your account straight away.`
            : `You'll pay on Paystack's page by card, bank transfer or USSD, then come back here. ${plan.name} starts as soon as the payment is confirmed.`}
        </p>
      </div>
    </Dialog>
  );
}

/** The middle paid plan by price at this length: the one most students need. */
function middlePaid(plans: Plan[], length: Length | null): string | undefined {
  const paid = plans
    .filter((p) => p.kind !== 'free')
    .sort((a, b) => (length ? (a.prices[length.id] ?? 0) - (b.prices[length.id] ?? 0) : 0));
  return paid[Math.floor((paid.length - 1) / 2)]?.id;
}

/** What a plan card shows on a phone before "See everything". */
const LINES_SHOWN = 4;

export function Plans() {
  usePageTitle('Plans');
  const student = useStudent();
  const catalogue = useLoad<Catalogue>(() => billingApi.plans(), []);
  const standing = useLoad(() => billingApi.standing(student.studentId), [student.studentId]);
  const [lengthId, setLengthId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<Plan | null>(null);

  useEffect(() => {
    const reload = () => standing.reload();
    window.addEventListener(PREMIUM_CHANGED, reload);
    return () => window.removeEventListener(PREMIUM_CHANGED, reload);
  }, [standing]);

  const lengths = catalogue.data?.lengths ?? [];
  const length = useMemo(
    () => lengths.find((item) => item.id === lengthId) ?? lengths[0] ?? null,
    [lengths, lengthId],
  );
  const hero = heroWords(standing.data ?? null, catalogue.data?.checkout_open ?? true);
  const loading = !catalogue.data || !standing.data;
  const failed = catalogue.error || standing.error;
  const plans = catalogue.data?.plans ?? [];
  const offers = standing.data?.offers ?? [];

  return (
    <div className="sj-page pro-page pl-page">
      <PageHero eyebrow="Plans" title={hero.title} sub={hero.sub} />

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
        <div className="pl-grid" style={{ ['--plans' as string]: 3 }}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={420} radius={18} />
          ))}
        </div>
      ) : (
        <>
          {offers.length > 0 ? (
            <div className="sj-card pl-offer">
              <span className="pl-offer-icon" aria-hidden="true">
                <IconSparkles size={20} />
              </span>
              <div>
                <strong>
                  An offer for you: {offers[0]!.percent_off === 100 ? 'free' : `${offers[0]!.percent_off}% off`}{' '}
                  {offers[0]!.plan_name ?? 'any plan'}
                  {offers[0]!.length_label ? `, ${offers[0]!.length_label.toLowerCase()}` : ''}
                </strong>
                <span className="pl-quiet">
                  {offers[0]!.note ? `${offers[0]!.note}. ` : ''}It's applied when you choose the plan
                  {offers[0]!.expires_at ? `, until ${longDate(offers[0]!.expires_at)}` : ''}.
                </span>
              </div>
            </div>
          ) : null}

          <Section
            eyebrow="Plans"
            title="What each plan gives"
            id="pl-plans"
            action={
              lengths.length > 1 ? (
                <div className="pl-lengths" role="tablist" aria-label="How long">
                  {lengths.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={item.id === length?.id}
                      className={item.id === length?.id ? 'on' : undefined}
                      onClick={() => setLengthId(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null
            }
          >
            <ul className="pl-grid" style={{ ['--plans' as string]: Math.min(plans.length, 4) }}>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  featured={plan.featured || (!plans.some((p) => p.featured) && plan.id === middlePaid(plans, length))}
                  length={length}
                  current={
                    plan.kind === 'free'
                      ? Boolean(standing.data!.limits_on && !standing.data!.premium)
                      : plan.id === standing.data!.plan_id
                  }
                  open={catalogue.data!.checkout_open || offers.some((offer) => offer.percent_off === 100)}
                  offer={
                    offers.find(
                      (offer) =>
                        (offer.plan_id === null || offer.plan_id === plan.id) &&
                        (offer.length_id === null || offer.length_id === length?.id),
                    )?.percent_off ?? 0
                  }
                  onChoose={setChoosing}
                />
              ))}
            </ul>
          </Section>

          {standing.data!.receipts.length > 0 ? (
            <Section eyebrow="Receipts" title="Your payments" id="pl-receipts">
              <ul className="sj-card pl-receipts">
                {standing.data!.receipts.map((receipt) => (
                  <li key={receipt.reference}>
                    <div>
                      <b>
                        {receipt.plan_name}, {receipt.length_label.toLowerCase()}
                      </b>
                      <span className="pl-quiet">
                        {longDate(receipt.paid_at ?? receipt.created_at)}
                        {receipt.discount_label ? ` · ${receipt.discount_label}` : ''}
                        {receipt.channel && receipt.channel !== 'free' ? ` · ${receipt.channel.replace('_', ' ')}` : ''}
                      </span>
                    </div>
                    <div className="pl-receipt-right">
                      <b>{receipt.amount_kobo === 0 ? 'Free' : naira(receipt.amount_kobo)}</b>
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

      {choosing ? (
        <CheckoutDialog plan={choosing} length={length} standing={standing.data ?? null} onClose={() => setChoosing(null)} />
      ) : null}
    </div>
  );
}

/** /plans/paid?reference=… — back from Paystack (or a free plan): say how it went. */
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
      <PageHero eyebrow="Plans" title={paid ? `${result.plan_name} is yours` : 'Your payment'} />
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
          {error} If money left your account, it is safe: we'll add your plan as soon as Paystack confirms it.
        </Note>
      ) : !result ? (
        <Skeleton height={140} radius={16} />
      ) : paid ? (
        <Note
          card
          icon={<IconSparkles size={18} />}
          tone="lime"
          title={`You're on ${result.standing.plan_name ?? result.plan_name}`}
          action={
            <Button onClick={() => navigate('/practice')} trailing={<IconArrowRight size={18} />}>
              Start practising
            </Button>
          }
        >
          {result.standing.plan_until ? `It runs until ${longDate(result.standing.plan_until)}.` : ''}
          {result.standing.receipts[0]?.amount_kobo ? ' A receipt is on its way to your email.' : ''}
        </Note>
      ) : result.status === 'pending' ? (
        <Note card icon={<IconClock size={18} />} tone="yellow" title="Waiting for Paystack">
          Your payment hasn't been confirmed yet. Bank transfers can take a few minutes. This page checks again by
          itself; you can also come back to Plans later.
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

