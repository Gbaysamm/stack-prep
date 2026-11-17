/**
 * /mock/:mockId — the exam room. A JAMB-style CBT screen and nothing else: subject tabs across
 * the top, the question with its options A–D, Previous / Next, the question palette, the timer,
 * the calculator and Submit. No hints, no board, no coach, no navigation.
 *
 * The whole paper arrives at the start, so the room needs the network only to save answers
 * (debounced, a reload resumes) and to report integrity events. The server owns the clock: the
 * timer counts down to the server's deadline, corrected by the server's own time, and at 0:00 the
 * room submits on its own.
 *
 * Keyboard: A–D answers, N / P next and previous, F flags, S opens Submit.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { OptionBody, hasOptionPictures } from '../../OptionBody.js';
import { IconArrowLeft, IconArrowRight, IconClock, IconClose } from '../icons.js';
import { Calculator } from '../mock/Calculator.js';
import {
  clock,
  mockApi,
  type AnswerSave,
  type EventKind,
  type MockPaper,
  type PaperQuestion,
} from '../mockApi.js';
import { NotFound, Refused } from '../runsApi.js';
import { usePageTitle, useStudent } from '../store.js';
import { Button, Dialog, Spinner, cx, Skeleton } from '../ui.js';
import './MockRoom.css';
import { friendly } from '../../lib/friendlyError.js';
import { QuestionTools } from '../QuestionTools.js';

interface Mark {
  choice: string | null;
  flagged: boolean;
  ms: number;
}
type Sheet = Record<string, Mark>;
type SaveState = 'saved' | 'saving' | 'retrying';

/** Wait this long after the last change before saving, so a run of clicks is one request. */
const SAVE_DEBOUNCE_MS = 700;
const EVENT_FLUSH_MS = 4000;
const WARN_SECONDS = 5 * 60;

const fullscreenSupported = () =>
  typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';

function CalcIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" />
    </svg>
  );
}

function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function GridIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

/* ------------------------------------------------------------------ the room */

export function MockRoom() {
  usePageTitle('Mock exam');
  const { mockId = '' } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<MockPaper | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    mockApi
      .paper(mockId)
      .then((loaded) => {
        if (!live) return;
        if (loaded.status === 'submitted') navigate(`/mock/${mockId}/report`, { replace: true });
        else setPaper(loaded);
      })
      .catch((error: Error) => {
        if (!live) return;
        setProblem(error instanceof NotFound ? 'This mock exam does not exist, or it was deleted.' : friendly(error));
      });
    return () => {
      live = false;
    };
  }, [mockId, navigate]);

  if (problem) {
    return (
      <div className="mx-room mx-centre">
        <div className="mx-gate-card">
          <h1 className="sj-display sj-h2">Can’t open this mock</h1>
          <p>{problem}</p>
          <Button to="/mock">Back to mock exams</Button>
        </div>
      </div>
    );
  }
  if (!paper) {
    return (
      <div className="mx-room mx-skel" aria-busy="true" aria-label="Loading your paper">
        <Skeleton height={56} radius={10} />
        <Skeleton height={14} width={180} />
        <Skeleton height={90} radius={10} />
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} height={54} radius={8} />
        ))}
      </div>
    );
  }
  return <Exam paper={paper} />;
}

function Exam({ paper }: { paper: MockPaper }) {
  const student = useStudent();
  const navigate = useNavigate();
  const mockId = paper.mock_id;
  const subjects = paper.subjects;

  /* ---------------------------------------------------------------- the sheet */
  const [sheet, setSheet] = useState<Sheet>(() => {
    const initial: Sheet = {};
    for (const subject of subjects)
      for (const q of subject.questions)
        initial[q.question_version_id] = { choice: q.selected_option_key, flagged: q.flagged, ms: q.response_ms };
    return initial;
  });
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const [subjectIndex, setSubjectIndex] = useState(0);
  const [positions, setPositions] = useState<number[]>(() => subjects.map(() => 0));
  const subject = subjects[subjectIndex]!;
  const questionIndex = positions[subjectIndex] ?? 0;
  const question = subject.questions[questionIndex]!;

  /* ---------------------------------------------------------------- the clock */
  const deadline = useMemo(() => new Date(paper.deadline_at).getTime(), [paper.deadline_at]);
  const offset = useRef(new Date(paper.server_now).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((deadline - (now + offset.current)) / 1000));
  const learnServerTime = (serverNow: string) => {
    offset.current = new Date(serverNow).getTime() - Date.now();
  };

  /* ---------------------------------------------------------------- time on each question */
  // A question's time is how long it was actually on screen, summed across visits. The count
  // runs only while the paper is in view: it pauses while the tab is hidden, while the
  // full-screen gate, the Submit dialog or the palette covers the paper, and once finishing.
  // `openSince` is when the current stretch began, or null while paused.
  const openSince = useRef<number | null>(null);
  const shownId = useRef(question.question_version_id);
  /** Close the current stretch: add it to the shown question. Returns that question, if any. */
  const bankTime = useCallback((): string | null => {
    const since = openSince.current;
    openSince.current = null;
    if (since === null) return null;
    const spent = Math.round(Date.now() - since);
    const id = shownId.current;
    const mark = sheetRef.current[id];
    if (spent <= 0 || !mark) return null;
    sheetRef.current = { ...sheetRef.current, [id]: { ...mark, ms: mark.ms + spent } };
    setSheet((current) => {
      const now = current[id];
      return now ? { ...current, [id]: { ...now, ms: now.ms + spent } } : current;
    });
    return id;
  }, []);

  /** The sheet as it would be saved now, with the open question's running stretch counted in. */
  const entry = useCallback((id: string): AnswerSave => {
    const mark = sheetRef.current[id]!;
    const since = openSince.current;
    const extra = id === shownId.current && since !== null ? Date.now() - since : 0;
    return { question_version_id: id, selected_option_key: mark.choice, flagged: mark.flagged, response_ms: Math.round(mark.ms + extra) };
  }, []);

  /* ---------------------------------------------------------------- saving */
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const dirty = useRef(new Map<string, number>());
  const version = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const [finishing, setFinishing] = useState<false | 'manual' | 'clock'>(false);
  const finishingRef = useRef(finishing);
  finishingRef.current = finishing;

  const goToReport = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    navigate(`/mock/${mockId}/report`, { replace: true });
  }, [mockId, navigate]);

  const flushAnswers = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (saving.current || finishingRef.current || dirty.current.size === 0) return;
    saving.current = true;
    const batch = [...dirty.current.entries()];
    setSaveState('saving');
    try {
      const saved = await mockApi.save(
        mockId,
        batch.map(([id]) => entry(id)),
      );
      learnServerTime(saved.server_now);
      for (const [id, at] of batch) if (dirty.current.get(id) === at) dirty.current.delete(id);
      setSaveState(dirty.current.size ? 'saving' : 'saved');
    } catch (error) {
      if (error instanceof Refused && error.status === 409) {
        // Time is up, or it was submitted elsewhere: the server has the final word.
        saving.current = false;
        goToReport();
        return;
      }
      setSaveState('retrying');
      saveTimer.current = window.setTimeout(() => void flushAnswers(), 3000);
    } finally {
      saving.current = false;
    }
    if (dirty.current.size) saveTimer.current = window.setTimeout(() => void flushAnswers(), SAVE_DEBOUNCE_MS);
  }, [entry, goToReport, mockId]);

  const touch = (id: string, change: Partial<Mark>) => {
    if (finishingRef.current) return;
    setSheet((current) => ({ ...current, [id]: { ...current[id]!, ...change } }));
    version.current += 1;
    dirty.current.set(id, version.current);
    sheetRef.current = { ...sheetRef.current, [id]: { ...sheetRef.current[id]!, ...change } };
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushAnswers(), SAVE_DEBOUNCE_MS);
  };

  /* ---------------------------------------------------------------- integrity */
  const events = useRef<{ kind: EventKind; at_client: string }[]>([]);
  const flushEvents = useCallback(() => {
    if (events.current.length === 0) return;
    const batch = events.current.splice(0, 200);
    mockApi.events(mockId, batch).catch(() => {
      events.current.unshift(...batch);
    });
  }, [mockId]);
  const log = useCallback((kind: EventKind) => {
    if (finishingRef.current) return;
    events.current.push({ kind, at_client: new Date().toISOString() });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(flushEvents, EVENT_FLUSH_MS);
    return () => window.clearInterval(timer);
  }, [flushEvents]);

  const [awayNotice, setAwayNotice] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onVisibility = () => {
      setVisible(document.visibilityState !== 'hidden');
      if (document.visibilityState === 'hidden') {
        log('tab_hidden');
        flushEvents();
        void flushAnswers();
      } else {
        log('tab_visible');
        setAwayNotice(true);
      }
    };
    const onBlur = () => log('window_blur');
    const onFocus = () => log('window_focus');
    const onPageHide = () => {
      flushEvents();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushAnswers, flushEvents, log]);

  useEffect(() => {
    if (!awayNotice) return;
    const timer = window.setTimeout(() => setAwayNotice(false), 6000);
    return () => window.clearTimeout(timer);
  }, [awayNotice]);

  // Leaving mid-test asks first; a reload still resumes, because every answer is saved.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (finishingRef.current) return;
      void flushAnswers();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushAnswers]);

  /* ---------------------------------------------------------------- full screen */
  const canFullscreen = fullscreenSupported();
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement);
  const [exits, setExits] = useState(0);
  const [started, setStarted] = useState(() => !!document.fullscreenElement || !canFullscreen);
  const [refused, setRefused] = useState(false);
  const [skipFullscreen, setSkipFullscreen] = useState(false);
  const [noFullNoticeSeen, setNoFullNoticeSeen] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const full = !!document.fullscreenElement;
      setIsFull(full);
      if (finishingRef.current) return;
      if (full) {
        log('fullscreen_enter');
      } else {
        log('fullscreen_exit');
        setExits((count) => count + 1);
        flushEvents();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [flushEvents, log]);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      setStarted(true);
      setRefused(false);
    } catch {
      setRefused(true);
    }
  };
  const gateOpen = canFullscreen && !isFull && !skipFullscreen && !finishing;

  /* ---------------------------------------------------------------- finishing */
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const finish = useCallback(
    async (how: 'manual' | 'clock') => {
      if (finishingRef.current) return;
      setFinishing(how);
      finishingRef.current = how;
      window.clearTimeout(saveTimer.current);
      flushEvents();
      const all = Object.keys(sheetRef.current).map((id) => entry(id));
      try {
        await mockApi.submit(mockId, all);
        goToReport();
      } catch (error) {
        setFinishing(false);
        finishingRef.current = false;
        setSubmitError(friendly(error) || 'The submission did not go through.');
      }
    },
    [entry, flushEvents, goToReport, mockId],
  );

  useEffect(() => {
    if (secondsLeft <= 0 && !finishingRef.current && !submitError) void finish('clock');
  }, [finish, secondsLeft, submitError]);

  /* ---------------------------------------------------------------- moving about */
  const go = useCallback(
    (toSubject: number, toQuestion: number) => {
      setSubjectIndex(toSubject);
      setPositions((current) => current.map((value, index) => (index === toSubject ? toQuestion : value)));
    },
    [],
  );
  const isLast = questionIndex >= subject.questions.length - 1;
  const hasNextSubject = subjectIndex < subjects.length - 1;
  const next = () => {
    if (!isLast) go(subjectIndex, questionIndex + 1);
    else if (hasNextSubject) go(subjectIndex + 1, positions[subjectIndex + 1] ?? 0);
  };
  const previous = () => {
    if (questionIndex > 0) go(subjectIndex, questionIndex - 1);
  };
  const choose = (key: string) => touch(question.question_version_id, { choice: key });
  const clearChoice = () => touch(question.question_version_id, { choice: null });
  const flag = () => touch(question.question_version_id, { flagged: !sheet[question.question_version_id]!.flagged });

  const [calcOpen, setCalcOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The keyboard, as at a JAMB centre.
  const keysRef = useRef({ next, previous, choose, flag });
  keysRef.current = { next, previous, choose, flag };
  const blocked = gateOpen || confirming || !!finishing || paletteOpen;

  // The question's clock runs while it is open and in view. Each time it stops (the student
  // moves on, the tab hides, a dialog opens) the stretch is added to that question and the new
  // total is saved, so a closed tab or the server's own submission still has the time.
  const timing = visible && !blocked;
  useEffect(() => {
    shownId.current = question.question_version_id;
    if (timing) openSince.current = Date.now();
    return () => {
      const id = bankTime();
      if (id === null || finishingRef.current) return;
      version.current += 1;
      dirty.current.set(id, version.current);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flushAnswers(), SAVE_DEBOUNCE_MS);
    };
  }, [bankTime, flushAnswers, question.question_version_id, timing]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (blocked || event.ctrlKey || event.metaKey || event.altKey) return;
      // A report dialog is open: its keys are its own, not answers.
      if (document.querySelector('.sj-dialog')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.mx-calc') || target?.closest('input, textarea')) return;
      const key = event.key.toLowerCase();
      const letter = key.toUpperCase();
      if (/^[a-e]$/.test(key) && question.options.some((option) => option.option_key === letter)) {
        event.preventDefault();
        keysRef.current.choose(letter);
      } else if (key === 'n' || event.key === 'ArrowRight') {
        event.preventDefault();
        keysRef.current.next();
      } else if (key === 'p' || event.key === 'ArrowLeft') {
        event.preventDefault();
        keysRef.current.previous();
      } else if (key === 'f') {
        event.preventDefault();
        keysRef.current.flag();
      } else if (key === 's') {
        event.preventDefault();
        setConfirming(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, question.options]);

  /* ---------------------------------------------------------------- blocked actions */
  const block = (kind: EventKind) => (event: SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('.mx-calc') && kind !== 'menu_blocked') return;
    event.preventDefault();
    log(kind);
  };

  /* ---------------------------------------------------------------- counts */
  const countsFor = (index: number) => {
    const qs = subjects[index]!.questions;
    let answered = 0;
    let flagged = 0;
    for (const q of qs) {
      const mark = sheet[q.question_version_id]!;
      if (mark.choice) answered += 1;
      if (mark.flagged) flagged += 1;
    }
    return { total: qs.length, answered, flagged };
  };
  const totals = subjects.map((_, index) => countsFor(index));
  const overall = totals.reduce(
    (sum, t) => ({ total: sum.total + t.total, answered: sum.answered + t.answered, flagged: sum.flagged + t.flagged }),
    { total: 0, answered: 0, flagged: 0 },
  );

  const mark = sheet[question.question_version_id]!;
  const low = secondsLeft <= WARN_SECONDS;

  const palette = (
    <Palette
      questions={subject.questions}
      sheet={sheet}
      current={questionIndex}
      counts={totals[subjectIndex]!}
      onPick={(index) => {
        go(subjectIndex, index);
        setPaletteOpen(false);
      }}
    />
  );

  return (
    <div
      className="mx-room"
      onCopy={block('copy_blocked')}
      onCut={block('copy_blocked')}
      onPaste={block('paste_blocked')}
      onContextMenu={block('menu_blocked')}
      onDragStart={(event) => event.preventDefault()}
    >
      <header className="mx-bar">
        <div className="mx-bar-who">
          <img src="/brand/mark-96.png" alt="" width={34} height={34} />
          <div>
            <span className="mx-bar-eyebrow sj-mono">{paper.preset === 'utme' ? 'Scheduled mock' : 'Custom mock'}</span>
            <strong>{student.displayName}</strong>
          </div>
        </div>
        <div className={cx('mx-timer', low && 'low', secondsLeft <= 60 && 'last')} role="timer" aria-live="off" aria-label={`Time left ${clock(secondsLeft)}`}>
          <IconClock size={18} />
          <span className="sj-mono">{clock(secondsLeft)}</span>
        </div>
        <div className="mx-bar-actions">
          <span className={cx('mx-save', saveState)} aria-live="polite">
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Offline, retrying'}
          </span>
          <button type="button" className={cx('mx-barbtn', calcOpen && 'on')} onClick={() => setCalcOpen((open) => !open)} aria-pressed={calcOpen}>
            <CalcIcon />
            <span>Calculator</span>
          </button>
          <button type="button" className="mx-barbtn submit" onClick={() => setConfirming(true)}>
            <span>Submit</span>
          </button>
        </div>
      </header>

      <nav className="mx-tabs" role="tablist" aria-label="Subjects">
        {subjects.map((s, index) => (
          <button
            key={s.subject_id}
            type="button"
            role="tab"
            aria-selected={index === subjectIndex}
            className={cx('mx-tab', index === subjectIndex && 'on')}
            onClick={() => go(index, positions[index] ?? 0)}
          >
            <span className="name">{s.name}</span>
            <span className="count sj-mono">
              {totals[index]!.answered}/{totals[index]!.total}
            </span>
          </button>
        ))}
      </nav>

      {awayNotice ? (
        <div className="mx-notice" role="status">
          You left the test window. That has been recorded.
          <button type="button" aria-label="Dismiss" onClick={() => setAwayNotice(false)}>
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      <div className="mx-body">
        <main className="mx-main">
          <QuestionCard
            mockId={mockId}
            question={question}
            number={questionIndex + 1}
            total={subject.questions.length}
            subjectName={subject.name}
            choice={mark.choice}
            flagged={mark.flagged}
            onChoose={choose}
            onClear={clearChoice}
          />
          <div className="mx-nav">
            <Button tone="ghost" onClick={previous} disabled={questionIndex === 0} icon={<IconArrowLeft size={18} />}>
              <span className="lbl">Previous</span>
            </Button>
            <button type="button" className={cx('mx-flag', mark.flagged && 'on')} onClick={flag} aria-pressed={mark.flagged}>
              <FlagIcon />
              <span className="lbl">{mark.flagged ? 'Flagged' : 'Flag'}</span>
            </button>
            <button type="button" className="mx-paletteBtn" onClick={() => setPaletteOpen(true)}>
              <GridIcon />
              <span className="sj-mono">
                {questionIndex + 1}/{subject.questions.length}
              </span>
            </button>
            {isLast && hasNextSubject ? (
              <Button onClick={next} trailing={<IconArrowRight size={18} />}>
                <span className="lbl">{subjects[subjectIndex + 1]!.name}</span>
              </Button>
            ) : (
              <Button onClick={next} disabled={isLast} trailing={<IconArrowRight size={18} />}>
                <span className="lbl">Next</span>
              </Button>
            )}
          </div>
          <p className="mx-keys" aria-hidden="true">
            <kbd>A</kbd>–<kbd>{question.options[question.options.length - 1]?.option_key ?? 'D'}</kbd> answer
            <kbd>N</kbd> next <kbd>P</kbd> previous <kbd>F</kbd> flag <kbd>S</kbd> submit
          </p>
        </main>
        <aside className="mx-side" aria-label="Question palette">
          {palette}
        </aside>
      </div>

      {calcOpen ? <Calculator onClose={() => setCalcOpen(false)} /> : null}

      {paletteOpen ? (
        <div className="mx-sheetwrap" onMouseDown={(event) => event.target === event.currentTarget && setPaletteOpen(false)}>
          <div className="mx-sheet" role="dialog" aria-label="Question palette">
            <div className="mx-sheet-head">
              <strong>{subject.name}</strong>
              <button type="button" className="mx-calc-close" aria-label="Close" onClick={() => setPaletteOpen(false)}>
                <IconClose size={18} />
              </button>
            </div>
            {palette}
          </div>
        </div>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit your test?"
        actions={
          <>
            <Button tone="ghost" onClick={() => setConfirming(false)}>
              Keep going
            </Button>
            <Button tone="dark" onClick={() => void finish('manual')} busy={finishing === 'manual'}>
              Submit now
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 12 }}>
          You have answered {overall.answered} of {overall.total}.
          {overall.total - overall.answered > 0 ? ` ${overall.total - overall.answered} unanswered.` : ''}
          {overall.flagged ? ` ${overall.flagged} flagged for review.` : ''} Once submitted, answers can’t be changed.
        </p>
        <ul className="mx-confirm-list">
          {subjects.map((s, index) => (
            <li key={s.subject_id}>
              <span>{s.name}</span>
              <span className="sj-mono">
                {totals[index]!.answered}/{totals[index]!.total}
                {totals[index]!.flagged ? ` · ${totals[index]!.flagged} flagged` : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="sj-small sj-muted" style={{ marginTop: 10 }}>
          Time left: {clock(secondsLeft)}
        </p>
      </Dialog>

      {gateOpen ? (
        <div className="mx-gate" role="dialog" aria-modal="true" aria-labelledby="mx-gate-title">
          <div className="mx-gate-card">
            <span className="mx-gate-mark" aria-hidden="true">
              <IconClock size={26} />
            </span>
            <h2 id="mx-gate-title" className="sj-display sj-h2">
              {started ? 'You left full screen' : 'Full screen to begin'}
            </h2>
            {started ? (
              <p>
                The test stays in full screen. Leaving it has been recorded
                {exits > 1 ? ` (${exits} times)` : ''} and will show in your report. The clock is still running.
              </p>
            ) : (
              <p>
                The test runs in full screen, with nothing else on show. Leaving full screen or switching tabs is
                recorded in your report. The clock is already running: {clock(secondsLeft)} left.
              </p>
            )}
            <Button size="lg" onClick={() => void enterFullscreen()}>
              {started ? 'Return to full screen' : 'Enter full screen'}
            </Button>
            {refused ? (
              <p className="sj-small">
                This browser would not go full screen.{' '}
                <button type="button" className="mx-linkbtn" onClick={() => setSkipFullscreen(true)}>
                  Continue without it
                </button>{' '}
                (this is recorded).
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!canFullscreen && !noFullNoticeSeen ? (
        <div className="mx-notice soft" role="status">
          This device can’t lock the test to full screen. Switching apps or tabs is still recorded.
          <button type="button" aria-label="Dismiss" onClick={() => setNoFullNoticeSeen(true)}>
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      {finishing === 'clock' || submitError ? (
        <div className="mx-gate" role="alertdialog" aria-modal="true">
          <div className="mx-gate-card">
            {submitError ? (
              <>
                <h2 className="sj-display sj-h2">Not submitted yet</h2>
                <p>{submitError} Your answers are safe on this device. Check your connection and try again.</p>
                <Button
                  size="lg"
                  onClick={() => {
                    setSubmitError(null);
                    void finish(secondsLeft <= 0 ? 'clock' : 'manual');
                  }}
                >
                  Try again
                </Button>
              </>
            ) : (
              <>
                <h2 className="sj-display sj-h2">Time is up</h2>
                <p>Your answers are being submitted.</p>
                <Spinner size={26} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ question */

function QuestionCard({
  mockId,
  question,
  number,
  total,
  subjectName,
  choice,
  flagged,
  onChoose,
  onClear,
}: {
  mockId: string;
  question: PaperQuestion;
  number: number;
  total: number;
  subjectName: string;
  choice: string | null;
  flagged: boolean;
  onChoose: (key: string) => void;
  onClear: () => void;
}) {
  const stemId = `mx-stem-${question.question_version_id}`;
  return (
    <article className="mx-qcard" aria-label={`${subjectName}, question ${number} of ${total}`}>
      <header className="mx-qhead">
        <span className="mx-qno sj-mono">
          Question {number}
          <span> of {total}</span>
        </span>
        <span className="qt-group">
          {flagged ? (
            <span className="mx-flagtag">
              <FlagIcon size={14} /> Flagged
            </span>
          ) : null}
          <QuestionTools versionId={question.question_version_id} where="mock" sessionId={mockId} />
        </span>
      </header>

      {question.passage_body ? (
        <section className="mx-passage" aria-label="Passage">
          {question.passage_title ? <b className="mx-passage-title">{question.passage_title}</b> : null}
          <div>
            <Maths text={question.passage_body} />
          </div>
        </section>
      ) : null}
      {question.instructions ? (
        <p className="mx-instructions">
          <Maths text={question.instructions} />
        </p>
      ) : null}

      <h2 className="mx-stem sj-question" id={stemId}>
        <Maths text={question.stem} />
      </h2>
      {question.figures.length ? (
        <div className="mx-figures">
          <Figures figures={question.figures} />
        </div>
      ) : null}

      <div
        className={cx('sj-options mx-options', hasOptionPictures(question.options) && 'sp-pic-options')}
        role="radiogroup"
        aria-labelledby={stemId}
      >
        {question.options.map((option) => {
          const on = choice === option.option_key;
          return (
            <button
              key={option.option_key}
              type="button"
              role="radio"
              aria-checked={on}
              className="sj-option mx-option"
              onClick={() => onChoose(option.option_key)}
            >
              <span className="key">{option.option_key}</span>
              <span className="body">
                <OptionBody body={option.body} figure={option.figure} />
              </span>
            </button>
          );
        })}
      </div>
      {choice ? (
        <button type="button" className="mx-linkbtn mx-clear" onClick={onClear}>
          Clear my answer
        </button>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ palette */

function Palette({
  questions,
  sheet,
  current,
  counts,
  onPick,
}: {
  questions: PaperQuestion[];
  sheet: Sheet;
  current: number;
  counts: { total: number; answered: number; flagged: number };
  onPick: (index: number) => void;
}) {
  return (
    <div className="mx-palette">
      <div className="mx-palette-counts">
        <span>
          <b className="sj-num">{counts.answered}</b> answered
        </span>
        <span>
          <b className="sj-num">{counts.total - counts.answered}</b> left
        </span>
        <span>
          <b className="sj-num">{counts.flagged}</b> flagged
        </span>
      </div>
      <div className="mx-grid">
        {questions.map((q, index) => {
          const mark = sheet[q.question_version_id]!;
          return (
            <button
              key={q.question_version_id}
              type="button"
              className={cx('mx-cell', mark.choice && 'answered', mark.flagged && 'flagged', index === current && 'current')}
              aria-current={index === current ? 'true' : undefined}
              aria-label={`Question ${index + 1}${mark.choice ? ', answered' : ', not answered'}${mark.flagged ? ', flagged' : ''}`}
              onClick={() => onPick(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <ul className="mx-legend" aria-label="Key">
        <li>
          <span className="mx-cell sample current">1</span> Current
        </li>
        <li>
          <span className="mx-cell sample answered">2</span> Answered
        </li>
        <li>
          <span className="mx-cell sample flagged">3</span> Flagged
        </li>
        <li>
          <span className="mx-cell sample">4</span> Not answered
        </li>
      </ul>
    </div>
  );
}
