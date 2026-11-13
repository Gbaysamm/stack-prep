/**
 * WHEN A WORD IS SAID: the time into a moment's voice clip at which the words a cue names
 * (`on:` in the lesson file, database/lesson_cues.py) begin, so the whiteboard style can bring
 * an item up as it is named (docs/lesson-style-guide.md section 6).
 *
 * Two sources, best first:
 *
 * 1. Word timings, where the voice comes with them (`[{w, start, end}]` in seconds: the Kokoro
 *    voice keeps them, fetched by the board with `api.lessonVoiceWords` and handed in with
 *    `setSpokenWords`; or on the lesson's beat as `words`). They are the line as SPOKEN, maths
 *    in words, so the cue's words are found in them the same way, and where they are not
 *    found the estimate is used.
 * 2. An estimate from the text: where the words begin as a share of the whole line, counted in
 *    characters as they are said, with a little extra for the pause a comma or a full stop
 *    makes, spread across the clip's real duration. Maths in `$…$` is said in words ("x
 *    squared"), so it counts for about four characters a sign.
 *
 * Matching is the server's: lower case, punctuation dropped, words inside maths not counted.
 */

import type { LessonCue } from "./api.js";

/** A word as a voice that times itself reports it, in seconds into the clip. */
export interface SpokenWord {
  w: string;
  start: number;
  end: number;
}

const MATHS = /\$[^$]*\$/g;
const BREAK = /[\s\-–—/]+/;

/** A word as it is matched: lower case, letters and digits only. */
export function foldWord(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** The words of `text` as they are matched (no maths, no punctuation), in order. */
export function spokenWords(text: string): string[] {
  return text
    .replace(MATHS, " ")
    .split(BREAK)
    .map(foldWord)
    .filter(Boolean);
}

/** The run of `want` in `heard`, its `nth` time (from 1): the index it starts at, or -1. */
function findRun(heard: string[], want: string[], nth: number): number {
  if (!want.length) return -1;
  let seen = 0;
  for (let start = 0; start + want.length <= heard.length; start += 1) {
    if (want.every((word, k) => heard[start + k] === word)) {
      seen += 1;
      if (seen === nth) return start;
    }
  }
  return -1;
}

/** Roughly how many characters a piece of maths takes to say. */
function mathsSpoken(latex: string): number {
  const signs = latex.replace(/\\[a-zA-Z]+/g, "x").replace(/[{}$^_&\\\s]/g, "").length;
  return Math.max(3, signs * 4);
}

const PAUSE: Record<string, number> = { ",": 3, ";": 4, ":": 4, ".": 6, "?": 6, "!": 6 };

/**
 * Each matchable word of `say`, with where it starts and ends as a share (0 to 1) of the time
 * the whole line takes to say.
 */
export function wordSpans(say: string): { word: string; from: number; to: number; pause: boolean }[] {
  const out: { word: string; at: number; end: number; pause: boolean }[] = [];
  let at = 0;
  const pieces = say.split(/(\$[^$]*\$)/g);
  for (const piece of pieces) {
    if (piece.startsWith("$") && piece.endsWith("$") && piece.length > 1) {
      at += mathsSpoken(piece) + 1;
      continue;
    }
    for (const token of piece.split(/(\s+)/)) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        at += 1;
        continue;
      }
      for (const part of token.split(/[-–—/]/)) {
        const word = foldWord(part);
        if (word) out.push({ word, at, end: at + part.replace(/[^\p{L}\p{N}]/gu, "").length, pause: false });
        at += part.length + 1;
      }
      const last = token.replace(/["'”’)]+$/, "").slice(-1);
      at += PAUSE[last] ?? 0;
      // The voice pauses after a word that ends a phrase (clipSpeech.ts places the pause).
      if (PAUSE[last] !== undefined && out.length) out[out.length - 1]!.pause = true;
    }
  }
  const total = Math.max(1, at);
  return out.map(({ word, at: start, end, pause }) => ({ word, from: start / total, to: end / total, pause }));
}

/**
 * Each matchable word of `say`, with where it starts as a share (0 to 1) of the time the whole
 * line takes to say.
 */
export function wordShares(say: string): { word: string; share: number }[] {
  return wordSpans(say).map(({ word, from }) => ({ word, share: from }));
}

/** About how long the line takes to say aloud, in seconds, at an ordinary speaking pace. */
export function typicalSeconds(say: string): number {
  // The same count wordSpans shares out: letters, spaces and the pauses punctuation makes, at
  // about fifteen a second.
  let units = 0;
  for (const piece of say.split(/(\$[^$]*\$)/g)) {
    if (piece.startsWith("$") && piece.endsWith("$") && piece.length > 1) units += mathsSpoken(piece) + 1;
    else for (const ch of piece) units += PAUSE[ch] !== undefined ? PAUSE[ch]! + 1 : 1;
  }
  return Math.max(0.6, units / 15);
}

/**
 * The words of `say` as a voice with no word timings is estimated to say them: placed across
 * [start, end] seconds by their share of the line.
 */
export function estimatedSpoken(say: string, start: number, end: number): SpokenWord[] {
  const span = Math.max(0.1, end - start);
  return wordSpans(say).map(({ word, from, to }) => ({
    w: word,
    start: start + from * span,
    end: start + Math.max(to, from + 0.01) * span,
  }));
}

/**
 * When the cue's words begin, in seconds into the clip: from the word timings where there are
 * some and the words are found in them, else estimated across `duration`. Null where the words
 * are not said at all (the loader refuses that, so only a hand-edited lesson gets here).
 */
export function cueSeconds(
  cue: LessonCue,
  say: string,
  duration: number,
  words?: SpokenWord[] | null,
): number | null {
  const want = spokenWords(cue.word);
  const nth = Math.max(1, cue.nth || 1);
  const shares = wordShares(say);
  const written = shares.map((one) => one.word);
  const at = findRun(written, want, nth);
  const estimate = at < 0 ? null : shares[at]!.share * duration;
  if (words && words.length) {
    // The voice's words are the line AS SPOKEN: its maths in words ("x cubed"), so a word the
    // maths says too can be heard more often than it is written. Where the counts agree the
    // nth is the nth; where they do not, the heard one nearest the estimate.
    const heard = words.map((word) => foldWord(word.w));
    const found: number[] = [];
    for (let k = 1; ; k += 1) {
      const start = findRun(heard, want, k);
      if (start < 0) break;
      found.push(start);
    }
    if (found.length) {
      const inText = runCount(written, want);
      if (found.length === inText && found[nth - 1] !== undefined) return words[found[nth - 1]!]!.start;
      if (estimate !== null) {
        const nearest = found.reduce((best, start) =>
          Math.abs(words[start]!.start - estimate) < Math.abs(words[best]!.start - estimate) ? start : best,
        );
        return words[nearest]!.start;
      }
      return words[found[Math.min(nth, found.length) - 1]!]!.start;
    }
  }
  return estimate;
}

/** How many times the run of `want` occurs in `heard`. */
/**
 * THE MARK ON ITS WORD (founder, 12 Nov 2026: marks lagged up to two seconds behind the word
 * they belong to). A mark the lesson gave no cue for is cued on what it points at, where that
 * is said in the moment: the number, "−4" said as "negative 4", or the short phrase itself.
 * Nothing when it is not said (the mark then keeps its turn with the others).
 */
export function derivedCue(at: string | null | undefined, say: string): LessonCue | null {
  if (!at) return null;
  const heard = spokenWords(say);
  const plain = at.replace(/\$/g, " ").replace(/[()[\]{}]/g, " ").trim();
  const signed = (text: string) => text.replace(/^[−-]\s*/, "").trim();
  const negative = /^[−-]/.test(plain);
  const candidates = [
    negative ? `negative ${signed(plain)}` : plain,
    negative ? `minus ${signed(plain)}` : null,
    plain.split(/[\s,;:=]+/).filter(Boolean)[0] ?? null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const want = spokenWords(candidate);
    if (want.length && findRun(heard, want, 1) >= 0) return { word: candidate, nth: 1 };
  }
  return null;
}

/**
 * THE LINE ON ITS WORDS (founder, 12 Nov 2026): a moment that says something first and sums
 * it up on the board ("Everything around you is matter… All matter is made of atoms") wrote
 * the summary as the voice began, before its words were said. A moment the lesson gave no cue
 * for writes its line when its first two words are said, where they come later in the moment.
 */
export function derivedWriteCue(line: string | null | undefined, say: string): LessonCue | null {
  if (!line) return null;
  const written = spokenWords(line);
  const heard = spokenWords(say);
  const first = written.slice(0, 2);
  if (first.length === 2) {
    const at = findRun(heard, first, 1);
    if (at >= 0) return at > 2 ? { word: first.join(" "), nth: 1 } : null;
  }
  // NOT WHILE THE LAST POINT IS STILL BEING SAID (founder, 12 Nov 2026): when the line's own
  // first words are not in what is said, it waits for the first word of weight in the speech
  // that is also on the line ("Both atoms are oxygen, so O₂ still has one kind of atom" writes
  // "One kind of atom, so still an element" on "still"), not the moment's first word.
  const onLine = new Set(written.map(stem));
  const at = heard.findIndex((word) => word.length >= 4 && !QUIET.has(word) && onLine.has(stem(word)));
  return at > 2 ? { word: heard[at]!, nth: 1 } : null;
}

/** "atoms" and "atom" are one word to the board. */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** Words too common to place a line by. */
const QUIET = new Set([
  "that", "this", "these", "those", "there", "their", "with", "from", "have", "each", "when",
  "what", "which", "where", "then", "than", "into", "only", "also", "they", "them", "your",
  "will", "would", "just", "some", "very", "both", "look", "here", "next", "first", "means",
]);

function runCount(heard: string[], want: string[]): number {
  let count = 0;
  while (findRun(heard, want, count + 1) >= 0) count += 1;
  return count;
}

/* ---- Word timings handed in by the voice ------------------------------------------------- */

const timings = new Map<string, SpokenWord[]>();

/** Word timings for the clip at `url`, from a voice that times its own words. */
export function setSpokenWords(url: string, words: SpokenWord[]): void {
  timings.set(url, words);
}

/** The word timings known for the clip at `url`, if any. */
export function spokenWordsFor(url: string | null | undefined): SpokenWord[] | null {
  if (!url) return null;
  return timings.get(url) ?? null;
}

/* ---- A moment's cues --------------------------------------------------------------------- */

/** What a cue brings up: the write, the sketch, a mark, a doodle, or a doodle action. */
export type CueKey =
  | "write"
  | "sketch"
  | `point:${number}`
  | `doodle:${number}`
  | `do:${number}`
  // A live diagram, and its actions (LiveDiagram.tsx).
  | "diagram"
  | `dia:${number}`;

/** The cued pieces of a moment, as the board knows it. */
export interface CuedMoment {
  say: string;
  on?: LessonCue | null;
  showSketch?: string | null;
  items: string[];
  point: { on?: LessonCue | null }[];
  doodle?: { on?: LessonCue | null } | null;
  doodles?: { on?: LessonCue | null }[] | null;
  doodleDo?: { on?: LessonCue | null }[] | null;
  diagram?: { on?: LessonCue | null } | null;
  diagramDo?: { on?: LessonCue | null }[] | null;
}

/**
 * Every cue in a moment, by what it brings up. A doodle is counted as the layer counts them:
 * its `doodle`, then its `doodles`.
 */
export function momentCues(moment: CuedMoment): { key: CueKey; cue: LessonCue }[] {
  const out: { key: CueKey; cue: LessonCue }[] = [];
  if (moment.on) {
    if (moment.items.length) out.push({ key: "write", cue: moment.on });
    if (moment.showSketch) out.push({ key: "sketch", cue: moment.on });
  }
  moment.point.forEach((point, k) => {
    if (point.on) out.push({ key: `point:${k}`, cue: point.on });
  });
  [moment.doodle, ...(moment.doodles ?? [])]
    .filter((doodle): doodle is { on?: LessonCue | null } => Boolean(doodle))
    .forEach((doodle, k) => {
      if (doodle.on) out.push({ key: `doodle:${k}`, cue: doodle.on });
    });
  (moment.doodleDo ?? []).forEach((action, k) => {
    if (action.on) out.push({ key: `do:${k}`, cue: action.on });
  });
  if (moment.diagram?.on) out.push({ key: "diagram", cue: moment.diagram.on });
  (moment.diagramDo ?? []).forEach((action, k) => {
    if (action.on) out.push({ key: `dia:${k}`, cue: action.on });
  });
  return out;
}

/* ---- Firing them as the voice plays ------------------------------------------------------ */

/**
 * Watch `clip` on every animation frame and report each cue as the voice reaches it (its
 * `at`, in seconds into the clip). Read from `clip.currentTime`, not a timer, so a paused voice
 * holds every cue exactly where it is, and a slowed one (playbackRate) slows them with it.
 * Cues already passed are reported at once. Returns the stop.
 */
export function startCueClock(
  clip: HTMLAudioElement,
  cues: { key: CueKey; at: number }[],
  reached: (keys: CueKey[]) => void,
): () => void {
  const left = [...cues].sort((a, b) => a.at - b.at);
  let frame = 0;
  const look = () => {
    const now = clip.currentTime;
    const due: CueKey[] = [];
    while (left.length && left[0]!.at <= now + 0.02) due.push(left.shift()!.key);
    if (due.length) reached(due);
    if (left.length) frame = requestAnimationFrame(look);
  };
  look();
  return () => cancelAnimationFrame(frame);
}
