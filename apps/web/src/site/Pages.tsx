/**
 * The public site's other pages: How it works, Pricing, About and Contact. Each opens with the
 * hero band (SiteShell.tsx) and says only what the app does; the plans are the admin's, and
 * the only number about the question bank is the rounded total (siteData.ts).
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
  IconLock,
  IconMail,
  IconPause,
  IconReplay,
  IconSend,
  IconSparkles,
  IconTarget,
  IconUser,
  IconVolume,
} from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { SUPPORT_TOPICS, supportApi, type SupportTopic } from '../prep/supportApi.js';
import { FaqList, SITE_FAQ } from './Faq.js';
import { FinalCall, TourRows } from './Landing.js';
import { LessonPlayer } from './LessonPlayer.js';
import { PlanGrid } from './PlanGrid.js';
import { SiteHero, SiteShell, useSiteSettings, useSiteTitle } from './SiteShell.js';
import { questionsWord, useCatalogue, useSite } from './siteData.js';

/** Figures on a hero's right: big words with a line each, on glass. */
function Facts({ items }: { items: { big: string; small: string }[] }) {
  return (
    <div className="ps-facts">
      {items.map((item) => (
        <div key={item.small}>
          <strong>{item.big}</strong>
          <span>{item.small}</span>
        </div>
      ))}
    </div>
  );
}

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
            <Facts
              items={[
                { big: '~15', small: 'questions in a check-up, no time limit' },
                { big: '7 days', small: 'between check-ups, to see your score move' },
                { big: '2 misses', small: 'and the coach takes you to the board' },
                { big: '180 · 2h', small: 'questions and hours in a Real UTME mock' },
              ]}
            />
          }
        />
      }
    >
      <section className="ld-section first" aria-labelledby="hw-lesson">
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
  'Every subject and every past question',
  'Check-ups and your predicted score',
  'The full checked working for every question',
  'Progress, bookmarks and Help & guides',
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
          art={
            <div className="ps-promises">
              {[
                { icon: IconCheck, text: 'Pay once for a set length' },
                { icon: IconReplay, text: 'Nothing renews by itself' },
                { icon: IconLock, text: 'Paystack handles your card' },
              ].map(({ icon: Icon, text }) => (
                <span key={text}>
                  <Icon size={18} /> {text}
                </span>
              ))}
            </div>
          }
        />
      }
    >
      <section className="ld-section first" aria-label="The plans">
        {catalogue ? (
          <PlanGrid catalogue={catalogue} />
        ) : (
          <p className="ps-muted">{failed ? 'We couldn’t load the plans just now. Please try again in a moment.' : 'Loading the plans…'}</p>
        )}
      </section>
      <section className="ld-section pr-every" aria-labelledby="pr-every">
        <div>
          <span className="ps-eyebrow">In every plan, free included</span>
          <h2 id="pr-every" className="sj-display">
            The things that matter most are never locked
          </h2>
        </div>
        <ul>
          {EVERY_PLAN.map((item) => (
            <li key={item}>
              <IconCheck size={18} />
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="ld-section ps-split" aria-labelledby="ps-pay-faq">
        <div>
          <span className="ps-eyebrow">Paying</span>
          <h2 id="ps-pay-faq" className="sj-display">
            Questions about paying
          </h2>
          <p className="ps-muted">Can’t find your answer? A person reads every message.</p>
          <Link to="/contact" className="ps-textlink">
            Contact us <IconArrowRight size={16} />
          </Link>
        </div>
        <FaqList items={paying} />
      </section>
      <section className="ld-section pr-schools">
        <span className="ps-letter t2" aria-hidden="true">
          <IconUser size={22} />
        </span>
        <div>
          <h2 className="sj-display">For schools and lesson centres</h2>
          <p>Preparing a class for the UTME? Tell us about your students and we’ll talk about what would work for you.</p>
        </div>
        <Link to="/contact" className="sj-btn ghost">
          Talk to us
        </Link>
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
          art={
            <Facts
              items={[
                { big: questionsWord(site), small: 'real UTME past questions' },
                { big: String(site?.subjects.length || 10), small: 'UTME subjects' },
                { big: `${site?.worked_percent ?? 100}%`, small: 'with checked worked solutions' },
                { big: '1', small: 'lesson for every question' },
              ]}
            />
          }
        />
      }
    >
      <section className="ld-section first ab-why">
        <div>
          <span className="ps-eyebrow">Why we built it</span>
          <h2 className="sj-display">A mark tells you that you’re wrong. A teacher tells you why.</h2>
        </div>
        <div className="ab-why-text">
          <p>
            Most candidates prepare with past questions and an answer key. When they get one wrong, they see the right letter
            and move on, often still not knowing why. In a big class there isn’t time to go through every question with every
            student.
          </p>
          <p>
            Stack Prep gives every question its own lesson, and a coach who answers when you’re stuck. It finds the topics
            pulling your score down and keeps you on them until they come right.
          </p>
        </div>
      </section>
      <section className="ld-section ld-more" aria-labelledby="ab-believe">
        <Head eyebrow="What we believe" title="Four things we won’t compromise on" />
        <div className="ld-more-grid four">
          {BELIEFS.map(({ icon: Icon, title, body }, index) => (
            <article key={title}>
              <span className={`ps-letter t${index}`} aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="ld-section" aria-labelledby="ab-checked">
        <Head eyebrow="The question bank" title="How every answer is checked" center />
        <ol className="ab-steps">
          {CHECKED.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <span className="ab-step-n">{String(index + 1).padStart(2, '0')}</span>
              <span className={`ps-letter t${index}`} aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
      {site && site.subjects.length > 0 ? (
        <section className="ld-section ab-subjects" aria-labelledby="ab-subjects">
          <Head eyebrow="Subjects" title={`${site.subjects.length} UTME subjects`} />
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

  const ways = (
    <div className="ps-promises">
      {settings?.support_email ? (
        <a href={`mailto:${settings.support_email}`}>
          <IconMail size={18} /> {settings.support_email}
        </a>
      ) : null}
      {settings?.support_whatsapp ? (
        <a href={`https://wa.me/${settings.support_whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
          <IconSend size={18} /> WhatsApp {settings.support_whatsapp}
        </a>
      ) : null}
      <span>
        <IconPause size={18} /> Usually a reply within a day
      </span>
    </div>
  );

  return (
    <SiteShell
      hero={
        <SiteHero
          eyebrow="Contact"
          title={
            <>
              Talk to <em>a person.</em>
            </>
          }
          sub="A question before you sign up, a school or a partnership, or something not working: write to us and a person replies."
          art={ways}
        />
      }
    >
      <div className="ps-contact first">
        {sent ? (
          <div className="ps-card ps-sent" role="status">
            <span className="ps-letter t1" aria-hidden="true">
              <IconCheck size={22} />
            </span>
            <h2 className="sj-display">Thank you, {form.name.trim().split(' ')[0]}</h2>
            <p>We’ve got your message and will reply to {form.email.trim()}.</p>
          </div>
        ) : (
          <form className="ps-card ps-form" onSubmit={send} noValidate>
            <div>
              <h2 className="sj-display ps-form-title">Send us a message</h2>
              <p className="ps-muted">All fields are needed so we can reply.</p>
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
            <span className="ps-letter t2" aria-hidden="true">
              <IconUser size={20} />
            </span>
            <h3>Schools and lesson centres</h3>
            <p>Preparing a class for the UTME? Tell us about your students and how many there are, and we’ll talk about what would work for you.</p>
          </div>
          <div className="ps-card ps-side-card">
            <span className="ps-letter t3" aria-hidden="true">
              <IconSparkles size={20} />
            </span>
            <h3>Quick answers</h3>
            <p>Plans, payments, accounts and how the score works are all in the FAQ.</p>
            <Link to="/faq" className="ps-textlink">
              Read the FAQ <IconArrowRight size={16} />
            </Link>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
