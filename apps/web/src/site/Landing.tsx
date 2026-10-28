/**
 * The front page for anyone not signed in (a signed-in student goes straight to /home): what
 * Stack Prep does, how it works, the subjects, the plans, the questions people ask, and the
 * way in. Every number is counted live (siteData.ts), and every claim is what the app does.
 */
import { Link } from 'react-router-dom';

import { IconArrowRight, IconBolt, IconBook, IconBrain, IconCheck, IconClock, IconFlag, IconTarget, IconVolume } from '../prep/icons.js';
import { FaqList, SITE_FAQ } from './Faq.js';
import { PlanGrid } from './PlanGrid.js';
import { SIGN_UP, SiteShell, useSiteTitle } from './SiteShell.js';
import { roughly, useCatalogue, useSite, yearsOf } from './siteData.js';

const STEPS = [
  {
    icon: IconTarget,
    tint: 'lime',
    title: 'Take a check-up',
    body: 'A short mixed test with no help, like the real thing. It gives you a score for every topic, and a predicted score for the exam.',
  },
  {
    icon: IconBolt,
    tint: 'pink',
    title: 'Practise your weakest topics',
    body: 'Questions come from the topics pulling your score down. Get one wrong and it comes back later, until you get it right.',
  },
  {
    icon: IconVolume,
    tint: 'yellow',
    title: 'Learn the step you missed',
    body: 'Miss a question twice and the coach works it through on the board, out loud, step by step. Ask it anything about the step.',
  },
  {
    icon: IconClock,
    tint: 'blue',
    title: 'Sit a full mock',
    body: 'The real UTME: Use of English and three subjects, 180 questions, two hours, on a screen like the exam.',
  },
] as const;

const REASONS = [
  {
    icon: IconBook,
    title: 'Real past questions',
    body: 'Questions from real UTME papers, each with its year, sorted into the topics on the syllabus.',
  },
  {
    icon: IconCheck,
    title: 'Every answer checked',
    body: 'Every question has a full worked solution that people have checked, so you’re always taught the right answer.',
  },
  {
    icon: IconBrain,
    title: 'A score you can trust',
    body: 'Your score is the share you get right in each topic, with no help. A guess that happens to be right doesn’t count.',
  },
  {
    icon: IconFlag,
    title: 'Something off? Tell us',
    body: 'Flag any question from inside the app. A person looks at every report and fixes the question for everyone.',
  },
];

export function Landing() {
  useSiteTitle('');
  const site = useSite();
  const { catalogue } = useCatalogue();
  const subjects = site?.subjects ?? [];

  return (
    <SiteShell>
      <section className="ps-hero">
        <div className="ps-hero-glow" aria-hidden="true" />
        <div className="ps-hero-text">
          <span className="ps-kicker">UTME preparation · Nigeria</span>
          <h1 className="sj-display">
            Know your UTME score.
            <br />
            <em>Then raise it.</em>
          </h1>
          <p className="ps-lede">
            A short check-up shows where you stand in every topic. Then you practise what’s holding you back, and a coach
            teaches you the exact step you missed.
          </p>
          <div className="ps-hero-actions">
            <Link to={SIGN_UP} className="sj-btn ps-cta big">
              Start free <IconArrowRight size={18} />
            </Link>
            <Link to="/how-it-works" className="ps-textlink light">
              See how it works
            </Link>
          </div>
          <dl className="ps-hero-stats">
            <div>
              <dt>Past questions</dt>
              <dd>{site ? roughly(site.questions) : '…'}</dd>
            </div>
            <div>
              <dt>UTME subjects</dt>
              <dd>{site ? subjects.length : '…'}</dd>
            </div>
            <div>
              <dt>With worked solutions</dt>
              <dd>{site ? `${site.worked_percent}%` : '…'}</dd>
            </div>
          </dl>
        </div>
        <div className="ps-hero-art" aria-hidden="true">
          <div className="ps-art-card score">
            <span className="ps-art-label">Predicted score</span>
            <strong>
              268<small>/400</small>
            </strong>
            <span className="ps-art-bar">
              <i style={{ width: '67%' }} />
            </span>
            <span className="ps-art-sub">Target 280 · 12 to go</span>
          </div>
          <div className="ps-art-card topics">
            <span className="ps-art-label">Topics to work on</span>
            {[
              ['Quadratic equations', 38, 'warn'],
              ['Concord', 52, 'mid'],
              ['Organic chemistry', 61, 'ok'],
            ].map(([name, pct, tone]) => (
              <span key={name} className="ps-art-topic">
                <span>{name}</span>
                <span className={`ps-art-pct ${tone}`}>{pct}%</span>
              </span>
            ))}
          </div>
          <div className="ps-art-card coach">
            <span className="ps-art-coach-icon">
              <IconVolume size={16} />
            </span>
            <span>“Factorise first: what two numbers multiply to 6 and add to 5?”</span>
          </div>
        </div>
      </section>

      <section className="ps-section" aria-labelledby="ps-how">
        <div className="ps-head">
          <span className="ps-eyebrow">How it works</span>
          <h2 id="ps-how" className="sj-display">Four steps, one goal: a higher score</h2>
        </div>
        <ol className="ps-steps">
          {STEPS.map(({ icon: Icon, tint, title, body }, index) => (
            <li key={title} className="ps-step">
              <span className={`ps-step-icon ${tint}`} aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="ps-step-n">{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        <Link to="/how-it-works" className="ps-textlink">
          The whole picture, and how your score is worked out <IconArrowRight size={16} />
        </Link>
      </section>

      <section className="ps-section ps-band" aria-labelledby="ps-why">
        <div className="ps-head">
          <span className="ps-eyebrow">Why Stack Prep</span>
          <h2 id="ps-why" className="sj-display">Built so you learn the right answer, every time</h2>
        </div>
        <div className="ps-reasons">
          {REASONS.map(({ icon: Icon, title, body }) => (
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

      {subjects.length > 0 ? (
        <section className="ps-section" aria-labelledby="ps-subjects">
          <div className="ps-head row">
            <div>
              <span className="ps-eyebrow">Subjects</span>
              <h2 id="ps-subjects" className="sj-display">
                {subjects.length} UTME subjects, {roughly(site!.questions)} questions
              </h2>
            </div>
            <p className="ps-head-note">Pick Use of English and your three subjects when you sign up. You can add more later.</p>
          </div>
          <ul className="ps-subjects">
            {subjects.map((subject, index) => (
              <li key={subject.name}>
                <span className={`ps-letter t${index % 6}`} aria-hidden="true">
                  {subject.name.slice(0, 1)}
                </span>
                <span className="ps-subject-text">
                  <strong>{subject.name}</strong>
                  <span>
                    {subject.questions.toLocaleString('en-NG')} questions
                    {yearsOf(subject) ? ` · ${yearsOf(subject)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {catalogue && catalogue.plans.length > 0 ? (
        <section className="ps-section ps-band" aria-labelledby="ps-pricing">
          <div className="ps-head row">
            <div>
              <span className="ps-eyebrow">Pricing</span>
              <h2 id="ps-pricing" className="sj-display">Start free. Pay when you want more.</h2>
            </div>
            <Link to="/pricing" className="ps-textlink">
              Compare every plan <IconArrowRight size={16} />
            </Link>
          </div>
          <PlanGrid catalogue={catalogue} compact />
        </section>
      ) : null}

      <section className="ps-section ps-faq-teaser" aria-labelledby="ps-faq">
        <div className="ps-head">
          <span className="ps-eyebrow">Questions</span>
          <h2 id="ps-faq" className="sj-display">What people ask first</h2>
          <Link to="/faq" className="ps-textlink">
            Every question <IconArrowRight size={16} />
          </Link>
        </div>
        <FaqList items={SITE_FAQ.flatMap((group) => group.items).slice(0, 5)} />
      </section>

      <section className="ps-final">
        <div>
          <h2 className="sj-display">Find out where you stand today</h2>
          <p>Your first check-up is about 15 questions, with no time limit. It’s free.</p>
        </div>
        <Link to={SIGN_UP} className="sj-btn ps-cta big">
          Start free <IconArrowRight size={18} />
        </Link>
      </section>
    </SiteShell>
  );
}
