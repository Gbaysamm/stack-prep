/**
 * Exams & subjects: the student's exam and the subjects they are sitting, with a way to add or
 * remove one in place (redesigned 17 Nov 2026). Test examinations and the old sandbox stay out
 * of sight.
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { api, type ExaminationOffer, type Goal, type SubjectOffer } from '../../student/api.js';
import { IconArrowRight, IconBook, IconClose, IconReplay } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { initials, toneStyle } from '../subjectTone.js';
import { Button, Dialog, Skeleton, cx, daysUntil, useToast } from '../ui.js';
import { Section } from './Home.js';
import './Exams.css';

/** The sandbox: a demo set from the early days. Kept out of the student app. */
export const isPracticeExam = (exam: ExaminationOffer) => exam.short_name.toUpperCase() === 'SANDBOX';
/** Examinations a student never sees: pipeline tests (PR…) and the sandbox. */
export const isHiddenExam = (exam: ExaminationOffer) =>
  exam.short_name.toUpperCase().startsWith('PR') || isPracticeExam(exam);

/** The exams a student can choose, hidden ones dropped, in name order. */
export function orderExams(exams: ExaminationOffer[]): ExaminationOffer[] {
  return exams.filter((exam) => !isHiddenExam(exam)).sort((a, b) => a.short_name.localeCompare(b.short_name));
}

/** "Unified Tertiary Matriculation Examination (UTME)" reads better without the repeat. */
export const examTitle = (exam: ExaminationOffer) =>
  exam.name.replace(new RegExp(`\\s*\\(${exam.short_name}\\)\\s*$`, 'i'), '').trim() || exam.name;

/** A left-aligned message card: icon and title on one line, the words and the button beneath. */
export function ExNote({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sj-card ex-note">
      <div className="ex-note-head">
        <span className="ex-ico" aria-hidden="true">
          {icon}
        </span>
        <h3 className="sj-display sj-h3">{title}</h3>
      </div>
      {children ? <p>{children}</p> : null}
      {action ? <div className="ex-note-actions">{action}</div> : null}
    </div>
  );
}

/** "Joint Admissions and Matriculation Board (JAMB)" reads as "JAMB" where space is short. */
function bodyShort(body: string): string {
  const acronym = /\(([A-Z]{2,})\)\s*$/.exec(body);
  return acronym ? acronym[1]! : body;
}

/* ------------------------------------------------------------------ the page (redesigned 17 Nov 2026) */

/**
 * One page for the exam and its subjects (founder, 17 Nov 2026): the student's own subjects,
 * each with a way to remove it, and a card to add another, chosen in a popup. Only the
 * subjects the student is sitting are shown; no question counts, no wall of every subject.
 */
export function Exams() {
  usePageTitle('Exams');
  const student = useStudent();
  const load = useLoad(
    () => Promise.all([api.catalogue(), api.goals(student.studentId).catch(() => [] as Goal[])]),
    [student.studentId],
  );
  const exams = load.data ? orderExams(load.data[0]) : [];
  const goals = load.data?.[1] ?? [];
  const goalIds = new Set(goals.map((goal) => goal.subject_id));
  const chosenIn = (exam: ExaminationOffer) => exam.subjects.filter((s) => goalIds.has(s.subject_id)).length;
  // The exam the student is working towards first, then the rest.
  const ordered = [...exams].sort((a, b) => chosenIn(b) - chosenIn(a));
  const [mainExam, ...otherExams] = ordered;

  return (
    <div className="sj-page ex2">
      <Section
        eyebrow="Exams"
        title="Your exam"
        id="ex2-title"
        className="ex2-first"
        sub="The exam you are sitting and the subjects you sit in it."
      >
        {load.error && !load.data ? (
          <ExNote
            icon={<IconReplay size={18} />}
            title="We could not load your exam"
            action={
              <Button tone="soft" onClick={load.reload}>
                Try again
              </Button>
            }
          >
            {load.error}
          </ExNote>
        ) : !load.data ? (
          <div className="ex2-card" aria-busy="true" aria-label="Loading your exam">
            <div className="ex2-head">
              <div className="ex2-id">
                <Skeleton height={12} width={90} />
                <Skeleton height={30} width={120} />
                <Skeleton height={14} width={260} />
              </div>
            </div>
            <div className="ex2-subjects">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={76} radius={8} />
              ))}
            </div>
          </div>
        ) : !mainExam ? (
          <ExNote icon={<IconBook size={18} />} title="No exams are open yet">
            Exams appear here as soon as their questions have been checked. Look again soon.
          </ExNote>
        ) : (
          <ExamPanel exam={mainExam} goals={goals} onChanged={load.reload} />
        )}
      </Section>

      {otherExams.length > 0 ? (
        <Section eyebrow="Other exams" title="Also open" id="ex2-others" className="ex2-others">
          <div className="ex2-other-list">
            {otherExams.map((exam) => (
              <ExamPanel key={exam.examination_id} exam={exam} goals={goals} onChanged={load.reload} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/**
 * One exam (second pass, 17 Nov 2026): a coloured card with the exam and its countdown, three
 * facts about how it is sat, then the student's subjects, each in its own colour. An exam with
 * a fixed number of subjects (UTME: four) never drops below it: a subject is swapped, not
 * removed. Use of English, which everyone sits, is neither.
 */
function ExamPanel({ exam, goals, onChanged }: { exam: ExaminationOffer; goals: Goal[]; onChanged: () => void }) {
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const goalOf = (subjectId: string) => goals.find((goal) => goal.subject_id === subjectId);
  const mine = exam.subjects
    .filter((s) => goalOf(s.subject_id))
    .sort((a, b) => Number(b.compulsory) - Number(a.compulsory) || a.name.localeCompare(b.name));
  const canAdd = exam.subjects.filter((s) => s.ready && !goalOf(s.subject_id));
  const max = exam.max_subjects;
  const fixed = max !== null;
  const compulsory = exam.subjects.filter((s) => s.compulsory).map((s) => s.name);
  // Picking: a subject to add (swapOut null) or one to put in place of `swapOut`.
  const [picking, setPicking] = useState<{ swapOut: SubjectOffer | null } | null>(null);
  const [removing, setRemoving] = useState<SubjectOffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const withDate = mine.map((s) => goalOf(s.subject_id)).find((g) => g?.exam_date);
  const days = daysUntil(withDate?.exam_date);
  const dateText = withDate?.exam_date
    ? new Date(`${withDate.exam_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  /** The settings a new subject takes: the one it replaces, else any set for this exam. */
  const settingsFrom = (from: Goal | undefined) => {
    const source = from?.exam_date && from.target_score != null ? from : mine.map((s) => goalOf(s.subject_id)).find((g) => g?.exam_date && g.target_score != null);
    if (!source || !source.exam_date || source.target_score == null) return null;
    return {
      target_score: source.target_score,
      exam_date: source.exam_date,
      minutes_per_day: source.minutes_per_day ?? 30,
      study_days: source.study_days ?? [1, 2, 3, 4, 5],
    };
  };

  const choose = async (subject: SubjectOffer) => {
    const swapOut = picking?.swapOut ?? null;
    const settings = settingsFrom(swapOut ? goalOf(swapOut.subject_id) : undefined);
    if (!settings) {
      navigate(`/subjects/${subject.subject_id}/goal`);
      return;
    }
    setBusy(subject.subject_id);
    try {
      if (swapOut) await api.removeGoal(student.studentId, swapOut.subject_id);
      try {
        await api.setGoal(student.studentId, subject.subject_id, settings);
      } catch (error) {
        // Put the old one back, so a failed swap never leaves the student a subject short.
        if (swapOut) await api.setGoal(student.studentId, swapOut.subject_id, settings).catch(() => undefined);
        throw error;
      }
      setPicking(null);
      toast(swapOut ? `${swapOut.name} swapped for ${subject.name}` : `${subject.name} added`);
      onChanged();
    } catch (error) {
      toast(friendly(error as Error) || 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (subject: SubjectOffer) => {
    setBusy(subject.subject_id);
    try {
      await api.removeGoal(student.studentId, subject.subject_id);
      setRemoving(null);
      toast(`${subject.name} removed`);
      onChanged();
    } catch (error) {
      toast(friendly(error as Error) || 'Couldn’t remove it. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const facts = [
    fixed ? { tone: 'blue', big: String(max), small: `subjects in ${exam.short_name}` } : null,
    compulsory.length > 0
      ? { tone: 'yellow', big: compulsory.join(' and '), small: compulsory.length === 1 ? 'everyone sits it' : 'everyone sits them' }
      : null,
    exam.sits_together
      ? { tone: 'green', big: 'One day', small: 'all papers sat together' }
      : { tone: 'green', big: 'Paper by paper', small: 'each subject has its own day' },
  ].filter(Boolean) as { tone: string; big: string; small: string }[];

  return (
    <div className="ex3">
      <div className="ex3-hero">
        <div className="ex3-id">
          <span className="ex3-body">Set by {bodyShort(exam.exam_body)}</span>
          <h3 className="sj-display ex3-short">{exam.short_name}</h3>
          <span className="ex3-name">{examTitle(exam)}</span>
          {fixed ? (
            <span className="ex3-places">
              <span className="ex3-cells" aria-hidden="true">
                {Array.from({ length: max }, (_, i) => (
                  <i key={i} className={cx(i < mine.length && 'on')} />
                ))}
              </span>
              <b className="sj-num">{mine.length}</b> of {max} subjects chosen
            </span>
          ) : null}
        </div>
        {days !== null && days >= 0 ? (
          <div className="ex3-count">
            <b className="sj-num">{days}</b>
            <span>{days === 1 ? 'day to go' : 'days to go'}</span>
            {dateText ? <small>{dateText}</small> : null}
          </div>
        ) : null}
      </div>

      <ul className="ex3-facts">
        {facts.map((fact) => (
          <li key={fact.small} className={fact.tone}>
            <b>{fact.big}</b>
            <span>{fact.small}</span>
          </li>
        ))}
      </ul>

      <div className="ex3-subhead">
        <h4 className="sj-display">Your subjects</h4>
        {fixed && mine.length >= max ? <span>Swap one to change it. You always keep {max}.</span> : null}
      </div>

      {mine.length === 0 ? (
        <div className="ex3-empty">
          <p>You haven’t chosen your {exam.short_name} subjects yet.</p>
          <Button onClick={() => setPicking({ swapOut: null })} trailing={<IconArrowRight size={18} />}>
            Choose subjects
          </Button>
        </div>
      ) : (
        <ul className="ex3-subjects">
          {mine.map((subject) => {
            const goal = goalOf(subject.subject_id);
            return (
              <li key={subject.subject_id} className="ex3-subject" style={toneStyle(subject.name) as CSSProperties}>
                <Link to={`/subjects/${subject.subject_id}`} className="ex3-subject-main">
                  <span className="ex3-tile sj-display" aria-hidden="true">
                    {initials(subject.name)}
                  </span>
                  <span className="ex3-subject-text">
                    <b className="sj-display">{subject.name}</b>
                    <small>{goal?.target_score != null ? `Target ${Math.round(goal.target_score)}%` : 'No target yet'}</small>
                  </span>
                </Link>
                <span className="ex3-subject-foot">
                  {subject.compulsory ? (
                    <span className="ex3-tag">Compulsory</span>
                  ) : fixed ? (
                    <button type="button" className="ex3-act" onClick={() => setPicking({ swapOut: subject })}>
                      <IconReplay size={14} /> Swap
                    </button>
                  ) : (
                    <button type="button" className="ex3-act" onClick={() => setRemoving(subject)}>
                      <IconClose size={14} /> Remove
                    </button>
                  )}
                  <Link to={`/subjects/${subject.subject_id}`} className="ex3-open" aria-label={`Open ${subject.name}`}>
                    <IconArrowRight size={16} />
                  </Link>
                </span>
              </li>
            );
          })}
          {(!fixed || mine.length < max) && canAdd.length > 0 ? (
            <li>
              <button type="button" className="ex3-add" onClick={() => setPicking({ swapOut: null })}>
                <span className="ex3-plus" aria-hidden="true">
                  +
                </span>
                {fixed ? `Add your ${['', 'first', 'second', 'third', 'fourth', 'fifth'][mine.length + 1] ?? 'next'} subject` : 'Add a subject'}
              </button>
            </li>
          ) : null}
        </ul>
      )}

      <Dialog
        open={picking !== null}
        onClose={() => busy === null && setPicking(null)}
        title={picking?.swapOut ? `Swap ${picking.swapOut.name} for…` : 'Add a subject'}
      >
        {canAdd.length === 0 ? (
          <p className="ex2-dialog-text">Every subject open in {exam.short_name} is already on your list.</p>
        ) : (
          <>
            {picking?.swapOut ? (
              <p className="ex2-dialog-text">
                Your answers in {picking.swapOut.name} are kept, and count again if you swap it back.
              </p>
            ) : null}
            <ul className="ex3-pick">
              {canAdd.map((subject) => (
                <li key={subject.subject_id} style={toneStyle(subject.name) as CSSProperties}>
                  <span className="ex3-tile sm sj-display" aria-hidden="true">
                    {initials(subject.name)}
                  </span>
                  <span className="ex3-pick-name">{subject.name}</span>
                  <Button
                    size="sm"
                    tone="soft"
                    busy={busy === subject.subject_id}
                    disabled={busy !== null}
                    onClick={() => void choose(subject)}
                  >
                    {picking?.swapOut ? 'Swap in' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => busy === null && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : 'Remove'}
        actions={
          <>
            <Button tone="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button tone="danger" busy={removing !== null && busy === removing.subject_id} onClick={() => removing && void remove(removing)}>
              Remove
            </Button>
          </>
        }
      >
        <p className="ex2-dialog-text">
          It leaves your list and your roadmap. Your answers in it are kept, and count again if you add it back.
        </p>
      </Dialog>
    </div>
  );
}
