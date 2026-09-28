/**
 * A practice run, in focus mode.
 *
 * The loop is the one the first version taught, kept exactly: ask; before marking, ask how sure
 * they were; if the answer is wrong, a hint and the same question again (which no longer counts);
 * miss it again and the coach works it through on the board, and that question is counted as
 * taught, not known. What is new is that each of those is its own moment on screen — the
 * question, the "how sure" sheet, the result, the pause before the board — rather than one page
 * that changes underneath the student.
 *
 * The board lives at /practice/:id/lesson so the back button leaves it for the pause before it,
 * and the tap on "Start the lesson" is the gesture that lets the coach's voice play.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

import { Figures } from "../../Figures.js";
import { Maths } from "../../Maths.js";
import {
  api,
  type PracticeQuestion,
  type PracticeState,
} from "../../student/api.js";
import {
  IconArrowRight,
  IconBook,
  IconBulb,
  IconCheck,
  IconHelp,
  IconReplay,
  IconSpark,
  IconTarget,
  IconVolume,
} from "../icons.js";
import { progressApi } from "../progressApi.js";
import { FocusShell } from "../shell.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import {
  Badge,
  Button,
  Dialog,
  Skeleton,
  cx,
  useNarrow,
  useToast,
} from "../ui.js";
import "./PracticeRoom.css";

type Confidence = "sure" | "unsure" | "guessed";

/** The board is a large module and only the lesson needs it, so it loads when first opened. */
const Board = lazy(() =>
  import("../../student/Board.js").then((module) => ({
    default: module.Board,
  })),
);

/** Drawn here rather than in icons.tsx: only this page needs them. */
function IconWave({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12c2-3.5 4-3.5 6 0s4 3.5 6 0 4-3.5 6 0" />
    </svg>
  );
}
function IconDice({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CONFIDENCE: {
  value: Confidence;
  label: string;
  meaning: string;
  icon: JSX.Element;
  tone: string;
}[] = [
  {
    value: "sure",
    label: "I knew it",
    meaning: "I worked it out and I trust it.",
    icon: <IconTarget size={18} />,
    tone: "sure",
  },
  {
    value: "unsure",
    label: "I think so",
    meaning: "Fairly sure, but not certain.",
    icon: <IconWave size={18} />,
    tone: "unsure",
  },
  {
    value: "guessed",
    label: "I guessed",
    meaning: "I picked one without really knowing.",
    icon: <IconDice size={18} />,
    tone: "guessed",
  },
];

/** A right answer, held on screen before the next question replaces it. */
interface Outcome {
  /** 'right': first try, counts. 'second': right after the hint, does not count. */
  kind: "right" | "second";
  confidence: Confidence | null;
  chose: string;
  question: PracticeQuestion;
  number: number;
  next: PracticeState;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Which question of the run this is: the answered count includes a question being retried. */
function numberOf(state: PracticeState): { number: number; done: number } {
  const done =
    state.stage === "asking" ? state.answered : Math.max(0, state.answered - 1);
  return { number: Math.min(state.length, done + 1), done };
}

/* The first wrong answer is remembered across a reload, so the retry still shows what was picked. */
const wrongKey = (sessionId: string, versionId: string) =>
  `sj.practice.wrong.${sessionId}.${versionId}`;
function readWrong(sessionId: string, versionId: string): string | null {
  try {
    return window.sessionStorage.getItem(wrongKey(sessionId, versionId));
  } catch {
    return null;
  }
}
function keepWrong(sessionId: string, versionId: string, key: string | null) {
  try {
    if (key) window.sessionStorage.setItem(wrongKey(sessionId, versionId), key);
    else window.sessionStorage.removeItem(wrongKey(sessionId, versionId));
  } catch {
    /* private mode: the mark is lost on reload, nothing else */
  }
}

function praiseFor(confidence: Confidence | null): string {
  switch (confidence) {
    case "sure":
      return "You knew it, and you were right. That is the kind that counts.";
    case "unsure":
      return "Right — so that thinking can be trusted. Next time, back yourself.";
    case "guessed":
      return "Right, though you said you guessed. This idea will come back so you can prove it.";
    default:
      return "Nicely worked. On to the next one.";
  }
}

export function PracticeRoom() {
  const { sessionId = "" } = useParams();
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const narrow = useNarrow();

  const [state, setState] = useState<PracticeState | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Whether the student may speak a question at the board, and whether the coach has a voice.
  // Both assumed off until the server says otherwise, so a refused microphone is never drawn.
  const [canSpeak, setCanSpeak] = useState(false);
  const [canHear, setCanHear] = useState(false);
  const askedAt = useRef<number>(Date.now());
  /** Set by the tap on "Start the lesson": the board only opens after that gesture. */
  const tapped = useRef(false);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const runs = useLoad(
    () => progressApi.runs(student.studentId, 50),
    [student.studentId],
  );
  const run = runs.data?.runs.find((item) => item.session_id === sessionId);
  const subjectName = run?.subject_name ?? "Practice";
  usePageTitle(
    subjectName === "Practice" ? "Practice" : `${subjectName} practice`,
  );

  useEffect(() => {
    api
      .features()
      .then((features) => {
        setCanSpeak(features.student_voice);
        setCanHear(features.coach_voice);
      })
      .catch(() => {
        setCanSpeak(false);
        setCanHear(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIssue(null);
    api
      .practiceCurrent(sessionId)
      .then((next) => {
        if (cancelled) return;
        setState(next);
        askedAt.current = Date.now();
        const version = next.question?.question_version_id;
        setWrong(
          next.stage === "hint" && version
            ? readWrong(sessionId, version)
            : null,
        );
      })
      .catch(
        (error: Error) =>
          !cancelled && setIssue(error.message || "Something went wrong."),
      );
    return () => {
      cancelled = true;
    };
  }, [sessionId, tick]);

  // On the first wrong answer, start making the lesson, so the board opens on it ready.
  const warmed = useRef<string | null>(null);
  const hintedVersion =
    state?.stage === "hint" ? state.question?.question_version_id : undefined;
  useEffect(() => {
    if (!canHear || !hintedVersion || warmed.current === hintedVersion) return;
    warmed.current = hintedVersion;
    api.practiceWarm(sessionId, hintedVersion).catch(() => undefined);
  }, [canHear, hintedVersion, sessionId]);

  // A finished run has its own page.
  useEffect(() => {
    if (state?.stage === "finished" && !outcome) {
      navigate(`/practice/${sessionId}/summary`, { replace: true });
    }
  }, [state?.stage, outcome, navigate, sessionId]);

  // Each new moment starts at the top.
  const viewKey = outcome
    ? `result-${outcome.question.question_version_id}`
    : `${state?.stage}-${state?.question?.question_version_id ?? ""}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [viewKey]);

  const send = useCallback(
    async (confidence: Confidence | null) => {
      const prev = state;
      const question = prev?.question;
      if (!prev || !question || !selected) return;
      const chose = selected;
      setBusy(true);
      setConfirming(false);
      try {
        const next = await api.practiceAnswer(sessionId, {
          question_version_id: question.question_version_id,
          selected_option_key: chose,
          response_ms: Date.now() - askedAt.current,
          confidence,
        });
        setSelected(null);
        if (next.stage === "hint" || next.stage === "explain") {
          // Wrong: the hint (same question again), or the board.
          const version =
            next.question?.question_version_id ?? question.question_version_id;
          if (next.stage === "hint") keepWrong(sessionId, version, chose);
          else keepWrong(sessionId, version, null);
          setWrong(next.stage === "hint" ? chose : null);
          setState(next);
          askedAt.current = Date.now();
        } else {
          // Right. Held on screen until they press on; the clock restarts when the next
          // question actually appears.
          keepWrong(sessionId, question.question_version_id, null);
          setWrong(null);
          setOutcome({
            kind: prev.stage === "hint" ? "second" : "right",
            confidence,
            chose,
            question,
            number: numberOf(prev).number,
            next,
          });
        }
      } catch (error) {
        toast(`That did not send: ${(error as Error).message || "try again"}`);
      } finally {
        setBusy(false);
      }
    },
    [selected, sessionId, state, toast],
  );

  const pressOn = useCallback(() => {
    if (!outcome) return;
    const next = outcome.next;
    setOutcome(null);
    setState(next);
    askedAt.current = Date.now();
  }, [outcome]);

  const openBoard = () => {
    tapped.current = true;
    navigate(`/practice/${sessionId}/lesson`);
  };

  const finishBoard = () => {
    setBusy(true);
    api
      .practiceTaught(sessionId)
      .then((next) => {
        setState(next);
        askedAt.current = Date.now();
        tapped.current = false;
        navigate(`/practice/${sessionId}`, { replace: true });
      })
      .catch((error: Error) =>
        setIssue(error.message || "Something went wrong."),
      )
      .finally(() => setBusy(false));
  };

  const answering =
    !!state &&
    !outcome &&
    (state.stage === "asking" || state.stage === "hint") &&
    !!state.question;

  // Keyboard: A–D choose, Enter checks.
  useEffect(() => {
    if (!answering || confirming || busy || !state?.question) return;
    const options = state.question.options;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"], a')
      )
        return;
      if (event.key === "Enter") {
        if (!selected) return;
        event.preventDefault();
        setConfirming(true);
        return;
      }
      if (event.key.length !== 1) return;
      const match = options.find(
        (option) => option.option_key.toUpperCase() === event.key.toUpperCase(),
      );
      if (!match || match.option_key === wrong) return;
      event.preventDefault();
      setSelected(match.option_key);
      optionRefs.current[match.option_key]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answering, confirming, busy, state, selected, wrong]);

  // In the "how sure" sheet: 1, 2, 3 answer it.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      const index = ["1", "2", "3"].indexOf(event.key);
      const choice = CONFIDENCE[index];
      if (choice) {
        event.preventDefault();
        void send(choice.value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, send]);

  const onGroupKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!state?.question) return;
    const keys = state.question.options
      .map((option) => option.option_key)
      .filter((key) => key !== wrong);
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step || keys.length === 0) return;
    event.preventDefault();
    const at = selected ? keys.indexOf(selected) : -1;
    const next = keys[(at + step + keys.length) % keys.length] ?? keys[0]!;
    setSelected(next);
    optionRefs.current[next]?.focus();
  };

  /* ---------------------------------------------------------------- frame */

  const shown = outcome ? null : state;
  const counts = outcome ? outcome.next : state;
  const position = outcome
    ? { number: outcome.number, done: outcome.number }
    : state
      ? numberOf(state)
      : { number: 0, done: 0 };
  const total = counts?.length ?? 0;

  const frame = (children: JSX.Element) => (
    <FocusShell
      eyebrow={
        total ? `Question ${position.number} of ${total}` : "Practice run"
      }
      title={subjectName}
      exitTo="/practice"
      confirmExit={{
        title: "Leave this run?",
        body: "You can pick it up later. Everything you have answered is saved.",
        leave: "Leave",
        stay: "Keep going",
      }}
      progress={total ? position.done / total : 0}
      right={
        counts ? (
          <span
            key={counts.correct_unaided}
            className={cx("pr-score", outcome?.kind === "right" && "bump")}
            title="Right first time, without a hint"
            aria-label={`${counts.correct_unaided} right without help so far`}
          >
            <IconCheck size={15} />
            <b className="sj-mono">{counts.correct_unaided}</b>
            <span className="pr-score-word">right</span>
          </span>
        ) : undefined
      }
    >
      <main className="pr-main">{children}</main>
    </FocusShell>
  );

  /* ---------------------------------------------------------------- states */

  if (issue) {
    const missing = /unknown practice session|not found/i.test(issue);
    return frame(
      <div className="pr-col">
        <section className="pr-issue sj-card sticker pink sj-rise">
          <span className="sj-eyebrow">
            {missing ? "Run not found" : "Something went wrong"}
          </span>
          <h2 className="sj-display sj-h2">
            {missing
              ? "We couldn’t find this run."
              : "This run couldn’t continue."}
          </h2>
          <p className="sj-muted">
            {missing
              ? "The link may be old, or the run belongs to another account. Start a fresh one from Practice."
              : `Check your connection and try again. (${issue})`}
          </p>
          <div className="pr-issue-actions">
            {missing ? null : (
              <Button
                tone="primary"
                icon={<IconReplay size={18} />}
                onClick={() => {
                  setIssue(null);
                  setTick((value) => value + 1);
                }}
              >
                Try again
              </Button>
            )}
            <Button tone={missing ? "primary" : "ghost"} to="/practice">
              Back to practice
            </Button>
          </div>
        </section>
      </div>,
    );
  }

  if (!state || state.stage === "finished") {
    return frame(
      <div className="pr-col" aria-busy="true">
        <div className="pr-qcard pr-skel">
          <div className="pr-qhead">
            <Skeleton width={120} height={14} />
            <Skeleton width={180} height={26} radius={999} />
          </div>
          <Skeleton height={26} width="92%" />
          <Skeleton height={26} width="64%" />
          <div className="sj-options" style={{ marginTop: 22 }}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} height={58} radius={16} />
            ))}
          </div>
        </div>
      </div>,
    );
  }

  const question = state.question;

  const lessonRoute =
    state.stage === "explain" && question && tapped.current ? (
      <Suspense fallback={<BoardLoading />}>
        <Board
          title={question.subtopic_name}
          subtitle={`${subjectName} · worked through`}
          // The question, but never the passage: several paragraphs of comprehension text
          // would bury the working underneath it.
          question={question.stem}
          figures={question.figures}
          steps={state.solution_steps ?? []}
          loadLesson={
            canHear
              ? () =>
                  api.practiceLesson(sessionId, question.question_version_id)
              : undefined
          }
          answerLine={`The answer is ${state.correct_option_key}.`}
          onListen={
            canSpeak
              ? (recording) =>
                  api.practiceListen(
                    sessionId,
                    question.question_version_id,
                    recording,
                  )
              : undefined
          }
          onAsk={(asked, stepIndex, handlers) =>
            api.practiceAskStreaming(
              sessionId,
              question.question_version_id,
              asked,
              stepIndex,
              handlers,
            )
          }
          onDone={finishBoard}
        />
      </Suspense>
    ) : (
      // Straight to the board without the tap (a reload, a pasted link): back to the pause
      // before it, where the tap lets the voice play.
      <Navigate to={`/practice/${sessionId}`} replace />
    );

  let body: JSX.Element;
  if (outcome) {
    body = <Result outcome={outcome} onNext={pressOn} narrow={narrow} />;
  } else if (state.stage === "explain" && question) {
    body = (
      <BeforeBoard
        question={question}
        number={position.number}
        correctKey={state.correct_option_key}
        canHear={canHear}
        canSpeak={canSpeak}
        onStart={openBoard}
        busy={busy}
      />
    );
  } else if (question && shown) {
    body = (
      <Asking
        state={shown}
        question={question}
        number={position.number}
        total={total}
        selected={selected}
        wrong={wrong}
        busy={busy}
        onSelect={setSelected}
        onCheck={() => setConfirming(true)}
        onGroupKey={onGroupKey}
        optionRefs={optionRefs}
      />
    );
  } else {
    body = <div />;
  }

  return (
    <Routes>
      <Route path="lesson" element={lessonRoute} />
      <Route
        path="*"
        element={frame(
          <>
            <div className="pr-col pr-view" key={viewKey}>
              {body}
            </div>
            <Dialog
              open={confirming}
              onClose={() => setConfirming(false)}
              title="How sure are you?"
            >
              <p className="pr-conf-why">
                Asked before we mark it: a lucky guess should not count as
                knowing it.
              </p>
              <div
                className="pr-conf"
                role="group"
                aria-label="How sure are you?"
              >
                {CONFIDENCE.map((choice, index) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={cx("pr-conf-card", choice.tone)}
                    onClick={() => void send(choice.value)}
                    disabled={busy}
                  >
                    <span className="pr-conf-row">
                      <span className="pr-conf-icon">{choice.icon}</span>
                      <b>{choice.label}</b>
                      <kbd className="pr-kbd" aria-hidden="true">
                        {index + 1}
                      </kbd>
                    </span>
                    <small>{choice.meaning}</small>
                  </button>
                ))}
              </div>
              <div className="pr-conf-skip">
                <button
                  type="button"
                  onClick={() => void send(null)}
                  disabled={busy}
                >
                  Rather not say
                </button>
              </div>
            </Dialog>
          </>,
        )}
      />
    </Routes>
  );
}

/** While the board's code arrives: the board's own dark, so the swap is not a flash. */
function BoardLoading() {
  return (
    <div className="pr-boardwait" role="status">
      <span className="pr-boardwait-dot" />
      Setting up the board…
    </div>
  );
}

/* ================================================================== asking + hint */

function Asking({
  state,
  question,
  number,
  total,
  selected,
  wrong,
  busy,
  onSelect,
  onCheck,
  onGroupKey,
  optionRefs,
}: {
  state: PracticeState;
  question: PracticeQuestion;
  number: number;
  total: number;
  selected: string | null;
  wrong: string | null;
  busy: boolean;
  onSelect: (key: string) => void;
  onCheck: () => void;
  onGroupKey: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  optionRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
}) {
  const retry = state.stage === "hint";
  const firstEnabled = question.options.find(
    (option) => option.option_key !== wrong,
  )?.option_key;
  const letters = question.options.map((option) => option.option_key);
  const range =
    letters.length > 1
      ? `${letters[0]}–${letters[letters.length - 1]}`
      : letters[0];
  return (
    <>
      {retry ? (
        <section className="pr-miss" role="status" aria-live="polite">
          <div className="pr-miss-head">
            <span className="pr-miss-icon" aria-hidden="true">
              <IconBulb size={18} />
            </span>
            <h2 className="sj-display">Not quite.</h2>
            <span className="pr-miss-tag sj-mono">Hint</span>
          </div>
          {state.hint ? (
            <p className="pr-hint">
              <Maths text={state.hint} />
            </p>
          ) : null}
          {state.misconception ? (
            <p className="pr-trap">
              <b>
                {wrong ? `Option ${wrong} is ` : "That answer is "}the{" "}
                {state.misconception.name.toLowerCase()} trap.
              </b>{" "}
              <Maths text={state.misconception.description} />
            </p>
          ) : null}
          <p className="pr-miss-note">
            <IconReplay size={16} />
            This one won't count now. Try again.
          </p>
        </section>
      ) : null}

      <article className="pr-qcard">
        <header className="pr-qhead">
          <span className="pr-qno sj-mono">
            Question {pad(number)}
            <span> / {pad(total)}</span>
          </span>
          <div className="pr-tags">
            <Badge tone="ghost">{question.topic_name}</Badge>
            <Badge>{question.subtopic_name}</Badge>
          </div>
        </header>

        {question.passage_body ? (
          <div className="pr-passage">
            {question.passage_title ? (
              <b className="pr-passage-title">{question.passage_title}</b>
            ) : null}
            <div>
              <Maths text={question.passage_body} />
            </div>
          </div>
        ) : null}
        {question.instructions ? (
          <p className="pr-instructions">
            <Maths text={question.instructions} />
          </p>
        ) : null}

        <h2 className="pr-stem sj-question" id="pr-stem">
          <Maths text={question.stem} />
        </h2>
        {question.figures && question.figures.length > 0 ? (
          <div className="pr-figures">
            <Figures figures={question.figures} />
          </div>
        ) : null}

        <div
          className="sj-options pr-options"
          role="radiogroup"
          aria-labelledby="pr-stem"
          onKeyDown={onGroupKey}
        >
          {question.options.map((option) => {
            const isWrong = option.option_key === wrong;
            const on = selected === option.option_key;
            return (
              <button
                key={option.option_key}
                ref={(node) => {
                  optionRefs.current[option.option_key] = node;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={isWrong || undefined}
                tabIndex={
                  on || (!selected && option.option_key === firstEnabled)
                    ? 0
                    : -1
                }
                className={cx("sj-option", "pr-option", isWrong && "wrong")}
                onClick={() => !isWrong && onSelect(option.option_key)}
                disabled={busy || isWrong}
              >
                <span className="key">{option.option_key}</span>
                <span className="body">
                  <Maths text={option.body} />
                </span>
                {isWrong ? (
                  <span className="pr-first sj-mono">First try</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </article>

      <div className="pr-actions">
        <p className="pr-keys" aria-hidden="true">
          <kbd className="pr-kbd">{range}</kbd> choose
          <kbd className="pr-kbd wide">Enter</kbd> check
        </p>
        <Button
          size="lg"
          className="pr-check"
          disabled={!selected}
          busy={busy}
          onClick={onCheck}
          trailing={busy ? undefined : <IconArrowRight size={18} />}
        >
          {busy ? "Marking…" : retry ? "Check again" : "Check answer"}
        </Button>
      </div>
    </>
  );
}

/* ================================================================== result */

function Result({
  outcome,
  onNext,
  narrow,
}: {
  outcome: Outcome;
  onNext: () => void;
  narrow: boolean;
}) {
  const option = outcome.question.options.find(
    (item) => item.option_key === outcome.chose,
  );
  const last = outcome.next.stage === "finished";
  const right = outcome.kind === "right";
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className={cx("pr-result", right ? "right" : "second")}
      aria-live="polite"
    >
      <span className="sj-eyebrow pr-result-eyebrow">
        Question {pad(outcome.number)} ·{" "}
        {right ? "right first time" : "right on the second try"}
      </span>
      <div className="pr-result-head">
        <div className="pr-medal" aria-hidden="true">
          <span className="pr-medal-ring" />
          <span className="pr-medal-ring late" />
          <svg viewBox="0 0 48 48" width="30" height="30">
            <path
              d="M13 25.5 21 33l14.5-17"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="sj-display sj-h1 pr-result-title">
          {right ? "Correct." : "Got it this time."}
        </h2>
      </div>
      {right ? (
        <span className="pr-plus">
          <IconSpark size={16} />
          +1 unaided
        </span>
      ) : (
        <span className="pr-plus hinted">
          <IconBulb size={16} />
          Learnt with a hint
        </span>
      )}
      <p className="pr-praise">
        {right
          ? praiseFor(outcome.confidence)
          : "That was the hint doing its job. It won’t count as known yet — a fresh question on this idea comes back later."}
      </p>
      {option ? (
        <div className="pr-yours">
          <span className="key">{option.option_key}</span>
          <span className="body">
            <Maths text={option.body} />
          </span>
          <span className="pr-yours-tick" aria-label="correct">
            <IconCheck size={18} />
          </span>
        </div>
      ) : null}
      <div className="pr-result-go">
        <button
          ref={next}
          type="button"
          className={cx("sj-btn lg", narrow && "block")}
          onClick={onNext}
        >
          {last ? "See how you did" : "Next question"}
          <span className="arrow">
            <IconArrowRight size={18} />
          </span>
        </button>
      </div>
    </section>
  );
}

/* ================================================================== before the board */

function BeforeBoard({
  question,
  number,
  correctKey,
  canHear,
  canSpeak,
  onStart,
  busy,
}: {
  question: PracticeQuestion;
  number: number;
  correctKey: string | null;
  canHear: boolean;
  canSpeak: boolean;
  onStart: () => void;
  busy: boolean;
}) {
  const answer = question.options.find(
    (option) => option.option_key === correctKey,
  );
  return (
    <section className="pr-explain">
      <div className="pr-slate" aria-hidden="true">
        <span className="pr-slate-tag sj-mono">On the board</span>
        <div className="pr-slate-q">
          <Maths text={question.stem} />
        </div>
        <div className="pr-slate-lines">
          <span />
          <span />
          <span />
          <span className="more" />
          <span className="more" />
          <span className="short" />
        </div>
        <span className="pr-slate-chalk" />
      </div>
      <div className="pr-explain-body">
        <span className="sj-eyebrow">Question {pad(number)} · two misses</span>
        <h2 className="sj-display sj-h2 pr-explain-title">
          Let’s work through it together.
        </h2>
        <p className="pr-explain-lead">
          This one is worth slowing down for. The coach will write the working
          out step by step
          {canHear
            ? " and talk you through it as it goes."
            : ", one line at a time."}
        </p>
        <ul className="pr-points">
          <li>
            <span className="pr-point-row">
              <span className="pr-point-icon" aria-hidden="true">
                <IconBook size={18} />
              </span>
              <b>Step by step</b>
            </span>
            <span className="pr-point-text">
              Written out one line at a time, from the question to the answer.
            </span>
          </li>
          {canHear ? (
            <li>
              <span className="pr-point-row">
                <span className="pr-point-icon sound" aria-hidden="true">
                  <IconVolume size={18} />
                </span>
                <b>Sound on</b>
              </span>
              <span className="pr-point-text">
                The coach speaks each step, so turn your volume up.
              </span>
            </li>
          ) : null}
          <li>
            <span className="pr-point-row">
              <span className="pr-point-icon" aria-hidden="true">
                <IconHelp size={18} />
              </span>
              <b>Ask any time</b>
            </span>
            <span className="pr-point-text">
              Stuck on a step? Ask the coach
              {canSpeak ? ", typed or out loud." : " in your own words."}
            </span>
          </li>
        </ul>
        {answer ? (
          <div className="pr-answer">
            <span className="pr-answer-label sj-mono">The answer</span>
            <span className="pr-answer-row">
              <span className="key">{answer.option_key}</span>
              <span>
                <Maths text={answer.body} />
              </span>
            </span>
          </div>
        ) : null}
        <Button
          size="lg"
          block
          tone="primary"
          onClick={onStart}
          busy={busy}
          trailing={<IconArrowRight size={18} />}
        >
          Start the lesson
        </Button>
        <p className="pr-explain-note">
          Counted as taught, not known. A fresh question on the same idea comes
          back later.
        </p>
      </div>
    </section>
  );
}
