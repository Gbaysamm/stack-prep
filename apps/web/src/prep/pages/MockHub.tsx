/**
 * /mock — the mock exam's home: start one (or resume the one running), and every mock sat,
 * newest first, each with its result and its report. A mock can be deleted from this list the
 * way a practice run can: hidden, not erased, so its answers still count.
 */

import { Link } from 'react-router-dom';

import { IconArrowRight, IconChevronRight, IconClock } from '../icons.js';
import { mockApi, minutesText, percentText, type MockSummary } from '../mockApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Pager, Skeleton, Steps, cx, usePaged } from '../ui.js';
import './Mock.css';

const STEPS = [
  {
    title: 'Set it up',
    body: 'Up to four subjects, how many questions each, and how long. Or take the Real UTME: JAMB’s layout and pace, 180 questions in 2 hours for four subjects.',
  },
  {
    title: 'Sit it, start to finish',
    body: 'Full screen, no hints and no coach. A calculator when you need one. At 0:00 it hands itself in.',
  },
  {
    title: 'See where you stand',
    body: 'Your score in each subject and overall, every question with its answer, and the questions you left.',
  },
];

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
function HistoryRow({ mock, example }: { mock: MockSummary; example?: boolean }) {
  const running = mock.status === 'in_progress';
  const href = running ? `/mock/${mock.mock_id}` : `/mock/${mock.mock_id}/report`;
  const kind = mock.preset === 'utme' ? 'Real UTME' : 'Custom mock';
  const percent = mock.overall?.percent ?? null;
  const body = (
    <>
      <span className={cx('mk-tile', running ? 'live' : band(percent))} aria-hidden="true">
        {running ? <IconClock size={20} /> : percent === null ? '–' : `${percent}%`}
      </span>
      <span className="mk-row-what">
        <b>{kind}</b>
        <small>
          {example ? 'Example' : shortDate(mock.started_at)} · {minutesText(mock.duration_minutes)}
          {running ? ' · in progress, tap to resume' : null}
          {mock.overall && !running ? ` · ${mock.overall.answered}/${mock.overall.questions} answered` : null}
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

/** A made-up finished mock, shown faded before the first one so the list's shape is clear. */
const EXAMPLE: MockSummary = {
  mock_id: 'example',
  status: 'submitted',
  preset: 'utme',
  started_at: new Date().toISOString(),
  duration_minutes: 67,
  auto_submitted: false,
  integrity_flags: 0,
  overall: { questions: 100, answered: 92, correct: 55, wrong: 37, unanswered: 8, percent: 60 },
  subjects: [
    {
      subject_id: 'a',
      name: 'Use of English',
      tally: { questions: 60, answered: 56, correct: 36, wrong: 20, unanswered: 4, percent: 64 },
    },
    {
      subject_id: 'b',
      name: 'Mathematics',
      tally: { questions: 40, answered: 36, correct: 19, wrong: 17, unanswered: 4, percent: 53 },
    },
  ],
} as unknown as MockSummary;

export function MockHub() {
  usePageTitle('Mock exam');
  const student = useStudent();
  const history = useLoad(() => mockApi.history(student.studentId), [student.studentId]);
  const mocks = history.data ?? [];
  const paged = usePaged(mocks, 8);
  const running = mocks.find((m) => m.status === 'in_progress');

  // Scored mocks, oldest first: the best, the average, and the change since the first.
  const done = mocks
    .filter((m) => m.overall && m.overall.percent !== null)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const scores = done.map((m) => m.overall!.percent!);
  const best = scores.length ? Math.max(...scores) : null;
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const moved = scores.length > 1 ? scores[scores.length - 1]! - scores[0]! : null;

  return (
    <div className="sj-page mk-page">
      <PageHero
        eyebrow="Mock exam"
        title="Sit a real test"
        sub="Practice under exam conditions: a JAMB-style computer-based test, timed and full screen, with no help until it’s over. Your predicted score comes from your check-ups, not from mocks."
        actions={
          running ? (
            <Button to={`/mock/${running.mock_id}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
              Resume your mock
            </Button>
          ) : (
            <Button to="/mock/new" tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
              Set up a mock
            </Button>
          )
        }
        aside={
          best !== null ? (
            <div className="mk-hero-stat">
              <span className="sj-num">{best}%</span>
              <small>your best overall</small>
              {scores.length > 1 ? (
                <p className="mk-hero-line">
                  Average <b>{average}%</b> over {scores.length} mocks
                  {moved !== null && moved !== 0 ? (
                    <span className={cx('mk-hero-move', moved > 0 ? 'up' : 'down')}>
                      {moved > 0 ? '▲' : '▼'} {Math.abs(moved)} since your first
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <section className="mk-section">
        <h2 className="sj-display sj-h3 mk-section-title" id="mk-history">
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
          <div className="mk-first">
            <p className="mk-first-text">
              <b>No mock exams yet.</b> Each one you sit is listed here like this, and opens to its full report.
            </p>
            <ul className="mk-list">
              <HistoryRow mock={EXAMPLE} example />
            </ul>
          </div>
        ) : (
          <>
            <ul className="mk-list">
              {paged.items.map((mock) => (
                <HistoryRow key={mock.mock_id} mock={mock} />
              ))}
            </ul>
            <Pager paged={paged} noun="mock exams" label="Pages of mock exams" anchorId="mk-history" />
          </>
        )}
      </section>

      <section className="mk-section">
        <h2 className="sj-display sj-h3 mk-section-title">How it works</h2>
        <Steps steps={STEPS} />
      </section>
    </div>
  );
}
