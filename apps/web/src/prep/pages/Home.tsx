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
import { Refused, runsApi } from '../runsApi.js';
import {
  IconArrowRight,
  IconBolt,
  IconCalendar,
  IconChart,
  IconCheck,
  IconChevronRight,
  IconHome,
  IconPlay,
  IconTarget,
  IconTrophy,
} from '../icons.js';
import type { Overview, PracticeRun, SubjectOverview, WeakSubtopic } from '../progressApi.js';
import {
  ScoreCell,
  StatusCell,
  SubjectName,
  SubjectRows,
  SubjectSwitcher,
  byUrgency,
  isDemoSubject,
  subjectStatus,
  useOverview,
  useSubjectChoice,
  type SubjectColumn,
} from '../SubjectSwitcher.js';
import { Journey, type Stop } from '../Journey.js';
import { itemLabel, roadmapApi, today as todayOf, useRoadmap, useStartItem, type Roadmap } from '../roadmapApi.js';
import { usePageTitle, useStudent } from '../store.js';
import { Badge, Button, CountUp, PageHero, ShowMore, Skeleton, Track, cx, greeting, useShowMore, useToast } from '../ui.js';
import { HOW_PATH, MetricTip, type MetricId } from './HowItsWorkedOut.js';
import { pathStops } from './Roadmap.js';
import './Home.css';
import { friendly } from '../../lib/friendlyError.js';

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

/**
 * The words for a topic score (0..1), as docs/student-scoring.md §2 labels it. Pass `answered`
 * where known: fewer than 3 answers is only "Just started", whatever the percentage.
 */
export function masteryWord(m: number | null, answered?: number): string {
  if (m === null || answered === 0) return 'Not tried yet';
  if (answered !== undefined && answered < 3) return 'Just started';
  if (m >= 0.8) return 'Strong';
  if (m >= 0.5) return 'Getting there';
  return 'Needs work';
}

/** Where a run opens: an unfinished one back in the room, a finished one on its summary. */
export const runHref = (run: Pick<PracticeRun, 'session_id' | 'finished'>) =>
  run.finished ? `/practice/${run.session_id}/report` : `/practice/${run.session_id}`;

/**
 * What a practice run is narrowed to. Empty, the engine plans the run across the whole subject;
 * given, the run only ever serves those subtopics, topics or years (the API filters strictly).
 */
export interface PracticeFocus {
  subtopicIds?: string[];
  topicIds?: string[];
  examYears?: number[];
  /** A revision run of the bookmarked questions. */
  bookmarked?: boolean;
  length?: number;
  /** What the student would call the choice ("Indices"), for when it has nothing fresh left. */
  label?: string;
}

/** A narrowed run the API refused because the student has met every question in it. */
export interface NothingFresh {
  subjectId: string;
  label: string;
  /** The busy key of the button that asked, so a page with two can answer beside the right one. */
  key: string;
}

const isNarrowed = (focus: PracticeFocus) =>
  Boolean(focus.bookmarked || focus.subtopicIds?.length || focus.topicIds?.length || focus.examYears?.length);

/**
 * Starts a practice run and takes the student into it. `key` only marks which button spins;
 * `focus` is what the run is about. A topic with nothing fresh left is never swapped for a
 * general run behind the student's back: `exhausted` says so, and `<NothingFreshNote>` offers one.
 */
export function useStartPractice() {
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState<NothingFresh | null>(null);
  // Which button last asked, so a page with many can show a failure beside the one that failed.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const start = async (subjectId: string, focus: PracticeFocus = {}, key: string = subjectId) => {
    setBusy(key);
    setLastKey(key);
    setError(null);
    setExhausted(null);
    try {
      const run = await runsApi.start({
        student_id: student.studentId,
        subject_id: subjectId,
        length: focus.length,
        subtopic_ids: focus.subtopicIds?.length ? focus.subtopicIds : undefined,
        topic_ids: focus.topicIds?.length ? focus.topicIds : undefined,
        exam_years: focus.examYears?.length ? focus.examYears : undefined,
        bookmarked: focus.bookmarked || undefined,
      });
      toast(focus.bookmarked ? 'Revising your bookmarks' : 'New run started');
      navigate(`/practice/${run.session_id}`);
    } catch (failure) {
      setBusy(null);
      // 428: the roadmap picks the runs for now. Do its next item instead, and say so.
      if (failure instanceof Refused && failure.status === 428) {
        try {
          const plan = await roadmapApi.read(student.studentId);
          const next =
            todayOf(plan).next ??
            plan.items.find((item) => item.state === 'to_do' && item.subject_id === subjectId) ??
            plan.items.find((item) => item.state === 'to_do');
          if (next) {
            const started = await roadmapApi.start(student.studentId, next.id);
            toast(`Your roadmap: ${itemLabel(next)}`);
            navigate(started.path);
            return;
          }
        } catch {
          /* fall through to the plain message */
        }
        setError(friendly(failure));
        return;
      }
      // 423: practice is locked behind a check-up (first one, or one due). Go and take it.
      if (failure instanceof Refused && failure.status === 423) {
        toast(friendly(failure));
        try {
          const sitting = await api.start(student.studentId, subjectId);
          navigate(`/checkup/${sitting.session_id}`);
        } catch (again) {
          setError(`${friendly(failure)} We couldn't open it just now: ${friendly(again)}`);
        }
        return;
      }
      // 422 on a narrowed start is the API's "nothing matches": every question there is met.
      if (isNarrowed(focus) && failure instanceof Refused && failure.status === 422) {
        setExhausted({ subjectId, label: focus.label ?? 'that choice', key });
        return;
      }
      setError(`We couldn't start a run just now: ${friendly(failure)}`);
    }
  };
  return { busy, error, exhausted, lastKey, start };
}

/** Said when a chosen topic has no fresh questions: plainly, with a general run one tap away. */
export function NothingFreshNote({ starter }: { starter: ReturnType<typeof useStartPractice> }) {
  const left = starter.exhausted;
  if (!left) return null;
  return (
    <div className="home-fresh" role="status">
      <p>
        You've answered every question in <b>{left.label}</b> for now, so there's nothing new to ask there. A general
        run carries on with the rest of your plan.
      </p>
      <Button
        size="sm"
        tone="soft"
        busy={starter.busy === `general:${left.subjectId}`}
        disabled={starter.busy !== null}
        onClick={() => void starter.start(left.subjectId, {}, `general:${left.subjectId}`)}
      >
        Start a general run
      </Button>
    </div>
  );
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
      setError(`We couldn't start the check-up just now: ${friendly(failure)}`);
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

/** "+10", "−3" or "±0": a change in whole percentage points. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '±0';
}

/** "in 3 days", "tomorrow", "today": when the next check-up falls due. */
export function dueIn(iso: string | null): string {
  if (!iso) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${iso}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * Where the student stands (docs/student-scoring.md): their score now, from every answer; their
 * predicted score, from the latest check-up; and their target, as three figures over one 0–100%
 * scale that also shows how far they've come since they started. With nothing to show yet it
 * says what fills it in and offers the step that does.
 */
export function Standing({ subject, className, sample }: { subject: SubjectOverview; className?: string; sample?: boolean }) {
  const checkup = useStartCheckup();
  const scores = subject.scores ?? null;
  const latest = subject.latest_checkup;
  const target = subject.goal?.target_score ?? null;
  const score = scores?.score ?? null;
  const predicted = scores?.predicted ?? latest?.score ?? null;
  const started = scores?.started_score ?? null;
  const change = scores?.change ?? null;
  const measure = predicted ?? score;
  const gap = target !== null && measure !== null ? Math.round(target - measure) : null;
  const at = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  const history = (scores?.checkups ?? []).map((line) => line.score).filter((v): v is number => v !== null);

  const figures: { key: string; label: string; value: number | null; line: ReactNode; badge?: ReactNode; tip: MetricId }[] = [
    {
      key: 'now',
      label: 'Your score',
      value: score,
      tip: 'score',
      line:
        score === null || !scores
          ? 'The average of your topic scores'
          : `Average of ${scores.topics_tried} topic${scores.topics_tried === 1 ? '' : 's'} tried`,
      badge:
        change === null || started === null ? null : (
          <span className="home-gap">
            <Badge tone={change > 0 ? 'green' : change < 0 ? 'pink' : 'ghost'} dot>
              {signed(change)} since you started at {started}%
            </Badge>
            {sample ? null : <MetricTip id="started" />}
          </span>
        ),
    },
    {
      key: 'proj',
      label: 'Predicted score',
      value: predicted,
      tip: 'predicted',
      line: latest ? `Your check-up on ${shortDate(latest.finished_at)}` : 'Comes from your check-up',
    },
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
                Target reached
              </Badge>
            ) : (
              <Badge tone="pink" dot>
                {gap}% to go
              </Badge>
            )}
            {sample ? null : <MetricTip id="gap" />}
          </span>
        ),
    },
  ];

  const takeCheckup = (
    <Button busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
      Take a check-up
    </Button>
  );

  let footer: ReactNode;
  if (sample) {
    footer = <p className="home-sample-note">Your own numbers appear after your first check-up.</p>;
  } else if (subject.open_checkup_session_id) {
    footer = (
      <Note
        icon={<IconTarget size={18} />}
        title={latest ? 'Finish your check-up' : 'Finish your check-up to fill this in'}
        action={
          <Button to={`/checkup/${subject.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
            Resume check-up
          </Button>
        }
      >
      </Note>
    );
  } else if (latest && scores) {
    footer = (
      <div className="home-stand-foot">
        <p>
          {history.length > 1 ? (
            <>
              Your check-ups: <b>{history.map((v) => `${v}%`).join(' → ')}</b>.{' '}
            </>
          ) : (
            <>
              Your first check-up: <b>{latest.right} of {latest.answered} right</b>.{' '}
            </>
          )}
          {scores.checkup_due ? (
            <b>A new check-up is due.</b>
          ) : (
            <>Next check-up {dueIn(scores.next_checkup_due)}.</>
          )}{' '}
          <MetricTip id="checkup" />
        </p>
        {scores.checkup_due ? (
          takeCheckup
        ) : (
          <Link className="sj-link" to={`/checkup/${latest.session_id}/report`}>
            Read the report <IconArrowRight size={14} />
          </Link>
        )}
      </div>
    );
  } else if (score !== null) {
    footer = (
      <Note icon={<IconTarget size={18} />} title="Take a check-up for your predicted score" action={takeCheckup} />
    );
  } else {
    footer = (
      <Note icon={<IconTarget size={18} />} title="Your first check-up fills this in" action={takeCheckup} />
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
              {sample ? null : <MetricTip id={fig.tip} />}
            </span>
            <span className="val">
              <span className="sj-num">{fig.value === null ? '—' : <CountUp value={Math.round(fig.value)} />}</span>
              {fig.value !== null ? <span className="of sj-mono">%</span> : null}
            </span>
            <span className="line">{fig.line}</span>
            {fig.badge ? <span className="badge">{fig.badge}</span> : null}
          </div>
        ))}
      </div>

      <div className="home-scale" aria-hidden="true">
        <div className="rail">
          {started !== null && score !== null && score > started ? (
            <span className="home-band gain" style={{ left: at(started), width: at(score - started) }} />
          ) : null}
          {score !== null ? <span className="now" style={{ width: at(score) }} /> : null}
          {started !== null && score !== null && started !== score ? <span className="start" style={{ left: at(started) }} /> : null}
          {predicted !== null ? <span className="proj" style={{ left: at(predicted) }} /> : null}
          {target !== null ? <span className="target" style={{ left: at(target) }} /> : null}
        </div>
        <div className="ticks sj-mono">
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${t}%` }}>
              {t}%
            </span>
          ))}
        </div>
      </div>

      {footer}
      {checkup.error ? <Alert>{checkup.error}</Alert> : null}
    </div>
  );
}

/**
 * One practice run as a row. `detail` adds the topics and an accuracy bar (progress page). The
 * topics are JAMB's (`subtopics` in the API); `topics` there are its sections, the fallback.
 */
export function RunRow({
  run,
  detail,
  showSubject = true,
}: {
  run: PracticeRun & { topics?: string[]; subtopics?: string[] };
  detail?: boolean;
  showSubject?: boolean;
}) {
  const accuracy = run.answered > 0 ? run.correct_unaided / run.answered : 0;
  const topics = run.subtopics ?? run.topics ?? [];
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
          {detail && topics.length > 0 ? <span className="topics">{topics.join(' · ')}</span> : null}
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

/** The weakest topics (JAMB's), each under its section and with a way straight into practice. */
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
    <>
    <ol className="home-weak">
      {weak.map((spot, index) => (
        <li key={spot.subtopic_id} className={`sj-rise d${Math.min(index + 1, 4)}`}>
          <div className="txt">
            <span className="topic sj-mono">
              <b>{String(index + 1).padStart(2, '0')}</b> · {spot.section_name ?? spot.topic_name}
            </span>
            <strong>{spot.name}</strong>
          </div>
          <div className="meter">
            <MasteryBar value={spot.mastery} label={`${spot.name} score`} />
            <span className="pct sj-mono" title={spot.answered ? `${spot.right} of ${spot.answered} right` : undefined}>
              {Math.round(spot.mastery * 100)}%
            </span>
          </div>
          <Button
            size="sm"
            tone="soft"
            busy={starter.busy === spot.subtopic_id}
            disabled={starter.busy !== null && starter.busy !== spot.subtopic_id}
            onClick={() =>
              starter.start(subject.subject_id, { subtopicIds: [spot.subtopic_id], label: spot.name }, spot.subtopic_id)
            }
            aria-label={`Practise ${spot.name} in ${subject.subject_name}`}
          >
            Practise
          </Button>
        </li>
      ))}
    </ol>
    <NothingFreshNote starter={starter} />
    </>
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
  | { kind: 'today'; roadmap: Roadmap; subject?: undefined }
  | { kind: 'resume-run'; subject: SubjectOverview; sessionId: string; run?: PracticeRun }
  | { kind: 'resume-checkup'; subject: SubjectOverview; sessionId: string }
  | { kind: 'first-checkup'; subject: SubjectOverview }
  | { kind: 'set-goal'; subject?: SubjectOverview }
  | { kind: 'practice'; subject: SubjectOverview };

function decideNext(overview: Overview, focus: SubjectOverview | undefined, roadmap?: Roadmap): NextStep {
  // Most urgent first (a half-done check-up, a subject with no check-up, an open run, the
  // widest gap), with the dashboard's focus subject winning a tie.
  const ordered = byUrgency(focus ? [focus, ...overview.subjects.filter((s) => s !== focus)] : overview.subjects);
  for (const subject of ordered) {
    if (subject.open_checkup_session_id) return { kind: 'resume-checkup', subject, sessionId: subject.open_checkup_session_id };
  }
  // The roadmap leads once there is one with something planned today (the plan, not the
  // student, decides what comes next).
  if (roadmap && todayOf(roadmap).items.length > 0) return { kind: 'today', roadmap };
  for (const subject of ordered) {
    if (subject.goal && !subject.latest_checkup) return { kind: 'first-checkup', subject };
  }
  for (const subject of ordered) {
    if (subject.open_practice_session_id) {
      const run = overview.recent_runs.find((r) => r.session_id === subject.open_practice_session_id);
      return { kind: 'resume-run', subject, sessionId: subject.open_practice_session_id, run };
    }
  }
  if (!ordered.some((s) => s.goal)) return { kind: 'set-goal', subject: ordered[0] };
  const practised = ordered.find((s) => s.latest_checkup);
  if (practised) return { kind: 'practice', subject: practised };
  return { kind: 'set-goal', subject: ordered[0] };
}

/** An open run elsewhere, when the hero is pointing at something else. */
function otherOpenRun(overview: Overview, step: NextStep): SubjectOverview | undefined {
  if (step.kind === 'resume-run') return undefined;
  return overview.subjects.find((s) => s.open_practice_session_id);
}

function todayLabel(): string {
  const now = new Date();
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

function firstName(overview: Overview): string {
  return overview.student.display_name.trim().split(/\s+/)[0] || 'there';
}

/** The hero: hello, the one next step, and the countdown and streak on the right. */
function Hero({ overview, step }: { overview: Overview; step: NextStep; focus?: SubjectOverview }) {
  const practice = useStartPractice();
  const checkup = useStartCheckup();
  const planned = useStartItem(overview.student.student_id);
  const name = step.subject?.subject_name ?? '';

  let lead: string;
  let body: ReactNode;
  let action: ReactNode;
  let secondary: ReactNode = null;

  switch (step.kind) {
    case 'today': {
      const { items, next } = todayOf(step.roadmap);
      const done = items.filter((item) => item.state === 'done').length;
      lead = next ? (next.kind === 'checkup' ? `${next.subject_name} check-up` : itemLabel(next)) : 'Done for today';
      body = (
        <span className="home-today">
          {next && next.kind !== 'checkup' && next.subject_name ? <span className="home-today-sub">{next.subject_name}</span> : null}
          {/* Today's progress as dots, one per planned item: the list itself is on the roadmap. */}
          <span className="home-dots" aria-label={`${done} of ${items.length} done today`}>
            {items.map((item) => (
              <i key={item.id} className={item.state === 'done' ? 'on' : next && item.id === next.id ? 'now' : undefined} />
            ))}
            <span className="home-dots-count sj-mono">
              {done} of {items.length} today
            </span>
          </span>
        </span>
      );
      action = next ? (
        <Button tone="lime" size="lg" busy={planned.busy === next.id} onClick={() => void planned.start(next)} icon={<IconPlay size={16} />}>
          {next.state === 'in_progress' ? 'Carry on' : 'Start'}
        </Button>
      ) : (
        <Button to="/roadmap" tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
          See tomorrow
        </Button>
      );
      secondary = null;
      break;
    }
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
      body = null;
      action = (
        <Button to={`/checkup/${step.sessionId}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
          Resume check-up
        </Button>
      );
      // Mid check-up, what it does is known; how its numbers are read is the useful link.
      break;
    case 'first-checkup':
      lead = overview.subjects.some((s) => s.latest_checkup)
        ? `Take your ${name} check-up.`
        : `See where you stand in ${name}.`;
      body = 'About 15 questions. Your plan starts from it.';
      action = (
        <Button
          tone="lime"
          size="lg"
          busy={checkup.busy}
          onClick={() => checkup.start(step.subject.subject_id)}
          trailing={<IconArrowRight size={18} />}
        >
          Take my {name} check-up
        </Button>
      );
      {
        const open = otherOpenRun(overview, step);
        secondary = open ? (
          <Link to={`/practice/${open.open_practice_session_id}`}>Or finish your {open.subject_name} run</Link>
        ) : (
          <Link to="/checkup">What a check-up does</Link>
        );
      }
      break;
    case 'set-goal':
      lead = 'Set the score you are aiming for.';
      body = null;
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
      // The run is sent to the spot the label names, so what it says is what the student gets.
      body = first ? (
        <>
          A run on <b>{first.name}</b>, the topic your check-up found weakest in {name}.
        </>
      ) : (
        "Ten questions aimed at what's holding your score down."
      );
      action = (
        <Button
          tone="lime"
          size="lg"
          busy={practice.busy !== null}
          onClick={() =>
            practice.start(
              step.subject.subject_id,
              first ? { subtopicIds: [first.subtopic_id], label: first.name } : {},
            )
          }
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

  // Counted per exam, not per subject (prep/countdown.tsx): UTME's one day, or WAEC's next paper.
  const nextExam = (overview.exams ?? []).find((exam) => exam.days_to_next != null && exam.days_to_next >= 0);
  const days = nextExam?.days_to_next;
  const stats: Parameters<typeof HeroStats>[0]['stats'] = [];
  if (nextExam && days !== null && days !== undefined) {
    stats.push({
      label: nextExam.sits_together ? 'Days to exam' : 'Days to next paper',
      value: <CountUp value={days} />,
      tone: 'yellow',
      note: nextExam.sits_together ? nextExam.short_name : `${nextExam.short_name} ${nextExam.next_subject_names.join(' and ')}`,
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
        </>
      }
      actions={
        <>
          {action}
          {/* One quiet way to read more, never two: the step's own link, else how the numbers work. */}
          {step.kind === 'today' ? null : (
            <span className="home-hero-link">{secondary ?? <Link to={HOW_PATH}>How your numbers are worked out</Link>}</span>
          )}
        </>
      }
      aside={stats.length > 0 ? <HeroStats stats={stats} /> : undefined}
    />
    {practice.error || checkup.error || planned.error ? <Alert>{practice.error ?? checkup.error ?? planned.error}</Alert> : null}
    <NothingFreshNote starter={practice} />
    </>
  );
}

/* ------------------------------------------------------------------ brand-new student */

/** A new student: the path ahead, with its first step (set the goal) as the one action. */
export const FIRST_PATH: Stop[] = [
  { key: 'goal', title: 'Set your goal', line: 'Your exam, target and date', icon: <IconTarget size={20} />, state: 'current' },
  { key: 'checkup', title: 'Take a check-up', line: '15 questions', icon: <IconTarget size={20} />, state: 'locked' },
  { key: 'plan', title: 'Your plan', line: 'Built for you', icon: <IconCalendar size={20} />, state: 'locked' },
  { key: 'daily', title: 'Daily runs', line: 'A few a day', icon: <IconBolt size={20} />, state: 'locked' },
  { key: 'weekly', title: 'Check-ups', line: 'Every week, your score climbs', icon: <IconChart size={20} />, state: 'locked' },
  { key: 'exam', title: 'Exam day', line: 'Your target', icon: <IconTrophy size={20} />, state: 'locked', finish: true },
];

function FirstRun({ overview }: { overview: Overview }) {
  return (
    <>
      <PageHero eyebrow={todayLabel()} title={`${greeting()}, ${firstName(overview)}`} sub="Set your goal and we'll build your plan." />
      <Section eyebrow="Your path" title="From here to exam day" id="home-path" className="sj-rise d1">
        <Journey
          stops={FIRST_PATH}
          action={
            <Button to="/onboarding" tone="lime" size="sm" trailing={<IconArrowRight size={16} />}>
              Set my goal
            </Button>
          }
        />
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

/** Starts a check-up or a run from a row, remembering which row is busy. */
function useRowStarters() {
  const practice = useStartPractice();
  const checkup = useStartCheckup();
  const [checking, setChecking] = useState<string | null>(null);
  return {
    busy: (id: string) => practice.busy === id || (checkup.busy && checking === id),
    anyBusy: practice.busy !== null || checkup.busy,
    practise: (id: string) => void practice.start(id),
    check: (id: string) => {
      setChecking(id);
      void checkup.start(id);
    },
    error: practice.error ?? checkup.error,
  };
}

/** The one next thing for a subject, as a row's action. */
function SubjectNext({ subject, starters }: { subject: SubjectOverview; starters: ReturnType<typeof useRowStarters> }) {
  const st = subjectStatus(subject);
  const id = subject.subject_id;
  const demo = isDemoSubject(id);
  if (st.kind === 'checkup-open') {
    return (
      <Button size="sm" tone="dark" to={`/checkup/${subject.open_checkup_session_id}`} trailing={<IconArrowRight size={16} />}>
        Finish check-up
      </Button>
    );
  }
  if (st.kind === 'no-goal') {
    return (
      <Button size="sm" tone="ghost" to={`/subjects/${id}/goal`}>
        Set a goal
      </Button>
    );
  }
  if (st.kind === 'no-checkup') {
    return (
      <Button
        size="sm"
        tone="dark"
        busy={starters.busy(id)}
        disabled={demo || (starters.anyBusy && !starters.busy(id))}
        onClick={() => starters.check(id)}
        trailing={starters.busy(id) ? undefined : <IconArrowRight size={16} />}
      >
        Take check-up
      </Button>
    );
  }
  if (subject.open_practice_session_id) {
    return (
      <Button size="sm" tone="ghost" to={`/practice/${subject.open_practice_session_id}`}>
        Resume run
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      tone="ghost"
      busy={starters.busy(id)}
      disabled={demo || (starters.anyBusy && !starters.busy(id))}
      onClick={() => starters.practise(id)}
    >
      Practise
    </Button>
  );
}

/**
 * Every subject at a glance: its check-up, its predicted score against the target, and the one
 * next thing to do, most urgent first. A subject with no check-up can't hide here.
 */
function SubjectsGlance({ subjects, selected }: { subjects: SubjectOverview[]; selected: string | null }) {
  const starters = useRowStarters();
  const ordered = byUrgency(subjects);
  const more = useShowMore(ordered, 8);
  const unchecked = subjects.filter((s) => !s.latest_checkup).length;
  const columns: SubjectColumn[] = [
    {
      key: 'name',
      head: 'Subject',
      width: 'minmax(0, 1.5fr)',
      phone: 'lead',
      cell: (s) => <SubjectName subject={s} to={<Link to={`/subjects/${s.subject_id}`}>{s.subject_name}</Link>} />,
    },
    {
      key: 'status',
      head: 'Check-up',
      width: 'minmax(0, 1.1fr)',
      cell: (s) => (
        <StatusCell
          subject={s}
          detail={
            s.latest_checkup
              ? shortDate(s.latest_checkup.finished_at)
              : s.goal?.days_to_exam != null && s.goal.days_to_exam >= 0
                ? `${plural(s.goal.days_to_exam, 'day')} to the exam`
                : undefined
          }
        />
      ),
    },
    { key: 'score', head: 'Predicted score', width: 'minmax(0, 1.3fr)', phone: 'inline', cell: (s) => <ScoreCell subject={s} /> },
    {
      key: 'next',
      head: 'Next',
      width: '150px',
      align: 'end',
      phone: 'end',
      cell: (s) => <SubjectNext subject={s} starters={starters} />,
    },
  ];
  return (
    <Section
      eyebrow={`${plural(subjects.length, 'subject')}${unchecked > 0 ? ` · ${unchecked} without a check-up` : ''}`}
      title="Your subjects"
      id="home-subjects"
      className="sj-rise d1"
      action={
        <Link className="sj-link" to="/exams">
          Add a subject <IconArrowRight size={14} />
        </Link>
      }
    >
      <SubjectRows subjects={more.items} columns={columns} label="Your subjects" selected={selected} id="home-subject-list" />
      <ShowMore more={more} noun="subjects" controls="home-subject-list" />
      {starters.error ? <Alert>{starters.error}</Alert> : null}
    </Section>
  );
}

export function Home() {
  usePageTitle('Home');
  const student = useStudent();
  const overview = useOverview(student.studentId);
  const roadmap = useRoadmap(student.studentId);

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
  const step = decideNext(data, focus, roadmap.data);

  return <HomeBody data={data} focus={focus} step={step} roadmap={roadmap.data ?? null} />;
}

/** The few stops after today's next one, as on the roadmap; the full path is one tap away. */
function UpNext({ roadmap, heroHasNext }: { roadmap: Roadmap; heroHasNext: boolean }) {
  const { next } = todayOf(roadmap);
  // When the hero already holds today's next stop, the path starts after it.
  const stops = pathStops(roadmap, next)
    .filter((stop) => !stop.heading && (stop.state === 'locked' || (!heroHasNext && stop.state === 'current')))
    .map((stop) => (stop.state === 'current' ? { ...stop, state: 'locked' as const } : stop))
    .slice(0, 4);
  if (stops.length === 0) return null;
  return (
    <Section
      eyebrow="Up next"
      title="Your path"
      id="home-path"
      className="sj-rise d1"
      action={
        <Link className="sj-link" to="/roadmap">
          Roadmap <IconArrowRight size={14} />
        </Link>
      }
    >
      <Journey stops={stops} continues />
    </Section>
  );
}

/**
 * Home is where a student starts the day: the next step and today's progress, what comes after
 * it, and how each subject stands. Scores in depth and past runs are on Progress.
 */
function HomeBody({
  data,
  focus,
  step,
  roadmap,
}: {
  data: Overview;
  focus: SubjectOverview | undefined;
  step: NextStep;
  roadmap: Roadmap | null;
}) {
  const subjects = data.subjects;
  // The subject "Where you stand" shows: ?subject=, else the last one chosen, else the most urgent.
  const [chosenId, choose] = useSubjectChoice(subjects);
  const chosen = subjects.find((s) => s.subject_id === chosenId) ?? focus;
  return (
    <div className="sj-page home">
      <Hero overview={data} step={step} focus={focus} />

      {roadmap && roadmap.subjects.length > 0 ? (
        <UpNext roadmap={roadmap} heroHasNext={step.kind === 'today'} />
      ) : subjects.length > 1 ? (
        <SubjectsGlance subjects={subjects} selected={chosen?.subject_id ?? null} />
      ) : null}

      {chosen ? (
        <Section
          eyebrow={`Your score · ${chosen.examination_short_name} ${chosen.subject_name}`}
          title="Where you stand"
          id="home-stand"
          className="sj-rise d2"
          action={
            <Link className="sj-link" to={`/subjects/${chosen.subject_id}`}>
              {chosen.subject_name} plan <IconArrowRight size={14} />
            </Link>
          }
        >
          {subjects.length > 1 ? (
            <SubjectSwitcher subjects={subjects} value={chosen.subject_id} onChange={choose} label="Show subject" />
          ) : null}
          <Standing key={chosen.subject_id} subject={chosen} />
        </Section>
      ) : null}
    </div>
  );
}
