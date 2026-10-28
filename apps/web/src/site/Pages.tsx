/**
 * The public site's other pages: How it works, Pricing, About and Contact. Each says only what
 * the app does; the numbers are counted live (siteData.ts) and the plans are the admin's.
 */
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { friendly } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconChart,
  IconCheck,
  IconClock,
  IconMail,
  IconSend,
  IconTarget,
  IconVolume,
} from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { SUPPORT_TOPICS, supportApi, type SupportTopic } from '../prep/supportApi.js';
import { FaqList, SITE_FAQ } from './Faq.js';
import { PlanGrid } from './PlanGrid.js';
import { SIGN_UP, SiteShell, useSiteSettings, useSiteTitle } from './SiteShell.js';
import { roughly, useCatalogue, useSite, yearsOf } from './siteData.js';

function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <section className="ps-page-head">
      <span className="ps-eyebrow">{eyebrow}</span>
      <h1 className="sj-display">{title}</h1>
      <p>{sub}</p>
    </section>
  );
}

function Final({ title, sub }: { title: string; sub: string }) {
  const { identity } = useIdentity();
  return (
    <section className="ps-final">
      <div>
        <h2 className="sj-display">{title}</h2>
        <p>{sub}</p>
      </div>
      <Link to={identity ? '/home' : SIGN_UP} className="sj-btn ps-cta big">
        {identity ? 'Open the app' : 'Start free'} <IconArrowRight size={18} />
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ how it works */

const PARTS = [
  {
    icon: IconTarget,
    tint: 'lime',
    title: 'The check-up: where you stand',
    lines: [
      'About 15 questions from across the subject, with no help and no time limit.',
      'They get harder or easier to match you, so it doesn’t take long to find your level.',
      'You get a score for every topic, and a predicted score for the exam.',
      'A new check-up is due every 7 days. It’s how your predicted score moves.',
    ],
  },
  {
    icon: IconBolt,
    tint: 'pink',
    title: 'Practice: work on what holds you back',
    lines: [
      'Questions come from your weakest topics first.',
      'Not sure? Take a hint, or say you’re guessing. Only answers you got right on your own count toward your score.',
      'A question you got wrong comes back in a later run, until you get it right.',
      'Choose your own topics and years, or revise the questions you bookmarked.',
    ],
  },
  {
    icon: IconVolume,
    tint: 'yellow',
    title: 'The board: learn the step you missed',
    lines: [
      'Miss a question twice and the coach takes you to the board.',
      'It works the question through step by step, out loud, with every word written on screen.',
      'The working is the checked solution, not something made up on the spot.',
      'Ask about any step, by typing or speaking, and it explains that step again another way.',
    ],
  },
  {
    icon: IconClock,
    tint: 'blue',
    title: 'Mock exams: the real thing, before the real thing',
    lines: [
      'The UTME: Use of English and three subjects, 180 questions in two hours.',
      'One question at a time, a question palette and a timer, like the exam.',
      'Leaving the test is noted, so your result is a fair one.',
      'Afterwards, every question with your answer, the right answer and the working.',
    ],
  },
  {
    icon: IconChart,
    tint: 'purple',
    title: 'Progress: see it move',
    lines: [
      'Your score in each subject and topic, and how far you are from your target.',
      'A countdown to your exam date, and a day streak to keep you going.',
      'Every number in the app explained, with a worked example, in Help & guides.',
    ],
  },
] as const;

export function HowItWorksPage() {
  useSiteTitle('How it works');
  return (
    <SiteShell>
      <PageHead
        eyebrow="How it works"
        title="From “where am I?” to a higher score"
        sub="Five parts that work together. Here is what each one does, and why."
      />
      <div className="ps-parts">
        {PARTS.map(({ icon: Icon, tint, title, lines }, index) => (
          <section key={title} className="ps-part">
            <span className={`ps-step-icon ${tint}`} aria-hidden="true">
              <Icon size={22} />
            </span>
            <div>
              <span className="ps-step-n">{String(index + 1).padStart(2, '0')}</span>
              <h2 className="sj-display">{title}</h2>
              <ul>
                {lines.map((line) => (
                  <li key={line}>
                    <IconCheck size={16} />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
      <Final title="See your own score" sub="Your first check-up is about 15 questions, with no time limit. It’s free." />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ pricing */

export function PricingPage() {
  useSiteTitle('Pricing');
  const { catalogue, failed } = useCatalogue();
  const paying = SITE_FAQ.find((group) => group.id === 'paying')!.items;
  return (
    <SiteShell>
      <PageHead
        eyebrow="Pricing"
        title="Start free. Pay when you want more."
        sub="Every plan has the same questions, check-ups and checked working. Paid plans give you more each day."
      />
      {catalogue ? (
        <PlanGrid catalogue={catalogue} />
      ) : (
        <p className="ps-muted">{failed ? 'We couldn’t load the plans just now. Please try again in a moment.' : 'Loading the plans…'}</p>
      )}
      <section className="ps-section ps-split" aria-labelledby="ps-pay-faq">
        <div>
          <span className="ps-eyebrow">Paying</span>
          <h2 id="ps-pay-faq" className="sj-display">
            Simple, one-off payments
          </h2>
          <p className="ps-muted">You pay once for a set length. Nothing renews by itself, and Paystack handles your card.</p>
        </div>
        <FaqList items={paying} />
      </section>
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

export function AboutPage() {
  useSiteTitle('About');
  const site = useSite();
  return (
    <SiteShell>
      <PageHead
        eyebrow="About"
        title="Every candidate deserves a good teacher"
        sub="Stack Prep is made by StackJunior to give every UTME candidate what the best-prepared ones have: a clear picture of where they stand, and someone to explain what they got wrong."
      />
      <section className="ps-section ps-band" aria-labelledby="ps-believe">
        <div className="ps-head">
          <span className="ps-eyebrow">What we believe</span>
          <h2 id="ps-believe" className="sj-display">Four things we won’t compromise on</h2>
        </div>
        <div className="ps-reasons">
          {BELIEFS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="ps-reason">
              <span className="ps-reason-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      {site && site.subjects.length > 0 ? (
        <section className="ps-section" aria-labelledby="ps-bank">
          <div className="ps-head">
            <span className="ps-eyebrow">The question bank</span>
            <h2 id="ps-bank" className="sj-display">
              {roughly(site.questions)} real UTME questions, {site.worked_percent}% with worked solutions
            </h2>
          </div>
          <div className="ps-bank">
            {site.subjects.map((subject) => (
              <div key={subject.name} className="ps-bank-row">
                <strong>{subject.name}</strong>
                <span>{subject.questions.toLocaleString('en-NG')} questions</span>
                <span className="ps-muted">{yearsOf(subject)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <Final title="Try it for yourself" sub="Start free, and see where you stand in about 15 questions." />
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

  return (
    <SiteShell>
      <PageHead
        eyebrow="Contact"
        title="Talk to a person"
        sub="A question before you sign up, a school or a partnership, or something not working: write to us and a person replies, usually within a day."
      />
      <div className="ps-contact">
        {sent ? (
          <div className="ps-card ps-sent" role="status">
            <span className="ps-reason-icon" aria-hidden="true">
              <IconCheck size={22} />
            </span>
            <h2 className="sj-display">Thank you, {form.name.trim().split(' ')[0]}</h2>
            <p>We’ve got your message and will reply to {form.email.trim()}.</p>
          </div>
        ) : (
          <form className="ps-card ps-form" onSubmit={send} noValidate>
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
            <div className="sj-field">
              <label htmlFor={`${ids}-body`}>Your message</label>
              <textarea
                id={`${ids}-body`}
                className="sj-input ps-textarea"
                rows={6}
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
              <IconSend size={18} /> {busy ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
        <aside className="ps-contact-side">
          {identity ? (
            <div className="ps-card ps-side-card good">
              <h3>Already a student?</h3>
              <p>Write from Help & guides in the app: your reply comes there, with the whole conversation.</p>
              <Link to="/help" className="ps-textlink">
                Open Help & guides <IconArrowRight size={16} />
              </Link>
            </div>
          ) : null}
          <div className="ps-card ps-side-card">
            <h3>Other ways to reach us</h3>
            {settings?.support_email || settings?.support_whatsapp ? (
              <ul className="ps-ways">
                {settings.support_email ? (
                  <li>
                    <IconMail size={18} />
                    <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a>
                  </li>
                ) : null}
                {settings.support_whatsapp ? (
                  <li>
                    <IconSend size={18} />
                    <a href={`https://wa.me/${settings.support_whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                      WhatsApp {settings.support_whatsapp}
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p>This form reaches the whole team.</p>
            )}
          </div>
          <div className="ps-card ps-side-card">
            <h3>Schools and lesson centres</h3>
            <p>Preparing a class for the UTME? Tell us about your students and how many there are, and we’ll talk about what would work for you.</p>
          </div>
          <div className="ps-card ps-side-card">
            <h3>Quick answers</h3>
            <p>Plans, payments, accounts and how the score works are in the FAQ.</p>
            <Link to="/faq" className="ps-textlink">
              Read the FAQ <IconArrowRight size={16} />
            </Link>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
