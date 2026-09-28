/**
 * The subjects of one exam. Each card says how much of the subject is ready to study, and
 * where this student is with it: no goal yet, a goal, a check-up done.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, type ExaminationOffer, type Goal, type SubjectOffer } from '../../student/api.js';
import { progressApi, type Overview } from '../progressApi.js';
import { IconArrowRight, IconBook, IconCheck, IconLayers, IconLock, IconReplay, IconTarget } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Badge, Button, PageHero, Pager, Skeleton, cx, daysUntil, usePaged } from '../ui.js';
import { ExNote, examTitle, isHiddenExam, isPracticeExam } from './Exams.js';
import './ExamSubjects.css';

const fmt = (value: number) => value.toLocaleString('en-NG');
/** "Joint Admissions and Matriculation Board (JAMB)" → "JAMB", for a one-line eyebrow. */
const bodyShort = (body: string) => /\(([^)]+)\)\s*$/.exec(body)?.[1] ?? body;

export function ExamSubjects() {
  const { examId = '' } = useParams();
  const student = useStudent();
  const load = useLoad(
    () =>
      Promise.all([
        api.catalogue(),
        api.goals(student.studentId).catch(() => [] as Goal[]),
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
      ]),
    [student.studentId],
  );
  const exam = load.data?.[0].find((item) => item.examination_id === examId && !isHiddenExam(item));
  usePageTitle(exam ? `${isPracticeExam(exam) ? 'Practice set' : exam.short_name} subjects` : 'Subjects');

  const back = { to: '/exams', label: 'All exams' };

  if (load.error && !load.data) {
    return (
      <div className="sj-page">
        <PageHero back={back} eyebrow="Subjects" title="Choose a subject" />
        <ExNote
          icon={<IconReplay size={18} />}
          title="We could not load the subjects"
          action={
            <Button tone="soft" onClick={load.reload}>
              Try again
            </Button>
          }
        >
          {load.error}
        </ExNote>
      </div>
    );
  }

  if (!load.data) {
    return (
      <div className="sj-page">
        <PageHero back={back} eyebrow="Subjects" title="Choose a subject" />
        <div className="exs-grid" aria-busy="true" aria-label="Loading subjects">
          {[0, 1, 2].map((key) => (
            <div key={key} className="exs-card exs-skel">
              <div className="exs-head">
                <Skeleton height={34} width={52} radius={10} />
                <Skeleton height={26} width="55%" />
              </div>
              <div className="exs-nums">
                <Skeleton height={72} radius={10} />
                <Skeleton height={72} radius={10} />
              </div>
              <Skeleton height={40} width="80%" />
              <Skeleton height={48} radius={12} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="sj-page">
        <PageHero back={back} eyebrow="Subjects" title="We could not find that exam" />
        <ExNote
          icon={<IconBook size={18} />}
          title="This exam is not open"
          action={
            <Button to="/exams" tone="soft">
              See all exams
            </Button>
          }
        >
          It may have been switched off, or the link is out of date.
        </ExNote>
      </div>
    );
  }

  return <ExamBody exam={exam} goals={load.data[1]} overview={load.data[2]} back={back} />;
}

/** Subject cards a page: three rows of three on a laptop. */
const SUBJECTS_PER_PAGE = 9;

function ExamBody({
  exam,
  goals,
  overview,
  back,
}: {
  exam: ExaminationOffer;
  goals: Goal[];
  overview: Overview | null;
  back: { to: string; label: string };
}) {
  const practice = isPracticeExam(exam);
  const subjects = [...exam.subjects].sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
  const ready = subjects.filter((subject) => subject.ready).length;
  const goalOf = (subjectId: string) => goals.find((goal) => goal.subject_id === subjectId);
  const hasGoalFor = (subjectId: string) => {
    const goal = goalOf(subjectId);
    return Boolean(goal && goal.target_score != null && goal.exam_date);
  };
  // The page's one sticker: the first subject the student has a goal in.
  const featured = subjects.find((subject) => subject.ready && hasGoalFor(subject.subject_id))?.subject_id;
  const paged = usePaged(subjects, SUBJECTS_PER_PAGE, exam.examination_id);
  // How the exam is sat, and how many subjects it takes: said once, above the cards.
  const mine = subjects.filter((subject) => goalOf(subject.subject_id)).length;
  const limit = exam.max_subjects;
  const full = limit != null && mine >= limit;
  const compulsory = subjects.filter((subject) => subject.compulsory).map((subject) => subject.name);
  const rest = limit != null ? limit - compulsory.length : 0;
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n: number) => words[n] ?? String(n);

  return (
    <div className="sj-page">
      <PageHero
        back={back}
        eyebrow={
          <span className="exs-eyebrow">
            {practice ? 'Practice set' : exam.short_name}
            <span aria-hidden="true">·</span>
            {bodyShort(exam.exam_body)}
          </span>
        }
        title={practice ? 'Sandbox subjects' : `${exam.short_name} subjects`}
        sub={
          practice
            ? 'A small demo set for trying the app. Nothing here counts towards a real exam.'
            : `${examTitle(exam)}. Set a goal for each subject you are sitting.`
        }
        aside={
          subjects.length > 0 ? (
            <div className="exs-stat">
              <span className="exs-stat-label">Ready to study</span>
              <span className="exs-stat-num">
                <span className="sj-num">{ready}</span>
                <span className="unit">of {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}</span>
              </span>
              <span className="exs-stat-note">
                Checked questions, ready to practise now.
              </span>
            </div>
          ) : undefined
        }
      />

      <section aria-labelledby="exs-title">
        <div className="exs-sechead">
          <div className="sj-eyebrow">Subjects</div>
          <h2 id="exs-title" className="sj-display sj-h2">
            Pick the ones you are sitting
          </h2>
          {!practice && (limit != null || exam.sits_together) ? (
            <p className="exs-rule">
              {limit != null ? (
                <>
                  <b>
                    {exam.short_name} is {word(limit)} subjects
                  </b>
                  {compulsory.length
                    ? `: ${compulsory.join(' and ')}, which everyone sits, and ${word(rest)} more. `
                    : '. '}
                </>
              ) : null}
              {exam.sits_together
                ? `All are sat together on one day, so they share one exam date. `
                : 'Each paper has its own day. '}
              {limit != null ? (
                <span className={cx('exs-rule-count', full && 'full')}>
                  You have {mine} of {limit}
                  {full ? '. Remove one to add another.' : '.'}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {subjects.length === 0 ? (
          <ExNote icon={<IconLayers size={18} />} title="No subjects yet">
            Subjects appear here once their syllabus and questions have been checked.
          </ExNote>
        ) : (
          <div className="exs-grid" style={{ '--cols': Math.min(3, Math.max(2, subjects.length)) } as CSSProperties}>
            {paged.items.map((subject, index) => (
              <SubjectCard
                key={subject.subject_id}
                subject={subject}
                goal={goalOf(subject.subject_id)}
                overview={overview?.subjects.find((item) => item.subject_id === subject.subject_id)}
                index={index}
                featured={subject.subject_id === featured}
                full={full}
              />
            ))}
          </div>
        )}
        <Pager paged={paged} noun="subjects" label="Pages of subjects" anchorId="exs-title" />
      </section>

      <p className="exs-legend sj-small sj-muted">
        <b>Questions ready</b>: questions our team has checked, ready to be asked.{' '}
        <b>Skills we teach</b>: topics where your coach can walk you through the working.
        {overview?.subjects.some((item) => item.latest_checkup?.score_now != null) ? (
          <>
            {' '}
            <b>Scoring about</b>: what your last check-up says you would likely get if you sat the exam today.
          </>
        ) : null}
      </p>
    </div>
  );
}

function SubjectCard({
  subject,
  goal,
  overview,
  index,
  featured,
  full,
}: {
  subject: SubjectOffer;
  goal: Goal | undefined;
  overview: Overview['subjects'][number] | undefined;
  index: number;
  featured: boolean;
  /** The exam already has as many subjects as it allows. */
  full: boolean;
}) {
  const hasGoal = Boolean(goal && goal.target_score != null && goal.exam_date);
  const checkup = overview?.latest_checkup ?? null;
  const openCheckup = overview?.open_checkup_session_id ?? null;
  const days = daysUntil(goal?.exam_date);
  const rise = `sj-rise d${Math.min(index + 1, 4)}`;

  const facts: { key: string; tone: string; icon: ReactNode; text: string }[] = [];
  if (subject.ready) {
    if (hasGoal && goal) {
      const when = days != null && days >= 0 ? ` · ${days === 0 ? 'exam today' : `${days} ${days === 1 ? 'day' : 'days'} to go`}` : '';
      facts.push({ key: 'goal', tone: 'yellow', icon: <IconTarget size={15} />, text: `Aiming for ${Math.round(goal.target_score ?? 0)}${when}` });
    } else {
      facts.push({ key: 'goal', tone: 'none', icon: <IconTarget size={15} />, text: 'No goal yet' });
    }
    if (checkup) {
      const score = checkup.score_now != null ? ` · scoring about ${Math.round(checkup.score_now)}` : '';
      facts.push({ key: 'check', tone: 'green', icon: <IconCheck size={15} />, text: `Check-up done${score}` });
    } else if (openCheckup) {
      facts.push({ key: 'check', tone: 'purple', icon: <IconReplay size={15} />, text: 'Check-up in progress' });
    } else if (hasGoal) {
      facts.push({ key: 'check', tone: 'none', icon: <IconCheck size={15} />, text: 'No check-up yet' });
    }
  }

  const body = (
    <>
      <div className="exs-head">
        <span className="exs-code sj-mono">{subject.code}</span>
        <h3 className="sj-display exs-name">{subject.name}</h3>
        {subject.ready ? (
          subject.compulsory ? (
            <Badge tone="yellow" className="exs-badge">
              Everyone sits this
            </Badge>
          ) : null
        ) : (
          <Badge tone="ghost" className="exs-badge">
            <IconLock size={13} />
            Not ready
          </Badge>
        )}
      </div>

      <div className="exs-nums">
        <div className="exs-num">
          <span className="sj-num">{fmt(subject.deliverable_questions)}</span>
          <span className="exs-num-label">questions ready</span>
        </div>
        <div className="exs-num">
          <span className="sj-num">{fmt(subject.teachable_skills)}</span>
          <span className="exs-num-label">skills we teach</span>
        </div>
      </div>

      {subject.ready ? (
        <ul className="exs-facts">
          {facts.map((fact) => (
            <li key={fact.key} className={fact.tone}>
              <span className="exs-fact-ico" aria-hidden="true">
                {fact.icon}
              </span>
              {fact.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="exs-blocked">{subject.blocked_reason ?? 'Its questions are still being checked. It will open here when they are.'}</p>
      )}

      <div className="exs-cta">
        {subject.ready ? (
          <span className={cx('sj-btn block', !hasGoal && 'dark')}>
            {hasGoal ? 'Open subject' : full ? 'Swap it in' : 'Set a goal'}
            <span className="arrow">
              <IconArrowRight size={18} />
            </span>
          </span>
        ) : (
          <span className="sj-btn block exs-btn-off" aria-hidden="true">
            Not open yet
          </span>
        )}
      </div>
    </>
  );

  if (!subject.ready) {
    return (
      <div className={`exs-card off ${rise}`} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link
      to={hasGoal ? `/subjects/${subject.subject_id}` : `/subjects/${subject.subject_id}/goal`}
      className={cx('exs-card', hasGoal && 'has-goal', featured && 'featured', rise)}
    >
      {body}
    </Link>
  );
}
