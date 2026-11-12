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
import { OptionBody, hasOptionPictures } from "../../OptionBody.js";
import {
  api,
  type NarratedLesson,
  type PracticeQuestion,
  type PracticeState,
} from "../../student/api.js";
import { readBoardPrefs } from "../../student/boardPrefs.js";
import {
  IconArrowRight,
  IconBook,
  IconBulb,
  IconCheck,
  IconHelp,
  IconReplay,
  IconSpark,
} from "../icons.js";
import {
  lessonFeedbackApi,
  type LessonContext,
  type MatchedWorking,
  type Understood,
} from "../lessonFeedbackApi.js";
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
import "./CheckIns.css";
import "./PracticeRoom.css";
import { friendly } from '../../lib/friendlyError.js';
import { QuestionTools } from "../QuestionTools.js";
import { VoiceLocked, usePremium } from "../premium.js";

type Confidence = "sure" | "unsure" | "guessed";

/** The board is a large module and only the lesson needs it, so it loads when first opened. */
const Board = lazy(() =>
  import("../../student/Board.js").then((module) => ({
    default: module.Board,
  })),
);

/**
 * How sure, drawn as a signal: three bars for "I knew it", two for "I think so", one for a
 * guess. Drawn here rather than in icons.tsx: only this page needs it.
 */
function Gauge({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="pr-gauge" aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={cx("pr-gauge-bar", bar <= level && "on")} />
      ))}
    </span>
  );
}

const CONFIDENCE: {
  value: Confidence;
  label: string;
  meaning: string;
  level: 1 | 2 | 3;
  said: string;
}[] = [
  {
    value: "sure",
    label: "I knew it",
    meaning: "I worked it out and I trust it.",
    level: 3,
    said: "You said you knew it",
  },
  {
    value: "unsure",
    label: "I think so",
    meaning: "Fairly sure, but not certain.",
    level: 2,
    said: "You said you think so",
  },
  {
    value: "guessed",
    label: "I guessed",
    meaning: "I picked one without really knowing.",
    level: 1,
    said: "You said you guessed",
  },
];

/** Two misses, held on screen before the page that opens the board. */
interface MissedTwice {
  first: string | null;
  second: string;
  confidence: Confidence | null;
}

/** The check-in after a lesson: why the board was opened, and for which question. */
interface Checkin {
  context: LessonContext;
  versionId: string;
}

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

/*
 * A right answer's result screen survives a reload, so the offer to see the working is not lost.
 * Kept under the session and the question waiting after it (what the server will say is current
 * on reload), and only brought back while the server still agrees that is where the run is.
 */
const resultKey = (sessionId: string, next: PracticeState) =>
  `sj.practice.result.${sessionId}.${next.question?.question_version_id ?? "end"}`;
function readResult(sessionId: string, current: PracticeState): Outcome | null {
  try {
    const raw = window.sessionStorage.getItem(resultKey(sessionId, current));
    if (!raw) return null;
    const kept = JSON.parse(raw) as Outcome;
    const same =
      kept.next.stage === current.stage &&
      kept.next.answered === current.answered &&
      kept.next.question?.question_version_id === current.question?.question_version_id;
    return same ? { ...kept, next: current } : null;
  } catch {
    return null;
  }
}
function keepResult(sessionId: string, outcome: Outcome | null, next?: PracticeState) {
  try {
    if (outcome) {
      window.sessionStorage.setItem(resultKey(sessionId, outcome.next), JSON.stringify(outcome));
    } else if (next) {
      window.sessionStorage.removeItem(resultKey(sessionId, next));
    }
  } catch {
    /* private mode: a reload goes straight on to the next question, as it used to */
  }
}

/** Why the review board was opened, from how the right answer came and how sure they were. */
function reviewContext(outcome: Outcome): LessonContext {
  const doubted = outcome.confidence === "guessed" || outcome.confidence === "unsure";
  if (!doubted) return "after_right";
  if (outcome.kind === "second") return "after_second_guess";
  return outcome.confidence === "guessed" ? "after_guess" : "after_unsure";
}

function praiseFor(confidence: Confidence | null): string {
  switch (confidence) {
    case "sure":
      return "You knew it.";
    case "unsure":
      return "Trust that thinking next time.";
    case "guessed":
      return "A guess, so it comes back later.";
    default:
      return "Nicely worked.";
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
  /** After a lesson on the board: the short check-in before the run goes on. */
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  /** How sure the student said they were on the answer just marked wrong. */
  const [missConfidence, setMissConfidence] = useState<Confidence | null>(null);
  /** Set when the second try is wrong too: the moment that says so, before the board. */
  const [missedTwice, setMissedTwice] = useState<MissedTwice | null>(null);
  // Whether the student may speak a question at the board, and whether the coach has a voice.
  // Both assumed off until the server says otherwise, so a refused microphone is never drawn.
  const [canSpeak, setCanSpeak] = useState(false);
  const [canHear, setCanHear] = useState(false);
  // The voice and the coach are Premium once the free limits are on (premium.tsx); the
  // board's written working is for everyone.
  const { voice: premiumVoice, coach: premiumCoach } = usePremium();
  const voiceOpen = canHear && premiumVoice;
  const micOpen = canSpeak && premiumVoice;
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
        // A reload on a right answer's result: put the result back rather than skip past it.
        const kept = readResult(sessionId, next);
        if (kept) setOutcome(kept);
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
          !cancelled && setIssue(friendly(error) || "Something went wrong."),
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
    if (!voiceOpen || !hintedVersion || warmed.current === hintedVersion) return;
    warmed.current = hintedVersion;
    api.practiceWarm(sessionId, hintedVersion, readBoardPrefs().voice).catch(() => undefined);
  }, [voiceOpen, hintedVersion, sessionId]);
  // On a doubted right answer too, where the working is the recommended next step. A sure answer's
  // lesson is optional, so its voice is made only if the student opens it: warming every right
  // answer would pay for voice that is mostly never heard.
  const doubted = outcome?.confidence === "guessed" || outcome?.confidence === "unsure";
  const rightVersion = doubted ? outcome?.question.question_version_id : undefined;
  useEffect(() => {
    if (!voiceOpen || !rightVersion || warmed.current === rightVersion) return;
    warmed.current = rightVersion;
    api.practiceWarm(sessionId, rightVersion, readBoardPrefs().voice).catch(() => undefined);
  }, [voiceOpen, rightVersion, sessionId]);

  // Dev only: `?demo=confidence|correct|hinted|guessed|unsure|twice|saved` jumps straight to that moment on
  // the current question, so each screen can be looked at without playing a run to it.
  const demoed = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || demoed.current || !state?.question) return;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo) return;
    const anyStage = ["twice", "saved", "checkin", "checkin-misses"].includes(demo);
    if (!anyStage && state.stage !== "asking" && state.stage !== "hint") return;
    demoed.current = true;
    const first = state.question.options[0]?.option_key;
    if (!first) return;
    if (demo === "checkin" || demo === "checkin-misses" || demo === "saved") {
      setCheckin({
        context: demo === "checkin-misses" ? "after_misses" : "after_guess",
        versionId: state.question.question_version_id,
      });
    } else if (demo === "twice") {
      setMissedTwice({
        first: first,
        second: state.question.options[1]?.option_key ?? first,
        confidence: "guessed",
      });
    } else if (demo === "confidence") {
      setSelected(first);
      setConfirming(true);
    } else if (["correct", "hinted", "guessed", "unsure"].includes(demo)) {
      setOutcome({
        kind: demo === "hinted" ? "second" : "right",
        confidence:
          demo === "guessed" ? "guessed" : demo === "unsure" ? "unsure" : "sure",
        chose: first,
        question: state.question,
        number: numberOf(state).number,
        next: state,
      });
    }
  }, [state]);

  // A finished run has its own page.
  useEffect(() => {
    if (state?.stage === "finished" && !outcome) {
      navigate(`/practice/${sessionId}/summary`, { replace: true });
    }
  }, [state?.stage, outcome, navigate, sessionId]);

  // Each new moment starts at the top.
  const viewKey = checkin
    ? `checkin-${checkin.versionId}`
    : outcome
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
          setMissConfidence(confidence);
          if (next.stage === "explain")
            setMissedTwice({
              first: prev.stage === "hint" ? wrong : null,
              second: chose,
              confidence,
            });
          setWrong(next.stage === "hint" ? chose : null);
          setState(next);
          askedAt.current = Date.now();
        } else {
          // Right. Held on screen until they press on; the clock restarts when the next
          // question actually appears.
          keepWrong(sessionId, question.question_version_id, null);
          setWrong(null);
          const right: Outcome = {
            kind: prev.stage === "hint" ? "second" : "right",
            confidence,
            chose,
            question,
            number: numberOf(prev).number,
            next,
          };
          keepResult(sessionId, right);
          setOutcome(right);
        }
      } catch (error) {
        toast(`That did not send: ${friendly(error) || "try again"}`);
      } finally {
        setBusy(false);
      }
    },
    [selected, sessionId, state, toast, wrong],
  );

  const pressOn = useCallback(() => {
    if (!outcome) return;
    const next = outcome.next;
    keepResult(sessionId, null, next);
    setOutcome(null);
    setState(next);
    askedAt.current = Date.now();
  }, [outcome, sessionId]);

  const openBoard = () => {
    tapped.current = true;
    navigate(`/practice/${sessionId}/lesson`);
  };

  /**
   * The board for the answered question: recommended after a right answer they guessed or
   * doubted (first try or second), and there to open after any other right answer.
   */
  const openReview = () => {
    tapped.current = true;
    navigate(`/practice/${sessionId}/lesson`);
  };

  /**
   * The board is done. Either way the student lands on the check-in in the room: after a right
   * answer they were not sure of it asks two things, after two misses only whether it landed.
   */
  const leaveBoard = (context: LessonContext, versionId: string) => {
    tapped.current = false;
    setCheckin({ context, versionId });
    navigate(`/practice/${sessionId}`, { replace: true });
  };

  /** After the check-in: two misses are recorded as taught; a review goes to the next question. */
  const afterCheckin = () => {
    if (!checkin) return;
    if (checkin.context !== "after_misses") {
      setCheckin(null);
      pressOn();
      return;
    }
    setBusy(true);
    api
      .practiceTaught(sessionId)
      .then((next) => {
        setCheckin(null);
        setState(next);
        askedAt.current = Date.now();
      })
      .catch((error: Error) =>
        setIssue(friendly(error) || "Something went wrong."),
      )
      .finally(() => setBusy(false));
  };

  const answering =
    !!state &&
    !outcome &&
    !checkin &&
    (state.stage === "asking" || state.stage === "hint") &&
    !!state.question;

  // Keyboard: A–D choose, Enter checks.
  useEffect(() => {
    if (!answering || confirming || busy || !state?.question) return;
    const options = state.question.options;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A report dialog is open: its keys are its own, not answers.
      if (document.querySelector(".sj-dialog")) return;
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
      step={total ? { at: position.number, of: total } : undefined}
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
  const picked = question?.options.find(
    (option) => option.option_key === selected,
  );

  const lessonRoute =
    checkin ? (
      <Navigate to={`/practice/${sessionId}`} replace />
    ) : outcome && tapped.current ? (
      <ReviewBoard
        sessionId={sessionId}
        outcome={outcome}
        subjectName={subjectName}
        canHear={voiceOpen}
        canSpeak={micOpen}
        onDone={() =>
          leaveBoard(reviewContext(outcome), outcome.question.question_version_id)
        }
      />
    ) : state.stage === "explain" && question && tapped.current ? (
      <Suspense fallback={<BoardLoading />}>
        <Board
          title={question.subtopic_name}
          subtitle={`${subjectName} · worked through`}
          // The question over the working; the passage has a place of its own beside it.
          question={question.stem}
          figures={question.figures}
          passage={
            question.passage_body
              ? { title: question.passage_title, body: question.passage_body }
              : null
          }
          answerText={
            question.options.find(
              (option) => option.option_key === state.correct_option_key,
            )?.body ?? null
          }
          steps={state.solution_steps ?? []}
          loadLesson={
            voiceOpen
              ? () =>
                  api.practiceLesson(sessionId, question.question_version_id)
              : undefined
          }
          answerLine={`The answer is ${state.correct_option_key}.`}
          askLocked={premiumCoach ? undefined : <VoiceLocked />}
          loadEarlier={() =>
            api.practiceConversation(sessionId, question.question_version_id)
          }
          onListen={
            micOpen
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
          onDone={() =>
            leaveBoard("after_misses", question.question_version_id)
          }
        />
      </Suspense>
    ) : (
      // Straight to the board without the tap (a reload, a pasted link): back to the pause
      // before it, where the tap lets the voice play.
      <Navigate to={`/practice/${sessionId}`} replace />
    );

  let body: JSX.Element;
  if (checkin) {
    body = (
      <CheckIn
        sessionId={sessionId}
        checkin={checkin}
        number={position.number}
        busy={busy}
        onDone={afterCheckin}
        narrow={narrow}
      />
    );
  } else if (outcome) {
    body = (
      <Result outcome={outcome} onNext={pressOn} onWhy={openReview} narrow={narrow} />
    );
  } else if (state.stage === "explain" && question) {
    body = (
      <BeforeBoard
        question={question}
        number={position.number}
        correctKey={state.correct_option_key}
        canHear={voiceOpen}
        canSpeak={micOpen}
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
        missConfidence={missConfidence}
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
            <MissedTwiceDialog
              missed={missedTwice}
              question={question}
              correctKey={state.correct_option_key}
              onClose={() => setMissedTwice(null)}
              onStart={() => {
                setMissedTwice(null);
                openBoard();
              }}
            />
            <Dialog
              open={confirming}
              onClose={() => setConfirming(false)}
              title="How sure are you?"
            >
              {picked ? (
                <div className="pr-conf-echo">
                  <span className="pr-conf-echo-label sj-mono">
                    Your answer
                  </span>
                  <span className="pr-conf-echo-row">
                    <span className="key">{picked.option_key}</span>
                    <span className="body">
                      <OptionBody body={picked.body} figure={picked.figure} size="small" />
                    </span>
                  </span>
                </div>
              ) : null}
              <div
                className="pr-conf"
                role="group"
                aria-label="How sure are you?"
              >
                {CONFIDENCE.map((choice, index) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={cx("pr-tile", `lv${choice.level}`)}
                    onClick={() => void send(choice.value)}
                    disabled={busy}
                    aria-keyshortcuts={String(index + 1)}
                  >
                    <span className="pr-tile-top">
                      <Gauge level={choice.level} />
                      <b>{choice.label}</b>
                      <kbd className="pr-kbd" aria-hidden="true">
                        {index + 1}
                      </kbd>
                    </span>
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
  missConfidence: Confidence | null;
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
        <section
          className="pr-panel miss pr-miss"
          role="status"
          aria-live="polite"
        >
          <div className="pr-panel-head">
            <Medal tone="miss" />
            <span className="pr-panel-eyebrow sj-mono">
              Question {pad(number)} · first try missed
            </span>
            <span className="pr-panel-tag sj-mono">Hint</span>
          </div>
          <h2 className="sj-display pr-panel-title">Not quite.</h2>
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
        </section>
      ) : null}

      <article className="pr-qcard">
        <header className="pr-qhead">
          <div className="pr-tags">
            <Badge tone="ghost">{question.topic_name}</Badge>
            <Badge>{question.subtopic_name}</Badge>
            {question.comeback ? (
              <span title="You missed or guessed this one before. Get it right now and your score goes up.">
                <Badge tone="yellow" dot>
                  Back again
                </Badge>
              </span>
            ) : null}
            <QuestionTools versionId={question.question_version_id} where="practice" sessionId={state.session_id} />
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
          className={cx(
            "sj-options pr-options",
            hasOptionPictures(question.options) && "sp-pic-options",
          )}
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
                  <OptionBody body={option.body} figure={option.figure} />
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

/* ================================================================== result family */

/** The four moments that share one look: right, right after a hint, right but guessed, a miss. */
type Tone = "right" | "unsure" | "second" | "guessed" | "miss" | "checkin";

/** The round badge at the head of every result panel: a tick drawn in, or a bulb for a miss. */
function Medal({ tone }: { tone: Tone }) {
  return (
    <span className={cx("pr-medal", tone)} aria-hidden="true">
      <span className="pr-medal-ring" />
      <span className="pr-medal-ring late" />
      {tone === "miss" ? (
        <IconBulb size={22} />
      ) : (
        <svg viewBox="0 0 48 48" width="28" height="28">
          <path
            d="M13 25.5 21 33l14.5-17"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/** A short burst of paper from behind the medal. CSS only; not drawn under reduced motion. */
function Burst() {
  return (
    <span className="pr-burst" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

/**
 * The run so far, one cell per question. Only the run's totals are known, not which earlier
 * question went which way, so earlier cells are simply "done" and only this one is coloured.
 */
function RunStrip({
  total,
  number,
  tone,
  right,
  note,
}: {
  total: number;
  number: number;
  tone: Tone;
  right: number;
  note?: string;
}) {
  const toGo = Math.max(0, total - number);
  const labelled = total <= 15;
  return (
    <div className="pr-run">
      <ol
        className={cx("pr-run-cells", labelled && "labelled")}
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        aria-label={`Question ${number} of ${total}`}
      >
        {Array.from({ length: total }, (_, index) => {
          const at = index + 1;
          return (
            <li
              key={at}
              className={cx(
                "pr-run-cell",
                at < number && "done",
                at === number && `now ${tone}`,
              )}
            >
              {labelled ? <span className="sj-mono">{at}</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="pr-run-note sj-mono">
        <span>
          <b>{right}</b> right first time
        </span>
        <span className="dot" aria-hidden="true" />
        <span>{toGo === 0 ? "last question" : `${toGo} to go`}</span>
      </p>
      {note ? <p className="pr-run-extra">{note}</p> : null}
    </div>
  );
}

function Result({
  outcome,
  onNext,
  onWhy,
  narrow,
}: {
  outcome: Outcome;
  onNext: () => void;
  onWhy: () => void;
  narrow: boolean;
}) {
  const option = outcome.question.options.find(
    (item) => item.option_key === outcome.chose,
  );
  const last = outcome.next.stage === "finished";
  // A right answer they were not sure of is not celebrated as known: the working comes first.
  const tone: Tone =
    outcome.kind === "second"
      ? "second"
      : outcome.confidence === "guessed"
        ? "guessed"
        : outcome.confidence === "unsure"
          ? "unsure"
          : "right";
  // Guessed or unsure, first try or second: the working is recommended, Next sits beside it.
  // Otherwise Next leads, and the working is there for anyone who wants it.
  const check = outcome.confidence === "guessed" || outcome.confidence === "unsure";
  const said = CONFIDENCE.find((item) => item.value === outcome.confidence);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, []);

  // Enter presses the main button from anywhere on the page, not only while it has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (document.querySelector(".sj-dialog")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select")) return;
      event.preventDefault();
      primary.current?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const eyebrow =
    tone === "second"
      ? "right on the second try"
      : tone === "guessed"
        ? "right, but guessed"
        : tone === "unsure"
          ? "right, not sure"
          : "right first time";
  const title =
    tone === "second"
      ? "Got it this time."
      : check
        ? "Right answer — let’s check your thinking."
        : "Correct.";
  const praise =
    tone === "second"
      ? "The hint helped. It comes back later."
      : tone === "guessed"
        ? "A guess doesn’t count yet. Check the working."
        : tone === "unsure"
          ? "Check the working to be sure."
          : praiseFor(outcome.confidence);
  const nextLabel = last ? "See how you did" : "Next question";

  return (
    <section className={cx("pr-res", tone)} aria-live="polite">
      <div className={cx("pr-panel", tone)}>
        {tone === "right" ? <Burst /> : null}
        <div className="pr-panel-head">
          <Medal tone={tone} />
          <span className="pr-panel-eyebrow sj-mono">
            Question {pad(outcome.number)} · {eyebrow}
          </span>
        </div>
        <h2 className="sj-display pr-panel-title">{title}</h2>
        {tone === "right" ? (
          <span className="pr-plus">
            <IconSpark size={16} />
            +1 unaided
          </span>
        ) : tone === "unsure" ? (
          <span className="pr-plus soft">
            <IconCheck size={16} />
            +1 unaided
          </span>
        ) : tone === "guessed" ? (
          <span className="pr-plus amber">
            <IconHelp size={16} />
            Not counted as known yet
          </span>
        ) : (
          <span className="pr-plus hinted">
            <IconBulb size={16} />
            Learnt with a hint
          </span>
        )}
        <p className="pr-praise">{praise}</p>
        <RunStrip
          total={outcome.next.length}
          number={outcome.number}
          tone={tone}
          right={outcome.next.correct_unaided}
        />
      </div>

      <div className="pr-recap">
        <span className="sj-eyebrow pr-recap-eyebrow">
          {outcome.question.subtopic_name}
        </span>
        <div className="pr-recap-stem">
          <Maths text={outcome.question.stem} />
        </div>
        {option ? (
          <div className="pr-yours">
            <span className="pr-yours-label sj-mono">Your answer</span>
            <span className="pr-yours-row">
              <span className="key">{option.option_key}</span>
              <span className="body">
                <OptionBody body={option.body} figure={option.figure} size="small" />
              </span>
              <span className="pr-yours-tick" aria-label="correct">
                <IconCheck size={18} />
              </span>
            </span>
          </div>
        ) : null}
        {said ? (
          <span className={cx("pr-said", `lv${said.level}`)}>
            <Gauge level={said.level} />
            {said.said}
          </span>
        ) : null}
      </div>

      <div className="pr-res-go">
        <button
          ref={primary}
          type="button"
          className={cx("sj-btn lg", narrow && "block")}
          onClick={check ? onWhy : onNext}
        >
          {check ? <IconBook size={18} /> : null}
          {check ? "See the working" : nextLabel}
          <kbd className="pr-enter sj-mono" aria-hidden="true">
            Enter ↵
          </kbd>
        </button>
        <button
          type="button"
          className={cx("sj-btn ghost lg", narrow && "block")}
          onClick={check ? onNext : onWhy}
        >
          {check ? null : <IconBook size={18} />}
          {check ? nextLabel : "See the working"}
        </button>
      </div>
    </section>
  );
}

/**
 * The board for a question answered right but not trusted (a guess, or "I think so"). The
 * lesson is fetched first: its lines are the board's steps, and with the coach's voice on the
 * same lesson is handed over to be spoken. If it cannot be had, the board reads what it has.
 */
function ReviewBoard({
  sessionId,
  outcome,
  subjectName,
  canHear,
  canSpeak,
  onDone,
}: {
  sessionId: string;
  outcome: Outcome;
  subjectName: string;
  canHear: boolean;
  canSpeak: boolean;
  onDone: () => void;
}) {
  const question = outcome.question;
  const version = question.question_version_id;
  const [lesson, setLesson] = useState<NarratedLesson | "none" | null>(null);
  const { coach: premiumCoach } = usePremium();
  useEffect(() => {
    let cancelled = false;
    api
      .practiceLesson(sessionId, version)
      .then((loaded) => {
        if (!cancelled) setLesson(loaded);
      })
      .catch(() => {
        if (!cancelled) setLesson("none");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, version]);
  if (lesson === null) return <BoardLoading />;
  const loaded = lesson === "none" ? null : lesson;
  return (
    <Suspense fallback={<BoardLoading />}>
      <Board
        title={question.subtopic_name}
        subtitle={`${subjectName} · the working`}
        question={question.stem}
        figures={question.figures}
        passage={
          question.passage_body
            ? { title: question.passage_title, body: question.passage_body }
            : null
        }
        answerText={
          question.options.find((option) => option.option_key === outcome.chose)?.body ?? null
        }
        steps={loaded ? loaded.beats.flatMap((beat) => beat.write) : []}
        loadLesson={
          canHear && loaded ? () => Promise.resolve(loaded) : undefined
        }
        answerLine={`The answer is ${outcome.chose}.`}
        askLocked={premiumCoach ? undefined : <VoiceLocked />}
        loadEarlier={() => api.practiceConversation(sessionId, version)}
        onListen={
          canSpeak
            ? (recording) => api.practiceListen(sessionId, version, recording)
            : undefined
        }
        onAsk={(asked, stepIndex, handlers) =>
          api.practiceAskStreaming(sessionId, version, asked, stepIndex, handlers)
        }
        onDone={onDone}
      />
    </Suspense>
  );
}

/* ================================================================== two misses */

/**
 * The second try was wrong too. Said plainly, with both tries and the answer, and what happens
 * now, so the student is never dropped onto the board page without knowing why.
 */
function MissedTwiceDialog({
  missed,
  question,
  correctKey,
  onClose,
  onStart,
}: {
  missed: MissedTwice | null;
  question: PracticeQuestion | null;
  correctKey: string | null;
  onClose: () => void;
  onStart: () => void;
}) {
  const option = (key: string | null) =>
    key ? question?.options.find((item) => item.option_key === key) : undefined;
  const tries = missed
    ? [
        { label: "First try", option: option(missed.first) },
        { label: missed.first ? "Second try" : "Your answer", option: option(missed.second) },
      ].filter((item) => item.option)
    : [];
  const answer = option(correctKey);
  return (
    <Dialog
      open={!!missed}
      onClose={onClose}
      title={missed?.first ? "Not this time either." : "Not this one."}
      actions={
        <>
          <Button tone="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button onClick={onStart} trailing={<IconArrowRight size={18} />}>
            See the working
          </Button>
        </>
      }
    >
      <div className="pr-twice">
        <ul className="pr-twice-tries">
          {tries.map((item) => (
            <li key={item.label} className="pr-twice-try wrong">
              <span className="pr-twice-label sj-mono">{item.label}</span>
              <span className="pr-twice-row">
                <span className="key">{item.option!.option_key}</span>
                <span className="body">
                  <OptionBody body={item.option!.body} figure={item.option!.figure} size="small" />
                </span>
              </span>
            </li>
          ))}
          {answer ? (
            <li className="pr-twice-try right">
              <span className="pr-twice-label sj-mono">The answer</span>
              <span className="pr-twice-row">
                <span className="key">{answer.option_key}</span>
                <span className="body">
                  <OptionBody body={answer.body} figure={answer.figure} size="small" />
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      </div>
    </Dialog>
  );
}

/* ================================================================== check-in */

interface Choice<T extends string> {
  value: T;
  label: string;
  meaning: string;
  level: 1 | 2 | 3;
}

const MATCHED: Choice<MatchedWorking>[] = [
  {
    value: "yes",
    label: "Yes, the same way",
    meaning: "The working matched what I did.",
    level: 3,
  },
  {
    value: "partly",
    label: "Partly",
    meaning: "Some of it was how I thought.",
    level: 2,
  },
  {
    value: "no",
    label: "No — I guessed",
    meaning: "I didn’t really work it out.",
    level: 1,
  },
];

const LANDED: Choice<Understood>[] = [
  {
    value: "got_it",
    label: "Got it",
    meaning: "I could do one like this now.",
    level: 3,
  },
  {
    value: "unsure",
    label: "Still unsure",
    meaning: "Some of it made sense, not all.",
    level: 2,
  },
  {
    value: "too_hard",
    label: "Too hard",
    meaning: "I lost it along the way.",
    level: 1,
  },
];

/** After a lesson opened by choice on a right answer: one light question, not the full check-in. */
type Useful = "helped" | "knew" | "unsure";
const USEFUL: Choice<Useful>[] = [
  {
    value: "helped",
    label: "Yes, it helped",
    meaning: "Good to see it worked through.",
    level: 3,
  },
  {
    value: "knew",
    label: "I knew this already",
    meaning: "It matched how I did it.",
    level: 3,
  },
  {
    value: "unsure",
    label: "Still unsure",
    meaning: "Some of it didn’t click.",
    level: 2,
  },
];
const USEFUL_SAYS: Record<Useful, { understood: Understood; matched: MatchedWorking | null }> = {
  helped: { understood: "got_it", matched: null },
  knew: { understood: "got_it", matched: "yes" },
  unsure: { understood: "unsure", matched: null },
};

function ChoiceRow<T extends string>({
  id,
  step,
  question,
  choices,
  value,
  onChange,
}: {
  id: string;
  step: string | null;
  question: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="pr-ask" role="group" aria-labelledby={id}>
      <h3 className="pr-ask-q" id={id}>
        {step ? <span className="pr-ask-step sj-mono">{step}</span> : null}
        {question}
      </h3>
      <div className="pr-tiles">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className={cx(
              "pr-tile",
              `lv${choice.level}`,
              value === choice.value && "on",
            )}
            aria-pressed={value === choice.value}
            onClick={() => onChange(choice.value)}
          >
            <span className="pr-tile-top">
              <Gauge level={choice.level} />
              <b>{choice.label}</b>
              <span className="pr-tile-tick" aria-hidden="true">
                <IconCheck size={14} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckIn({
  sessionId,
  checkin,
  number,
  busy,
  onDone,
  narrow,
}: {
  sessionId: string;
  checkin: Checkin;
  number: number;
  busy: boolean;
  onDone: () => void;
  narrow: boolean;
}) {
  const light = checkin.context === "after_right";
  const both = checkin.context !== "after_misses" && !light;
  // Dev only: `?demo=saved` opens on the saved moment, answered.
  const demoSaved =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "saved";
  const [matched, setMatched] = useState<MatchedWorking | null>(demoSaved ? "partly" : null);
  const [landed, setLanded] = useState<Understood | null>(demoSaved ? "unsure" : null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [useful, setUseful] = useState<Useful | null>(null);
  const toast = useToast();
  const ready = !!landed && (!both || !!matched);

  if (light) {
    const sendUseful = () => {
      if (!useful) return;
      setSending(true);
      setFailed(null);
      const says = USEFUL_SAYS[useful];
      lessonFeedbackApi
        .send(sessionId, checkin.versionId, {
          context: checkin.context,
          understood: says.understood,
          matched_working: says.matched,
        })
        .then(() => {
          toast("Thanks — noted");
          onDone();
        })
        .catch((error: Error) => setFailed(friendly(error) || "It didn’t save."))
        .finally(() => setSending(false));
    };
    return (
      <section className="pr-res checkin">
        <div className="pr-panel checkin">
          <div className="pr-panel-head">
            <span className="pr-medal checkin" aria-hidden="true">
              <IconBook size={22} />
            </span>
            <span className="pr-panel-eyebrow sj-mono">
              Question {pad(number)} · after the lesson
            </span>
          </div>
          <h2 className="sj-display pr-panel-title">Was this useful?</h2>
          <p className="pr-praise">
            One tap if you like. You got this one right, so nothing here changes your score.
          </p>
        </div>

        <div className="pr-asks">
          <ChoiceRow
            id="pr-ask-useful"
            step={null}
            question="Was seeing the working useful?"
            choices={USEFUL}
            value={useful}
            onChange={setUseful}
          />
          {failed ? (
            <div className="pr-ask-fail" role="alert">
              <p>
                <b>That didn’t save.</b> ({failed}) You can try again, or carry on without it.
              </p>
            </div>
          ) : null}
        </div>

        <div className="pr-res-go">
          <Button
            size="lg"
            block={narrow}
            disabled={!useful}
            busy={sending || busy}
            onClick={sendUseful}
            trailing={sending || busy ? undefined : <IconArrowRight size={18} />}
          >
            {sending ? "Saving…" : "Continue"}
          </Button>
          <button
            type="button"
            className={cx("sj-btn ghost lg", narrow && "block")}
            onClick={onDone}
            disabled={sending || busy}
          >
            Skip
          </button>
        </div>
      </section>
    );
  }

  const submit = () => {
    if (!landed || !ready) return;
    setSending(true);
    setFailed(null);
    lessonFeedbackApi
      .send(sessionId, checkin.versionId, {
        context: checkin.context,
        understood: landed,
        matched_working: both ? matched : null,
      })
      .then(() => {
        toast("Saved");
        onDone();
      })
      .catch((error: Error) =>
        setFailed(friendly(error) || "It didn’t save."),
      )
      .finally(() => setSending(false));
  };

  return (
    <section className="pr-res checkin">
      <div className="pr-panel checkin">
        <div className="pr-panel-head">
          <span className="pr-medal checkin" aria-hidden="true">
            <IconBook size={22} />
          </span>
          <span className="pr-panel-eyebrow sj-mono">
            Question {pad(number)} · after the lesson
          </span>
        </div>
        <h2 className="sj-display pr-panel-title">Quick check-in.</h2>
      </div>

      <div className="pr-asks">
        {both ? (
          <ChoiceRow
            id="pr-ask-matched"
            step="1"
            question="Was this how you worked it out?"
            choices={MATCHED}
            value={matched}
            onChange={setMatched}
          />
        ) : null}
        <ChoiceRow
          id="pr-ask-landed"
          step={both ? "2" : null}
          question="How was this lesson?"
          choices={LANDED}
          value={landed}
          onChange={setLanded}
        />
        {failed ? (
          <div className="pr-ask-fail" role="alert">
            <p>
              <b>That didn’t save.</b> Your answers weren’t sent ({failed}).
              You can try again, or carry on without them.
            </p>
            <div className="pr-ask-fail-go">
              <button
                type="button"
                className="sj-btn sm"
                onClick={submit}
                disabled={sending || busy}
              >
                Try again
              </button>
              <button
                type="button"
                className="sj-btn ghost sm"
                onClick={onDone}
                disabled={sending || busy}
              >
                Continue anyway
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pr-res-go">
        <Button
          size="lg"
          block={narrow}
          disabled={!ready}
          busy={sending || busy}
          onClick={submit}
          trailing={sending || busy ? undefined : <IconArrowRight size={18} />}
        >
          {sending ? "Saving…" : "Continue"}
        </Button>
        {!ready ? (
          <p className="pr-go-note">
            {both ? "Answer both to carry on." : "Pick one to carry on."}
          </p>
        ) : null}
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
        {canHear ? <p className="pr-explain-lead">Sound on: the coach talks you through it.</p> : null}
        {answer ? (
          <div className="pr-answer">
            <span className="pr-answer-label sj-mono">The answer</span>
            <span className="pr-answer-row">
              <span className="key">{answer.option_key}</span>
              <span>
                <OptionBody body={answer.body} figure={answer.figure} size="small" />
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
      </div>
    </section>
  );
}
