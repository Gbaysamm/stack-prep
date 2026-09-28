/**
 * /checkup/:sessionId/report — what the check-up found, and what study could make of it.
 *
 * Ordered the way a student reads it: the number first (in the page hero), then where it sits on
 * the 0–100 scale against the plan and the target, then what's behind it, then what to do. Every
 * number says what stands behind it. A subtopic the sitting never reached shows as "not checked",
 * never as a low score: silence is not evidence of weakness.
 *
 * The projection needs a goal (a target and a date). Without one the report still shows the
 * topics, and asks for the goal instead of inventing a score.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  api,
  type CheckupReport as Report,
  type PlanLine,
  type SubtopicReport,
  type TopicReport,
} from '../../student/api.js';
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconChevronRight,
  IconHelp,
  IconReplay,
  IconTarget,
} from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Card, CountUp, Eyebrow, PageHero, Skeleton, cx } from '../ui.js';
import './CheckupReport.css';

/* ------------------------------------------------------------------ mastery bands */

type Band = 'strong' | 'holding' | 'shaky' | 'teach' | 'none';

/** The same thresholds the first report used (student/Result.tsx). */
function bandOf(mastery: number | null): Band {
  if (mastery === null) return 'none';
  if (mastery >= 0.75) return 'strong';
  if (mastery >= 0.5) return 'holding';
  if (mastery >= 0.3) return 'shaky';
  return 'teach';
}

const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong',
  holding: 'Holding',
  shaky: 'Shaky',
  teach: 'Needs teaching',
  none: 'Not checked',
};

const BAND_GLOSS: Record<Band, string> = {
  strong: '75% and up',
  holding: '50–74%',
  shaky: '30–49%',
  teach: 'under 30%',
  none: 'no questions reached it',
};

const pct = (value: number) => `${Math.round(value * 100)}%`;
const fmt = (value: number) => String(Math.round(value));
const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

/** Weakest first; the unmeasured go last, since nothing is known about them. */
const byWeakness = <T extends { mastery: number | null }>(a: T, b: T) =>
  (a.mastery ?? 2) - (b.mastery ?? 2);

/** A notice: icon and title on one line, the words and any button beneath, all from the left. */
function Notice({
  tone,
  icon,
  title,
  children,
  action,
  role = 'note',
  className,
}: {
  tone: 'warn' | 'short' | 'ok' | 'plain';
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: string;
  className?: string;
}) {
  return (
    <div className={cx('cp-notice', tone, className)} role={role}>
      <div className="cp-notice-head">
        <span className="cp-ico" aria-hidden="true">
          {icon}
        </span>
        <strong>{title}</strong>
      </div>
      {children ? <p>{children}</p> : null}
      {action ? <div className="cp-notice-actions">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

/** The server's sentences carry decimals (59.3, 75.0); a student reads whole marks. */
const wholeNumbers = (text: string) => text.replace(/\b\d+\.\d+\b/g, (n) => String(Math.round(Number(n))));

export function CheckupReport() {
  const { sessionId = '' } = useParams();
  const student = useStudent();
  const navigate = useNavigate();

  const report = useLoad(() => api.report(sessionId), [sessionId]);
  const overview = useLoad(() => progressApi.overview(student.studentId), [student.studentId]);

  const subject = report.data
    ? overview.data?.subjects.find((s) => s.subject_id === report.data?.subject_id)
    : undefined;
  const subjectName = subject?.subject_name ?? '';
  usePageTitle(subjectName ? `${subjectName} report` : 'Check-up report');

  const [starting, setStarting] = useState(false);
  // A link to a part of the report (#topics, #plan) lands on it once the report is in.
  const ready = Boolean(report.data);
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    const id = window.setTimeout(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [ready]);
  const [startIssue, setStartIssue] = useState<string | null>(null);

  const practise = async () => {
    if (!report.data || starting) return;
    setStarting(true);
    setStartIssue(null);
    try {
      const state = await api.startPractice(student.studentId, report.data.subject_id);
      navigate(`/practice/${state.session_id}`);
    } catch (error) {
      setStartIssue((error as Error).message || 'Practice could not start.');
      setStarting(false);
    }
  };

  if (report.error && !report.data) {
    return (
      <div className="sj-page cp-page">
        <PageHero back={{ to: '/checkup', label: 'All check-ups' }} eyebrow="Check-up report" title="Your report" />
        <Notice
          tone="plain"
          role="alert"
          icon={<IconReplay size={18} />}
          title="Your report didn’t load"
          action={
            <Button tone="soft" onClick={report.reload}>
              Try again
            </Button>
          }
        >
          {report.error}
        </Notice>
      </div>
    );
  }

  if (!report.data) return <ReportSkeleton />;

  const data = report.data;
  const projection = data.projection;
  const finishedAt =
    subject?.latest_checkup?.session_id === data.session_id ? subject.latest_checkup.finished_at : null;
  const dateText = finishedAt
    ? new Date(finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : null;
  const goalPath = `/subjects/${data.subject_id}/goal`;
  const firstUp = projection?.plan.find((line) => line.sessions > 0) ?? null;
  const exam = subject?.examination_short_name;
  const right = data.topics.reduce((sum, t) => sum + t.correct, 0);

  return (
    <div className="sj-page cp-page">
      <PageHero
        back={{ to: '/checkup', label: 'All check-ups' }}
        eyebrow={`Check-up report${exam || subjectName ? ` · ${[exam, subjectName].filter(Boolean).join(' ')}` : ''}`}
        title="Here’s where you stand"
        sub={`From ${data.answered} answer${data.answered === 1 ? '' : 's'}${dateText ? ` on ${dateText}` : ''}: your predicted score, what’s holding it down, and where your study time pays off most.`}
        actions={
          <>
            <Button
              tone="lime"
              onClick={() => void practise()}
              busy={starting}
              icon={starting ? undefined : <IconBolt size={18} />}
            >
              {starting ? 'Starting…' : 'Practise weakest topic'}
            </Button>
          </>
        }
        aside={
          projection ? (
            <div className="cp-stat">
              <span className="cp-stat-label">Predicted score today</span>
              <span className="cp-stat-num">
                <span className="sj-num">
                  <CountUp value={projection.score_now} duration={1100} />
                </span>
                <span className="unit sj-mono">/100</span>
              </span>
              <span className="cp-stat-note">What you’d likely get if you sat the exam today.</span>
              <span className="cp-stat-chips">
                <span>
                  <IconCheck size={14} />
                  {data.answered} answers
                </span>
                <span>
                  Likely {fmt(projection.score_low)}–{fmt(projection.score_high)}
                </span>
              </span>
            </div>
          ) : (
            <div className="cp-stat">
              <span className="cp-stat-label">You answered</span>
              <span className="cp-stat-num">
                <span className="sj-num">
                  <CountUp value={right} />
                </span>
                <span className="unit sj-mono">of {data.answered} right</span>
              </span>
              <span className="cp-stat-note">A goal turns this into a predicted score.</span>
            </div>
          )
        }
      />

      {startIssue ? (
        <p className="cp-issue" role="alert">
          {startIssue}
        </p>
      ) : null}

      {!data.finished ? (
        <Notice
          tone="warn"
          role="status"
          className="sj-rise"
          icon={<IconHelp size={18} />}
          title="This check-up isn’t finished"
          action={
            <Button size="sm" to={`/checkup/${data.session_id}`}>
              Resume
            </Button>
          }
        >
          What’s below comes from the {data.answered} answers so far. Finish it for a firmer picture.
        </Notice>
      ) : null}

      {projection ? <ScoreSection report={data} goalPath={goalPath} subject={subject} /> : <NoGoal report={data} goalPath={goalPath} />}

      <HowWorkedOut report={data} />

      {data.unassessed_topics.length > 0 ? (
        <Notice tone="warn" icon={<IconHelp size={18} />} title={`Not reached: ${data.unassessed_topics.join(', ')}`}>
          No questions touched these, so nothing on this page is a judgement about them.
        </Notice>
      ) : null}

      <Topics report={data} />

      {projection ? <Plan lines={projection.plan} sessionsAvailable={projection.sessions_available} /> : null}

      <section className="cp-cta sj-rise" aria-labelledby="cp-cta-title">
        <Eyebrow>What next</Eyebrow>
        <h2 id="cp-cta-title" className="sj-display sj-h2">
          Start with your weakest topic
        </h2>
        <p>
          {firstUp
            ? `Your plan starts with ${firstUp.name} (${firstUp.topic_name}). Get a hint or a worked lesson whenever you’re stuck.`
            : 'Practice picks up where you’re weakest. Get a hint or a worked lesson whenever you’re stuck.'}
        </p>
        {startIssue ? (
          <p className="cp-issue dark">
            {startIssue}
          </p>
        ) : null}
        <div className="cp-cta-actions">
          <Button
            tone="lime"
            size="lg"
            onClick={() => void practise()}
            busy={starting}
            trailing={starting ? undefined : <IconArrowRight size={18} />}
          >
            {starting ? 'Starting…' : 'Start practising'}
          </Button>
          <Button tone="ghost" size="lg" to={`/subjects/${data.subject_id}`}>
            Back to subject
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ the scale: today, plan, target */

function ScoreSection({
  report,
  goalPath,
  subject,
}: {
  report: Report;
  goalPath: string;
  subject: { goal: { minutes_per_day: number | null; days_to_exam: number | null } | null } | undefined;
}) {
  const p = report.projection!;
  const low = clamp100(p.score_low);
  const high = clamp100(p.score_high);
  const now = clamp100(p.score_now);
  const projected = clamp100(p.score_projected);
  const target = p.target_score !== null ? clamp100(p.target_score) : null;
  const bandMid = (low + high) / 2;
  // The range label stays inside the scale at either end.
  const labelAlign = bandMid < 22 ? 'start' : bandMid > 78 ? 'end' : 'mid';
  const gain = p.score_projected - p.score_now;

  return (
    <section className="cp-section first" aria-labelledby="cp-scale-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>On the 0–100 scale</Eyebrow>
          <h2 id="cp-scale-title" className="sj-display sj-h2">
            Today, after your plan, and your target
          </h2>
        </div>
      </div>

      <div className="cp-scalecard sj-rise d1">
        <div
          className="cp-scale"
          role="img"
          aria-label={`Today ${fmt(p.score_now)}, likely between ${fmt(p.score_low)} and ${fmt(p.score_high)}${
            target !== null ? `, target ${fmt(p.target_score!)}` : ''
          }, ${fmt(p.score_projected)} after your plan.`}
        >
          <div className="cp-scale-flags">
            {target !== null ? (
              <span className="cp-flag" style={{ left: `${target}%` }}>
                <span className="tab sj-mono">Target {fmt(p.target_score!)}</span>
              </span>
            ) : null}
          </div>
          <div className="cp-scale-track">
            <span className="band" style={{ left: `${low}%`, width: `${high - low}%` }} />
            {projected > now ? <span className="gain" style={{ left: `${now}%`, width: `${projected - now}%` }} /> : null}
            <span className="dot projected" style={{ left: `${projected}%` }} />
            <span className="dot now" style={{ left: `${now}%` }} />
            {target !== null ? <span className="pole" style={{ left: `${target}%` }} /> : null}
          </div>
          <div className="cp-scale-bracket">
            <span className={cx('bracket', labelAlign)} style={{ left: `${low}%`, width: `${high - low}%` }}>
              <span className="label sj-mono">
                today {fmt(p.score_now)} · likely {fmt(p.score_low)}–{fmt(p.score_high)}
              </span>
            </span>
          </div>
          <div className="cp-scale-ticks sj-mono" aria-hidden="true">
            {[0, 25, 50, 75, 100].map((tick) => (
              <span key={tick} style={{ left: `${tick}%` }}>
                {tick}
              </span>
            ))}
          </div>
        </div>

        <div className="cp-stats three">
          <div className="cp-statcell">
            <span className="cp-statcell-head">
              <span className="key projected" aria-hidden="true" />
              <span className="sj-eyebrow">After your plan</span>
            </span>
            <span className="sj-num green">
              <CountUp value={p.score_projected} />
            </span>
            <span className="cp-statcell-foot">
              {gain > 0 ? `+${fmt(gain)} on today, if you follow the plan to exam day.` : 'Where the plan takes you by exam day.'}
            </span>
          </div>
          <div className="cp-statcell">
            <span className="cp-statcell-head">
              <span className="key target" aria-hidden="true" />
              <span className="sj-eyebrow">Your target</span>
              <Link to={goalPath} className="cp-change">
                Change
              </Link>
            </span>
            <span className="sj-num">{p.target_score !== null ? <CountUp value={p.target_score} /> : '—'}</span>
            <span className="cp-statcell-foot">
              {p.target_score !== null ? 'The score you told us you’re aiming for.' : 'No target yet. Set one to measure the plan against.'}
            </span>
          </div>
          <div className="cp-statcell">
            <span className="cp-statcell-head">
              <span className="key sessions" aria-hidden="true" />
              <span className="sj-eyebrow">Sessions left</span>
            </span>
            <span className="sj-num">
              <CountUp value={p.sessions_available} />
            </span>
            <span className="cp-statcell-foot">
              {subject?.goal?.minutes_per_day && subject.goal.days_to_exam !== null
                ? `${subject.goal.minutes_per_day}-minute study sessions in the ${subject.goal.days_to_exam} days to go.`
                : 'Study sessions on your study days before the exam.'}
            </span>
          </div>
        </div>
      </div>

      <Verdict report={report} goalPath={goalPath} />
    </section>
  );
}

function NoGoal({ report, goalPath }: { report: Report; goalPath: string }) {
  const measured = report.topics.filter((t) => t.answered > 0);
  const right = report.topics.reduce((sum, t) => sum + t.correct, 0);
  return (
    <section className="cp-section first" aria-labelledby="cp-nogoal-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>Predicted score</Eyebrow>
          <h2 id="cp-nogoal-title" className="sj-display sj-h2">
            Set a goal to see your predicted score
          </h2>
        </div>
      </div>
      <div className="cp-scalecard cp-nogoal sj-rise d1">
        <p className="cp-nogoal-text">
          Your score is worked out against a target and an exam date. Add them and this report fills in, with a plan of
          where your time goes.
        </p>
        <div className="cp-stats three">
          <div className="cp-statcell">
            <span className="sj-eyebrow">Answered</span>
            <span className="sj-num">{report.answered}</span>
            <span className="cp-statcell-foot">questions in this check-up</span>
          </div>
          <div className="cp-statcell">
            <span className="sj-eyebrow">Right</span>
            <span className="sj-num green">{right}</span>
            <span className="cp-statcell-foot">answered correctly</span>
          </div>
          <div className="cp-statcell">
            <span className="sj-eyebrow">Topics checked</span>
            <span className="sj-num">{measured.length}</span>
            <span className="cp-statcell-foot">reached by at least one question</span>
          </div>
        </div>
        <div className="cp-nogoal-actions">
          <Button to={goalPath} trailing={<IconArrowRight size={18} />}>
            Set my goal
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ verdict */

function Verdict({ report, goalPath }: { report: Report; goalPath: string }) {
  const p = report.projection!;
  if (p.target_score === null) return null;
  const short = p.target_score - p.score_projected;
  if (p.shortfall_note || short > 0) {
    return (
      <Notice
        tone="short"
        className="sj-rise d2"
        icon={<IconTarget size={18} />}
        title={
          <>
            This plan reaches {fmt(p.score_projected)}
            {short > 0 ? `, ${fmt(short)} short of your ${fmt(p.target_score)}` : ''}
          </>
        }
        action={
          <Button size="sm" tone="ghost" to={goalPath}>
            Adjust my goal
          </Button>
        }
      >
        {p.shortfall_note ? wholeNumbers(p.shortfall_note) : undefined}
      </Notice>
    );
  }
  return (
    <Notice tone="ok" className="sj-rise d2" icon={<IconCheck size={18} />} title="You’re on track">
      On the time you gave us, this plan reaches {fmt(p.score_projected)}, past your target of {fmt(p.target_score)}.
    </Notice>
  );
}

/* ------------------------------------------------------------------ how it is worked out */

function HowWorkedOut({ report }: { report: Report }) {
  const p = report.projection;
  return (
    <details className="cp-how sj-rise d3">
      <summary>
        <span className="cp-ico" aria-hidden="true">
          <IconHelp size={18} />
        </span>
        <strong className="cp-how-title">How your score is worked out</strong>
        <IconChevronRight size={20} className="cp-how-chev" />
      </summary>
      <div className="cp-how-body">
        <p className="cp-how-lede">What the number means, and how sure it is.</p>
        <ol className="cp-how-steps">
          <li>
            <span className="cp-how-head">
              <span className="n sj-mono">1</span>
              <b>Each part of the syllabus is worth what the exam gives it.</b>
            </span>
            <p>Weights used: {report.weights_source}.</p>
          </li>
          <li>
            <span className="cp-how-head">
              <span className="n sj-mono">2</span>
              <b>Your score is how much of each part you have.</b>
            </span>
            <p>Worked out from your answers, question by question. Nothing is curved.</p>
          </li>
          <li>
            <span className="cp-how-head">
              <span className="n sj-mono">3</span>
              <b>The range shows how sure it is.</b>
            </span>
            <p>
              {p
                ? `${pct(p.unmeasured_share)} of the paper wasn’t reached, so it sits at your average for its topic. More answers narrow the range.`
                : 'More answers narrow the range.'}
            </p>
          </li>
        </ol>
        <div className="cp-how-fine">
          <p>{report.caveat}</p>
          {p ? <p>{p.caveat}</p> : null}
        </div>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ topics */

function Topics({ report }: { report: Report }) {
  const [weakestFirst, setWeakestFirst] = useState(false);
  const groups = useMemo(() => {
    const subs = new Map<string, SubtopicReport[]>();
    for (const s of report.subtopics) subs.set(s.topic_name, [...(subs.get(s.topic_name) ?? []), s]);
    const topics = report.topics.map((topic) => ({
      topic,
      subtopics: subs.get(topic.name) ?? [],
      share: (subs.get(topic.name) ?? []).reduce((sum, s) => sum + s.share, 0),
    }));
    if (!weakestFirst) return topics;
    return [...topics]
      .sort((a, b) => byWeakness(a.topic, b.topic))
      .map((g) => ({ ...g, subtopics: [...g.subtopics].sort(byWeakness) }));
  }, [report, weakestFirst]);

  return (
    <section className="cp-section" id="topics" aria-labelledby="cp-topics-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>Topic by topic</Eyebrow>
          <h2 id="cp-topics-title" className="sj-display sj-h2">
            What you’ve got, and what’s shaky
          </h2>
          <p>How much of each part you have, from what you answered. Grey isn’t a low score — we just didn’t get there.</p>
        </div>
        <div className="cp-seg" role="group" aria-label="Order topics">
          <button type="button" aria-pressed={!weakestFirst} onClick={() => setWeakestFirst(false)}>
            Syllabus order
          </button>
          <button type="button" aria-pressed={weakestFirst} onClick={() => setWeakestFirst(true)}>
            Weakest first
          </button>
        </div>
      </div>

      <ul className="cp-bandkey" aria-label="What the colours mean">
        {(['strong', 'holding', 'shaky', 'teach', 'none'] as Band[]).map((band) => (
          <li key={band}>
            <span className={cx('swatch', band)} />
            <b>{BAND_LABEL[band]}</b>
            <span>{BAND_GLOSS[band]}</span>
          </li>
        ))}
      </ul>

      <div className="cp-topics">
        {groups.map(({ topic, subtopics, share }, index) => (
          <TopicCard key={topic.topic_id} topic={topic} subtopics={subtopics} share={share} index={index} />
        ))}
      </div>
    </section>
  );
}

function TopicCard({
  topic,
  subtopics,
  share,
  index,
}: {
  topic: TopicReport;
  subtopics: SubtopicReport[];
  share: number;
  index: number;
}) {
  const band = bandOf(topic.mastery);
  return (
    <article className="sj-card cp-topic" style={{ animationDelay: `${index * 50}ms` } as CSSProperties}>
      <header className="cp-topic-head">
        <div className="cp-topic-name">
          <h3 className="sj-display sj-h3">{topic.name}</h3>
          <span className="meta">
            {topic.answered > 0 ? `${topic.correct} of ${topic.answered} right` : 'Not reached'}
            {share > 0 ? ` · ${pct(share)} of the paper` : ''}
          </span>
        </div>
        <span className={cx('cp-pill', band)}>{BAND_LABEL[band]}</span>
      </header>
      <div className="cp-topic-meter">
        <span className="cp-topic-pct sj-num">{topic.mastery !== null ? pct(topic.mastery) : '—'}</span>
        <Bar value={topic.mastery} band={band} thick />
      </div>
      {subtopics.length > 0 ? (
        <ul className="cp-subs">
          {subtopics.map((s) => {
            const b = bandOf(s.mastery);
            return (
              <li key={s.subtopic_id} className={cx('cp-sub', b)}>
                <div className="cp-sub-row">
                  <span className="name">{s.name}</span>
                  <span className="val sj-mono">{s.mastery !== null ? pct(s.mastery) : '—'}</span>
                </div>
                <Bar value={s.mastery} band={b} />
                <span className="cp-sub-meta">
                  <span className={cx('tag', b)}>{BAND_LABEL[b]}</span>
                  {s.answered > 0 ? `${s.correct} of ${s.answered} right` : 'no questions reached it'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

function Bar({ value, band, thick }: { value: number | null; band: Band; thick?: boolean }) {
  return (
    <div
      className={cx('cp-bar', band, thick && 'thick')}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value !== null ? Math.round(value * 100) : undefined}
      aria-valuetext={value !== null ? `${pct(value)}, ${BAND_LABEL[band].toLowerCase()}` : 'not checked'}
    >
      <span style={{ width: value !== null ? pct(value) : '100%' }} />
    </div>
  );
}

/* ------------------------------------------------------------------ plan */

const TOPIC_SHADES = ['var(--purple-600)', 'var(--ink-900)', 'var(--purple-300)', 'var(--pink-500)', 'var(--green-400)', 'var(--yellow-400)', 'var(--purple-200)', 'var(--gray-500)'];

function Plan({ lines, sessionsAvailable }: { lines: PlanLine[]; sessionsAvailable: number }) {
  const worked = lines.filter((line) => line.sessions > 0);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? worked : worked.slice(0, 6);
  const planned = worked.reduce((sum, line) => sum + line.sessions, 0);
  const gained = worked.reduce((sum, line) => sum + line.marks_gained, 0);

  const byTopic: { topic: string; sessions: number }[] = [];
  for (const line of worked) {
    const found = byTopic.find((t) => t.topic === line.topic_name);
    if (found) found.sessions += line.sessions;
    else byTopic.push({ topic: line.topic_name, sessions: line.sessions });
  }
  byTopic.sort((a, b) => b.sessions - a.sessions);
  const shade = (topic: string) => TOPIC_SHADES[byTopic.findIndex((t) => t.topic === topic) % TOPIC_SHADES.length];

  return (
    <section className="cp-section" id="plan" aria-labelledby="cp-plan-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>Your plan</Eyebrow>
          <h2 id="cp-plan-title" className="sj-display sj-h2">
            Where your time goes
          </h2>
          <p>
            Ordered by the marks each part is likely to add — not just by how weak it is. An hour on a big part of
            the paper pays back more than an hour on a small one.
          </p>
        </div>
      </div>

      {worked.length === 0 ? (
        <Card className="cp-plan-empty">
          <p>
            There’s no study time left before your exam date, so there’s nothing to plan. Moving the date gives the
            plan something to work with.
          </p>
        </Card>
      ) : (
        <div className="sj-card cp-plan">
          <div className="cp-split">
            <div className="cp-split-head">
              <div className="cp-split-stat">
                <span className="sj-num">{planned}</span>
                <span>
                  of {sessionsAvailable} sessions
                  <br />
                  planned
                </span>
              </div>
              <div className="cp-split-stat gain">
                <span className="sj-num">+{fmt(gained)}</span>
                <span>
                  marks the plan
                  <br />
                  expects to add
                </span>
              </div>
            </div>
            <div className="cp-split-bar" role="img" aria-label={`Sessions by topic: ${byTopic.map((t) => `${t.topic} ${t.sessions}`).join(', ')}`}>
              {byTopic.map((t) => (
                <span
                  key={t.topic}
                  style={{ flexGrow: t.sessions, background: shade(t.topic) } as CSSProperties}
                  title={`${t.topic}: ${t.sessions} sessions`}
                />
              ))}
            </div>
            <ul className="cp-split-key">
              {byTopic.map((t) => (
                <li key={t.topic}>
                  <span className="sw" style={{ background: shade(t.topic) }} />
                  {t.topic}
                  <b className="sj-mono">{t.sessions}</b>
                </li>
              ))}
            </ul>
          </div>

          <div className="cp-lines-head" aria-hidden="true">
            <span>What to study</span>
            <span>Now → after plan</span>
            <span>Sessions</span>
            <span>Adds</span>
          </div>
          <ol className="cp-lines">
            {shown.map((line, index) => (
              <li key={line.subtopic_id} className="cp-line">
                <span className="rank sj-mono">{String(index + 1).padStart(2, '0')}</span>
                <div className="what">
                  <b>{line.name}</b>
                  <span className="topic">
                    <span className="sw" style={{ background: shade(line.topic_name) }} />
                    {line.topic_name}
                  </span>
                  <span className="why">{line.reason.charAt(0).toUpperCase() + line.reason.slice(1)}.</span>
                </div>
                <div className="move">
                  <div className="cp-move-bar" aria-hidden="true">
                    <span className="to" style={{ width: pct(line.mastery_projected) }} />
                    <span className="from" style={{ width: pct(line.mastery_now) }} />
                  </div>
                  <span className="cp-move-text sj-mono">
                    {pct(line.mastery_now)} <IconArrowRight size={12} /> <b>{pct(line.mastery_projected)}</b>
                  </span>
                </div>
                <span className="sessions">
                  <b className="sj-mono">{line.sessions}</b>
                  <span>{line.sessions === 1 ? 'session' : 'sessions'}</span>
                </span>
                <span className="adds sj-mono">
                  +{line.marks_gained.toFixed(1)}
                  <span className="unit">&nbsp;marks</span>
                </span>
              </li>
            ))}
          </ol>
          {worked.length > 6 ? (
            <div className="cp-more">
              <Button tone="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'Show the top 6' : `Show all ${worked.length}`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ loading */

function ReportSkeleton() {
  return (
    <div className="sj-page cp-page" aria-busy="true" aria-label="Loading your report">
      <div className="cp-skelhero">
        <Skeleton width={200} height={12} />
        <Skeleton width="50%" height={40} />
        <Skeleton width="65%" height={16} />
        <Skeleton width={220} height={48} radius={12} />
      </div>
      <Skeleton width={140} height={12} />
      <div style={{ height: 8 }} />
      <Skeleton width="40%" height={28} />
      <div style={{ height: 14 }} />
      <Skeleton height={260} radius={14} />
      <div className="cp-topics" style={{ marginTop: 28 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={280} radius={14} />
        ))}
      </div>
    </div>
  );
}
