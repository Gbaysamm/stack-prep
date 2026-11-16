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
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { api, type CheckupResult } from '../../student/api.js';
import { IconArrowRight, IconClose, IconReplay, IconTarget } from '../icons.js';
import type { SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import {
  byUrgency,
  isDemoSubject,
  rememberSubject,
  scoreLevel,
  type SubjectTint,
  withDemoSubjects,
} from '../SubjectSwitcher.js';
import { progressApi } from '../progressApi.js';
import { Button, Pager, Skeleton, cx, usePaged } from '../ui.js';
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
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/** Each finished check-up's result, oldest first. */
function checkupsOf(subject: SubjectOverview): CheckupResult[] {
  const history = subject.scores?.checkups.filter((c) => c.score !== null) ?? [];
  if (history.length > 0) return history;
  const latest = subject.latest_checkup;
  return latest && latest.score !== null
    ? [
        {
          session_id: latest.session_id,
          finished_at: latest.finished_at,
          answered: latest.answered,
          right: latest.right,
          score: latest.score,
        },
      ]
    : [];
}

/** Weak topics listed on a card; the rest are counted and are in the report. */
const WEAK_SHOWN = 3;

/** Rows per page. */
const PAGE = 10;

/** A left-aligned message card: icon and title on one line, the words and the button beneath. */
function NoteCard({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
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
  const [startIssue, setStartIssue] = useState<{
    subjectId: string;
    text: string;
  } | null>(null);

  const data = useLoad(
    () =>
      Promise.all([
        progressApi.overview(student.studentId).then(withDemoSubjects),
        api.goals(student.studentId),
        api.catalogue(),
      ]),
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
        practice: {
          runs_finished: 0,
          questions_answered: 0,
          correct_unaided: 0,
          taught: 0,
        },
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
      setStartIssue({
        subjectId,
        text: friendly(error) || 'The check-up could not start.',
      });
      setStarting(null);
    }
  };

  return (
    <div className="sj-page ch-page">
      <section className="ch-section" aria-label="Your subjects">
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
          <div className="ck-cards" aria-busy="true" aria-label="Loading your subjects">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={250} radius={18} />
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
            Pick your exam and subjects, and your first check-up is one tap away.
          </NoteCard>
        ) : (
          <>
            <div className="ck-cards" id="ch-subject-rows">
              {paged.items.map((s) => (
                <CheckCard
                  key={s.subject_id}
                  subject={s}
                  tint="purple"
                  marked={s.subject_id === asked}
                  busy={starting === s.subject_id}
                  disabled={(starting !== null && starting !== s.subject_id) || isDemoSubject(s.subject_id)}
                  onStart={() => void start(s.subject_id)}
                />
              ))}
            </div>
            <Pager paged={paged} noun="subjects" anchorId="ch-subject-rows" />
            {startIssue ? (
              <p className="ch-issue" role="alert">
                {subjects.find((s) => s.subject_id === startIssue.subjectId)?.subject_name}: {startIssue.text}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * One subject: its check-up score; when it was last checked and when the next is due; its target
 * and how far there is to go; its weak topics by name; Report, and the one button that fits.
 */
function CheckCard({
  subject,
  tint,
  marked,
  busy,
  disabled,
  onStart,
}: {
  subject: SubjectOverview;
  tint: SubjectTint;
  marked: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const [history, setHistory] = useState(false);
  const results = checkupsOf(subject);
  const latest = results[results.length - 1];
  const score = latest?.score ?? null;
  const checked = subject.latest_checkup;
  const due = subject.scores?.checkup_due ?? false;
  const next = subject.scores?.next_checkup_due ?? null;
  const target = subject.goal?.target_score ?? null;
  const gap = target !== null && score !== null ? Math.round(target - score) : null;
  // Every weak topic (tried, under 50%), weakest first; the card lists the first WEAK_SHOWN.
  const weakAll = (subject.scores?.topics ?? [])
    .filter((t) => t.answered > 0 && t.score !== null && t.score < 50)
    .sort((x, y) => (x.score ?? 0) - (y.score ?? 0));
  const weak = weakAll.slice(0, WEAK_SHOWN);
  const openId = subject.open_checkup_session_id;

  return (
    <article className={cx('ck-card', `tint-${tint}`, marked && 'marked')}>
      <header className="ck-head">
        <span className="ck-letter" aria-hidden="true">
          {subject.subject_name.slice(0, 1)}
        </span>
        <div className="ck-title">
          <h2 className="sj-display ck-name">
            <Link to={`/subjects/${subject.subject_id}`}>{subject.subject_name}</Link>
          </h2>
          <span className="ck-sub">{subject.examination_short_name}</span>
        </div>
        {score !== null ? (
          <div className="ck-score">
            <b className={cx('sj-num', scoreLevel(score, target))}>{score}%</b>
            <small>check-up score</small>
          </div>
        ) : null}
      </header>

      {!checked && !openId ? (
        <div className="ck-empty">
          <b>Not checked yet</b>
          <p>About 15 questions, no hints. You get a starting score and the topics to work on.</p>
          {target !== null ? <small>Target {target}%</small> : null}
        </div>
      ) : (
        <>
          <div className="ck-tiles">
            <div className="ck-tile">
              <span className="ck-label">Last checked</span>
              <b>{openId ? 'Half done' : checked ? capital(whenLabel(checked.finished_at)) : 'Not yet'}</b>
              <small className={cx(due && !openId && 'due')}>
                {openId
                  ? 'Your answers are saved'
                  : !checked
                    ? 'About 15 questions'
                    : due
                      ? 'Next check-up due now'
                      : next
                        ? `Next on ${dayText(next)}`
                        : ''}
              </small>
            </div>
            <div className="ck-tile">
              <span className="ck-label">Target</span>
              <b>{target !== null ? `${target}%` : '—'}</b>
              <small>
                {target === null
                  ? 'No target set'
                  : gap === null
                    ? 'After a check-up'
                    : gap <= 0
                      ? 'Reached'
                      : `${gap} points to go`}
              </small>
            </div>
          </div>

          <div className="ck-weak">
            <span className="ck-label">Weak topics{weakAll.length ? ` · ${weakAll.length}` : ''}</span>
            {weak.length ? (
              <ul>
                {weak.map((w) => (
                  <li key={w.subtopic_id} className={(w.score ?? 0) < 25 ? 'very' : undefined}>
                    <i aria-hidden="true" />
                    <span>{w.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ck-none">{checked ? 'None so far' : 'After your first check-up'}</p>
            )}
            {weakAll.length > weak.length && checked ? (
              <Link className="ck-more" to={`/checkup/${checked.session_id}/report`}>
                {weakAll.length - weak.length} more in the report
              </Link>
            ) : null}
          </div>
        </>
      )}

      <footer className="ck-go">
        {checked ? (
          <Button size="sm" tone="ghost" icon={<IconReplay size={15} />} onClick={() => setHistory(true)}>
            History
          </Button>
        ) : (
          <span />
        )}
        {openId ? (
          <Button size="sm" tone="dark" to={`/checkup/${openId}`} trailing={<IconArrowRight size={16} />}>
            Resume
          </Button>
        ) : (
          <Button
            size="sm"
            tone={checked && !due ? 'soft' : 'primary'}
            onClick={onStart}
            busy={busy}
            disabled={disabled}
            trailing={busy ? undefined : <IconArrowRight size={16} />}
          >
            {busy ? 'Starting…' : checked ? 'Check again' : 'Start check-up'}
          </Button>
        )}
      </footer>
      {history ? (
        <CheckupHistory subject={subject} list={checkupsOf(subject)} onClose={() => setHistory(false)} />
      ) : null}
    </article>
  );
}

/** Every check-up of one subject, newest first, each opening its report. */
function CheckupHistory({
  subject,
  list,
  onClose,
}: {
  subject: SubjectOverview;
  list: CheckupResult[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const newest = [...list].reverse();
  return createPortal(
    <div className="sj">
      <div className="sj-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="sj-dialog ck-hist" role="dialog" aria-modal="true" aria-labelledby="ck-hist-title">
          <header className="ck-hist-head">
            <h2 id="ck-hist-title" className="sj-display sj-h3">
              {subject.subject_name} check-ups
            </h2>
            <button type="button" className="ck-hist-close" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </header>
          {newest.length === 0 ? (
            <p className="sj-muted">No check-ups yet.</p>
          ) : (
            <ol className="ck-hist-list">
              {newest.map((c, n) => {
                const before = newest[n + 1];
                const change = before && before.score !== null && c.score !== null ? c.score - before.score : null;
                return (
                  <li key={c.session_id}>
                    <Link to={`/checkup/${c.session_id}/report`} className="ck-hist-row">
                      <span className="ck-hist-when">
                        <b>
                          {new Date(c.finished_at).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </b>
                        <small>{n === 0 ? 'Latest' : `Check-up ${newest.length - n}`}</small>
                      </span>
                      <span className="ck-hist-score">
                        <b className="sj-num">{c.score !== null ? `${c.score}%` : '—'}</b>
                        <small>
                          {c.right} of {c.answered} right
                        </small>
                      </span>
                      <span
                        className={cx(
                          'ck-hist-change',
                          change !== null && (change > 0 ? 'up' : change < 0 ? 'down' : ''),
                        )}
                      >
                        {change === null ? '' : change > 0 ? `+${change}` : change < 0 ? `${change}` : '±0'}
                      </span>
                      <span className="ck-hist-go">
                        Report <IconArrowRight size={14} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "5 days ago" as the start of a line: "5 days ago"; "today" as "Today". */
function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
