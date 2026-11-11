import { describe, expect, it } from 'vitest';

import { leastTime } from './studyTime.js';

// Tuesday 1 December 2026, so weekdays and the exam phase are easy to count.
const today = new Date(2026, 11, 1);
const iso = (daysAhead: number) => {
  const d = new Date(Date.UTC(2026, 11, 1 + daysAhead));
  return d.toISOString().slice(0, 10);
};
const WEEKDAYS = [1, 2, 3, 4, 5];
// Use of English and three sciences: about 230 topics.
const four = (date: string) => [18, 73, 69, 68].map((topics) => ({ topics, date }));

describe('leastTime', () => {
  it('is nothing until there is an exam day to come', () => {
    expect(leastTime(four(''), WEEKDAYS, today)).toBeNull();
    expect(leastTime(four(iso(-3)), WEEKDAYS, today)).toBeNull();
  });

  it('asks for more time a day the closer the exam is', () => {
    const far = leastTime(four(iso(182)), WEEKDAYS, today)!;
    const mid = leastTime(four(iso(91)), WEEKDAYS, today)!;
    const near = leastTime(four(iso(30)), WEEKDAYS, today)!;
    expect(far.minutes).toBe(30);
    expect(mid.minutes).toBe(75);
    expect(far.minutes).toBeLessThan(mid.minutes);
    // A month out, four subjects need 4.5 hours a day, inside the five-hour cap.
    expect(near).toMatchObject({ minutes: 270, enough: true, daysLeft: 30 });
  });

  it('caps at five hours and says when even that is not enough', () => {
    expect(leastTime(four(iso(7)), WEEKDAYS, today)).toMatchObject({ minutes: 300, enough: false });
  });

  it('is always a whole number of 15-minute runs, at least one', () => {
    const one = leastTime([{ topics: 3, date: iso(365) }], WEEKDAYS, today)!;
    expect(one).toMatchObject({ minutes: 15, enough: true });
  });

  it('counts the days the student studies', () => {
    const weekdays = leastTime(four(iso(91)), WEEKDAYS, today)!;
    const everyDay = leastTime(four(iso(91)), [1, 2, 3, 4, 5, 6, 7], today)!;
    expect(everyDay.minutes).toBeLessThan(weekdays.minutes);
  });

  it('says when studying every day would be enough', () => {
    const tight = leastTime([{ topics: 73, date: iso(14) }], [1, 3, 5], today)!;
    expect(tight.enough).toBe(false);
    expect(tight.everyDayWouldDo).toBe(true);
  });
});
