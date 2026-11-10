/**
 * Practice: start a run, or pick up the one that is open.
 *
 * However many subjects the student sits, the page has one shape: the subject switcher, then one
 * panel for the chosen subject across the full width — starting a run on the left, where that
 * subject stands (your score, the predicted score and the target, what runs aim at, its totals)
 * on the right — then building your
 * own run in that subject, and the runs so far, for this subject or all of them. The chosen
 * subject is in the URL (`?subject=`), so it survives a refresh and the trip back from a run.
 */

import { useRoadmap } from "../roadmapApi.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  IconArrowRight,
  IconChevronRight,
  IconLayers,
  IconReplay,
  IconSpark,
} from "../icons.js";
import {
  progressApi,
  type PracticeRun,
  type PracticeRunPage,
  type SubjectOverview,
} from "../progressApi.js";
import { runsApi } from "../runsApi.js";
import type { TopicScore, TopicStatus } from "../../student/api.js";
import { useCachedLoad, useLoad, usePageTitle, useStudent } from "../store.js";
import {
  ALL,
  PRACTICE_LOCK_WORDS,
  StatusCell,
  SubjectName,
  SubjectRows,
  SubjectSwitcher,
  isDemoSubject,
  practiceLock,
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
import { plural, useStartPractice } from "./Home.js";
import { DeleteRunDialog, IconTrash } from "./RunReport.js";
import "./PracticeHub.css";
import { friendly } from '../../lib/friendlyError.js';

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
      setMoreError(friendly(failure) || "Something went wrong.");
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
        toast(`Couldn’t delete the run: ${friendly(error) || "try again"}`);
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
  const sub = undefined;

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
                  : null}
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
          ? "No answers yet"
          : `${finished} ${finished === 1 ? "run" : "runs"} finished${across}`}
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

    </article>
  );
}

/* ------------------------------------------------------------------ what a run is */

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
  run: PracticeRun & { topics?: string[]; subtopics?: string[] };
  onDelete: () => void;
  /** With every subject listed, the row leads with the subject's name. */
  showSubject: boolean;
}) {
  const to = run.finished
    ? `/practice/${run.session_id}/report`
    : `/practice/${run.session_id}`;
  // JAMB's topics (the API's `subtopics`); its `topics` are sections, the fallback.
  const names = run.subtopics ?? run.topics ?? [];
  const topics = names.length > 0 ? names.join(", ") : "";
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
                `Your score ${st.score}%${st.predicted !== null ? ` · predicted ${st.predicted}%` : ""}`
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
        ) : practiceLock(s) ? (
          <Button
            size="sm"
            tone="dark"
            to={s.open_checkup_session_id ? `/checkup/${s.open_checkup_session_id}` : `/checkup?subject=${s.subject_id}`}
            title={PRACTICE_LOCK_WORDS[practiceLock(s)!]}
          >
            {s.open_checkup_session_id ? "Finish check-up" : practiceLock(s) === "checkup-due" ? "Check-up due" : "Check-up first"}
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

/** Each topic's score and label, by topic id, from the overview (docs/student-scoring.md §2). */
function topicScores(subject: SubjectOverview): Map<string, TopicScore> {
  return new Map((subject.scores?.topics ?? []).map((t) => [t.subtopic_id, t]));
}

const STATUS_WORD: Record<TopicStatus, string> = {
  not_tried: "not tried yet",
  just_started: "just started",
  needs_work: "needs work",
  getting_there: "getting there",
  strong: "strong",
};

/**
 * Every JAMB topic as a slice, as wide as its share of the questions, coloured by its label.
 * A slightly wider gap marks where one syllabus section ends and the next begins.
 */
function TopicBar({ topics, scores }: { topics: Options["topics"]; scores: Map<string, TopicScore> }) {
  return (
    <span className="ph-tbar" aria-hidden="true">
      {topics.flatMap((section) =>
        section.subtopics.map((t, index) => {
          const score = scores.get(t.subtopic_id);
          const status = score?.status ?? "not_tried";
          return (
            <i
              key={t.subtopic_id}
              className={cx(status, index === 0 && "sec-start")}
              style={{ flexGrow: Math.max(1, t.questions) }}
              title={`${t.name}: ${score?.score != null ? `${score.score}% (${score.right} of ${score.answered}), ` : ""}${STATUS_WORD[status]}`}
            />
          );
        }),
      )}
    </span>
  );
}

/** What the slice colours mean: the topic labels. */
function TopicKey() {
  return (
    <>
      <span>
        <i className="needs_work" /> needs work
      </span>
      <span>
        <i className="getting_there" /> getting there
      </span>
      <span>
        <i className="strong" /> strong
      </span>
      <span>
        <i className="not_tried" /> not tried yet
      </span>
    </>
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
  const student = useStudent();
  const plan = useRoadmap(student.studentId);
  const to = `/practice/new?subject=${subject.subject_id}`;
  const lock = practiceLock(subject);
  const waiting = plan.data?.record.own_runs_in ?? 0;

  return (
    <section className="ph-build ph-build-short sj-rise d2" aria-labelledby="ph-build-title">
      <span className="ph-tile ink" aria-hidden="true">
        <IconLayers size={18} />
      </span>
      <div className="ph-build-text">
        <h2 id="ph-build-title" className="sj-display sj-h3 ph-build-title">
          Build your own run
        </h2>
        <p className="ph-build-body">
          {waiting > 0
            ? `Opens after ${waiting} more planned ${waiting === 1 ? "run" : "runs"}.`
            : lock
              ? PRACTICE_LOCK_WORDS[lock]
              : "Choose the topics, years and length."}
        </p>
      </div>
      {waiting > 0 ? (
        <Button to="/roadmap" tone="dark" size="sm" trailing={<IconArrowRight size={16} />}>
          Your roadmap
        </Button>
      ) : lock ? (
        <Button
          to={subject.open_checkup_session_id ? `/checkup/${subject.open_checkup_session_id}` : `/checkup?subject=${subject.subject_id}`}
          tone="dark"
          size="sm"
          trailing={<IconArrowRight size={16} />}
        >
          Take the check-up
        </Button>
      ) : (
        <Button to={to} tone="dark" size="sm" trailing={<IconArrowRight size={16} />}>
          Build a run
        </Button>
      )}
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
            {plural(facts.subtopics, "topic")} · {facts.span || "no papers yet"} · {facts.questions.toLocaleString()} questions
          </>
        ) : (
          "Its topics and past papers, in the builder"
        )}
      </span>
      <span className="ph-bline-viz">{o && o.topics.length > 0 ? <TopicBar topics={o.topics} scores={topicScores(subject)} /> : null}</span>
      {practiceLock(subject) ? (
        <Link className="sj-link ph-bline-go" to={`/checkup?subject=${subject.subject_id}`} title={PRACTICE_LOCK_WORDS[practiceLock(subject)!]}>
          Check-up first <IconArrowRight size={14} />
        </Link>
      ) : (
        <Link className="sj-link ph-bline-go" to={`/practice/new?subject=${subject.subject_id}`}>
          Build <IconArrowRight size={14} />
        </Link>
      )}
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
          <TopicKey />
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
