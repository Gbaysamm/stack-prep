/**
 * /checkup/:sessionId/report — what one check-up found (redesigned 17 Nov 2026).
 *
 * 1. The result band: this sitting's score on a ring, the answers as a row of marks, the
 *    subject score now on its way to the target, one way to practise.
 * 2. Each section on one row: its marks, then its topics, right in green, wrong in red.
 * 3. The questions themselves, folded: what was chosen, the answer, how to get it.
 * 4. The weakest topics now, as three cards side by side.
 *
 * JAMB's words throughout: a TOPIC (the API's `subtopics`) is the unit scored; a SECTION (the
 * API's `topics`) is only the heading that groups them.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, type CheckupReport as Report } from '../../student/api.js';
import { IconArrowRight, IconCheck, IconClose, IconHelp, IconReplay } from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useRunGate } from '../RunGate.js';
import type { ReviewItem } from '../runsApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { scoreLevel } from '../SubjectSwitcher.js';
import { Button, PageHero, Ring, ShowMore, Skeleton, cx, useShowMore } from '../ui.js';
import { HOW_PATH } from './HowItsWorkedOut.js';
import { NothingFreshNote, Section, useStartPractice } from './Home.js';
import { QuestionCard } from './RunReport.js';
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
/** Questions before "Show all". */
const ANSWERS_SHOWN = 6;

interface Weak {
  subtopic_id: string;
  name: string;
  section_name: string | null;
  score: number | null;
}

/** The topics to practise next: the lowest topic scores in the subject, the bigger topic first on a tie. */
function weakestTopics(report: Report): Weak[] {
  const standing = report.standing;
  if (standing) {
    return standing.topics
      .filter((t) => t.answered > 0 && t.score !== null)
      .sort((a, b) => a.score! - b.score! || b.share - a.share)
      .slice(0, NEXT_COUNT)
      .map((t) => ({ subtopic_id: t.subtopic_id, name: t.name, section_name: t.section_name, score: t.score }));
  }
  return report.subtopics
    .filter((s) => s.answered > 0 && s.mastery !== null)
    .sort((a, b) => a.mastery! - b.mastery!)
    .slice(0, NEXT_COUNT)
    .map((s) => ({
      subtopic_id: s.subtopic_id,
      name: s.name,
      section_name: s.section_name ?? null,
      score: Math.round(s.mastery! * 100),
    }));
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
  // The questions come after the report, so the result never waits on them.
  const answers = useLoad(
    () => (report.data ? api.answers(sessionId) : new Promise<never>(() => undefined)),
    [sessionId, Boolean(report.data)],
  );
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
  const gate = useRunGate(Boolean(report.data));
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
  // The subject's score after this check-up (every counted answer): the one the target measures.
  const now = standing?.score ?? null;
  const towards = now ?? score;
  const eyebrow = ['Check-up report', [exam, subjectName].filter(Boolean).join(' '), dateText].filter(Boolean).join(' · ');
  const items = answers.data?.items ?? null;

  return (
    <div className="sj-page cp-page cp3">
      <Section
        eyebrow={eyebrow}
        title={data.answered === 0 ? 'No answers yet' : 'How your check-up went'}
        id="cp3-title"
        className="cp3-first"
      >
        <div className="cp3-hero">
          <div className="cp3-dial">
            <Ring value={(score ?? 0) / 100} size={132} stroke={13} color={ringColour(scoreLevel(score, target))}>
              <span className="cp3-dial-in">
                <b className="sj-num">{score !== null ? `${score}%` : '—'}</b>
                <small>this check-up</small>
              </span>
            </Ring>
            <span className="cp3-dial-note">
              <b>{data.right}</b> of {data.answered} right
            </span>
          </div>

          <div className="cp3-hero-main">
            <p className="cp3-lead">
              {data.answered === 0 ? (
                'Answer a few questions and your result shows here.'
              ) : !data.finished ? (
                `From the ${data.answered} answers so far. Finish the check-up to update your score.`
              ) : now !== null ? (
                <>
                  Your {subjectName || 'subject'} score is now <b className="sj-num">{now}%</b>
                </>
              ) : (
                'This check-up sets your score.'
              )}
            </p>

            {data.answered > 0 ? <Marks items={items} report={data} /> : null}

            {towards !== null ? (
              <Journey now={towards} target={target} previous={data.previous_score} subjectId={data.subject_id} />
            ) : null}

            <div className="cp3-hero-foot">
              {weakest.length > 0 ? (
                <Button
                  onClick={() => practise(weakest, 'hero')}
                  busy={starting}
                  trailing={starting ? undefined : <IconArrowRight size={18} />}
                >
                  {starting ? 'Starting…' : weakest.length > 1 ? `Practise ${weakest.length} weakest topics` : 'Practise weakest topic'}
                </Button>
              ) : null}
              <span className="cp3-hero-aside">
                {data.previous_score !== null && score !== null ? (
                  <>
                    Last check-up <b>{data.previous_score}%</b> <Signed value={score - data.previous_score} />
                  </>
                ) : (
                  'Your first check-up in this subject'
                )}
              </span>
            </div>
          </div>
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
          What’s below comes from the {data.answered} answers so far. Finish it to set your score.
        </Notice>
      ) : null}

      <Sections report={data} />

      <Answers items={items} error={answers.error} reload={answers.reload} />

      {weakest.length > 0 ? (
        <Section
          eyebrow="What next"
          title="Start with these"
          id="next"
          className="cp3-next"
          sub={
            standing && (standing.checkup_due || standing.next_checkup_due)
              ? standing.checkup_due || !standing.next_checkup_due
                ? 'Your weakest topics now. Your next check-up is due now.'
                : `Your weakest topics now. Your next check-up is due ${dayText(standing.next_checkup_due)}.`
              : 'Your weakest topics now. Tap one to practise it.'
          }
        >
          <ul className="cp3-next-list">
            {weakest.map((t, index) => (
              <li key={t.subtopic_id}>
                <button
                  type="button"
                  className="cp3-next-card"
                  onClick={() => practise([t], 'next')}
                  aria-label={`Practise ${t.name}`}
                >
                  <span className="cp3-next-top">
                    <span className={cx('cp3-next-badge sj-num', scoreLevel(t.score))}>
                      {t.score !== null ? `${t.score}%` : '—'}
                    </span>
                    <span className="cp3-next-rank sj-mono">{index + 1}</span>
                  </span>
                  <b>{t.name}</b>
                  {t.section_name ? <small>{t.section_name}</small> : null}
                  <span className="cp3-next-go">
                    Practise <IconArrowRight size={16} />
                  </span>
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

function ringColour(level: string): string {
  return level === 'good' ? 'var(--green-500)' : level === 'mid' ? '#f59e0b' : '#e11d48';
}

/* ------------------------------------------------------------------ the answers as marks */

/** One mark per question, in the order they came: a tap opens that question below. */
function Marks({ items, report }: { items: ReviewItem[] | null; report: Report }) {
  const marks: { right: boolean; position: number | null }[] = items
    ? items.map((item) => ({ right: item.attempts.some((a) => a.is_correct), position: item.position }))
    : Array.from({ length: report.answered }, (_, i) => ({ right: i < report.right, position: null }));
  return (
    <ol className="cp3-marks" aria-label="Your answers in order">
      {marks.map((mark, i) => (
        <li key={i}>
          <button
            type="button"
            className={cx('cp3-mark', mark.right ? 'right' : 'wrong')}
            disabled={mark.position === null}
            onClick={() => mark.position !== null && openQuestion(mark.position)}
            aria-label={`Question ${i + 1}: ${mark.right ? 'right' : 'wrong'}`}
            title={`Question ${i + 1}: ${mark.right ? 'right' : 'wrong'}`}
          >
            {mark.right ? <IconCheck size={13} /> : <IconClose size={12} />}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Ask the answers list to open and show one question. */
function openQuestion(position: number) {
  window.dispatchEvent(new CustomEvent('cp3-open', { detail: position }));
}

/** The subject score on its way to the target, with the last check-up marked. */
function Journey({
  now,
  target,
  previous,
  subjectId,
}: {
  now: number;
  target: number | null;
  previous: number | null;
  subjectId: string;
}) {
  const at = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className="cp3-journey">
      <div className="cp3-track" aria-hidden="true">
        <i className="cp3-fill" style={{ width: at(now) }} />
        {previous !== null ? <em className="cp3-pin last" style={{ left: at(previous) }} /> : null}
        {target !== null ? <em className="cp3-pin goal" style={{ left: at(target) }} /> : null}
      </div>
      <p className="cp3-journey-say">
        {target === null ? (
          <Link to={`/subjects/${subjectId}/goal`}>Set a target</Link>
        ) : target - now > 0 ? (
          <>
            Target <b>{target}%</b> · <b>{target - now}</b> points to go
          </>
        ) : (
          <>
            Target <b>{target}%</b> · reached
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ each section */

/** Topic tiles before "Show all". */
const TILES_SHOWN = 9;

/** Every topic the check-up asked about, as a tile: red if any question in it was wrong. */
function Sections({ report }: { report: Report }) {
  const asked = useMemo(
    () =>
      report.subtopics
        .filter((t) => t.answered > 0)
        .sort((a, b) => a.correct / a.answered - b.correct / b.answered || b.answered - a.answered),
    [report.subtopics],
  );
  const more = useShowMore(asked, TILES_SHOWN);
  if (asked.length === 0) return null;
  const wrong = asked.filter((t) => t.correct < t.answered).length;
  return (
    <Section
      eyebrow={`${asked.length} ${asked.length === 1 ? 'topic' : 'topics'} in this check-up`}
      title="How each topic went"
      id="topics"
      className="cp3-sections"
      sub={
        wrong > 0
          ? `${wrong} to work on. The questions you got wrong come back in your practice runs until you get them.`
          : 'Every topic right. Well done.'
      }
    >
      <ul className="cp3-tiles" id="cp3-tiles">
        {more.items.map((t) => {
          const allRight = t.correct === t.answered;
          return (
            <li key={t.subtopic_id} className={allRight ? 'right' : 'wrong'}>
              <span className="cp3-tile-mark" aria-label={allRight ? 'Right' : 'Wrong'}>
                {allRight ? <IconCheck size={14} /> : <IconClose size={13} />}
              </span>
              <span className="cp3-tile-text">
                <b>{t.name}</b>
                {t.section_name ? <small>{t.section_name}</small> : null}
              </span>
              {t.answered > 1 ? (
                <span className="cp3-tile-n sj-mono">
                  {t.correct}/{t.answered}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ShowMore more={more} noun="topics" controls="cp3-tiles" className="cp-submore" />
    </Section>
  );
}

/* ------------------------------------------------------------------ the questions */

type Show = 'all' | 'wrong' | 'right';

function Answers({ items, error, reload }: { items: ReviewItem[] | null; error: string | null; reload: () => void }) {
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const cards = useRef(new Map<number, HTMLElement>());
  const all = items ?? [];
  const isRight = (item: ReviewItem) => item.attempts.some((a) => a.is_correct);
  const shown = all.filter((item) => show === 'all' || (show === 'right') === isRight(item));
  const more = useShowMore(shown, ANSWERS_SHOWN);
  const wrongCount = all.filter((item) => !isRight(item)).length;

  // A mark in the result band opens its question here.
  const moreRef = useRef(more);
  moreRef.current = more;
  useEffect(() => {
    const onOpen = (event: Event) => {
      const position = (event as CustomEvent<number>).detail;
      setShow('all');
      if (!moreRef.current.open && position > ANSWERS_SHOWN) moreRef.current.toggle();
      setOpen((current) => new Set(current).add(position));
      setActive(position);
      window.setTimeout(() => setActive(null), 1400);
      window.setTimeout(() => {
        cards.current.get(position)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    };
    window.addEventListener('cp3-open', onOpen);
    return () => window.removeEventListener('cp3-open', onOpen);
  }, []);

  if (error && !items) {
    return (
      <Section eyebrow="Question by question" title="Your answers" id="answers" className="cp3-answers">
        <p className="cp-issue" role="alert">
          Your answers didn’t load.{' '}
          <button type="button" className="cp3-link" onClick={reload}>
            Try again
          </button>
        </p>
      </Section>
    );
  }
  if (items && items.length === 0) return null;

  const filters: { id: Show; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: all.length },
    { id: 'wrong', label: 'Wrong', n: wrongCount },
    { id: 'right', label: 'Right', n: all.length - wrongCount },
  ];

  return (
    <Section
      eyebrow="Question by question"
      title="Your answers"
      id="answers"
      className="cp3-answers"
      sub="Open any question to see the right answer and how to get it."
    >
      {items ? (
        <>
          <div className="cp3-seg" role="group" aria-label="Show">
            {filters
              .filter((f) => f.id === 'all' || f.n > 0)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={cx(show === f.id && 'on')}
                  aria-pressed={show === f.id}
                  onClick={() => setShow(f.id)}
                >
                  {f.label} <span className="sj-mono">{f.n}</span>
                </button>
              ))}
          </div>
          <ol className="rr-qs cp3-qs" id="cp3-qs">
            {more.items.map((item) => (
              <QuestionCard
                key={item.position}
                item={item}
                checkup
                open={open.has(item.position)}
                active={active === item.position}
                onToggle={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(item.position)) next.delete(item.position);
                    else next.add(item.position);
                    return next;
                  })
                }
                refCard={(node) => {
                  if (node) cards.current.set(item.position, node);
                  else cards.current.delete(item.position);
                }}
              />
            ))}
          </ol>
          <ShowMore more={more} noun="questions" controls="cp3-qs" className="cp-submore" />
        </>
      ) : (
        <div className="cp3-qs-skel">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={76} radius={16} />
          ))}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ loading */

function ReportSkeleton() {
  return (
    <div className="sj-page cp-page cp3" aria-busy="true" aria-label="Loading your report">
      <div className="cp3-skel">
        <Skeleton width={260} height={12} />
        <Skeleton width="45%" height={34} />
      </div>
      <Skeleton height={230} radius={22} />
      <div className="cp3-skel">
        <Skeleton width={180} height={12} />
        <Skeleton width="35%" height={28} />
      </div>
      <Skeleton height={260} radius={20} />
    </div>
  );
}
