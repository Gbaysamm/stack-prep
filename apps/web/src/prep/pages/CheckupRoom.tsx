/**
 * The check-up itself: one question at a time, keyboard-first, in focus mode.
 *
 * Behaviour carried over from the first version (student/Diagnostic.tsx), each one a lesson
 * from driving it in a browser:
 * - The chosen option is held in a ref as well as state, so "B" then Enter typed faster than
 *   React re-renders still sends B.
 * - A sending ref, not only state, guards the answer: Enter on the focused Next button fires
 *   both the button's click and the window's key handler in the same tick.
 * - A reload has no question in hand (answers hand the next one back), so the room asks the
 *   server where the sitting is with `api.current`, and a finished sitting goes to its report.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { OptionBody, hasOptionPictures } from '../../OptionBody.js';
import { api, type CheckupState } from '../../student/api.js';
import { IconArrowRight, IconCheck, IconClock, IconChart } from '../icons.js';
import { FocusShell } from '../shell.js';
import { usePageTitle, useStudent } from '../store.js';
import { Badge, Button, Ring, Skeleton, Spinner, cx } from '../ui.js';
import './CheckupRoom.css';
import { friendly } from '../../lib/friendlyError.js';
import { QuestionTools } from '../QuestionTools.js';

const clockOf = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function CheckupRoom() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const student = useStudent();

  const [state, setState] = useState<CheckupState | null>(null);
  const [subjectName, setSubjectName] = useState<string>('');
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendIssue, setSendIssue] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const selectedRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const askedAt = useRef(Date.now());
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  usePageTitle(subjectName ? `Check-up · ${subjectName}` : 'Check-up');

  const reportPath = `/checkup/${sessionId}/report`;

  // After the last answer: a short beat to say what is happening, then the report.
  const finish = useCallback(() => {
    setScoring(true);
    window.setTimeout(() => navigate(reportPath, { replace: true }), 1500);
  }, [navigate, reportPath]);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const choose = useCallback((key: string) => {
    selectedRef.current = key;
    setSelected(key);
  }, []);

  // Where the sitting is. A finished one goes straight to its report.
  useEffect(() => {
    let cancelled = false;
    setLoadIssue(null);
    api
      .current(sessionId)
      .then((current) => {
        if (cancelled) return;
        if (current.finished || !current.question) {
          navigate(reportPath, { replace: true });
          return;
        }
        setState(current);
        askedAt.current = Date.now();
      })
      .catch((error: Error) => !cancelled && setLoadIssue(friendly(error) || 'The check-up could not be opened.'));
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt, navigate, reportPath]);

  // The subject's name: the sitting itself does not carry it.
  useEffect(() => {
    let cancelled = false;
    api
      .sittings(student.studentId)
      .then((sittings) => {
        const mine = sittings.find((sitting) => sitting.session_id === sessionId);
        if (!cancelled && mine) setSubjectName(mine.subject_name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, student.studentId]);

  // A running clock, for the student's sense of pace. It stops once the answers are in.
  useEffect(() => {
    if (scoring) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [scoring]);

  const submit = useCallback(async () => {
    const question = state?.question;
    const pick = selectedRef.current;
    if (!question || !pick || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendIssue(null);
    try {
      const next = await api.answer(sessionId, question.question_version_id, pick, Date.now() - askedAt.current);
      selectedRef.current = null;
      setSelected(null);
      askedAt.current = Date.now();
      if (next.finished || !next.question) {
        setState((current) => (current ? { ...current, answered: next.answered, length: next.length } : current));
        finishRef.current();
        return;
      }
      setState(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSendIssue(friendly(error) || 'Your answer did not go through.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [sessionId, state]);

  // A–F choose, Enter confirms. Ignored while a dialog is open or a modifier is held.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (scoring || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('.sj-dialog')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const letter = event.key.length === 1 ? event.key.toUpperCase() : '';
      const available = state?.question?.options.map((option) => option.option_key) ?? [];
      if (letter && available.includes(letter)) {
        event.preventDefault();
        choose(letter);
        return;
      }
      if (event.key === 'Enter') {
        // Enter on a focused option takes that option and confirms it, as a form would.
        const key = target?.closest<HTMLElement>('[data-option]')?.dataset.option;
        if (key) {
          event.preventDefault();
          choose(key);
        } else if (target?.closest('button, a')) {
          // The focused control's own click will run; do not answer twice.
          return;
        }
        void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, submit, choose, scoring]);

  // Arrow keys move through the options, as in any radio group.
  const onOptionKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const options = state?.question?.options ?? [];
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || options.length === 0) return;
    event.preventDefault();
    const nextIndex = (index + step + options.length) % options.length;
    const option = options[nextIndex];
    if (!option) return;
    choose(option.option_key);
    optionRefs.current[nextIndex]?.focus();
  };

  const exit = {
    title: 'Leave the check-up?',
    body: 'Your answers so far are saved; you can resume.',
    leave: 'Leave for now',
    stay: 'Keep going',
  };

  /* ---------------------------------------------------------------- scoring moment */
  if (scoring) {
    return (
      <FocusShell eyebrow="Check-up" title={subjectName || 'Check-up'} exitTo="/checkup" progress={1}>
        <main className="cr-scoring" aria-live="polite">
          <div className="cr-scoring-inner">
          <div className="cr-scoring-art" aria-hidden="true">
            <span className="orbit" />
            <span className="core">
              <IconChart size={30} />
            </span>
          </div>
          <h1 className="sj-display sj-h2">Working out your score…</h1>
          <p className="sj-muted">
            Weighing each answer against how much that topic is worth in the exam.
          </p>
          <div className="cr-scoring-steps">
            <span className="on">
              <IconCheck size={16} /> {state?.length ?? 15} answers in
            </span>
            <span className="on d1">
              <IconCheck size={16} /> Topics checked
            </span>
            <span className="on d2">
              <Spinner size={16} /> Predicting your score
            </span>
          </div>
          </div>
        </main>
      </FocusShell>
    );
  }

  /* ---------------------------------------------------------------- loading + error */
  if (!state || !state.question) {
    return (
      <FocusShell eyebrow="Check-up" title={subjectName || 'Check-up'} exitTo="/checkup">
        <main className="cr-page">
          {loadIssue ? (
            <div className="cr-problem sj-card sticker pink" role="alert">
              <span className="sj-eyebrow">Couldn't open this check-up</span>
              <h1 className="sj-display sj-h2">Something got in the way.</h1>
              <p className="sj-muted">{loadIssue}</p>
              <div className="row">
                <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
                <Button tone="ghost" to="/checkup">
                  Back to check-ups
                </Button>
              </div>
            </div>
          ) : (
            <div className="cr-grid" aria-busy="true" aria-label="Finding your place">
              <div className="cr-main">
                <div className="cr-card sj-card">
                  <div className="cr-qhead">
                    <Skeleton width={120} height={16} />
                    <Skeleton width={150} height={26} radius={999} />
                  </div>
                  <Skeleton height={26} />
                  <div style={{ height: 8 }} />
                  <Skeleton height={26} width="70%" />
                  <div className="cr-options-skel">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} height={60} />
                    ))}
                  </div>
                </div>
              </div>
              <aside className="cr-side">
                <div className="cr-panel sj-card">
                  <Skeleton width={128} height={128} radius={999} />
                  <Skeleton height={14} width="80%" />
                  <Skeleton height={14} width="60%" />
                </div>
              </aside>
            </div>
          )}
        </main>
      </FocusShell>
    );
  }

  /* ---------------------------------------------------------------- the question */
  const question = state.question;
  const total = Math.max(1, question.of || state.length);
  const answered = state.answered;
  const isLast = answered + 1 >= state.length;
  const letters = question.options.map((option) => option.option_key);
  const keyHint =
    letters.length > 1 ? `${letters[0]}–${letters[letters.length - 1]}` : (letters[0] ?? 'A');

  return (
    <FocusShell
      eyebrow={`Question ${question.position} of ${total}`}
      title={subjectName || 'Check-up'}
      exitTo="/checkup"
      confirmExit={exit}
      progress={answered / total}
      right={
        <span className="sj-timer" aria-label={`Time so far ${clockOf(seconds)}`} role="timer">
          <IconClock size={16} />
          {clockOf(seconds)}
        </span>
      }
    >
      <main className="cr-page">
        <div className="cr-grid">
          <div className="cr-main">
            <article
              key={question.question_version_id}
              className={cx('cr-card sj-card', sending && 'is-sending')}
              aria-labelledby="cr-stem"
            >
              <header className="cr-qhead">
                <span className="cr-qnum sj-mono">
                  QUESTION {pad2(question.position)}
                  <span className="of"> / {pad2(total)}</span>
                </span>
                <span className="qt-group">
                  {/* JAMB's topic when the server names it; older servers only send the section. */}
                  <Badge className="cr-topic">
                    {question.subtopic_name ?? question.topic_name}
                  </Badge>
                  <QuestionTools versionId={question.question_version_id} where="checkup" sessionId={sessionId} />
                </span>
              </header>

              {question.passage_body ? (
                <section className="cr-passage" aria-label={question.passage_title ?? 'Passage'}>
                  {question.passage_title ? <h2 className="sj-eyebrow">{question.passage_title}</h2> : null}
                  <div className="sp-textbook">
                    <Maths text={question.passage_body} />
                  </div>
                </section>
              ) : null}

              {question.instructions ? (
                <p className="cr-instructions">
                  <Maths text={question.instructions} />
                </p>
              ) : null}

              <div id="cr-stem" className="cr-stem sp-textbook">
                <Maths text={question.stem} />
              </div>
              <Figures figures={question.figures} />

              <div
                className={cx('cr-options sj-options', hasOptionPictures(question.options) && 'sp-pic-options')}
                role="radiogroup"
                aria-labelledby="cr-stem"
              >
                {question.options.map((option, index) => {
                  const on = selected === option.option_key;
                  const focusable = selected ? on : index === 0;
                  return (
                    <button
                      key={option.option_key}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={focusable ? 0 : -1}
                      data-option={option.option_key}
                      className="sj-option cr-option"
                      style={{ animationDelay: `${60 + index * 45}ms` }}
                      onClick={() => choose(option.option_key)}
                      onKeyDown={(event) => onOptionKey(event, index)}
                      disabled={sending}
                    >
                      <span className="key">{option.option_key}</span>
                      <span className="body sp-textbook">
                        <OptionBody body={option.body} figure={option.figure} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>

            <div className="cr-actionbar">
              <div className="cr-actionbar-inner">
                {sendIssue ? (
                  <p className="cr-senderr" role="alert">
                    {sendIssue} Your choice is kept; try again.
                  </p>
                ) : (
                  <p className="cr-hint">
                    <IconCheck size={16} />
                    Each answer saves as you go.
                  </p>
                )}
                <Button
                  className="cr-next"
                  size="lg"
                  onClick={() => void submit()}
                  disabled={!selected}
                  busy={sending}
                  trailing={sending ? undefined : isLast ? <IconCheck size={18} /> : <IconArrowRight size={18} />}
                >
                  {sending ? 'Saving…' : sendIssue ? 'Try again' : isLast ? 'Finish check-up' : 'Next question'}
                </Button>
              </div>
            </div>
          </div>

          <aside className="cr-side" aria-label="About this check-up">
            <div className="cr-panel sj-card">
              <div className="cr-ringwrap">
                <Ring value={answered / total} size={104} stroke={11} color="var(--purple-600)">
                  <span className="cr-ringlabel">
                    <span className="sj-num">{answered}</span>
                    <span className="sj-mono">of {total}</span>
                  </span>
                </Ring>
                <div className="cr-ringtext">
                  <span className="sj-eyebrow">Answered</span>
                  <p>{answered === 0 ? 'Take your time. There’s no pass mark.' : `${total - answered} to go. Nothing here counts against you.`}</p>
                </div>
              </div>

              <ol className="cr-dots" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
                {Array.from({ length: total }, (_, i) => (
                  <li key={i} className={cx(i < answered && 'done', i === answered && 'now')} />
                ))}
              </ol>

              <div className="cr-panel-sec">
                <span className="sj-eyebrow">What this does</span>
                <ol className="cr-does">
                  <li>
                    <b className="sj-mono">01</b> Questions get harder or easier to match you.
                  </li>
                  <li>
                    <b className="sj-mono">02</b> It predicts the score you’d get today.
                  </li>
                  <li>
                    <b className="sj-mono">03</b> It finds the topics to work on first.
                  </li>
                </ol>
              </div>

              <div className="cr-panel-foot">
                <p className="cr-keys">
                  <kbd>{keyHint}</kbd> to choose · <kbd>Enter</kbd> to confirm
                </p>
                <p className="cr-time">
                  <IconClock size={16} />
                  <span className="sj-mono">{clockOf(seconds)}</span> so far
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </FocusShell>
  );
}
