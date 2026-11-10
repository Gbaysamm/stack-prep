/**
 * The public site's other pages: How it works, Pricing, About and Contact. Each opens with the
 * hero band (SiteShell.tsx) and says only what the app does; the plans are the admin's, and
 * the question bank is "thousands of questions", never a count or years (siteData.ts).
 */
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { friendly } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import {
  IconArrowRight,
  IconBook,
  IconCheck,
  IconFlag,
  IconHelp as IconHelpCircle,
  IconLock,
  IconMail,
  IconReplay,
  IconSend,
  IconSparkles,
  IconTarget,
  IconVolume,
} from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { SUPPORT_TOPICS, supportApi, type SupportTopic } from '../prep/supportApi.js';
import { FaqList, SITE_FAQ } from './Faq.js';
import { FinalCall, TourRows } from './Landing.js';
import { LessonPlayer } from './LessonPlayer.js';
import { BoardCollageArt, KeyVersusLesson, PlanStackArt, SupportArt } from './Art.js';
import { PlanGrid, PlanTable, hasPaidPlans } from './PlanGrid.js';
import { SiteHero, SiteShell, useSiteSettings, useSiteTitle } from './SiteShell.js';
import { useCatalogue, useSite } from './siteData.js';

function Head({ eyebrow, title, sub, center = false }: { eyebrow: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`ld-head ${center ? 'center' : ''}`}>
      <span className="ps-eyebrow">{eyebrow}</span>
      <h2 className="sj-display">{title}</h2>
      {sub ? <p className="ld-head-sub">{sub}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ how it works */

const LESSON_POINTS = [
  { icon: IconSparkles, title: 'Written by hand, as it’s said', body: 'Each step appears on the board as the coach says it, in handwriting, with highlights and arrows.' },
  { icon: IconVolume, title: 'Out loud, with captions', body: 'The coach explains every step aloud; every word is also on screen, so it works with the sound off too.' },
  { icon: IconBook, title: 'Drawings that make it click', body: 'Sketches, diagrams and marks on the passage show the idea, not just the sums.' },
  { icon: IconReplay, title: 'At your pace', body: 'Pause, replay a step, move on when you’re ready, or change the speed.' },
];

export function HowItWorksPage() {
  useSiteTitle('How it works');
  return (
    <SiteShell
      hero={
        <SiteHero
          eyebrow="How it works"
          title={
            <>
              From “where am I?” to <em>a higher score</em>
            </>
          }
          sub="A check-up shows where you stand. Practice works on what holds you back. When you miss a question, the coach teaches it to you on the board. Mocks get you ready for the day."
          art={
            <figure className="ld-hero-board">
              <div className="ld-board-frame">
                <div className="lp-bar" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <img
                  src="/showcase/m97_35.jpg"
                  alt="A trigonometry lesson on the board, with the working written out and a sketch of the building."
                  width={1440}
                  height={900}
                  decoding="async"
                />
              </div>
            </figure>
          }
        />
      }
    >
      <section className="ld-strip hw-facts" aria-label="In numbers">
        {[
          { big: '~15', small: 'questions in a check-up, no time limit' },
          { big: '7 days', small: 'between check-ups, to see your score move' },
          { big: '2 misses', small: 'and the coach teaches it on the board' },
          { big: '180 in 2h', small: 'a Real UTME mock, like the exam' },
        ].map((fact) => (
          <span key={fact.big}>
            <strong>{fact.big}</strong>
            {fact.small}
          </span>
        ))}
      </section>
      <section className="ld-section" aria-labelledby="hw-lesson">
        <Head
          eyebrow="The lesson"
          title="Every question comes with a lesson"
          sub="Miss a question twice, or get one right by guessing, and the coach works it through with you on the board. This is a real one."
        />
        <div className="hw-lesson">
          <LessonPlayer />
          <div className="hw-points">
            {LESSON_POINTS.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <span className="ld-badge yellow" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="ld-section" aria-label="The parts of Stack Prep">
        <Head eyebrow="Step by step" title="Five parts that work together" center />
        <TourRows />
      </section>
      <FinalCall title="See your own score." />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ pricing */

const EVERY_PLAN = [
  { icon: IconBook, tint: 0, title: 'Every subject', body: 'All the subjects and every past question, on every plan.' },
  { icon: IconTarget, tint: 1, title: 'Check-ups', body: 'Your score in every topic, and your predicted score.' },
  { icon: IconCheck, tint: 2, title: 'The checked working', body: 'The full worked solution to every question.' },
  { icon: IconSparkles, tint: 3, title: 'Progress and guides', body: 'Your progress, bookmarks, and every number explained.' },
];

export function PricingPage() {
  useSiteTitle('Pricing');
  const { catalogue, failed } = useCatalogue();
  const paying = SITE_FAQ.find((group) => group.id === 'paying')!.items;
  return (
    <SiteShell
      hero={
        <SiteHero
          eyebrow="Pricing"
          title={
            <>
              Start free. <em>Pay when you want more.</em>
            </>
          }
          sub="Every plan has the same questions, check-ups and checked working. Paid plans give you more each day: more practice, more mocks, lessons out loud and the coach."
          art={<PlanStackArt catalogue={catalogue} />}
        >
          <ul className="hero-points">
            <li>
              <IconCheck size={16} /> Pay once, for a set length
            </li>
            <li>
              <IconCheck size={16} /> Nothing renews by itself
            </li>
          </ul>
        </SiteHero>
      }
    >
      <section className="band tint first" aria-labelledby="pr-plans">
        <div className="ld-head center">
          <span className="ps-eyebrow">The plans</span>
          <h2 id="pr-plans" className="sj-display">
            {catalogue && !hasPaidPlans(catalogue) ? 'Start today, free' : 'Choose how long, then choose your plan'}
          </h2>
        </div>
        {catalogue ? (
          <PlanGrid catalogue={catalogue} />
        ) : (
          <p className="ps-muted">{failed ? 'We couldn’t load the plans just now. Please try again in a moment.' : 'Loading the plans…'}</p>
        )}
      </section>

      <section className="ld-section" aria-labelledby="pr-every">
        <div className="ld-head center">
          <span className="ps-eyebrow">In every plan, free included</span>
          <h2 id="pr-every" className="sj-display">
            The things that matter most are never locked
          </h2>
        </div>
        <div className="tile-grid">
          {EVERY_PLAN.map(({ icon: Icon, tint, title, body }) => (
            <article key={title} className={`tile t${tint}`}>
              <span className="tile-icon" aria-hidden="true">
                <Icon size={24} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      {catalogue && catalogue.plans.length > 1 ? (
        <section className="ld-section" aria-labelledby="pr-compare">
          <div className="ld-head">
            <span className="ps-eyebrow">Side by side</span>
            <h2 id="pr-compare" className="sj-display">
              Compare every plan
            </h2>
          </div>
          <PlanTable catalogue={catalogue} />
        </section>
      ) : null}

      <section className="ld-section ps-split" aria-labelledby="ps-pay-faq">
        <div className="split-side">
          <span className="ps-eyebrow">Paying</span>
          <h2 id="ps-pay-faq" className="sj-display">
            Questions about paying
          </h2>
          <p className="ps-muted">Payments go through Paystack: your card details never touch us.</p>
          <div className="pay-badges" aria-hidden="true">
            <span>
              <IconLock size={16} /> Paystack
            </span>
            <span>₦ Naira prices</span>
            <span>
              <IconReplay size={16} /> No auto-renew
            </span>
          </div>
        </div>
        <FaqList items={paying} />
      </section>

      <FinalCall title="Start free today." sub="No card needed. Choose a plan only when you want more." />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ about */

const BELIEFS = [
  {
    icon: IconCheck,
    title: 'Always the right answer',
    body: 'A student who practises a wrong answer learns it. So every question has checked working, and a report from any student gets the question fixed for everyone.',
  },
  {
    icon: IconTarget,
    title: 'An honest score',
    body: 'A score that flatters you doesn’t help on exam day. Yours counts only what you got right on your own, and says how it was worked out.',
  },
  {
    icon: IconVolume,
    title: 'Teach, don’t just mark',
    body: 'Knowing you got it wrong isn’t enough. The coach shows you the exact step where it went wrong, and explains it until it makes sense.',
  },
  {
    icon: IconBook,
    title: 'Made for here',
    body: 'Built for the UTME and for Nigerian candidates: the syllabus, real past papers, naira prices, and a phone in your hand.',
  },
];

const CHECKED = [
  { icon: IconBook, title: 'From the real paper', body: 'Each question comes from a UTME paper and keeps its year. A broken one is rebuilt on the same idea.' },
  { icon: IconSparkles, title: 'Worked through', body: 'Every question gets a full worked solution and a lesson, step by step.' },
  { icon: IconCheck, title: 'Checked by people', body: 'Reviewers check the answer and the working before the question goes live.' },
  { icon: IconFlag, title: 'Fixed for everyone', body: 'Any student can report a question. A person looks at every report and fixes it.' },
];

export function AboutPage() {
  useSiteTitle('About');
  const site = useSite();
  return (
    <SiteShell
      hero={
        <SiteHero
          eyebrow="About Stack Prep"
          title={
            <>
              Every candidate deserves <em>a good teacher.</em>
            </>
          }
          sub="Stack Prep is made by StackJunior to give every UTME candidate what the best-prepared ones have: a clear picture of where they stand, and someone to explain what they got wrong."
          art={<BoardCollageArt />}
        />
      }
    >
      <section className="stat-strip first" aria-label="Stack Prep in figures">
        {[
          { big: 'Thousands', small: 'of real UTME past questions' },
          { big: String(site?.subjects.length || 10), small: 'UTME subjects' },
          { big: `${site?.worked_percent ?? 100}%`, small: 'with checked worked solutions' },
          { big: '1', small: 'lesson for every question' },
        ].map((item) => (
          <div key={item.small}>
            <strong>{item.big}</strong>
            <span>{item.small}</span>
          </div>
        ))}
      </section>

      <section className="ld-section ab-why">
        <div>
          <span className="ps-eyebrow">Why we built it</span>
          <h2 className="sj-display">A mark tells you that you’re wrong. A teacher tells you why.</h2>
          <div className="ab-why-text">
            <p>
              Most candidates prepare with past questions and an answer key. When they get one wrong, they see the right
              letter and move on, often still not knowing why. In a big class there isn’t time to go through every question
              with every student.
            </p>
            <p>
              Stack Prep gives every question its own lesson, and a coach who answers when you’re stuck. It finds the topics
              pulling your score down and keeps you on them until they come right.
            </p>
          </div>
        </div>
        <KeyVersusLesson />
      </section>

      <section className="ld-section" aria-labelledby="ab-believe">
        <div className="ld-head center">
          <span className="ps-eyebrow">What we believe</span>
          <h2 id="ab-believe" className="sj-display">
            Four things we won’t compromise on
          </h2>
        </div>
        <div className="belief-grid">
          {BELIEFS.map(({ icon: Icon, title, body }, index) => (
            <article key={title} className={`belief t${index}`}>
              <span className="belief-icon" aria-hidden="true">
                <Icon size={26} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band dark ld-section" aria-labelledby="ab-checked">
        <div className="ld-head center">
          <span className="ps-eyebrow light">The question bank</span>
          <h2 id="ab-checked" className="sj-display">
            How every answer is checked
          </h2>
        </div>
        <ol className="flow">
          {CHECKED.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <span className="flow-n">
                <Icon size={22} />
                <i>{index + 1}</i>
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {site && site.subjects.length > 0 ? (
        <section className="ld-section ab-subjects" aria-labelledby="ab-subjects">
          <div className="ld-head center">
            <span className="ps-eyebrow">Subjects</span>
            <h2 id="ab-subjects" className="sj-display">
              {site.subjects.length} UTME subjects, one place
            </h2>
          </div>
          <ul>
            {site.subjects.map((subject, index) => (
              <li key={subject.name}>
                <span className={`ps-letter t${index % 6}`} aria-hidden="true">
                  {subject.name.slice(0, 1)}
                </span>
                {subject.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <FinalCall title="Try it for yourself." sub="Start free, and see where you stand in about 15 questions." />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ contact */

export function ContactPage() {
  useSiteTitle('Contact');
  const settings = useSiteSettings();
  const { identity } = useIdentity();
  const ids = useId();
  const [form, setForm] = useState({ name: '', email: '', subject: '', body: '', website: '' });
  const [topic, setTopic] = useState<SupportTopic | ''>('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => {
    setForm((now) => ({ ...now, [key]: value }));
    setProblem(null);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return setProblem('Add your name and your email, so we can reply.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setProblem('That email address doesn’t look right.');
    if (!topic) return setProblem('Choose what it’s about.');
    if (!form.subject.trim() || !form.body.trim()) return setProblem('Add a short title and your message.');
    setBusy(true);
    supportApi
      .contact({
        name: form.name.trim(),
        email: form.email.trim(),
        topic,
        subject: form.subject.trim(),
        body: form.body.trim(),
        website: form.website,
      })
      .then(() => setSent(true))
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };

  const whatsapp = settings?.support_whatsapp ? settings.support_whatsapp.replace(/[^0-9]/g, '') : '';

  return (
    <SiteShell
      hero={
        <SiteHero
          tall
          eyebrow="Contact"
          title={
            <>
              Talk to <em>a person.</em>
            </>
          }
          sub="A question before you sign up, something about your plan, or something not working: write to us and a person replies, usually within a day."
          art={<SupportArt />}
        />
      }
    >
      <div className="ct-layout">
        {sent ? (
          <div className="ps-card ps-sent lifted" role="status">
            <span className="tile-icon t1" aria-hidden="true">
              <IconCheck size={28} />
            </span>
            <h2 className="sj-display">Thank you, {form.name.trim().split(' ')[0]}</h2>
            <p>We’ve got your message and will reply to {form.email.trim()}.</p>
            <Link to="/faq" className="ps-textlink">
              Meanwhile, the FAQ <IconArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <form className="ps-card ps-form lifted" onSubmit={send} noValidate>
            <div className="ct-form-head">
              <span className="tile-icon t0" aria-hidden="true">
                <IconMail size={22} />
              </span>
              <div>
                <h2 className="sj-display ps-form-title">Send us a message</h2>
                <p className="ps-muted">We reply to the email you give.</p>
              </div>
            </div>
            <div className="ps-form-two">
              <div className="sj-field">
                <label htmlFor={`${ids}-name`}>Your name</label>
                <input id={`${ids}-name`} className="sj-input" maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="sj-field">
                <label htmlFor={`${ids}-email`}>Your email</label>
                <input
                  id={`${ids}-email`}
                  className="sj-input"
                  type="email"
                  inputMode="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
            </div>
            <div className="ps-form-two">
              <div className="sj-field">
                <label htmlFor={`${ids}-topic`}>What is it about?</label>
                <Select
                  id={`${ids}-topic`}
                  value={topic}
                  placeholder="Choose one"
                  onChange={(value) => {
                    setTopic(value as SupportTopic);
                    setProblem(null);
                  }}
                  options={SUPPORT_TOPICS}
                />
              </div>
              <div className="sj-field">
                <label htmlFor={`${ids}-subject`}>Title</label>
                <input id={`${ids}-subject`} className="sj-input" maxLength={120} value={form.subject} onChange={(e) => set('subject', e.target.value)} />
              </div>
            </div>
            <div className="sj-field">
              <label htmlFor={`${ids}-body`}>Your message</label>
              <textarea
                id={`${ids}-body`}
                className="sj-input ps-textarea"
                rows={7}
                maxLength={4000}
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
              />
            </div>
            {/* People never see this; a robot fills it in. */}
            <input
              className="ps-honey"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="website"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
            {problem ? (
              <p className="ps-error" role="alert">
                {problem}
              </p>
            ) : null}
            <button type="submit" className="sj-btn ps-send" disabled={busy}>
              <IconSend size={18} /> {busy ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
        <aside className="ct-side">
          {identity ? (
            <Link to="/help" className="way good">
              <span className="tile-icon t1" aria-hidden="true">
                <IconSparkles size={22} />
              </span>
              <span>
                <strong>Already a student?</strong>
                <small>Write from Help & guides: the reply comes there, with the whole conversation.</small>
              </span>
              <IconArrowRight size={18} />
            </Link>
          ) : null}
          {settings?.support_email ? (
            <a href={`mailto:${settings.support_email}`} className="way">
              <span className="tile-icon t0" aria-hidden="true">
                <IconMail size={22} />
              </span>
              <span>
                <strong>Email</strong>
                <small>{settings.support_email}</small>
              </span>
              <IconArrowRight size={18} />
            </a>
          ) : null}
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="way">
              <span className="tile-icon t1" aria-hidden="true">
                <IconSend size={22} />
              </span>
              <span>
                <strong>WhatsApp</strong>
                <small>{settings?.support_whatsapp}</small>
              </span>
              <IconArrowRight size={18} />
            </a>
          ) : null}
          <Link to="/faq" className="way">
            <span className="tile-icon t3" aria-hidden="true">
              <IconHelpCircle size={22} />
            </span>
            <span>
              <strong>Quick answers</strong>
              <small>Plans, payments, accounts and the score, in the FAQ.</small>
            </span>
            <IconArrowRight size={18} />
          </Link>
        </aside>
      </div>
    </SiteShell>
  );
}
