/**
 * /mock — the mock exam's home (redesigned 16 Nov 2026). A mock is either set for the student
 * (scheduled: by their roadmap, or by Stack Prep for everyone, sat in JAMB's format) or set by
 * them (custom). The two side by side, each locked until it may be sat: a scheduled one until
 * it opens, a custom one until most of each subject has been practised. Then the one running to
 * resume, every mock sat, and the results. A mock can be deleted from the list the way a
 * practice run can: hidden, not erased, so its answers still count.
 */

import { Link } from 'react-router-dom';

import { IconArrowRight, IconBulb, IconChevronRight, IconClock, IconFlag, IconLayers, IconLock } from '../icons.js';
import { mockApi, minutesText, percentText, type MockSummary, type Readiness, type ScheduledMock } from '../mockApi.js';
import { useResultSettings } from '../scoreDisplay.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import type { ScoreDisplay } from '../../student/api.js';
import { Button, Pager, Skeleton, cx, usePaged } from '../ui.js';
import './Mock.css';

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A score's band, for the tile's colour: strong, getting there, or needs work. */
const band = (percent: number | null | undefined) =>
  percent === null || percent === undefined ? 'none' : percent >= 70 ? 'high' : percent >= 50 ? 'mid' : 'low';

/**
 * One mock as one row of the list: a score tile coloured by how it went, what it was and
 * when, each subject as a small bar, and the way in. The whole row opens it.
 */
function HistoryRow({ mock, example, display }: { mock: MockSummary; example?: boolean; display: ScoreDisplay }) {
  const running = mock.status === 'in_progress';
  const asAggregate = display === 'aggregate' && mock.overall?.aggregate != null;
  const href = running ? `/mock/${mock.mock_id}` : `/mock/${mock.mock_id}/report`;
  const kind = mockKind(mock);
  const percent = mock.overall?.percent ?? null;
  const body = (
    <>
      <span className={cx('mk-tile', running ? 'live' : band(percent))} aria-hidden="true">
        {running ? (
          <IconClock size={20} />
        ) : percent === null ? (
          '–'
        ) : asAggregate ? (
          <>
            {mock.overall?.aggregate}
            <small>/400</small>
          </>
        ) : (
          `${percent}%`
        )}
      </span>
      <span className="mk-row-what">
        <b>{kind}</b>
        <small>
          {example ? 'Example' : shortDate(mock.started_at)} · {minutesText(mock.duration_minutes)}
          {running ? ' · in progress, tap to resume' : null}
          {mock.overall && !running ? ` · ${mock.overall.answered}/${mock.overall.questions} answered` : null}
          {asAggregate && !running ? ` · ${percent}%` : null}
          {mock.integrity_flags ? <span className="mk-flagged"> · left {mock.integrity_flags}×</span> : null}
        </small>
      </span>
      {running ? null : (
        <span className={cx('mk-row-bars', mock.subjects.length > 2 && 'many')}>
          {mock.subjects.map((s) => (
            <span key={s.subject_id} className="mk-row-bar">
              <span className="name">{s.name}</span>
              <span className="track">
                <span className={cx('fill', band(s.tally.percent))} style={{ width: `${s.tally.percent ?? 0}%` }} />
              </span>
              <span className="pct">{percentText(s.tally)}</span>
            </span>
          ))}
        </span>
      )}
      <IconChevronRight size={18} className="mk-row-go" aria-hidden="true" />
    </>
  );
  return (
    <li className={cx('mk-row sj-card', example && 'example')} aria-hidden={example || undefined}>
      {example ? (
        <div className="mk-row-link">{body}</div>
      ) : (
        <Link className="mk-row-link" to={href} aria-label={`${kind}, ${running ? 'resume' : 'open its report'}`}>
          {body}
        </Link>
      )}
    </li>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A day from the server (YYYY-MM-DD) in words: "Mon 24 Nov". */
const dayText = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** What a mock is called: a scheduled one by its name, else scheduled or custom. */
export const mockKind = (mock: { preset: string; title?: string | null }) =>
  mock.title ?? (mock.preset === 'utme' ? 'Scheduled mock' : 'Custom mock');

/**
 * The scheduled mock: set for the student, by their roadmap or by Stack Prep, sat in JAMB's
 * format with their own subjects. Locked until one is open today.
 */
function ScheduledCard({ next, blocked }: { next: ScheduledMock | null; blocked: boolean }) {
  const open = next?.state === 'open';
  const when = !next
    ? null
    : !open
      ? `Opens ${dayText(next.opens_on)}`
      : next.opens_on === next.closes_on
        ? 'Open today'
        : `Open until ${dayText(next.closes_on)}`;
  return (
    <article className={cx('mk2-utme', !open && 'locked')}>
      <span className="mk2-tag dark">{next?.source === 'roadmap' ? 'Set by your roadmap' : 'Set for you'}</span>
      <h2 className="sj-display">{next && next.source === 'stack' ? next.title : 'Scheduled mock'}</h2>
      <p>
        {next
          ? 'JAMB’s format with your own four subjects, start to finish, the way you will sit it.'
          : 'We set these for you, one a week in the last weeks before your exam.'}
      </p>
      <ul className="mk2-specs">
        <li>
          <span aria-hidden="true">
            <IconClock size={18} />
          </span>
          2 hours, start to finish
        </li>
        <li>
          <span aria-hidden="true">
            <IconLayers size={18} />
          </span>
          180 questions across your 4 subjects
        </li>
        <li>
          <span aria-hidden="true">
            <IconBulb size={18} />
          </span>
          Full screen, no hints
        </li>
        <li>
          <span aria-hidden="true">
            <IconFlag size={18} />
          </span>
          Hands itself in at 0:00
        </li>
      </ul>
      {open ? (
        <Button
          to={`/mock/new?scheduled=${next!.id}`}
          tone="lime"
          size="lg"
          disabled={blocked}
          trailing={<IconArrowRight size={18} />}
        >
          Start · {when}
        </Button>
      ) : (
        <span className="mk2-locked">
          <IconLock size={16} /> {when ?? 'Locked until one is set'}
        </span>
      )}
    </article>
  );
}

/** Whole weeks from today to a day. */
const weeksTo = (day: string) => Math.round((new Date(`${day}T00:00:00`).getTime() - Date.now()) / (7 * 864e5));

/** How long until a day, in words: "in 5 days", "in about 3 weeks". */
function untilText(day: string): string {
  const days = Math.max(1, Math.round((new Date(`${day}T00:00:00`).getTime() - Date.now()) / 864e5));
  if (days < 7) return days === 1 ? 'tomorrow' : `in ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'in about a week' : `in about ${weeks} weeks`;
}

/**
 * The custom mock's lock: one bar per subject that fills as its topics are practised in runs,
 * full when that subject is ready; the mock opens when every bar is full. Then the likely day.
 */
function Gate({ readiness }: { readiness: Readiness | null }) {
  return (
    <div className="mk2-gate">
      <b className="mk2-gate-head">Opens when every bar is full</b>
      {readiness && readiness.subjects.length > 0 ? (
        <ul className="mk2-gate-list">
          {readiness.subjects.map((s) => {
            const share = s.needed ? Math.min(100, Math.round((s.practised / s.needed) * 100)) : 100;
            return (
              <li key={s.name} className={share >= 100 ? 'done' : undefined}>
                <span className="mk2-gate-name">{s.name}</span>
                <span className="mk2-gate-pct">{share >= 100 ? 'Ready' : `${share}% there`}</span>
                <span className="mk2-gate-bar" aria-hidden="true">
                  <i style={{ width: `${share}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Each subject fills up as you practise its topics.</p>
      )}
      {readiness?.ready_on ? (
        <small className="mk2-gate-when">
          {weeksTo(readiness.ready_on) > 26
            ? 'Practise a few new topics each week to open it sooner.'
            : `Likely ${dayText(readiness.ready_on)}, ${untilText(readiness.ready_on)}${readiness.measured ? ' at your pace' : ''}.`}
        </small>
      ) : null}
    </div>
  );
}

/**
 * The custom mock: whatever the student sets up. Locked until most of the topics in each
 * subject have been practised in runs (the server holds the same rule), since a mock tests
 * what has been learnt.
 */
function CustomCard({ readiness, blocked }: { readiness: Readiness | null; blocked: boolean }) {
  const open = readiness?.ready === true;
  return (
    <article className={cx('mk2-custom', !open && 'locked')}>
      <span className="mk2-tag">Set it yourself</span>
      <h2 className="sj-display">Custom mock</h2>
      <p>Choose up to four subjects, how many questions in each, and how long you have.</p>
      {open ? (
        <ol className="mk2-steps">
          <li>
            <span>1</span> Pick the subjects
          </li>
          <li>
            <span>2</span> Set the questions and time
          </li>
          <li>
            <span>3</span> Sit it, then see your report
          </li>
        </ol>
      ) : (
        <Gate readiness={readiness} />
      )}
      {open ? (
        <Button to="/mock/new" tone="dark" disabled={blocked} trailing={<IconArrowRight size={18} />}>
          Set up a custom mock
        </Button>
      ) : (
        <span className="mk2-locked light">
          <IconLock size={16} /> Locked
        </span>
      )}
    </article>
  );
}

export function MockHub() {
  usePageTitle('Mock exam');
  const student = useStudent();
  const { display } = useResultSettings(student.studentId);
  const history = useLoad(() => mockApi.history(student.studentId), [student.studentId]);
  const scheduled = useLoad(() => mockApi.scheduled(student.studentId), [student.studentId]);
  const readiness = useLoad(() => mockApi.readiness(student.studentId), [student.studentId]);
  const mocks = history.data ?? [];
  const next = scheduled.data?.find((m) => m.state === 'open') ?? scheduled.data?.[0] ?? null;
  const paged = usePaged(mocks, 8);
  const running = mocks.find((m) => m.status === 'in_progress');

  // Scored mocks, oldest first: the best, the average, and the change since the first.
  const done = mocks
    .filter((m) => m.overall && m.overall.percent !== null)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  // Out of 400 when the student chose it; percentages otherwise.
  const asAggregate = display === 'aggregate' && done.every((m) => m.overall!.aggregate != null);
  const scores = done.map((m) => (asAggregate ? m.overall!.aggregate! : m.overall!.percent!));
  const unit = asAggregate ? '/400' : '%';
  const best = scores.length ? Math.max(...scores) : null;
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const last = scores.length ? scores[scores.length - 1]! : null;
  const moved = scores.length > 1 ? scores[scores.length - 1]! - scores[0]! : null;

  return (
    <div className="sj-page mk-page mk2">
      {running ? (
        <section className="mk2-resume" aria-label="Your mock in progress">
          <span className="mk2-resume-icon" aria-hidden="true">
            <IconClock size={22} />
          </span>
          <div>
            <b>{mockKind(running)} in progress</b>
            <small>
              Started {shortDate(running.started_at)} · {minutesText(running.duration_minutes)}. Your answers are saved.
            </small>
          </div>
          <Button to={`/mock/${running.mock_id}`} tone="dark" trailing={<IconArrowRight size={18} />}>
            Resume
          </Button>
        </section>
      ) : null}

      <section className="mk2-choose" aria-label="Mock exams">
        <ScheduledCard next={next} blocked={Boolean(running)} />
        <CustomCard readiness={readiness.data ?? null} blocked={Boolean(running)} />
      </section>

      <section className="mk2-history" aria-labelledby="mk-history">
        <h2 className="sj-display sj-h3" id="mk-history">
          Your mock exams
        </h2>
        {history.loading && !history.data ? (
          <div className="mk-list">
            <Skeleton height={96} />
            <Skeleton height={96} />
          </div>
        ) : history.error ? (
          <div className="sj-card mk-error">
            <p>{history.error}</p>
            <Button tone="soft" size="sm" onClick={history.reload}>
              Try again
            </Button>
          </div>
        ) : mocks.length === 0 ? (
          <div className="mk2-empty">
            <span className="mk2-empty-icon" aria-hidden="true">
              <IconClock size={24} />
            </span>
            <b>No mock exams yet</b>
            <p>Each mock you sit shows here with its full report.</p>
          </div>
        ) : (
          <>
            <ul className="mk-list">
              {paged.items.map((mock) => (
                <HistoryRow key={mock.mock_id} mock={mock} display={display} />
              ))}
            </ul>
            <Pager paged={paged} noun="mock exams" label="Pages of mock exams" anchorId="mk-history" />
          </>
        )}
      </section>

      {best !== null ? (
        <section className="mk2-results" aria-labelledby="mk2-results-title">
          <h2 id="mk2-results-title" className="sj-display sj-h3">
            Your results
          </h2>
          <div className="mk2-results-grid">
            <div className="mk2-res">
              <span>Best</span>
              <b className="sj-num">
                {best}
                <small>{unit}</small>
              </b>
            </div>
            <div className="mk2-res">
              <span>Latest</span>
              <b className="sj-num">
                {last}
                <small>{unit}</small>
              </b>
            </div>
            <div className="mk2-res">
              <span>Average</span>
              <b className="sj-num">
                {average}
                <small>{unit}</small>
              </b>
              <small className="mk2-res-note">over {scores.length === 1 ? '1 mock' : `${scores.length} mocks`}</small>
            </div>
            <div className="mk2-res">
              <span>Since your first</span>
              <b className={cx('sj-num', moved !== null && (moved > 0 ? 'up' : moved < 0 ? 'down' : ''))}>
                {moved === null ? '—' : moved > 0 ? `+${moved}` : `${moved}`}
              </b>
              <small className="mk2-res-note">
                {moved === null ? 'after your second mock' : asAggregate ? 'points' : 'percentage points'}
              </small>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
