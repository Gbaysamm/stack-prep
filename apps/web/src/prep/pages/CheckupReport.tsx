/**
 * /checkup/:sessionId/report — what one check-up found, in the plain numbers of
 * docs/student-scoring.md.
 *
 * Ordered the way a student reads it: the result first (in the page hero), which is now the
 * predicted score; then the subject's score from every answer; then the topics this sitting
 * touched, weakest first; then what to do next and when the next check-up is due; then how the
 * numbers are worked out. Every number is right ÷ answered, shown with its count.
 *
 * JAMB's words throughout: a TOPIC (the API's `subtopics`) is the unit scored; a SECTION (the
 * API's `topics`) is only the heading that groups them.
 */

import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  api,
  type CheckupReport as Report,
  type SubjectScore,
  type SubtopicReport,
  type TopicScore,
  type TopicStatus,
} from '../../student/api.js';
import { IconArrowRight, IconBolt, IconCalendar, IconCheck, IconHelp, IconReplay } from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, Eyebrow, PageHero, ShowMore, Skeleton, cx, useShowMore } from '../ui.js';
import { HOW_PATH } from './HowItsWorkedOut.js';
import { NothingFreshNote, useStartPractice } from './Home.js';
import './CheckupReport.css';

/* ------------------------------------------------------------------ words and numbers */

const STATUS_LABEL: Record<TopicStatus, string> = {
  not_tried: 'Not tried yet',
  just_started: 'Just started',
  needs_work: 'Needs work',
  getting_there: 'Getting there',
  strong: 'Strong',
};

/** A change in points: "+10", "−3", or a muted "0". */
function Signed({ value }: { value: number }) {
  if (value === 0) return <span className="cp-delta zero">0</span>;
  return <span className={cx('cp-delta', value > 0 ? 'up' : 'down')}>{value > 0 ? `+${value}` : `−${Math.abs(value)}`}</span>;
}

/** "2026-10-19" as a local date, "19 October". */
function dayText(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** How many topics "What next" names. */
const NEXT_COUNT = 3;
/** Topic rows before "Show all". */
const TOUCHED_SHOWN = 8;

/** The topics to practise next: the lowest topic scores in the subject, the bigger topic first on a tie. */
function weakestTopics(report: Report): { subtopic_id: string; name: string; score: number | null }[] {
  const standing = report.standing;
  if (standing) {
    return standing.topics
      .filter((t) => t.answered > 0 && t.score !== null)
      .sort((a, b) => a.score! - b.score! || b.share - a.share)
      .slice(0, NEXT_COUNT);
  }
  return report.subtopics
    .filter((s) => s.answered > 0 && s.mastery !== null)
    .sort((a, b) => a.mastery! - b.mastery!)
    .slice(0, NEXT_COUNT)
    .map((s) => ({ subtopic_id: s.subtopic_id, name: s.name, score: Math.round(s.mastery! * 100) }));
}

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
  tone: 'warn' | 'plain';
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

export function CheckupReport() {
  const { sessionId = '' } = useParams();
  const student = useStudent();

  const report = useLoad(() => api.report(sessionId), [sessionId]);
  const overview = useLoad(() => progressApi.overview(student.studentId), [student.studentId]);

  const subject = report.data
    ? overview.data?.subjects.find((s) => s.subject_id === report.data?.subject_id)
    : undefined;
  const subjectName = subject?.subject_name ?? '';
  usePageTitle(subjectName ? `${subjectName} report` : 'Check-up report');

  // A link to a part of the report (#topics, #next) lands on it once the report is in.
  const ready = Boolean(report.data);
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    const id = window.setTimeout(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [ready]);

  // "Practise" means the weakest topics named under What next, never a general run.
  const starter = useStartPractice();
  const starting = starter.busy !== null;
  const startIssue = starter.error;
  const weakest = report.data ? weakestTopics(report.data) : [];
  const practise = (where: 'hero' | 'cta') => {
    if (!report.data || starting) return;
    void starter.start(
      report.data.subject_id,
      weakest.length > 0
        ? {
            subtopicIds: weakest.map((t) => t.subtopic_id),
            label: weakest.length === 1 ? weakest[0]!.name : `your ${weakest.length} weakest topics`,
          }
        : {},
      where,
    );
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
  const standing = data.standing;
  const finishedAt = standing?.checkups.find((c) => c.session_id === data.session_id)?.finished_at ?? null;
  const dateText = finishedAt
    ? new Date(finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : null;
  const exam = subject?.examination_short_name;
  const goalPath = `/subjects/${data.subject_id}/goal`;
  const target = subject?.goal?.target_score ?? null;
  const score = data.score;
  const sittingTopics = data.subtopics.filter((line) => line.answered > 0).length;
  const practiseLabel = weakest.length > 1 ? `Practise ${weakest.length} weakest topics` : 'Practise weakest topic';

  return (
    <div className="sj-page cp-page">
      <PageHero
        back={{ to: '/checkup', label: 'All check-ups' }}
        eyebrow={`Check-up report${exam || subjectName ? ` · ${[exam, subjectName].filter(Boolean).join(' ')}` : ''}`}
        title={
          data.answered > 0 && score !== null
            ? `Your check-up result: ${score}%`
            : 'No answers in this check-up yet'
        }
        sub={
          data.answered === 0
            ? 'Answer a few questions and your result shows here.'
            : data.finished
              ? `${dateText ? `On ${dateText}. ` : ''}This result is now your predicted score: the closest thing to sitting the exam today.`
              : `From the ${data.answered} answer${data.answered === 1 ? '' : 's'} so far. Finish the check-up and the result becomes your predicted score.`
        }
        actions={
          weakest.length > 0 ? (
            <Button
              tone="lime"
              onClick={() => practise('hero')}
              busy={starting}
              icon={starting ? undefined : <IconBolt size={18} />}
            >
              {starting ? 'Starting…' : practiseLabel}
            </Button>
          ) : null
        }
        aside={
          score !== null ? (
            <div className="cp-stat">
              <span className="cp-stat-label">{data.finished ? 'Predicted score' : 'So far'}</span>
              <span className="cp-stat-num">
                <span className="sj-num">
                  <CountUp value={score} duration={1100} />
                </span>
                <span className="unit sj-mono">%</span>
              </span>
              <span className="cp-stat-note">
                The average of your {sittingTopics} topic score{sittingTopics === 1 ? '' : 's'} here ({data.right} of{' '}
                {data.answered} questions right).
              </span>
              <span className="cp-stat-chips">
                {data.previous_score !== null ? (
                  <span>
                    Last check-up {data.previous_score}% → now {score}% (<Signed value={score - data.previous_score} />)
                  </span>
                ) : (
                  <span>
                    <IconCheck size={14} />
                    Your first check-up
                  </span>
                )}
                {target !== null && data.finished ? (
                  <span>{target - score > 0 ? `${target - score} to go to your target of ${target}` : `At your target of ${target}`}</span>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="cp-stat">
              <span className="cp-stat-label">This check-up</span>
              <span className="cp-stat-num">
                <span className="sj-num">0</span>
                <span className="unit sj-mono">answered</span>
              </span>
              <span className="cp-stat-note">Your result appears after your first answer.</span>
            </div>
          )
        }
      />

      {startIssue ? (
        <p className="cp-issue" role="alert">
          {startIssue}
        </p>
      ) : null}
      {starter.exhausted?.key === 'hero' ? <NothingFreshNote starter={starter} /> : null}

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
          What’s below comes from the {data.answered} answers so far. Finish it to set your predicted score.
        </Notice>
      ) : null}

      {standing ? <YourScore standing={standing} subjectName={subjectName} target={target} goalPath={goalPath} /> : null}

      <Touched report={data} />

      <section className="cp-cta sj-rise" id="next" aria-labelledby="cp-cta-title">
        <Eyebrow>What next</Eyebrow>
        <h2 id="cp-cta-title" className="sj-display sj-h2">
          {weakest.length > 1
            ? `Practise your ${weakest.length} weakest topics`
            : weakest.length === 1
              ? 'Practise your weakest topic'
              : 'Start practising'}
        </h2>
        {weakest.length > 0 ? (
          <ol className="cp-next">
            {weakest.map((t) => (
              <li key={t.subtopic_id}>
                <span className="name">{t.name}</span>
                <b className="sj-mono">{t.score !== null ? `${t.score}%` : '—'}</b>
              </li>
            ))}
          </ol>
        ) : null}
        <p>
          Questions you got wrong or guessed come back in practice until you get them. Get a hint or a worked lesson
          whenever you’re stuck.
        </p>
        {standing && (standing.checkup_due || standing.next_checkup_due) ? (
          <span className="cp-due">
            <IconCalendar size={16} />
            {standing.checkup_due || !standing.next_checkup_due
              ? 'Your next check-up is due now'
              : `Next check-up due ${dayText(standing.next_checkup_due)}`}
          </span>
        ) : null}
        {startIssue ? <p className="cp-issue dark">{startIssue}</p> : null}
        {starter.exhausted?.key === 'cta' ? <NothingFreshNote starter={starter} /> : null}
        <div className="cp-cta-actions">
          <Button
            tone="lime"
            size="lg"
            onClick={() => practise('cta')}
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

      <HowWorkedOut />
    </div>
  );
}

/* ------------------------------------------------------------------ your score */

function YourScore({
  standing,
  subjectName,
  target,
  goalPath,
}: {
  standing: SubjectScore;
  subjectName: string;
  target: number | null;
  goalPath: string;
}) {
  const s = standing;
  const trend = s.checkups.filter((c) => c.score !== null);
  return (
    <section className="cp-section first" aria-labelledby="cp-score-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>{subjectName ? `${subjectName} now` : 'The subject now'}</Eyebrow>
          <h2 id="cp-score-title" className="sj-display sj-h2">
            Your score
          </h2>
          <p>
            It counts every answer you’ve given in {subjectName || 'this subject'}, practice and check-ups, with only
            your latest try at each question.
          </p>
        </div>
      </div>

      <div className="cp-scorecard sj-rise d1">
        <div className="cp-stats">
          <div className="cp-statcell">
            <span className="sj-eyebrow">Your score</span>
            <span className="sj-num">{s.score !== null ? `${s.score}%` : '—'}</span>
            <span className="cp-statcell-foot">
              {s.topics_tried > 0
                ? `Average of ${s.topics_tried} topic${s.topics_tried === 1 ? '' : 's'} tried`
                : 'No answers yet'}
            </span>
          </div>
          <div className="cp-statcell">
            <span className="sj-eyebrow">Started at</span>
            <span className="sj-num">{s.started_score !== null ? `${s.started_score}%` : '—'}</span>
            <span className="cp-statcell-foot">
              {s.change !== null ? (
                <>
                  <Signed value={s.change} /> since your first check-up
                </>
              ) : (
                'Your first check-up'
              )}
            </span>
          </div>
          <div className="cp-statcell">
            <span className="cp-statcell-head">
              <span className="sj-eyebrow">Predicted score</span>
              <Link to={goalPath} className="cp-change">
                {target !== null ? 'Change target' : 'Set a target'}
              </Link>
            </span>
            <span className="sj-num green">{s.predicted !== null ? `${s.predicted}%` : '—'}</span>
            <span className="cp-statcell-foot">
              {s.predicted === null
                ? 'Your latest check-up result, once you finish one.'
                : target === null
                  ? 'Your latest check-up result.'
                  : target - s.predicted > 0
                    ? `${target - s.predicted} to go to your target of ${target}.`
                    : `At or past your target of ${target}.`}
            </span>
          </div>
        </div>
        {trend.length > 1 ? (
          <div className="cp-trend">
            <span className="sj-eyebrow">Check-ups so far</span>
            <span className="cp-trend-line sj-mono">
              {trend.map((c, i) => (
                <span key={c.session_id}>
                  {i > 0 ? <span className="arrow" aria-hidden="true">→</span> : null}
                  <b className={cx(i === trend.length - 1 && 'last')}>{c.score}%</b>
                </span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ topics this check-up touched */

interface TouchedRow {
  sub: SubtopicReport;
  topic: TopicScore | undefined;
}

function Touched({ report }: { report: Report }) {
  const byId = new Map((report.standing?.topics ?? []).map((t) => [t.subtopic_id, t]));
  const rows: TouchedRow[] = report.subtopics
    .filter((s) => s.answered > 0)
    .map((sub) => ({ sub, topic: byId.get(sub.subtopic_id) }))
    // Weakest first, by the topic score now; this sitting breaks a tie.
    .sort(
      (a, b) =>
        (a.topic?.score ?? Math.round((a.sub.mastery ?? 0) * 100)) - (b.topic?.score ?? Math.round((b.sub.mastery ?? 0) * 100)) ||
        (a.sub.mastery ?? 0) - (b.sub.mastery ?? 0),
    );
  const more = useShowMore(rows, TOUCHED_SHOWN);
  if (rows.length === 0) return null;

  return (
    <section className="cp-section" id="topics" aria-labelledby="cp-topics-title">
      <div className="cp-sechead">
        <div className="text">
          <Eyebrow>
            {rows.length} {rows.length === 1 ? 'topic' : 'topics'} in this check-up
          </Eyebrow>
          <h2 id="cp-topics-title" className="sj-display sj-h2">
            Topic by topic, weakest first
          </h2>
          <p>What you got right in this check-up, and each topic’s score now from all your answers.</p>
        </div>
      </div>

      <div className="sj-card cp-touched">
        <ul className="cp-subs" id="cp-touched-list">
          {more.items.map(({ sub, topic }) => {
            const status: TopicStatus = topic?.status ?? 'not_tried';
            const value = topic?.score ?? null;
            return (
              <li key={sub.subtopic_id} className={cx('cp-sub', status)}>
                <div className="cp-sub-row">
                  <span className="name">
                    {sub.name}
                    {sub.section_name ? <small>{sub.section_name}</small> : null}
                  </span>
                  <span className="val sj-mono">
                    {sub.correct} of {sub.answered} right
                  </span>
                </div>
                {topic ? (
                  <>
                    <div
                      className={cx('cp-bar', status)}
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={value ?? undefined}
                      aria-valuetext={value !== null ? `Topic score ${value}%, ${STATUS_LABEL[status].toLowerCase()}` : 'not tried yet'}
                    >
                      <span style={{ width: value !== null ? `${value}%` : '100%' }} />
                    </div>
                    <span className="cp-sub-meta">
                      <span className={cx('tag', status)}>{STATUS_LABEL[status]}</span>
                      {value !== null ? `Topic score ${value}% (${topic.right} of ${topic.answered})` : null}
                    </span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        <ShowMore more={more} noun="topics" controls="cp-touched-list" className="cp-submore" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ how it is worked out */

const HOW_STEPS = [
  { title: 'Right ÷ answered', body: 'Every score is the questions you got right, divided by the questions you answered.' },
  { title: 'Your latest answer counts', body: 'Get a question wrong, then right later, and it now counts as right.' },
  { title: 'Mistakes come back', body: 'Questions you got wrong or guessed come back in practice until you get them.' },
  { title: 'A check-up every 7 days', body: 'Your latest check-up result is your predicted score.' },
];

function HowWorkedOut() {
  return (
    <details className="cp-how sj-rise d3" open>
      <summary>
        <span className="cp-ico" aria-hidden="true">
          <IconHelp size={18} />
        </span>
        <strong className="cp-how-title">How this is worked out</strong>
      </summary>
      <div className="cp-how-body">
        <ol className="cp-how-steps">
          {HOW_STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="cp-how-head">
                <span className="n sj-mono">{i + 1}</span>
                <b>{step.title}</b>
              </span>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <Link className="sj-link cp-how-more" to={HOW_PATH}>
          Every number, explained <IconArrowRight size={14} />
        </Link>
      </div>
    </details>
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
      <Skeleton height={180} radius={14} />
      <div style={{ height: 28 }} />
      <Skeleton height={280} radius={14} />
    </div>
  );
}
