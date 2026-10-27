/**
 * /checkup: every subject as one row — whether it has been checked and when, each check-up's
 * result as a history (20% → 28% → 47%), what is holding it down, when the next check-up is due,
 * and the one button that fits (start, resume, or check again) — then how a check-up works. The
 * rows scale from one subject to twenty; the subjects still to check come first.
 *
 * Numbers follow docs/student-scoring.md: a check-up's result is right ÷ answered in that sitting,
 * and the latest one is the predicted score.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { api, type CheckupResult } from '../../student/api.js';
import { IconArrowRight, IconBook, IconReplay, IconTarget } from '../icons.js';
import type { SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import {
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
import './CheckupHub.css';
import { friendly } from '../../lib/friendlyError.js';

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

/** "2026-10-19" as a short local date, "19 Oct". */
function dayText(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Each finished check-up's result, oldest first. */
function checkupsOf(subject: SubjectOverview): CheckupResult[] {
  const history = subject.scores?.checkups.filter((c) => c.score !== null) ?? [];
  if (history.length > 0) return history;
  const latest = subject.latest_checkup;
  return latest && latest.score !== null
    ? [{ session_id: latest.session_id, finished_at: latest.finished_at, answered: latest.answered, right: latest.right, score: latest.score }]
    : [];
}

/** Results shown in a row before the oldest fold away. */
const TREND_SHOWN = 4;

/** Rows per page. */
const PAGE = 10;

const STEPS = [
  { title: 'Answer about 15 questions', body: 'They get harder or easier to match you. No time limit, no pass mark.' },
  { title: 'See your result', body: 'Right ÷ answered. Your latest check-up result is your predicted score.' },
  { title: 'Practise, then check again', body: 'Work on your weakest topics. A new check-up is due every 7 days.' },
];

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
  let subjects: SubjectOverview[] = [];
  if (data.data) {
    const [overview, goalList, catalogue] = data.data;
    const examOf = new Map<string, string>();
    for (const exam of catalogue) for (const subject of exam.subjects) examOf.set(subject.subject_id, exam.short_name);
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
      setStartIssue({ subjectId, text: friendly(error) || 'The check-up could not start.' });
      setStarting(null);
    }
  };

  // The hero's number: the most recent check-up result, if there is one.
  const scored = subjects
    .filter((s) => s.latest_checkup?.score != null)
    .sort((a, b) => (b.latest_checkup!.finished_at > a.latest_checkup!.finished_at ? 1 : -1))[0];
  const last = scored?.latest_checkup ?? null;
  const checkedCount = subjects.filter((s) => s.latest_checkup).length;

  // The hero's button: the one thing to do next — a half-done check-up, else the first subject
  // that has never been checked, else one that is due, else the one checked longest ago.
  const openRow = subjects.find((s) => s.open_checkup_session_id);
  const ready = subjects.filter((s) => !isDemoSubject(s.subject_id));
  const readyRow =
    ready.find((s) => !s.latest_checkup) ??
    ready.find((s) => s.scores?.checkup_due) ??
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
      cell: (s) => <CheckStatus subject={s} />,
    },
    { key: 'score', head: 'Check-up results', width: 'minmax(0, 1.2fr)', phone: 'inline', cell: (s) => <ResultsCell subject={s} /> },
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
        sub="A short, mixed set of questions with no help, like the real exam. Your latest result is your predicted score, and a new check-up is due every 7 days."
        actions={heroAction}
        aside={
          last && last.score !== null && scored ? (
            <div className="ch-stat">
              <span className="ch-stat-label">Last check-up · {scored.subject_name}</span>
              <span className="ch-stat-num">
                <span className="sj-num">
                  <CountUp value={last.score} />
                </span>
                <span className="unit">% predicted score</span>
              </span>
              <span className="ch-stat-chips">
                <span>
                  {last.right} of {last.answered} right {whenLabel(last.finished_at)}
                </span>
                {subjects.length > 1 ? (
                  <span>
                    {checkedCount} of {subjects.length} subjects checked
                  </span>
                ) : scored.scores?.checkup_due ? (
                  <span>Next check-up due now</span>
                ) : scored.scores?.next_checkup_due ? (
                  <span>Next check-up {dayText(scored.scores.next_checkup_due)}</span>
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
            Pick your exam and subjects, and your first
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

/** Whether a subject has been checked: when, and when the next check-up is due. */
function CheckStatus({ subject }: { subject: SubjectOverview }) {
  const latest = subject.latest_checkup;
  const due = subject.scores?.checkup_due ?? false;
  const next = subject.scores?.next_checkup_due ?? null;
  let tone: 'lime' | 'yellow';
  let words: string;
  let detail: string;
  if (subject.open_checkup_session_id) {
    tone = 'yellow';
    words = 'Half done';
    detail = 'Your answers are saved';
  } else if (latest) {
    tone = due ? 'yellow' : 'lime';
    words = `Checked ${whenLabel(latest.finished_at)}`;
    detail = due ? 'Next check-up due now' : next ? `Next check-up ${dayText(next)}` : `${latest.answered} questions`;
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

/** Each check-up's result as a history; the latest, the predicted score, large. */
function ResultsCell({ subject }: { subject: SubjectOverview }) {
  const history = checkupsOf(subject);
  const latest = history[history.length - 1];
  if (!latest || latest.score === null) {
    return (
      <span className="ss-scorecell empty">
        <span className="ss-scorecell-num sj-num">—</span>
        <small>After a check-up</small>
      </span>
    );
  }
  const shown = history.slice(-TREND_SHOWN);
  const folded = history.length > shown.length;
  const target = subject.goal?.target_score ?? null;
  const gap = target !== null ? Math.round(target - latest.score) : null;
  return (
    <span
      className="ss-scorecell ch-results"
      aria-label={`Check-up results ${history.map((c) => `${c.score}%`).join(', ')}; predicted score ${latest.score}%${target !== null ? `, target ${target}%` : ''}`}
    >
      <span className="ss-scorecell-top">
        <span className="ss-scorecell-num sj-num">{latest.score}%</span>
        <small>
          {latest.right} of {latest.answered} right
        </small>
      </span>
      {shown.length > 1 ? (
        <span className="ch-trend sj-mono" aria-hidden="true">
          {folded ? <span>…</span> : null}
          {shown.map((c, i) => (
            <span key={c.session_id}>
              {i > 0 || folded ? <span className="arrow">→</span> : null}
              <b className={cx(i === shown.length - 1 && 'last')}>{c.score}%</b>
            </span>
          ))}
        </span>
      ) : null}
      {gap !== null && target !== null ? (
        <small className={cx('ss-gap', gap <= 0 && 'ok')}>{gap <= 0 ? `At your target of ${target}%` : `${gap} to go to ${target}%`}</small>
      ) : null}
    </span>
  );
}

function RowActions({
  subject,
  busy,
  disabled,
  onStart,
}: {
  subject: SubjectOverview;
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
      ) : latest ? (
        <Button size="sm" tone={subject.scores?.checkup_due ? 'dark' : 'ghost'} onClick={onStart} busy={busy} disabled={disabled}>
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
