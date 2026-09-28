/**
 * /how-its-worked-out — every number the app shows a student, and exactly how it is worked out.
 *
 * The words here are written from the code, not from the spec, and must change when the code
 * does. Where each one comes from:
 *   predicted, range, projected, plan    packages/engine/src/engine/projection.py (score_now,
 *                                        project: range widths 18/12/8, ceiling 0.9, 30% reserved,
 *                                        unknown subtopic = topic average or 0.40)
 *   mastery, bands                       packages/engine/src/engine/mastery.py (Elo update, level 3
 *                                        reference, guess = under 25% of expected time, half step)
 *                                        and the web bands in CheckupReport (75 / 50 / 30)
 *   checkup                              engine/checkup.py (up to 15 questions, blueprint, ladder)
 *   sessions                             apps/api routers/student.py sessions_before (45-minute
 *                                        sessions, weeks × study days × sittings a day)
 *   days, streak                         routers/progress.py (student's timezone, yesterday counts)
 *   answered, right, taught              routers/progress.py RUNS and the scoring_attempts view
 *   gap                                  CheckupReport / Home (target − by exam day, rounded)
 *
 * `MetricTip` is the ⓘ each page puts beside a number; it opens the short version and links
 * here for the rest.
 */

import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { IconArrowRight } from '../icons.js';
import { usePageTitle } from '../store.js';
import { Button, InfoTip, PageHero } from '../ui.js';
import { Section } from './Home.js';
import './HowItsWorkedOut.css';

export type MetricId =
  | 'predicted'
  | 'range'
  | 'projected'
  | 'target'
  | 'gap'
  | 'plan'
  | 'days'
  | 'sessions'
  | 'mastery'
  | 'bands'
  | 'weakest'
  | 'checkup'
  | 'answered'
  | 'right'
  | 'taught'
  | 'streak'
  | 'checked';

interface Metric {
  /** The name as the student sees it on the page. */
  title: string;
  /** One short paragraph: what the tip shows. */
  short: string;
  /** Anything more, for this page only. */
  more?: string[];
  example: string;
}

export const METRICS: Record<MetricId, Metric> = {
  predicted: {
    title: 'Predicted score',
    short:
      'What you’d likely score if you sat the exam today, out of 100, from your latest check-up. We split the paper into its small parts and give each one the share of marks the real exam gives it. For each part we multiply that share by your mastery there, then add them all up. No curve, no bonus marks.',
    more: [
      'A part the check-up didn’t reach isn’t counted as zero. It’s given your average for the other parts of the same topic, or 40% if nothing in that topic was reached yet.',
      'The shares come from the exam’s printed section structure. For a subject whose structure we haven’t loaded yet, every part gets an equal share, and the report says so.',
      'Only check-ups set this number. Practice doesn’t change it, so take another check-up to see how far you’ve moved.',
    ],
    example:
      'If one part is worth 10% of the paper and your mastery there is 60%, it adds 6 marks. Do the same for every part and add them up.',
  },
  range: {
    title: 'Likely range',
    short:
      'Your predicted score comes from a handful of questions, so we show the band it most likely sits in. The band is your score plus or minus a set number of marks that depends on how many check-up answers stand behind it: 18 marks with fewer than 10 answers, 12 marks with 10 to 24, and 8 marks with 25 or more. It never goes below 0 or above 100.',
    example: 'Predicted 52 from a 15-question check-up: 52 minus 12 to 52 plus 12, so likely 40–64.',
  },
  projected: {
    title: 'By exam day',
    short:
      'Where your score could be on exam day if you do every study session we counted and follow the plan. We spend your sessions one at a time on the part where one more session adds the most marks. A session moves you most when you’re around the middle (about 55%), less near the bottom or the top, and no part is taken past 90%.',
    more: [
      'About 30% of the sessions go first to your heaviest weak parts (under 50%), so the big topics that hold your score down are never left till last.',
      'It assumes the study actually happens and it doesn’t allow for forgetting, so read it as a good case, not a promise.',
    ],
    example:
      'A part at 45% that carries 10% of the paper: one session lifts it to about 54%, worth about 0.9 of a mark. The same session on a part already at 85% adds less than half a point of mastery.',
  },
  target: {
    title: 'Your target',
    short:
      'The score you told us you’re aiming for when you set your goal. We never change it. The by-exam-day score is measured against it, and you can change it any time from your goal.',
    example: 'Aiming for 75 in UTME Mathematics? The target mark on the scale sits at 75.',
  },
  gap: {
    title: 'On track, or marks short',
    short:
      'We compare your by-exam-day score with your target. If it reaches your target or passes it, you’re on track. If not, the gap is your target minus the by-exam-day score, rounded to a whole mark. The plan already puts every session where it earns most, so what closes a gap is more time: more study days, more minutes a day, or a later exam.',
    example: 'Target 75, by exam day 68: you’re 7 short.',
  },
  plan: {
    title: 'Your plan: sessions and marks added',
    short:
      'Each line is one part of the syllabus the plan spends sessions on, ordered by the marks it’s expected to add, not just by how weak it is. “Now → after plan” is your mastery there today and after those sessions. The marks it adds are the part’s share of the paper times how much the sessions lift your mastery.',
    example: 'A part worth 8% of the paper going from 40% to 58% adds 0.08 × 18 = about 1.4 marks.',
  },
  days: {
    title: 'Days to exam',
    short:
      'Calendar days from today to the exam date on your goal. Today isn’t counted and exam day is, so the day before the exam shows 1. “Today” is worked out in your time zone (Lagos time unless you’ve changed it). Weekends and rest days count: it’s a countdown, not study time.',
    example: 'Exam on Friday 13 November, and today is Monday 9 November: 4 days to exam.',
  },
  sessions: {
    title: 'Study sessions left',
    short:
      'How many study sessions fit before your exam, from your goal. We take the weeks left, times the days a week you said you’d study, times the sessions you fit in a day (one for every 45 minutes of daily study, and at least one), then round down. This is the time the plan spends, and it assumes you study on every one of those days.',
    example: '46 days left is about 6.6 weeks. Studying 5 days a week for 60 minutes a day: 6.6 × 5 × 1 = 32 sessions.',
  },
  mastery: {
    title: 'Mastery',
    short:
      'Your chance of getting a standard exam-level question on that part right, from your check-up answers. Everyone starts at 50%. A right answer lifts it and a wrong one lowers it, by more when the result is a surprise: a hard question right lifts it more than an easy one. Early answers move it most. A right answer given in under a quarter of the time the question should take moves it only half as much, because it may be a guess.',
    more: [
      '“Standard exam-level” is the middle of our five difficulty levels. A topic’s percentage comes from all its answers together, not from averaging its parts.',
      'With only two or three questions on a part, mastery can’t move far from 50%. That’s on purpose: a few answers are a starting point, not a verdict.',
    ],
    example: 'Start at 50%. Right on a middle question: 55%. Then right on a harder one: 61%. Then wrong on the hardest: 59%.',
  },
  bands: {
    title: 'Strong, holding, shaky, needs teaching',
    short:
      'Names for the mastery percentage: Strong is 75% and up, Holding is 50–74%, Shaky is 30–49%, and Needs teaching is under 30%. Not checked means the check-up asked nothing there, so we don’t know yet. It isn’t a low score. On the bars, the colour runs from pink (weak) to green (strong), and stripes mean not checked.',
    example: '62% on Indices is Holding. 28% on Logarithms is Needs teaching.',
  },
  weakest: {
    title: 'Your weakest spots',
    short:
      'The parts of the syllabus with the lowest mastery, among the ones your latest check-up reached, lowest first. Home and your subject page show the three lowest. A part the check-up didn’t reach is never listed here, because no answers isn’t the same as weak.',
    example: 'If you’re at 22% on Surds, 35% on Logarithms and 48% on Sets, they’re listed in that order.',
  },
  checkup: {
    title: 'Check-up answers',
    short:
      'A check-up is up to 15 questions. They’re spread over the topics by how much of the paper each is worth, with at least one per topic while there’s room. Each topic starts at a middle question, then goes one step harder after a right answer and one step easier after a wrong one. There’s no pass mark and no time limit.',
    example: 'Right on your first Algebra question? Your next Algebra question is one level harder.',
  },
  answered: {
    title: 'Questions answered',
    short:
      'Every different question you’ve met in practice, added up across all your runs. A question counts once in a run however many tries it took, and a question the coach taught you still counts. Check-up questions aren’t included.',
    example:
      'A 10-question run where you got 7 right first time, needed a hint on 2 and were taught 1 adds 10 to this number.',
  },
  right: {
    title: 'Right first time',
    short:
      'Practice questions you got right on your first try, with no hint and without seeing the working. A right answer you told us was a guess doesn’t count here, because it doesn’t show you know it yet. A right answer on the second try, after the hint, doesn’t count either.',
    example: 'You picked the right option but tapped “I guessed”: it counts as answered, not as right first time.',
  },
  taught: {
    title: 'Taught',
    short:
      'Practice questions you missed twice, so the coach worked the solution through with you on the board, step by step. They’re counted as taught, not as known.',
    example: 'Wrong, then wrong again after the hint: the board opens and the question counts as taught.',
  },
  streak: {
    title: 'Day streak',
    short:
      'How many days in a row you’ve answered at least one question in practice or a check-up. Days run midnight to midnight in your time zone (Lagos time unless you’ve changed it). If you haven’t answered anything yet today, your streak still counts up to yesterday, so it only resets after a whole day with no answers.',
    example:
      'You answered on Monday, Tuesday and Wednesday. On Thursday morning it still shows 3, and one answer makes it 4. Skip all of Thursday and on Friday it’s back to 0.',
  },
  checked: {
    title: 'Subjects checked',
    short:
      'Subjects where you’ve finished at least one check-up. A check-up you’ve started but not finished doesn’t count until you finish it.',
    example: 'Finished a Mathematics check-up and half-way through English: 1 subject checked.',
  },
};

export const HOW_PATH = '/how-its-worked-out';

/** The ⓘ beside a number, with its explanation and a link to the full page. */
export function MetricTip({ id, onDark, title }: { id: MetricId; onDark?: boolean; title?: string }) {
  const metric = METRICS[id];
  return (
    <InfoTip title={title ?? metric.title} example={metric.example} more={`${HOW_PATH}#${id}`} onDark={onDark}>
      <p>{metric.short}</p>
    </InfoTip>
  );
}

/* ================================================================== the page */

const GROUPS: { id: string; eyebrow: string; title: string; sub: string; metrics: MetricId[] }[] = [
  {
    id: 'score',
    eyebrow: 'Your score',
    title: 'Predicted score, range and target',
    sub: 'The numbers on the 0–100 scale, on Home, your subject pages and your check-up report.',
    metrics: ['predicted', 'range', 'projected', 'target', 'gap', 'plan'],
  },
  {
    id: 'time',
    eyebrow: 'Your time',
    title: 'Days and study sessions',
    sub: 'How much time is left, and how much of it the plan can use.',
    metrics: ['days', 'sessions'],
  },
  {
    id: 'mastery-group',
    eyebrow: 'What you know',
    title: 'Mastery and the check-up',
    sub: 'The percentages beside each topic and part, and the words we use for them.',
    metrics: ['mastery', 'bands', 'weakest', 'checkup'],
  },
  {
    id: 'practice',
    eyebrow: 'What you’ve done',
    title: 'Practice counts and your streak',
    sub: 'The counts on Home, your subject pages and your profile.',
    metrics: ['answered', 'right', 'taught', 'streak', 'checked'],
  },
];

/** The page's signature: the predicted-score sum, worked out on example numbers. */
function WorkedSum() {
  const rows = [
    { part: 'Quadratic equations', share: 10, mastery: 60 },
    { part: 'Indices', share: 6, mastery: 80 },
    { part: 'Probability', share: 8, mastery: 35 },
  ];
  return (
    <figure className="hw-sum sj-card sticker">
      <figcaption>
        <span className="sj-eyebrow">Worked example</span>
        <span className="hw-sum-cap">Predicted score = add up (share of the paper × your mastery) for every part</span>
      </figcaption>
      <table>
        <thead>
          <tr>
            <th scope="col">Part of the syllabus</th>
            <th scope="col">Share</th>
            <th scope="col">Mastery</th>
            <th scope="col">Marks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.part}>
              <th scope="row">{row.part}</th>
              <td className="sj-mono">{row.share}%</td>
              <td className="sj-mono">× {row.mastery}%</td>
              <td className="sj-mono">
                <b>{((row.share * row.mastery) / 100).toFixed(1)}</b>
              </td>
            </tr>
          ))}
          <tr className="rest">
            <th scope="row">…and every other part</th>
            <td className="sj-mono">76%</td>
            <td className="sj-mono">× your mastery</td>
            <td className="sj-mono">…</td>
          </tr>
        </tbody>
      </table>
      <p className="hw-sum-foot">These three parts add 6.0 + 4.8 + 2.8 = 13.6 marks. The rest of the paper adds the rest.</p>
    </figure>
  );
}

function MetricCard({ id }: { id: MetricId }) {
  const metric = METRICS[id];
  return (
    <article id={id} className="sj-card hw-metric" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="sj-display sj-h3">
        {metric.title}
      </h3>
      <p>{metric.short}</p>
      {metric.more?.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="hw-example">
        <span className="sj-mono">For example</span>
        <p>{metric.example}</p>
      </div>
    </article>
  );
}

export function HowItsWorkedOut() {
  usePageTitle('How your numbers are worked out');

  // Arriving from an ⓘ lands on that number's card.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const id = window.setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.classList.add('hw-lit');
      el.focus?.({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="sj-page hw">
      <PageHero
        back={{ to: '/home', label: 'Home' }}
        eyebrow="Plain answers"
        title="How your numbers are worked out"
        sub="Every score, count and label in Stack Prep, and exactly where it comes from, in plain words. Nothing is curved."
        actions={
          <nav className="hw-jump" aria-label="Jump to">
            {GROUPS.map((group) => (
              <a key={group.id} href={`#${group.id}`}>
                {group.eyebrow}
              </a>
            ))}
          </nav>
        }
      />

      {GROUPS.map((group, index) => (
        <Section
          key={group.id}
          id={`${group.id}-h`}
          eyebrow={group.eyebrow}
          title={group.title}
          sub={group.sub}
          className={`hw-group sj-rise d${Math.min(index + 1, 4)}`}
        >
          <span id={group.id} className="hw-anchor" aria-hidden="true" />
          {group.id === 'score' ? <WorkedSum /> : null}
          <div className="hw-grid">
            {group.metrics.map((id) => (
              <MetricCard key={id} id={id} />
            ))}
          </div>
        </Section>
      ))}

      <section className="sj-card hw-end sj-rise d4" aria-labelledby="hw-end-title">
        <h2 id="hw-end-title" className="sj-display sj-h3">
          Want your own numbers to move?
        </h2>
        <p>Practice lifts what you know; a fresh check-up is what updates your predicted score.</p>
        <div className="hw-end-actions">
          <Button to="/practice" trailing={<IconArrowRight size={18} />}>
            Practise now
          </Button>
          <Link className="sj-link" to="/checkup">
            Take a check-up <IconArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}

/** A short line with a link to this page, for heroes and footers. */
export function HowLink({ children = 'How your numbers are worked out' }: { children?: ReactNode }) {
  return <Link to={HOW_PATH}>{children}</Link>;
}
