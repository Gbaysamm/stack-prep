/**
 * /mock — the mock exam's home: start one (or resume the one running), and every mock sat,
 * newest first, each with its result and its report. A mock can be deleted from this list the
 * way a practice run can: hidden, not erased, so its answers still count.
 */

import { useState } from 'react';

import { Link } from 'react-router-dom';

import { IconArrowRight, IconChevronRight } from '../icons.js';
import { mockApi, minutesText, percentText, type MockSummary } from '../mockApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, PageHero, Pager, Skeleton, Steps, cx, usePaged, useToast } from '../ui.js';
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

/** One mock as one clickable card: what it was, how each subject went, and the score. */
function HistoryRow({ mock, onDelete, example }: { mock: MockSummary; onDelete?: () => void; example?: boolean }) {
  const running = mock.status === 'in_progress';
  const href = running ? `/mock/${mock.mock_id}` : `/mock/${mock.mock_id}/report`;
  const kind = mock.preset === 'utme' ? 'Real UTME' : 'Custom mock';
  return (
    <li className={cx('mk-row sj-card', example && 'example')} aria-hidden={example || undefined}>
      <div className="mk-row-link">
        <div className="mk-row-main">
          <div className="mk-row-top">
            {/* The whole card opens it: this link's ::after covers the card. */}
            {example ? (
              <span className="sj-eyebrow">{kind}</span>
            ) : (
              <Link
                className="sj-eyebrow mk-row-open"
                to={href}
                aria-label={`${kind}: ${running ? 'resume' : 'open its report'}`}
              >
                {kind}
              </Link>
            )}
            <span className="mk-row-date">{example ? 'Example' : dateLabel(mock.started_at)}</span>
          </div>
          <div className="mk-row-subjects">
            {running ? (
              <span className="sj-badge yellow">
                <span className="dot" />
                Running, tap to resume
              </span>
            ) : (
              mock.subjects.map((s) => (
                <span key={s.subject_id} className="mk-chip">
                  {s.name} <b>{percentText(s.tally)}</b>
                </span>
              ))
            )}
          </div>
          <div className="mk-row-meta">
            <span>{minutesText(mock.duration_minutes)}</span>
            {mock.overall ? (
              <span>
                {mock.overall.answered}/{mock.overall.questions} answered
              </span>
            ) : null}
            {mock.auto_submitted ? <span>Time ran out</span> : null}
            {mock.integrity_flags ? (
              <span className="mk-flagged">
                Left the test {mock.integrity_flags} {mock.integrity_flags === 1 ? 'time' : 'times'}
              </span>
            ) : null}
            {onDelete ? (
              <button type="button" className="mk-delete" onClick={onDelete}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
        <div className={cx('mk-row-score', running && 'muted')}>
          <span className="sj-num">{running ? '—' : percentText(mock.overall)}</span>
          <small>{running ? 'in progress' : 'overall'}</small>
        </div>
        <IconChevronRight size={20} className="mk-row-go" aria-hidden="true" />
      </div>
    </li>
  );
}

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
  const toast = useToast();
  const history = useLoad(() => mockApi.history(student.studentId), [student.studentId]);
  const [doomed, setDoomed] = useState<MockSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const mocks = history.data ?? [];
  const paged = usePaged(mocks, 8);
  const running = mocks.find((m) => m.status === 'in_progress');

  const remove = async () => {
    if (!doomed) return;
    setDeleting(true);
    try {
      await mockApi.remove(doomed.mock_id);
      toast('Mock deleted');
      history.reload();
    } catch (error) {
      toast((error as Error).message || 'It could not be deleted.');
    } finally {
      setDeleting(false);
      setDoomed(null);
    }
  };

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
                <HistoryRow key={mock.mock_id} mock={mock} onDelete={() => setDoomed(mock)} />
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

      <Dialog
        open={!!doomed}
        onClose={() => setDoomed(null)}
        title="Delete this mock?"
        actions={
          <>
            <Button tone="ghost" onClick={() => setDoomed(null)}>
              Keep it
            </Button>
            <Button tone="danger" busy={deleting} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        {doomed?.status === 'in_progress'
          ? 'It is still running. Deleting it hands it in now and takes it off your list. The answers you gave still count towards your progress.'
          : 'It comes off your list. The answers you gave still count towards your progress.'}
      </Dialog>
    </div>
  );
}
