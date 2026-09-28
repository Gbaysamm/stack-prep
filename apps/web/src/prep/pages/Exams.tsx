/**
 * Choose an exam. Each card says what it is, who sets it, which subjects it has and how many are
 * ready to study today. Test examinations and the old sandbox stay out of sight.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { api, type ExaminationOffer, type Goal } from '../../student/api.js';
import { IconArrowRight, IconBook, IconCheck, IconReplay } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Badge, Button, PageHero, Skeleton, Steps, Track, cx } from '../ui.js';
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

const HOW = [
  { title: 'Choose your exam', body: 'The exam you are sitting. Its subjects come next.' },
  { title: 'Set a goal per subject', body: 'A target score, your exam day and the time you can give each week.' },
  { title: 'Take a check-up', body: 'About 15 questions give a predicted score and a plan of what to practise.' },
];

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
  const goalsIn = (exam: ExaminationOffer) => exam.subjects.filter((subject) => goalIds.has(subject.subject_id)).length;
  // One sticker on the page: the exam the student is working towards, or else the first one.
  const featured = (exams.find((exam) => goalsIn(exam) > 0) ?? exams[0])?.examination_id;
  const solo = exams.length === 1;

  return (
    <div className="sj-page ex-page">
      <PageHero
        eyebrow="Exams & subjects"
        title="Choose your exam"
        sub="Pick the exam you are sitting. You choose your subjects next, and each one gets its own goal and check-up."
        aside={
          goals.length > 0 ? (
            <div className="ex-stat">
              <span className="ex-stat-label">Your goals</span>
              <span className="ex-stat-num">
                <span className="sj-num">{goals.length}</span>
                <span className="unit">{goals.length === 1 ? 'subject' : 'subjects'}</span>
              </span>
              <span className="ex-stat-note">{goals.map((goal) => goal.subject_name).join(', ')}</span>
            </div>
          ) : undefined
        }
      />

      <section className="ex-section" aria-labelledby="ex-title">
        <div className="ex-sechead">
          <div className="sj-eyebrow">Open now</div>
          <h2 id="ex-title" className="sj-display sj-h2">
            What are you preparing for?
          </h2>
        </div>

        {load.error && !load.data ? (
          <ExNote
            icon={<IconReplay size={18} />}
            title="We could not load the exams"
            action={
              <Button tone="soft" onClick={load.reload}>
                Try again
              </Button>
            }
          >
            {load.error}
          </ExNote>
        ) : !load.data ? (
          <div className="ex-grid solo" aria-busy="true" aria-label="Loading exams">
            <div className="ex-card solo ex-skel">
              <div className="ex-head">
                <Skeleton height={34} width={34} radius={10} />
                <Skeleton height={30} width="30%" />
              </div>
              <Skeleton height={16} width="70%" />
              <Skeleton height={12} width="45%" />
              <div className="ex-foot">
                <Skeleton height={20} width="60%" />
                <Skeleton height={5} />
                <Skeleton height={18} width={140} />
              </div>
            </div>
          </div>
        ) : exams.length === 0 ? (
          <ExNote icon={<IconBook size={18} />} title="No exams are open yet">
            Exams appear here as soon as their questions have been checked. Look again soon.
          </ExNote>
        ) : (
          <div className={cx('ex-grid', solo && 'solo')}>
            {exams.map((exam, index) => {
              const total = exam.subjects.length;
              const ready = exam.subjects.filter((subject) => subject.ready).length;
              const goalsHere = goalsIn(exam);
              return (
                <Link
                  key={exam.examination_id}
                  to={`/exams/${exam.examination_id}`}
                  className={cx(
                    'ex-card sj-rise',
                    `d${Math.min(index + 1, 4)}`,
                    solo && 'solo',
                    exam.examination_id === featured && 'featured',
                  )}
                  aria-label={`${exam.short_name}: ${examTitle(exam)}. ${ready} of ${total} subjects ready.`}
                >
                  <p className="ex-body">Set by {bodyShort(exam.exam_body)}</p>
                  <div className="ex-head">
                    <h3 className="sj-display ex-short">{exam.short_name}</h3>
                    {goalsHere > 0 ? (
                      <Badge tone="dark" dot className="ex-badge">
                        {goalsHere} {goalsHere === 1 ? 'goal' : 'goals'} set
                      </Badge>
                    ) : null}
                  </div>
                  <p className="ex-name">{examTitle(exam)}</p>

                  <div className="ex-foot">
                    <div className="ex-stats">
                      <span>
                        <b className="sj-num">{total}</b> {total === 1 ? 'subject' : 'subjects'}
                      </span>
                      <span className="ex-dot" aria-hidden="true" />
                      <span>
                        <b className="sj-num">{ready}</b> ready to study
                      </span>
                    </div>
                    <Track value={ready} max={Math.max(total, 1)} thin onDark label={`${ready} of ${total} subjects ready`} />
                    {total > 0 ? (
                      <ul className="ex-subjects" aria-label="Subjects">
                        {exam.subjects.map((subject) => (
                          <li key={subject.subject_id} className={cx(goalIds.has(subject.subject_id) && 'mine', !subject.ready && 'off')}>
                            {goalIds.has(subject.subject_id) ? <IconCheck size={13} /> : null}
                            {subject.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <span className="ex-cta">
                      {ready > 0 ? 'Choose subjects' : 'See subjects'}
                      <IconArrowRight size={18} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="ex-section" aria-labelledby="ex-how-title">
        <div className="ex-sechead">
          <div className="sj-eyebrow">How it works</div>
          <h2 id="ex-how-title" className="sj-display sj-h2">
            From exam to plan
          </h2>
        </div>
        <Steps steps={HOW} current={goals.length > 0 ? undefined : 0} />
      </section>
    </div>
  );
}
