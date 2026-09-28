/**
 * /checkup: every subject as one row — whether it has been checked and when, its predicted score
 * against the target, what is holding it down, and the one button that fits (start, resume, take
 * again, or set a goal first) — then how a check-up works. The rows scale from one subject to
 * twenty; the subjects still to check come first.
 *
 * A subject needs a goal before it can be checked, because the score is a projection against
 * the exam date and target; without one the row sends the student to set it first.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { api, type Goal } from '../../student/api.js';
import { IconArrowRight, IconBook, IconReplay, IconTarget } from '../icons.js';
import type { SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import {
  ScoreCell,
  SubjectName,
  SubjectRows,
  byUrgency,
  isDemoSubject,
  rememberSubject,
  withDemoSubjects,
  type SubjectColumn,
} from '../SubjectSwitcher.js';
import { progressApi } from '../progressApi.js';
import { Button, CountUp, PageHero, Pager, Skeleton, Steps, cx, usePaged } from '../ui.js';
import { MetricTip } from './HowItsWorkedOut.js';
import './CheckupHub.css';

function whenLabel(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(then);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  return `on ${then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

/** Rows per page. */
const PAGE = 10;

const STEPS = [
  { title: 'Answer about 15 questions', body: 'They get harder or easier to match you. No time limit, no pass mark.' },
  { title: 'See your predicted score', body: 'What you’d likely get if you sat the exam today, with a range.' },
  { title: 'Get your plan', body: 'The topics to practise first, to lift the score fastest.' },
];

/** A goal the check-up can measure against: a target and a date, from either source. */
function hasGoal(subject: SubjectOverview, goal: Goal | undefined): boolean {
  if (goal && goal.target_score !== null && goal.exam_date !== null) return true;
  return !!subject.goal && subject.goal.target_score !== null && subject.goal.exam_date !== null;
}

/** A left-aligned message card: icon and title on one line, the words and the button beneath. */
function NoteCard({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sj-card ch-note">
      <div className="ch-note-head">
        <span className="ch-ico" aria-hidden="true">
          {icon}
        </span>
        <h3 className="sj-display sj-h3">{title}</h3>
      </div>
      {children ? <p>{children}</p> : null}
      {action ? <div className="ch-note-actions">{action}</div> : null}
    </div>
  );
}

export function CheckupHub() {
  usePageTitle('Check-up');
  const student = useStudent();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [starting, setStarting] = useState<string | null>(null);
  const [startIssue, setStartIssue] = useState<{ subjectId: string; text: string } | null>(null);

  const data = useLoad(
    () =>
      Promise.all([progressApi.overview(student.studentId).then(withDemoSubjects), api.goals(student.studentId), api.catalogue()]),
    [student.studentId],
  );

  // One SubjectOverview per subject: the overview's, plus any subject with a goal it lacks.
  const goals = new Map<string, Goal>();
  let subjects: SubjectOverview[] = [];
  if (data.data) {
    const [overview, goalList, catalogue] = data.data;
    const examOf = new Map<string, string>();
    for (const exam of catalogue) for (const subject of exam.subjects) examOf.set(subject.subject_id, exam.short_name);
    for (const goal of goalList) goals.set(goal.subject_id, goal);
    subjects = [...overview.subjects];
    for (const goal of goalList) {
      if (subjects.some((s) => s.subject_id === goal.subject_id)) continue;
      subjects.push({
        subject_id: goal.subject_id,
        subject_name: goal.subject_name,
        examination_short_name: examOf.get(goal.subject_id) ?? '',
        goal: null,
        latest_checkup: null,
        open_checkup_session_id: null,
        open_practice_session_id: null,
        practice: { runs_finished: 0, questions_answered: 0, correct_unaided: 0, taught: 0 },
      });
    }
    subjects = byUrgency(subjects);
  }

  // ?subject= (e.g. from the progress page) marks that row and starts on its page.
  const asked = params.get('subject');
  const paged = usePaged(subjects, PAGE);
  const askedIndex = subjects.findIndex((s) => s.subject_id === asked);
  useEffect(() => {
    if (askedIndex >= 0) paged.setPage(Math.floor(askedIndex / PAGE) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedIndex]);

  const start = async (subjectId: string) => {
    if (starting) return;
    setStarting(subjectId);
    setStartIssue(null);
    rememberSubject(subjectId);
    try {
      const state = await api.start(student.studentId, subjectId);
      navigate(`/checkup/${state.session_id}`);
    } catch (error) {
      setStartIssue({ subjectId, text: (error as Error).message || 'The check-up could not start.' });
      setStarting(null);
    }
  };

  // The hero's number: the most recent predicted score, if there is one.
  const scored = subjects
    .filter((s) => s.latest_checkup?.score_now != null)
    .sort((a, b) => (b.latest_checkup!.finished_at > a.latest_checkup!.finished_at ? 1 : -1))[0];
  const last = scored?.latest_checkup ?? null;
  const checkedCount = subjects.filter((s) => s.latest_checkup).length;

  // The hero's button: the one thing to do next — a half-done check-up, else the first subject
  // that has never been checked, else the one checked longest ago.
  const openRow = subjects.find((s) => s.open_checkup_session_id);
  const ready = subjects.filter((s) => hasGoal(s, goals.get(s.subject_id)) && !isDemoSubject(s.subject_id));
  const readyRow =
    ready.find((s) => !s.latest_checkup) ??
    [...ready].sort((a, b) => (a.latest_checkup!.finished_at < b.latest_checkup!.finished_at ? -1 : 1))[0];
  let heroAction: ReactNode = null;
  if (openRow) {
    heroAction = (
      <Button tone="lime" to={`/checkup/${openRow.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
        Resume {openRow.subject_name}
      </Button>
    );
  } else if (readyRow) {
    const again = Boolean(readyRow.latest_checkup);
    const id = readyRow.subject_id;
    heroAction = (
      <Button
        tone="lime"
        onClick={() => void start(id)}
        busy={starting === id}
        disabled={starting !== null && starting !== id}
        trailing={starting === id ? undefined : <IconArrowRight size={18} />}
      >
        {starting === id ? 'Starting…' : `${again ? 'Check' : 'Start'} ${readyRow.subject_name}${again ? ' again' : ''}`}
      </Button>
    );
  }

  const columns: SubjectColumn[] = [
    {
      key: 'name',
      head: 'Subject',
      width: 'minmax(0, 1.3fr)',
      phone: 'lead',
      cell: (s) => <SubjectName subject={s} to={<Link to={`/subjects/${s.subject_id}`}>{s.subject_name}</Link>} />,
    },
    {
      key: 'status',
      head: 'Check-up',
      width: 'minmax(0, 1fr)',
      cell: (s) => <CheckStatus subject={s} goal={goals.get(s.subject_id)} />,
    },
    { key: 'score', head: 'Predicted score', width: 'minmax(0, 1.2fr)', phone: 'inline', cell: (s) => <ScoreCell subject={s} /> },
    {
      key: 'weak',
      head: 'Holding it down',
      width: 'minmax(0, 1.3fr)',
      phone: 'hide',
      cell: (s) => {
        const weak = s.latest_checkup?.weakest_subtopics.slice(0, 2) ?? [];
        return weak.length > 0 ? (
          <span className="ch-weakcell">
            {weak.map((w) => (
              <span key={w.subtopic_id}>
                <b className="sj-mono">{Math.round(w.mastery * 100)}%</b> {w.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="ch-weakcell none">—</span>
        );
      },
    },
    {
      key: 'act',
      head: '',
      width: '232px',
      align: 'end',
      phone: 'end',
      cell: (s) => (
        <RowActions
          subject={s}
          goal={goals.get(s.subject_id)}
          busy={starting === s.subject_id}
          disabled={(starting !== null && starting !== s.subject_id) || isDemoSubject(s.subject_id)}
          onStart={() => void start(s.subject_id)}
        />
      ),
    },
  ];

  return (
    <div className="sj-page ch-page">
      <PageHero
        eyebrow="Check-up"
        title="Find out where you stand"
        sub="A short check that adapts to you. Nothing counts towards anything: it predicts your exam score today and finds what’s holding it down."
        actions={heroAction}
        aside={
          last && last.score_now !== null && scored ? (
            <div className="ch-stat">
              <span className="ch-stat-label">
                Last predicted · {scored.subject_name} <MetricTip id="predicted" onDark />
              </span>
              <span className="ch-stat-num">
                <span className="sj-num">
                  <CountUp value={last.score_now} />
                </span>
                <span className="unit">out of 100</span>
              </span>
              <span className="ch-stat-chips">
                <span>Checked {whenLabel(last.finished_at)}</span>
                {subjects.length > 1 ? (
                  <span>
                    {checkedCount} of {subjects.length} subjects checked
                  </span>
                ) : last.score_low !== null && last.score_high !== null ? (
                  <span>
                    Likely {Math.round(last.score_low)}–{Math.round(last.score_high)}
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="ch-stat">
              <span className="ch-stat-label">About</span>
              <span className="ch-stat-num">
                <span className="sj-num">15</span>
                <span className="unit">questions</span>
              </span>
              <span className="ch-stat-chips">
                <span>No time limit</span>
                <span>No pass mark</span>
              </span>
            </div>
          )
        }
      />

      <section className="ch-section" aria-labelledby="ch-subjects-title">
        <div className="ch-sechead-row">
          <div className="ch-sechead">
            <div className="sj-eyebrow">
              {subjects.length > 1
                ? `${subjects.length} subjects · ${subjects.length - checkedCount} still to check`
                : 'Your subjects'}
            </div>
            <h2 id="ch-subjects-title" className="sj-display sj-h2">
              Where each subject stands
            </h2>
          </div>
          {data.data && subjects.length > 0 ? (
            <Link className="sj-link ch-addlink" to="/exams">
              Add a subject <IconArrowRight size={14} />
            </Link>
          ) : null}
        </div>

        {data.error && !data.data ? (
          <NoteCard
            icon={<IconReplay size={18} />}
            title="Your subjects didn’t load"
            action={
              <Button tone="soft" onClick={data.reload}>
                Try again
              </Button>
            }
          >
            {data.error}
          </NoteCard>
        ) : !data.data ? (
          <div className="ch-skel" aria-busy="true" aria-label="Loading your subjects">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={56} radius={8} />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <NoteCard
            icon={<IconTarget size={18} />}
            title="Choose your exam first"
            action={
              <Button to="/exams" trailing={<IconArrowRight size={18} />}>
                Choose my exam
              </Button>
            }
          >
            A check-up measures you against a target on a date. Pick your exam and subjects, set a goal, and your first
            check-up is one tap away.
          </NoteCard>
        ) : (
          <>
            <SubjectRows
              subjects={paged.items}
              columns={columns}
              label="Where each subject stands"
              selected={askedIndex >= 0 ? asked : null}
              id="ch-subject-rows"
              className="ch-rows"
            />
            <Pager paged={paged} noun="subjects" anchorId="ch-subject-rows" />
            {startIssue ? (
              <p className="ch-issue" role="alert">
                {subjects.find((s) => s.subject_id === startIssue.subjectId)?.subject_name}: {startIssue.text}
              </p>
            ) : null}
            {subjects.length === 1 ? (
              <div className="ch-add sj-rise d4">
                <span className="ch-ico" aria-hidden="true">
                  <IconBook size={18} />
                </span>
                <strong>Sitting another subject?</strong>
                <span className="ch-add-text">Each one gets its own goal and check-up.</span>
                <Button to="/exams" tone="ghost" size="sm" trailing={<IconArrowRight size={16} />}>
                  Add a subject
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="ch-section" aria-labelledby="ch-how-title">
        <div className="ch-sechead">
          <div className="sj-eyebrow">How it works</div>
          <h2 id="ch-how-title" className="sj-display sj-h2">
            Three steps to a plan
          </h2>
        </div>
        <Steps steps={STEPS} />
      </section>
    </div>
  );
}

/** Whether a subject has been checked: when, or what stands in the way. */
function CheckStatus({ subject, goal }: { subject: SubjectOverview; goal: Goal | undefined }) {
  const latest = subject.latest_checkup;
  let tone: 'lime' | 'yellow' | 'pink';
  let words: string;
  let detail: string;
  if (subject.open_checkup_session_id) {
    tone = 'yellow';
    words = 'Half done';
    detail = 'Your answers are saved';
  } else if (latest) {
    tone = 'lime';
    words = `Checked ${whenLabel(latest.finished_at)}`;
    detail = `${latest.answered} questions`;
  } else if (!hasGoal(subject, goal)) {
    tone = 'pink';
    words = 'Needs a goal first';
    detail = 'A target and a date';
  } else {
    tone = 'yellow';
    words = 'Not checked yet';
    detail = 'About 15 questions';
  }
  return (
    <span className="ss-statuscell">
      <span className="ss-statusline">
        <span className={cx('ss-dot', tone)} aria-hidden="true" />
        {words}
      </span>
      <small>{detail}</small>
    </span>
  );
}

function RowActions({
  subject,
  goal,
  busy,
  disabled,
  onStart,
}: {
  subject: SubjectOverview;
  goal: Goal | undefined;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const openId = subject.open_checkup_session_id;
  const latest = subject.latest_checkup;
  return (
    <span className="ch-rowacts">
      {latest ? (
        <Link className="sj-link ch-report" to={`/checkup/${latest.session_id}/report`}>
          Report
        </Link>
      ) : null}
      {openId ? (
        <Button size="sm" tone="dark" to={`/checkup/${openId}`} trailing={<IconArrowRight size={16} />}>
          Resume
        </Button>
      ) : !hasGoal(subject, goal) ? (
        <Button size="sm" tone="ghost" to={`/subjects/${subject.subject_id}/goal`}>
          Set a goal
        </Button>
      ) : latest ? (
        <Button size="sm" tone="ghost" onClick={onStart} busy={busy} disabled={disabled}>
          {busy ? 'Starting…' : 'Check again'}
        </Button>
      ) : (
        <Button
          size="sm"
          tone="dark"
          onClick={onStart}
          busy={busy}
          disabled={disabled}
          trailing={busy ? undefined : <IconArrowRight size={16} />}
        >
          {busy ? 'Starting…' : 'Start check-up'}
        </Button>
      )}
    </span>
  );
}
