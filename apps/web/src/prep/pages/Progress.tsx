/**
 * Progress: what the student has done and what it says. The hero carries the two headline
 * numbers; the signature is a strip of every run, one bar each, split into right first time,
 * taught and missed; then the latest check-up per subject beside its topic picture, and the full
 * run history, a page at a time.
 *
 * The run history is paged by the server; the subject filter works on what has been loaded, and
 * says so when it is waiting on older runs to find more.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, type CheckupReport } from "../../student/api.js";
import { IconArrowRight, IconBolt, IconChart, IconChevronRight, IconTarget } from "../icons.js";
import { progressApi, type PracticeRunPage, type SubjectOverview } from "../progressApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import { Badge, Button, CountUp, PageHero, Skeleton, cx } from "../ui.js";
import {
  HeroStats,
  MasteryBar,
  Note,
  RunRow,
  Section,
  fmtScore,
  masteryWord,
  plural,
  runHref,
  shortDate,
} from "./Home.js";
import "./Progress.css";

const PAGE = 20;
/** The strip always shows at least this many slots, so a first run has room to grow into. */
const STRIP_SLOTS = 12;

/* ================================================================== topic strengths (shared) */

/** The legend for mastery bars: what the colour means, and what the stripes mean. */
export function MasteryLegend() {
  return (
    <div className="prog-legend" aria-label="How to read the bars">
      <span className="scale">
        <span className="sj-mono">Weak</span>
        <i className="grad" />
        <span className="sj-mono">Strong</span>
      </span>
      <span className="none">
        <i className="stripe" />
        Not checked yet
      </span>
    </div>
  );
}

/**
 * Topics from a check-up report, each opening onto its subtopics. Silence is not weakness: a
 * subtopic the check-up did not reach is shown striped, as not checked, not as a low bar.
 */
export function TopicStrengths({ report, openFirst = false }: { report: CheckupReport; openFirst?: boolean }) {
  const groups = useMemo(() => {
    const byTopic = new Map<string, CheckupReport["subtopics"]>();
    for (const sub of report.subtopics) {
      const list = byTopic.get(sub.topic_name) ?? [];
      list.push(sub);
      byTopic.set(sub.topic_name, list);
    }
    const topics = report.topics.map((topic) => ({ topic, subs: byTopic.get(topic.name) ?? [] }));
    // Weakest first: that's where the marks are.
    return topics.sort((a, b) => (a.topic.mastery ?? 2) - (b.topic.mastery ?? 2));
  }, [report]);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(openFirst && groups[0] ? [groups[0].topic.topic_id] : []),
  );
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="prog-topics">
      {groups.map(({ topic, subs }) => {
        const isOpen = open.has(topic.topic_id);
        const panelId = `prog-topic-${topic.topic_id}`;
        const checked = subs.filter((s) => s.mastery !== null).length;
        return (
          <li key={topic.topic_id} className={cx("prog-topic", isOpen && "open")}>
            <button
              type="button"
              className="prog-topic-head"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(topic.topic_id)}
            >
              <span className="name">
                <strong>{topic.name}</strong>
                <span className="meta sj-mono">
                  {topic.correct}/{topic.answered} right · {checked}/{subs.length} parts checked
                </span>
              </span>
              <span className="bar">
                <MasteryBar value={topic.mastery} label={`${topic.name} mastery`} />
                <span className="word">{masteryWord(topic.mastery)}</span>
              </span>
              <IconChevronRight size={18} className="chev" />
            </button>
            <div id={panelId} className="prog-subs" hidden={!isOpen}>
              <ul>
                {subs.map((sub) => (
                  <li key={sub.subtopic_id}>
                    <span className="sub-name">{sub.name}</span>
                    <span className="bar">
                      <MasteryBar value={sub.mastery} label={`${sub.name} mastery`} />
                      <span className={cx("sub-word sj-mono", sub.mastery === null && "none")}>
                        {sub.mastery === null ? "Not checked" : `${Math.round(sub.mastery * 100)}%`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ================================================================== the run strip */

type Run = PracticeRunPage["runs"][number];

/** Every run as one bar, oldest on the left: right first time, taught, missed, not yet answered. */
function RunStrip({ runs }: { runs: Run[] }) {
  const ordered = [...runs].reverse();
  const ghosts = Math.max(0, STRIP_SLOTS - ordered.length);
  return (
    <div className="sj-card sticker prog-strip">
      <ul className="prog-strip-key" aria-label="What the colours mean">
        <li>
          <i className="r" />
          Right first time
        </li>
        <li>
          <i className="t" />
          Taught on the board
        </li>
        <li>
          <i className="x" />
          Missed
        </li>
        <li>
          <i className="o" />
          Not answered yet
        </li>
      </ul>
      <div className="prog-strip-scroll">
        <ol className="prog-strip-cols" style={{ gridTemplateColumns: `repeat(${ordered.length + ghosts}, minmax(20px, 1fr))` }}>
          {ordered.map((run, index) => {
            const missed = Math.max(0, run.answered - run.correct_unaided - run.taught);
            const open = Math.max(0, run.length - run.answered);
            const summary = `Run ${index + 1}, ${run.subject_name}, ${shortDate(run.started_at)}: ${run.correct_unaided} right first time, ${run.taught} taught, ${missed} missed${open ? `, ${open} not answered yet` : ""}`;
            return (
              <li key={run.session_id}>
                <Link className={cx("prog-col", !run.finished && "open")} to={runHref(run)} aria-label={summary} title={summary}>
                  <span className="bar">
                    <span className="seg o" style={{ flexGrow: open }} />
                    <span className="seg x" style={{ flexGrow: missed }} />
                    <span className="seg t" style={{ flexGrow: run.taught }} />
                    <span className="seg r" style={{ flexGrow: run.correct_unaided }} />
                  </span>
                  <span className="n sj-mono">{index + 1}</span>
                </Link>
              </li>
            );
          })}
          {Array.from({ length: ghosts }, (_, i) => (
            <li key={`ghost-${i}`} className="ghost" aria-hidden="true">
              <span className="bar" />
              <span className="n" />
            </li>
          ))}
        </ol>
      </div>
      <p className="prog-strip-note">
        {ordered.length === 0
          ? "Each run you do adds a bar here, so you can watch the green grow."
          : `Each bar is one run, oldest on the left. Tap a bar to open that run.`}
      </p>
    </div>
  );
}

/* ================================================================== subject check-up card */

function SubjectSummary({ subject }: { subject: SubjectOverview }) {
  const latest = subject.latest_checkup;
  const p = subject.practice;
  const rate = p.questions_answered > 0 ? p.correct_unaided / p.questions_answered : null;
  return (
    <article className="sj-card prog-subject">
      <header className="prog-subject-head">
        <div className="text">
          <span className="sj-eyebrow">{subject.examination_short_name}</span>
          <h3 className="sj-display sj-h3">{subject.subject_name}</h3>
        </div>
        <Link className="sj-link" to={`/subjects/${subject.subject_id}`}>
          Open <IconArrowRight size={14} />
        </Link>
      </header>

      <div className="prog-snap">
        <span className="label sj-mono">Predicted score</span>
        <div className="num">
          {latest?.score_now !== null && latest?.score_now !== undefined ? (
            <>
              <span className="sj-num">{fmtScore(latest.score_now)}</span>
              <span className="sj-mono of">/100</span>
            </>
          ) : (
            <span className="sj-num dim">—</span>
          )}
        </div>
        <p className="line">
          {latest
            ? latest.score_now !== null
              ? `What you'd likely get if you sat the exam today. From your ${plural(latest.answered, "question")} check-up on ${shortDate(latest.finished_at)}.`
              : "Add a target and exam date and this check-up turns into a predicted score."
            : "A check-up shows where you stand and what to practise first."}
        </p>
      </div>

      <dl className="prog-mini">
        <div>
          <dt>Runs</dt>
          <dd className="sj-num">{p.runs_finished}</dd>
        </div>
        <div>
          <dt>Answered</dt>
          <dd className="sj-num">{p.questions_answered}</dd>
        </div>
        <div>
          <dt>First time</dt>
          <dd className="sj-num">{rate === null ? "—" : `${Math.round(rate * 100)}%`}</dd>
        </div>
      </dl>

      <div className="prog-subject-actions">
        {latest ? (
          <Button to={`/checkup/${latest.session_id}/report`} tone="soft" size="sm" trailing={<IconArrowRight size={16} />}>
            Read the report
          </Button>
        ) : (
          <Button to={`/subjects/${subject.subject_id}`} tone="soft" size="sm" trailing={<IconArrowRight size={16} />}>
            Take a check-up
          </Button>
        )}
        {latest && latest.score_now === null ? (
          <Link className="sj-link" to={`/subjects/${subject.subject_id}/goal`}>
            Set my goal
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function StrengthsCard({ subject }: { subject: SubjectOverview }) {
  const latest = subject.latest_checkup;
  const report = useLoad<CheckupReport | null>(
    () => (latest ? api.report(latest.session_id) : Promise.resolve(null)),
    [latest?.session_id],
  );
  return (
    <div className="sj-card prog-panel">
      {!latest ? (
        <Note
          icon={<IconTarget size={18} />}
          title="No check-up yet"
          action={
            <Button to={`/subjects/${subject.subject_id}`} trailing={<IconArrowRight size={18} />}>
              Take a check-up
            </Button>
          }
        >
          Your topic strengths come from a check-up. It's short, and it's where your plan starts.
        </Note>
      ) : report.error ? (
        <Note
          icon={<IconChart size={18} />}
          tone="pink"
          title="We couldn't load your topics"
          action={
            <Button tone="soft" onClick={report.reload}>
              Try again
            </Button>
          }
        >
          Your check-up is safe. This is just a loading hiccup.
        </Note>
      ) : !report.data ? (
        <div className="prog-skel">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={58} radius={10} />
          ))}
        </div>
      ) : (
        <>
          <MasteryLegend />
          <TopicStrengths report={report.data} />
        </>
      )}
    </div>
  );
}

/* ================================================================== the page */

export function Progress() {
  usePageTitle("Progress");
  const student = useStudent();
  const overview = useLoad(() => progressApi.overview(student.studentId), [student.studentId]);
  const first = useLoad(() => progressApi.runs(student.studentId, PAGE), [student.studentId]);
  const [extra, setExtra] = useState<PracticeRunPage["runs"]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (first.data) {
      setExtra([]);
      setNext(first.data.next_before);
    }
  }, [first.data]);

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

  const subjects = overview.data?.subjects ?? [];
  const runs = [...(first.data?.runs ?? []), ...extra];
  const shown = filter === "all" ? runs : runs.filter((run) => run.subject_id === filter);
  const filterSubject = subjects.find((s) => s.subject_id === filter);
  const scope = filterSubject ? [filterSubject] : subjects;
  const strengthSubject = filterSubject ?? subjects.find((s) => s.latest_checkup) ?? subjects[0];
  // Subjects with runs but no goal or sitting still get a chip.
  const chipSubjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of subjects) seen.set(s.subject_id, s.subject_name);
    for (const r of runs) if (!seen.has(r.subject_id)) seen.set(r.subject_id, r.subject_name);
    return [...seen.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, runs.length]);

  const totals = scope.reduce(
    (sum, s) => ({
      runs: sum.runs + s.practice.runs_finished,
      answered: sum.answered + s.practice.questions_answered,
      right: sum.right + s.practice.correct_unaided,
    }),
    { runs: 0, answered: 0, right: 0 },
  );
  const rate = totals.answered > 0 ? Math.round((totals.right / totals.answered) * 100) : null;

  const hero = (
    <PageHero
      eyebrow={filterSubject ? `Progress · ${filterSubject.subject_name}` : "Progress"}
      title="Your progress"
      sub="Every run and check-up you've done, and what they say about where your marks are."
      aside={
        overview.data && (totals.answered > 0 || totals.runs > 0) ? (
          <HeroStats
            stats={[
              {
                label: "Questions answered",
                value: <CountUp value={totals.answered} />,
                note: `Across ${plural(totals.runs, "finished run")}`,
              },
              {
                label: "Right first time",
                value: rate === null ? "—" : <CountUp value={rate} suffix="%" />,
                tone: "lime",
                note: "Answers with no hint needed",
              },
            ]}
          />
        ) : undefined
      }
    />
  );

  if (overview.error && !overview.data) {
    return (
      <div className="sj-page prog">
        {hero}
        <Note
          card
          icon={<IconChart size={18} />}
          tone="pink"
          title="We couldn't load your progress"
          action={
            <Button tone="soft" onClick={overview.reload}>
              Try again
            </Button>
          }
        >
          Check your connection and try again. Nothing you've done is lost.
        </Note>
      </div>
    );
  }

  if (!overview.data) {
    return (
      <div className="sj-page prog" aria-busy="true">
        {hero}
        <div className="prog-skel-sec">
          <Skeleton width={120} height={12} />
          <Skeleton width="min(300px, 70%)" height={28} radius={8} />
          <Skeleton height={260} radius={14} />
        </div>
        <div className="prog-skel-duo">
          <Skeleton height={320} radius={14} />
          <Skeleton height={320} radius={14} />
        </div>
      </div>
    );
  }

  if (subjects.length === 0 && runs.length === 0 && !first.loading) {
    return (
      <div className="sj-page prog">
        {hero}
        <Note
          card
          icon={<IconChart size={18} />}
          title="Nothing to show yet"
          action={
            <Button to="/exams" trailing={<IconArrowRight size={18} />}>
              Set my goal
            </Button>
          }
        >
          Set a goal, take a check-up and do a practice run. Your progress builds up here as you go: every run, every
          check-up, and how each topic stands.
        </Note>
        <Section eyebrow="Run by run" title="Every run at a glance" id="prog-strip">
          <RunStrip runs={[]} />
        </Section>
      </div>
    );
  }

  return (
    <div className="sj-page prog">
      {hero}

      {chipSubjects.length > 1 ? (
        <div className="prog-filter sj-rise" role="group" aria-label="Show subject">
          <button type="button" className="sj-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All subjects
          </button>
          {chipSubjects.map(([id, name]) => (
            <button key={id} type="button" className="sj-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <Section
        eyebrow="Run by run"
        title="Every run at a glance"
        id="prog-strip"
        className="sj-rise d1"
        sub="Right first time means no hint needed. Taught means the coach worked it through with you on the board."
      >
        {!first.data && !first.error ? <Skeleton height={250} radius={14} /> : <RunStrip runs={shown} />}
      </Section>

      <div className="prog-duo">
        <Section
          eyebrow="Latest check-up"
          title={scope.length > 1 ? "Your subjects" : "Your score"}
          id="prog-subjects"
          className="sj-rise d2"
          sub="Predicted score: what you'd likely get if you sat the exam today."
        >
          <div className="prog-col">
            {scope.map((s) => (
              <SubjectSummary key={s.subject_id} subject={s} />
            ))}
          </div>
        </Section>
        {strengthSubject ? (
          <Section
            eyebrow={`Topic strengths · ${strengthSubject.subject_name}`}
            title="How each topic stands"
            id="prog-strengths"
            className="sj-rise d3"
            sub="Mastery: how often we think you'd get a question on it right. Weakest first; open a topic to see its parts."
            action={
              strengthSubject.latest_checkup ? (
                <Link className="sj-link" to={`/checkup/${strengthSubject.latest_checkup.session_id}/report`}>
                  Full report <IconArrowRight size={14} />
                </Link>
              ) : null
            }
          >
            <StrengthsCard subject={strengthSubject} />
          </Section>
        ) : null}
      </div>

      <Section
        eyebrow="Practice history"
        title="Every run"
        id="prog-runs"
        className="sj-rise d4"
        sub="Open a finished run to see how it went, or an unfinished one to carry on."
        action={
          runs.length > 0 ? (
            <Badge tone="ghost">
              {shown.length}
              {next ? "+" : ""} {shown.length === 1 && !next ? "run" : "runs"}
            </Badge>
          ) : null
        }
      >
        <div className="sj-card prog-panel">
          {first.error && !first.data ? (
            <Note
              icon={<IconBolt size={18} />}
              tone="pink"
              title="We couldn't load your runs"
              action={
                <Button tone="soft" onClick={first.reload}>
                  Try again
                </Button>
              }
            >
              Your runs are safe. This is just a loading hiccup.
            </Note>
          ) : !first.data ? (
            <div className="prog-skel">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} radius={10} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <Note
              icon={<IconBolt size={18} />}
              tone="lime"
              title={filterSubject ? `No ${filterSubject.subject_name} runs ${next ? "loaded yet" : "yet"}` : "No runs yet"}
              action={
                next ? (
                  <Button tone="soft" busy={loadingMore} onClick={loadMore}>
                    Look further back
                  </Button>
                ) : (
                  <Button to="/practice" trailing={<IconArrowRight size={18} />}>
                    Start practising
                  </Button>
                )
              }
            >
              {next
                ? "Older runs may have some. Load more to look."
                : "Your runs show up here the moment you start one, with how each went."}
            </Note>
          ) : (
            <>
              <ul className="home-runs">
                {shown.map((run) => (
                  <RunRow key={run.session_id} run={run} detail />
                ))}
              </ul>
              {next ? (
                <div className="prog-more">
                  <Button tone="ghost" busy={loadingMore} onClick={loadMore}>
                    Load more runs
                  </Button>
                </div>
              ) : runs.length > PAGE ? (
                <p className="prog-end sj-mono">That's every run.</p>
              ) : null}
              {moreError ? (
                <p className="home-alert" role="alert">
                  We couldn't load more: {moreError}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
