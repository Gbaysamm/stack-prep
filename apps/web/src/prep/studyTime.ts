/**
 * The least time a day that lets the roadmap work: every subtopic the student is sitting gets at
 * least one run before its exam, around the planner's own rules (packages/engine roadmap.py):
 *
 * - a run is about RUN_MINUTES (15) minutes, and at most MAX_RUNS_PER_DAY (6) fit a day;
 * - in the exam phase (the last 42 days) 40% of runs are mixed practice, so only 60% of those
 *   days' runs can go to covering topics.
 *
 * So the least runs a day = the topics ÷ the study days that count (exam-phase days as 0.6),
 * rounded up. Less than that and some topics would never be reached, however hard the plan
 * works; this is a floor, not what reaching a high target takes.
 */

export const RUN_MINUTES = 15;
export const MAX_RUNS_PER_DAY = 6;
const EXAM_PHASE_DAYS = 42;
const MIXED_SHARE = 0.4;

export interface TopicsBy {
  /** Subtopics we teach in the subject (the catalogue's teachable_topics). */
  topics: number;
  /** Its exam day, YYYY-MM-DD; '' when not picked yet. */
  date: string;
}

export interface LeastTime {
  /** The least minutes a study day: a whole number of runs, at most the daily cap. */
  minutes: number;
  /** Days from today to the nearest exam day still to come. */
  daysLeft: number;
  /** False when even the daily cap on these days cannot reach every topic in time. */
  enough: boolean;
  /** Whether studying every day (at the cap) would be enough. */
  everyDayWouldDo: boolean;
}

const dayNumber = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5 : null;
};

/** Study days from today up to (not including) the exam day, exam-phase days counted at 0.6. */
function countingDays(today: number, exam: number, studyDays: number[]): number {
  let total = 0;
  for (let day = today; day < exam; day += 1) {
    const weekday = ((new Date(day * 864e5).getUTCDay() + 6) % 7) + 1; // Mon 1 … Sun 7
    if (!studyDays.includes(weekday)) continue;
    total += exam - day <= EXAM_PHASE_DAYS ? 1 - MIXED_SHARE : 1;
  }
  return total;
}

function runsNeeded(subjects: TopicsBy[], studyDays: number[], today: number): number {
  let runs = 0;
  for (const { topics, date } of subjects) {
    const exam = dayNumber(date);
    if (exam == null || exam <= today || topics <= 0) continue;
    const days = countingDays(today, exam, studyDays);
    runs += days > 0 ? topics / days : Infinity;
  }
  return runs;
}

/** Null until there is at least one exam day still to come. */
export function leastTime(subjects: TopicsBy[], studyDays: number[], now = new Date()): LeastTime | null {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
  const upcoming = subjects.map((s) => dayNumber(s.date)).filter((d): d is number => d != null && d > today);
  if (!upcoming.length) return null;
  const runs = Math.max(1, Math.ceil(runsNeeded(subjects, studyDays, today) - 1e-9));
  return {
    minutes: Math.min(runs, MAX_RUNS_PER_DAY) * RUN_MINUTES,
    daysLeft: Math.min(...upcoming) - today,
    enough: runs <= MAX_RUNS_PER_DAY,
    everyDayWouldDo: Math.ceil(runsNeeded(subjects, [1, 2, 3, 4, 5, 6, 7], today) - 1e-9) <= MAX_RUNS_PER_DAY,
  };
}
