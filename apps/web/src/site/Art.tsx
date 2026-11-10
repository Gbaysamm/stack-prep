/**
 * Layered pictures for the public pages' heroes and sections: cards stacked at angles, real
 * lesson boards in a collage, a conversation, so the pages have depth rather than flat text.
 * All decorative (aria-hidden); what they show is how the app looks and what it does.
 */
import { featureLines, naira, type Catalogue, type Plan } from '../prep/billingApi.js';
import { IconCheck, IconFlag, IconLock, IconMail, IconSend, IconSparkles } from '../prep/icons.js';

/** Pricing: the Free plan behind, the featured plan in front (both live), and a payment going through. */
export function PlanStackArt({ catalogue }: { catalogue: Catalogue | null }) {
  const free = catalogue?.plans.find((plan) => plan.kind === 'free');
  const paid = catalogue?.plans.filter((plan) => plan.kind === 'paid') ?? [];
  const front = paid.find((plan) => plan.featured) ?? paid[0];
  const length = catalogue?.lengths[0];
  const price = front && length ? front.prices[length.id] : undefined;
  const lines = (plan: Plan | undefined) => (plan ? featureLines(plan.features).slice(0, 3) : []);
  return (
    <div className="art art-plans" aria-hidden="true">
      <div className="art-card art-plan back">
        <span className="art-eyebrow">{free?.name ?? 'Free'}</span>
        <strong className="art-price">₦0</strong>
        {lines(free).map((line) => (
          <span key={line.text} className={`art-line ${line.on ? 'on' : 'off'}`}>
            {line.text}
          </span>
        ))}
      </div>
      {front ? (
        <div className="art-front">
          <div className="art-card art-plan front">
            {front.featured ? <span className="art-flag">Most chosen</span> : null}
            <span className="art-eyebrow light">
              {front.name}
              {length ? ` · ${length.label}` : ''}
            </span>
            <strong className="art-price light">{price !== undefined ? naira(price) : front.name}</strong>
            {lines(front).map((line) => (
              <span key={line.text} className={`art-line light ${line.on ? 'on' : 'off'}`}>
                {line.text}
              </span>
            ))}
            <span className="art-cta">Choose {front.name}</span>
          </div>
          {/* Pinned to the plan card itself: its payment going through, and who takes it. */}
          <div className="art-chip">
            <IconLock size={14} /> Paid with Paystack
          </div>
          <div className="art-toast">
            <span className="art-dot green">
              <IconCheck size={16} />
            </span>
            <span>
              <strong>Payment received</strong>
              <small>Your plan starts straight away</small>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** About: three real lessons on the board, fanned out. */
export function BoardCollageArt() {
  return (
    <div className="art art-collage" aria-hidden="true">
      {['e14_7d', 'm97_35', '11'].map((id, index) => (
        <figure key={id} className={`art-board b${index}`}>
          <div className="art-board-bar">
            <i />
            <i />
            <i />
          </div>
          <img src={`/showcase/${id}.jpg`} alt="" loading="lazy" decoding="async" />
        </figure>
      ))}
      <div className="art-chip pink">
        <IconSparkles size={14} /> A lesson for every question
      </div>
    </div>
  );
}

/** FAQ: a student's question and Stack Prep's answer. */
export function QuestionStackArt() {
  return (
    <div className="art art-chat" aria-hidden="true">
      <div className="art-bubble me">
        <span className="art-avatar purple">A</span>
        <p>Will I be charged again automatically?</p>
      </div>
      <div className="art-bubble them">
        <span className="art-avatar brand">
          <img src="/brand/mark-96.png" alt="" width={22} height={22} />
        </span>
        <p>
          No. You pay once for a set length. Nothing is taken again; when it ends, you choose whether to buy more.
        </p>
      </div>
      <div className="art-bubble me small">
        <span className="art-avatar green">T</span>
        <p>Are these real past questions?</p>
      </div>
      <div className="art-chip">
        <IconCheck size={14} /> Straight answers
      </div>
    </div>
  );
}

/** Contact: a student's message and a person's reply, and the ways to write in. */
export function SupportArt() {
  return (
    <div className="art art-support" aria-hidden="true">
      <div className="art-card art-thread">
        <div className="art-thread-head">
          <span className="art-avatar purple">A</span>
          <span>
            <strong>Ada</strong>
            <small>Payments and plans</small>
          </span>
          <span className="art-status">Replied</span>
        </div>
        <p className="art-msg them">I paid this morning but my plan hasn’t started.</p>
        <p className="art-msg us">Sorted, Ada: your plan is on now. Thanks for telling us.</p>
      </div>
      <div className="art-ways">
        <span>
          <IconMail size={16} /> Email
        </span>
        <span>
          <IconSend size={16} /> WhatsApp
        </span>
        <span>
          <IconCheck size={16} /> The form
        </span>
      </div>
    </div>
  );
}

/** About: what a candidate usually gets (an answer key) beside what Stack Prep gives (a lesson). */
export function KeyVersusLesson() {
  return (
    <div className="kvl" aria-hidden="true">
      <div className="kvl-side key">
        <span className="kvl-tag">
          <IconFlag size={14} /> The usual way
        </span>
        <div className="kvl-key">
          {['31. B', '32. D', '33. A', '34. C', '35. B'].map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <p>A letter. No reason why.</p>
      </div>
      <div className="kvl-side lesson">
        <span className="kvl-tag good">
          <IconSparkles size={14} /> With Stack Prep
        </span>
        <img src="/showcase/m97_35.jpg" alt="" loading="lazy" decoding="async" />
        <p>Every step, written out and explained.</p>
      </div>
    </div>
  );
}
