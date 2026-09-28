/**
 * Practice: start a run, or pick up the one that is open.
 *
 * However many subjects the student sits, the page has one shape: the subject switcher, then one
 * panel for the chosen subject across the full width — starting a run on the left, where that
 * subject stands (its check-up, what runs aim at, its totals) on the right — then building your
 * own run in that subject, and the runs so far, for this subject or all of them. The chosen
 * subject is in the URL (`?subject=`), so it survives a refresh and the trip back from a run.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  IconArrowRight,
  IconBulb,
  IconChevronRight,
  IconLayers,
  IconReplay,
  IconSpark,
  IconTarget,
  IconTrophy,
} from "../icons.js";
import {
  progressApi,
  type PracticeRun,
  type PracticeRunPage,
  type SubjectOverview,
} from "../progressApi.js";
import { runsApi } from "../runsApi.js";
import { useCachedLoad, useLoad, usePageTitle, useStudent } from "../store.js";
import {
  ALL,
  StatusCell,
  SubjectName,
  SubjectRows,
  SubjectSwitcher,
  isDemoSubject,
  subjectStatus,
  useOverview,
  useSubjectChoice,
  type SubjectColumn,
} from "../SubjectSwitcher.js";
import {
  Badge,
  Button,
  Card,
  CountUp,
  PageHero,
  ShowMore,
  Skeleton,
  Steps,
  cx,
  useShowMore,
  useToast,
} from "../ui.js";
import { plural, useStartCheckup, useStartPractice } from "./Home.js";
import { DeleteRunDialog, IconTrash } from "./RunReport.js";
import "./PracticeHub.css";

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
  const runs = useLoad(
    () => progressApi.runs(student.studentId, PAGE),
    [student.studentId],
  );
  const toast = useToast();
  // Older pages, loaded on demand (the same pattern as the progress page).
  const [extra, setExtra] = useState<PracticeRunPage["runs"]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Deleted here: out of the list at once, back in if the server says no.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string | null>(null);

  const subjects = overview.data?.subjects ?? [];
  // One subject in focus (the last chosen, else the most urgent), or every subject at once.
  const [chosenId, choose] = useSubjectChoice(subjects, { allowAll: true });
  const many = subjects.length > 1;
  const showAll = many && chosenId === ALL;
  const subject = showAll ? undefined : (subjects.find((s) => s.subject_id === chosenId) ?? subjects[0]);

  useEffect(() => {
    if (runs.data) {
      setExtra([]);
      setNext(runs.data.next_before);
    }
  }, [runs.data]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await progressApi.runs(student.studentId, PAGE, next);
      setExtra((current) => [...current, ...page.runs]);
      setNext(page.next_before);
    } catch (failure) {
      setMoreError((failure as Error).message || "Something went wrong.");
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = (sessionId: string) => {
    setAsking(null);
    setGone((current) => new Set(current).add(sessionId));
    runsApi
      .remove(sessionId)
      .then(() => {
        toast("Run deleted");
        // A deleted open run is no longer there to resume.
        overview.reload();
      })
      .catch((error: Error) => {
        setGone((current) => {
          const back = new Set(current);
          back.delete(sessionId);
          return back;
        });
        toast(`Couldn’t delete the run: ${error.message || "try again"}`);
      });
  };

  const everyRun = (
    runs.data
      ? [...runs.data.runs, ...extra]
      : (overview.data?.recent_runs ?? [])
  ).filter((run) => !gone.has(run.session_id));
  const scopeAll = !subject || !many;
  const history = scopeAll
    ? everyRun
    : everyRun.filter((run) => run.subject_id === subject.subject_id);
  const anyOpen = subjects.some((s) => s.open_practice_session_id);
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
        <div className="ph-focus" aria-busy="true">
          <Skeleton width={320} height={40} radius={8} />
          <div className="ph-panel ph-panel-skel">
            <Skeleton height={260} radius={10} />
            <Skeleton height={260} radius={10} />
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <GetStarted />
      ) : (
        <>
          <section className="ph-focus sj-rise d1" aria-label="Start a run">
            {many ? (
              <div className="ph-switch">
                <SubjectSwitcher
                  subjects={subjects}
                  value={showAll ? ALL : (subject?.subject_id ?? null)}
                  onChange={choose}
                  allowAll
                  label="Practise"
                />
              </div>
            ) : null}
            {subject ? (
              <SubjectPanel
                key={subject.subject_id}
                subject={subject}
                open={everyRun.find(
                  (run) => run.session_id === subject.open_practice_session_id,
                )}
              />
            ) : (
              <AllSubjects subjects={subjects} onFocus={choose} />
            )}
          </section>
          {subject ? <BuildOwn subject={subject} /> : <BuildOwnAll subjects={subjects} onFocus={choose} />}
        </>
      )}

      {subjects.length > 0 ? (
        <section
          className="ph-history sj-rise d3"
          aria-labelledby="ph-history-title"
        >
          <div className="ph-history-head">
            <div className="ph-section-head">
              <span className="sj-eyebrow">History</span>
              <h2 id="ph-history-title" className="sj-display sj-h2">
                {scopeAll ? "Your runs" : `Your ${subject.subject_name} runs`}
              </h2>
            </div>
            {many && subject ? (
              <button type="button" className="sj-link ph-seeall" onClick={() => choose(ALL)}>
                Runs in every subject <IconArrowRight size={14} />
              </button>
            ) : null}
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
                <Skeleton key={index} height={64} radius={10} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="ph-norun">
              <div className="ph-row">
                <span className="ph-tile" aria-hidden="true">
                  <IconSpark size={18} />
                </span>
                <b>
                  {scopeAll
                    ? "No runs yet"
                    : `No ${subject?.subject_name} runs ${next ? "loaded yet" : "yet"}`}
                </b>
              </div>
              <p className="sj-muted">
                {next && !scopeAll
                  ? "Older runs may have some. Load more to look further back."
                  : "Your first one will show up here, with how each question went."}
              </p>
              {next && !scopeAll ? (
                <div>
                  <Button tone="ghost" size="sm" busy={loadingMore} onClick={loadMore}>
                    Look further back
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="ph-runs">
                {history.map((run) => (
                  <RunRow
                    key={run.session_id}
                    run={run}
                    showSubject={scopeAll && many}
                    onDelete={() => setAsking(run.session_id)}
                  />
                ))}
              </ul>
              {next ? (
                <div className="ph-more">
                  <Button tone="ghost" busy={loadingMore} onClick={loadMore}>
                    Load more runs
                  </Button>
                </div>
              ) : runs.data && everyRun.length > PAGE ? (
                <p className="ph-end sj-mono">That’s every run.</p>
              ) : null}
              {moreError ? (
                <p className="ph-alert" role="alert">
                  We couldn’t load more: {moreError}
                </p>
              ) : null}
            </>
          )}
          <DeleteRunDialog
            open={asking !== null}
            onClose={() => setAsking(null)}
            onConfirm={() => asking && remove(asking)}
          />
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
  const across = subjects.length > 1 ? ` in ${subjects.length} subjects` : "";
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
          : finished === 0
            ? `Answered with no hint and no help so far${across}. Finish a run to see it counted by run.`
            : `Answered with no hint and no help, across ${finished} finished ${finished === 1 ? "run" : "runs"}${across}.`}
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

/* ------------------------------------------------------------------ the focused subject */

/**
 * One subject across the full width: on the left, the open run (if any) and a fresh run's
 * length and start; on the right, where the subject stands and what the runs aim at.
 */
function SubjectPanel({
  subject,
  open,
}: {
  subject: SubjectOverview;
  open: PracticeRun | undefined;
}) {
  const hasOpen = !!subject.open_practice_session_id;
  const finished = subject.practice.runs_finished;

  const p = subject.practice;

  return (
    <article className="ph-panel" aria-labelledby="ph-panel-title">
      <header className="ph-panel-head">
        <div className="ph-panel-name">
          <span className="sj-eyebrow">
            {subject.examination_short_name} ·{" "}
            {finished === 0 ? "no runs finished yet" : `${finished} ${finished === 1 ? "run" : "runs"} finished`}
          </span>
          <h2 id="ph-panel-title" className="sj-display sj-h2">
            {subject.subject_name}
          </h2>
        </div>
        {p.questions_answered > 0 ? (
          <dl className="ph-totals" aria-label={`${subject.subject_name} practice so far`}>
            <div>
              <dd className="sj-num">{p.questions_answered}</dd>
              <dt>answered</dt>
            </div>
            <div>
              <dd className="sj-num">{p.correct_unaided}</dd>
              <dt>right first time</dt>
            </div>
            <div>
              <dd className="sj-num">{p.taught}</dd>
              <dt>taught</dt>
            </div>
          </dl>
        ) : (
          <p className="ph-totals-none">No questions answered yet</p>
        )}
      </header>

      {/* A run under way is the one thing to pick up here. A new run starts from the build
          card below, so there is one way in, not two. */}
      <div className={cx("ph-start", !hasOpen && "empty")}>
        {hasOpen ? (
          <Link
            to={`/practice/${subject.open_practice_session_id}`}
            className="ph-open"
          >
            <span className="ph-open-text">
              <span className="ph-open-top">
                <Badge tone="yellow" dot>
                  Run in progress
                </Badge>
                {open ? (
                  <span className="ph-open-when sj-small">
                    {whenLabel(open.started_at)}
                  </span>
                ) : null}
              </span>
              {open ? (
                <>
                  <span className="ph-open-count">
                    <b className="sj-num">{open.answered}</b> of {open.length} answered
                    <span className="sj-muted"> · {open.correct_unaided} right first time · {open.taught} taught</span>
                  </span>
                  <span className="ph-open-strip">
                    <RunStrip run={open} />
                  </span>
                </>
              ) : (
                <span className="ph-open-count sj-muted">
                  You left a run part-way through.
                </span>
              )}
            </span>
            <span className="sj-btn ph-open-go">
              Resume
              <span className="arrow">
                <IconArrowRight size={18} />
              </span>
            </span>
          </Link>
        ) : null}
      </div>

      <SubjectStanding subject={subject} />
    </article>
  );
}

/**
 * The panel's foot: where the subject stands, as one band across the full width. Checked, it is
 * the predicted score, what runs aim at, and the report; otherwise the one step that comes next.
 */
function SubjectStanding({ subject }: { subject: SubjectOverview }) {
  const checkup = useStartCheckup();
  const status = subjectStatus(subject);
  const latest = subject.latest_checkup;
  const weak = latest?.weakest_subtopics.slice(0, 3) ?? [];
  // The gap the rest of the app quotes: where the plan gets to by exam day, against the target.
  const projectedGap =
    status.target !== null && status.score !== null
      ? Math.round(status.target - (latest?.score_projected ?? status.score))
      : 0;

  let body;
  if (status.kind === "checkup-open") {
    body = (
      <Callout
        icon={<IconReplay size={18} />}
        title="Finish your check-up"
        action={
          <Button to={`/checkup/${subject.open_checkup_session_id}`} size="sm" tone="dark" trailing={<IconArrowRight size={16} />}>
            Resume check-up
          </Button>
        }
      >
        Your answers so far are saved. Once it is done, runs aim at what it finds.
      </Callout>
    );
  } else if (status.kind === "no-goal") {
    body = (
      <Callout
        icon={<IconTrophy size={18} />}
        title={`No ${subject.subject_name} goal yet`}
        action={
          <Button to={`/subjects/${subject.subject_id}/goal`} size="sm" tone="dark" trailing={<IconArrowRight size={16} />}>
            Set my goal
          </Button>
        }
      >
        You can practise now. A target and a date let a check-up predict your score.
      </Callout>
    );
  } else if (status.kind === "no-checkup") {
    body = (
      <Callout
        icon={<IconBulb size={18} />}
        title={`No ${subject.subject_name} check-up yet`}
        action={
          <Button
            size="sm"
            tone="dark"
            busy={checkup.busy}
            disabled={isDemoSubject(subject.subject_id)}
            onClick={() => checkup.start(subject.subject_id)}
            trailing={checkup.busy ? undefined : <IconArrowRight size={16} />}
          >
            Take the check-up
          </Button>
        }
      >
        About 15 questions tell us which topics to aim your runs at, and predict your score.
      </Callout>
    );
  } else {
    body = (
      <div className="ph-stand">
        <div className="ph-score">
          {status.score !== null ? (
            <>
              <span className="ph-score-num">
                <span className="sj-num">{status.score}</span>
                <span className="sj-mono">/100</span>
              </span>
              <span className="ph-score-words">
                <b>Predicted today</b>
                <span>
                  {status.target !== null
                    ? projectedGap > 0
                      ? `${projectedGap} short of your ${status.target} by exam day`
                      : `On track for your ${status.target}`
                    : "No target set"}
                </span>
              </span>
            </>
          ) : (
            <span className="ph-score-words">
              <b>Checked</b>
              <span>
                <Link className="sj-link" to={`/subjects/${subject.subject_id}/goal`}>
                  Add a goal
                </Link>{" "}
                to turn it into a predicted score.
              </span>
            </span>
          )}
        </div>
        <div className="ph-aims">
          <span className="ph-aims-label">
            <IconTarget size={16} />
            {weak.length > 0 ? "Runs aim at these first" : "Runs aim at your weakest areas first"}
          </span>
          {weak.length > 0 ? (
            <div className="ph-aims-chips">
              {weak.map((item) => (
                <span key={item.subtopic_id} className="ph-chip">
                  {item.name}
                  <b className="sj-mono">{Math.round(item.mastery * 100)}%</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {latest ? (
          <Link className="sj-link ph-report" to={`/checkup/${latest.session_id}/report`}>
            Check-up report <IconArrowRight size={14} />
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <footer className="ph-standing" aria-label={`Where ${subject.subject_name} stands`}>
      {body}
      {checkup.error ? (
        <p className="ph-alert" role="alert">
          {checkup.error}
        </p>
      ) : null}
    </footer>
  );
}

/** The next step for an unchecked subject: icon, words and the one button, on one line. */
function Callout({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="ph-callout">
      <span className="ph-tile yellow" aria-hidden="true">
        {icon}
      </span>
      <span className="ph-callout-text">
        <b>{title}</b>
        <span>{children}</span>
      </span>
      <span className="ph-callout-go">{action}</span>
    </div>
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

function RunRow({
  run,
  onDelete,
  showSubject,
}: {
  run: PracticeRun & { topics?: string[] };
  onDelete: () => void;
  /** With every subject listed, the row leads with the subject's name. */
  showSubject: boolean;
}) {
  const to = run.finished
    ? `/practice/${run.session_id}/report`
    : `/practice/${run.session_id}`;
  const topics = run.topics && run.topics.length > 0 ? run.topics.join(", ") : "";
  const title = showSubject ? run.subject_name : topics || `${run.length}-question run`;
  const detail = showSubject ? topics : "";
  return (
    <li className={cx("ph-run", !run.finished && "open")}>
      <Link to={to} className="ph-run-link">
        <span className="ph-run-main">
          <span className="ph-run-title">
            <b>{title}</b>
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
            {detail ? ` · ${detail}` : ""}
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
            {run.finished ? "Report" : "Resume"}
          </span>
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

/* ------------------------------------------------------------------ every subject at once */

/**
 * "All subjects": each subject as one row — its check-up, its practice so far, and a run to
 * start or resume. The name opens that subject's own panel.
 */
function AllSubjects({
  subjects,
  onFocus,
}: {
  subjects: SubjectOverview[];
  onFocus: (id: string) => void;
}) {
  const starter = useStartPractice();
  const more = useShowMore(subjects, 10);
  const columns: SubjectColumn[] = [
    {
      key: "name",
      head: "Subject",
      width: "minmax(0, 1.4fr)",
      phone: "lead",
      cell: (s) => (
        <SubjectName
          subject={s}
          to={
            <button type="button" className="ph-namebtn" onClick={() => onFocus(s.subject_id)}>
              {s.subject_name}
            </button>
          }
        />
      ),
    },
    {
      key: "check",
      head: "Check-up",
      width: "minmax(0, 1fr)",
      cell: (s) => {
        const st = subjectStatus(s);
        return (
          <StatusCell
            subject={s}
            detail={
              st.score !== null ? (
                `Predicted ${st.score}${st.target !== null ? ` of ${st.target}` : ""}`
              ) : st.kind === "no-checkup" ? (
                <Link className="ph-checklink" to={`/checkup?subject=${s.subject_id}`}>
                  Take the check-up
                </Link>
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "practice",
      head: "Practice so far",
      width: "minmax(0, 1.2fr)",
      cell: (s) => {
        const p = s.practice;
        return p.questions_answered > 0 ? (
          <span className="ph-practicecell">
            <b>{plural(p.questions_answered, "answer")}</b>
            <small>
              {Math.round((p.correct_unaided / p.questions_answered) * 100)}% right first time · {p.taught} taught
            </small>
          </span>
        ) : (
          <span className="ph-practicecell none">
            <b>Not started</b>
            <small>No runs yet</small>
          </span>
        );
      },
    },
    {
      key: "go",
      head: "",
      width: "150px",
      align: "end",
      phone: "end",
      cell: (s) =>
        s.open_practice_session_id ? (
          <Button size="sm" tone="dark" to={`/practice/${s.open_practice_session_id}`} trailing={<IconArrowRight size={16} />}>
            Resume run
          </Button>
        ) : (
          <Button
            size="sm"
            tone="ghost"
            busy={starter.busy === s.subject_id}
            disabled={isDemoSubject(s.subject_id) || (starter.busy !== null && starter.busy !== s.subject_id)}
            onClick={() => void starter.start(s.subject_id)}
          >
            Start a run
          </Button>
        ),
    },
  ];
  return (
    <div className="ph-all">
      <SubjectRows subjects={more.items} columns={columns} label="Practice in every subject" id="ph-all-rows" />
      <ShowMore more={more} noun="subjects" controls="ph-all-rows" />
      {starter.error ? (
        <p className="ph-alert" role="alert">
          {starter.error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ build your own */

/** The builder's own lengths, so the preview offers what the builder does. */
const BUILD_LENGTHS = [5, 10, 20, 40];

type Options = NonNullable<Awaited<ReturnType<typeof runsApi.options>>>;

/** The builder's range for a subject, remembered per subject so switching back is instant. */
function useOptions(subjectId: string) {
  const student = useStudent();
  return useCachedLoad<Options | null>(`options:${student.studentId}:${subjectId}`, () =>
    isDemoSubject(subjectId) ? Promise.resolve(null) : runsApi.options(student.studentId, subjectId).catch(() => null),
  );
}

function optionFacts(o: Options) {
  const subtopics = o.topics.reduce((n, t) => n + t.subtopics.length, 0);
  const questions = o.topics.reduce((n, t) => n + t.questions, 0);
  const years = [...o.years].sort((a, b) => a.exam_year - b.exam_year);
  const span = years.length
    ? years.length === 1
      ? String(years[0]!.exam_year)
      : `${years[0]!.exam_year}–${years[years.length - 1]!.exam_year}`
    : "";
  return { subtopics, questions, years, span };
}

/** A topic's standing from its subtopics' mastery, for the colour of its slice. */
function topicTone(topic: Options["topics"][number]): string {
  const known = topic.subtopics.map((s) => s.mastery).filter((m): m is number => m !== null);
  if (known.length === 0) return "none";
  const m = known.reduce((a, b) => a + b, 0) / known.length;
  if (m >= 0.75) return "strong";
  if (m >= 0.5) return "holding";
  if (m >= 0.3) return "shaky";
  return "weak";
}

/** Every topic as a slice, as wide as its share of the questions, coloured by where you stand. */
function TopicBar({ topics }: { topics: Options["topics"] }) {
  return (
    <span className="ph-tbar" aria-hidden="true">
      {topics.map((t) => (
        <i
          key={t.topic_id}
          className={topicTone(t)}
          style={{ flexGrow: Math.max(1, t.questions) }}
          title={`${t.name}: ${t.questions} questions`}
        />
      ))}
    </span>
  );
}

/** Questions per exam year, oldest on the left. */
function YearBars({ years }: { years: Options["years"] }) {
  const max = Math.max(1, ...years.map((y) => y.questions));
  return (
    <span className="ph-ybars" aria-hidden="true">
      {years.map((y) => (
        <i key={y.exam_year} style={{ height: `${Math.max(12, (y.questions / max) * 100)}%` }} title={`${y.exam_year}: ${y.questions} questions`} />
      ))}
    </span>
  );
}

/**
 * The way into a run the student shapes, in the chosen subject, drawn as the builder's three
 * choices with the subject's real range: every topic as a slice (width = its questions, colour =
 * how you stand), questions per exam year, and the lengths on offer. Each choice opens the
 * builder. Loading keeps the same shape; with no range to show, the steps still say what each
 * choice is, so the card is never half-empty.
 */
function BuildOwn({ subject }: { subject: SubjectOverview }) {
  const options = useOptions(subject.subject_id);
  const to = `/practice/new?subject=${subject.subject_id}`;
  const o = options.data;
  const facts = o ? optionFacts(o) : null;
  const loading = options.loading && options.data === undefined;
  const checked = !!subject.latest_checkup;

  const steps = [
    {
      n: "01",
      label: "Topics",
      value: facts && o ? `${plural(o.topics.length, "topic")} · ${facts.subtopics} parts` : "Any of its topics",
      viz: o && o.topics.length > 0 ? <TopicBar topics={o.topics} /> : null,
      note: facts && o
        ? checked
          ? "Width is the questions in each; colour is how you stand."
          : "Width is the questions in each topic."
        : "Whole topics, or single parts of one.",
    },
    {
      n: "02",
      label: "Exam years",
      value: facts && facts.years.length > 0 ? `${facts.span} · ${plural(facts.years.length, "paper")}` : "Any past paper",
      viz: facts && facts.years.length > 0 ? <YearBars years={facts.years} /> : null,
      note: facts ? `${facts.questions.toLocaleString()} questions to draw from.` : "One year, a few, or all of them.",
    },
    {
      n: "03",
      label: "Length",
      value: `${BUILD_LENGTHS[0]} to ${BUILD_LENGTHS[BUILD_LENGTHS.length - 1]} questions`,
      viz: (
        <span className="ph-lchips" aria-hidden="true">
          {BUILD_LENGTHS.map((n) => (
            <i key={n} className={cx(n === 40 && "full")}>
              {n}
            </i>
          ))}
        </span>
      ),
      note: "Up to a whole paper. Misses still get a hint, then the board.",
    },
  ];

  return (
    <section className="ph-build sj-rise d2" aria-labelledby="ph-build-title">
      <div className="ph-build-head">
        <span className="ph-row">
          <span className="ph-tile ink" aria-hidden="true">
            <IconLayers size={18} />
          </span>
          <h2 id="ph-build-title" className="sj-display sj-h3 ph-build-title">
            Build your own {subject.subject_name} run
          </h2>
        </span>
        <p className="ph-build-body">
          Choose the topics, the exam years and how long. Good for going over one topic, or sitting a
          whole year’s paper.
        </p>
        <Button to={to} tone="dark" size="sm" className="ph-build-go" trailing={<IconArrowRight size={16} />}>
          Build a run
        </Button>
      </div>
      <ol className="ph-bsteps">
        {steps.map((step) => (
          <li key={step.n}>
            <Link to={to} className="ph-bstep" aria-label={`${step.label}: ${step.value}. Open the run builder`}>
              <span className="ph-bstep-top">
                <span className="ph-bstep-n sj-mono">
                  {step.n} · {step.label}
                </span>
                <IconChevronRight size={16} className="ph-bstep-go" />
              </span>
              {loading ? (
                <>
                  <Skeleton width="70%" height={18} radius={6} />
                  <Skeleton height={28} radius={6} />
                  <Skeleton width="85%" height={12} radius={6} />
                </>
              ) : (
                <>
                  <b className="ph-bstep-value">{step.value}</b>
                  {step.viz ?? <span className="ph-bstep-blank" aria-hidden="true" />}
                  <small className="ph-bstep-note">{step.note}</small>
                </>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One subject's line in the "All subjects" builder card: its real range, and the way in. */
function BuildLine({ subject, onFocus }: { subject: SubjectOverview; onFocus: (id: string) => void }) {
  const options = useOptions(subject.subject_id);
  const o = options.data;
  const facts = o ? optionFacts(o) : null;
  const loading = options.loading && options.data === undefined;
  return (
    <li className="ph-bline">
      <button type="button" className="ph-bline-name" onClick={() => onFocus(subject.subject_id)}>
        <b>{subject.subject_name}</b>
        <small className="sj-mono">{subject.examination_short_name}</small>
      </button>
      <span className="ph-bline-facts">
        {loading ? (
          <Skeleton width={220} height={14} radius={6} />
        ) : facts && o ? (
          <>
            {plural(o.topics.length, "topic")} · {facts.span || "no papers yet"} · {facts.questions.toLocaleString()} questions
          </>
        ) : (
          "Its topics and past papers, in the builder"
        )}
      </span>
      <span className="ph-bline-viz">{o && o.topics.length > 0 ? <TopicBar topics={o.topics} /> : null}</span>
      <Link className="sj-link ph-bline-go" to={`/practice/new?subject=${subject.subject_id}`}>
        Build <IconArrowRight size={14} />
      </Link>
    </li>
  );
}

/** With every subject showing: the builder is one subject at a time, so each gets a line. */
function BuildOwnAll({ subjects, onFocus }: { subjects: SubjectOverview[]; onFocus: (id: string) => void }) {
  const more = useShowMore(subjects, 4);
  return (
    <section className="ph-build all sj-rise d2" aria-labelledby="ph-build-title">
      <div className="ph-build-head">
        <span className="ph-row">
          <span className="ph-tile ink" aria-hidden="true">
            <IconLayers size={18} />
          </span>
          <h2 id="ph-build-title" className="sj-display sj-h3 ph-build-title">
            Build your own run
          </h2>
        </span>
        <p className="ph-build-body">
          Pick a subject, then its topics, exam years and length. Each line is that subject’s real range.
        </p>
        <p className="ph-tkey" aria-hidden="true">
          <span>Each bar: its topics, as wide as their questions</span>
          <span>
            <i className="weak" /> weak
          </span>
          <span>
            <i className="shaky" /> shaky
          </span>
          <span>
            <i className="strong" /> strong
          </span>
          <span>
            <i className="none" /> not checked yet
          </span>
        </p>
      </div>
      <ul className="ph-blines" id="ph-build-lines">
        {more.items.map((s) => (
          <BuildLine key={s.subject_id} subject={s} onFocus={onFocus} />
        ))}
      </ul>
      <ShowMore more={more} noun="subjects" controls="ph-build-lines" />
    </section>
  );
}
