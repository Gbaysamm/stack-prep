/**
 * /mock/:mockId/report — how a mock went, as insights. The hero is the summary: the overall score
 * (right ÷ every question set, as in the real exam: a skipped question earns nothing), each subject beside it, the counts and
 * the time. Then the test conditions, what to do next, the topics that went
 * wrong, where the time went, the trend across mocks, the topic breakdown, and every question
 * as a grid that opens each one with its answer, the working and the lesson.
 */

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { OptionBody, hasOptionPictures } from '../../OptionBody.js';
import { api, type NarratedLesson } from '../../student/api.js';
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconPlay } from '../icons.js';
import { nextSteps, previousOf, timeStats, trendOf, weakTopics } from '../mock/insights.js';
import { clock, mockApi, type EventKind, type MockReport as Report, type SubjectResult } from '../mockApi.js';
import { orGone } from '../runsApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, Empty, cx, useToast, HeroSkeleton, Skeleton } from '../ui.js';
import { NextSteps, Section, SummaryHero, TimeInsights, TopicBreakdown, Trend, WeakAreas } from './MockInsights.js';
import './Mock.css';
import './MockInsights.css';
import { friendly } from '../../lib/friendlyError.js';
import { QuestionTools } from '../QuestionTools.js';
import { VoiceLocked, usePremium } from '../premium.js';

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
  const { voice: premiumVoice, coach: premiumCoach } = usePremium();

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
            loadLesson={canHear && premiumVoice ? () => Promise.resolve(lesson) : undefined}
            askLocked={premiumCoach ? undefined : <VoiceLocked />}
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
            <span className="mk-modal-tools">
              <QuestionTools versionId={item.question_version_id} where="review" />
              <button type="button" className="mk-modal-close" onClick={onClose} aria-label="Close">
                <IconClose size={18} />
              </button>
            </span>
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

            <div className={cx('sj-options mk-review-options', hasOptionPictures(item.options) && 'sp-pic-options')}>
              {item.options.map((option) => {
                const key = option.option_key === item.correct_option_key;
                const mine = option.option_key === item.selected_option_key;
                return (
                  <div key={option.option_key} className={cx('sj-option', key && 'correct', mine && !key && 'wrong')}>
                    <span className="key">{option.option_key}</span>
                    <span className="body">
                      <OptionBody body={option.body} figure={option.figure} />
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

function Review({ subjects, onOpen }: { subjects: SubjectResult[]; onOpen: (at: At) => void }) {
  return (
    <Section
      id="mk-review"
      title="Every question"
      note={
        <span className="mk-review-key mi-key">
          <span>
            <span className="mk-qcell sample right">1</span> Right
          </span>
          <span>
            <span className="mk-qcell sample wrong">2</span> Wrong
          </span>
          <span>
            <span className="mk-qcell sample unanswered">3</span> Not answered
          </span>
          <span>
            <span className="mk-qcell sample unanswered flagged">4</span> Flagged
          </span>
        </span>
      }
    >
      <p className="sj-small sj-muted mk-review-tip">Tap a number to see the answer, why, and the lesson.</p>
      <div className="mk-qgrids">
        {subjects.map((subject, s) => (
          <QuestionGrid key={subject.subject_id} subject={subject} onOpen={(i) => onOpen({ s, i })} />
        ))}
      </div>
    </Section>
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
      <div className="sj-page mk-page" aria-busy="true">
        <HeroSkeleton />
        <Skeleton height={200} radius={10} />
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

  return <Insights report={report} />;
}

type At = { s: number; i: number };

function Insights({ report }: { report: Report }) {
  const student = useStudent();
  const history = useLoad(() => mockApi.history(student.studentId), [student.studentId, report.mock_id]);
  const [open, setOpen] = useState<At | null>(null);
  const time = useMemo(() => timeStats(report), [report]);
  const weak = useMemo(() => weakTopics(report), [report]);
  const previous = history.data ? previousOf(history.data, report) : null;
  const points = history.data ? trendOf(history.data, report) : [];
  const steps = nextSteps(report, time, weak, previous);
  const answered = report.overall.answered > 0;
  const many = report.subjects.length > 1;

  return (
    <div className="sj-page mk-page mi-page">
      <SummaryHero report={report} previous={previous} time={time} />

      <IntegrityPanel report={report} />

      <NextSteps steps={steps} />

      {answered ? (
        <Section
          id="mi-weak"
          title="Topics to work on"
          note={weak.length ? 'The topics with the most wrong answers in this mock.' : undefined}
        >
          {weak.length ? (
            <WeakAreas weak={weak} many={many} />
          ) : (
            <div className="sj-card mi-clear">
              <IconCheck size={18} />
              <p>No wrong answers in this mock, so no topic needs fixing. Well done.</p>
            </div>
          )}
        </Section>
      ) : null}

      <Section
        id="mi-time"
        title="Your time"
        note={time.recorded ? 'Time each question was open on screen, added up across visits.' : undefined}
      >
        <TimeInsights report={report} time={time} onOpen={setOpen} />
      </Section>

      {history.data ? (
        <Section id="mi-trend" title="Your progress">
          <Trend report={report} points={points} previous={previous} />
        </Section>
      ) : null}

      {answered ? (
        <Section id="mi-topics" title="Topic by topic" note="Every topic this mock tested, weakest first.">
          <TopicBreakdown report={report} />
        </Section>
      ) : null}

      <Review subjects={report.subjects} onOpen={setOpen} />

      {open ? (
        <QuestionModal subjects={report.subjects} at={open} onMove={setOpen} onClose={() => setOpen(null)} />
      ) : null}

      <DeleteMock mockId={report.mock_id} />
    </div>
  );
}

/** Deleting a mock, kept quietly at the foot of its report rather than on the list. */
function DeleteMock({ mockId }: { mockId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await mockApi.remove(mockId);
      toast('Mock deleted');
      navigate('/mock');
    } catch (error) {
      toast(friendly(error) || 'It could not be deleted.');
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <div className="mk-foot">
      <button type="button" className="mk-delete" onClick={() => setAsking(true)}>
        Delete this mock
      </button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Delete this mock?"
        actions={
          <>
            <Button tone="ghost" onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button tone="danger" busy={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        It comes off your list. The answers you gave still count towards your progress.
      </Dialog>
    </div>
  );
}
