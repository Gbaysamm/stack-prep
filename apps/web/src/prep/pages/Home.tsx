/**
 * Home: the student's cockpit. The hero says hello and names the one thing to do next; below it,
 * where the score stands against the target (the page's signature: one scale), what is holding
 * it down, and the practice done so far. Everything is read from the overview endpoint.
 *
 * A few pieces are exported for the progress, subject and profile pages, so a section, a score,
 * a run and an empty state look the same wherever they appear.
 */

import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../../student/api.js';
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconChevronRight,
  IconHome,
  IconPlay,
  IconTarget,
  IconTrophy,
} from '../icons.js';
import { progressApi, type Overview, type PracticeRun, type SubjectOverview, type WeakSubtopic } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Badge, Button, CountUp, PageHero, ShowMore, Steps, Skeleton, Track, cx, greeting, useShowMore, useToast } from '../ui.js';
import { HOW_PATH, MetricTip, type MetricId } from './HowItsWorkedOut.js';
import './Home.css';

/* ================================================================== shared helpers */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Fri 13 Nov" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return `${DAYS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)}`;
}

/** "Today, 13:18", "Yesterday, 09:02", or "Mon 21 Sep". */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return shortDate(iso);
}

/** A score as a student reads it: a whole number. A decimal claims a precision the estimate does not have. */
export function fmtScore(n: number): string {
  return String(Math.round(n));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The words for a mastery level; the same bands the check-up report uses. */
export function masteryWord(m: number | null): string {
  if (m === null) return 'Not checked yet';
  if (m >= 0.75) return 'Strong';
  if (m >= 0.5) return 'Holding';
  if (m >= 0.3) return 'Shaky';
  return 'Needs teaching';
}

/** Where a run opens: an unfinished one back in the room, a finished one on its summary. */
export const runHref = (run: Pick<PracticeRun, 'session_id' | 'finished'>) =>
  run.finished ? `/practice/${run.session_id}/report` : `/practice/${run.session_id}`;

/** Starts a practice run and takes the student into it. */
export function useStartPractice() {
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async (subjectId: string, key: string = subjectId) => {
    setBusy(key);
    setError(null);
    try {
      const run = await api.startPractice(student.studentId, subjectId);
      toast('New run started');
      navigate(`/practice/${run.session_id}`);
    } catch (failure) {
      setError(`We couldn't start a run just now: ${(failure as Error).message}`);
      setBusy(null);
    }
  };
  return { busy, error, start };
}

/** Starts a check-up and takes the student into it. */
export function useStartCheckup() {
  const student = useStudent();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (subjectId: string) => {
    setBusy(true);
    setError(null);
    try {
      const sitting = await api.start(student.studentId, subjectId);
      navigate(`/checkup/${sitting.session_id}`);
    } catch (failure) {
      setError(`We couldn't start the check-up just now: ${(failure as Error).message}`);
      setBusy(false);
    }
  };
  return { busy, error, start };
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p className="home-alert" role="alert">
      {children}
    </p>
  );
}

/* ================================================================== shared pieces */

/**
 * A page section: eyebrow and heading on the page's left edge, an optional link on the right,
 * an optional one-line gloss, then the content 14px below.
 */
export function Section({
  eyebrow,
  title,
  action,
  sub,
  id,
  className,
  children,
  tip,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  sub?: ReactNode;
  id: string;
  className?: string;
  children: ReactNode;
  /** An ⓘ that sits after the heading. */
  tip?: ReactNode;
}) {
  return (
    <section className={cx('home-sec', className)} aria-labelledby={id}>
      <div className="home-sechead">
        <div className="text">
          <span className="sj-eyebrow">{eyebrow}</span>
          {tip ? (
            <div className="home-sectitle">
              <h2 id={id} className="sj-display sj-h2">
                {title}
              </h2>
              {tip}
            </div>
          ) : (
            <h2 id={id} className="sj-display sj-h2">
              {title}
            </h2>
          )}
        </div>
        {action ? <div className="action">{action}</div> : null}
      </div>
      {sub ? <p className="home-secsub">{sub}</p> : null}
      {children}
    </section>
  );
}

/**
 * A left-aligned empty or error state: icon tile and title on one row, the words below at the
 * full width, then the action. `card` wraps it in its own card; otherwise it sits inside one.
 */
export function Note({
  icon,
  title,
  children,
  action,
  tone = 'purple',
  card,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: 'purple' | 'lime' | 'yellow' | 'pink';
  card?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('home-note-block', card && 'sj-card', className)}>
      <div className="home-iconrow">
        <span className={cx('home-icontile', tone)} aria-hidden="true">
          {icon}
        </span>
        <h3 className="sj-display sj-h3">{title}</h3>
      </div>
      {children ? <p className="home-note-text">{children}</p> : null}
      {action ? <div className="home-note-action">{action}</div> : null}
    </div>
  );
}

/** Stats for a hero's aside: label above, number, a short note below; side by side. */
export function HeroStats({
  stats,
}: {
  stats: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: 'lime' | 'yellow' | 'white'; tip?: MetricId }[];
}) {
  return (
    <dl className="home-hstats">
      {stats.map((stat) => (
        <div key={stat.label} className={cx('home-hstat', stat.tone ?? 'white')}>
          <dt>
            {stat.label}
            {stat.tip ? <MetricTip id={stat.tip} onDark /> : null}
          </dt>
          <dd>
            <span className="sj-num">{stat.value}</span>
            {stat.unit ? <span className="unit">{stat.unit}</span> : null}
          </dd>
          {stat.note ? <p className="note">{stat.note}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/** A bar whose colour runs pink (weak) to lime (strong); its end colour is its level. */
export function MasteryBar({ value, label }: { value: number | null; label?: string }) {
  if (value === null) {
    return <div className="home-mbar none" aria-label={label ? `${label}: not checked yet` : 'Not checked yet'} role="img" />;
  }
  const pct = Math.round(value * 100);
  return (
    <div
      className="home-mbar"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ? `${label}: ${pct}%` : `${pct}%`}
    >
      <span style={{ width: `${value * 100}%`, backgroundSize: `${100 / Math.max(value, 0.04)}% 100%` }} />
    </div>
  );
}

const TICKS = [0, 25, 50, 75, 100];

/**
 * Where the score stands: today's predicted score, where the plan gets to by exam day, and the
 * target, as three figures over one 0–100 scale. With nothing to show yet it says what fills it
 * in and offers the step that does.
 */
export function Standing({ subject, className, sample }: { subject: SubjectOverview; className?: string; sample?: boolean }) {
  const checkup = useStartCheckup();
  const latest = subject.latest_checkup;
  const target = subject.goal?.target_score ?? latest?.target_score ?? null;
  const now = latest?.score_now ?? null;
  const projected = latest?.score_projected ?? null;
  const low = latest?.score_low ?? null;
  const high = latest?.score_high ?? null;
  const gap = target !== null && projected !== null ? Math.round(target - projected) : null;
  const at = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

  const figures: { key: string; label: string; value: number | null; line: ReactNode; badge?: ReactNode; tip: MetricId }[] = [
    { key: 'now', label: 'Predicted today', value: now, line: 'If you sat the exam today', tip: 'predicted' },
    { key: 'proj', label: 'By exam day', value: projected, line: 'If you keep to your plan', tip: 'projected' },
    {
      key: 'target',
      tip: 'target',
      label: 'Your target',
      value: target,
      line: target === null ? 'Not set yet' : subject.goal?.exam_date ? `For ${shortDate(subject.goal.exam_date)}` : 'The score you want',
      badge:
        gap === null ? null : (
          <span className="home-gap">
            {gap <= 0 ? (
              <Badge tone="green" dot>
                On track
              </Badge>
            ) : (
              <Badge tone="pink" dot>
                {gap} short
              </Badge>
            )}
            {sample ? null : <MetricTip id="gap" />}
          </span>
        ),
    },
  ];

  let footer: ReactNode;
  if (sample) {
    footer = <p className="home-sample-note">Your own numbers appear after your first check-up.</p>;
  } else if (now !== null && latest) {
    footer = (
      <div className="home-stand-foot">
        <p>
          {low !== null && high !== null ? (
            <>
              Your score today is most likely between <b>{fmtScore(low)}</b> and <b>{fmtScore(high)}</b>, shaded on the
              scale. <MetricTip id="range" />{' '}
            </>
          ) : null}
          From your {latest.answered}-question check-up on {shortDate(latest.finished_at)}.
        </p>
        <Link className="sj-link" to={`/checkup/${latest.session_id}/report`}>
          Read the report <IconArrowRight size={14} />
        </Link>
      </div>
    );
  } else if (latest) {
    footer = (
      <Note
        icon={<IconTrophy size={18} />}
        tone="yellow"
        title="Add your goal to see your score"
        action={
          <Button to={`/subjects/${subject.subject_id}/goal`} trailing={<IconArrowRight size={18} />}>
            Set my goal
          </Button>
        }
      >
        Your check-up is done. Tell us your target and exam date, and we turn your answers into a predicted score and a
        plan to close the gap.
      </Note>
    );
  } else if (subject.open_checkup_session_id) {
    footer = (
      <Note
        icon={<IconTarget size={18} />}
        title="Finish your check-up to fill this in"
        action={
          <Button to={`/checkup/${subject.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
            Resume check-up
          </Button>
        }
      >
        Your answers so far are saved. When you finish, your predicted score lands on this scale.
      </Note>
    );
  } else {
    footer = (
      <Note
        icon={<IconTarget size={18} />}
        title="Your first check-up fills this in"
        action={
          <Button busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
            Take a check-up
          </Button>
        }
      >
        A short set of {subject.subject_name} questions shows what you already know and predicts your score today.
      </Note>
    );
  }

  return (
    <div className={cx('sj-card home-stand', sample ? 'sample' : 'sticker', className)} aria-hidden={sample || undefined}>
      {sample ? <span className="home-sample-badge sj-mono">Example</span> : null}
      <div className="home-figs">
        {figures.map((fig) => (
          <div key={fig.key} className={cx('home-fig', fig.key, fig.value === null && 'empty')}>
            <span className="label">
              <i className={`k-${fig.key}`} aria-hidden="true" />
              {fig.label}
              {sample ? null : <MetricTip id={fig.tip} title={fig.key === 'now' ? 'Predicted score' : undefined} />}
            </span>
            <span className="val">
              <span className="sj-num">{fig.value === null ? '—' : <CountUp value={Math.round(fig.value)} />}</span>
              {fig.value !== null ? <span className="of sj-mono">/100</span> : null}
            </span>
            <span className="line">{fig.line}</span>
            {fig.badge ? <span className="badge">{fig.badge}</span> : null}
          </div>
        ))}
      </div>

      <div className="home-scale" aria-hidden="true">
        <div className="rail">
          {low !== null && high !== null ? <span className="band" style={{ left: at(low), width: at(high - low) }} /> : null}
          {now !== null ? <span className="now" style={{ width: at(now) }} /> : null}
          {projected !== null ? <span className="proj" style={{ left: at(projected) }} /> : null}
          {target !== null ? <span className="target" style={{ left: at(target) }} /> : null}
        </div>
        <div className="ticks sj-mono">
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${t}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {footer}
      {checkup.error ? <Alert>{checkup.error}</Alert> : null}
    </div>
  );
}

/** One practice run as a row. `detail` adds the topics and an accuracy bar (progress page). */
export function RunRow({
  run,
  detail,
  showSubject = true,
}: {
  run: PracticeRun & { topics?: string[] };
  detail?: boolean;
  showSubject?: boolean;
}) {
  const accuracy = run.answered > 0 ? run.correct_unaided / run.answered : 0;
  return (
    <li>
      <Link className={cx('home-run', detail && 'detail')} to={runHref(run)}>
        <span className={cx('home-run-icon', run.finished ? 'done' : 'open')} aria-hidden="true">
          {run.finished ? <IconCheck size={17} /> : <IconPlay size={14} />}
        </span>
        <span className="home-run-main">
          <strong>{showSubject ? run.subject_name : run.finished ? 'Finished run' : 'Run in progress'}</strong>
          <span className="meta sj-mono">
            {whenLabel(run.started_at)} · {run.answered} of {run.length}
          </span>
          {detail && run.topics && run.topics.length > 0 ? <span className="topics">{run.topics.join(' · ')}</span> : null}
        </span>
        {detail ? (
          <span className="home-run-acc">
            <span className="sj-mono">
              {run.answered > 0 ? `${Math.round(accuracy * 100)}%` : '—'}
              <small> first try</small>
            </span>
            <Track value={accuracy} tone="green" thin label="Right first time" />
          </span>
        ) : null}
        <span className="home-run-chips">
          <span className="home-chip right" title="Right first time, with no hint">
            <IconCheck size={13} />
            {run.correct_unaided}
          </span>
          {run.taught > 0 ? (
            <span className="home-chip taught" title="Worked through on the board">
              {run.taught} taught
            </span>
          ) : null}
        </span>
        <IconChevronRight size={18} className="home-run-go" />
      </Link>
    </li>
  );
}

/** The weakest subtopics, each with a way straight into practice. */
export function WeakList({
  subject,
  weak,
  starter,
}: {
  subject: SubjectOverview;
  weak: WeakSubtopic[];
  starter: ReturnType<typeof useStartPractice>;
}) {
  return (
    <ol className="home-weak">
      {weak.map((spot, index) => (
        <li key={spot.subtopic_id} className={`sj-rise d${Math.min(index + 1, 4)}`}>
          <div className="txt">
            <span className="topic sj-mono">
              <b>{String(index + 1).padStart(2, '0')}</b> · {spot.topic_name}
            </span>
            <strong>{spot.name}</strong>
          </div>
          <div className="meter">
            <MasteryBar value={spot.mastery} label={`${spot.name} mastery`} />
            <span className="pct sj-mono">{Math.round(spot.mastery * 100)}%</span>
          </div>
          <Button
            size="sm"
            tone="soft"
            busy={starter.busy === spot.subtopic_id}
            disabled={starter.busy !== null && starter.busy !== spot.subtopic_id}
            onClick={() => starter.start(subject.subject_id, spot.subtopic_id)}
            aria-label={`Practise ${subject.subject_name}, starting with ${spot.name}`}
          >
            Practise
          </Button>
        </li>
      ))}
    </ol>
  );
}

/** Practice totals: three figures and one bar that splits them. */
export function PracticeSplit({ subjects }: { subjects: SubjectOverview[] }) {
  const total = subjects.reduce(
    (sum, s) => ({
      answered: sum.answered + s.practice.questions_answered,
      right: sum.right + s.practice.correct_unaided,
      taught: sum.taught + s.practice.taught,
    }),
    { answered: 0, right: 0, taught: 0 },
  );
  const rest = Math.max(0, total.answered - total.right - total.taught);
  return (
    <div className="home-split-wrap">
      <dl className="home-split-figs">
        <div>
          <dt>
            <span>
              Answered <MetricTip id="answered" />
            </span>
          </dt>
          <dd className="sj-num">
            <CountUp value={total.answered} />
          </dd>
        </div>
        <div className="right">
          <dt>
            <i aria-hidden="true" />
            <span>
              Right first time <MetricTip id="right" />
            </span>
          </dt>
          <dd className="sj-num">
            <CountUp value={total.right} />
          </dd>
        </div>
        <div className="taught">
          <dt>
            <i aria-hidden="true" />
            <span>
              Taught on the board <MetricTip id="taught" />
            </span>
          </dt>
          <dd className="sj-num">
            <CountUp value={total.taught} />
          </dd>
        </div>
      </dl>
      <div
        className={cx('home-split', total.answered === 0 && 'empty')}
        role="img"
        aria-label={`${total.right} of ${total.answered} right first time, ${total.taught} taught on the board`}
      >
        {total.answered > 0 ? (
          <>
            <span className="r" style={{ flexGrow: total.right }} />
            <span className="t" style={{ flexGrow: total.taught }} />
            <span className="o" style={{ flexGrow: rest }} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ================================================================== the page */

/** The subject the dashboard leads with: the nearest exam, else the one with a check-up. */
function focusSubject(subjects: SubjectOverview[]): SubjectOverview | undefined {
  const dated = subjects
    .filter((s) => s.goal?.days_to_exam !== null && s.goal?.days_to_exam !== undefined && s.goal.days_to_exam >= 0)
    .sort((a, b) => (a.goal!.days_to_exam ?? 0) - (b.goal!.days_to_exam ?? 0));
  return dated[0] ?? subjects.find((s) => s.latest_checkup) ?? subjects[0];
}

type NextStep =
  | { kind: 'resume-run'; subject: SubjectOverview; sessionId: string; run?: PracticeRun }
  | { kind: 'resume-checkup'; subject: SubjectOverview; sessionId: string }
  | { kind: 'first-checkup'; subject: SubjectOverview }
  | { kind: 'set-goal'; subject?: SubjectOverview }
  | { kind: 'practice'; subject: SubjectOverview };

function decideNext(overview: Overview, focus: SubjectOverview | undefined): NextStep {
  const ordered = focus ? [focus, ...overview.subjects.filter((s) => s !== focus)] : overview.subjects;
  for (const subject of ordered) {
    if (subject.open_practice_session_id) {
      const run = overview.recent_runs.find((r) => r.session_id === subject.open_practice_session_id);
      return { kind: 'resume-run', subject, sessionId: subject.open_practice_session_id, run };
    }
  }
  for (const subject of ordered) {
    if (subject.open_checkup_session_id) return { kind: 'resume-checkup', subject, sessionId: subject.open_checkup_session_id };
  }
  for (const subject of ordered) {
    if (subject.goal && !subject.latest_checkup) return { kind: 'first-checkup', subject };
  }
  if (!ordered.some((s) => s.goal)) return { kind: 'set-goal', subject: ordered[0] };
  const practised = ordered.find((s) => s.latest_checkup);
  if (practised) return { kind: 'practice', subject: practised };
  return { kind: 'set-goal', subject: ordered[0] };
}

function todayLabel(): string {
  const now = new Date();
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

function firstName(overview: Overview): string {
  return overview.student.display_name.trim().split(/\s+/)[0] || 'there';
}

/** The hero: hello, the one next step, and the countdown and streak on the right. */
function Hero({ overview, step, focus }: { overview: Overview; step: NextStep; focus?: SubjectOverview }) {
  const practice = useStartPractice();
  const checkup = useStartCheckup();
  const name = step.subject?.subject_name ?? '';

  let lead: string;
  let body: ReactNode;
  let action: ReactNode;
  let secondary: ReactNode = null;

  switch (step.kind) {
    case 'resume-run': {
      const run = step.run;
      lead = `Finish your ${name} run.`;
      body = run
        ? run.answered === 0
          ? `You opened a run of ${run.length} questions and it's waiting for you.`
          : `You're ${run.answered} of ${run.length} questions in, with ${plural(run.correct_unaided, 'answer')} right first time. It's all saved.`
        : 'It is saved, so you pick up exactly where you stopped.';
      action = (
        <Button to={`/practice/${step.sessionId}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
          Resume run
        </Button>
      );
      secondary = <Link to={`/subjects/${step.subject.subject_id}`}>See your {name} plan</Link>;
      break;
    }
    case 'resume-checkup':
      lead = `Finish your ${name} check-up.`;
      body = "Your answers so far are saved. Finish it and you'll see your predicted score.";
      action = (
        <Button to={`/checkup/${step.sessionId}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
          Resume check-up
        </Button>
      );
      secondary = <Link to="/checkup">What a check-up does</Link>;
      break;
    case 'first-checkup':
      lead = `See where you stand in ${name}.`;
      body = "A short check-up finds what you know and what's holding your score down, then predicts your score.";
      action = (
        <Button
          tone="lime"
          size="lg"
          busy={checkup.busy}
          onClick={() => checkup.start(step.subject.subject_id)}
          trailing={<IconArrowRight size={18} />}
        >
          Take my first check-up
        </Button>
      );
      secondary = <Link to="/checkup">What a check-up does</Link>;
      break;
    case 'set-goal':
      lead = 'Set the score you are aiming for.';
      body = 'Your predicted score, your countdown and your study plan all hang off it.';
      action = (
        <Button
          to={overview.subjects.some((s) => s.goal) && step.subject ? `/subjects/${step.subject.subject_id}/goal` : '/onboarding'}
          tone="lime"
          size="lg"
          trailing={<IconArrowRight size={18} />}
        >
          Set my goal
        </Button>
      );
      secondary = <Link to="/exams">Browse exams and subjects</Link>;
      break;
    case 'practice': {
      const first = step.subject.latest_checkup?.weakest_subtopics[0];
      lead = `Start a ${name} run.`;
      body = first ? (
        <>
          Ten questions aimed at what's holding your score down, starting with <b>{first.name}</b>.
        </>
      ) : (
        "Ten questions aimed at what's holding your score down."
      );
      action = (
        <Button
          tone="lime"
          size="lg"
          busy={practice.busy !== null}
          onClick={() => practice.start(step.subject.subject_id)}
          trailing={<IconArrowRight size={18} />}
        >
          Start practice
        </Button>
      );
      secondary = step.subject.latest_checkup ? (
        <Link to={`/checkup/${step.subject.latest_checkup.session_id}/report`}>Read your check-up report</Link>
      ) : null;
      break;
    }
  }

  const days = focus?.goal?.days_to_exam;
  const stats: Parameters<typeof HeroStats>[0]['stats'] = [];
  if (focus && days !== null && days !== undefined && days >= 0) {
    stats.push({
      label: 'Days to exam',
      value: <CountUp value={days} />,
      tone: 'yellow',
      note: `${focus.examination_short_name} ${focus.subject_name}`,
      tip: 'days',
    });
  }
  if (overview.streak_days > 0) {
    stats.push({
      label: 'Day streak',
      value: <CountUp value={overview.streak_days} />,
      tone: 'lime',
      note: overview.active_today ? 'Including today' : 'Answer one today to keep it',
      tip: 'streak',
    });
  }
  if (stats.length === 0 && step.kind === 'resume-run' && step.run) {
    stats.push({
      label: 'This run',
      value: <CountUp value={step.run.answered} />,
      unit: `of ${step.run.length}`,
      tone: 'lime',
      note: 'Questions answered',
    });
  }

  return (
    <>
    <PageHero
      eyebrow={todayLabel()}
      title={`${greeting()}, ${firstName(overview)}`}
      sub={
        <>
          <span className="home-lead">
            <span className="home-lead-tag sj-mono">Next</span>
            <b>{lead}</b>
          </span>{' '}
          {body}
          <span className="home-how-phone">
            <Link to={HOW_PATH}>How your numbers are worked out</Link>
          </span>
        </>
      }
      actions={
        <>
          {action}
          {secondary ? <span className="home-hero-link">{secondary}</span> : null}
          <span className="home-hero-link quiet">
            <Link to={HOW_PATH}>How your numbers are worked out</Link>
          </span>
        </>
      }
      aside={stats.length > 0 ? <HeroStats stats={stats} /> : undefined}
    />
    {practice.error || checkup.error ? <Alert>{practice.error ?? checkup.error}</Alert> : null}
    </>
  );
}

/* ------------------------------------------------------------------ brand-new student */

const STEPS = [
  { n: '01', title: 'Set your goal', body: 'Pick your exam, the score you want and the day you sit it.' },
  { n: '02', title: 'Take a check-up', body: 'A short set of questions that predicts your score today.' },
  { n: '03', title: 'Practise daily', body: 'Ten-question runs on your weakest spots, with a coach when you are stuck.' },
];

/** Clearly marked example numbers for the preview of the score card. Never shown as real. */
const SAMPLE: SubjectOverview = {
  subject_id: 'sample',
  subject_name: 'Sample',
  examination_short_name: 'UTME',
  goal: { target_score: 70, exam_date: null, days_to_exam: null, minutes_per_day: null, study_days: null, sessions_before_exam: null },
  latest_checkup: {
    session_id: 'sample',
    finished_at: '2026-01-01T00:00:00Z',
    answered: 15,
    score_now: 48,
    score_low: 40,
    score_high: 56,
    score_projected: 64,
    target_score: 70,
    weakest_subtopics: [],
  },
  open_checkup_session_id: null,
  open_practice_session_id: null,
  practice: { runs_finished: 0, questions_answered: 0, correct_unaided: 0, taught: 0 },
};

function FirstRun({ overview }: { overview: Overview }) {
  return (
    <>
      <PageHero
        eyebrow={todayLabel()}
        title={`${greeting()}, ${firstName(overview)}`}
        sub="Welcome to Stack Prep. Three short steps and you'll know your predicted score, and exactly what to practise each day to raise it."
        actions={
          <>
            <Button to="/onboarding" tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
              Set my goal
            </Button>
            <span className="home-hero-link">
              <Link to="/checkup">What a check-up does</Link>
            </span>
          </>
        }
      />

      <Section eyebrow="Getting started" title="Your path to exam-ready" id="home-path" className="sj-rise d1">
        <Steps
          current={0}
          steps={STEPS.map((step, index) => ({
            title: step.title,
            body: step.body,
            action:
              index === 0 ? (
                <Button to="/onboarding" size="sm" trailing={<IconArrowRight size={16} />}>
                  Set my goal
                </Button>
              ) : undefined,
            note: index === 0 ? undefined : `After step ${index}`,
          }))}
        />
      </Section>

      <Section
        eyebrow="What you'll see here"
        title="Your score, on one scale"
        id="home-preview"
        className="sj-rise d2"
        sub="Today's predicted score, where your plan gets you by exam day, and your target, side by side."
      >
        <Standing subject={SAMPLE} sample />
      </Section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <Skeleton height={236} radius={18} />
      <div className="home-skel-sec">
        <Skeleton width={120} height={12} />
        <Skeleton width="min(300px, 70%)" height={28} radius={8} />
        <Skeleton height={250} radius={14} />
      </div>
      <div className="home-duo">
        <Skeleton height={320} radius={14} />
        <Skeleton height={320} radius={14} />
      </div>
    </div>
  );
}

function SubjectCards({ subjects }: { subjects: SubjectOverview[] }) {
  const more = useShowMore(subjects, 6);
  return (
    <Section
      eyebrow="All your subjects"
      title="Your subjects"
      id="home-subjects"
      className="sj-rise d4"
      action={
        <Link className="sj-link" to="/exams">
          Add a subject <IconArrowRight size={14} />
        </Link>
      }
    >
      <div className="home-subjects" id="home-subject-list">
        {more.items.map((s) => {
          const latest = s.latest_checkup;
          const days = s.goal?.days_to_exam;
          return (
            <Link key={s.subject_id} to={`/subjects/${s.subject_id}`} className="sj-card hover home-subject">
              <div className="top">
                <span className="sj-eyebrow">{s.examination_short_name}</span>
                {days !== null && days !== undefined && days >= 0 ? (
                  <span className="sj-mono home-subject-days">{plural(days, 'day')} to go</span>
                ) : null}
              </div>
              <h3 className="sj-display sj-h3">{s.subject_name}</h3>
              <div className="home-subject-score">
                {latest?.score_now !== null && latest?.score_now !== undefined ? (
                  <>
                    <span className="sj-num">{fmtScore(latest.score_now)}</span>
                    <span className="sj-muted sj-small">
                      predicted{s.goal?.target_score ? ` · aiming for ${fmtScore(s.goal.target_score)}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="sj-muted sj-small">
                    {latest ? 'Set a goal to see your score' : s.goal ? 'No check-up yet' : 'No goal yet'}
                  </span>
                )}
              </div>
              <span className="go">
                Open <IconArrowRight size={16} />
              </span>
            </Link>
          );
        })}
      </div>
      <ShowMore more={more} noun="subjects" controls="home-subject-list" />
    </Section>
  );
}

export function Home() {
  usePageTitle('Home');
  const student = useStudent();
  const overview = useLoad(() => progressApi.overview(student.studentId), [student.studentId]);
  const starter = useStartPractice();

  if (!overview.data) {
    return (
      <div className="sj-page home">
        {overview.error ? (
          <>
            <PageHero eyebrow={todayLabel()} title={greeting()} />
            <Note
              card
              icon={<IconHome size={18} />}
              title="We couldn't load your dashboard"
              action={
                <Button tone="soft" onClick={overview.reload}>
                  Try again
                </Button>
              }
            >
              Check your connection and try again. Nothing you've done is lost.
            </Note>
          </>
        ) : (
          <HomeSkeleton />
        )}
      </div>
    );
  }

  const data = overview.data;
  const subjects = data.subjects;

  if (subjects.length === 0) {
    return (
      <div className="sj-page home">
        <FirstRun overview={data} />
      </div>
    );
  }

  const focus = focusSubject(subjects);
  const many = subjects.length > 1;
  const step = decideNext(data, focus);
  const weak = focus?.latest_checkup?.weakest_subtopics ?? [];

  return (
    <HomeBody data={data} focus={focus} many={many} step={step} weak={weak} starter={starter} />
  );
}

function HomeBody({
  data,
  focus,
  many,
  step,
  weak,
  starter,
}: {
  data: Overview;
  focus: SubjectOverview | undefined;
  many: boolean;
  step: NextStep;
  weak: WeakSubtopic[];
  starter: ReturnType<typeof useStartPractice>;
}) {
  const subjects = data.subjects;
  const recent = useShowMore(data.recent_runs, 4);
  return (
    <div className="sj-page home">
      <Hero overview={data} step={step} focus={focus} />

      {focus ? (
        <Section
          eyebrow={`Predicted score · ${focus.examination_short_name} ${focus.subject_name}`}
          title="Where you stand"
          id="home-stand"
          className="sj-rise d1"
          action={
            <Link className="sj-link" to={`/subjects/${focus.subject_id}`}>
              {focus.subject_name} plan <IconArrowRight size={14} />
            </Link>
          }
        >
          <Standing subject={focus} />
        </Section>
      ) : null}

      <div className="home-duo">
        <Section
          eyebrow="Work on next"
          title="Your weakest spots"
          id="home-weak"
          className="sj-rise d2"
          tip={<MetricTip id="weakest" />}
          sub={
            <>
              Mastery is how often we think you'd get a question on it right, from your check-up answers.{' '}
              <MetricTip id="mastery" />
            </>
          }
        >
          <div className="sj-card home-panel">
            {weak.length > 0 && focus ? (
              <>
                <WeakList subject={focus} weak={weak} starter={starter} />
                <p className="home-note">A run starts with the spot your plan puts first, then works down the list.</p>
                {starter.error ? <Alert>{starter.error}</Alert> : null}
              </>
            ) : (
              <Note icon={<IconTarget size={18} />} title={focus?.latest_checkup ? 'Nothing weak to single out' : 'Nothing to show yet'}>
                {focus?.latest_checkup
                  ? 'Your check-up found nothing weak enough to single out. Keep practising to hold it.'
                  : 'Take a check-up and the spots holding your score down show up here, weakest first.'}
              </Note>
            )}
          </div>
        </Section>

        <Section
          eyebrow="Recent practice"
          title="Your practice so far"
          id="home-runs"
          className="sj-rise d3"
          sub="Right first time means no hint needed. Taught means the coach worked it through with you."
        >
          <div className="sj-card home-panel">
            <PracticeSplit subjects={subjects} />
            {data.recent_runs.length > 0 ? (
              <>
                <ul className="home-runs" id="home-run-list">
                  {recent.items.map((run) => (
                    <RunRow key={run.session_id} run={run} showSubject />
                  ))}
                </ul>
                <div className="home-panel-foot">
                  <ShowMore more={recent} noun="recent runs" controls="home-run-list" />
                  <Link className="sj-link home-panel-link" to="/progress">
                    See every run <IconArrowRight size={14} />
                  </Link>
                </div>
              </>
            ) : (
              <Note icon={<IconBolt size={18} />} tone="lime" title="No runs yet">
                Your first run shows up here the moment you start it.
              </Note>
            )}
          </div>
        </Section>
      </div>

      {many ? <SubjectCards subjects={subjects} /> : null}
    </div>
  );
}
