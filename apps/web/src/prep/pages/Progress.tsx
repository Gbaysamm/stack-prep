/**
 * Progress: what the student has done and what it says (redesigned 16 Nov 2026). One subject
 * filter drives the page. The signature is a strip of every run, one bar each, split into right
 * first time, taught and missed; then the latest runs (every run in a popup); then, for all
 * subjects, a row each, or for one subject its score and every topic, in sections that fold
 * away. A topic is scored from 3 answers; before that it is too early to tell. Every number
 * follows docs/student-scoring.md.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { CheckupResult, SubjectScore, TopicScore, TopicStatus } from "../../student/api.js";
import { IconArrowRight, IconBolt, IconChart, IconChevronDown, IconChevronRight, IconTarget } from "../icons.js";
import { progressApi, type PracticeRunPage, type SubjectOverview } from "../progressApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import { Button, PageHero, Skeleton, cx, PageSkeleton } from "../ui.js";
import { ALL, scoreLevel, useOverview, useSubjectChoice } from "../SubjectSwitcher.js";
import { MasteryBar, Note, Section, runHref, shortDate } from "./Home.js";
import { useRunGate } from "../RunGate.js";
import { RunsPopup } from "./PracticeHub.js";
import "./Progress.css";

const PAGE = 20;
/** The strip always shows at least this many slots, so a first run has room to grow into. */
const STRIP_SLOTS = 12;

/* ================================================================== topic scores (shared) */

/** The five topic labels (docs/student-scoring.md §2), in the student's words. */
export const TOPIC_STATUS_WORD: Record<TopicStatus, string> = {
  not_tried: "Not tried yet",
  just_started: "Too early to tell",
  needs_work: "Needs work",
  getting_there: "Getting there",
  strong: "Strong",
};

/** The legend for topic bars: the five labels and where each starts. */
export function TopicLegend() {
  return (
    <div className="prog-legend" aria-label="How to read the topics">
      <span className="scale">
        <span className="sj-mono">0%</span>
        <i className="grad" />
        <span className="sj-mono">100%</span>
      </span>
      <ul className="prog-legend-labels">
        <li>
          <b className="needs_work">Needs work</b> under 50%
        </li>
        <li>
          <b className="getting_there">Getting there</b> 50–79%
        </li>
        <li>
          <b className="strong">Strong</b> 80%+
        </li>
        <li>
          <b className="just_started">Too early to tell</b> fewer than 3 answered
        </li>
      </ul>
      <span className="none">
        <i className="stripe" />
        Not tried yet
      </span>
    </div>
  );
}

/** "+10", "−3", or a muted "0": a change in whole percentage points. */
export function Change({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <span className="prog-change zero">0</span>;
  return (
    <span className={cx("prog-change", value > 0 ? "up" : "down")}>
      {value > 0 ? `+${value}` : `−${Math.abs(value)}`}
    </span>
  );
}

/**
 * Every JAMB topic of a subject (23 in Maths) with its score, grouped under its syllabus
 * section. The topic is the unit: each has its own bar and its own way into practice. A section
 * is only a heading, with how many of its topics have been tried. Nothing answered is not
 * weakness: an untried topic is shown striped, as not tried yet, not as a low bar.
 *
 * With `limit`, only that many topics show, the lowest scores first (then untried), still under
 * their section headings and in syllabus order.
 */
export function TopicStrengths({
  topics,
  subjectId,
  limit,
  collapsible,
  tools,
  onPractise,
}: {
  topics: TopicScore[];
  subjectId: string;
  limit?: number;
  /** Sections fold away to one line each, until opened. */
  collapsible?: boolean;
  /** Shown on the line with "Open all". */
  tools?: ReactNode;
  /** When given, Practise asks this (a held run is said in a popup) instead of opening the page. */
  onPractise?: (href: string) => void;
}) {
  const sections = useMemo(() => {
    const keep =
      limit === undefined
        ? null
        : new Set(
            [...topics]
              .sort((a, b) => (a.score ?? 200) - (b.score ?? 200))
              .slice(0, limit)
              .map((topic) => topic.subtopic_id),
          );
    // Topics come in syllabus order; a section starts where its first topic is.
    const groups: { id: string; name: string; all: TopicScore[]; shown: TopicScore[] }[] = [];
    for (const topic of topics) {
      let group = groups.find((g) => g.id === topic.section_id);
      if (!group) {
        group = { id: topic.section_id, name: topic.section_name, all: [], shown: [] };
        groups.push(group);
      }
      group.all.push(topic);
      if (!keep || keep.has(topic.subtopic_id)) group.shown.push(topic);
    }
    return groups.filter((g) => g.shown.length > 0);
  }, [topics, limit]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allOpen = sections.length > 0 && sections.every((section) => open.has(section.id));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="prog-sections">
      {collapsible && sections.length > 1 ? (
        <div className="prog-sections-tools">
          {tools}
          <button
            type="button"
            className="sj-link"
            onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((section) => section.id)))}
          >
            {allOpen ? "Close all" : "Open all"}
          </button>
        </div>
      ) : null}
      {sections.map((section) => {
        const tried = section.all.filter((t) => t.answered > 0).length;
        const weak = section.all.filter((t) => t.status === "needs_work").length;
        // Too early to tell (fewer than 3 answers) is left out, as it is for the topic itself.
        const scored = section.all.filter((t) => t.score !== null && t.status !== "just_started");
        const average = scored.length
          ? Math.round(scored.reduce((sum, t) => sum + (t.score ?? 0), 0) / scored.length)
          : null;
        const headId = `prog-sec-${section.id}`;
        const shut = collapsible && !open.has(section.id);
        const summary = (
          <span className="meta sj-mono">
            Answered in {tried} of {section.all.length} {section.all.length === 1 ? "topic" : "topics"}
            {weak > 0 ? <b className="prog-sec-weak"> · {weak} need work</b> : null}
          </span>
        );
        return (
          <section
            key={section.id}
            className={cx("prog-section", collapsible && "fold", shut && "shut")}
            aria-labelledby={headId}
          >
            {collapsible ? (
              <button
                type="button"
                className="prog-section-head prog-section-toggle"
                aria-expanded={!shut}
                onClick={() => toggle(section.id)}
              >
                <span className="prog-section-text">
                  <span id={headId} className="prog-section-name">
                    {section.name}
                  </span>
                  {summary}
                </span>
                {average === null ? (
                  <span className="prog-section-none">Not scored yet</span>
                ) : (
                  <span className="prog-section-score">
                    <MasteryBar value={average / 100} label={`${section.name} score`} />
                    <b className="sj-num">{average}%</b>
                  </span>
                )}
                <IconChevronDown size={18} className="prog-section-chev" />
              </button>
            ) : (
              <header className="prog-section-head">
                <span className="eyebrow sj-mono">Section</span>
                <h3 id={headId} className="prog-section-name">
                  {section.name}
                </h3>
                {summary}
              </header>
            )}
            {shut ? null : (
              <ul className="prog-tlist">
                {section.shown.map((topic) => {
                  const early = topic.status === "just_started";
                  const moved =
                    !early &&
                    topic.started_score !== null &&
                    topic.score !== null &&
                    topic.started_score !== topic.score;
                  return (
                    <li key={topic.subtopic_id} className="prog-trow">
                      <span className="name">
                        <strong>{topic.name}</strong>
                        <span className="meta sj-mono">
                          {topic.answered === 0
                            ? "No questions yet"
                            : early
                              ? `${topic.answered} answered · a score needs 3`
                              : `${topic.right} of ${topic.answered} right`}
                          {moved ? ` · started ${topic.started_score}% → now ${topic.score}%` : ""}
                        </span>
                      </span>
                      <span className="bar">
                        <MasteryBar
                          value={topic.score === null || early ? null : topic.score / 100}
                          label={`${topic.name} score`}
                        />
                        <span className={cx("word", topic.status, (topic.score === null || early) && "none")}>
                          {topic.score === null || early
                            ? TOPIC_STATUS_WORD[topic.status]
                            : `${topic.score}% · ${TOPIC_STATUS_WORD[topic.status]}`}
                        </span>
                      </span>
                      {/* Straight into the run builder with this topic alone chosen. */}
{onPractise ? (
                        <button
                          type="button"
                          className="prog-trow-go"
                          onClick={() => onPractise(`/practice/new?subject=${subjectId}&subtopic=${topic.subtopic_id}`)}
                          aria-label={`Practise ${topic.name}`}
                          title={`Practise ${topic.name}`}
                        >
                          <span className="lbl">Practise</span>
                          <IconArrowRight size={14} />
                        </button>
                      ) : (
                        <Link
                          className="prog-trow-go"
                          to={`/practice/new?subject=${subjectId}&subtopic=${topic.subtopic_id}`}
                          aria-label={`Practise ${topic.name}`}
                          title={`Practise ${topic.name}`}
                        >
                          <span className="lbl">Practise</span>
                          <IconArrowRight size={14} />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== your score, one subject */

/** Whole days from today to an ISO date (negative once it has passed). */
function daysTo(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86400000);
}

/** When the next check-up is due, in words: "Check-up due" or "Next check-up in 3 days". */
export function checkupDueWords(scores: SubjectScore | null | undefined): string | null {
  if (!scores || scores.checkups.length === 0) return null;
  if (scores.checkup_due) return "Check-up due";
  if (!scores.next_checkup_due) return null;
  const days = daysTo(scores.next_checkup_due);
  if (days <= 0) return "Check-up due";
  return days === 1 ? "Next check-up tomorrow" : `Next check-up in ${days} days`;
}

/** Every check-up's result as a row of chips, oldest first: "20% → 28% → 47%". */
export function CheckupTrail({ checkups, max }: { checkups: CheckupResult[]; max?: number }) {
  const shown = max !== undefined && checkups.length > max ? checkups.slice(-max) : checkups;
  const hidden = checkups.length - shown.length;
  return (
    <ol
      className="prog-trail"
      aria-label={`Check-up results, oldest first: ${checkups.map((c) => (c.score === null ? "none" : `${c.score}%`)).join(", ")}`}
    >
      {hidden > 0 ? <li className="more sj-mono">+{hidden} earlier</li> : null}
      {shown.map((checkup, index) => (
        <li key={checkup.session_id} className={cx(index === shown.length - 1 && "last")}>
          <Link
            to={`/checkup/${checkup.session_id}/report`}
            title={`${shortDate(checkup.finished_at)}: ${checkup.answered} questions`}
          >
            <b className="sj-num">{checkup.score === null ? "—" : `${checkup.score}%`}</b>
            <small className="sj-mono">{shortDate(checkup.finished_at)}</small>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * One subject's score: your score with its count, where you started and the change, the
 * predicted score, every check-up oldest first, and when the next one is due.
 */
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
        <ol
          className="prog-strip-cols"
          style={{ gridTemplateColumns: `repeat(${ordered.length + ghosts}, minmax(20px, 1fr))` }}
        >
          {ordered.map((run, index) => {
            const missed = Math.max(0, run.answered - run.correct_unaided - run.taught);
            const open = Math.max(0, run.length - run.answered);
            const summary = `Run ${index + 1}, ${run.subject_name}, ${shortDate(run.started_at)}: ${run.correct_unaided} right first time, ${run.taught} taught, ${missed} missed${open ? `, ${open} not answered yet` : ""}`;
            return (
              <li key={run.session_id}>
                <Link
                  className={cx("prog-col", !run.finished && "open")}
                  to={runHref(run)}
                  aria-label={summary}
                  title={summary}
                >
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

/* ================================================================== a run, as a card */

/**
 * One run: its own little battery bar (right first time, taught, missed, not answered yet, as
 * in the strip), what it covered and when, and how much was right first time.
 */
export function RunCard({ run, showSubject }: { run: Run; showSubject: boolean }) {
  const missed = Math.max(0, run.answered - run.correct_unaided - run.taught);
  const open = Math.max(0, run.length - run.answered);
  const topics = run.subtopics ?? run.topics ?? [];
  const title = topics[0] ?? run.subject_name;
  const rate = run.answered > 0 ? Math.round((run.correct_unaided / run.answered) * 100) : null;
  return (
    <li>
      <Link className={cx("prog2-run", !run.finished && "open")} to={runHref(run)}>
        <span className="prog2-run-bar" aria-hidden="true">
          <span className="seg o" style={{ flexGrow: open }} />
          <span className="seg x" style={{ flexGrow: missed }} />
          <span className="seg t" style={{ flexGrow: run.taught }} />
          <span className="seg r" style={{ flexGrow: run.correct_unaided }} />
        </span>
        <span className="prog2-run-main">
          <b>
            {title}
            {topics.length > 1 ? <span className="more"> +{topics.length - 1} more</span> : null}
          </b>
          <small>
            {showSubject && topics.length > 0 ? `${run.subject_name} · ` : ""}
            {shortDate(run.started_at)} · {run.length} {run.length === 1 ? "question" : "questions"}
            {run.finished ? "" : " · not finished"}
          </small>
        </span>
        <span className="prog2-run-score">
          <b className="sj-num">{rate === null ? "—" : `${rate}%`}</b>
          <small>{run.finished ? "right first time" : "carry on"}</small>
        </span>
        <IconChevronRight size={18} className="prog2-run-go" />
      </Link>
    </li>
  );
}

/* ================================================================== subject cards */

/**
 * A subject as one sticker card: its score coloured by level, a bar with the target marked, and
 * how much of it has been tried. Tapping it focuses the page on it; tapping again shows all.
 */
function SubjectCard({ subject, on, onPick }: { subject: SubjectOverview; on: boolean; onPick: () => void }) {
  const sc = subject.scores;
  const score = sc?.score ?? null;
  const target = subject.goal?.target_score ?? null;
  const total = sc?.topics.length ?? 0;
  const tried = sc?.topics.filter((t) => t.answered > 0).length ?? 0;
  return (
    <button type="button" className={cx("prog2-card", on && "on")} aria-pressed={on} onClick={onPick}>
      <span className="prog2-card-top">
        <span className="prog2-card-name">{subject.subject_name}</span>
        {on ? (
          <span className="prog2-card-tick" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </span>
      <b className={cx("prog2-card-score sj-num", scoreLevel(score, target))}>{score === null ? "—" : `${score}%`}</b>
      <span className="prog2-card-bar" aria-hidden="true">
        <i style={{ width: `${score ?? 0}%` }} />
        {target !== null ? <em style={{ left: `${Math.min(100, target)}%` }} /> : null}
      </span>
      <small className="prog2-card-note">
        <span>
          Target: <b>{target !== null ? `${Math.round(target)}%` : "not set"}</b>
        </span>
        <span>
          Answered:{" "}
          <b>
            {tried}/{total}
          </b>{" "}
          topics
        </span>
      </small>
    </button>
  );
}

function StrengthsCard({ subject, onPractise }: { subject: SubjectOverview; onPractise?: (href: string) => void }) {
  const topics = subject.scores?.topics ?? [];
  const tried = topics.some((topic) => topic.answered > 0);
  return (
    <div className="sj-card prog-panel">
      {!tried ? (
        <Note
          icon={<IconTarget size={18} />}
          title={`No ${subject.subject_name} topics tried yet`}
          action={
            <Button to={`/checkup?subject=${subject.subject_id}`} trailing={<IconArrowRight size={18} />}>
              Take the {subject.subject_name} check-up
            </Button>
          }
        >
          Each topic's score is the questions you got right out of those you answered there. Your first check-up starts
          them off, and practice opens after it.
        </Note>
      ) : (
        <>
          <TopicLegend />
          <TopicStrengths
            topics={topics}
            subjectId={subject.subject_id}
            collapsible
            onPractise={onPractise}
            tools={
              subject.latest_checkup ? (
                <Link className="sj-link prog-tools-report" to={`/checkup/${subject.latest_checkup.session_id}/report`}>
                  Check-up report <IconArrowRight size={14} />
                </Link>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}

/* ================================================================== the page */

/** Runs listed on the page; the rest open in a popup, a page at a time. */
const RECENT = 5;

export function Progress() {
  usePageTitle("Progress");
  const student = useStudent();
  const overview = useOverview(student.studentId);
  const first = useLoad(() => progressApi.runs(student.studentId, PAGE), [student.studentId]);
  const [allRuns, setAllRuns] = useState(false);
  const gate = useRunGate();

  const subjects = overview.data?.subjects ?? [];
  const runs = first.data?.runs ?? [];
  // One subject filter for the whole page (?subject=): every subject, or one.
  const [filter, setFilter] = useSubjectChoice(subjects, { allowAll: true, defaultAll: true });
  const filterSubject = subjects.find((s) => s.subject_id === filter);
  const shown = filterSubject ? runs.filter((run) => run.subject_id === filterSubject.subject_id) : runs;
  // A subject in view (chosen, or the only one): its score and every topic. Otherwise a row each.
  const focus = filterSubject ?? (subjects.length === 1 ? subjects[0] : undefined);

  const hero = (
    <PageHero
      eyebrow="Progress"
      title="Your progress"
      sub="Every run and check-up you've done, and what they add up to."
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
    return <PageSkeleton />;
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
          Set a goal, take a check-up and do a practice run. Your progress builds up here as you go.
        </Note>
      </div>
    );
  }

  return (
    <div className="sj-page prog prog2">
      <Section
        eyebrow="Your subjects"
        title="Where you stand"
        id="prog-subjects"
        className="sj-rise"
        sub={
          subjects.length < 2
            ? "Your score, against your target."
            : focus
              ? `Showing ${focus.subject_name}. Tap it again to see every subject.`
              : "Tap a subject to see its runs and every topic."
        }
      >
        <section className="prog2-subjects" aria-label="Your subjects">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.subject_id}
              subject={subject}
              on={focus?.subject_id === subject.subject_id}
              onPick={() =>
                subjects.length > 1 &&
                setFilter(filterSubject?.subject_id === subject.subject_id ? ALL : subject.subject_id)
              }
            />
          ))}
        </section>
      </Section>

      {first.data && shown.length === 0 ? null : (
        <Section
          eyebrow="Run by run"
          title={filterSubject ? `${filterSubject.subject_name} runs` : "Every run at a glance"}
          id="prog-strip"
          className="sj-rise d1"
        >
          {!first.data && !first.error ? <Skeleton height={250} radius={14} /> : <RunStrip runs={shown} />}
        </Section>
      )}

      <Section
        eyebrow="Practice history"
        title="Recent runs"
        id="prog-runs"
        className="sj-rise d2 prog2-runs"
        action={
          shown.length > RECENT || first.data?.next_before ? (
            <Button tone="soft" size="sm" onClick={() => setAllRuns(true)} trailing={<IconArrowRight size={16} />}>
              See all runs
            </Button>
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
            <div className="prog2-empty">
              <span className="prog2-empty-icon" aria-hidden="true">
                <IconBolt size={20} />
              </span>
              <div>
                <b>{filterSubject ? `No ${filterSubject.subject_name} runs yet` : "No runs yet"}</b>
                <p>Each run you do shows here, with how it went.</p>
              </div>
              <Button to="/practice" size="sm" trailing={<IconArrowRight size={16} />}>
                Start practising
              </Button>
            </div>
          ) : (
            <ul className="prog2-runlist">
              {shown.slice(0, RECENT).map((run) => (
                <RunCard key={run.session_id} run={run} showSubject={!filterSubject} />
              ))}
            </ul>
          )}
        </div>
      </Section>

      {focus ? (
        <Section
          eyebrow={focus.subject_name}
          title="How each topic stands"
          id="prog-strengths"
          className="sj-rise d3 prog2-topics"
          action={
            focus.latest_checkup ? (
              <Link className="sj-link" to={`/checkup/${focus.latest_checkup.session_id}/report`}>
                Check-up report <IconArrowRight size={14} />
              </Link>
            ) : null
          }
        >
          <StrengthsCard key={focus.subject_id} subject={focus} onPractise={gate.openTopic} />
        </Section>
      ) : null}

      {gate.popup}
      {allRuns ? (
        <RunsPopup
          subject={filterSubject ? { id: filterSubject.subject_id, name: filterSubject.subject_name } : null}
          onClose={() => setAllRuns(false)}
          onChanged={first.reload}
        />
      ) : null}
    </div>
  );
}
