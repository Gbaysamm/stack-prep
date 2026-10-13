/**
 * /mock — the mock exam's home: start one (or resume the one running), and every mock sat,
 * newest first, each with its result and its report. A mock can be deleted from this list the
 * way a practice run can: hidden, not erased, so its answers still count.
 */

import { useState } from 'react';

import { IconArrowRight, IconClock, IconClose } from '../icons.js';
import { mockApi, minutesText, percentText, type MockSummary } from '../mockApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, Empty, PageHero, Pager, Skeleton, Steps, cx, usePaged, useToast } from '../ui.js';
import './Mock.css';

const STEPS = [
  { title: 'Set it up', body: 'Up to four subjects, how many questions each, and how long. Or take the Real UTME: JAMB’s layout and pace, 180 questions in 2 hours for four subjects.' },
  { title: 'Sit it, start to finish', body: 'Full screen, no hints and no coach. A calculator when you need one. At 0:00 it hands itself in.' },
  { title: 'See where you stand', body: 'Your score in each subject and overall, every question with its answer, and the questions you left.' },
];

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function HistoryRow({ mock, onDelete }: { mock: MockSummary; onDelete: () => void }) {
  const running = mock.status === 'in_progress';
  return (
    <li className="mk-row sj-card">
      <div className="mk-row-main">
        <div className="mk-row-top">
          <span className="sj-eyebrow">{mock.preset === 'utme' ? 'Real UTME' : 'Custom mock'}</span>
          <span className="mk-row-date">{dateLabel(mock.started_at)}</span>
        </div>
        <div className="mk-row-subjects">
          {running ? (
            <span className="sj-badge yellow">
              <span className="dot" />
              Running
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
              {mock.overall.unanswered ? ` · ${mock.overall.unanswered} unanswered` : ''}
            </span>
          ) : null}
          {mock.auto_submitted ? <span>Time ran out</span> : null}
          {mock.integrity_flags ? (
            <span className="mk-flagged">
              Left the test {mock.integrity_flags} {mock.integrity_flags === 1 ? 'time' : 'times'}
            </span>
          ) : null}
        </div>
      </div>
      <div className={cx('mk-row-score', running && 'muted')}>
        <span className="sj-num">{running ? '—' : percentText(mock.overall)}</span>
        <small>{running ? 'in progress' : 'overall'}</small>
      </div>
      <div className="mk-row-actions">
        {running ? (
          <Button to={`/mock/${mock.mock_id}`} size="sm" trailing={<IconArrowRight size={16} />}>
            Resume
          </Button>
        ) : (
          <Button to={`/mock/${mock.mock_id}/report`} size="sm" tone="soft" trailing={<IconArrowRight size={16} />}>
            Report
          </Button>
        )}
        <button type="button" className="mk-delete" aria-label="Delete this mock" title="Delete" onClick={onDelete}>
          <IconClose size={18} />
        </button>
      </div>
    </li>
  );
}

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

  const done = mocks.filter((m) => m.overall && m.overall.percent !== null);
  const best = done.length ? Math.max(...done.map((m) => m.overall!.percent!)) : null;

  return (
    <div className="sj-page mk-page">
      <PageHero
        eyebrow="Mock exam"
        title="Sit a real test"
        sub="A JAMB-style computer-based test: timed, full screen, nothing to help you until it’s over."
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
            </div>
          ) : undefined
        }
      />

      <section className="mk-section">
        <h2 className="sj-display sj-h3 mk-section-title" id="mk-history">Your mock exams</h2>
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
          <Empty
            icon={<IconClock size={26} />}
            title="No mock exams yet"
            action={
              <Button to="/mock/new" trailing={<IconArrowRight size={18} />}>
                Set up your first mock
              </Button>
            }
          >
            When you sit one, it’s listed here with its score and the full report.
          </Empty>
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
