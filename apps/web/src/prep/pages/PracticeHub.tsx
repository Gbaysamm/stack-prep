/**
 * Practice: start a run, or pick up the one that is open.
 *
 * One card per subject the student is preparing for. An open run comes first, because
 * finishing what was started is worth more than starting again; a fresh run has a length to
 * choose. Beside it, what a run actually is — the hint, the second try, the board — so nobody
 * starts one expecting a test. Underneath, the runs so far, each a way back in.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../../student/api.js";
import {
  IconArrowRight,
  IconBolt,
  IconBulb,
  IconChevronRight,
  IconReplay,
  IconSpark,
  IconTarget,
} from "../icons.js";
import {
  progressApi,
  type PracticeRun,
  type SubjectOverview,
} from "../progressApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import {
  Badge,
  Button,
  Card,
  CountUp,
  PageHero,
  Skeleton,
  Steps,
  cx,
  useToast,
} from "../ui.js";
import "./PracticeHub.css";

const LENGTHS = [
  { value: 5, label: "Quick" },
  { value: 10, label: "Standard" },
  { value: 20, label: "Long" },
] as const;

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
  const overview = useLoad(
    () => progressApi.overview(student.studentId),
    [student.studentId],
  );
  const runs = useLoad(
    () => progressApi.runs(student.studentId, 12),
    [student.studentId],
  );

  const subjects = overview.data?.subjects ?? [];
  const history = runs.data?.runs ?? overview.data?.recent_runs ?? [];
  const anyOpen = subjects.some((subject) => subject.open_practice_session_id);
  const sub =
    "Short sets of questions aimed at your weak spots. Miss one and you get a hint; miss it again and the coach works it through with you.";

  if (overview.error && !overview.data) {
    return (
      <div className="sj-page ph">
        <PageHero eyebrow="Practice" title="Practice" sub={sub} />
        <Card sticker="pink" className="ph-issue">
          <div className="ph-row">
            <span className="ph-tile pink" aria-hidden="true">
              <IconReplay size={18} />
            </span>
            <h2 className="sj-display sj-h3">
              We couldn’t load your subjects.
            </h2>
          </div>
          <p className="sj-muted">{overview.error}</p>
          <div>
            <Button
              tone="primary"
              icon={<IconReplay size={18} />}
              onClick={overview.reload}
            >
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
      <PageHero
        eyebrow="Practice"
        title={anyOpen ? "Pick up where you left off" : "Practice"}
        sub={sub}
        aside={
          !loading && subjects.length > 0 ? (
            <HeroStat subjects={subjects} />
          ) : undefined
        }
      />

      {loading ? (
        <div className="sj-card ph-skel">
          <Skeleton width={140} height={12} />
          <Skeleton width={220} height={30} />
          <div className="ph-subject-body">
            <Skeleton height={220} radius={14} />
            <Skeleton height={220} radius={14} />
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <GetStarted />
      ) : (
        <div className="ph-subjects">
          {subjects.map((subject, index) => (
            <SubjectCard
              key={subject.subject_id}
              subject={subject}
              open={history.find(
                (run) => run.session_id === subject.open_practice_session_id,
              )}
              delay={index}
            />
          ))}
        </div>
      )}

      {subjects.length > 0 ? (
        <section
          className="ph-history sj-rise d3"
          aria-labelledby="ph-history-title"
        >
          <div className="ph-section-head">
            <span className="sj-eyebrow">History</span>
            <h2 id="ph-history-title" className="sj-display sj-h2">
              Your runs
            </h2>
          </div>
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
          {runs.loading && !runs.data ? (
            <div className="ph-runs">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} height={76} radius={14} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="ph-norun sj-card">
              <div className="ph-row">
                <span className="ph-tile" aria-hidden="true">
                  <IconSpark size={18} />
                </span>
                <b>No runs yet</b>
              </div>
              <p className="sj-muted">
                Your first one will show up here, with how each question went.
              </p>
            </div>
          ) : (
            <div className="ph-runs">
              {history.map((run) => (
                <RunRow key={run.session_id} run={run} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {loading ? null : <HowItWorks />}
    </div>
  );
}

/* ------------------------------------------------------------------ hero stat */

/** Across every subject: how many practice questions were right with no help at all. */
function HeroStat({ subjects }: { subjects: SubjectOverview[] }) {
  const answered = subjects.reduce(
    (sum, subject) => sum + subject.practice.questions_answered,
    0,
  );
  const unaided = subjects.reduce(
    (sum, subject) => sum + subject.practice.correct_unaided,
    0,
  );
  const finished = subjects.reduce(
    (sum, subject) => sum + subject.practice.runs_finished,
    0,
  );
  return (
    <div className="ph-stat">
      <span className="ph-stat-label">Right first time</span>
      <span className="ph-stat-num sj-num">
        <CountUp value={unaided} />
        <span className="ph-stat-of">/{answered}</span>
      </span>
      <span className="ph-stat-note">
        {answered === 0
          ? "Nothing answered yet. Your first run starts the count."
          : `Answered with no hint and no help, across ${finished} finished ${finished === 1 ? "run" : "runs"}.`}
      </span>
    </div>
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
      <p className="ph-lead">
        Runs are built from the subjects you are preparing for, so they start
        with your exam. Three quick steps and your first run is ready.
      </p>
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
          {
            title: "Add your subjects",
            body: "Only the ones you are sitting. Each one gets its own runs.",
          },
          {
            title: "Start a run",
            body: "Five questions is enough to begin. You can stop any time.",
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ subject card */

function SubjectCard({
  subject,
  open,
  delay,
}: {
  subject: SubjectOverview;
  open: PracticeRun | undefined;
  delay: number;
}) {
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const [length, setLength] = useState<number>(10);
  const [starting, setStarting] = useState(false);
  const hasOpen = !!subject.open_practice_session_id;
  const checkup = subject.latest_checkup;
  const weak = checkup?.weakest_subtopics.slice(0, 3) ?? [];

  const start = () => {
    setStarting(true);
    api
      .startPractice(student.studentId, subject.subject_id, length)
      .then((state) => navigate(`/practice/${state.session_id}`))
      .catch((error: Error) => {
        toast(`Couldn’t start the run: ${error.message || "try again"}`);
        setStarting(false);
      });
  };

  return (
    <article
      className={cx(
        "sj-card sticker ph-subject sj-rise",
        `d${Math.min(delay + 1, 4)}`,
      )}
    >
      <header className="ph-subject-head">
        <span className="sj-eyebrow">
          {subject.examination_short_name} · {subject.practice.runs_finished}{" "}
          {subject.practice.runs_finished === 1 ? "run" : "runs"} finished
        </span>
        <div className="ph-row">
          <span className="ph-tile solid" aria-hidden="true">
            <IconBolt size={18} />
          </span>
          <h2 className="sj-display sj-h2">{subject.subject_name}</h2>
        </div>
      </header>

      <div className="ph-subject-body">
        {hasOpen ? (
          <Link
            to={`/practice/${subject.open_practice_session_id}`}
            className="ph-open"
          >
            <div className="ph-open-top">
              <Badge tone="yellow" dot>
                Run in progress
              </Badge>
              {open ? (
                <span className="ph-open-when sj-small">
                  {whenLabel(open.started_at)}
                </span>
              ) : null}
            </div>
            {open ? (
              <>
                <div className="ph-open-count">
                  <span className="sj-num">{open.answered}</span>
                  <span className="ph-open-of">of {open.length} answered</span>
                </div>
              {/* Question by question, in the colours the history uses. */}
              <span className="ph-open-strip">
                <RunStrip run={open} />
              </span>
                <span className="ph-open-meta sj-small">
                  {open.correct_unaided} right first time · {open.taught} taught
                </span>
              </>
            ) : (
              <span className="ph-open-meta sj-small">
                You left a run part-way through.
              </span>
            )}
            <span className="sj-btn lg block ph-open-go">
              Resume run
              <span className="arrow">
                <IconArrowRight size={18} />
              </span>
            </span>
          </Link>
        ) : null}

        <div className="ph-side">
          <div className="ph-new">
            <div className="ph-new-head">
              <span className="ph-new-title">
                {hasOpen ? "Or start a fresh run" : "How long a run?"}
              </span>
              <span className="sj-small sj-muted">You can stop any time.</span>
            </div>
            <div
              className="ph-lengths"
              role="radiogroup"
              aria-label="Run length"
            >
              {LENGTHS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={length === option.value}
                  className={cx("ph-length", length === option.value && "on")}
                  onClick={() => setLength(option.value)}
                >
                  <b>{option.label}</b>
                  <span className="sj-mono">{option.value} questions</span>
                </button>
              ))}
            </div>
            <Button
              tone={hasOpen ? "soft" : "primary"}
              size="lg"
              block
              busy={starting}
              onClick={start}
              trailing={starting ? undefined : <IconArrowRight size={18} />}
            >
              {starting
                ? "Picking questions…"
                : `Start a ${length}-question run`}
            </Button>
          </div>

          {checkup ? (
            weak.length > 0 ? (
              <div className="ph-aims">
                <span className="ph-aims-label">
                  <IconTarget size={16} /> Runs aim at your weakest areas, like
                </span>
                <div className="ph-aims-chips">
                  {weak.map((item) => (
                    <span key={item.subtopic_id} className="ph-chip">
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          ) : (
            <div className="ph-nocheck">
              <div className="ph-row">
                <span className="ph-tile yellow" aria-hidden="true">
                  <IconBulb size={18} />
                </span>
                <b>No check-up yet</b>
              </div>
              <p className="ph-nocheck-text">
                You can practise now, but a short check-up first tells us which
                topics to aim your runs at.
              </p>
              <div>
                <Button to="/checkup" tone="ghost" size="sm">
                  Take the check-up
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <dl className="ph-totals">
        <div>
          <dt>Answered</dt>
          <dd className="sj-num">{subject.practice.questions_answered}</dd>
        </div>
        <div>
          <dt>Right first time</dt>
          <dd className="sj-num">{subject.practice.correct_unaided}</dd>
        </div>
        <div>
          <dt>Taught</dt>
          <dd className="sj-num">{subject.practice.taught}</dd>
        </div>
      </dl>
    </article>
  );
}

/* ------------------------------------------------------------------ what a run is */

function HowItWorks() {
  return (
    <section
      className="ph-section ph-how sj-rise d4"
      aria-labelledby="ph-how-title"
    >
      <span className="sj-eyebrow">What a run is</span>
      <h2 id="ph-how-title" className="sj-display sj-h2">
        Help, not just marks
      </h2>
      <p className="ph-lead">
        No timer, and nothing is lost by missing. A miss just means help. The
        lines above each step use the same colours as your runs.
      </p>
      <Steps
        steps={[
          {
            title: "Say how sure you are",
            body: "After you answer and before you find out, so a lucky guess isn’t mistaken for knowing.",
          },
          {
            title: "Right first time counts",
            body: "That’s what counts towards what you know.",
          },
          {
            title: "Miss once: a hint",
            body: "Then the same question again. It no longer counts, so relax.",
          },
          {
            title: "Miss twice: the board",
            body: "The coach works it through step by step, and you can ask questions.",
          },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ history */

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
        <i
          key={index}
          className={tone}
          style={{ animationDelay: `${index * 40}ms` }}
        />
      ))}
    </span>
  );
}

function RunRow({ run }: { run: PracticeRun & { topics?: string[] } }) {
  const to = run.finished
    ? `/practice/${run.session_id}/summary`
    : `/practice/${run.session_id}`;
  return (
    <Link to={to} className={cx("ph-run", !run.finished && "open")}>
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
          {run.topics && run.topics.length > 0
            ? ` · ${run.topics.join(", ")}`
            : ""}
        </span>
      </span>
      <span className="ph-run-score">
        <RunStrip run={run} />
        <span className="ph-run-num sj-mono">
          {run.correct_unaided}/{run.answered} right
        </span>
      </span>
      <span className="ph-run-go">
        <span className="ph-run-action">
          {run.finished ? "Summary" : "Resume"}
        </span>
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}
