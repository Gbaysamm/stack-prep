/**
 * The end of a practice run.
 *
 * Proud, and honest about what the numbers mean: right first time is what the student knows;
 * a question the coach had to work through is taught, not known, and it comes back. Only the
 * run's totals are stored per run, so the strip groups the questions by how they went rather
 * than pretending to remember their order.
 */

import { useNavigate, useParams } from "react-router-dom";

import { api, type PracticeState, type ScoreChange } from "../../student/api.js";
import {
  IconArrowRight,
  IconBolt,
  IconBulb,
  IconCheck,
  IconHelp,
  IconHome,
  IconLayers,
  IconPlay,
  IconReplay,
  IconTarget,
} from "../icons.js";
import { progressApi } from "../progressApi.js";
import type { RunFilters } from "../runsApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import {
  Badge,
  Button,
  Card,
  CountUp,
  PageHero,
  Ring,
  Skeleton,
  cx,
  useNarrow,
} from "../ui.js";
import { Alert, MasteryBar, NothingFreshNote, signed, useStartPractice } from "./Home.js";
import { RunStrip, whenLabel } from "./PracticeHub.js";
import "./RunSummary.css";

function headline(
  unaided: number,
  answered: number,
): { title: string; line: string } {
  if (answered === 0)
    return {
      title: "Run closed.",
      line: "No questions were answered in this one.",
    };
  const share = unaided / answered;
  if (share >= 0.8)
    return {
      title: "That was a strong run.",
      line: "Most of these you knew cold. Keep the streak going.",
    };
  if (share >= 0.5)
    return {
      title: "Good, solid work.",
      line: "More right than not — and the misses are now things you have been shown.",
    };
  if (share > 0)
    return {
      title: "Every miss taught you something.",
      line: "This is exactly the ground to be covering. It gets easier from here.",
    };
  return {
    title: "You showed up for the hard ones.",
    line: "None came easy today, and every one was worked through. That is how it starts.",
  };
}

/** "45%", or a dash when there is nothing to score yet. */
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/**
 * What the run did to the student's scores (docs/student-scoring.md §5): the subject before and
 * after, and each topic it touched. The change is the point, so it is the biggest thing here.
 */
function ScoreMoved({ change }: { change: ScoreChange }) {
  const moved = change.before !== null && change.after !== null ? change.after - change.before : null;
  return (
    <section className="rs-section sj-rise d1" aria-labelledby="rs-score-title">
      <span className="sj-eyebrow">Your score</span>
      <h2 id="rs-score-title" className="sj-display sj-h2">
        {moved === null
          ? `Your score is now ${pct(change.after)}`
          : moved > 0
            ? `Up ${moved} — now ${pct(change.after)}`
            : moved < 0
              ? `Now ${pct(change.after)}`
              : `Holding at ${pct(change.after)}`}
      </h2>
      <Card className="rs-score">
        <div className="rs-score-head">
          <span className="rs-score-from sj-num">{pct(change.before)}</span>
          <IconArrowRight size={22} aria-hidden="true" />
          <span className="rs-score-to sj-num">{pct(change.after)}</span>
          {moved !== null ? (
            <Badge tone={moved > 0 ? "green" : moved < 0 ? "pink" : "ghost"} dot>
              {signed(moved)}
            </Badge>
          ) : null}
        </div>
        <p className="rs-note sj-small">
          Your score is the average of your topic scores. A topic score is the share of its
          questions you&apos;ve got right, counting your latest try at each. Questions you missed or
          guessed come back in later runs, and getting them right then raises it.
        </p>
        {change.topics.length > 0 ? (
          <ul className="rs-score-topics">
            {change.topics.map((topic) => {
              const delta = topic.before !== null && topic.after !== null ? topic.after - topic.before : null;
              return (
                <li key={topic.subtopic_id}>
                  <span className="rs-score-name">
                    <strong>{topic.name}</strong>
                    <span className="sj-small sj-muted">
                      {topic.right} of {topic.answered} right this run
                    </span>
                  </span>
                  <MasteryBar value={topic.after === null ? null : topic.after / 100} label={`${topic.name} score`} />
                  <span className="rs-score-move sj-mono">
                    {topic.before === null ? "new" : pct(topic.before)} → <b>{pct(topic.after)}</b>
                    {delta !== null && delta !== 0 ? (
                      <span className={cx("rs-score-delta", delta > 0 ? "up" : "down")}>{signed(delta)}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}

export function RunSummary() {
  const { sessionId = "" } = useParams();
  const student = useStudent();
  const navigate = useNavigate();
  const narrow = useNarrow();
  const state = useLoad(() => api.practiceCurrent(sessionId), [sessionId]);
  const runs = useLoad(
    () => progressApi.runs(student.studentId, 50),
    [student.studentId],
  );
  const overview = useLoad(
    () => progressApi.overview(student.studentId),
    [student.studentId],
  );
  const starter = useStartPractice();
  const starting = starter.busy !== null;

  const run = runs.data?.runs.find((item) => item.session_id === sessionId);
  const subject = overview.data?.subjects.find(
    (item) => item.subject_id === run?.subject_id,
  );
  const weakest = subject?.latest_checkup?.weakest_subtopics[0];
  // JAMB's topics this run touched (the API's `subtopics`); older servers only name sections.
  const covered = run ? (run.subtopics ?? run.topics) : [];
  usePageTitle(run ? `${run.subject_name} run` : "Run summary");

  // "Another run" is another run of the same kind: a run on Indices is followed by more Indices,
  // not by whatever the plan would pick. Only a general run gets a general run.
  const chosen = (state.data as (PracticeState & { filters?: RunFilters | null }) | null)?.filters ?? null;
  const narrowed = Boolean(
    chosen && (chosen.bookmarked || chosen.subtopic_ids.length || chosen.topic_ids.length || chosen.exam_years.length),
  );
  const again = () => {
    if (!run) return;
    void starter.start(
      run.subject_id,
      {
        length: run.length,
        subtopicIds: chosen?.subtopic_ids,
        topicIds: chosen?.topic_ids,
        examYears: chosen?.exam_years,
        bookmarked: chosen?.bookmarked,
        label: chosen?.bookmarked ? "your bookmarks" : "the topics this run was on",
      },
      "again",
    );
  };

  if (state.error && !state.data) {
    return (
      <div className="sj-page rs">
        <PageHero
          back={{ to: "/practice", label: "Practice" }}
          eyebrow="Run summary"
          title="We couldn’t load this run"
        />
        <Card sticker="pink" className="rs-issue">
          <div className="rs-row">
            <span className="rs-tile pink" aria-hidden="true">
              <IconReplay size={18} />
            </span>
            <b>Something got in the way</b>
          </div>
          <p className="sj-muted">{state.error}</p>
          <div className="rs-issue-actions">
            <Button icon={<IconReplay size={18} />} onClick={state.reload}>
              Try again
            </Button>
            <Button tone="ghost" to="/practice">
              Back to practice
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const data = state.data;
  if (!data) {
    return (
      <div className="sj-page rs" aria-busy="true">
        <Skeleton height={188} radius={18} />
        <div style={{ height: 22 }} />
        <Skeleton width={120} height={12} />
        <div style={{ height: 8 }} />
        <Skeleton width={240} height={28} />
        <div style={{ height: 14 }} />
        <Skeleton height={300} radius={14} />
      </div>
    );
  }

  if (data.stage !== "finished") {
    // A question being retried is counted as seen but has no outcome yet.
    const done =
      data.stage === "asking" ? data.answered : Math.max(0, data.answered - 1);
    return (
      <div className="sj-page rs">
        <PageHero
          back={{ to: "/practice", label: "Practice" }}
          eyebrow={`Run summary${run ? ` · ${run.subject_name}` : ""}`}
          title="This run isn’t finished yet"
          sub="Pick it up where you left off. The summary appears when the last question is done."
          actions={
            <Button
              to={`/practice/${sessionId}`}
              size="lg"
              tone="lime"
              trailing={<IconArrowRight size={18} />}
            >
              Resume run
            </Button>
          }
          aside={
            <div className="rs-aside">
              <Ring
                value={data.length ? done / data.length : 0}
                size={narrow ? 104 : 132}
                stroke={12}
                color="var(--yellow-300)"
              >
                <span className="sj-num rs-ring-num small">
                  {done}
                  <span className="rs-ring-of">/{data.length}</span>
                </span>
              </Ring>
              <span className="rs-aside-cap">answered so far</span>
            </div>
          }
        />
        <section className="rs-section sj-rise d1" aria-labelledby="rs-sofar">
          <span className="sj-eyebrow">So far</span>
          <h2 id="rs-sofar" className="sj-display sj-h2">
            How it is going
          </h2>
          <div className="sj-card rs-open">
            <div className="rs-strip-big">
              <RunStrip run={{ ...data, answered: done }} />
            </div>
            <p className="sj-muted">
              {data.correct_unaided} right first time · {data.taught} taught ·{" "}
              {data.length - done} still to go
            </p>
          </div>
        </section>
      </div>
    );
  }

  const answered = data.answered;
  const unaided = data.correct_unaided;
  const taught = data.taught;
  const hinted = Math.max(0, answered - unaided - taught);
  // Newer servers also count right answers the student said they guessed; older ones don't.
  const guessedRight = (data as { guessed_right?: number | null }).guessed_right;
  const head = headline(unaided, answered);
  const share = answered > 0 ? unaided / answered : 0;

  return (
    <div className="sj-page rs">
      <PageHero
        back={{ to: "/practice", label: "Practice" }}
        eyebrow={`Run complete${run ? ` · ${run.subject_name} · ${whenLabel(run.started_at)}` : ""}`}
        title={head.title}
        sub={head.line}
        actions={
          <Button to={`/practice/${sessionId}/report`} tone="lime" trailing={<IconArrowRight size={18} />}>
            Question by question
          </Button>
        }
        aside={
          // The number that matters, big: right with no hint and no help.
          <div className="rs-aside">
            <Ring
              value={share}
              size={narrow ? 112 : 156}
              stroke={narrow ? 11 : 14}
              color="var(--green-400)"
            >
              <span className="sj-num rs-ring-num">
                <CountUp value={unaided} />
                <span className="rs-ring-of">/{answered}</span>
              </span>
            </Ring>
            <span className="rs-aside-cap">right first time</span>
          </div>
        }
      />

      <section className="rs-section sj-rise d1" aria-labelledby="rs-break-title">
        <span className="sj-eyebrow">Breakdown</span>
        <h2 id="rs-break-title" className="sj-display sj-h2">
          How the {answered} went
        </h2>
        <div className="sj-card rs-break">
          <div className="rs-strip-big">
            <RunStrip
              run={{
                answered,
                correct_unaided: unaided,
                taught,
                length: answered,
              }}
            />
          </div>
          <p className="rs-note sj-small">
            Grouped by how they went, not in the order you saw them.
          </p>
          <ul
            className={cx(
              "rs-legend",
              typeof guessedRight === "number" && "four",
            )}
          >
            <li>
              <span className="rs-row">
                <span className="rs-tile lime" aria-hidden="true">
                  <IconCheck size={16} />
                </span>
                <b>Right first time</b>
              </span>
              <span className="sj-num rs-legend-num">
                <CountUp value={unaided} />
              </span>
              <small>Counts as known.</small>
            </li>
            <li>
              <span className="rs-row">
                <span className="rs-tile yellow" aria-hidden="true">
                  <IconBulb size={16} />
                </span>
                <b>Right after a hint</b>
              </span>
              <span className="sj-num rs-legend-num">
                <CountUp value={hinted} />
              </span>
              <small>You got there, but it isn’t counted as known yet.</small>
            </li>
            <li>
              <span className="rs-row">
                <span className="rs-tile pink" aria-hidden="true">
                  <IconPlay size={14} />
                </span>
                <b>Taught on the board</b>
              </span>
              <span className="sj-num rs-legend-num">
                <CountUp value={taught} />
              </span>
              <small>Taught, not known. They come back in a later run.</small>
            </li>
            {typeof guessedRight === "number" ? (
              <li>
                <span className="rs-row">
                  <span className="rs-tile orange" aria-hidden="true">
                    <IconHelp size={16} />
                  </span>
                  <b>Right but guessed</b>
                </span>
                <span className="sj-num rs-legend-num">
                  <CountUp value={guessedRight} />
                </span>
                <small>Lucky guesses aren’t counted as known. They come back.</small>
              </li>
            ) : null}
          </ul>
          {covered.length > 0 || data.closing_note ? (
            <div className="rs-foot">
              {covered.length > 0 ? (
                <div className="rs-topics">
                  <span className="rs-topics-label sj-mono">
                    <IconLayers size={14} /> Topics covered
                  </span>
                  <div className="rs-chips">
                    {covered.map((topic) => (
                      <Badge key={topic} tone="ghost" className="rs-chip">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {data.closing_note ? (
                <p className="rs-closing">{data.closing_note}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {data.score_change ? <ScoreMoved change={data.score_change} /> : null}

      <section className="rs-section sj-rise d2" aria-labelledby="rs-next-title">
        <span className="sj-eyebrow">Next up</span>
        <h2 id="rs-next-title" className="sj-display sj-h2">
          Keep it going
        </h2>
        <div className="rs-next-grid">
          <button
            type="button"
            className="rs-next-card primary"
            onClick={again}
            disabled={!run || starting}
          >
            <span className="rs-row">
              <span className="rs-tile lime" aria-hidden="true">
                <IconBolt size={18} />
              </span>
              <b>{starting ? "Picking questions…" : "Another run"}</b>
            </span>
            <span className="rs-next-text">
              {run
                ? narrowed
                  ? `Up to ${run.length} more questions on the same choice as this run.`
                  : `${run.length} more ${run.subject_name} questions, aimed at what’s still weak.`
                : "Loading…"}
            </span>
            <span className="rs-next-go">
              Start
              <IconArrowRight size={18} />
            </span>
          </button>
          {weakest && subject ? (
            <button
              type="button"
              className="rs-next-card"
              onClick={() => navigate(`/subjects/${subject.subject_id}`)}
            >
              <span className="rs-row">
                <span className="rs-tile pink" aria-hidden="true">
                  <IconTarget size={18} />
                </span>
                <b>Your weakest topic</b>
              </span>
              <span className="rs-next-text">
                {weakest.name} · {weakest.section_name ?? weakest.topic_name}
              </span>
              <span className="rs-next-go">
                Open subject
                <IconArrowRight size={18} />
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="rs-next-card"
            onClick={() => navigate("/home")}
          >
            <span className="rs-row">
              <span className="rs-tile ink" aria-hidden="true">
                <IconHome size={18} />
              </span>
              <b>Back home</b>
            </span>
            <span className="rs-next-text">
              See your plan and how far you’ve come.
            </span>
            <span className="rs-next-go">
              Home
              <IconArrowRight size={18} />
            </span>
          </button>
        </div>
        <NothingFreshNote starter={starter} />
        {starter.error ? <Alert>{starter.error}</Alert> : null}
      </section>
    </div>
  );
}
