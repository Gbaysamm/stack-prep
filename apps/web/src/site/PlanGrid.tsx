/**
 * The plans on sale, side by side, for the public Pricing page and the home page. Prices come
 * from the admin's Pricing & plans page; choosing one goes to sign-up (or, signed in, to the
 * app's Plans page, where paying happens).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Select } from '../lib/Select.js';
import { featureLines, naira, type Catalogue } from '../prep/billingApi.js';
import { IconCheck, IconClose } from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { SIGN_UP } from './showcase.js';

export function PlanGrid({ catalogue, compact = false }: { catalogue: Catalogue; compact?: boolean }) {
  const { identity } = useIdentity();
  const [lengthId, setLengthId] = useState(catalogue.lengths[0]?.id ?? '');
  const length = catalogue.lengths.find((l) => l.id === lengthId);
  const go = identity ? '/plans' : SIGN_UP;

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
        {catalogue.plans.map((plan) => {
          const price = plan.prices[lengthId];
          const lines = featureLines(plan.features).slice(0, compact ? 5 : undefined);
          const months = length ? length.days / 30 : 1;
          return (
            <article key={plan.id} className={`ps-plan ${plan.featured ? 'featured' : ''}`}>
              {plan.featured ? <span className="ps-plan-flag">Most chosen</span> : null}
              <h3>{plan.name}</h3>
              {plan.blurb ? <p className="ps-plan-blurb">{plan.blurb}</p> : null}
              <p className="ps-plan-price">
                {plan.kind === 'free' ? (
                  <>
                    <strong>₦0</strong> <span>for as long as you like</span>
                  </>
                ) : price !== undefined ? (
                  <>
                    <strong>{naira(price)}</strong> <span>for {length?.label.toLowerCase()}</span>
                    {months > 1.5 ? <small>About {naira(Math.round(price / months / 100) * 100)} a month</small> : null}
                  </>
                ) : (
                  <span>Not sold for {length?.label.toLowerCase()}</span>
                )}
              </p>
              <ul>
                {lines.map((line) => (
                  <li key={line.text} className={line.on ? 'on' : 'off'}>
                    {line.on ? <IconCheck size={16} /> : <IconClose size={16} />}
                    {line.text}
                  </li>
                ))}
              </ul>
              <Link to={go} className={`sj-btn ${plan.featured ? '' : 'ghost'} ps-plan-go`}>
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
