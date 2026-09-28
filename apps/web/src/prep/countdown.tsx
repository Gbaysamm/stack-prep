/**
 * What "days to exam" means, in one place.
 *
 * A countdown is per EXAM, never per subject:
 *
 *  - An exam sat in one sitting (UTME) has one day. Every subject is sat on it, so the count is
 *    to that day: "UTME · 46 days".
 *  - An exam sat paper by paper (WAEC, NECO) counts to the nearest paper still to come, and
 *    says which: "WAEC · next paper: Physics in 12 days". Papers on the same day are named
 *    together. Once a paper's day has passed, the count moves on to the next one.
 *  - A student preparing for more than one exam sees the nearest first.
 *
 * The server works the numbers out (overview.exams); this file only words them.
 */

import { useEffect, useState } from 'react';

import { GOALS_CHANGED } from '../student/api.js';
import { progressApi, type ExamCountdown, type Overview } from './progressApi.js';
import { InfoTip } from './ui.js';

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function plainDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "Fri 13 Nov" — the exam day, short enough for the sidebar. */
export function examDay(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The exams that still have a day to come, nearest first (the server's order). */
export function upcomingExams(exams: ExamCountdown[] | undefined): ExamCountdown[] {
  return (exams ?? []).filter((exam) => exam.days_to_next != null && exam.days_to_next >= 0);
}

/** "46 days" / "today" for an exam sat together; "Physics in 12 days" / "Physics today" per paper. */
export function whenText(exam: ExamCountdown): string {
  const days = exam.days_to_next ?? 0;
  if (exam.sits_together) return days === 0 ? 'today' : plainDays(days);
  const paper = listNames(exam.next_subject_names);
  return days === 0 ? `${paper} today` : `${paper} in ${plainDays(days)}`;
}

/** The one line a chip or a hero note carries: "UTME · 46 days", "WAEC · next paper: Physics in 12 days". */
export function countdownLine(exam: ExamCountdown): string {
  if (exam.sits_together) return `${exam.short_name} · ${whenText(exam)}`;
  const many = exam.next_subject_names.length > 1;
  return `${exam.short_name} · next ${many ? 'papers' : 'paper'}: ${whenText(exam)}`;
}

/** Under the big number: "to UTME, Tue 1 Dec", or per paper "to WAEC Physics". */
export function countdownTo(exam: ExamCountdown): string {
  if (exam.sits_together) return `to ${exam.short_name}, ${examDay(exam.next_date)}`;
  return `to ${exam.short_name} ${listNames(exam.next_subject_names)}`;
}

/** The quiet line beneath: who sits that day, or the paper's day and how many are left. */
export function countdownNote(exam: ExamCountdown): string | null {
  const dated = exam.papers.filter((paper) => paper.exam_date);
  if (exam.sits_together) {
    if (dated.length < 2) return null;
    return dated.length === 2 ? 'Both subjects, sat together' : `All ${dated.length} subjects, sat together`;
  }
  const day = examDay(exam.next_date);
  const left = dated.filter((paper) => (paper.days_to_exam ?? -1) >= 0).length;
  const after = left - exam.next_subject_names.length;
  if (after <= 0) return `${day} · your last ${exam.next_subject_names.length > 1 ? 'papers' : 'paper'}`;
  return `${day} · then ${after} more ${after === 1 ? 'paper' : 'papers'}`;
}

/*
 * The student's exam countdowns, kept fresh. The shell already holds an overview; when a goal is
 * saved or removed anywhere in the app, one shared request fetches the new dates for every
 * countdown on screen. Saves that land while it is in flight (onboarding saves every subject at
 * once) get one more fetch afterwards, so the last word is always the latest.
 */
const store: { studentId: string; exams: ExamCountdown[] | undefined; busy: boolean; again: boolean } = {
  studentId: '',
  exams: undefined,
  busy: false,
  again: false,
};
const listeners = new Set<() => void>();
/** Who the one window listener fetches for: the student whose shell is on screen. */
let watching = '';
let listening = false;

function refresh(studentId: string) {
  if (store.busy) {
    store.again = true;
    return;
  }
  store.busy = true;
  progressApi
    .overview(studentId)
    .then((next) => {
      store.studentId = studentId;
      store.exams = next.exams;
      listeners.forEach((listener) => listener());
    })
    .catch(() => undefined)
    .finally(() => {
      store.busy = false;
      if (store.again) {
        store.again = false;
        refresh(studentId);
      }
    });
}

export function useExamCountdowns(studentId: string, overview: Overview | undefined): ExamCountdown[] | undefined {
  const [fresh, setFresh] = useState<ExamCountdown[] | undefined>(() =>
    store.studentId === studentId ? store.exams : undefined,
  );
  useEffect(() => {
    // Nothing handed in and nothing fetched yet for this student: fetch once.
    if (!overview && store.studentId !== studentId) refresh(studentId);
    const listener = () => {
      if (store.studentId === studentId) setFresh(store.exams);
    };
    watching = studentId;
    listeners.add(listener);
    // One listener for the whole app, however many countdowns are drawn: one fetch per save.
    if (!listening) {
      listening = true;
      window.addEventListener(GOALS_CHANGED, () => {
        if (watching) refresh(watching);
      });
    }
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);
  return fresh ?? overview?.exams;
}

/** The ⓘ that says how the countdown is worked out. */
export function CountdownTip({ onDark, className }: { onDark?: boolean; className?: string }) {
  return (
    <InfoTip
      title="Days to your exam"
      label="How the exam countdown is worked out"
      onDark={onDark}
      className={className}
      example={
        <>
          Your WAEC Physics paper is on 12 May and Chemistry on 15 May. Until 12 May the countdown is to Physics; the day
          after, it moves on to Chemistry.
        </>
      }
    >
      <p>We count calendar days from today to your next exam day.</p>
      <p>
        <b>UTME</b>: all your subjects are sat together on one day, so there is one date and one countdown.
      </p>
      <p>
        <b>WAEC and NECO</b>: each paper has its own day, and some share a day. We count to the nearest paper still to
        come and name it.
      </p>
      <p>Preparing for more than one exam? The nearest comes first.</p>
    </InfoTip>
  );
}
