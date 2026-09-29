/**
 * /progress/check-ins — everything the student has told us after a lesson on the board, what
 * each answer means, and what happens because of it.
 *
 * The check-in is not for us alone: a student who said "too hard" should be able to find that
 * lesson again, and a student who wonders why a right answer didn't count should find the
 * reason here, in words, next to the question it was about.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Maths } from "../../Maths.js";
import { MATCHED_WORD, UNDERSTOOD_WORD, WHY_BOARD, type Word } from "../checkinWords.js";
import { IconArrowRight, IconBook, IconBolt, IconChevronDown, IconReplay } from "../icons.js";
import { lessonFeedbackApi, type CheckinEntry, type Understood } from "../lessonFeedbackApi.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import { Button, CountUp, PageHero, Pager, Skeleton, cx, useNarrow, usePaged } from "../ui.js";
import { Alert, Note, NothingFreshNote, Section, useStartPractice } from "./Home.js";
import { whenLabel } from "./PracticeHub.js";
import "./CheckIns.css";

const PAGE = 8;

type Filter = "all" | Understood;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "too_hard", label: "Too hard" },
  { id: "unsure", label: "Still unsure" },
  { id: "got_it", label: "Got it" },
];

function Meaning({ word }: { word: Word }) {
  return (
    <li className="ci-mean">
      <span className="ci-mean-row">
        <span className={cx("ci-dot", word.tone)} aria-hidden="true" />
        <b>{word.label}</b>
      </span>
      <span className="ci-mean-text">{word.means}</span>
      <span className="ci-mean-then">
        <span className="sj-mono">Then</span> {word.then}
      </span>
    </li>
  );
}

/** The key: every answer a check-in can hold, in three groups, each with what it leads to. */
function Key({ folded }: { folded: boolean }) {
  const groups: { id: string; title: string; words: Word[] }[] = [
    { id: "why", title: "Why the board opened", words: Object.values(WHY_BOARD) },
    { id: "matched", title: "“Was this how you worked it out?”", words: Object.values(MATCHED_WORD) },
    { id: "landed", title: "“How was this lesson?”", words: Object.values(UNDERSTOOD_WORD) },
  ];
  return (
    <div className="ci-key">
      {groups.map((group) => {
        const words = (
          <ul>
            {group.words.map((word) => (
              <Meaning key={word.label} word={word} />
            ))}
          </ul>
        );
        // On a phone the key folds, so the student's own record isn't three screens down.
        return folded ? (
          <details key={group.id} className="sj-card ci-key-card">
            <summary className="ci-key-title">
              {group.title}
              <IconChevronDown size={18} />
            </summary>
            {words}
          </details>
        ) : (
          <div key={group.id} className="sj-card ci-key-card">
            <h3 className="ci-key-title">{group.title}</h3>
            {words}
          </div>
        );
      })}
    </div>
  );
}

function Pill({ word }: { word: Word }) {
  return (
    <span className={cx("ci-pill", word.tone)}>
      <span className={cx("ci-dot", word.tone)} aria-hidden="true" />
      {word.label}
    </span>
  );
}

function Entry({
  entry,
  starting,
  onPractise,
  notice,
}: {
  entry: CheckinEntry;
  starting: boolean;
  onPractise: () => void;
  /** Said under the buttons after a start: nothing fresh left there, or a failure. */
  notice?: ReactNode;
}) {
  const navigate = useNavigate();
  const why = WHY_BOARD[entry.context];
  const landed = UNDERSTOOD_WORD[entry.understood];
  const matched = entry.matched_working ? MATCHED_WORD[entry.matched_working] : null;
  const where = [entry.subject_name, entry.subtopic_name ?? entry.topic_name].filter(Boolean).join(" · ");
  return (
    <li className={cx("sj-card ci-entry", entry.understood)}>
      <div className="ci-entry-head">
        <span className="sj-eyebrow">{where}</span>
        <span className="ci-when sj-mono">{whenLabel(entry.at)}</span>
      </div>
      <p className="ci-stem">
        <Maths text={entry.stem_excerpt} />
      </p>

      <dl className="ci-said">
        <div>
          <dt>Before the lesson</dt>
          <dd>
            <Pill word={why} />
          </dd>
        </div>
        {matched ? (
          <div>
            <dt>Your working</dt>
            <dd>
              <Pill word={matched} />
            </dd>
          </div>
        ) : null}
        <div>
          <dt>How it landed</dt>
          <dd>
            <Pill word={landed} />
          </dd>
        </div>
      </dl>

      <div className="ci-what">
        <span className="ci-what-label sj-mono">What this means</span>
        <ul>
          <li>{why.then}</li>
          {matched ? <li>{matched.means}</li> : null}
          <li>{landed.then}</li>
        </ul>
      </div>

      <div className="ci-entry-go">
        <Button
          tone="soft"
          size="sm"
          busy={starting}
          onClick={onPractise}
          trailing={<IconArrowRight size={16} />}
        >
          {entry.subtopic_name ? `Practise ${entry.subtopic_name}` : `Practise ${entry.subject_name}`}
        </Button>
        <Button tone="ghost" size="sm" onClick={() => navigate(`/practice/${entry.session_id}/report`)}>
          See the run
        </Button>
      </div>
      {notice}
    </li>
  );
}

export function CheckIns() {
  usePageTitle("Your check-ins");
  const student = useStudent();
  const narrow = useNarrow(560);
  const list = useLoad(() => lessonFeedbackApi.entries(student.studentId), [student.studentId]);
  const [filter, setFilter] = useState<Filter>("all");
  const starter = useStartPractice();

  const entries = list.data ?? [];
  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: entries.length, got_it: 0, unsure: 0, too_hard: 0 };
    for (const entry of entries) out[entry.understood] += 1;
    return out;
  }, [entries]);
  const shown = filter === "all" ? entries : entries.filter((entry) => entry.understood === filter);
  const paged = usePaged(shown, PAGE, filter);

  // A check-in's run is on the subtopic that lesson was about; without one, the whole subject.
  const practise = (entry: CheckinEntry) =>
    void starter.start(
      entry.subject_id,
      entry.subtopic_id ? { subtopicIds: [entry.subtopic_id], label: entry.subtopic_name ?? undefined } : {},
      entry.id,
    );

  let body;
  if (list.error && !list.data) {
    body = (
      <Note
        card
        icon={<IconBolt size={18} />}
        tone="pink"
        title="We couldn’t load your check-ins"
        action={
          <Button tone="soft" icon={<IconReplay size={16} />} onClick={list.reload}>
            Try again
          </Button>
        }
      >
        What you said is saved. This is just a loading hiccup.
      </Note>
    );
  } else if (!list.data) {
    body = (
      <div className="ci-list">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={220} radius={14} />
        ))}
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <Note
        card
        icon={<IconBook size={18} />}
        title="No check-ins yet"
        action={
          <Button to="/practice" trailing={<IconArrowRight size={18} />}>
            Start practising
          </Button>
        }
      >
        When the coach works a question through with you, because you missed it twice or got it right
        without being sure, you tell us how it went. Each one appears here with what it means.
      </Note>
    );
  } else {
    body = (
      <>
        <div className="prog-filter ci-filter" role="group" aria-label="Show check-ins">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="sj-chip"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="ci-chip-n sj-mono">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="ci-none">None of your check-ins are “{FILTERS.find((f) => f.id === filter)?.label}”.</p>
        ) : (
          <ul className="ci-list">
            {paged.items.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                starting={starter.busy === entry.id}
                onPractise={() => practise(entry)}
                notice={
                  starter.exhausted?.key === entry.id ? (
                    <NothingFreshNote starter={starter} />
                  ) : starter.error && starter.busy === null && starter.lastKey === entry.id ? (
                    <Alert>{starter.error}</Alert>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
        <Pager paged={paged} noun="check-ins" label="Check-in pages" anchorId="ci-all" />
      </>
    );
  }

  return (
    <div className="sj-page ci">
      <PageHero
        back={{ to: "/progress", label: "Progress" }}
        eyebrow="After the board"
        title="Your check-ins"
        sub="Every time the coach works a question through with you, you tell us how it went. Here is all of it: what you said, what it means, and what happens next."
        aside={
          list.data && entries.length > 0 ? (
            <div className="ci-aside">
              <span className="sj-num ci-aside-num">
                <CountUp value={counts.too_hard + counts.unsure} />
              </span>
              <span className="ci-aside-cap">worth another look</span>
            </div>
          ) : undefined
        }
      />

      <Section
        eyebrow="The key"
        title="What your answers mean"
        id="ci-key"
        className="sj-rise d1"
        sub="The same three questions every time. There are no wrong answers: they show you, and us, which lessons landed and which to go back to."
      >
        <Key folded={narrow} />
      </Section>

      <Section
        eyebrow="Your record"
        title="Everything you’ve said"
        id="ci-all"
        className="sj-rise d2"
        sub="Newest first. If you answered twice for one question, both are here."
      >
        {body}
      </Section>
    </div>
  );
}
