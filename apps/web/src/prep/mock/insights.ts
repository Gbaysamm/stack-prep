/**
 * What a mock report says beyond the marks: where the time went, which topics went wrong, how
 * this mock compares with the earlier ones, and what to do next. Pure functions over the report
 * and the history, so the page only draws.
 */

import type { MockReport, MockSummary, ReportItem, SubjectResult, Tally, TopicResult } from '../mockApi.js';

/** The UTME gives two hours for 180 questions: forty seconds a question. */
export const JAMB_SECONDS_PER_QUESTION = 40;
const JAMB_MS = JAMB_SECONDS_PER_QUESTION * 1000;

/** "42s", "3m 05s", "1h 02m". Under a second reads as "0s". */
export function durationText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** The same, said in words for a sentence: "42 seconds", "2 minutes", "1 minute 20 seconds". */
export function durationWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  // Rounded to the nearest 10 seconds: "1 minute 20 seconds", not "1 minute 17 seconds".
  const t = Math.round(s / 10) * 10;
  const m = Math.floor(t / 60);
  const r = t % 60;
  const mins = `${m} minute${m === 1 ? '' : 's'}`;
  return r ? `${mins} ${r} seconds` : mins;
}

export type Pace = 'quick' | 'on' | 'slow' | 'very-slow';

/** How an average time per question sits against JAMB's forty seconds. */
export function paceOf(avgMs: number): Pace {
  if (avgMs <= JAMB_MS * 0.6) return 'quick';
  if (avgMs <= JAMB_MS * 1.1) return 'on';
  if (avgMs <= JAMB_MS * 1.6) return 'slow';
  return 'very-slow';
}

export const PACE_WORD: Record<Pace, string> = {
  quick: 'Quick',
  on: 'On pace',
  slow: 'A bit slow',
  'very-slow': 'Too slow',
};

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export interface Located {
  /** Index of the subject in the report, and of the item in its subject: what the modal opens. */
  s: number;
  i: number;
  subject: SubjectResult;
  item: ReportItem;
}

export interface SubjectTime {
  subject: SubjectResult;
  ms: number;
  /** Questions with any time on them: the ones opened. */
  opened: number;
  avgMs: number | null;
  rightAvgMs: number | null;
  wrongAvgMs: number | null;
}

export interface TimeStats {
  /** False when the room recorded no time per question (an older mock). */
  recorded: boolean;
  totalMs: number;
  opened: number;
  avgMs: number | null;
  rightAvgMs: number | null;
  wrongAvgMs: number | null;
  /** Opened but left without an answer. */
  skippedAvgMs: number | null;
  subjects: SubjectTime[];
  /** The longest questions, slowest first. */
  slowest: Located[];
  /** How many questions took how long, coloured by how they went. */
  buckets: { label: string; fromS: number; right: number; wrong: number; unanswered: number }[];
}

const BUCKETS: [string, number][] = [
  ['<20s', 0],
  ['20–40s', 20],
  ['40–60s', 40],
  ['1–1½m', 60],
  ['1½–2m', 90],
  ['2m+', 120],
];

export function located(report: MockReport): Located[] {
  return report.subjects.flatMap((subject, s) => subject.items.map((item, i) => ({ s, i, subject, item })));
}

export function timeStats(report: MockReport, slowestCount = 6): TimeStats {
  const all = located(report);
  const opened = all.filter((q) => q.item.response_ms > 0);
  const ms = (list: Located[]) => list.map((q) => q.item.response_ms);
  const by = (outcome: ReportItem['outcome']) => opened.filter((q) => q.item.outcome === outcome);
  const totalMs = opened.reduce((sum, q) => sum + q.item.response_ms, 0);
  const buckets = BUCKETS.map(([label, fromS]) => ({ label, fromS, right: 0, wrong: 0, unanswered: 0 }));
  for (const q of opened) {
    const seconds = q.item.response_ms / 1000;
    let index = 0;
    BUCKETS.forEach(([, from], at) => {
      if (seconds >= from) index = at;
    });
    buckets[index]![q.item.outcome] += 1;
  }
  return {
    recorded: opened.length > 0,
    totalMs,
    opened: opened.length,
    avgMs: average(ms(opened)),
    rightAvgMs: average(ms(by('right'))),
    wrongAvgMs: average(ms(by('wrong'))),
    skippedAvgMs: average(ms(by('unanswered'))),
    subjects: report.subjects.map((subject) => {
      const mine = opened.filter((q) => q.subject === subject);
      return {
        subject,
        ms: mine.reduce((sum, q) => sum + q.item.response_ms, 0),
        opened: mine.length,
        avgMs: average(ms(mine)),
        rightAvgMs: average(ms(mine.filter((q) => q.item.outcome === 'right'))),
        wrongAvgMs: average(ms(mine.filter((q) => q.item.outcome === 'wrong'))),
      };
    }),
    slowest: [...opened].sort((a, b) => b.item.response_ms - a.item.response_ms).slice(0, slowestCount),
    buckets,
  };
}

export interface WeakTopic {
  topic: TopicResult;
  subject: SubjectResult;
  answered: number;
}

/** The topics with wrong answers, most wrong first, then the larger share wrong. */
export function weakTopics(report: MockReport, limit = 4): WeakTopic[] {
  return report.subjects
    .flatMap((subject) =>
      subject.topics
        .filter((topic) => topic.wrong > 0)
        .map((topic) => ({ topic, subject, answered: topic.correct + topic.wrong })),
    )
    .sort(
      (a, b) =>
        b.topic.wrong - a.topic.wrong ||
        b.topic.wrong / b.answered - a.topic.wrong / a.answered ||
        a.topic.name.localeCompare(b.topic.name),
    )
    .slice(0, limit);
}

export interface TrendPoint {
  mockId: string;
  at: string;
  percent: number;
  subjects: Record<string, number | null>;
  current: boolean;
}

/**
 * Every mock up to and including this one that has a score, oldest first. A mock with no
 * answers has no score, so it is left out rather than drawn as a zero.
 */
export function trendOf(history: MockSummary[], report: MockReport): TrendPoint[] {
  const until = new Date(report.started_at).getTime();
  return history
    .filter(
      (mock) =>
        mock.status === 'submitted' &&
        mock.overall?.percent !== null &&
        mock.overall !== null &&
        new Date(mock.started_at).getTime() <= until,
    )
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .map((mock) => ({
      mockId: mock.mock_id,
      at: mock.started_at,
      percent: mock.overall!.percent!,
      subjects: Object.fromEntries(mock.subjects.map((s) => [s.subject_id, s.tally.percent])),
      current: mock.mock_id === report.mock_id,
    }));
}

/** The latest scored mock before this one, if there is one. */
export function previousOf(history: MockSummary[], report: MockReport): MockSummary | null {
  const until = new Date(report.started_at).getTime();
  return (
    history
      .filter(
        (mock) =>
          mock.mock_id !== report.mock_id &&
          mock.status === 'submitted' &&
          mock.overall?.percent != null &&
          new Date(mock.started_at).getTime() < until,
      )
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0] ?? null
  );
}

/** This mock's percent against an earlier one's, when both have one. */
export function change(now: Tally | null | undefined, before: Tally | null | undefined): number | null {
  if (now?.percent == null || before?.percent == null) return null;
  return now.percent - before.percent;
}

/**
 * Two or three plain things to do next, built from the data. Most useful first: answer every
 * question, fix the weakest topic, stop sinking time into the ones that go wrong, then pace.
 */
export function nextSteps(
  report: MockReport,
  time: TimeStats,
  weak: WeakTopic[],
  previous: MockSummary | null,
): string[] {
  const steps: string[] = [];
  const o = report.overall;
  const usedAll = report.auto_submitted;
  const spare = Math.max(0, report.duration_minutes * 60 - report.time_used_seconds);

  if (o.answered === 0) {
    steps.push(
      usedAll
        ? 'Time ran out before any answer was saved. Next time, pick an answer for every question as you go and flag the hard ones to come back to.'
        : 'You handed in without answering. Sit a shorter mock, one subject and 20 questions, to warm up.',
    );
    if (usedAll) {
      steps.push(
        'To get a feel for the clock, sit a shorter mock first: one subject, 20 questions, 15 minutes. That is close to JAMB’s pace.',
      );
    }
  } else if (o.unanswered > 0) {
    steps.push(
      usedAll
        ? `${o.unanswered} question${o.unanswered === 1 ? ' was' : 's were'} left blank when time ran out. JAMB takes no marks off for a wrong answer, so answer every question, even with a guess.`
        : spare >= 60
          ? `You handed in with ${o.unanswered} unanswered and ${durationWords(spare * 1000)} left. Use spare time on the blanks: a guess can only help.`
          : `You left ${o.unanswered} unanswered. JAMB takes no marks off for a wrong answer, so never leave one blank.`,
    );
  }

  const top = weak[0];
  if (top) {
    const many = report.subjects.length > 1 ? ` in ${top.subject.name}` : '';
    const { wrong } = top.topic;
    const how =
      wrong < top.answered
        ? `${wrong} of the ${top.answered} you answered there ${wrong === 1 ? 'was' : 'were'} wrong`
        : top.answered === 1
          ? 'the one you answered there was wrong'
          : top.answered === 2
            ? 'both you answered there were wrong'
            : `all ${top.answered} you answered there were wrong`;
    steps.push(`Practise ${top.topic.name}${many} first: ${how}.`);
  }

  // Time sunk into wrong answers, in the subject where it is worst.
  const sink = time.subjects
    .filter((s) => s.wrongAvgMs !== null && s.wrongAvgMs >= 60_000)
    .sort((a, b) => b.wrongAvgMs! - a.wrongAvgMs!)[0];
  if (sink) {
    steps.push(
      `You spent ${durationWords(sink.wrongAvgMs!)} on average on ${sink.subject.name} questions you got wrong. If one isn't coming after a minute, pick your best guess, flag it, and come back.`,
    );
  } else if (time.avgMs !== null && paceOf(time.avgMs) === 'very-slow') {
    steps.push(
      `You averaged ${durationWords(time.avgMs)} a question; JAMB allows about ${JAMB_SECONDS_PER_QUESTION} seconds. Timed practice runs will bring that down.`,
    );
  } else if (time.avgMs !== null && paceOf(time.avgMs) === 'quick' && o.percent !== null && o.percent < 50) {
    steps.push(
      `You averaged ${durationWords(time.avgMs)} a question, well under JAMB's ${JAMB_SECONDS_PER_QUESTION} seconds, and ${o.percent}% were right. Slow down and read every option before you choose.`,
    );
  }

  const moved = change(o, previous?.overall);
  if (steps.length < 3 && moved !== null && moved > 0) {
    steps.push(`You're up ${moved} points on your last mock. Keep the same routine and sit another next week.`);
  }
  if (steps.length < 3 && o.answered > 0) {
    const best = [...report.subjects]
      .filter((s) => s.tally.percent !== null && s.tally.answered >= 5)
      .sort((a, b) => b.tally.percent! - a.tally.percent!)[0];
    if (best && best.tally.percent! >= 70 && report.subjects.length > 1) {
      steps.push(`${best.name} is your strongest at ${best.tally.percent}%. A short run each week keeps it there.`);
    }
  }
  if (steps.length === 0) {
    steps.push('A strong mock. Sit your next scheduled mock, in JAMB’s format, to check it holds up.');
  }
  return steps.slice(0, 3);
}
