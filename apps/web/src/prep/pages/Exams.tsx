/**
 * Exams & subjects: the student's exam and the subjects they are sitting, with a way to add or
 * remove one in place (redesigned 17 Nov 2026). Test examinations and the old sandbox stay out
 * of sight.
 */

import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { api, type ExaminationOffer, type Goal, type SubjectOffer } from '../../student/api.js';
import { IconArrowRight, IconBook, IconClose, IconReplay } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { initials } from '../subjectTone.js';
import { Button, Dialog, PageHero, Skeleton, cx, daysUntil, useToast } from '../ui.js';
import { HeroStats, Section } from './Home.js';
import './Subjects.css';
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

/* ------------------------------------------------------------------ the page (third pass, 17 Nov 2026) */

/**
 * Drawn like the Roadmap (founder, 17 Nov 2026): the dark hero names the exam and counts the
 * days to it in lime; one white card lists the student's subjects with raised purple tiles.
 * An exam with a fixed number of subjects (UTME: four) never drops below it: a subject is
 * swapped, not removed; the compulsory one is neither.
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
  const ordered = [...exams].sort((a, b) => chosenIn(b) - chosenIn(a));
  const [mainExam, ...otherExams] = ordered;

  const dated = mainExam
    ? goals.find((g) => g.exam_date && mainExam.subjects.some((s) => s.subject_id === g.subject_id))
    : undefined;
  const days = daysUntil(dated?.exam_date);
  const dateText = dated?.exam_date
    ? new Date(`${dated.exam_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : undefined;

  return (
    <div className="sj-page ex4">
      <PageHero
        eyebrow={mainExam ? `Your exam · set by ${bodyShort(mainExam.exam_body)}` : 'Your exam'}
        title={mainExam ? mainExam.short_name : 'Your exam'}
        sub={mainExam ? examTitle(mainExam) : 'Choose the exam you are sitting.'}
        aside={
          days !== null && days >= 0 ? (
            <HeroStats stats={[{ label: 'Exam day', value: days, unit: days === 1 ? 'day' : 'days', tone: 'lime', note: dateText }]} />
          ) : undefined
        }
      />

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
        <Skeleton height={320} radius={12} />
      ) : !mainExam ? (
        <ExNote icon={<IconBook size={18} />} title="No exams are open yet">
          Exams appear here as soon as their questions have been checked. Look again soon.
        </ExNote>
      ) : (
        <>
          <ExamPanel exam={mainExam} goals={goals} onChanged={load.reload} />
          {otherExams.map((exam) => (
            <ExamPanel key={exam.examination_id} exam={exam} goals={goals} onChanged={load.reload} other />
          ))}
        </>
      )}
    </div>
  );
}

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

function ExamPanel({
  exam,
  goals,
  onChanged,
  other = false,
}: {
  exam: ExaminationOffer;
  goals: Goal[];
  onChanged: () => void;
  other?: boolean;
}) {
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
  const [picking, setPicking] = useState<{ swapOut: SubjectOffer | null } | null>(null);
  const [removing, setRemoving] = useState<SubjectOffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** The settings a new subject takes: the one it replaces, else any set for this exam. */
  const settingsFrom = (from: Goal | undefined) => {
    const source =
      from?.exam_date && from.target_score != null
        ? from
        : mine.map((s) => goalOf(s.subject_id)).find((g) => g?.exam_date && g.target_score != null);
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

  const rule = [
    fixed ? `${exam.short_name} is ${max} subjects` : null,
    compulsory.length > 0 ? `${compulsory.join(' and ')} ${compulsory.length === 1 ? 'is' : 'are'} compulsory` : null,
    exam.sits_together ? 'all papers are sat on one day' : 'each paper has its own day',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Section
      eyebrow={fixed ? `${mine.length} of ${max} chosen` : `${mine.length} chosen`}
      title={other ? `${exam.short_name} subjects` : 'Your subjects'}
      id={`ex4-${exam.examination_id}`}
      sub={rule.charAt(0).toUpperCase() + rule.slice(1) + '.'}
    >
      {fixed ? (
        <span className="ex4-cells" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={cx(i < mine.length && 'on')} />
          ))}
        </span>
      ) : null}
      <ul className="ex4-list">
        {mine.map((subject) => {
          const goal = goalOf(subject.subject_id);
          return (
            <li key={subject.subject_id} className="ex4-row">
              <Link to={`/subjects/${subject.subject_id}`} className="ex4-main">
                <span className="ex4-tile sj-display" aria-hidden="true">
                  {initials(subject.name)}
                </span>
                <span className="ex4-name">
                  <b>{subject.name}</b>
                  <small>{goal?.target_score != null ? `Target ${Math.round(goal.target_score)}%` : 'No target yet'}</small>
                </span>
              </Link>
              {subject.compulsory ? (
                <span className="ex4-tag">Compulsory</span>
              ) : fixed ? (
                <Button size="sm" tone="soft" icon={<IconReplay size={14} />} onClick={() => setPicking({ swapOut: subject })}>
                  Swap
                </Button>
              ) : (
                <Button size="sm" tone="ghost" icon={<IconClose size={14} />} onClick={() => setRemoving(subject)}>
                  Remove
                </Button>
              )}
            </li>
          );
        })}
        {(!fixed || mine.length < max) && canAdd.length > 0 ? (
          <li>
            <button type="button" className="ex4-add" onClick={() => setPicking({ swapOut: null })}>
              <span className="ex4-plus" aria-hidden="true">
                +
              </span>
              <span className="ex4-name">
                <b>{fixed ? `Add your ${ORDINAL[mine.length + 1] ?? 'next'} subject` : 'Add a subject'}</b>
                <small>Choose from the subjects open in {exam.short_name}</small>
              </span>
            </button>
          </li>
        ) : null}
      </ul>

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
            <ul className="ex4-pick">
              {canAdd.map((subject) => (
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
    </Section>
  );
}
