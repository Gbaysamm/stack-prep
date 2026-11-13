/**
 * A weak subtopic's lesson, on the roadmap before its run again (founder, 11 Nov 2026).
 *
 * The bank's written lesson, played on the board. It comes down as ONE file with all its voice
 * (prep/lessonPackage.ts), with a progress bar, and is kept on the phone: once here, it plays to
 * the end with no network (founder, 12 Nov 2026).
 *
 * A subtopic with no written lesson yet shows the reviewed working of the questions the student
 * missed instead. Either way, the subtopic's next run is their real attempt, on new questions.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { request } from "../../lib/friendlyError.js";
import { Maths } from "../../Maths.js";
import {
  getLessonPackage,
  LessonMissing,
  lessonVoice,
  type LessonPackage,
} from "../lessonPackage.js";
import { IconCheck, IconClose } from "../icons.js";
import { FocusShell } from "../shell.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import { Button, Skeleton, cx } from "../ui.js";
import "./Lesson.css";

/** The board is a large module and only a lesson needs it, so it loads when first opened. */
const Board = lazy(() =>
  import("../../student/Board.js").then((module) => ({
    default: module.Board,
  })),
);

interface LessonData {
  subtopic_id: string;
  subtopic_name: string;
  topic_name: string;
  subject_name: string;
  questions: {
    question_version_id: string;
    stem: string;
    options: { option_key: string; body: string; correct: boolean }[];
    steps: string[];
  }[];
}

export function Lesson() {
  usePageTitle("Lesson");
  const { subtopicId = "" } = useParams();
  const [search] = useSearchParams();
  const item = search.get("item");
  // What the roadmap called this stop, so the lesson says what is coming while it loads.
  const named = (useLocation().state ?? null) as { title?: string; subject?: string | null } | null;
  // Which of the subtopic's lessons (a broad subtopic is several short ones).
  const part = Math.max(1, Number(search.get("part") ?? 1) || 1);
  const student = useStudent();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  // The board, then what comes after it (LessonAfter.tsx); `?after=1` opens straight on that,
  // for a student coming back to their conversation with the coach.
  const [stage, setStage] = useState<"board" | "after">(
    search.get("after") === "1" ? "after" : "board",
  );
  const [watch] = useState(0);
  // The written lesson, from the phone or downloaded whole; 'none': the bank has none yet.
  const [board, setBoard] = useState<LessonPackage | "none" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    getLessonPackage(
      student.studentId,
      subtopicId,
      lessonVoice(),
      (share) => live && setProgress(share),
      part,
    )
      .then((found) => live && setBoard(found))
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof LessonMissing) setBoard("none");
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [student.studentId, subtopicId, attempt, part]);

  // The missed questions' working: only where the bank has no lesson for this subtopic.
  const loaded = useLoad(
    () =>
      board === "none"
        ? request<LessonData>(
            `/v1/roadmap/${student.studentId}/lessons/${subtopicId}`,
          )
        : Promise.resolve(null),
    [student.studentId, subtopicId, board === "none"],
  );

  const finish = async () => {
    setSaving(true);
    try {
      await request<void>(
        `/v1/roadmap/${student.studentId}/lessons/${subtopicId}/done`,
        {
          method: "POST",
          body: JSON.stringify({ item_id: item, part }),
        },
      );
      navigate("/roadmap");
    } finally {
      setSaving(false);
    }
  };

  if (stage === "after" && board !== "none") {
    // After the lesson is a page of its own in the app (founder, 13 Nov 2026).
    return (
      <Navigate
        replace
        to={`/lesson/${subtopicId}/after?part=${part}${item ? `&item=${item}` : ""}`}
      />
    );
  }
  if (board && board !== "none") {
    const heard = board.engine !== "none";
    return (
      <div className="sj ls-board">
        <Suspense fallback={null}>
          <Board
            key={watch}
            title={board.title}
            subtitle={
              board.parts > 1
                ? `Lesson ${board.part} of ${board.parts} · ${board.partTitle ?? board.subject}`
                : `Lesson · ${board.subject}`
            }
            // No box: the lesson's own first line writes its title (founder, 12 Nov 2026).
            question=""
            questionLabel="Today's lesson"
            finishedLine="That is the end of the lesson. Next, tell us how well you understood it, and try the problem."
            steps={board.lesson.beats.flatMap((beat) => beat.write)}
            loadLesson={heard ? () => Promise.resolve(board.lesson) : undefined}
            askLocked={
              <span className="sj-small sj-muted">
                Asking in lessons is coming next.
              </span>
            }
            answerLine="Now try it on new questions."
            onAsk={() =>
              Promise.reject(
                new Error("Asking during a lesson is not open yet."),
              )
            }
            onDone={() => setStage("after")}
            // Closed before the end: back to the roadmap, the lesson not taken (founder, 13
            // Nov 2026: closing half way opened "after the lesson").
            onClose={() => navigate("/roadmap")}
          />
        </Suspense>
      </div>
    );
  }
  if (board === null) {
    // ON THE BOARD'S OWN PAPER (founder, 12 Nov 2026: the plain bar was ugly). A pen writing
    // on a small board while the voice is prepared; a real percentage once it downloads.
    const share = Math.round((progress ?? 0) * 100);
    const downloading = progress !== null && progress > 0;
    return (
      <div className="sj ls-loading">
        <Link to="/roadmap" className="ls-loading-close" aria-label="Close">
          <IconClose size={18} />
        </Link>
        <main className="ls-loading-card" role="status" aria-live="polite">
          <div className={cx("ls-loading-board", failed && "still")} aria-hidden>
            <span className="ls-loading-line a" />
            <span className="ls-loading-line b" />
            <span className="ls-loading-line c" />
            <span className="ls-loading-pen" />
          </div>
          <span className="sj-eyebrow">
            {named?.subject ? `Lesson · ${named.subject}` : "Lesson"}
          </span>
          <h1 className="sj-display ls-loading-title">{named?.title ?? "Your lesson"}</h1>
          {failed ? (
            <>
              <p className="ls-loading-note">
                It didn’t download. Check your connection and try again.
              </p>
              <Button tone="lime" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <div className={cx("ls-loading-meter", !downloading && "waiting")}>
                <span style={downloading ? { width: `${Math.max(6, share)}%` } : undefined} />
              </div>
              <p className="ls-loading-note">
                {downloading ? `Downloading · ${share}%` : "Preparing the lesson and its voice…"}
              </p>
              <p className="ls-loading-small">Once it’s here, it plays without the internet.</p>
            </>
          )}
        </main>
      </div>
    );
  }

  const lesson = loaded.data;
  return (
    <FocusShell title={lesson?.subtopic_name ?? "Lesson"} exitTo="/roadmap">
      <main className="ls-page">
        {!lesson ? (
          loaded.error ? (
            <p className="ls-empty">{loaded.error}</p>
          ) : (
            <Skeleton height={320} radius={16} />
          )
        ) : (
          <>
            <header className="ls-head">
              <span className="sj-eyebrow">Lesson · {lesson.subject_name}</span>
              <h1 className="sj-display sj-h2">{lesson.subtopic_name}</h1>
              <p className="ls-lede">
                {lesson.questions.length
                  ? "The ones you got wrong, and how to get them right."
                  : "Nothing to go over here yet."}
              </p>
            </header>

            {lesson.questions.map((question, index) => (
              <article
                key={question.question_version_id}
                className="sj-card ls-card"
              >
                <span className="ls-num sj-mono">{index + 1}</span>
                <div className="ls-stem">
                  <Maths text={question.stem} />
                </div>
                <ul className="ls-options">
                  {question.options.map((option) => (
                    <li
                      key={option.option_key}
                      className={cx(option.correct && "right")}
                    >
                      <span className="ls-key sj-mono">
                        {option.correct ? (
                          <IconCheck size={14} />
                        ) : (
                          option.option_key
                        )}
                      </span>
                      <Maths text={option.body} />
                    </li>
                  ))}
                </ul>
                {question.steps.length ? (
                  <div className="ls-working">
                    <span className="sj-eyebrow">The working</span>
                    <ol>
                      {question.steps.map((step, n) => (
                        <li key={n}>
                          <Maths text={step} />
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))}

            <div className="ls-foot">
              <Button
                tone="lime"
                size="lg"
                busy={saving}
                onClick={() => void finish()}
                icon={<IconCheck size={16} />}
              >
                Got it
              </Button>
            </div>
          </>
        )}
      </main>
    </FocusShell>
  );
}
