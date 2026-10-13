import { describe, expect, it } from 'vitest';

import type { MockReport, MockSummary, ReportItem, SubjectResult, Tally } from '../mockApi.js';
import { durationText, durationWords, nextSteps, paceOf, previousOf, timeStats, trendOf, weakTopics } from './insights.js';

const tally = (questions: number, answered: number, correct: number): Tally => ({
  questions,
  answered,
  correct,
  wrong: answered - correct,
  unanswered: questions - answered,
  percent: answered ? Math.round((100 * correct) / answered) : null,
});

const item = (position: number, outcome: ReportItem['outcome'], ms: number, sub = 's1'): ReportItem => ({
  position,
  question_version_id: `q${position}-${sub}`,
  stem: '',
  instructions: null,
  passage_title: null,
  passage_body: null,
  options: [],
  figures: [],
  selected_option_key: outcome === 'unanswered' ? null : 'A',
  correct_option_key: 'A',
  flagged: false,
  outcome,
  solution_steps: [],
  response_ms: ms,
  subtopic_id: sub,
  subtopic_name: `Topic ${sub}`,
  topic_name: null,
});

function subject(id: string, name: string, items: ReportItem[]): SubjectResult {
  const right = items.filter((i) => i.outcome === 'right').length;
  const answered = items.filter((i) => i.outcome !== 'unanswered').length;
  const topics = [...new Set(items.map((i) => i.subtopic_id!))].map((sub) => {
    const mine = items.filter((i) => i.subtopic_id === sub);
    return {
      subtopic_id: sub,
      name: `Topic ${sub}`,
      topic_name: null,
      questions: mine.length,
      correct: mine.filter((i) => i.outcome === 'right').length,
      wrong: mine.filter((i) => i.outcome === 'wrong').length,
      unanswered: mine.filter((i) => i.outcome === 'unanswered').length,
    };
  });
  return {
    subject_id: id,
    session_id: `s-${id}`,
    code: name.slice(0, 3),
    name,
    tally: tally(items.length, answered, right),
    items,
    time_ms: items.reduce((a, i) => a + i.response_ms, 0),
    topics,
  };
}

function report(subjects: SubjectResult[], extra: Partial<MockReport> = {}): MockReport {
  const sum = (k: keyof Tally) => subjects.reduce((a, s) => a + (s.tally[k] ?? 0), 0);
  return {
    mock_id: 'm-now',
    preset: 'custom',
    duration_minutes: 30,
    started_at: '2026-10-13T10:00:00Z',
    deadline_at: '2026-10-13T10:30:00Z',
    submitted_at: '2026-10-13T10:30:00Z',
    auto_submitted: true,
    time_used_seconds: 1800,
    overall: tally(sum('questions'), sum('answered'), sum('correct')),
    subjects,
    integrity: {
      fullscreen_exits: 0,
      tab_switches: 0,
      window_blurs: 0,
      copy_blocked: 0,
      paste_blocked: 0,
      menu_blocked: 0,
      events: [],
    },
    ...extra,
  };
}

describe('mock insights', () => {
  it('says durations briefly and in words', () => {
    expect(durationText(42_000)).toBe('42s');
    expect(durationText(185_000)).toBe('3m 05s');
    expect(durationText(3_720_000)).toBe('1h 02m');
    expect(durationWords(120_000)).toBe('2 minutes');
    expect(durationWords(77_000)).toBe('1 minute 20 seconds');
    expect(paceOf(38_000)).toBe('on');
    expect(paceOf(90_000)).toBe('very-slow');
  });

  it('averages time by outcome and finds the slowest, skipping questions never opened', () => {
    const maths = subject('m', 'Maths', [
      item(1, 'right', 30_000),
      item(2, 'wrong', 150_000, 's2'),
      item(3, 'unanswered', 0),
      item(4, 'wrong', 90_000, 's2'),
    ]);
    const t = timeStats(report([maths]));
    expect(t.recorded).toBe(true);
    expect(t.opened).toBe(3);
    expect(t.rightAvgMs).toBe(30_000);
    expect(t.wrongAvgMs).toBe(120_000);
    expect(t.skippedAvgMs).toBeNull();
    expect(t.slowest.map((q) => q.item.position)).toEqual([2, 4, 1]);
    expect(t.buckets.map((b) => b.right + b.wrong + b.unanswered)).toEqual([0, 1, 0, 0, 1, 1]);
  });

  it('builds next steps from the data, the weak topic named', () => {
    const maths = subject('m', 'Maths', [
      item(1, 'right', 30_000),
      item(2, 'wrong', 150_000, 's2'),
      item(3, 'unanswered', 10_000),
      item(4, 'wrong', 90_000, 's2'),
    ]);
    const r = report([maths]);
    const weak = weakTopics(r);
    expect(weak[0]!.topic.subtopic_id).toBe('s2');
    const steps = nextSteps(r, timeStats(r), weak, null);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/left blank when time ran out/);
    expect(steps[1]).toBe('Practise Topic s2 first: both you answered there were wrong.');
    expect(steps[2]).toMatch(/2 minutes on average on Maths questions you got wrong/);
  });

  it('gives a clear step when nothing was answered, and no weak topics', () => {
    const r = report([subject('m', 'Maths', [item(1, 'unanswered', 0), item(2, 'unanswered', 0)])]);
    const time = timeStats(r);
    expect(time.recorded).toBe(false);
    expect(weakTopics(r)).toEqual([]);
    expect(nextSteps(r, time, [], null)[0]).toMatch(/^Time ran out before any answer was saved/);
  });

  it('draws the trend from scored mocks up to this one, oldest first', () => {
    const r = report([subject('m', 'Maths', [item(1, 'right', 1000)])]);
    const summary = (id: string, at: string, percent: number | null): MockSummary => ({
      mock_id: id,
      status: 'submitted',
      preset: 'custom',
      duration_minutes: 30,
      started_at: at,
      submitted_at: at,
      auto_submitted: false,
      overall: { ...tally(10, percent === null ? 0 : 10, percent === null ? 0 : percent / 10) },
      subjects: [],
      integrity_flags: 0,
    });
    const history = [
      summary('m-later', '2026-10-20T10:00:00Z', 90),
      summary('m-now', '2026-10-13T10:00:00Z', 100),
      summary('m-blank', '2026-10-10T10:00:00Z', null),
      summary('m-old', '2026-10-01T10:00:00Z', 40),
    ];
    expect(trendOf(history, r).map((p) => p.mockId)).toEqual(['m-old', 'm-now']);
    expect(previousOf(history, r)?.mock_id).toBe('m-old');
  });
});
