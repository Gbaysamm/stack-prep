/**
 * /help — Help & guides: how to get going, how every number is worked out, what the lesson
 * check-ins mean, and the questions students ask, with one search box over all of it.
 *
 * Every answer here is written from what the code does, and says where:
 * The scoring rule is docs/student-scoring.md; the numbers' own words are in HowItsWorkedOut.tsx.
 *   right answer didn't count   the scoring_attempts view (hinted and guessed-right answers don't
 *                               count; "I think so" counts in full), apps/api scoring.py (latest
 *                               counted answer to each question), checkinWords.ts
 *   board opened when right     PracticeRoom ReviewBoard (a guess, or "I think so")
 *   taught                      routers/practice.py (two misses → the board, `taught`)
 *   a question coming back      routers/practice.py (the hint, then the same question once; a
 *                               wrong or guessed question comes back in a later run, _comeback,
 *                               about one in three of a run)
 *   leaving half way            PracticeRoom / CheckupRoom leave dialogs, practice.py `current`
 *   predicted score             scoring.py (the latest check-up's result, the average of its
 *                               topic scores; due every 7 days)
 *   practice locked             docs/student-scoring.md §3 (until the first check-up, and while
 *                               one is due)
 *   countdown                   the exam date on the goal; the nearest paper for multi-day exams
 *   other devices               shell.tsx SandboxBanner, AuthForms (email or phone + password)
 *   coach's voice               student/Board.tsx (no voice → the words are written, read along)
 *   deleting a run              PracticeHub run list bin, RunReport Delete; routers/runs.py
 *                               (hides, still counts toward your score)
 *   past questions              docs/questions/utme, README "Content review"
 * Writing to us: Support.tsx, routers/support.py (the admin replies in the support inbox).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { UNDERSTOOD_WORD } from '../checkinWords.js';
import {
  IconArrowRight,
  IconBolt,
  IconChart,
  IconClose,
  IconHelp,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconVolume,
} from '../icons.js';
import { usePageTitle } from '../store.js';
import { Button, PageHero } from '../ui.js';
import { Disclosure } from './Disclosure.js';
import { HOW_PATH, METRIC_GROUPS, METRICS } from './HowItsWorkedOut.js';
import './Help.css';

/* ------------------------------------------------------------------ content */

interface Step {
  title: string;
  body: string;
  to: string;
  go: string;
  icon: (props: { size?: number }) => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Take a check-up',
    body: 'A short mixed test with no help, like the exam. Practice opens after your first one, and one is due every 7 days.',
    to: '/checkup',
    go: 'Check-up',
    icon: IconTarget,
  },
  {
    title: 'Practise',
    body: 'Questions come from your weakest topics first, and any question you missed comes back until you get it right.',
    to: '/practice',
    go: 'Practice',
    icon: IconBolt,
  },
  {
    title: 'Learn on the board',
    body: 'Miss a question twice and the coach works it through with you on the board, step by step.',
    to: '/practice',
    go: 'Practice',
    icon: IconVolume,
  },
  {
    title: 'Check in',
    body: 'After a lesson, say how it went. Anything still unsure goes on a list to come back to.',
    to: '/progress/check-ins',
    go: 'Check-ins',
    icon: IconSparkles,
  },
  {
    title: 'Track your progress',
    body: 'Your score, where you started, every check-up and every topic, all as plain percentages.',
    to: '/progress',
    go: 'Progress',
    icon: IconChart,
  },
];

interface Faq {
  id: string;
  q: string;
  a: string[];
  link?: { to: string; label: string };
}

const FAQS: Faq[] = [
  {
    id: 'right-not-counted',
    q: 'Why didn’t my right answer count?',
    a: [
      'If you said “I guessed”, a right answer doesn’t count in your score yet. The same question comes back in a later run, and when you get it right without guessing, it counts.',
      'A right answer on your second try, after the hint or the board, doesn’t count either: your first try already counted as wrong. That question comes back later too. If you said “I think so”, a right answer counts in full.',
    ],
    link: { to: `${HOW_PATH}#right`, label: 'How “right first time” is worked out' },
  },
  {
    id: 'board-when-right',
    q: 'Why did the board open when I got it right?',
    a: [
      'Because you said you guessed, or that you weren’t fully sure. The coach shows the working so you can check your thinking against it, and then asks whether that was how you worked it out.',
    ],
    link: { to: '/progress/check-ins', label: 'What your check-in answers mean' },
  },
  {
    id: 'taught',
    q: 'What does “taught” mean?',
    a: [
      'You missed a question twice, so the coach worked the solution through with you on the board, step by step. It counts as wrong for now, and the same question comes back in a later run for you to get right.',
    ],
    link: { to: `${HOW_PATH}#taught`, label: 'How “taught” is counted' },
  },
  {
    id: 'comes-back',
    q: 'Why does a question come back?',
    a: [
      'Straight after your first miss, the same question comes back once with a hint.',
      'After that, any question you got wrong, were taught on the board, or got right but guessed comes back in a later run, never the same one. About one question in three of a run is one of these. Once you get it right without help and without guessing, it stops coming back and your score goes up.',
    ],
  },
  {
    id: 'leave-half-way',
    q: 'What happens if I leave a run half way?',
    a: [
      'Nothing is lost. Everything you’ve answered is saved, and the run waits on Practice marked “In progress”. Resume it and you carry on where you stopped, even if that was at a hint or on the board.',
      'A check-up works the same way: your answers so far are saved and you can resume it.',
    ],
    link: { to: '/practice', label: 'Go to Practice' },
  },
  {
    id: 'predicted-after-checkup',
    q: 'Why does my predicted score only change after a check-up?',
    a: [
      'Your predicted score is your latest check-up’s result: the average of your topic scores from that check-up alone. A check-up is the closest thing to the exam, so only a check-up changes it.',
      'Practice still counts: every question you get right raises its topic, and your score with it. A check-up is due every 7 days.',
    ],
    link: { to: `${HOW_PATH}#predicted`, label: 'How the predicted score is worked out' },
  },
  {
    id: 'score-vs-predicted',
    q: 'Why is my score different from my predicted score?',
    a: [
      'Your score is the average of your topic scores, and each topic counts every question you’ve answered there, in practice and check-ups, using your latest answer to each. Your predicted score is the same sum for your latest check-up alone.',
      'So after a good week of practice your score can be higher than your predicted score. Your next check-up shows whether the exam-style result has caught up.',
    ],
    link: { to: `${HOW_PATH}#example`, label: 'See a worked example' },
  },
  {
    id: 'practice-locked',
    q: 'Why is practice locked?',
    a: [
      'Practice opens after your first check-up in a subject, because the check-up shows where you start and which topics to aim at.',
      'After that, a check-up is due every 7 days. While one is due, practice in that subject waits until you take it, so your predicted score keeps up with you.',
    ],
    link: { to: `${HOW_PATH}#checkup`, label: 'How check-ups work' },
  },
  {
    id: 'countdown',
    q: 'How is the countdown worked out?',
    a: [
      'It counts the days until your exam date. For an exam sat over several days, it counts to the nearest paper. Weekends and rest days count: it’s a countdown, not study time.',
    ],
    link: { to: `${HOW_PATH}#days`, label: 'How days to exam are counted' },
  },
  {
    id: 'another-device',
    q: 'Can I use Stack Prep on another device?',
    a: [
      'Yes, once you have a login: your email or phone number and a password. Sign in anywhere and your progress is there.',
      'Without a login, your progress lives only on the device you’re using. Tap “Create login” at the top of any page to keep it.',
    ],
  },
  {
    id: 'voice',
    q: 'What does the coach’s voice need?',
    a: [
      'Your sound on. The coach talks you through each step while it writes on the board. If the voice can’t be had, the coach’s words are written out instead and the lesson carries on for you to read along.',
    ],
  },
  {
    id: 'delete-run',
    q: 'How do I delete a run?',
    a: [
      'On Practice, use the bin beside the run in your list, or open the run’s report and choose Delete. It disappears from your history, but the answers in it still happened, so they still count in your score.',
    ],
    link: { to: '/practice', label: 'Go to Practice' },
  },
  {
    id: 'past-questions',
    q: 'Are the questions from real past papers?',
    a: [
      'Yes. The UTME Mathematics and English questions are UTME past questions. Before any question reaches you, a reviewer checks its answer and difficulty, and it must have a worked solution and a hint.',
    ],
  },
];

/* ------------------------------------------------------------------ search */

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');

function matches(query: string, ...texts: (string | undefined)[]) {
  if (!query) return true;
  const hay = norm(texts.filter(Boolean).join(' '));
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/* ------------------------------------------------------------------ pieces */

function SectionHead({ id, eyebrow, title, sub, action }: { id: string; eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="hx-sechead">
      <span className="sj-eyebrow">{eyebrow}</span>
      <div className="hx-sechead-row">
        <h2 id={id} className="sj-display sj-h2">
          {title}
        </h2>
        {action}
      </div>
      {sub ? <p>{sub}</p> : null}
    </header>
  );
}

function StepPath({ steps }: { steps: Step[] }) {
  return (
    <ol className="hp-steps" style={{ '--n': steps.length } as CSSProperties}>
      {steps.map((step) => {
        const Icon = step.icon;
        const index = STEPS.indexOf(step);
        return (
          <li key={step.title} className="hp-step">
            <Link to={step.to} className="hp-step-link">
              <span className="hp-step-top">
                <span className="hp-step-icon">
                  <Icon size={20} />
                </span>
                <span className="hp-step-num">{String(index + 1).padStart(2, '0')}</span>
              </span>
              <span className="hp-step-title">{step.title}</span>
              <span className="hp-step-body">{step.body}</span>
              <span className="hp-step-go">
                {step.go} <IconArrowRight size={14} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ the page */

export function Help() {
  usePageTitle('Help & guides');
  // ?q= opens the page already searched, so a search can be linked to.
  const [raw, setRaw] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const query = norm(raw.trim());
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const input = useRef<HTMLInputElement>(null);

  const steps = useMemo(() => STEPS.filter((step) => matches(query, step.title, step.body, step.go)), [query]);
  const groups = useMemo(
    () =>
      METRIC_GROUPS.map((group) => ({
        ...group,
        metrics: group.metrics.filter((id) =>
          matches(query, group.label, METRICS[id].title, METRICS[id].plain, METRICS[id].short, ...(METRICS[id].more ?? [])),
        ),
      })).filter((group) => group.metrics.length > 0),
    [query],
  );
  const checkinWords = Object.values(UNDERSTOOD_WORD);
  const checkins = matches(
    query,
    'lesson check-ins check in board coach how was this lesson worth another look',
    ...checkinWords.flatMap((word) => [word.label, word.means, word.then]),
  );
  const faqs = useMemo(() => FAQS.filter((faq) => matches(query, faq.q, ...faq.a)), [query]);
  // A search that leaves a few questions opens them, so the answer is on screen.
  useEffect(() => {
    if (query && faqs.length <= 3) setOpen(new Set(faqs.map((faq) => faq.id)));
  }, [query, faqs]);
  const results = steps.length + groups.reduce((sum, group) => sum + group.metrics.length, 0) + (checkins ? 1 : 0) + faqs.length;

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="sj-page hp">
      <PageHero
        eyebrow="Help & guides"
        title="How Stack Prep works"
        sub="How to get going, how every number is worked out, and straight answers to the questions students ask."
        actions={
          <div className="hp-search" role="search">
            <IconSearch size={20} className="hp-search-icon" />
            <input
              ref={input}
              type="search"
              className="hp-search-input"
              placeholder="Search help, e.g. “streak”"
              aria-label="Search help and guides"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && raw) {
                  event.preventDefault();
                  setRaw('');
                }
              }}
            />
            {raw ? (
              <button
                type="button"
                className="hp-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setRaw('');
                  input.current?.focus();
                }}
              >
                <IconClose size={16} />
              </button>
            ) : null}
          </div>
        }
      />

      <p className="hp-sr" aria-live="polite">
        {query ? `${results} ${results === 1 ? 'result' : 'results'}` : ''}
      </p>

      {query && results === 0 ? (
        <div className="hp-none sj-rise">
          <span className="hp-none-icon" aria-hidden="true">
            <IconHelp size={22} />
          </span>
          <div>
            <h2 className="sj-display sj-h3">Nothing matches “{raw.trim()}”</h2>
            <p>Try one word, like “score”, “streak”, “hint” or “login”.</p>
          </div>
          <Button tone="soft" size="sm" onClick={() => setRaw('')}>
            Show everything
          </Button>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <section className="hp-sec sj-rise d1" aria-labelledby="hp-start">
          <SectionHead id="hp-start" eyebrow="Getting started" title="Five steps, in order" />
          <StepPath steps={steps} />
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="hp-sec sj-rise d2" aria-labelledby="hp-numbers">
          <SectionHead
            id="hp-numbers"
            eyebrow="Calculation guide"
            title="How your numbers are worked out"
            sub="Every score and count, each in one sentence with a worked example."
            action={
              <Link to={HOW_PATH} className="hp-all">
                Open the full guide <IconArrowRight size={14} />
              </Link>
            }
          />
          <div className="hp-groups">
            {groups.map((group) => (
              <div key={group.id} className={`sj-card hp-group g-${group.id}`}>
                <Link to={`${HOW_PATH}#${group.id}`} className="hp-group-head">
                  <span className="sj-display">{group.label}</span>
                  <span className="sj-mono">{group.metrics.length}</span>
                </Link>
                <ul>
                  {group.metrics.map((id) => (
                    <li key={id}>
                      <Link to={`${HOW_PATH}#${id}`} className="hp-metric">
                        <span className="hp-metric-name">{METRICS[id].title}</span>
                        <span className="hp-metric-plain">{METRICS[id].plain}</span>
                        <IconArrowRight size={16} className="hp-metric-go" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {checkins ? (
        <section className="hp-sec sj-rise d3" aria-labelledby="hp-checkins">
          <Link to="/progress/check-ins" className="sj-card hp-checkins">
            <div className="hp-checkins-text">
              <span className="sj-eyebrow">Lesson check-ins</span>
              <h2 id="hp-checkins" className="sj-display sj-h3">
                What your check-in answers mean
              </h2>
              <p>
                After a lesson on the board, you tell us how it went. Check-ins keeps every answer, says what each one
                means, and lists the lessons worth another look.
              </p>
            </div>
            <ul className="hp-checkins-words" aria-label="The answers you can give">
              {checkinWords.map((word) => (
                <li key={word.label} className={word.tone}>
                  <span className="dot" aria-hidden="true" />
                  {word.label}
                </li>
              ))}
            </ul>
            <span className="hp-checkins-go">
              Open check-ins <IconArrowRight size={16} />
            </span>
          </Link>
        </section>
      ) : null}

      {faqs.length > 0 ? (
        <section className="hp-sec hp-faqsec sj-rise d4" aria-labelledby="hp-faq">
          <SectionHead
            id="hp-faq"
            eyebrow="FAQ"
            title="Questions students ask"
            sub="Straight answers, written from how Stack Prep actually works."
          />
          <div className="hp-faq">
            {faqs.map((faq) => (
              <Disclosure
                key={faq.id}
                as="h3"
                open={open.has(faq.id)}
                onToggle={() => toggle(faq.id)}
                summary={faq.q}
                className="hp-faq-item"
              >
                {faq.a.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {faq.link ? (
                  <Link to={faq.link.to} className="hp-faq-link">
                    {faq.link.label} <IconArrowRight size={14} />
                  </Link>
                ) : null}
              </Disclosure>
            ))}
          </div>
        </section>
      ) : null}

      {/* Messages have their own page now (founder, 17 Nov 2026); the guide only points to it. */}
      <Link to="/messages" className="sj-card hp-msgs-link">
        <span>
          <b className="sj-display">Still stuck?</b>
          <small>Write to a person at Stack Prep. Replies usually come within a day.</small>
        </span>
        <span className="hp-msgs-go">
          Open Messages <IconArrowRight size={16} />
        </span>
      </Link>
    </div>
  );
}
