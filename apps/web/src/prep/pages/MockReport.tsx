/**
 * /mock/:mockId/report — how a mock went: overall and per subject as right ÷ answered, with
 * the unanswered counted apart (never as wrong); how the time was used; the integrity log
 * (full screen left, tabs switched); then every question with the student's answer and the key.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { api, type NarratedLesson } from '../../student/api.js';
import { IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconPlay } from '../icons.js';
import {
  clock,
  mockApi,
  percentText,
  type EventKind,
  type MockReport as Report,
  type SubjectResult,
  type Tally,
} from '../mockApi.js';
import { orGone } from '../runsApi.js';
import { useLoad, usePageTitle } from '../store.js';
import { Button, Empty, PageHero, Skeleton, cx } from '../ui.js';
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

/** One subject (or the total) as a row: name, a right/wrong/unanswered bar, counts, score. */
function ResultRow({ name, tally, total }: { name: string; tally: Tally; total?: boolean }) {
  const width = (n: number) => `${tally.questions ? (100 * n) / tally.questions : 0}%`;
  return (
    <li className={cx('mk-res', total && 'total')}>
      <span className="mk-res-name">{name}</span>
      <span
        className="mk-bar"
        role="img"
        aria-label={`${tally.correct} right, ${tally.wrong} wrong, ${tally.unanswered} unanswered`}
      >
        <span className="right" style={{ width: width(tally.correct) }} />
        <span className="wrong" style={{ width: width(tally.wrong) }} />
      </span>
      <span className="mk-res-counts">
        <b>{tally.correct}</b> right of <b>{tally.answered}</b> answered
        {tally.unanswered ? <span className="mk-res-left"> · {tally.unanswered} unanswered</span> : null}
      </span>
      <span className={cx('mk-res-pct sj-num', tally.percent === null && 'none')}>
        {tally.percent === null ? 'No answers' : percentText(tally)}
      </span>
    </li>
  );
}

/** The whole result in one card that grows with the subjects sat, never a grid of half-empty boxes. */
function ResultCard({ report }: { report: Report }) {
  const o = report.overall;
  const many = report.subjects.length > 1;
  return (
    <div className="sj-card mk-result">
      <ul className="mk-result-stats">
        <li>
          <b className="sj-num">{o.questions}</b>
          <small>questions</small>
        </li>
        <li className="right">
          <b className="sj-num">{o.correct}</b>
          <small>right</small>
        </li>
        <li className="wrong">
          <b className="sj-num">{o.wrong}</b>
          <small>wrong</small>
        </li>
        <li className="left">
          <b className="sj-num">{o.unanswered}</b>
          <small>unanswered</small>
        </li>
      </ul>
      <ul className="mk-rows">
        {report.subjects.map((subject) => (
          <ResultRow key={subject.subject_id} name={subject.name} tally={subject.tally} />
        ))}
        {many ? <ResultRow name="All subjects" tally={o} total /> : null}
      </ul>
      <p className="mk-result-foot">
        <span className="key right" /> Right <span className="key wrong" /> Wrong <span className="key left" />{' '}
        Unanswered
        <span className="mk-result-rule">Score = right ÷ answered. Questions you left are unanswered, not wrong.</span>
      </p>
    </div>
  );
}

/** The board is a large module and only a lesson needs it, so it loads when first opened. */
const Board = lazy(() =>
  import('../../student/Board.js').then((module) => ({
    default: module.Board,
  })),
);

const OUTCOME_WORD = {
  right: 'Right',
  wrong: 'Wrong',
  unanswered: 'Not answered',
} as const;

/** One subject's questions as a grid of numbered cells, coloured by how each went. */
function QuestionGrid({ subject, onOpen }: { subject: SubjectResult; onOpen: (index: number) => void }) {
  const t = subject.tally;
  return (
    <div className="sj-card mk-qgrid-card">
      <div className="mk-qgrid-head">
        <h3 className="mk-qgrid-title">{subject.name}</h3>
        <span className="mk-qgrid-sum">
          <b>{t.correct}</b> right · <b>{t.wrong}</b> wrong · <b>{t.unanswered}</b> not answered
        </span>
      </div>
      <ol className="mk-qgrid">
        {subject.items.map((item, index) => (
          <li key={item.question_version_id}>
            <button
              type="button"
              className={cx('mk-qcell', item.outcome, item.flagged && 'flagged')}
              onClick={() => onOpen(index)}
              aria-label={`Question ${item.position}: ${OUTCOME_WORD[item.outcome]}${item.flagged ? ', flagged' : ''}`}
            >
              {item.position}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One question, opened from the grid: what was chosen, the right answer, why, and the working,
 * with the lesson a tap away and ← → to move through the whole paper.
 */
function QuestionModal({
  subjects,
  at,
  onMove,
  onClose,
}: {
  subjects: SubjectResult[];
  at: { s: number; i: number };
  onMove: (next: { s: number; i: number }) => void;
  onClose: () => void;
}) {
  const subject = subjects[at.s]!;
  const item = subject.items[at.i]!;
  const flat = subjects.flatMap((s, si) => s.items.map((_, ii) => ({ s: si, i: ii })));
  const here = flat.findIndex((p) => p.s === at.s && p.i === at.i);
  const prev = here > 0 ? flat[here - 1] : null;
  const next = here < flat.length - 1 ? flat[here + 1] : null;
  const [lesson, setLesson] = useState<NarratedLesson | 'loading' | 'none' | null>(null);
  const [canHear, setCanHear] = useState(false);

  useEffect(() => {
    setLesson(null);
  }, [item.question_version_id]);
  useEffect(() => {
    api
      .features()
      .then((features) => setCanHear(features.coach_voice))
      .catch(() => setCanHear(false));
  }, []);
  useEffect(() => {
    if (lesson && lesson !== 'none') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && prev) onMove(prev);
      else if (event.key === 'ArrowRight' && next) onMove(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onMove, onClose, lesson]);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const openLesson = () => {
    setLesson('loading');
    api
      .practiceLesson(subject.session_id, item.question_version_id)
      .then(setLesson)
      .catch(() => setLesson('none'));
  };

  if (lesson && lesson !== 'none' && lesson !== 'loading') {
    const correct = item.options.find((option) => option.option_key === item.correct_option_key);
    return createPortal(
      <div className="sj mk-lesson-layer">
        <Suspense fallback={<div className="mk-modal-veil" />}>
          <Board
            title={`${subject.name} · Q${item.position}`}
            subtitle="The working"
            question={item.stem}
            figures={item.figures}
            passage={item.passage_body ? { title: item.passage_title, body: item.passage_body } : null}
            answerText={correct?.body ?? null}
            steps={lesson.beats.flatMap((beat) => beat.write)}
            loadLesson={canHear ? () => Promise.resolve(lesson) : undefined}
            answerLine={`The answer is ${item.correct_option_key ?? ''}.`}
            onAsk={(asked, stepIndex, handlers) =>
              api.practiceAskStreaming(subject.session_id, item.question_version_id, asked, stepIndex, handlers)
            }
            onDone={() => setLesson(null)}
          />
        </Suspense>
      </div>,
      document.body,
    );
  }

  const chosen = item.options.find((option) => option.option_key === item.selected_option_key);
  // Above the whole app, sidebar and phone tab bar included, as the app's own dialogs are.
  return createPortal(
    <div className="sj">
      <div className="mk-modal-veil" onClick={onClose}>
        <div
          className="mk-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${subject.name}, question ${item.position}`}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="mk-modal-head">
            <span className="mk-modal-where">
              {subject.name} · <b>Q{item.position}</b> of {subject.items.length}
            </span>
            <span className={cx('mk-outcome', item.outcome)}>
              {item.outcome === 'right' ? (
                <IconCheck size={14} />
              ) : item.outcome === 'wrong' ? (
                <IconClose size={14} />
              ) : null}
              {OUTCOME_WORD[item.outcome]}
            </span>
            {item.flagged ? <span className="mk-review-flag">Flagged</span> : null}
            <button type="button" className="mk-modal-close" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </header>

          <div className="mk-modal-body">
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
                const mine = option.option_key === item.selected_option_key;
                return (
                  <div key={option.option_key} className={cx('sj-option', key && 'correct', mine && !key && 'wrong')}>
                    <span className="key">{option.option_key}</span>
                    <span className="body">
                      <Maths text={option.body} />
                    </span>
                    {key ? (
                      <span className="mk-yours sj-mono">Correct</span>
                    ) : mine ? (
                      <span className="mk-yours sj-mono">Your answer</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={cx('mk-why', item.outcome)}>
              <h4>
                {item.outcome === 'right'
                  ? `You got it: ${item.correct_option_key}.`
                  : item.outcome === 'wrong'
                    ? `You chose ${item.selected_option_key}. The answer is ${item.correct_option_key}.`
                    : `You left this one. The answer is ${item.correct_option_key}.`}
              </h4>
              {item.outcome === 'wrong' && chosen?.why ? (
                <p>
                  <b>Why {chosen.option_key} is tempting:</b> <Maths text={chosen.why} />
                </p>
              ) : null}
              {item.solution_steps?.length ? (
                <ol className="mk-steps">
                  {item.solution_steps.map((step, index) => (
                    <li key={index}>
                      <Maths text={step} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </div>

          <footer className="mk-modal-foot">
            <button type="button" className="mk-nav" onClick={() => prev && onMove(prev)} disabled={!prev}>
              <IconChevronLeft size={18} /> <span>Previous</span>
            </button>
            <Button tone="lime" icon={<IconPlay size={16} />} busy={lesson === 'loading'} onClick={openLesson}>
              Watch the lesson
            </Button>
            <button type="button" className="mk-nav" onClick={() => next && onMove(next)} disabled={!next}>
              <span>Next</span> <IconChevronRight size={18} />
            </button>
          </footer>
          {lesson === 'none' ? (
            <p className="mk-modal-note">The lesson couldn’t load just now. Try again in a moment.</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Review({ subjects }: { subjects: SubjectResult[] }) {
  const [open, setOpen] = useState<{ s: number; i: number } | null>(null);
  return (
    <section className="mk-section" id="mk-review">
      <div className="mk-review-top">
        <h2 className="sj-display sj-h3 mk-section-title">Every question</h2>
        <p className="mk-review-key">
          <span className="mk-qcell sample right">1</span> Right <span className="mk-qcell sample wrong">2</span> Wrong{' '}
          <span className="mk-qcell sample unanswered">3</span> Not answered{' '}
          <span className="mk-qcell sample unanswered flagged">4</span> Flagged
        </p>
      </div>
      <p className="sj-small sj-muted mk-review-tip">Tap a number to see the answer, why, and the lesson.</p>
      <div className="mk-qgrids">
        {subjects.map((subject, s) => (
          <QuestionGrid key={subject.subject_id} subject={subject} onOpen={(i) => setOpen({ s, i })} />
        ))}
      </div>
      {open ? <QuestionModal subjects={subjects} at={open} onMove={setOpen} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/**
 * How the test was sat, in one slim card: a badge that says clean or how much was recorded,
 * chips only for what actually happened, and the timeline behind a toggle.
 */
function IntegrityPanel({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const i = report.integrity;
  const shown = i.events.filter(
    (e) => e.kind !== 'window_focus' && e.kind !== 'tab_visible' && e.kind !== 'fullscreen_enter',
  );
  const clean = shown.length === 0;
  const started = new Date(report.started_at).getTime();
  const blocked = i.copy_blocked + i.paste_blocked + i.menu_blocked;
  const chips = [
    {
      n: i.fullscreen_exits,
      one: 'Left full screen once',
      many: `Left full screen ${i.fullscreen_exits} times`,
    },
    {
      n: i.tab_switches,
      one: 'Switched tab once',
      many: `Switched tab ${i.tab_switches} times`,
    },
    {
      n: i.window_blurs,
      one: 'Left the window once',
      many: `Left the window ${i.window_blurs} times`,
    },
    {
      n: blocked,
      one: 'Tried to copy or paste once',
      many: `Tried to copy or paste ${blocked} times`,
    },
  ].filter((chip) => chip.n > 0);
  return (
    <div className={cx('sj-card mk-cond', clean && 'clean')}>
      <div className="mk-cond-head">
        <h3 className="mk-cond-title">Test conditions</h3>
        <span className={cx('mk-cond-badge', clean ? 'ok' : 'warn')}>
          {clean ? 'Clean' : `${shown.length} thing${shown.length === 1 ? '' : 's'} recorded`}
        </span>
        {clean ? (
          <span className="mk-cond-note">You stayed in the test the whole time.</span>
        ) : (
          <ul className="mk-cond-chips">
            {chips.map((chip) => (
              <li key={chip.many}>{chip.n === 1 ? chip.one : chip.many}</li>
            ))}
          </ul>
        )}
        {clean ? null : (
          <button type="button" className="mk-cond-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide times' : 'When it happened'}
          </button>
        )}
      </div>
      {open && !clean ? (
        <ol className="mk-cond-times">
          {shown.map((event, index) => (
            <li key={index}>
              <span className="sj-mono">{clock((new Date(event.at).getTime() - started) / 1000)}</span>
              {EVENT_WORDS[event.kind]}
            </li>
          ))}
        </ol>
      ) : null}
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
      <div className="sj-page mk-page">
        <Skeleton height={220} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (loaded.error) {
    return (
      <div className="sj-page mk-page">
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
      <div className="sj-page mk-page">
        <Empty
          icon={<IconClose size={24} />}
          title="This mock isn’t here"
          action={<Button to="/mock">Mock exams</Button>}
        >
          It doesn’t exist, or it was deleted.
        </Empty>
      </div>
    );
  }

  const used = Math.min(report.time_used_seconds, report.duration_minutes * 60);
  return (
    <div className="sj-page mk-page">
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
        <ResultCard report={report} />
      </section>

      <section className="mk-section">
        <IntegrityPanel report={report} />
      </section>

      <Review subjects={report.subjects} />
    </div>
  );
}
