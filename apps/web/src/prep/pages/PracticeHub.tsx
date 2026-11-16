/**
 * Practice: every subject the student sits, each as a card (where it stands, the practice so
 * far, its topics by strength, and the one way in: start, resume or check-up first), under a
 * slim row with the overall score, the runs so far (in a popup) and building your own run.
 *
 * Redesigned with the founder, 16 Nov 2026: no subject tabs and no big banner (the sidebar
 * already says Practice), "build" offered once, and the history out of the page.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useRoadmap } from "../roadmapApi.js";
import {
  IconArrowRight,
  IconChevronRight,
  IconClose,
  IconLayers,
  IconLock,
  IconReplay,
  IconSpark,
} from "../icons.js";
import {
  progressApi,
  type PracticeRun,
  type SubjectOverview,
} from "../progressApi.js";
import { runsApi } from "../runsApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import {
  PRACTICE_LOCK_WORDS,
  isDemoSubject,
  practiceLock,
  subjectStatus,
  subjectTint,
  useOverview,
  type SubjectTint,
} from "../SubjectSwitcher.js";
import {
  Badge,
  Button,
  Card,
  Dialog,
  PageHero,
  Skeleton,
  Steps,
  cx,
  useToast,
} from "../ui.js";
import { plural, useStartPractice } from "./Home.js";
import { DeleteRunDialog, IconTrash } from "./RunReport.js";
import "./PracticeHub.css";
import { friendly } from "../../lib/friendlyError.js";

/** Runs per page in the history, as on the progress page. */
const PAGE = 12;

/** "Today · 13:18", "Yesterday · 09:02", "Mon 21 Sep". */
export function whenLabel(iso: string): string {
  const date = new Date(iso);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Yesterday · ${time}`;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PracticeHub() {
  usePageTitle("Practice");
  const student = useStudent();
  const overview = useOverview(student.studentId);
  // null: closed; 'all': every run; a subject: that subject's runs.
  const [showRuns, setShowRuns] = useState<null | "all" | { id: string; name: string }>(null);
  const starter = useStartPractice();
  const subjects = overview.data?.subjects ?? [];

  if (overview.error && !overview.data) {
    return (
      <div className="sj-page ph">
        <PageHero title="Practice" />
        <Card sticker="pink" className="ph-issue">
          <div className="ph-row">
            <span className="ph-tile pink" aria-hidden="true">
              <IconReplay size={18} />
            </span>
            <h2 className="sj-display sj-h3">We couldn’t load your subjects.</h2>
          </div>
          <p className="sj-muted">{overview.error}</p>
          <div>
            <Button tone="primary" icon={<IconReplay size={18} />} onClick={overview.reload}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const loading = overview.loading && !overview.data;

  return (
    <div className="sj-page ph">
      {loading ? (
        <div className="ph-cards" aria-busy="true">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} height={230} radius={18} />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <GetStarted />
      ) : (
        <>
          <PageHero
            title="Practice"
            sub="Pick a subject and start a run, or build your own."
            actions={
              <>
                <BuildButton />
                <Button tone="soft" icon={<IconReplay size={16} />} onClick={() => setShowRuns("all")}>
                  Your runs
                </Button>
              </>
            }
          />

          <section className="ph-cards sj-rise d2" aria-label="Your subjects">
            {subjects.map((subject) => (
              <SubjectCard
                key={subject.subject_id}
                subject={subject}
                starter={starter}
                tint={subjectTint(subject.subject_id)}
                openElsewhere={subjects.find((s) => s.open_practice_session_id && s.subject_id !== subject.subject_id)}
                onHistory={() => setShowRuns({ id: subject.subject_id, name: subject.subject_name })}
              />
            ))}
          </section>
          <TopicsToWork subjects={subjects} />
          {starter.error ? (
            <p className="ph-alert" role="alert">
              {starter.error}
            </p>
          ) : null}
        </>
      )}

      {showRuns ? (
        <RunsPopup
          subject={showRuns === "all" ? null : showRuns}
          onClose={() => setShowRuns(null)}
          onChanged={overview.reload}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ the slim top row */


/** Build your own run, once for the page; while planned runs come first, it says how many. */
function BuildButton() {
  const student = useStudent();
  const plan = useRoadmap(student.studentId);
  const waiting = plan.data?.record.own_runs_in ?? 0;
  const [why, setWhy] = useState(false);
  if (waiting > 0) {
    return (
      <>
        <Button tone="soft" icon={<IconLock size={16} />} onClick={() => setWhy(true)}>
          Build your own
        </Button>
        <Dialog
          open={why}
          onClose={() => setWhy(false)}
          icon={<IconLock size={22} />}
          title="Build your own run is locked"
          actions={
            <>
              <Button tone="ghost" onClick={() => setWhy(false)}>
                Close
              </Button>
              <Button to="/roadmap" trailing={<IconArrowRight size={16} />}>
                Go to my roadmap
              </Button>
            </>
          }
        >
          It opens after {plural(waiting, "more planned run")}. Your roadmap's runs come first, so you
          practise what matters most before choosing your own.
        </Dialog>
      </>
    );
  }
  return (
    <Button to="/practice/new" tone="lime" icon={<IconLayers size={16} />}>
      Build your own run
    </Button>
  );
}

/* ------------------------------------------------------------------ one subject */


function SubjectCard({
  subject,
  starter,
  tint,
  openElsewhere,
  onHistory,
}: {
  subject: SubjectOverview;
  starter: ReturnType<typeof useStartPractice>;
  tint: SubjectTint;
  /** A run left open in another subject: it is finished first (one run at a time). */
  openElsewhere: SubjectOverview | undefined;
  onHistory: () => void;
}) {
  const st = subjectStatus(subject);
  const p = subject.practice;
  const lock = practiceLock(subject);
  // The topics in plain words: how many are strong, getting there, need work.
  // Practice on its own, by the scoring rule (docs/student-scoring.md §1): a right answer counts
  // only when it was got without a hint or the board.
  const average = p.questions_answered
    ? Math.round((p.correct_unaided / p.questions_answered) * 100)
    : null;
  // A tag only when the student has something to do about it.
  const flag = !st.checked ? "No check-up yet" : st.due ? "Check-up due" : null;

  return (
    <article className={cx("ph-card", `tint-${tint}`)}>
      <header className="ph-card-head">
        <span className="ph-card-letter" aria-hidden="true">
          {subject.subject_name.slice(0, 1)}
        </span>
        <div className="ph-card-title">
          <h2 className="sj-display ph-card-name">{subject.subject_name}</h2>
          <span className="ph-card-sub">{subject.examination_short_name}</span>
        </div>
        <div className="ph-card-score">
          <b className="sj-num">{st.predicted !== null ? `${st.predicted}%` : "—"}</b>
          <small>check-up score</small>
        </div>
      </header>

      <div className="ph-card-tiles">
        <div className="ph-tile-stat">
          <span className="ph-tile-label">Practice average</span>
          <b className="sj-num">{average !== null ? `${average}%` : "—"}</b>
          <small>
            {p.questions_answered
              ? `${p.correct_unaided} of ${p.questions_answered} right without a hint`
              : "Not practised yet"}
          </small>
        </div>
        <div className="ph-tile-stat">
          <span className="ph-tile-label">Questions practised</span>
          <b className="sj-num">{p.questions_answered}</b>
          <small>{p.questions_answered ? "in your runs" : "None yet"}</small>
        </div>
      </div>

      <footer className="ph-card-go">
        <Button size="sm" tone="ghost" icon={<IconReplay size={15} />} onClick={onHistory}>
          History
        </Button>
        <span className="ph-card-go-right">
        {openElsewhere && !subject.open_practice_session_id ? (
          <span className="ph-card-flag">Finish your {openElsewhere.subject_name} run first</span>
        ) : flag ? (
          <span className="ph-card-flag">{flag}</span>
        ) : null}
        {subject.open_practice_session_id ? (
          <Button size="sm" tone="dark" to={`/practice/${subject.open_practice_session_id}`} trailing={<IconArrowRight size={16} />}>
            Resume run
          </Button>
        ) : lock ? (
          <Button
            size="sm"
            tone="dark"
            to={subject.open_checkup_session_id ? `/checkup/${subject.open_checkup_session_id}` : `/checkup?subject=${subject.subject_id}`}
            title={PRACTICE_LOCK_WORDS[lock]}
          >
            {subject.open_checkup_session_id ? "Finish check-up" : "Take the check-up"}
          </Button>
        ) : (
          <Button
            size="sm"
            tone="primary"
            busy={starter.busy === subject.subject_id}
            disabled={
              !!openElsewhere ||
              isDemoSubject(subject.subject_id) ||
              (starter.busy !== null && starter.busy !== subject.subject_id)
            }
            onClick={() => void starter.start(subject.subject_id)}
            trailing={<IconArrowRight size={16} />}
          >
            Start a run
          </Button>
        )}
        </span>
      </footer>
    </article>
  );
}

/* ------------------------------------------------------------------ topics to work on */

/** How many topics the list shows at most. */
const WEAK_SHOWN = 6;
/** A topic is listed only after this many answers: one wrong answer is not a weak topic. */
const MIN_ANSWERS = 3;

/**
 * The topics the student is weak in, across every subject, as pills: the name in full and a dot
 * for how weak (red under 25%, orange under 50%). Nothing else (founder, 16 Nov 2026).
 */
function TopicsToWork({ subjects }: { subjects: SubjectOverview[] }) {
  // Only topics with real evidence (MIN_ANSWERS or more answers), weakest first within each
  // subject, then taken a subject at a time so no one subject fills the list.
  const bySubject = subjects.map((subject) =>
    (subject.scores?.topics ?? [])
      .filter((t) => t.answered >= MIN_ANSWERS && t.score !== null && t.score < 50)
      .sort((x, y) => (x.score ?? 0) - (y.score ?? 0) || y.answered - x.answered)
      .map((topic) => ({ subject, topic })),
  );
  const weak: { subject: SubjectOverview; topic: NonNullable<SubjectOverview["scores"]>["topics"][number] }[] = [];
  for (let round = 0; weak.length < WEAK_SHOWN && bySubject.some((list) => list.length > round); round++) {
    for (const list of bySubject) {
      if (list[round] && weak.length < WEAK_SHOWN) weak.push(list[round]!);
    }
  }
  if (weak.length === 0) return null;
  return (
    <section className="ph-weak sj-rise d3" aria-labelledby="ph-weak-title">
      <header className="ph-weak-head">
        <h2 id="ph-weak-title" className="sj-display sj-h3">
          Topics to work on
        </h2>
        <span className="ph-weak-key" aria-hidden="true">
          <span>
            <i className="very" /> very weak
          </span>
          <span>
            <i /> weak
          </span>
        </span>
      </header>
      <ul className="ph-weak-list">
        {weak.map(({ subject, topic }) => (
          <li
            key={topic.subtopic_id}
            className={(topic.score ?? 0) < 25 ? "very" : undefined}
            title={`${topic.name} (${subject.subject_name}): ${(topic.score ?? 0) < 25 ? "very weak" : "weak"}`}
          >
            <i aria-hidden="true" />
            <b>{topic.name}</b>
            <small>{subject.subject_name}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ no exam yet */

function GetStarted() {
  return (
    <section className="ph-section sj-rise d1" aria-labelledby="ph-start-title">
      <span className="sj-eyebrow">Get started</span>
      <h2 id="ph-start-title" className="sj-display sj-h2">
        Choose an exam to practise for
      </h2>
      <Steps
        current={0}
        steps={[
          {
            title: "Pick your exam",
            body: "UTME or WAEC, whichever you are sitting.",
            action: (
              <Button to="/exams" trailing={<IconArrowRight size={18} />}>
                Choose my exam
              </Button>
            ),
          },
          { title: "Add your subjects", body: "Only the ones you are sitting." },
          { title: "Start a run", body: "Five questions is enough to begin." },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ the runs, in a popup */

/** The runs, newest first, a page at a time: every subject's, or one subject's. */
function RunsPopup({
  subject,
  onClose,
  onChanged,
}: {
  subject: { id: string; name: string } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const student = useStudent();
  const toast = useToast();
  // Paged by start time: each page remembers where it began, so Previous goes straight back.
  const [starts, setStarts] = useState<(string | undefined)[]>([undefined]);
  const [index, setIndex] = useState(0);
  const at = starts[index];
  const page = useLoad(
    () => progressApi.runs(student.studentId, PAGE, at, subject?.id),
    [student.studentId, at, subject?.id],
  );
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && asking === null && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asking]);

  const next = page.data?.next_before ?? null;
  const goNext = () => {
    if (!next) return;
    setStarts((current) => [...current.slice(0, index + 1), next]);
    setIndex((n) => n + 1);
  };

  const remove = (sessionId: string) => {
    setAsking(null);
    setGone((current) => new Set(current).add(sessionId));
    runsApi
      .remove(sessionId)
      .then(() => {
        toast("Run deleted");
        onChanged();
      })
      .catch((error: Error) => {
        setGone((current) => {
          const back = new Set(current);
          back.delete(sessionId);
          return back;
        });
        toast(`Couldn’t delete the run: ${friendly(error) || "try again"}`);
      });
  };

  const list = page.data ? page.data.runs.filter((run) => !gone.has(run.session_id)) : null;

  return createPortal(
    <div className="sj">
      <div className="sj-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="sj-dialog ph-runs-dialog" role="dialog" aria-modal="true" aria-labelledby="ph-runs-title">
          <header className="ph-runs-head">
            <h2 id="ph-runs-title" className="sj-display sj-h3">
              {subject ? `${subject.name} runs` : "Your runs"}
            </h2>
            <button type="button" className="ph-runs-close" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </header>
          {list === null ? (
            <div className="ph-runs">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} height={64} radius={10} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="ph-norun">
              <span className="ph-tile" aria-hidden="true">
                <IconSpark size={18} />
              </span>
              <b>No runs yet</b>
            </div>
          ) : (
            <>
              <ul className="ph-runs">
                {list.map((run) => (
                  <RunRow key={run.session_id} run={run} onDelete={() => setAsking(run.session_id)} />
                ))}
              </ul>
              {index > 0 || next ? (
                <div className="ph-pages">
                  <Button tone="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}>
                    Previous
                  </Button>
                  <span>Page {index + 1}</span>
                  <Button tone="ghost" size="sm" disabled={!next} onClick={goNext}>
                    Next
                  </Button>
                </div>
              ) : null}
              <ul className="ph-key" aria-label="What the colours mean">
                <li>
                  <i className="lime" aria-hidden="true" />
                  Right first time
                </li>
                <li>
                  <i className="yellow" aria-hidden="true" />
                  Right after a hint
                </li>
                <li>
                  <i className="pink" aria-hidden="true" />
                  Taught on the board
                </li>
                <li>
                  <i className="empty" aria-hidden="true" />
                  Not reached yet
                </li>
              </ul>
            </>
          )}
          <DeleteRunDialog open={asking !== null} onClose={() => setAsking(null)} onConfirm={() => asking && remove(asking)} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Right first time, right after a hint, taught, and not yet reached, as a strip. */
export function RunStrip({
  run,
}: {
  run: Pick<PracticeRun, "answered" | "correct_unaided" | "taught" | "length">;
}) {
  const hinted = Math.max(0, run.answered - run.correct_unaided - run.taught);
  const rest = Math.max(0, run.length - run.answered);
  const cells = [
    ...Array.from({ length: run.correct_unaided }, () => "lime"),
    ...Array.from({ length: hinted }, () => "yellow"),
    ...Array.from({ length: run.taught }, () => "pink"),
    ...Array.from({ length: rest }, () => "empty"),
  ];
  return (
    <span className="ph-strip" aria-hidden="true">
      {cells.map((tone, index) => (
        <i key={index} className={tone} style={{ animationDelay: `${index * 40}ms` }} />
      ))}
    </span>
  );
}

/** Answers in a run that were right only after a hint (taught means it was not right). */
const runHinted = (run: Pick<PracticeRun, "answered" | "taught" | "correct_unaided">) =>
  Math.max(0, run.answered - run.taught - run.correct_unaided);

function RunRow({
  run,
  onDelete,
}: {
  run: PracticeRun & { topics?: string[]; subtopics?: string[] };
  onDelete: () => void;
}) {
  const to = run.finished ? `/practice/${run.session_id}/report` : `/practice/${run.session_id}`;
  // JAMB's topics (the API's `subtopics`); its `topics` are sections, the fallback.
  const names = run.subtopics ?? run.topics ?? [];
  const topics = names.length > 0 ? names.join(", ") : "";
  return (
    <li className={cx("ph-run", !run.finished && "open")}>
      <Link to={to} className="ph-run-link">
        <span className="ph-run-main">
          <span className="ph-run-title">
            <b>{run.subject_name}</b>
            {run.finished ? (
              <Badge tone="green" className="ph-run-badge">
                Finished
              </Badge>
            ) : (
              <Badge tone="yellow" className="ph-run-badge">
                In progress
              </Badge>
            )}
          </span>
          <span className="ph-run-sub sj-small">
            {whenLabel(run.started_at)}
            {topics ? ` · ${topics}` : ""}
          </span>
        </span>
        <span className="ph-run-score">
          <RunStrip run={run} />
          <span className="ph-run-num">
            {run.correct_unaided} of {run.answered} right
            {runHinted(run) ? ` · ${runHinted(run)} needed a hint` : ""}
          </span>
        </span>
        <span className="ph-run-go">
          <span className="ph-run-action">{run.finished ? "Report" : "Resume"}</span>
          <IconChevronRight size={18} />
        </span>
      </Link>
      <button
        type="button"
        className="ph-run-del"
        onClick={onDelete}
        aria-label={`Delete the ${run.subject_name} run from ${whenLabel(run.started_at)}`}
        title="Delete this run"
      >
        <IconTrash size={18} />
      </button>
    </li>
  );
}
