/**
 * /mock/:mockId/report — how a mock went: overall and per subject as right ÷ answered, with
 * the unanswered counted apart (never as wrong); how the time was used; the integrity log
 * (full screen left, tabs switched); then every question with the student's answer and the key.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { IconArrowRight, IconCheck, IconClose } from '../icons.js';
import { clock, mockApi, percentText, type EventKind, type MockReport as Report, type ReportItem, type SubjectResult, type Tally } from '../mockApi.js';
import { orGone } from '../runsApi.js';
import { useLoad, usePageTitle } from '../store.js';
import { Button, Empty, PageHero, Pager, Skeleton, cx, usePaged } from '../ui.js';
import { dateLabel } from './MockHub.js';
import './Mock.css';

const EVENT_WORDS: Record<EventKind, string> = {
  fullscreen_enter: 'Entered full screen',
  fullscreen_exit: 'Left full screen',
  tab_hidden: 'Switched away from the tab',
  tab_visible: 'Came back to the tab',
  window_blur: 'Window lost focus',
  window_focus: 'Window back in focus',
  copy_blocked: 'Tried to copy (blocked)',
  paste_blocked: 'Tried to paste (blocked)',
  menu_blocked: 'Opened the right-click menu (blocked)',
};

type Filter = 'all' | 'wrong' | 'unanswered' | 'flagged';

function TallyLine({ tally }: { tally: Tally }) {
  return (
    <p className="mk-tally">
      <b>{tally.correct}</b> right of <b>{tally.answered}</b> answered
      {tally.unanswered ? (
        <>
          {' '}
          · <b>{tally.unanswered}</b> unanswered
        </>
      ) : null}
    </p>
  );
}

function SubjectCard({ subject }: { subject: SubjectResult }) {
  const t = subject.tally;
  const width = (n: number) => `${t.questions ? (100 * n) / t.questions : 0}%`;
  return (
    <div className="sj-card mk-subcard">
      <div className="mk-subcard-head">
        <h3 className="sj-display sj-h3">{subject.name}</h3>
        <span className="sj-num mk-subcard-pct">{percentText(t)}</span>
      </div>
      <div className="mk-bar" aria-hidden="true">
        <span className="right" style={{ width: width(t.correct) }} />
        <span className="wrong" style={{ width: width(t.wrong) }} />
      </div>
      <TallyLine tally={t} />
    </div>
  );
}

function ReviewItem({ item }: { item: ReportItem }) {
  return (
    <li className={cx('mk-review', item.outcome)}>
      <header className="mk-review-head">
        <span className="sj-mono mk-review-no">Q{item.position}</span>
        <span className={cx('mk-outcome', item.outcome)}>
          {item.outcome === 'right' ? <IconCheck size={14} /> : item.outcome === 'wrong' ? <IconClose size={14} /> : null}
          {item.outcome === 'right' ? 'Right' : item.outcome === 'wrong' ? 'Wrong' : 'Unanswered'}
        </span>
        {item.flagged ? <span className="mk-review-flag">Flagged</span> : null}
      </header>
      {item.passage_body ? (
        <details className="mk-review-passage">
          <summary>{item.passage_title ?? 'The passage'}</summary>
          <Maths text={item.passage_body} />
        </details>
      ) : null}
      {item.instructions ? (
        <p className="mx-instructions">
          <Maths text={item.instructions} />
        </p>
      ) : null}
      <div className="mk-review-stem">
        <Maths text={item.stem} />
      </div>
      {item.figures.length ? <Figures figures={item.figures} compact /> : null}
      <div className="sj-options mk-review-options">
        {item.options.map((option) => {
          const key = option.option_key === item.correct_option_key;
          const chosen = option.option_key === item.selected_option_key;
          return (
            <div key={option.option_key} className={cx('sj-option', key && 'correct', chosen && !key && 'wrong')}>
              <span className="key">{option.option_key}</span>
              <span className="body">
                <Maths text={option.body} />
              </span>
              {chosen ? <span className="mk-yours sj-mono">Your answer</span> : null}
            </div>
          );
        })}
      </div>
    </li>
  );
}

function Review({ subjects }: { subjects: SubjectResult[] }) {
  const [tab, setTab] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const subject = subjects[tab] ?? subjects[0]!;
  const items = subject.items.filter((item) =>
    filter === 'all' ? true : filter === 'flagged' ? item.flagged : item.outcome === filter,
  );
  const paged = usePaged(items, 10, `${tab}-${filter}`);
  const counts: Record<Filter, number> = {
    all: subject.items.length,
    wrong: subject.items.filter((i) => i.outcome === 'wrong').length,
    unanswered: subject.items.filter((i) => i.outcome === 'unanswered').length,
    flagged: subject.items.filter((i) => i.flagged).length,
  };
  return (
    <section className="mk-section" id="mk-review">
      <h2 className="sj-display sj-h3 mk-section-title">Every question</h2>
      {subjects.length > 1 ? (
        <div className="mk-seg mk-review-tabs" role="tablist" aria-label="Subject">
          {subjects.map((s, index) => (
            <button key={s.subject_id} type="button" role="tab" aria-selected={index === tab} className={cx('mk-seg-btn', index === tab && 'on')} onClick={() => setTab(index)}>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mk-filters" role="radiogroup" aria-label="Show">
        {(['all', 'wrong', 'unanswered', 'flagged'] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={filter === value} className={cx('mk-filter', filter === value && 'on')} onClick={() => setFilter(value)}>
            {value === 'all' ? 'All' : value === 'wrong' ? 'Wrong' : value === 'unanswered' ? 'Unanswered' : 'Flagged'}
            <span className="sj-mono">{counts[value]}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="sj-muted mk-none">None here.</p>
      ) : (
        <>
          <ol className="mk-reviews">
            {paged.items.map((item) => (
              <ReviewItem key={item.question_version_id} item={item} />
            ))}
          </ol>
          <Pager paged={paged} noun="questions" label="Pages of questions" anchorId="mk-review" />
        </>
      )}
    </section>
  );
}

function IntegrityPanel({ report }: { report: Report }) {
  const i = report.integrity;
  const shown = i.events.filter((e) => e.kind !== 'window_focus' && e.kind !== 'tab_visible' && e.kind !== 'fullscreen_enter');
  const clean = shown.length === 0;
  const started = new Date(report.started_at).getTime();
  return (
    <div className={cx('sj-card mk-integrity', clean && 'clean')}>
      <h3 className="sj-display sj-h3">Test conditions</h3>
      {clean ? (
        <p>You stayed in the test the whole time. Nothing was recorded.</p>
      ) : (
        <>
          <ul className="mk-integrity-counts">
            <li>
              <b className="sj-num">{i.fullscreen_exits}</b> left full screen
            </li>
            <li>
              <b className="sj-num">{i.tab_switches}</b> tab switches
            </li>
            <li>
              <b className="sj-num">{i.window_blurs}</b> window switches
            </li>
            <li>
              <b className="sj-num">{i.copy_blocked + i.paste_blocked + i.menu_blocked}</b> blocked copy, paste or menu
            </li>
          </ul>
          <details className="mk-timeline">
            <summary>When it happened</summary>
            <ol>
              {shown.map((event, index) => (
                <li key={index}>
                  <span className="sj-mono">{clock((new Date(event.at).getTime() - started) / 1000)}</span>
                  {EVENT_WORDS[event.kind]}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  );
}

export function MockReport() {
  usePageTitle('Mock report');
  const { mockId = '' } = useParams();
  const loaded = useLoad(() => orGone(mockApi.report(mockId)), [mockId]);
  const report = loaded.data;

  if (loaded.loading && report === undefined) {
    return (
      <div className="mk-page">
        <Skeleton height={220} />
        <div className="mk-subgrid">
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
      </div>
    );
  }
  if (loaded.error) {
    return (
      <div className="mk-page">
        <div className="sj-card mk-error">
          <p>{loaded.error}</p>
          <Button tone="soft" size="sm" onClick={loaded.reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="mk-page">
        <Empty icon={<IconClose size={24} />} title="This mock isn’t here" action={<Button to="/mock">Mock exams</Button>}>
          It doesn’t exist, or it was deleted.
        </Empty>
      </div>
    );
  }

  const used = Math.min(report.time_used_seconds, report.duration_minutes * 60);
  return (
    <div className="mk-page">
      <PageHero
        back={{ to: '/mock', label: 'Mock exams' }}
        eyebrow={`${report.preset === 'utme' ? 'Real UTME' : 'Mock exam'} · ${dateLabel(report.started_at)}`}
        title="Your result"
        sub={
          report.auto_submitted
            ? `Time ran out, so it was handed in for you. You used the full ${clock(report.duration_minutes * 60)}.`
            : `Handed in after ${clock(used)} of ${clock(report.duration_minutes * 60)}.`
        }
        actions={
          <Button to="/mock/new" tone="lime" trailing={<IconArrowRight size={18} />}>
            Sit another
          </Button>
        }
        aside={
          <div className="mk-hero-stat">
            <span className="sj-num">{percentText(report.overall)}</span>
            <small>
              {report.overall.correct} right of {report.overall.answered} answered
            </small>
          </div>
        }
      />

      <section className="mk-section">
        <div className="mk-overall sj-card">
          <div>
            <span className="sj-eyebrow">Overall</span>
            <TallyLine tally={report.overall} />
          </div>
          <ul className="mk-overall-stats">
            <li>
              <b className="sj-num">{report.overall.questions}</b>
              <small>questions</small>
            </li>
            <li>
              <b className="sj-num">{report.overall.correct}</b>
              <small>right</small>
            </li>
            <li>
              <b className="sj-num">{report.overall.wrong}</b>
              <small>wrong</small>
            </li>
            <li>
              <b className="sj-num">{report.overall.unanswered}</b>
              <small>unanswered</small>
            </li>
          </ul>
        </div>
        <div className="mk-subgrid">
          {report.subjects.map((subject) => (
            <SubjectCard key={subject.subject_id} subject={subject} />
          ))}
        </div>
        <p className="sj-small sj-muted mk-footnote">
          Scores are right ÷ answered. Questions you left are counted as unanswered, not wrong.
        </p>
      </section>

      <section className="mk-section">
        <IntegrityPanel report={report} />
      </section>

      <Review subjects={report.subjects} />
    </div>
  );
}
