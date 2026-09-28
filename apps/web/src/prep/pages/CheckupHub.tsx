/**
 * /checkup: one wide card per subject — where the last check-up put you on the 0–100 scale, and
 * the button to start, resume or look back — then how a check-up works.
 *
 * A subject needs a goal before it can be checked, because the score is a projection against
 * the exam date and target; without one the card sends the student to set it first.
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type Goal } from '../../student/api.js';
import { IconArrowRight, IconBook, IconClock, IconHelp, IconReplay, IconTarget } from '../icons.js';
import { progressApi, type SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Badge, Button, CountUp, PageHero, Skeleton, Steps, cx, daysUntil } from '../ui.js';
import './CheckupHub.css';

interface SubjectRow {
  subjectId: string;
  name: string;
  exam: string;
  goal: Goal | null;
  overview: SubjectOverview | null;
}

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

const hasGoalOf = (row: SubjectRow) =>
  row.goal !== null && row.goal.target_score !== null && row.goal.exam_date !== null;

const STEPS = [
  { title: 'Answer about 15 questions', body: 'They get harder or easier to match you. No time limit, no pass mark.' },
  { title: 'See your predicted score', body: 'What you’d likely get if you sat the exam today, with a range.' },
  { title: 'Get your plan', body: 'The topics to practise first, to lift the score fastest.' },
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
  const [starting, setStarting] = useState<string | null>(null);
  const [startIssue, setStartIssue] = useState<{ subjectId: string; text: string } | null>(null);

  const data = useLoad(
    () => Promise.all([progressApi.overview(student.studentId), api.goals(student.studentId), api.catalogue()]),
    [student.studentId],
  );

  const rows: SubjectRow[] = [];
  if (data.data) {
    const [overview, goals, catalogue] = data.data;
    const examOf = new Map<string, string>();
    for (const exam of catalogue) for (const subject of exam.subjects) examOf.set(subject.subject_id, exam.short_name);
    const seen = new Set<string>();
    for (const goal of goals) {
      seen.add(goal.subject_id);
      rows.push({
        subjectId: goal.subject_id,
        name: goal.subject_name,
        exam: examOf.get(goal.subject_id) ?? '',
        goal,
        overview: overview.subjects.find((s) => s.subject_id === goal.subject_id) ?? null,
      });
    }
    for (const subject of overview.subjects) {
      if (seen.has(subject.subject_id)) continue;
      rows.push({
        subjectId: subject.subject_id,
        name: subject.subject_name,
        exam: subject.examination_short_name,
        goal: null,
        overview: subject,
      });
    }
  }

  const start = async (subjectId: string) => {
    if (starting) return;
    setStarting(subjectId);
    setStartIssue(null);
    try {
      const state = await api.start(student.studentId, subjectId);
      navigate(`/checkup/${state.session_id}`);
    } catch (error) {
      setStartIssue({ subjectId, text: (error as Error).message || 'The check-up could not start.' });
      setStarting(null);
    }
  };

  // The hero's number: the most recent predicted score, if there is one.
  const scored = rows
    .filter((row) => row.overview?.latest_checkup?.score_now != null)
    .sort((a, b) => (b.overview!.latest_checkup!.finished_at > a.overview!.latest_checkup!.finished_at ? 1 : -1))[0];
  const last = scored?.overview?.latest_checkup ?? null;

  // The hero's button: the one thing to do next.
  const openRow = rows.find((row) => row.overview?.open_checkup_session_id);
  const readyRow = rows.find(hasGoalOf);
  let heroAction: ReactNode = null;
  if (openRow) {
    heroAction = (
      <Button tone="lime" to={`/checkup/${openRow.overview!.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
        Resume {openRow.name}
      </Button>
    );
  } else if (readyRow) {
    const again = Boolean(readyRow.overview?.latest_checkup);
    heroAction = (
      <Button
        tone="lime"
        onClick={() => void start(readyRow.subjectId)}
        busy={starting === readyRow.subjectId}
        disabled={starting !== null && starting !== readyRow.subjectId}
        trailing={starting === readyRow.subjectId ? undefined : <IconArrowRight size={18} />}
      >
        {starting === readyRow.subjectId ? 'Starting…' : `${again ? 'Check' : 'Start'} ${readyRow.name}${again ? ' again' : ''}`}
      </Button>
    );
  }

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
              <span className="ch-stat-label">Last predicted · {scored.name}</span>
              <span className="ch-stat-num">
                <span className="sj-num">
                  <CountUp value={last.score_now} />
                </span>
                <span className="unit">out of 100</span>
              </span>
              <span className="ch-stat-chips">
                {last.score_low !== null && last.score_high !== null ? (
                  <span>
                    Likely {Math.round(last.score_low)}–{Math.round(last.score_high)}
                  </span>
                ) : null}
                <span>Checked {whenLabel(last.finished_at)}</span>
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
        <div className="ch-sechead">
          <div className="sj-eyebrow">Your subjects</div>
          <h2 id="ch-subjects-title" className="sj-display sj-h2">
            Where each subject stands
          </h2>
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
          <div className="ch-list" aria-busy="true" aria-label="Loading your subjects">
            {[0, 1].map((i) => (
              <div key={i} className="sj-card ch-subj">
                <div className="ch-subj-head">
                  <Skeleton width={34} height={34} radius={10} />
                  <Skeleton width="30%" height={26} />
                </div>
                <Skeleton width="45%" height={14} />
                <Skeleton height={112} radius={10} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
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
          <div className="ch-list">
            {rows.map((row, index) => (
              <SubjectCard
                key={row.subjectId}
                row={row}
                index={index}
                busy={starting === row.subjectId}
                disabled={starting !== null && starting !== row.subjectId}
                issue={startIssue?.subjectId === row.subjectId ? startIssue.text : null}
                onStart={() => void start(row.subjectId)}
              />
            ))}
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
          </div>
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

function SubjectCard({
  row,
  index,
  busy,
  disabled,
  issue,
  onStart,
}: {
  row: SubjectRow;
  index: number;
  busy: boolean;
  disabled: boolean;
  issue: string | null;
  onStart: () => void;
}) {
  const openId = row.overview?.open_checkup_session_id ?? null;
  const latest = row.overview?.latest_checkup ?? null;
  const hasGoal = hasGoalOf(row);
  const days = daysUntil(row.goal?.exam_date ?? row.overview?.goal?.exam_date ?? null);
  const target = latest?.target_score ?? row.goal?.target_score ?? null;
  const weakest = latest?.weakest_subtopics.slice(0, 2) ?? [];

  let status: { tone: 'yellow' | 'green' | 'ghost' | 'pink'; text: string };
  if (openId) status = { tone: 'yellow', text: 'In progress' };
  else if (!hasGoal) status = { tone: 'pink', text: 'Needs a goal' };
  else if (latest) status = { tone: 'green', text: `Checked ${whenLabel(latest.finished_at)}` };
  else status = { tone: 'ghost', text: 'Not checked yet' };

  const blank = openId
    ? { tone: 'open', icon: <IconReplay size={18} />, title: 'Halfway through', text: 'You started this one. Pick up at the question you stopped on; your answers so far are saved.' }
    : hasGoal
      ? { tone: 'fresh', icon: <IconHelp size={18} />, title: 'No score yet', text: 'One check-up gives you a predicted score and a plan of what to practise first.' }
      : { tone: 'nogoal', icon: <IconTarget size={18} />, title: 'Set a goal first', text: 'A target score and an exam date give the check-up something to measure against.' };

  return (
    <article className={cx('sj-card ch-subj sj-rise', `d${Math.min(4, index + 1)}`, openId && 'is-open')}>
      <header className="ch-subj-head">
        <span className="ch-ico ink" aria-hidden="true">
          <IconTarget size={18} />
        </span>
        <h3 className="sj-display ch-subj-name">{row.name}</h3>
        <Badge tone={status.tone} dot className="ch-subj-badge">
          {status.text}
        </Badge>
      </header>

      <p className="ch-subj-meta">
        {row.exam ? <span>{row.exam}</span> : null}
        <span>
          <IconClock size={15} />
          About 15 questions
        </span>
        {days !== null && days >= 0 ? (
          <span>
            <IconTarget size={15} />
            {days === 0 ? 'Exam today' : `${days} ${days === 1 ? 'day' : 'days'} to your exam`}
          </span>
        ) : null}
      </p>

      {latest && latest.score_now !== null ? (
        <div className="ch-panel">
          <div className="ch-panel-score">
            <span className="ch-panel-label">Predicted score last time</span>
            <span className="ch-panel-num">
              <span className="sj-num">
                <CountUp value={latest.score_now} />
              </span>
              <span className="of sj-mono">/100</span>
            </span>
            <span className="ch-panel-note">What you’d likely get if you sat the exam that day.</span>
          </div>
          <Scale now={latest.score_now} low={latest.score_low} high={latest.score_high} target={target} />
        </div>
      ) : (
        <div className={cx('ch-blank', blank.tone)}>
          <div className="ch-blank-head">
            <span className="ch-ico" aria-hidden="true">
              {blank.icon}
            </span>
            <strong>{blank.title}</strong>
          </div>
          <p>{blank.text}</p>
        </div>
      )}

      {weakest.length > 0 ? (
        <p className="ch-weak">
          <span className="sj-eyebrow">Holding it down</span>
          {weakest.map((w) => (
            <span key={w.subtopic_id} className="ch-weak-item">
              {w.name}
              <b className="sj-mono">{Math.round(w.mastery * 100)}%</b>
            </span>
          ))}
        </p>
      ) : null}

      {issue ? (
        <p className="ch-issue" role="alert">
          {issue}
        </p>
      ) : null}

      <div className="ch-actions">
        {openId ? (
          <Button to={`/checkup/${openId}`} trailing={<IconArrowRight size={18} />}>
            Resume check-up
          </Button>
        ) : !hasGoal ? (
          <Button to={`/subjects/${row.subjectId}/goal`} tone="dark" trailing={<IconArrowRight size={18} />}>
            Set goal first
          </Button>
        ) : (
          <Button onClick={onStart} busy={busy} disabled={disabled} trailing={busy ? undefined : <IconArrowRight size={18} />}>
            {busy ? 'Starting…' : latest ? 'Take a new check-up' : 'Start check-up'}
          </Button>
        )}
        {latest ? (
          <Button to={`/checkup/${latest.session_id}/report`} tone="ghost">
            View last report
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** The 0–100 scale: the likely range as a band, the estimate as a dot, the target as a flag. */
function Scale({ now, low, high, target }: { now: number; low: number | null; high: number | null; target: number | null }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const at = (v: number) => ({ '--at': `${clamp(v)}%` }) as CSSProperties;
  return (
    <div
      className="ch-scale"
      role="img"
      aria-label={`Predicted ${Math.round(now)} out of 100${
        low !== null && high !== null ? `, likely between ${Math.round(low)} and ${Math.round(high)}` : ''
      }${target !== null ? `, target ${Math.round(target)}` : ''}.`}
    >
      <div className="ch-scale-flags">
        {target !== null ? (
          <span className="ch-flag" style={at(target)}>
            Target {Math.round(target)}
          </span>
        ) : null}
      </div>
      <div className="ch-scale-track">
        {low !== null && high !== null ? (
          <span className="band" style={{ left: `${clamp(low)}%`, width: `${clamp(high) - clamp(low)}%` }} />
        ) : null}
        {target !== null ? <span className="pole" style={at(target)} /> : null}
        <span className="dot" style={at(now)} />
      </div>
      <div className="ch-scale-ticks sj-mono" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((tick) => (
          <span key={tick} style={at(tick)}>
            {tick}
          </span>
        ))}
      </div>
      {low !== null && high !== null ? (
        <span className="ch-scale-range sj-mono">
          Likely {Math.round(low)}–{Math.round(high)}
        </span>
      ) : null}
    </div>
  );
}
