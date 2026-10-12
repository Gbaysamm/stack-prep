/**
 * Every number the app shows a student, and exactly how it is worked out: the words behind each
 * ⓘ, and the data the /help/numbers page (HelpNumbers.tsx) is drawn from.
 *
 * The rule is docs/student-scoring.md (version 3.1): a topic score is right ÷ answered; your
 * score, and each check-up's result, is the average of the topic scores. Nothing is weighted or
 * estimated. The words here must change when it does. Where each one comes from in the code:
 *   score, started, topic, status        apps/api scoring.py (latest counted answer to each
 *                                        question; labels at 3 answers, 50, 80)
 *   predicted, checkup                   scoring.py checkups (each sitting's own result; the latest
 *                                        is the predicted score; CHECKUP_EVERY_DAYS = 7; practice
 *                                        locked until the first, and while one is due)
 *   target, gap                          the goal's target; gap = target − predicted
 *   weakest                              routers/progress.py _latest_checkup (lowest topic scores
 *                                        among topics with an answer)
 *   comeback                             routers/practice.py _comeback (COMEBACK_EVERY = 3)
 *   days, streak                         routers/progress.py (student's timezone, yesterday counts)
 *   answered, right, taught              routers/progress.py RUNS and the scoring_attempts view
 *
 * `MetricTip` is the ⓘ each page puts beside a number; it opens the short version and links
 * here for the rest.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { InfoTip } from '../ui.js';

export type MetricId =
  | 'score'
  | 'started'
  | 'predicted'
  | 'checkup'
  | 'target'
  | 'gap'
  | 'topic'
  | 'status'
  | 'weakest'
  | 'comeback'
  | 'days'
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
  score: {
    title: 'Your score',
    plain: 'The average of your topic scores, over the topics you’ve tried.',
    short:
      'The average of your topic scores in this subject, counting only the topics you’ve tried. Every check-up and practice question counts in its topic, and only your latest answer to each question counts. So when you get a question right that you once got wrong, that topic goes up, and so does your score.',
    more: [
      'A right answer counts when it’s your first try, with no hint and no board, and you didn’t tap “I guessed”. Otherwise the question comes back in a later run so you can show you know it.',
      'A topic you haven’t tried yet isn’t in the average, so it doesn’t pull your score down.',
    ],
    example: 'Vowels 20% and Stress 40%: your score is (20 + 40) ÷ 2 = 30%. Practise Vowels up to 60%: (60 + 40) ÷ 2 = 50%.',
  },
  started: {
    title: 'Started at',
    plain: 'Your first check-up’s result. Your score now is shown next to it, so you can see how far you’ve come.',
    short:
      'The result of your first check-up in this subject: the average of your topic scores from that check-up alone. It never changes. The difference between it and your score now shows your improvement.',
    example: 'Started at 30%, now 50%: that’s +20.',
  },
  predicted: {
    title: 'Predicted score',
    plain: 'Your latest check-up’s result: the average of your topic scores from that check-up alone.',
    short:
      'Your latest check-up’s result: the average of your topic scores from that check-up alone. A check-up is the closest thing to the exam, so it’s the best guess of what you’d get if you sat the exam today.',
    more: [
      'Only a check-up changes it. Practice raises your score, but your predicted score stays the same until your next check-up.',
      'Each check-up is a checkpoint, so the history shows the trend: 30% → 38% → 47%.',
    ],
    example: 'In your latest check-up, Vowels 40% and Stress 60%: your predicted score is (40 + 60) ÷ 2 = 50%.',
  },
  checkup: {
    title: 'Check-up',
    plain: 'A short mixed test with no help, like the exam. The first one opens practice, and one is due every 7 days.',
    short:
      'A check-up is a short mixed test with no hints and no board, like the real exam. Your first check-up comes first: practice opens only after it. After that a check-up is due every 7 days, and while one is due, practice is locked until you take it. Its result becomes your predicted score, and its answers also count in your topic scores.',
    more: [
      'Questions you haven’t seen yet come first. If a topic has none left, it reuses the ones you saw longest ago.',
    ],
    example: 'Three check-ups a week apart: 30% → 38% → 47%.',
  },
  target: {
    title: 'Your target',
    plain: 'The score you said you’re aiming for. We never change it, but you can.',
    short:
      'The score you told us you’re aiming for when you set your goal. We never change it. Your predicted score is measured against it, and you can change it any time from your goal.',
    example: 'Aiming for 60% in UTME Mathematics? The target mark on the scale sits at 60.',
  },
  gap: {
    title: 'On track, or short',
    plain: 'Your target minus your predicted score. Reach your target or pass it and you’re on track.',
    short:
      'Your target minus your predicted score. If your predicted score reaches your target or passes it, you’re on track.',
    example: 'Target 60%, predicted score 47%: you’re 13 short.',
  },
  topic: {
    title: 'Topic score',
    plain: 'Questions right ÷ questions answered in that topic, shown with the count.',
    short:
      'Questions right ÷ questions answered in one topic of the syllabus. If you redo a question, your latest answer replaces the old one, so fixing a mistake raises the score. It’s always shown with the count, so you can check it yourself.',
    example: 'Vowels: 2 of 10 right is 20%. Redo the same 10 and get 3 right: 3 of 10 is 30% (+10).',
  },
  status: {
    title: 'Topic labels',
    plain: 'Not tried yet, Just started, Needs work, Getting there or Strong.',
    short:
      'Each topic gets one plain label. Not tried yet: nothing answered. Just started: fewer than 3 questions answered, too few to say. Needs work: under 50%. Getting there: 50% to 79%. Strong: 80% and over.',
    example: '3 of 10 is 30%: Needs work. 6 of 10 is 60%: Getting there. 2 of 2 is still Just started.',
  },
  weakest: {
    title: 'Topics to work on',
    plain: 'Your topics with the lowest scores, lowest first.',
    short:
      'The topics with your lowest scores, lowest first, among the topics you’ve answered questions on. A topic you haven’t tried yet isn’t listed here, because no answers isn’t the same as weak.',
    example: 'Sets 22%, Variation 35% and Probability 48% are listed in that order.',
  },
  comeback: {
    title: 'Questions that come back',
    plain: 'A question you got wrong, or guessed, comes back in a later run until you get it right.',
    short:
      'When you got a question wrong, were taught it on the board, or guessed it, that same question comes back in a later practice run, never the same run, marked “Back again”. About one question in three of a run is one of these. Get it right and the topic score goes up.',
    example: 'Wrong on a Vowels question on Monday, right when it comes back on Tuesday: it now counts as right, and Vowels goes up.',
  },
  days: {
    title: 'Days to exam',
    plain: 'Calendar days from today to your exam, or to your next paper when papers are on different days.',
    short:
      'Calendar days from today to your exam date. Today isn’t counted and exam day is, so the day before the exam shows 1. For an exam sat on one day, like UTME, all your subjects share one date and one countdown. For an exam whose papers fall on different days, like WAEC, it counts to the nearest paper still to come and names it; once that day passes it moves to the next. With more than one exam, the nearest comes first. Weekends and rest days count: it’s a countdown, not study time.',
    example: 'Exam on Friday 13 November, and today is Monday 9 November: 4 days to exam.',
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
      'Practice questions you missed twice, so the coach worked the solution through with you on the board, step by step. They count as wrong for now, and the same question comes back in a later run for you to get right.',
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

/**
 * How the numbers are grouped on /help/numbers and on the help hub. `id` is the group's anchor,
 * so it must never equal a metric's id.
 */
export const METRIC_GROUPS: { id: 'scores' | 'topics' | 'practice'; label: string; title: string; sub: string; metrics: MetricId[] }[] = [
  {
    id: 'scores',
    label: 'Your score',
    title: 'Your score',
    sub: 'The percentages on Home, your subject pages and your check-up report.',
    metrics: ['score', 'started', 'predicted', 'checkup', 'target', 'gap'],
  },
  {
    id: 'topics',
    label: 'Your topics',
    title: 'Your topics',
    sub: 'How each topic is scored, the words we use for it, and what comes back.',
    metrics: ['topic', 'status', 'weakest', 'comeback'],
  },
  {
    id: 'practice',
    label: 'Your practice',
    title: 'Your practice',
    sub: 'What you’ve done, and how long is left.',
    metrics: ['answered', 'right', 'taught', 'streak', 'checked', 'days'],
  },
];

/** A short line with a link to this page, for heroes and footers. */
export function HowLink({ children = 'How your numbers are worked out' }: { children?: ReactNode }) {
  return <Link to={HOW_PATH}>{children}</Link>;
}
