/**
 * Progress: what the student has done and what it says. The hero carries the two headline
 * numbers; the signature is a strip of every run, one bar each, split into right first time,
 * taught and missed; then your score (one subject: score, started at, the change and every
 * check-up; all subjects: one row each), every topic's score, and the full run history, a page
 * at a time. Every number follows docs/student-scoring.md.
 *
 * The run history is paged by the server; the subject filter works on what has been loaded, and
 * says so when it is waiting on older runs to find more.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Maths } from "../../Maths.js";

import type { CheckupResult, SubjectScore, TopicScore, TopicStatus } from "../../student/api.js";
import { IconArrowRight, IconBolt, IconBook, IconChart, IconTarget } from "../icons.js";
import { lessonFeedbackApi, type LessonToRevisit, type Understood } from "../lessonFeedbackApi.js";
import { progressApi, type PracticeRunPage, type SubjectOverview } from "../progressApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import { Badge, Button, CountUp, PageHero, Pager, Skeleton, cx, usePaged } from "../ui.js";
import {
  ALL,
  ScoreCell,
  SubjectName,
  scoreNote,
  SubjectRows,
  SubjectSwitcher,
  useOverview,
  useSubjectChoice,
  type SubjectColumn,
} from "../SubjectSwitcher.js";
import {
  Alert,
  HeroStats,
  MasteryBar,
  Note,
  NothingFreshNote,
  RunRow,
  Section,
  plural,
  runHref,
  shortDate,
  useStartPractice,
} from "./Home.js";
import "./Progress.css";

const PAGE = 20;
/** The strip always shows at least this many slots, so a first run has room to grow into. */
const STRIP_SLOTS = 12;

/* ================================================================== topic scores (shared) */

/** The five topic labels (docs/student-scoring.md §2), in the student's words. */
export const TOPIC_STATUS_WORD: Record<TopicStatus, string> = {
  not_tried: "Not tried yet",
  just_started: "Just started",
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
          <b className="just_started">Just started</b> fewer than 3 answered
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
  return <span className={cx("prog-change", value > 0 ? "up" : "down")}>{value > 0 ? `+${value}` : `−${Math.abs(value)}`}</span>;
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
export function TopicStrengths({ topics, subjectId, limit }: { topics: TopicScore[]; subjectId: string; limit?: number }) {
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

  return (
    <div className="prog-sections">
      {sections.map((section) => {
        const tried = section.all.filter((t) => t.answered > 0).length;
        const headId = `prog-sec-${section.id}`;
        return (
          <section key={section.id} className="prog-section" aria-labelledby={headId}>
            <header className="prog-section-head">
              <span className="eyebrow sj-mono">Section</span>
              <h3 id={headId} className="prog-section-name">
                {section.name}
              </h3>
              <span className="meta sj-mono">
                {tried} of {section.all.length} {section.all.length === 1 ? "topic" : "topics"} tried
              </span>
            </header>
            <ul className="prog-tlist">
              {section.shown.map((topic) => {
                const moved = topic.started_score !== null && topic.score !== null && topic.started_score !== topic.score;
                return (
                  <li key={topic.subtopic_id} className="prog-trow">
                    <span className="name">
                      <strong>{topic.name}</strong>
                      <span className="meta sj-mono">
                        {topic.answered > 0 ? `${topic.right} of ${topic.answered} right` : "No questions yet"}
                        {moved ? ` · started ${topic.started_score}% → now ${topic.score}%` : ""}
                      </span>
                    </span>
                    <span className="bar">
                      <MasteryBar value={topic.score === null ? null : topic.score / 100} label={`${topic.name} score`} />
                      <span className={cx("word", topic.status, topic.score === null && "none")}>
                        {topic.score === null
                          ? TOPIC_STATUS_WORD[topic.status]
                          : `${topic.score}% · ${TOPIC_STATUS_WORD[topic.status]}`}
                      </span>
                    </span>
                    {/* Straight into the run builder with this topic alone chosen. */}
                    <Link
                      className="prog-trow-go"
                      to={`/practice/new?subject=${subjectId}&subtopic=${topic.subtopic_id}`}
                      aria-label={`Practise ${topic.name}`}
                      title={`Practise ${topic.name}`}
                    >
                      <span className="lbl">Practise</span>
                      <IconArrowRight size={14} />
                    </Link>
                  </li>
                );
              })}
            </ul>
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
    <ol className="prog-trail" aria-label={`Check-up results, oldest first: ${checkups.map((c) => (c.score === null ? "none" : `${c.score}%`)).join(", ")}`}>
      {hidden > 0 ? <li className="more sj-mono">+{hidden} earlier</li> : null}
      {shown.map((checkup, index) => (
        <li key={checkup.session_id} className={cx(index === shown.length - 1 && "last")}>
          <Link to={`/checkup/${checkup.session_id}/report`} title={`${shortDate(checkup.finished_at)}: ${checkup.answered} questions`}>
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
function ScoreSummary({ subject }: { subject: SubjectOverview }) {
  const sc = subject.scores ?? null;
  const target = subject.goal?.target_score ?? null;
  const due = checkupDueWords(sc);
  const checkupCta = (
    <Button
      size="sm"
      tone={sc?.checkup_due || !sc || sc.checkups.length === 0 ? "dark" : "soft"}
      to={subject.open_checkup_session_id ? `/checkup/${subject.open_checkup_session_id}` : `/checkup?subject=${subject.subject_id}`}
      trailing={<IconArrowRight size={16} />}
    >
      {subject.open_checkup_session_id ? "Finish the check-up" : "Take a check-up"}
    </Button>
  );

  if (!sc || (sc.answered === 0 && sc.checkups.length === 0)) {
    return (
      <Note
        card
        icon={<IconTarget size={18} />}
        title={`No ${subject.subject_name} score yet`}
        action={checkupCta}
      >
        Your score starts with a check-up: a short mixed test with no help, like the exam. Practice opens after it, and
        every question you answer then adds to your topics.
      </Note>
    );
  }

  const gap = target !== null && (sc.predicted ?? sc.score) !== null ? Math.round(target - (sc.predicted ?? sc.score)!) : null;
  return (
    <div className="sj-card prog-score">
      <dl className="prog-score-nums">
        <div className="lead">
          <dt>Your score</dt>
          <dd className="sj-num">{sc.score === null ? "—" : `${sc.score}%`}</dd>
          <small>{scoreNote(subject)}</small>
        </div>
        <div>
          <dt>Started at</dt>
          <dd className="sj-num">{sc.started_score === null ? "—" : `${sc.started_score}%`}</dd>
          <small>
            {sc.change !== null ? (
              <>
                <Change value={sc.change} /> since you started
              </>
            ) : (
              "Your first check-up"
            )}
          </small>
        </div>
        <div>
          <dt>Predicted score</dt>
          <dd className="sj-num">{sc.predicted === null ? "—" : `${sc.predicted}%`}</dd>
          <small>{sc.predicted === null ? "After your first check-up" : "Your last check-up"}</small>
        </div>
        {target !== null ? (
          <div>
            <dt>Target</dt>
            <dd className="sj-num">{Math.round(target)}%</dd>
            <small className={cx(gap !== null && gap <= 0 ? "ok" : "short")}>
              {gap === null ? "Your goal" : gap <= 0 ? "On track" : `${gap} short`}
            </small>
          </div>
        ) : null}
      </dl>
      <div className="prog-score-foot">
        <div className="prog-score-history">
          <span className="sj-mono">Check-ups, oldest first</span>
          {sc.checkups.length > 0 ? <CheckupTrail checkups={sc.checkups} /> : <span className="prog-score-none">None yet</span>}
        </div>
        <div className="prog-score-due">
          {due ? <span className={cx("prog-due", sc.checkup_due && "on")}>{due}</span> : null}
          {sc.checkup_due || sc.checkups.length === 0 || subject.open_checkup_session_id ? checkupCta : null}
        </div>
      </div>
    </div>
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

/* ================================================================== every subject, as rows */

/** Every subject's score, where it started, its check-ups and its practice: one row each, ten to a page. */
function SubjectTable({ subjects, selected }: { subjects: SubjectOverview[]; selected: string | null }) {
  const paged = usePaged(subjects, 10);
  const columns: SubjectColumn[] = [
    {
      key: "name",
      head: "Subject",
      width: "minmax(0, 1.4fr)",
      phone: "lead",
      cell: (s) => <SubjectName subject={s} to={<Link to={`/subjects/${s.subject_id}`}>{s.subject_name}</Link>} />,
    },
    { key: "score", head: "Your score", width: "minmax(0, 1.3fr)", phone: "full", cell: (s) => <ScoreCell subject={s} /> },
    {
      key: "started",
      head: "Started at",
      width: "96px",
      align: "end",
      cell: (s) => {
        const sc = s.scores;
        return (
          <span className="prog-fig">
            <b className="sj-num">{sc?.started_score == null ? "—" : `${sc.started_score}%`}</b>
            <small>{sc?.change != null ? <Change value={sc.change} /> : "started at"}</small>
          </span>
        );
      },
    },
    {
      key: "checkups",
      head: "Check-ups",
      width: "minmax(0, 1.2fr)",
      phone: "full",
      cell: (s) =>
        s.scores && s.scores.checkups.length > 0 ? (
          <CheckupTrail checkups={s.scores.checkups} max={3} />
        ) : (
          <span className="prog-score-none">None yet</span>
        ),
    },
    {
      key: "runs",
      head: "Runs",
      width: "64px",
      align: "end",
      cell: (s) => <Fig value={s.practice.runs_finished} label="runs" />,
    },
    {
      key: "answered",
      head: "Answered",
      width: "84px",
      align: "end",
      cell: (s) => <Fig value={s.practice.questions_answered} label="answered" />,
    },
    {
      key: "go",
      head: "Check-up",
      width: "150px",
      align: "end",
      phone: "end",
      cell: (s) =>
        s.latest_checkup && !s.scores?.checkup_due ? (
          <Link className="sj-link prog-rowlink" to={`/checkup/${s.latest_checkup.session_id}/report`}>
            Read the report <IconArrowRight size={14} />
          </Link>
        ) : s.latest_checkup ? (
          <Link className="sj-link prog-rowlink warn" to={`/checkup?subject=${s.subject_id}`}>
            <span className="ss-dot yellow" aria-hidden="true" /> Check-up due
          </Link>
        ) : (
          <Link className="sj-link prog-rowlink warn" to={`/checkup?subject=${s.subject_id}`}>
            <span className="ss-dot yellow" aria-hidden="true" /> Take a check-up
          </Link>
        ),
    },
  ];
  return (
    <>
      <SubjectRows subjects={paged.items} columns={columns} label="Your subjects" selected={selected} id="prog-subject-rows" />
      <Pager paged={paged} noun="subjects" anchorId="prog-subject-rows" />
    </>
  );
}

/** A number in a table cell; on a phone its label comes along, since the header is gone. */
function Fig({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="prog-fig">
      <b className="sj-num">{value}</b>
      <small>{label}</small>
    </span>
  );
}

function StrengthsCard({ subject }: { subject: SubjectOverview }) {
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
          <TopicStrengths topics={topics} subjectId={subject.subject_id} />
        </>
      )}
    </div>
  );
}

/* ================================================================== the page */

/* ------------------------------------------------------------------ how lessons landed */

/** Lessons to revisit, one group per subject in the order they first appear (newest first). */
function groupBySubject(items: LessonToRevisit[]) {
  const groups: { subject_id: string; subject_name: string; items: LessonToRevisit[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.subject_id === item.subject_id);
    if (group) group.items.push(item);
    else groups.push({ subject_id: item.subject_id, subject_name: item.subject_name, items: [item] });
  }
  return groups;
}

const UNDERSTOOD_WORD: Record<Understood, string> = {
  got_it: "Got it",
  unsure: "Still unsure",
  too_hard: "Too hard",
};

/** One colour per subject in "Worth another look", in the order the subjects appear. */
const SUBJECT_TONES = ["purple", "teal", "orange", "pink", "blue"] as const;

/** "Use of English" → "En", "Mathematics" → "Ma", "Christian Religious Studies" → "CR". */
function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((word) => !["use", "of", "and", "in", "the"].includes(word.toLowerCase()));
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 2);
}

/** What the student said after each lesson on the board, and the lessons worth another look. */
function LessonsLanded({ studentId, subjectId }: { studentId: string; subjectId: string | null }) {
  const feedback = useLoad(() => {
    // Dev only: `?demo=lessons` or `?demo=lessons-empty` draws the section before the server has data.
    const demo = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("demo") : null;
    if (demo === "lessons-empty")
      return Promise.resolve({
        counts: { got_it: 0, unsure: 0, too_hard: 0, matched_yes: 0, matched_partly: 0, matched_no: 0 },
        total: 0,
        to_revisit: [],
      });
    if (demo === "lessons")
      return Promise.resolve({
        counts: { got_it: 7, unsure: 3, too_hard: 1, matched_yes: 4, matched_partly: 2, matched_no: 1 },
        total: 11,
        to_revisit: [
          {
            question_version_id: "demo-1",
            subject_id: "33bb5ef4-bda4-5b88-83d9-41f7beff0dfd",
            subject_name: "Mathematics",
            topic_name: "Number and Numeration",
            subtopic_name: "Indices, Logarithms and Surds",
            stem_excerpt: "If $\\dfrac{9^{2x-1}}{27^{x+1}} = 1$, find the value of $x$.",
            understood: "too_hard" as const,
            at: "2026-09-27T10:00:00Z",
          },
          {
            question_version_id: "demo-2",
            subject_id: "33bb5ef4-bda4-5b88-83d9-41f7beff0dfd",
            subject_name: "Mathematics",
            topic_name: "Geometry and Trigonometry",
            subtopic_name: "Euclidean Geometry",
            stem_excerpt: "Each of the interior angles of a regular polygon is $140^\\circ$. How many sides has the polygon?",
            understood: "unsure" as const,
            at: "2026-09-26T10:00:00Z",
          },
        ],
      });
    return lessonFeedbackApi.summary(studentId);
  }, [studentId]);
  // A group's button practises the subtopics its lessons were on, not the whole subject.
  const starter = useStartPractice();
  const practise = (group: ReturnType<typeof groupBySubject>[number]) => {
    const spots = new Map<string, string>();
    for (const item of group.items) if (item.subtopic_id) spots.set(item.subtopic_id, item.subtopic_name);
    const names = [...spots.values()];
    void starter.start(
      group.subject_id,
      { subtopicIds: [...spots.keys()], label: names.length === 1 ? names[0] : `these ${group.subject_name} topics` },
      group.subject_id,
    );
  };

  let body: ReactNode;
  if (feedback.error && !feedback.data) {
    body = (
      <Note
        card
        icon={<IconBolt size={18} />}
        tone="pink"
        title="We couldn't load this"
        action={
          <Button tone="soft" onClick={feedback.reload}>
            Try again
          </Button>
        }
      >
        What you said after your lessons is safe. This is just a loading hiccup.
      </Note>
    );
  } else if (!feedback.data) {
    body = (
      <div className="prog-ll-tiles">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={132} radius={14} />
        ))}
      </div>
    );
  } else if (feedback.data.total === 0) {
    body = (
      <Note
        card
        icon={<IconBook size={18} />}
        title="No lessons yet"
        action={
          <Button to="/practice" trailing={<IconArrowRight size={18} />}>
            Start practising
          </Button>
        }
      >
        When the coach works a question through with you on the board, you tell us how it landed. It adds up here,
        with the lessons worth another look.
      </Note>
    );
  } else {
    const { counts, to_revisit } = feedback.data;
    const matchedTotal = counts.matched_yes + counts.matched_partly + counts.matched_no;
    const revisit = subjectId ? to_revisit.filter((item) => item.subject_id === subjectId) : to_revisit;
    const tiles: { key: string; label: string; value: number; note: string; tone: string; level: number }[] = [
      { key: "got", label: "Got it", value: counts.got_it, note: "Could do one like it now.", tone: "lime", level: 3 },
      { key: "unsure", label: "Still unsure", value: counts.unsure, note: "Made some sense, not all.", tone: "purple", level: 2 },
      { key: "hard", label: "Too hard", value: counts.too_hard, note: "Lost along the way.", tone: "yellow", level: 1 },
    ];
    const split = [
      { key: "yes", label: "Yes, the same way", value: counts.matched_yes, tone: "lime" },
      { key: "partly", label: "Partly", value: counts.matched_partly, tone: "purple" },
      { key: "no", label: "No, I guessed", value: counts.matched_no, tone: "yellow" },
    ];
    body = (
      <div className="prog-ll">
        <div className="prog-ll-tiles">
          {tiles.map((tile) => (
            <div key={tile.key} className={cx("prog-ll-tile", tile.tone)}>
              <span className="prog-ll-row">
                <span className="prog-ll-gauge" aria-hidden="true">
                  {[1, 2, 3].map((bar) => (
                    <i key={bar} className={cx(bar <= tile.level && "on")} />
                  ))}
                </span>
                <b>{tile.label}</b>
              </span>
              <span className="sj-num prog-ll-num">
                <CountUp value={tile.value} />
              </span>
              <small>{tile.note}</small>
            </div>
          ))}
        </div>

        {matchedTotal > 0 ? (
          <div className="sj-card prog-ll-split">
            <div className="prog-ll-split-head">
              <b>Was it how you thought?</b>
              <span className="sj-mono">
                {plural(matchedTotal, "right answer")} you weren't sure of
              </span>
            </div>
            <div className="prog-ll-bar" role="img" aria-label={split.map((s) => `${s.label}: ${s.value}`).join(", ")}>
              {split.map((s) =>
                s.value > 0 ? (
                  <span key={s.key} className={s.tone} style={{ flexGrow: s.value }} />
                ) : null,
              )}
            </div>
            <ul className="prog-ll-keys">
              {split.map((s) => (
                <li key={s.key}>
                  <span className={cx("prog-ll-dot", s.tone)} aria-hidden="true" />
                  {s.label}
                  <b className="sj-mono">{s.value}</b>
                </li>
              ))}
            </ul>
            <p className="prog-ll-gloss">
              "Yes" means your own working matched the coach's, so the right answer wasn't luck.
            </p>
          </div>
        ) : null}

        <div className="sj-card prog-ll-list">
          <div className="prog-ll-list-head">
            <b>Worth another look</b>
            <span>Lessons you said were unclear or too hard.</span>
          </div>
          {revisit.length === 0 ? (
            <p className="prog-ll-none">
              Nothing here: every lesson{subjectId ? " in this subject" : ""} landed. Keep going.
            </p>
          ) : (
            <div className="prog-ll-groups">
            {groupBySubject(revisit).map((group, index) => (
              // Each subject is its own block, in its own colour, so English and Maths never
              // run together into one list.
              <section
                key={group.subject_id}
                className={cx("prog-ll-group", SUBJECT_TONES[index % SUBJECT_TONES.length])}
                aria-label={group.subject_name}
              >
                <div className="prog-ll-group-head">
                  <span className="prog-ll-group-name">
                    <span className="prog-ll-group-tile" aria-hidden="true">
                      {initialsOf(group.subject_name)}
                    </span>
                    <span className="prog-ll-group-words">
                      <b>{group.subject_name}</b>
                      <small>{plural(group.items.length, "lesson")} to look at again</small>
                    </span>
                  </span>
                  <Button
                    tone="soft"
                    size="sm"
                    busy={starter.busy === group.subject_id}
                    disabled={starter.busy !== null}
                    onClick={() => practise(group)}
                    trailing={<IconArrowRight size={16} />}
                  >
                    Practise these
                  </Button>
                </div>
                {starter.exhausted?.key === group.subject_id ? <NothingFreshNote starter={starter} /> : null}
                {starter.error && starter.busy === null && starter.lastKey === group.subject_id ? (
                  <Alert>{starter.error}</Alert>
                ) : null}
                <ul>
                  {group.items.map((item) => (
                    <li key={`${item.question_version_id}-${item.at}`} className="prog-ll-item">
                      <span className="prog-ll-item-top">
                        <b>{item.subtopic_name}</b>
                        <span className={cx("prog-ll-flag", item.understood)}>{UNDERSTOOD_WORD[item.understood]}</span>
                      </span>
                      <p className="prog-ll-stem">
                        <Maths text={item.stem_excerpt} />
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Section
      eyebrow="After the board"
      title="How your lessons landed"
      id="prog-lessons"
      className="sj-rise d4"
      sub="What you told us after each lesson the coach worked through with you."
      action={
        <Button tone="soft" size="sm" to="/progress/check-ins" trailing={<IconArrowRight size={16} />}>
          Every check-in, explained
        </Button>
      }
    >
      {body}
    </Section>
  );
}

export function Progress() {
  usePageTitle("Progress");
  const student = useStudent();
  const overview = useOverview(student.studentId);
  const first = useLoad(() => progressApi.runs(student.studentId, PAGE), [student.studentId]);
  const [extra, setExtra] = useState<PracticeRunPage["runs"]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

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
  // The page's subject: every subject unless one is asked for (?subject=).
  const [filter, setFilter] = useSubjectChoice(subjects, { allowAll: true, defaultAll: true });
  const shown = filter === ALL || !filter ? runs : runs.filter((run) => run.subject_id === filter);
  const filterSubject = subjects.find((s) => s.subject_id === filter);
  const scope = filterSubject ? [filterSubject] : subjects;
  // Topics need one subject: the page's, else their own choice (?topics=), checked ones first.
  const [topicsId, setTopicsId] = useSubjectChoice(subjects, {
    param: "topics",
    prefer: (s) => !!s.scores?.topics.some((topic) => topic.answered > 0),
  });
  const strengthSubject = filterSubject ?? subjects.find((s) => s.subject_id === topicsId) ?? subjects[0];
  // One subject in view (chosen, or the only one): its score in full. Otherwise a row each.
  const scoreSubject = filterSubject ?? (subjects.length === 1 ? subjects[0] : undefined);

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
      sub="Every run and check-up you've done, and what they add up to."
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

      {subjects.length > 1 ? (
        <div className="prog-filter sj-rise">
          <SubjectSwitcher
            subjects={subjects}
            value={filter}
            onChange={setFilter}
            allowAll
            label="Show progress for"
          />
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

      {scoreSubject ? (
        <Section
          eyebrow={`Your score · ${scoreSubject.subject_name}`}
          title="Your score"
          id="prog-subjects"
          className="sj-rise d2"
          sub="Your score is the average of your topic scores. Predicted score is your last check-up's result, worked out the same way."
        >
          <ScoreSummary subject={scoreSubject} />
        </Section>
      ) : (
        <Section
          eyebrow={`Your score · ${plural(subjects.length, "subject")}`}
          title="Your subjects"
          id="prog-subjects"
          className="sj-rise d2"
          sub="Your score is the average of your topic scores. Check-ups run oldest to newest; the last one is your predicted score."
        >
          <SubjectTable subjects={subjects} selected={null} />
        </Section>
      )}

      {strengthSubject ? (
        <Section
          eyebrow={`Topic scores · ${strengthSubject.subject_name}`}
          title="How each topic stands"
          id="prog-strengths"
          className="sj-rise d3"
          sub="Every topic on the syllabus, under its section: questions right out of questions answered there. Questions you missed come back in your runs, and getting them right raises the topic's score."
          action={
            strengthSubject.latest_checkup ? (
              <Link className="sj-link" to={`/checkup/${strengthSubject.latest_checkup.session_id}/report`}>
                Full report <IconArrowRight size={14} />
              </Link>
            ) : null
          }
        >
          {subjects.length > 1 ? (
            <SubjectSwitcher
              subjects={subjects}
              value={strengthSubject.subject_id}
              onChange={(id) => (filterSubject ? setFilter(id) : setTopicsId(id))}
              label="Topics for"
            />
          ) : null}
          <StrengthsCard key={strengthSubject.subject_id} subject={strengthSubject} />
        </Section>
      ) : null}

      <LessonsLanded studentId={student.studentId} subjectId={filterSubject ? filterSubject.subject_id : null} />

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
                  <RunRow key={run.session_id} run={run} detail showSubject={!filterSubject} />
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
