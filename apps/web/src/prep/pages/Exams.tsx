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
import { Button, Dialog, Skeleton, cx, useToast } from '../ui.js';
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
  usePageTitle('Exams & subjects');
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
        eyebrow="Exams & subjects"
        title="Your exam and subjects"
        id="ex2-title"
        className="ex2-first"
        sub="The subjects you are sitting. Each one gets its own target, check-up and roadmap."
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

/** One exam: who sets it, how many places are filled, and the student's subjects in it. */
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
  const full = max !== null && mine.length >= max;
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<SubjectOffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // A subject added here takes the date, target and study time the student already set for
  // this exam; with none set yet, its goal page asks for them.
  const sibling = mine.map((s) => goalOf(s.subject_id)).find((g) => g?.exam_date && g.target_score != null);
  const add = async (subject: SubjectOffer) => {
    if (!sibling || !sibling.exam_date || sibling.target_score == null) {
      navigate(`/subjects/${subject.subject_id}/goal`);
      return;
    }
    setBusy(subject.subject_id);
    try {
      await api.setGoal(student.studentId, subject.subject_id, {
        target_score: sibling.target_score,
        exam_date: sibling.exam_date,
        minutes_per_day: sibling.minutes_per_day ?? 30,
        study_days: sibling.study_days ?? [1, 2, 3, 4, 5],
      });
      setPicking(false);
      toast(`${subject.name} added`);
      onChanged();
    } catch (error) {
      toast(friendly(error as Error) || 'Couldn’t add it. Try again.');
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

  return (
    <div className="ex2-card">
      <div className="ex2-head">
        <div className="ex2-id">
          <span className="ex2-body">Set by {bodyShort(exam.exam_body)}</span>
          <h3 className="sj-display ex2-short">{exam.short_name}</h3>
          <span className="ex2-name">{examTitle(exam)}</span>
        </div>
        {max !== null ? (
          <div className="ex2-places">
            <span>
              <b className="sj-num">{mine.length}</b> of {max} subjects
            </span>
            <span className="ex2-cells" aria-hidden="true">
              {Array.from({ length: max }, (_, i) => (
                <i key={i} className={cx(i < mine.length && 'on')} />
              ))}
            </span>
          </div>
        ) : null}
      </div>

      {mine.length === 0 ? (
        <div className="ex2-empty">
          <p>You haven’t chosen any {exam.short_name} subjects yet.</p>
          <Button onClick={() => setPicking(true)} trailing={<IconArrowRight size={18} />}>
            Choose subjects
          </Button>
        </div>
      ) : (
        <ul className="ex2-subjects">
          {mine.map((subject) => {
            const goal = goalOf(subject.subject_id);
            return (
              <li key={subject.subject_id} className="ex2-subject">
                <Link to={`/subjects/${subject.subject_id}`} className="ex2-subject-link">
                  <b>{subject.name}</b>
                  <small>
                    {subject.compulsory ? 'Compulsory · ' : ''}
                    {goal?.target_score != null ? `Target ${Math.round(goal.target_score)}%` : 'No target yet'}
                  </small>
                </Link>
                {subject.compulsory ? null : (
                  <button
                    type="button"
                    className="ex2-remove"
                    onClick={() => setRemoving(subject)}
                    aria-label={`Remove ${subject.name}`}
                    title={`Remove ${subject.name}`}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </li>
            );
          })}
          {!full && canAdd.length > 0 ? (
            <li>
              <button type="button" className="ex2-add" onClick={() => setPicking(true)}>
                <span className="ex2-plus" aria-hidden="true">
                  +
                </span>
                Add a subject
              </button>
            </li>
          ) : null}
        </ul>
      )}
      {full ? (
        <p className="ex2-note">
          {exam.short_name} is {max} subjects. To swap one, remove it with × and add another.
        </p>
      ) : null}

      <Dialog open={picking} onClose={() => busy === null && setPicking(false)} title="Add a subject">
        {canAdd.length === 0 ? (
          <p className="ex2-dialog-text">Every subject open in {exam.short_name} is already on your list.</p>
        ) : (
          <ul className="ex2-pick">
            {canAdd.map((subject) => (
              <li key={subject.subject_id}>
                <span>{subject.name}</span>
                <Button size="sm" tone="soft" busy={busy === subject.subject_id} disabled={busy !== null} onClick={() => void add(subject)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
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
