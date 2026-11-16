/**
 * The insight sections of a mock report: the summary hero (with each subject), next steps, the
 * topics that went wrong, where the time went, the trend across mocks and the topic breakdown.
 * Drawn with plain CSS and SVG. Every section has a state for "nothing to show" that reads as a
 * sentence, never as an empty box or a bar of zero.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { IconArrowLeft, IconArrowRight, IconBulb, IconCheck, IconClock } from '../icons.js';
import {
  JAMB_SECONDS_PER_QUESTION,
  PACE_WORD,
  change,
  durationText,
  paceOf,
  type Located,
  type TimeStats,
  type TrendPoint,
  type WeakTopic,
} from '../mock/insights.js';
import { clock, type MockReport as Report, type MockSummary, type SubjectResult, type Tally } from '../mockApi.js';
import { useResultSettings } from '../scoreDisplay.js';
import { useStudent } from '../store.js';
import { cx } from '../ui.js';
import { dateLabel } from './MockHub.js';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** A thin right / wrong / skipped bar, each part as a share of the questions. */
export function SplitBar({ tally, className }: { tally: Tally; className?: string }) {
  const part = (n: number) => `${tally.questions ? (100 * n) / tally.questions : 0}%`;
  return (
    <span
      className={cx('mi-split', className)}
      role="img"
      aria-label={`${tally.correct} right, ${tally.wrong} wrong, ${tally.unanswered} skipped`}
    >
      <span className="r" style={{ width: part(tally.correct) }} />
      <span className="w" style={{ width: part(tally.wrong) }} />
    </span>
  );
}

function Delta({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'same';
  return (
    <span className={cx('mi-delta', tone)}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '='} {value === 0 ? 'same' : Math.abs(value)}
      {value === 0 ? '' : suffix}
    </span>
  );
}

/* ================================================================== the hero */

/** The whole result at a glance: the score, the counts, the time, and each subject beside it. */
export function SummaryHero({
  report,
  previous,
  time,
}: {
  report: Report;
  previous: MockSummary | null;
  time: TimeStats;
}) {
  const o = report.overall;
  const none = o.answered === 0;
  const total = report.duration_minutes * 60;
  const used = Math.min(report.time_used_seconds, total);
  const student = useStudent();
  const { display, target } = useResultSettings(student.studentId);
  const asAggregate = display === 'aggregate' && o.aggregate != null;
  const moved = asAggregate
    ? previous?.overall?.aggregate != null
      ? (o.aggregate ?? 0) - previous.overall.aggregate
      : null
    : change(o, previous?.overall);
  const many = report.subjects.length > 1;
  return (
    <section
      className={cx(
        'sj-hero sj-rise mi-hero',
        none && 'none',
        many && 'many',
        report.subjects.length >= 3 && 'crowded',
        report.subjects.length >= 4 && 'four',
      )}
    >
      <div className="mi-hero-main">
        <Link className="sj-hero-back" to="/mock">
          <IconArrowLeft size={16} />
          Mock exams
        </Link>
        <div className="sj-hero-eyebrow">
          {report.preset === 'utme' ? 'Scheduled mock' : 'Custom mock'} · {dateLabel(report.started_at)}
        </div>
        {none ? (
          <div className="mi-hero-none">
            <h1 className="sj-display mi-hero-none-title">No answers this time</h1>
            <p className="mi-hero-none-sub">
              {report.auto_submitted
                ? 'Time ran out before an answer was saved, so this mock scores 0. Sit another when you are ready.'
                : 'It was handed in before any question was answered, so this mock scores 0.'}
            </p>
          </div>
        ) : (
          <div className="mi-hero-score">
            <h1 className="sr-only">
              Your result: {asAggregate ? `${o.aggregate} out of 400, ${o.percent}%` : `${o.percent}%`}
            </h1>
            <span className="sj-num mi-hero-pct" aria-hidden="true">
              {asAggregate ? o.aggregate : o.percent}
              <small>{asAggregate ? '/400' : '%'}</small>
            </span>
            <span className="mi-hero-scorecap">
              <span>
                {asAggregate ? (
                  <>
                    UTME aggregate · <b>{o.percent}%</b> of questions right
                  </>
                ) : (
                  'Overall score'
                )}
              </span>
              {asAggregate && target !== null ? (
                <span className="mi-hero-target">
                  Your target {target}/400 ·{' '}
                  {(o.aggregate ?? 0) >= target ? 'reached' : `${target - (o.aggregate ?? 0)} to go`}
                </span>
              ) : null}
              {moved !== null ? (
                <span className="mi-hero-move">
                  <Delta value={moved} suffix=" pts" /> on your last mock
                </span>
              ) : null}
            </span>
          </div>
        )}
        <p className="mi-hero-facts">
          {none ? (
            <span>{o.questions} questions</span>
          ) : (
            <>
              <span className="r">
                <b>{o.correct}</b> right
              </span>
              <span className="w">
                <b>{o.wrong}</b> wrong
              </span>
              {o.unanswered ? (
                <span className="s">
                  <b>{o.unanswered}</b> skipped
                </span>
              ) : null}
            </>
          )}
          <span className="t">
            {report.auto_submitted ? 'Time ran out at ' : 'Handed in at '}
            <b>{clock(used)}</b> of {clock(total)}
          </span>
        </p>
      </div>

      <ul className="mi-hero-subjects" aria-label="Score by subject">
        {report.subjects.map((subject, index) => {
          const t = subject.tally;
          const spent = time.recorded ? time.subjects[index]?.ms : undefined;
          return (
            <li key={subject.subject_id}>
              <span className="name">{subject.name}</span>
              {t.answered === 0 ? (
                <span className="sub">{t.questions} questions, none answered</span>
              ) : (
                <>
                  <span className="pct sj-num">{t.percent}%</span>
                  <SplitBar tally={t} className="on-dark" />
                  <span className="sub">
                    <b className="r">{t.correct}</b> right · <b className="w">{t.wrong}</b> wrong
                    {t.unanswered ? (
                      <>
                        {' '}
                        · <b>{t.unanswered}</b> skipped
                      </>
                    ) : null}
                    {spent ? <> · {durationText(spent)}</> : null}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ================================================================== section frame */

export function Section({
  id,
  title,
  note,
  children,
  className,
}: {
  id?: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('mi-section', className)} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mi-section-head">
        <h2 className="sj-display mi-section-title" id={id ? `${id}-h` : undefined}>
          {title}
        </h2>
        {note ? <p className="mi-section-note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/* ================================================================== next steps */

export function NextSteps({ steps }: { steps: string[] }) {
  return (
    <div className="sj-card mi-steps">
      <h2 className="mi-steps-title">
        <span className="mi-steps-icon" aria-hidden="true">
          <IconBulb size={18} />
        </span>
        What to do next
      </h2>
      <ol className="mi-steps-list">
        {steps.map((step, index) => (
          <li key={index}>
            <span className="n sj-mono">{index + 1}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ================================================================== weak areas */

/** One dot per question in the topic, in the outcome's colour. */
function Dots({ right, wrong, skipped }: { right: number; wrong: number; skipped: number }) {
  const cap = 12;
  const dots = [
    ...Array<string>(wrong).fill('w'),
    ...Array<string>(right).fill('r'),
    ...Array<string>(skipped).fill('s'),
  ];
  return (
    <span className="mi-dots" aria-hidden="true">
      {dots.slice(0, cap).map((kind, index) => (
        <i key={index} className={kind} />
      ))}
      {dots.length > cap ? <em>+{dots.length - cap}</em> : null}
    </span>
  );
}

export function WeakAreas({ weak, many }: { weak: WeakTopic[]; many: boolean }) {
  return (
    <ul className="mi-weak">
      {weak.map(({ topic, subject, answered }) => (
        <li key={`${subject.subject_id}-${topic.subtopic_id}`} className="sj-card mi-weak-item">
          <div className="mi-weak-top">
            <span className="mi-weak-name">
              <strong>{topic.name}</strong>
              <small>{many ? `${subject.name}${topic.topic_name ? ` · ${topic.topic_name}` : ''}` : topic.topic_name}</small>
            </span>
            <span className="mi-weak-count">
              <b className="sj-num">{topic.wrong}</b>
              <small>of {answered} wrong</small>
            </span>
          </div>
          <div className="mi-weak-bottom">
            <Dots right={topic.correct} wrong={topic.wrong} skipped={topic.unanswered} />
            <Link
              className="mi-go"
              to={`/practice/new?subject=${subject.subject_id}&subtopic=${topic.subtopic_id}`}
              aria-label={`Practise ${topic.name}`}
            >
              Practise this topic <IconArrowRight size={14} />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ================================================================== time */

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: string }) {
  return (
    <li className={cx('mi-tile', tone)}>
      <small>{label}</small>
      <b className="sj-num">{value}</b>
      {sub ? <span>{sub}</span> : null}
    </li>
  );
}

/** Average time on right, wrong and skipped questions, against JAMB's 40 seconds. */
function OutcomeTimes({ time }: { time: TimeStats }) {
  const rows = [
    { key: 'r', label: 'Right answers', ms: time.rightAvgMs },
    { key: 'w', label: 'Wrong answers', ms: time.wrongAvgMs },
    { key: 's', label: 'Opened, not answered', ms: time.skippedAvgMs },
  ].filter((row): row is { key: string; label: string; ms: number } => row.ms !== null);
  const max = Math.max(JAMB_SECONDS_PER_QUESTION * 1000 * 1.5, ...rows.map((row) => row.ms));
  const jamb = (100 * JAMB_SECONDS_PER_QUESTION * 1000) / max;
  return (
    <div className="mi-panel">
      <h3 className="mi-panel-title">Average time, by how it went</h3>
      <ul className="mi-hbars" style={{ '--jamb': `${jamb}%` } as CSSProperties}>
        {rows.map((row) => (
          <li key={row.key}>
            <span className="lbl">{row.label}</span>
            <span className="track">
              <span className={cx('fill', row.key)} style={{ width: `${(100 * row.ms) / max}%` }} />
              <span className="jamb" aria-hidden="true" />
            </span>
            <b className="val sj-num">{durationText(row.ms)}</b>
          </li>
        ))}
      </ul>
      <p className="mi-legend">
        <span className="jamb-key" aria-hidden="true" /> JAMB pace, {JAMB_SECONDS_PER_QUESTION}s a question
      </p>
    </div>
  );
}

/** How many questions took how long: a small stacked column chart. */
function TimeSpread({ time }: { time: TimeStats }) {
  const max = Math.max(1, ...time.buckets.map((b) => b.right + b.wrong + b.unanswered));
  return (
    <div className="mi-panel">
      <h3 className="mi-panel-title">Time on each question</h3>
      <div className="mi-cols" role="img" aria-label="How many questions took each length of time">
        {time.buckets.map((bucket) => {
          const n = bucket.right + bucket.wrong + bucket.unanswered;
          const h = (k: number) => `${(100 * k) / max}%`;
          return (
            <div key={bucket.label} className={cx('mi-col', bucket.fromS === 40 && 'after-jamb')}>
              <span className="count sj-mono">{n || ''}</span>
              <span className="stack">
                <span className="s" style={{ height: h(bucket.unanswered) }} />
                <span className="w" style={{ height: h(bucket.wrong) }} />
                <span className="r" style={{ height: h(bucket.right) }} />
              </span>
              <span className="lbl">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mi-legend">
        <span className="dot r" /> Right <span className="dot w" /> Wrong <span className="dot s" /> Not answered
        <span className="jamb-key" aria-hidden="true" /> JAMB pace
      </p>
    </div>
  );
}

function Slowest({ slowest, onOpen }: { slowest: Located[]; onOpen: (at: { s: number; i: number }) => void }) {
  return (
    <div className="mi-panel wide">
      <h3 className="mi-panel-title">Your slowest questions</h3>
      <ol className="mi-slow">
        {slowest.map((q) => (
          <li key={q.item.question_version_id}>
            <button type="button" className="mi-slow-btn" onClick={() => onOpen({ s: q.s, i: q.i })}>
              <span className={cx('mk-qcell', q.item.outcome)} aria-hidden="true">
                {q.item.position}
              </span>
              <span className="what">
                <strong>
                  {q.subject.name} · Q{q.item.position}
                </strong>
                <small>
                  {q.item.outcome === 'right' ? 'Right' : q.item.outcome === 'wrong' ? 'Wrong' : 'Not answered'}
                  {q.item.subtopic_name ? ` · ${q.item.subtopic_name}` : ''}
                </small>
              </span>
              <b className="sj-num">{durationText(q.item.response_ms)}</b>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SubjectTimes({ time }: { time: TimeStats }) {
  const max = Math.max(1, ...time.subjects.map((s) => s.ms));
  return (
    <div className="mi-panel wide">
      <h3 className="mi-panel-title">Time per subject</h3>
      <ul className="mi-stimes">
        {time.subjects.map((s) => {
          const pace = s.avgMs === null ? null : paceOf(s.avgMs);
          return (
            <li key={s.subject.subject_id}>
              <span className="lbl">{s.subject.name}</span>
              <span className="track">
                <span className="fill" style={{ width: `${(100 * s.ms) / max}%` }} />
              </span>
              <span className="val">
                <b className="sj-num">{durationText(s.ms)}</b>
                {pace ? (
                  <small className={cx('mi-pace', pace)}>
                    {durationText(s.avgMs!)} each · {PACE_WORD[pace]}
                  </small>
                ) : (
                  <small className="mi-pace">Not opened</small>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TimeInsights({
  report,
  time,
  onOpen,
}: {
  report: Report;
  time: TimeStats;
  onOpen: (at: { s: number; i: number }) => void;
}) {
  const total = report.duration_minutes * 60;
  const used = Math.min(report.time_used_seconds, total);
  const questions = report.overall.questions;
  const allowedEach = (total * 1000) / Math.max(1, questions);
  if (!time.recorded) {
    return (
      <div className="sj-card mi-time-none">
        <IconClock size={18} />
        <p>
          You used <b>{clock(used)}</b> of {clock(total)}. No question has time recorded, so there is no breakdown.
        </p>
      </div>
    );
  }
  const pace = paceOf(time.avgMs!);
  return (
    <div className="mi-time">
      <ul className="mi-tiles">
        <Tile label="Time used" value={clock(used)} sub={`of ${clock(total)}`} />
        <Tile
          label="Average a question"
          value={durationText(time.avgMs!)}
          sub={`over ${time.opened} opened`}
        />
        <Tile
          label="JAMB pace"
          value={PACE_WORD[pace]}
          tone={pace}
          sub={`JAMB allows ~${JAMB_SECONDS_PER_QUESTION}s`}
        />
        <Tile label="This mock allowed" value={durationText(allowedEach)} sub="a question" />
      </ul>
      <div className="mi-time-grid">
        {report.subjects.length > 1 ? <SubjectTimes time={time} /> : null}
        <OutcomeTimes time={time} />
        <TimeSpread time={time} />
        {time.slowest.length ? <Slowest slowest={time.slowest} onOpen={onOpen} /> : null}
      </div>
    </div>
  );
}

/* ================================================================== the trend */

/** The overall score across mocks as a small line chart, this mock's point ringed. */
function TrendChart({ points }: { points: TrendPoint[] }) {
  // Drawn at the width it is shown, so its labels stay the same size on a phone and a laptop.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setW(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const shown = points.slice(-8);
  const H = 168;
  const pad = { l: 34, r: 18, t: 22, b: 28 };
  // Points sit inside the grid, clear of the axis labels on the left and the edge on the right.
  const inset = 26;
  const x0 = pad.l + inset;
  const x1 = W - pad.r - inset;
  const x = (i: number) => (shown.length === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (shown.length - 1));
  const y = (p: number) => pad.t + ((100 - p) * (H - pad.t - pad.b)) / 100;
  const line = shown.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ');
  const area = `${line} L${x(shown.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  // Dates need about 48px each; when they would touch, every other one is shown.
  const step = shown.length > 1 ? (x1 - x0) / (shown.length - 1) : W;
  const dated = (i: number) => step >= 48 || (shown.length - 1 - i) % 2 === 0;
  return (
    <div ref={box} className="mi-trend-box">
    <svg className="mi-trend-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Overall score in each mock">
      <defs>
        <linearGradient id="mi-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--purple-500)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--purple-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} />
          <text className="axis" x={pad.l - 8} y={y(g) + 4} textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {shown.length > 1 ? <path className="area" d={area} fill="url(#mi-trend-fill)" /> : null}
      {shown.length > 1 ? <path className="line" d={line} /> : null}
      {shown.map((p, i) => (
        <g key={p.mockId}>
          <circle className={cx('pt', p.current && 'now')} cx={x(i)} cy={y(p.percent)} r={p.current ? 6 : 4.5} />
          <text className={cx('val', p.current && 'now')} x={x(i)} y={y(p.percent) - 11} textAnchor="middle">
            {p.percent}%
          </text>
          {dated(i) ? (
            <text className="axis" x={x(i)} y={H - 8} textAnchor="middle">
              {shortDate(p.at)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
    </div>
  );
}

/** A tiny line for one subject across mocks. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="mi-spark-none" />;
  const W = 72;
  const H = 22;
  const x = (i: number) => 3 + (i * (W - 6)) / (values.length - 1);
  const y = (p: number) => 3 + ((100 - p) * (H - 6)) / 100;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="mi-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={d} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r="2.5" />
    </svg>
  );
}

export function Trend({
  report,
  points,
  previous,
}: {
  report: Report;
  points: TrendPoint[];
  previous: MockSummary | null;
}) {
  const scored = report.overall.percent !== null;
  if (!previous) {
    return (
      <div className="sj-card mi-trend-first">
        <span className="mi-trend-first-icon" aria-hidden="true">
          <IconCheck size={18} />
        </span>
        <p>
          {scored ? (
            <>
              This is your first scored mock: <b>{report.overall.percent}%</b> is your starting line. Sit another and your
              trend appears here.
            </>
          ) : (
            <>Your trend starts with your first scored mock. Sit another and it appears here.</>
          )}
        </p>
      </div>
    );
  }
  const before = new Map(previous.subjects.map((s) => [s.subject_id, s]));
  return (
    <div className="sj-card mi-trend">
      <div className="mi-trend-chart">
        <TrendChart points={points} />
        {points.length > 8 ? <p className="mi-foot">Your last 8 scored mocks.</p> : null}
      </div>
      <div className="mi-vs">
        <h3 className="mi-panel-title">Against your last mock · {shortDate(previous.started_at)}</h3>
        <ul className="mi-vs-list">
          <li className="all">
            <span className="lbl">Overall</span>
            <span className="was sj-num">{previous.overall?.percent ?? '–'}%</span>
            <IconArrowRight size={14} />
            <span className="now sj-num">{report.overall.percent === null ? '–' : `${report.overall.percent}%`}</span>
            <Delta value={change(report.overall, previous.overall)} />
          </li>
          {report.subjects.map((subject: SubjectResult) => {
            const was = before.get(subject.subject_id);
            const series = points
              .map((p) => p.subjects[subject.subject_id])
              .filter((v): v is number => v !== null && v !== undefined);
            return (
              <li key={subject.subject_id}>
                <span className="lbl">{subject.name}</span>
                {was && was.tally.percent !== null ? (
                  <>
                    <span className="was sj-num">{was.tally.percent}%</span>
                    <IconArrowRight size={14} />
                    <span className="now sj-num">
                      {subject.tally.percent === null ? '–' : `${subject.tally.percent}%`}
                    </span>
                    <Delta value={change(subject.tally, was.tally)} />
                  </>
                ) : (
                  <span className="new">{subject.tally.percent === null ? 'No answers' : 'Not in your last mock'}</span>
                )}
                <Spark values={series} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ================================================================== topic breakdown */

export function TopicBreakdown({ report }: { report: Report }) {
  const subjects = report.subjects.filter((s) => s.topics.length > 0);
  const [at, setAt] = useState(0);
  const [all, setAll] = useState(false);
  if (subjects.length === 0) return null;
  const subject = subjects[Math.min(at, subjects.length - 1)]!;
  const LIMIT = 8;
  const topics = all ? subject.topics : subject.topics.slice(0, LIMIT);
  const max = Math.max(...subject.topics.map((t) => t.questions));
  return (
    <div className="sj-card mi-topics">
      {subjects.length > 1 ? (
        <div className="mi-tabs" role="tablist" aria-label="Subject">
          {subjects.map((s, index) => (
            <button
              key={s.subject_id}
              type="button"
              role="tab"
              aria-selected={s === subject}
              className={cx('mi-tab', s === subject && 'on')}
              onClick={() => {
                setAt(index);
                setAll(false);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="mi-tlist">
        {topics.map((topic) => (
          <li key={topic.subtopic_id}>
            <span className="name">
              {topic.name}
              {topic.topic_name ? <small>{topic.topic_name}</small> : null}
            </span>
            <span className="track">
              <span className="bar" style={{ width: `${(100 * topic.questions) / max}%` }}>
                <span className="r" style={{ flexGrow: topic.correct }} />
                <span className="w" style={{ flexGrow: topic.wrong }} />
                <span className="s" style={{ flexGrow: topic.unanswered }} />
              </span>
            </span>
            <span className="score sj-mono">
              <b>{topic.correct}</b>/{topic.questions}
            </span>
          </li>
        ))}
      </ul>
      {subject.topics.length > LIMIT ? (
        <button type="button" className="mi-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${subject.topics.length} topics`}
        </button>
      ) : null}
      <p className="mi-legend">
        <span className="dot r" /> Right <span className="dot w" /> Wrong <span className="dot s" /> Skipped
        <span className="mi-legend-note">Bar length is how many questions the topic had.</span>
      </p>
    </div>
  );
}
