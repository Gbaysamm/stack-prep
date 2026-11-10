/**
 * The plans on sale, side by side, for the public Pricing page and the home page. Prices come
 * from the admin's Pricing & plans page; choosing one goes to sign-up (or, signed in, to the
 * app's Plans page, where paying happens).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Select } from '../lib/Select.js';
import { featureLines, naira, type Catalogue } from '../prep/billingApi.js';
import { IconBolt, IconBook, IconCheck, IconSparkles, IconTrophy } from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { SIGN_UP } from './showcase.js';

/** An icon for each step up: free, then each paid plan in order. */
const TIER_ICONS = [IconBook, IconBolt, IconSparkles, IconTrophy];

/** Whether any paid plan is on sale with a price. Until one is, the site leaves plans out. */
export function hasPaidPlans(catalogue: Catalogue | null): boolean {
  return Boolean(catalogue?.plans.some((plan) => plan.kind === 'paid' && Object.keys(plan.prices).length));
}

export function PlanGrid({ catalogue, compact = false }: { catalogue: Catalogue; compact?: boolean }) {
  const { identity } = useIdentity();
  const [lengthId, setLengthId] = useState(catalogue.lengths[0]?.id ?? '');
  const length = catalogue.lengths.find((l) => l.id === lengthId);
  const go = identity ? '/plans' : SIGN_UP;

  // Nothing to compare while only Free is on sale: the pages leave the plans out.
  if (!hasPaidPlans(catalogue)) return null;

  return (
    <div className="ps-plans">
      {catalogue.lengths.length > 1 ? (
        <div className="ps-plans-bar">
          <span>Prices for</span>
          {catalogue.lengths.length <= 4 ? (
            <div className="ps-seg" role="radiogroup" aria-label="How long">
              {catalogue.lengths.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={l.id === lengthId}
                  className={l.id === lengthId ? 'on' : undefined}
                  onClick={() => setLengthId(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          ) : (
            <Select
              aria-label="How long"
              value={lengthId}
              onChange={setLengthId}
              options={catalogue.lengths.map((l) => ({ value: l.id, label: l.label }))}
            />
          )}
        </div>
      ) : null}
      <div className={`ps-plan-grid n${Math.min(catalogue.plans.length, 4)}`}>
        {catalogue.plans.map((plan, index) => {
          const price = plan.prices[lengthId];
          const months = length ? length.days / 30 : 1;
          // What this plan gives. A paid plan lists only what it adds to the plan below it,
          // under "Everything in …, plus", so each card is short and the steps up are clear.
          const below = index > 0 ? catalogue.plans[index - 1] : undefined;
          const had = new Set(below ? featureLines(below.features).filter((l) => l.on).map((l) => l.text) : []);
          const lines = featureLines(plan.features)
            .filter((line) => line.on && !had.has(line.text))
            .slice(0, compact ? 4 : undefined);
          const top = index === catalogue.plans.length - 1 && catalogue.plans.length > 2;
          const Icon = TIER_ICONS[Math.min(index, TIER_ICONS.length - 1)]!;
          return (
            <article
              key={plan.id}
              className={`ps-plan tier${Math.min(index, 3)} ${top ? 'top' : ''} ${plan.featured ? 'featured' : ''}`}
            >
              {plan.featured ? <span className="ps-plan-flag">Most chosen</span> : null}
              <header className="ps-plan-head">
                <span className="ps-plan-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3>{plan.name}</h3>
              </header>
              {/* Always there, even empty, so every card's price and list start at the same height. */}
              <p className="ps-plan-blurb">
                {plan.blurb || (plan.kind === 'free' ? 'Every question, check-ups and the working, free.' : '')}
              </p>
              <div className="ps-plan-price">
                {plan.kind === 'free' ? (
                  <>
                    <span className="ps-price-row">
                      <strong>₦0</strong>
                      <span>forever</span>
                    </span>
                    <small>No card needed</small>
                  </>
                ) : price !== undefined ? (
                  <>
                    <span className="ps-price-row">
                      <strong>{naira(price)}</strong>
                      <span>/ {length?.label.toLowerCase()}</span>
                    </span>
                    <small>
                      {months > 1.5
                        ? `About ${naira(Math.round(price / months / 100) * 100)} a month`
                        : 'Paid once, nothing renews'}
                    </small>
                  </>
                ) : (
                  <small>Not sold for {length?.label.toLowerCase()}</small>
                )}
              </div>
              <p className="ps-plan-plus">{below ? `Everything in ${below.name}, plus` : 'What you get'}</p>
              <ul>
                {lines.map((line) => (
                  <li key={line.text}>
                    <IconCheck size={14} />
                    {line.text}
                  </li>
                ))}
              </ul>
              <Link to={go} className="sj-btn ps-plan-go">
                {plan.kind === 'free' ? 'Start free' : `Choose ${plan.name}`}
              </Link>
            </article>
          );
        })}
      </div>
      {!catalogue.limits_on ? (
        <p className="ps-plans-note">For now everything is open to every student while we launch, whatever plan you’re on.</p>
      ) : null}
    </div>
  );
}

/** Every plan side by side, feature by feature, for the Pricing page. */
export function PlanTable({ catalogue }: { catalogue: Catalogue }) {
  const plans = catalogue.plans;
  const per: Record<string, string> = { day: 'a day', week: 'a week', month: 'a month', total: 'to try' };
  type Cell = string | boolean;
  const rows: { label: string; cell: (plan: (typeof plans)[number]) => Cell }[] = [
    {
      label: 'Practice questions',
      cell: (p) => (p.features.practice_per_day === null ? 'Unlimited' : p.features.practice_per_day === 0 ? false : `${p.features.practice_per_day} a day`),
    },
    {
      label: 'Mock exams',
      cell: (p) =>
        p.features.mocks_allowed === null ? 'Unlimited' : p.features.mocks_allowed === 0 ? false : `${p.features.mocks_allowed} ${per[p.features.mocks_per]}`,
    },
    { label: 'Check-ups and your predicted score', cell: () => true },
    { label: 'The full checked working', cell: () => true },
    { label: 'Lessons explained out loud', cell: (p) => p.features.voice },
    { label: 'Ask the coach', cell: (p) => (p.features.coach_per_day > 0 ? `${p.features.coach_per_day} a day` : false) },
    { label: 'Choose your own topics and years', cell: (p) => p.features.custom_runs },
    { label: 'Revise your bookmarks as a run', cell: (p) => p.features.bookmark_runs },
    ...[...new Set(plans.flatMap((p) => p.features.extras))].map((extra) => ({
      label: extra,
      cell: (p: (typeof plans)[number]) => p.features.extras.includes(extra),
    })),
  ];
  const show = (cell: Cell) =>
    cell === true ? (
      <IconCheck size={18} className="pt-yes" label="Included" />
    ) : cell === false ? (
      <span className="pt-no" aria-label="Not included">
        –
      </span>
    ) : (
      cell
    );
  return (
    <div className="pt-wrap">
      <table className="pt">
        <thead>
          <tr>
            <th scope="col">What you get</th>
            {plans.map((plan) => (
              <th key={plan.id} scope="col" className={plan.featured ? 'featured' : undefined}>
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {plans.map((plan) => (
                <td key={plan.id} className={plan.featured ? 'featured' : undefined}>
                  {show(row.cell(plan))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
