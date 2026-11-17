/**
 * Swap one subject for another, in place (founder, 17 Nov 2026: swap from the subject's own
 * card). The new subject takes the old one's target, exam date and study time; if adding it
 * fails, the old one is put back, so the student is never a subject short.
 */

import { useState, type ReactNode } from 'react';

import { friendly } from '../lib/friendlyError.js';
import { api, type ExaminationOffer, type Goal, type SubjectOffer } from '../student/api.js';
import { useStudent } from './store.js';
import { initials } from './subjectTone.js';
import { Button, Dialog, useToast } from './ui.js';
import './pages/Exams.css';
import './pages/Subjects.css';

export function useSwap(exams: ExaminationOffer[], goals: Goal[], onChanged: () => void) {
  const student = useStudent();
  const toast = useToast();
  const [out, setOut] = useState<{ subject: SubjectOffer; exam: ExaminationOffer } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = new Set(goals.map((g) => g.subject_id));

  /** Open the swap for a subject, by id. */
  const start = (subjectId: string) => {
    for (const exam of exams) {
      const subject = exam.subjects.find((s) => s.subject_id === subjectId);
      if (subject) {
        setOut({ subject, exam });
        return;
      }
    }
  };

  const swapIn = async (subject: SubjectOffer) => {
    if (!out) return;
    const old = goals.find((g) => g.subject_id === out.subject.subject_id);
    if (!old?.exam_date || old.target_score == null) return;
    const settings = {
      target_score: old.target_score,
      exam_date: old.exam_date,
      minutes_per_day: old.minutes_per_day ?? 30,
      study_days: old.study_days ?? [1, 2, 3, 4, 5],
    };
    setBusy(subject.subject_id);
    try {
      await api.removeGoal(student.studentId, out.subject.subject_id);
      try {
        await api.setGoal(student.studentId, subject.subject_id, settings);
      } catch (error) {
        await api.setGoal(student.studentId, out.subject.subject_id, settings).catch(() => undefined);
        throw error;
      }
      toast(`${out.subject.name} swapped for ${subject.name}`);
      setOut(null);
      onChanged();
    } catch (error) {
      toast(friendly(error as Error) || 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const options = out ? out.exam.subjects.filter((s) => s.ready && !chosen.has(s.subject_id)) : [];
  const dialog: ReactNode = (
    <Dialog open={out !== null} onClose={() => busy === null && setOut(null)} title={out ? `Swap ${out.subject.name} for…` : 'Swap'}>
      {options.length === 0 ? (
        <p className="ex2-dialog-text">Every subject open in {out?.exam.short_name} is already on your list.</p>
      ) : (
        <>
          <p className="ex2-dialog-text">
            Your answers in {out?.subject.name} are kept, and count again if you swap it back.
          </p>
          <ul className="ex4-pick">
            {options.map((subject) => (
              <li key={subject.subject_id}>
                <span className="ex4-tile sm sj-display" aria-hidden="true">
                  {initials(subject.name)}
                </span>
                <b>{subject.name}</b>
                <Button
                  size="sm"
                  tone="soft"
                  busy={busy === subject.subject_id}
                  disabled={busy !== null}
                  onClick={() => void swapIn(subject)}
                >
                  Swap in
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );

  return { start, dialog };
}
