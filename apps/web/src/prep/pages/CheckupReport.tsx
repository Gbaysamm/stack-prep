/**
 * /checkup/:sessionId/report — what one check-up found, in the plain numbers of
 * docs/student-scoring.md (redesigned 16 Nov 2026).
 *
 * The result first, in one sticker card: the score (now the predicted score), the bar to the
 * target, the last check-up and the subject's score now, and one way to practise. Then each
 * topic, in two plain lists (got wrong, got right); then the weakest topics to start with, as
 * cards; then one line on how it is worked out.
 *
 * JAMB's words throughout: a TOPIC (the API's `subtopics`) is the unit scored; a SECTION (the
 * API's `topics`) is only the heading that groups them.
 */

import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, type CheckupReport as Report, type SubtopicReport } from '../../student/api.js';
import { IconArrowLeft, IconArrowRight, IconCheck, IconClose, IconHelp, IconReplay } from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useRunGate } from '../RunGate.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { scoreLevel } from '../SubjectSwitcher.js';
import { Button, PageHero, ShowMore, Skeleton, cx, useShowMore } from '../ui.js';
import { HOW_PATH } from './HowItsWorkedOut.js';
import { NothingFreshNote, Section, useStartPractice } from './Home.js';
import './CheckupReport.css';

/* ------------------------------------------------------------------ words and numbers */

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

  // "Practise" means the weakest topics named under What next, never a general run. A run the
  // roadmap holds back is said in a popup at once (RunGate.tsx).
  const starter = useStartPractice();
  const gate = useRunGate();
  const starting = starter.busy !== null;
  const weakest = report.data ? weakestTopics(report.data) : [];
  const practise = (topics: { subtopic_id: string; name: string }[], where: string) => {
    if (!report.data || starting || topics.length === 0) return;
    const subjectId = report.data.subject_id;
    gate.startOwn(
      () =>
        void starter.start(
          subjectId,
          {
            subtopicIds: topics.map((t) => t.subtopic_id),
            label: topics.length === 1 ? topics[0]!.name : `your ${topics.length} weakest topics`,
          },
          where,
        ),
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
  const target = subject?.goal?.target_score ?? null;
  const score = data.score;
  const eyebrow = ['Check-up report', [exam, subjectName].filter(Boolean).join(' '), dateText].filter(Boolean).join(' · ');

  return (
    <div className="sj-page cp-page cp2">
      <Link className="cp2-back" to="/checkup">
        <IconArrowLeft size={16} /> All check-ups
      </Link>

      <Section
        eyebrow={eyebrow}
        title={data.answered === 0 ? 'No answers yet' : 'How your check-up went'}
        id="cp2-result-title"
        className="cp2-first"
      >
        <div className="cp2-result">
          <div className="cp2-result-score">
            <b className={cx('sj-num', scoreLevel(score, target))}>{score !== null ? `${score}%` : '—'}</b>
            <span>
              {data.right} of {data.answered} right
            </span>
          </div>
          <div className="cp2-result-text">
            <p className="cp2-result-lead">
              {data.answered === 0
                ? 'Answer a few questions and your result shows here.'
                : data.finished
                  ? 'This is now your predicted score: the closest thing to sitting the exam today.'
                  : `From the ${data.answered} answers so far. Finish the check-up and it becomes your predicted score.`}
            </p>
            {score !== null ? (
              <div className="cp2-target" aria-hidden="true">
                <i style={{ width: `${score}%` }} />
                {target !== null ? <em style={{ left: `${Math.min(100, target)}%` }} /> : null}
              </div>
            ) : null}
            <ul className="cp2-facts">
              {target !== null && score !== null ? (
                <li>
                  Target: <b>{target}%</b>
                  {target - score > 0 ? ` · ${target - score} to go` : ' · reached'}
                </li>
              ) : (
                <li>
                  <Link to={`/subjects/${data.subject_id}/goal`}>Set a target</Link>
                </li>
              )}
              {data.previous_score !== null && score !== null ? (
                <li>
                  Last check-up: <b>{data.previous_score}%</b> (<Signed value={score - data.previous_score} />)
                </li>
              ) : (
                <li>Your first check-up</li>
              )}
              {standing?.score != null ? (
                <li>
                  {subjectName || 'Subject'} score now: <b>{standing.score}%</b>
                </li>
              ) : null}
            </ul>
          </div>
          {weakest.length > 0 ? (
            <Button
              className="cp2-result-go"
              onClick={() => practise(weakest, 'hero')}
              busy={starting}
              trailing={starting ? undefined : <IconArrowRight size={18} />}
            >
              {starting ? 'Starting…' : weakest.length > 1 ? `Practise ${weakest.length} weakest topics` : 'Practise weakest topic'}
            </Button>
          ) : null}
        </div>
      </Section>

      {starter.error && !starter.planFirst ? (
        <p className="cp-issue" role="alert">
          {starter.error}
        </p>
      ) : null}
      {starter.exhausted ? <NothingFreshNote starter={starter} /> : null}

      {!data.finished ? (
        <Notice
          tone="warn"
          role="status"
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

      <Touched report={data} />

      {weakest.length > 0 ? (
        <Section
          eyebrow="What next"
          title="Start with these"
          id="next"
          className="cp2-next"
          sub={
            standing && (standing.checkup_due || standing.next_checkup_due)
              ? standing.checkup_due || !standing.next_checkup_due
                ? 'Your weakest topics now. Your next check-up is due now.'
                : `Your weakest topics now. Your next check-up is due ${dayText(standing.next_checkup_due)}.`
              : 'Your weakest topics now. Tap one to practise it.'
          }
        >
          <ul className="ph2-weak-list">
            {weakest.map((t) => (
              <li key={t.subtopic_id}>
                <button
                  type="button"
                  className={cx('ph2-weak-row', (t.score ?? 0) < 25 && 'very')}
                  onClick={() => practise([t], 'next')}
                  aria-label={`Practise ${t.name}`}
                >
                  <span className="ph2-weak-badge sj-num">{t.score !== null ? `${t.score}%` : '—'}</span>
                  <span className="ph2-weak-name">
                    <b>{t.name}</b>
                    <small>Tap to practise</small>
                  </span>
                  <IconArrowRight size={18} className="ph2-weak-arrow" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="cp2-how">
        <IconHelp size={16} />
        <span>
          Every score is questions right ÷ questions answered, counting your latest answer to each question.{' '}
          <Link to={HOW_PATH}>Every number, explained</Link>
        </span>
      </p>

      {gate.popup}
    </div>
  );
}

/* ------------------------------------------------------------------ topics this check-up touched */

/** One group (got wrong, or got right): a plain list, a few at a time. */
function TopicGroup({ title, tone, rows }: { title: string; tone: 'wrong' | 'right'; rows: SubtopicReport[] }) {
  const more = useShowMore(rows, TOUCHED_SHOWN);
  if (rows.length === 0) return null;
  const listId = `cp2-${tone}-list`;
  return (
    <div className={cx('cp2-group', tone)}>
      <h3>
        <span className="cp2-group-mark" aria-hidden="true">
          {tone === 'right' ? <IconCheck size={14} /> : <IconClose size={14} />}
        </span>
        {title}
        <span className="cp2-group-n">{rows.length}</span>
      </h3>
      <ul className="cp2-rows" id={listId}>
        {more.items.map((sub) => (
          <li key={sub.subtopic_id}>
            <span className="cp2-row-name">
              <b>{sub.name}</b>
              {sub.section_name ? <small>{sub.section_name}</small> : null}
            </span>
            {sub.answered > 1 ? (
              <span className="cp2-row-count sj-mono">
                {sub.correct} of {sub.answered}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <ShowMore more={more} noun="topics" controls={listId} className="cp-submore" />
    </div>
  );
}

function Touched({ report }: { report: Report }) {
  const asked = report.subtopics.filter((s) => s.answered > 0);
  if (asked.length === 0) return null;
  // Got wrong: any question in the topic missed. Got right: every one right.
  const wrong = asked.filter((s) => s.correct < s.answered);
  const right = asked.filter((s) => s.correct === s.answered);
  return (
    <Section
      eyebrow={`${asked.length} ${asked.length === 1 ? 'topic' : 'topics'} in this check-up`}
      title="How each topic went"
      id="topics"
      className="cp2-topics"
      sub="Questions you got wrong come back in your practice runs until you get them."
    >
      <div className="cp2-groups">
        <TopicGroup title="Got wrong" tone="wrong" rows={wrong} />
        <TopicGroup title="Got right" tone="right" rows={right} />
      </div>
    </Section>
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
