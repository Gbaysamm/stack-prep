/**
 * THE COACH'S BUDDY: a small doodled character beside the coach card who follows the lesson
 * with a face — listening while the working is written, thinking (eyes up, hand on chin) when
 * the coach says "let's check" or shows the trap, an "hmm" when something is crossed out, an
 * "aha" when a key piece is circled or underlined, and a cheer when the answer lands. A tap
 * makes it wave.
 *
 * It needs nothing from the lesson's data: it reads the moment being said and its marks. Its
 * faces are the library's `buddy-*.svg` doodles (doodles/index.ts); a face not drawn yet falls
 * back to a plain placeholder. It is drawn in by the pen when the board opens, then changes face
 * at once, with a small pop. It is small on purpose: company, not a distraction.
 */

import { useEffect, useRef, useState } from "react";

import type { LessonPoint } from "./api.js";
import { Doodle } from "./Doodle.js";
import { libraryDoodle } from "./doodles/index.js";

type Mood = "neutral" | "thinking" | "hmm" | "aha" | "cheer" | "wave";

/** What the buddy reads of the moment being said. */
interface BuddyMoment {
  say: string;
  answer: boolean;
  point: LessonPoint[];
}

/** A plain face, for any expression the art does not have yet. */
function placeholder(mood: Mood): string {
  const mouth: Record<Mood, string> = {
    neutral: "M50 74Q60 80 70 74",
    thinking: "M52 76L68 74",
    hmm: "M50 78Q55 73 60 77Q65 81 70 76",
    aha: "M50 72Q60 84 70 72",
    cheer: "M46 70Q60 90 74 70Z",
    wave: "M50 72Q60 82 70 72",
  };
  const pupils = mood === "thinking" ? 'cy="52"' : 'cy="58"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-label="The coach's buddy, ${mood}">` +
    '<path d="M60 30C81 29 95 44 95 65C95 87 80 101 59 100C38 100 25 86 25 65C25 44 39 31 60 30Z" ' +
    'fill="#7c3aed" fill-opacity="0.3" stroke="#1d1b3a" stroke-width="3" stroke-linecap="round"/>' +
    '<g data-anim="blink" data-origin="60 58">' +
    `<circle cx="48" ${pupils} r="3.5" fill="#1d1b3a"/><circle cx="72" ${pupils} r="3.5" fill="#1d1b3a"/></g>` +
    `<path d="${mouth[mood]}" fill="none" stroke="#1d1b3a" stroke-width="3" stroke-linecap="round"/></svg>`
  );
}

function face(mood: Mood): { svg: string; alt: string } {
  const art = libraryDoodle(`buddy-${mood}`);
  return art ? { svg: art.svg, alt: art.alt } : { svg: placeholder(mood), alt: `The coach's buddy, ${mood}` };
}

/** Said when the coach turns to checking something, or to the trap. */
const CHECKING =
  /\b(let['’]?s|let us) (check|test|try|see)\b|\bcheck(ing)?\b|\btest each\b|^you (went|chose|picked)\b/i;

export function Buddy({
  moment,
  index,
  marked,
  finished,
  paused,
}: {
  moment: BuddyMoment | undefined;
  /** Which moment is being said. */
  index: number;
  /** That moment's marks are going up. */
  marked: boolean;
  finished: boolean;
  paused: boolean;
}) {
  // The face for the moment as a whole, and a passing one over it (a reaction, a wave).
  const steady: Mood =
    !moment || finished || moment.answer || !CHECKING.test(moment.say.trim()) ? "neutral" : "thinking";
  const [passing, setPassing] = useState<Mood | null>(null);
  const timer = useRef(0);
  const flash = (mood: Mood, ms: number) => {
    window.clearTimeout(timer.current);
    setPassing(mood);
    timer.current = window.setTimeout(() => setPassing(null), ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A new moment clears whatever passing face the last one left; the answer landing is cheered.
  const answering = Boolean(moment?.answer);
  useEffect(() => {
    window.clearTimeout(timer.current);
    setPassing(null);
    if (answering) flash("cheer", 3800);
  }, [index, answering]);

  // The marks landing: something crossed out, or a key piece circled or underlined. A mark the
  // board added for itself (a quote found in the passage) is not the coach pointing.
  useEffect(() => {
    if (!marked || !moment) return;
    const kinds = moment.point
      .filter((point) => !(point as { auto?: boolean }).auto)
      .map((point) => point.kind);
    if (kinds.includes("strike")) flash("hmm", 2600);
    else if (kinds.some((kind) => kind === "underline" || kind === "circle" || kind === "box")) flash("aha", 2400);
    // Once per moment: the moment's marks go up once.
  }, [marked, index]);

  const mood = passing ?? steady;
  const [bump, setBump] = useState(0);
  const drawn = useRef(false);
  const { svg, alt } = face(mood);
  return (
    <div className="pb-buddy" title="Tap me">
      <Doodle
        key={mood}
        svg={svg}
        alt={alt}
        size={56}
        paused={paused}
        drawKey="pb-buddy"
        instant={drawn.current}
        bump={bump}
        onDrawn={() => {
          drawn.current = true;
        }}
        onTap={() => {
          flash("wave", 1900);
          setBump((n) => n + 1);
        }}
      />
      {mood === "cheer" ? (
        <svg className="pb-buddy-stars" viewBox="0 0 30 30" aria-hidden="true">
          <path d="M8 2l1.8 4 4.2.5-3.1 2.9.9 4.2L8 11.4l-3.8 2.2.9-4.2L2 6.5l4.2-.5z" />
          <path d="M22 12l1.4 3 3.2.4-2.4 2.2.7 3.2-2.9-1.7-2.9 1.7.7-3.2-2.4-2.2 3.2-.4z" />
        </svg>
      ) : null}
    </div>
  );
}
