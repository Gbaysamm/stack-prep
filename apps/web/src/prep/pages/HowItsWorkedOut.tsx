/**
 * Every number the app shows a student, and exactly how it is worked out: the words behind each
 * ⓘ, and the data the /help/numbers page (HelpNumbers.tsx) is drawn from.
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

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { InfoTip } from '../ui.js';

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
  /** The answer in one plain sentence: the big line on /help/numbers. */
  plain: string;
  /** One short paragraph: what the tip shows. */
  short: string;
  /** Anything more, for this page only. */
  more?: string[];
  example: string;
}

export const METRICS: Record<MetricId, Metric> = {
  predicted: {
    title: 'Predicted score',
    plain: 'What you’d likely score out of 100 if you sat the exam today, worked out from your latest check-up.',
    short:
      'What you’d likely score if you sat the exam today, out of 100, from your latest check-up. We split the paper into its topics, as the syllabus lists them, and give each one the share of marks the real exam gives it. For each topic we multiply that share by your mastery there, then add them all up. No curve, no bonus marks.',
    more: [
      'A topic the check-up didn’t reach isn’t counted as zero. It’s given your average for the other topics in the same section, or 40% if nothing in that section was reached yet.',
      'The shares come from the exam’s printed section structure. For a subject whose structure we haven’t loaded yet, every topic gets an equal share, and the report says so.',
      'Only check-ups set this number. Practice doesn’t change it, so take another check-up to see how far you’ve moved.',
    ],
    example:
      'If one topic is worth 10% of the paper and your mastery there is 60%, it adds 6 marks. Do the same for every topic and add them up.',
  },
  range: {
    title: 'Likely range',
    plain: 'The band your predicted score most likely sits in. The more check-up answers behind it, the narrower it gets.',
    short:
      'Your predicted score comes from a handful of questions, so we show the band it most likely sits in. The band is your score plus or minus a set number of marks that depends on how many check-up answers stand behind it: 18 marks with fewer than 10 answers, 12 marks with 10 to 24, and 8 marks with 25 or more. It never goes below 0 or above 100.',
    example: 'Predicted 52 from a 15-question check-up: 52 minus 12 to 52 plus 12, so likely 40–64.',
  },
  projected: {
    title: 'By exam day',
    plain: 'Where your score could be on exam day if you do every study session the plan counted.',
    short:
      'Where your score could be on exam day if you do every study session we counted and follow the plan. We spend your sessions one at a time on the topic where one more session adds the most marks. A session moves you most when you’re around the middle (about 55%), less near the bottom or the top, and no topic is taken past 90%.',
    more: [
      'About 30% of the sessions go first to your heaviest weak topics (under 50%), so the big topics that hold your score down are never left till last.',
      'It assumes the study actually happens and it doesn’t allow for forgetting, so read it as a good case, not a promise.',
    ],
    example:
      'A topic at 45% that carries 10% of the paper: one session lifts it to about 54%, worth about 0.9 of a mark. The same session on a topic already at 85% adds less than half a point of mastery.',
  },
  target: {
    title: 'Your target',
    plain: 'The score you said you’re aiming for. We never change it, but you can.',
    short:
      'The score you told us you’re aiming for when you set your goal. We never change it. The by-exam-day score is measured against it, and you can change it any time from your goal.',
    example: 'Aiming for 75 in UTME Mathematics? The target mark on the scale sits at 75.',
  },
  gap: {
    title: 'On track, or marks short',
    plain: 'Your target minus your by-exam-day score. Reach your target or pass it and you’re on track.',
    short:
      'We compare your by-exam-day score with your target. If it reaches your target or passes it, you’re on track. If not, the gap is your target minus the by-exam-day score, rounded to a whole mark. The plan already puts every session where it earns most, so what closes a gap is more time: more study days, more minutes a day, or a later exam.',
    example: 'Target 75, by exam day 68: you’re 7 short.',
  },
  plan: {
    title: 'Your plan: sessions and marks added',
    plain: 'Which topics your sessions go to, in order of the marks each is expected to add.',
    short:
      'Each line is one topic of the syllabus the plan spends sessions on, ordered by the marks it’s expected to add, not just by how weak it is. “Now → after plan” is your mastery there today and after those sessions. The marks it adds are the topic’s share of the paper times how much the sessions lift your mastery.',
    example: 'A topic worth 8% of the paper going from 40% to 58% adds 0.08 × 18 = about 1.4 marks.',
  },
  days: {
    title: 'Days to exam',
    plain: 'Calendar days from today to your exam, or to your next paper when papers are on different days.',
    short:
      'Calendar days from today to your exam date. Today isn’t counted and exam day is, so the day before the exam shows 1. For an exam sat on one day, like UTME, all your subjects share one date and one countdown. For an exam whose papers fall on different days, like WAEC, it counts to the nearest paper still to come and names it; once that day passes it moves to the next. With more than one exam, the nearest comes first. Weekends and rest days count: it’s a countdown, not study time.',
    example: 'Exam on Friday 13 November, and today is Monday 9 November: 4 days to exam.',
  },
  sessions: {
    title: 'Study sessions left',
    plain: 'Weeks left × the days a week you study × the sessions you fit in a day.',
    short:
      'How many study sessions fit before your exam, from your goal. We take the weeks left, times the days a week you said you’d study, times the sessions you fit in a day (one for every 45 minutes of daily study, and at least one), then round down. This is the time the plan spends, and it assumes you study on every one of those days.',
    example: '46 days left is about 6.6 weeks. Studying 5 days a week for 60 minutes a day: 6.6 × 5 × 1 = 32 sessions.',
  },
  mastery: {
    title: 'Mastery',
    plain: 'Your chance of getting a standard exam-level question on that topic right.',
    short:
      'Your chance of getting a standard exam-level question on that topic right, from your check-up answers. Everyone starts at 50%. A right answer lifts it and a wrong one lowers it, by more when the result is a surprise: a hard question right lifts it more than an easy one. Early answers move it most. A right answer given in under a quarter of the time the question should take moves it only half as much, because it may be a guess.',
    more: [
      '“Standard exam-level” is the middle of our five difficulty levels. A section’s percentage comes from all its answers together, not from averaging its topics.',
      'With only two or three questions on a topic, mastery can’t move far from 50%. That’s on purpose: a few answers are a starting point, not a verdict.',
    ],
    example: 'Start at 50%. Right on a middle question: 55%. Then right on a harder one: 61%. Then wrong on the hardest: 59%.',
  },
  bands: {
    title: 'Strong, holding, shaky, needs teaching',
    plain: 'Plain names for your mastery: Strong, Holding, Shaky or Needs teaching, or Not checked yet.',
    short:
      'Names for the mastery percentage: Strong is 75% and up, Holding is 50–74%, Shaky is 30–49%, and Needs teaching is under 30%. Not checked means the check-up asked nothing there, so we don’t know yet. It isn’t a low score. On the bars, the colour runs from pink (weak) to green (strong), and stripes mean not checked.',
    example: '62% on Polynomials is Holding. 28% on Loci is Needs teaching.',
  },
  weakest: {
    title: 'Your weakest topics',
    plain: 'The topics your latest check-up reached where your mastery is lowest, lowest first.',
    short:
      'The topics of the syllabus with the lowest mastery, among the ones your latest check-up reached, lowest first. Home and your subject page show the three lowest. A topic the check-up didn’t reach is never listed here, because no answers isn’t the same as weak.',
    example: 'If you’re at 22% on Sets, 35% on Variation and 48% on Probability, they’re listed in that order.',
  },
  checkup: {
    title: 'Check-up answers',
    plain: 'Up to 15 questions across the paper. Each section gets harder when you’re right and easier when you’re wrong.',
    short:
      'A check-up is up to 15 questions. They’re spread over the syllabus sections by how much of the paper each is worth, with at least one per section while there’s room, and within a section over its topics. Each section starts at a middle question, then goes one step harder after a right answer and one step easier after a wrong one. There’s no pass mark and no time limit.',
    example: 'Right on your first Algebra question? Your next Algebra question is one level harder.',
  },
  answered: {
    title: 'Questions answered',
    plain: 'Every different question you’ve met in practice, however many tries it took.',
    short:
      'Every different question you’ve met in practice, added up across all your runs. A question counts once in a run however many tries it took, and a question the coach taught you still counts. Check-up questions aren’t included.',
    example:
      'A 10-question run where you got 7 right first time, needed a hint on 2 and were taught 1 adds 10 to this number.',
  },
  right: {
    title: 'Right first time',
    plain: 'Practice questions you got right on the first try: no hint, no working shown, not a guess.',
    short:
      'Practice questions you got right on your first try, with no hint and without seeing the working. A right answer you told us was a guess doesn’t count here, because it doesn’t show you know it yet. A right answer on the second try, after the hint, doesn’t count either.',
    example: 'You picked the right option but tapped “I guessed”: it counts as answered, not as right first time.',
  },
  taught: {
    title: 'Taught',
    plain: 'Questions you missed twice, so the coach worked them through with you on the board.',
    short:
      'Practice questions you missed twice, so the coach worked the solution through with you on the board, step by step. They’re counted as taught, not as known.',
    example: 'Wrong, then wrong again after the hint: the board opens and the question counts as taught.',
  },
  streak: {
    title: 'Day streak',
    plain: 'Days in a row you’ve answered at least one question.',
    short:
      'How many days in a row you’ve answered at least one question in practice or a check-up. Days run midnight to midnight in your time zone (Lagos time unless you’ve changed it). If you haven’t answered anything yet today, your streak still counts up to yesterday, so it only resets after a whole day with no answers.',
    example:
      'You answered on Monday, Tuesday and Wednesday. On Thursday morning it still shows 3, and one answer makes it 4. Skip all of Thursday and on Friday it’s back to 0.',
  },
  checked: {
    title: 'Subjects checked',
    plain: 'Subjects where you’ve finished at least one check-up.',
    short:
      'Subjects where you’ve finished at least one check-up. A check-up you’ve started but not finished doesn’t count until you finish it.',
    example: 'Finished a Mathematics check-up and half-way through English: 1 subject checked.',
  },
};

/** Where the full explanations live. The old /how-its-worked-out address redirects here. */
export const HOW_PATH = '/help/numbers';

/** The ⓘ beside a number, with its explanation and a link to the full page. */
export function MetricTip({ id, onDark, title }: { id: MetricId; onDark?: boolean; title?: string }) {
  const metric = METRICS[id];
  return (
    <InfoTip title={title ?? metric.title} example={metric.example} more={`${HOW_PATH}#${id}`} onDark={onDark}>
      <p>{metric.short}</p>
    </InfoTip>
  );
}

/* ================================================================== groups */

/** How the numbers are grouped on /help/numbers and on the help hub. `id` is the group's anchor. */
export const METRIC_GROUPS: { id: 'score' | 'plan' | 'practice'; label: string; title: string; sub: string; metrics: MetricId[] }[] = [
  {
    id: 'score',
    label: 'Your score',
    title: 'Your score',
    sub: 'The numbers on the 0–100 scale: on Home, your subject pages and your check-up report.',
    metrics: ['predicted', 'range', 'projected', 'target', 'gap'],
  },
  {
    id: 'plan',
    label: 'Your plan',
    title: 'Your plan',
    sub: 'How much time is left, and where the plan spends it.',
    metrics: ['days', 'sessions', 'plan'],
  },
  {
    id: 'practice',
    label: 'Your practice',
    title: 'Your practice',
    sub: 'What you’ve done, what you know, and the words we use for it.',
    metrics: ['answered', 'right', 'taught', 'streak', 'mastery', 'bands', 'weakest', 'checkup', 'checked'],
  },
];

/** A short line with a link to this page, for heroes and footers. */
export function HowLink({ children = 'How your numbers are worked out' }: { children?: ReactNode }) {
  return <Link to={HOW_PATH}>{children}</Link>;
}
