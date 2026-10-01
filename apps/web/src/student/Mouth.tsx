/**
 * THE TALKING MOUTH (docs/plans/doodles-v2-contract.md section 7): for oral English, a mouth on
 * the board that says a word in time with the voice, so the student sees the shape of each
 * sound as they hear it.
 *
 * - THE SHAPES. Fourteen visemes (mouthTimeline.ts) drawn in the doodles' style: ink #1d1b3a
 *   with round caps, soft pink lips and tongue, white teeth. From the front (`view: front`):
 *   lips, teeth and tongue. From the side (`view: side`): a cut-away of the head, labelled
 *   (roof, teeth, tongue, lips), with the tongue's place and a ring where it touches, for
 *   consonants such as θ, ð, n, l, r. Each shape is a set of numbers (how wide, how open, how
 *   round, where the tongue tip is...), and the drawing is made from them every frame, so one
 *   shape becomes the next by easing the numbers: a smooth morph, never a cut.
 * - IN TIME WITH THE VOICE, ALWAYS. The shape due is read every frame from the clock of what is
 *   actually being heard: the playing clip's own `currentTime` (so a pause holds the mouth and
 *   the board's speed carries it), or, where the line has no voice (none here, or it failed),
 *   the time since the line began, at an ordinary speaking pace. What is said when is the
 *   moment's SCRIPT (mouthTimeline.ts, `scriptFor`): every word the mouth is given in that
 *   moment (its own, and each `say`), every time the voice says it after its cue. It starts
 *   at once from an estimate (the line's words spread over the clip, each word's sounds from
 *   its spelling) and is replaced, as soon as they come, by the voice's own sounds (`/phones`:
 *   the Kokoro voice's real timings, or the studio voice's estimated from espeak). An estimate
 *   is fitted to where the clip is heard to speak, its pauses in its silences (clipSpeech.ts).
 *   Nothing waits for the network: a mouth that waited missed its word and stood still.
 * - THE TAUGHT SOUND (`sound`) is held for at least HOLD_S, and its symbol is written beside
 *   the mouth as it is reached; a compared word is written under it.
 * - STRESS: `syllables` are written under the mouth; the stressed one grows big and pulses
 *   while it is said, the others stay small.
 * - TAP: the word again, slowly (speed 0.8), in the free Kokoro voice only, with the mouth
 *   moving to it; where that voice is not offered, the mouth says it silently, slowly.
 * - Less movement asked for: the taught sound's shape, still, with its symbol.
 * - Sound effects (a pop as it comes in, the pen as the symbol is written) only in the
 *   whiteboard style.
 * - `data-viseme`, `data-word` and `data-clock` on the figure say what it is doing, for checks.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  api,
  type LessonDoodleOp,
  type LessonMouth,
  type MouthWord,
  type VoicePhones,
} from "./api.js";
import { useBoardPrefs } from "./boardPrefs.js";
import { stillMotion } from "./ink.js";
import type { DoodleTask } from "./LiveDoodle.js";
import {
  finishedAt,
  fittedGuess,
  guessedPhones,
  partAt,
  scriptFor,
  shifted,
  speechFor,
  syllableAt,
  visemeAt,
  visemeOf,
  type MouthSaying,
  type Part,
  type Viseme,
} from "./mouthTimeline.js";
import { alignToSpeech, clipSegments, retimed, type Segments } from "./clipSpeech.js";
import { playSfx } from "./sfx.js";
import { estimatedSpoken, typicalSeconds, wordSpans } from "./wordClock.js";
import "./mouth.css";

/* ---- The shapes, as numbers ---------------------------------------------------------------- */

/** From the front: [half-width, half-opening, roundness, lip, upper teeth, lower teeth, tongue
 *  height, tongue tip out, bite (teeth on lip), pushed out]. */
type FrontShape = [number, number, number, number, number, number, number, number, number, number];

const FRONT: Record<Viseme, FrontShape> = {
  rest: [30, 1.5, 0.15, 7, 0, 0, 0, 0, 0, 0],
  closed: [28, 0, 0.1, 7.4, 0, 0, 0, 0, 0, 0],
  fv: [32, 4.5, 0.1, 6.6, 1, 0, 0, 0, 1, 0],
  th: [32, 8, 0.2, 7, 1, 0.8, 0.6, 1, 0, 0],
  slight: [32, 7.5, 0.25, 7, 0.9, 0.8, 0.5, 0, 0, 0],
  spread: [43, 6, 0.08, 5.6, 1, 0.9, 0.4, 0, 0, 0],
  lax: [34, 11, 0.3, 7, 0.9, 0.5, 0.45, 0, 0, 0],
  wide: [33, 23, 0.45, 7, 0.7, 0.3, 0.45, 0, 0, 0],
  round: [13, 13, 0.55, 9.5, 0.2, 0, 0.2, 0, 0, 1],
  roundLax: [19, 12, 0.5, 9, 0.4, 0.2, 0.3, 0, 0, 0.6],
  sh: [19, 9, 0.5, 10, 1, 1, 0.2, 0, 0, 1],
  r: [21, 9, 0.45, 8.5, 0.6, 0.3, 0.3, 0, 0, 0.5],
  back: [30, 14, 0.35, 7, 0.6, 0.4, 0.95, 0, 0, 0],
  mid: [30, 12.5, 0.35, 7, 0.6, 0.4, 0.45, 0, 0, 0],
};

/** From the side: [jaw (degrees), lips sealed, lower lip to teeth, lips pushed out], then the
 *  tongue's back, top, front, tip, underside and floor, as x, y pairs. */
type SideShape = number[];
const TONGUE: Record<string, number[]> = {
  rest: [48, 66, 68, 58, 88, 60, 99, 63, 93, 70, 84, 78],
  alveolar: [48, 66, 70, 56, 88, 50, 98, 46, 92, 56, 84, 74],
  th: [50, 66, 72, 58, 92, 56, 109, 56, 98, 62, 86, 76],
  r: [48, 62, 66, 54, 82, 50, 88, 43, 86, 52, 80, 72],
  back: [50, 45, 60, 43, 80, 58, 98, 66, 92, 72, 84, 80],
  sh: [48, 62, 70, 52, 88, 46, 95, 50, 90, 58, 84, 74],
  spread: [48, 60, 72, 48, 90, 52, 99, 62, 93, 68, 84, 76],
  lax: [48, 62, 72, 52, 90, 56, 99, 64, 93, 70, 84, 78],
  wide: [44, 76, 66, 74, 88, 78, 100, 80, 94, 87, 84, 92],
  round: [48, 52, 58, 48, 80, 60, 97, 66, 92, 72, 84, 80],
  mid: [46, 67, 68, 64, 88, 66, 99, 70, 93, 76, 84, 84],
};
const SIDE: Record<Viseme, SideShape> = {
  rest: [2, 0.6, 0, 0, ...TONGUE.rest!],
  closed: [0, 1, 0, 0, ...TONGUE.rest!],
  fv: [3, 0, 1, 0, ...TONGUE.rest!],
  th: [6, 0, 0, 0, ...TONGUE.th!],
  slight: [4, 0, 0, 0, ...TONGUE.alveolar!],
  spread: [4, 0, 0, 0, ...TONGUE.spread!],
  lax: [8, 0, 0, 0, ...TONGUE.lax!],
  wide: [16, 0, 0, 0, ...TONGUE.wide!],
  round: [6, 0, 0, 1, ...TONGUE.round!],
  roundLax: [7, 0, 0, 0.6, ...TONGUE.round!],
  sh: [3, 0, 0, 1, ...TONGUE.sh!],
  r: [6, 0, 0, 0.5, ...TONGUE.r!],
  back: [9, 0, 0, 0, ...TONGUE.back!],
  mid: [10, 0, 0, 0, ...TONGUE.mid!],
};

const INK = "#1d1b3a";
const LIP = "#f6a5c8";
const TONGUE_FILL = "#f472b6";
const INSIDE = "#4a1d3f";
const TOUCH = "#db2777";

const f = (n: number) => n.toFixed(1);

/** The front view's paths for a shape, about (cx, cy) in the face's own units. */
function frontPaths(shape: number[], cx: number, cy: number) {
  const [w, h, round, lip, up, lo, tongue, tip, bite, push] = shape as FrontShape;
  const top = cy - 0.85 * h;
  const bot = cy + 1.15 * h;
  const L = cx - w;
  const R = cx + w;
  const k = Math.min(0.552, Math.max(0, round));
  const dt = cy - top;
  const db = bot - cy;
  const top1 = `C${f(L)} ${f(cy - k * dt)} ${f(cx - 0.552 * w)} ${f(top)} ${f(cx)} ${f(top)}`;
  const top2 = `C${f(cx + 0.552 * w)} ${f(top)} ${f(R)} ${f(cy - k * dt)} ${f(R)} ${f(cy)}`;
  const bot1 = `C${f(R)} ${f(cy + k * db)} ${f(cx + 0.552 * w)} ${f(bot)} ${f(cx)} ${f(bot)}`;
  const bot2 = `C${f(cx - 0.552 * w)} ${f(bot)} ${f(L)} ${f(cy + k * db)} ${f(L)} ${f(cy)}`;
  const inner = `M${f(L)} ${f(cy)}${top1}${top2}${bot1}${bot2}Z`;
  // The inner top, right to left, and the inner bottom, left to right: the lips' inner edges.
  const topBack = `C${f(R)} ${f(cy - k * dt)} ${f(cx + 0.552 * w)} ${f(top)} ${f(cx)} ${f(top)}C${f(cx - 0.552 * w)} ${f(top)} ${f(L)} ${f(cy - k * dt)} ${f(L)} ${f(cy)}`;
  const botBack = `C${f(L)} ${f(cy + k * db)} ${f(cx - 0.552 * w)} ${f(bot)} ${f(cx)} ${f(bot)}C${f(cx + 0.552 * w)} ${f(bot)} ${f(R)} ${f(cy + k * db)} ${f(R)} ${f(cy)}`;
  const Lo = L - 3 - push * 1.5;
  const Ro = R + 3 + push * 1.5;
  const T = lip + push * 1.5;
  const peak = top - T - 1.5;
  const dip = top - T + 1.4;
  const PL = cx - Math.max(5, w * 0.3);
  const PR = cx + Math.max(5, w * 0.3);
  const upper =
    `M${f(Lo)} ${f(cy)}C${f(Lo + 2)} ${f(cy - (cy - peak) * 0.55)} ${f(PL - w * 0.3)} ${f(peak)} ${f(PL)} ${f(peak)}` +
    `C${f(PL + 3)} ${f(peak)} ${f(cx - 3)} ${f(dip - 1)} ${f(cx)} ${f(dip)}` +
    `C${f(cx + 3)} ${f(dip - 1)} ${f(PR - 3)} ${f(peak)} ${f(PR)} ${f(peak)}` +
    `C${f(PR + w * 0.3)} ${f(peak)} ${f(Ro - 2)} ${f(cy - (cy - peak) * 0.55)} ${f(Ro)} ${f(cy)}` +
    `L${f(R)} ${f(cy)}${topBack}Z`;
  const low = bot + T * 1.3;
  const lower =
    `M${f(Ro)} ${f(cy)}C${f(Ro - 2)} ${f(cy + (low - cy) * 0.6)} ${f(cx + w * 0.62)} ${f(low)} ${f(cx)} ${f(low)}` +
    `C${f(cx - w * 0.62)} ${f(low)} ${f(Lo + 2)} ${f(cy + (low - cy) * 0.6)} ${f(Lo)} ${f(cy)}` +
    `L${f(L)} ${f(cy)}${botBack}Z`;
  const upH = 2 + up * Math.min(6.5, 0.85 * h + 1);
  const loH = 2 + lo * Math.min(5.5, 1.15 * h);
  const tongueTop = bot + 3 - tongue * (1.1 * h + 4);
  return {
    inner,
    upper,
    lower,
    upperTeeth: { x: cx - w * 0.8, y: top - 2, width: w * 1.6, height: upH },
    lowerTeeth: { x: cx - w * 0.7, y: bot - loH + 2, width: w * 1.4, height: loH },
    gaps: `M${f(cx - 8)} ${f(top)}v${f(upH - 2)}M${f(cx)} ${f(top)}v${f(upH - 2)}M${f(cx + 8)} ${f(top)}v${f(upH - 2)}`,
    tongue: { cx, cy: tongueTop + 8, rx: Math.max(6, w * 0.72), ry: 8 },
    tip: { cx, cy: cy + 2.2, rx: 9 + tip, ry: 4.6, opacity: tip },
    bite: { x: cx - 13, y: cy - 2.5, width: 26, height: 5.5, opacity: bite },
    corners: `M${f(Lo - 1)} ${f(cy - 4)}q-3 4 0 8M${f(Ro + 1)} ${f(cy - 4)}q3 4 0 8`,
  };
}

/** A smooth closed curve through the points (Catmull-Rom as cubic Béziers). */
function closedCurve(points: [number, number][]): string {
  const n = points.length;
  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Where the tongue can touch, from the side: the ridge behind the teeth, the teeth, the soft
 *  palate at the back. */
const TOUCHES: { at: [number, number]; point: number }[] = [
  { at: [99, 47], point: 3 },
  { at: [106, 55], point: 3 },
  { at: [55, 42], point: 0 },
];

/** The side view's moving parts for a shape. */
function sidePaths(shape: number[]) {
  const [jaw = 0, seal = 0, bite = 0, push = 0, ...t] = shape;
  const p = push * 5;
  const pt = (i: number): [number, number] => [t[i * 2] ?? 0, t[i * 2 + 1] ?? 0];
  const tongue = closedCurve([[46, 90], pt(0), pt(1), pt(2), pt(3), pt(4), pt(5), [62, 88]]);
  const upperLip = `M109 38C${f(115 + p)} 40 ${f(118 + p)} 46 ${f(115 + p)} 51L106 51C107 46 108 42 109 38Z`;
  const lowerLip = `M106 56C${f(114 + p)} 55 ${f(117 + p)} 60 ${f(113 + p)} 66L105 64C105 61 105 58 106 56Z`;
  const chin = `M${f(113 + p)} 66C108 69 105 71 107 77C109 85 104 92 92 96C80 100 66 102 56 104`;
  // A ring where the tongue touches: its tip on the ridge or the teeth, or its back up on the
  // soft palate, so "tongue up behind the teeth" can be seen.
  let touch = { x: 0, y: 0, o: 0 };
  for (const spot of TOUCHES) {
    const [x, y] = pt(spot.point);
    const d = Math.hypot(x - spot.at[0], y - spot.at[1]);
    const o = Math.max(0, Math.min(1, 1 - (d - 2) / 5));
    if (o > touch.o) touch = { x: spot.at[0], y: spot.at[1], o };
  }
  return {
    tongue,
    upperLip,
    lowerLip,
    chin,
    jaw: `rotate(${f(jaw)} 44 46)`,
    lip: `rotate(${f(jaw)} 44 46) translate(${f(-4 * bite)} ${f(-5 * seal - 6 * bite)})`,
    touch,
  };
}

/* ---- The voice's sounds ---------------------------------------------------------------------- */

/** Sounds handed in for a clip (the dev harness), before any are asked of the API. */
const knownPhones = new Map<string, VoicePhones>();
export function setSpokenPhones(url: string, phones: VoicePhones): void {
  knownPhones.set(url, phones);
}
const askedPhones = new Map<string, Promise<VoicePhones | null>>();
function phonesFor(url: string, fresh = false): Promise<VoicePhones | null> {
  const known = knownPhones.get(url);
  if (known) return Promise.resolve(known);
  if (fresh || !askedPhones.has(url))
    askedPhones.set(url, api.lessonVoicePhones(url).catch(() => null));
  return askedPhones.get(url)!;
}

/** Words said slowly by the free voice, handed in (the dev harness) or asked for once. */
const knownWords = new Map<string, MouthWord>();
export function setMouthWord(word: string, said: MouthWord): void {
  knownWords.set(word.toLowerCase(), said);
}
const askedWords = new Map<string, Promise<MouthWord | null>>();
function wordSaid(session: string | null, word: string): Promise<MouthWord | null> {
  const key = word.toLowerCase();
  const known = knownWords.get(key);
  if (known) return Promise.resolve(known);
  if (!session) return Promise.resolve(null);
  if (!askedWords.has(key)) {
    const asking = api.mouthSay(session, key).catch(() => null);
    askedWords.set(key, asking);
    // A refusal (too many, or no free voice) is not kept: a later tap asks again.
    void asking.then((got) => {
      if (!got) askedWords.delete(key);
    });
  }
  return askedWords.get(key)!;
}

function sessionOf(url: string | null | undefined): string | null {
  return url?.match(/\/v1\/practice\/([^/]+)\/lesson\//)?.[1] ?? null;
}

/* ---- The clock --------------------------------------------------------------------------------- */

/** Where a clip is taken to start and stop speaking (the voices' own pads: about 80 ms before
 *  the first sound, 120 to 150 ms after the last). */
const LEAD_S = 0.09;
const TAIL_S = 0.14;
/** Without a voice, the line is taken to start being said this long after it comes up. */
const READ_LEAD_S = 0.35;
/** A clip that has not started this long into its moment, and is not loading, is not coming. */
const NO_VOICE_S = 4;
/**
 * The shape is aimed this far ahead of the sound: the drawing eases into each shape over about
 * 30 ms and reaches the screen a frame later, so aiming ahead lands it as the sound is heard
 * (a real mouth, too, is in place a moment before the sound comes).
 */
const LOOK_AHEAD_S = 0.04;

/** The script of a moment as it is heard: from its clip, or read without a voice. `speech` is
 *  where the clip is heard to speak (clipSpeech.ts), for a voice whose times are estimated. */
function scriptOf(
  sayings: MouthSaying[],
  say: string,
  heard: VoicePhones | null,
  duration: number | null,
  syllables: string[] | null | undefined,
  speech: Segments | null,
): Part[] {
  if (heard && heard.phones.length) {
    let words = heard.words.length
      ? heard.words
      : estimatedSpoken(say, LEAD_S, Math.max(LEAD_S + 0.2, heard.duration - TAIL_S));
    let phones = heard.phones;
    if (heard.estimated && speech?.length) {
      // The studio voice's sounds are spread evenly over its clip: fitted to where it speaks.
      const fitted = alignToSpeech(words, speech, heard.words.length ? undefined : wordSpans(say).map((one) => one.pause));
      phones = retimed(phones, words, fitted);
      words = fitted;
    }
    return scriptFor(sayings, words, phones, syllables);
  }
  if (duration !== null) {
    let words = estimatedSpoken(say, LEAD_S, Math.max(LEAD_S + 0.2, duration - TAIL_S));
    if (speech?.length) words = alignToSpeech(words, speech, wordSpans(say).map((one) => one.pause));
    return scriptFor(sayings, words, null, syllables);
  }
  // Read without a voice, the board holds the line for its reading time (Board.tsx,
  // `readingMs`): the words are said at a speaking pace, or faster where that would not fit.
  const held = Math.min(9, Math.max(2.5, say.length * 0.055));
  const span = Math.max(0.6, Math.min(typicalSeconds(say), held - READ_LEAD_S - 0.3));
  return scriptFor(sayings, estimatedSpoken(say, READ_LEAD_S, READ_LEAD_S + span), null, syllables);
}

/* ---- The component ------------------------------------------------------------------------- */

/** What the mouth needs of a moment of the lesson. */
export interface MouthMoment {
  say?: string;
  voice?: string | null;
  doodleDo?: LessonDoodleOp[] | null;
}

/** A word said again when the mouth is tapped. */
interface Replay {
  audio: HTMLAudioElement | null;
  /** performance.now() when a silent replay began. */
  from: number;
  parts: Part[];
}

/** The drawing box (viewBox units): the face on the left, its symbol and word on the right. */
const VIEW_W = 240;
const MOUTH_H = 132;
const SYLLABLE_H = 38;
/** The face is drawn in its own units (about 100 across) and scaled up by this. */
const FACE_SCALE = 1.28;
const FACE_Y = 66;
/** The column the symbol and the compared word are written in. */
const NOTE_X = 196;

/** The mouth's drawing box (viewBox units): the face, its symbol, and its syllables. */
export function mouthBox(spec: LessonMouth): { w: number; h: number } {
  return { w: VIEW_W, h: MOUTH_H + (spec.syllables?.length ? SYLLABLE_H : 0) };
}

export function Mouth({
  spec,
  moment,
  tasks,
  current,
  moments,
  clipAt,
  width,
  height,
  caption,
  paused = false,
}: {
  spec: LessonMouth;
  /** The moment that brings it in. */
  moment: number;
  /** Its later moments' actions (`say`, `pulse`), as DoodleLayer gives them. */
  tasks: DoodleTask[];
  /** The moment being said now. */
  current: number;
  moments: MouthMoment[];
  /** A moment's voice clip, where the board has one. */
  clipAt?: (moment: number) => HTMLAudioElement | null;
  width: number;
  height: number;
  caption: string | null;
  /** The lesson is paused: the mouth's own movements stop too. */
  paused?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const whiteboard = useBoardPrefs().style === "whiteboard";
  const still = useMemo(() => stillMotion(), []);
  const side = spec.view === "side";

  //: Every word the mouth is given, by the moment it is said in: its own as it comes in, and
  //: each later `say` (read from the moments themselves, so it keeps its own time on the word).
  const byMoment = useMemo(() => {
    const out = new Map<number, MouthSaying[]>();
    const add = (at: number, one: MouthSaying) => out.set(at, [...(out.get(at) ?? []), one]);
    add(moment, { word: spec.word, sound: spec.sound ?? null, cue: spec.on ?? null, own: true });
    if (spec.id)
      moments.forEach((entry, at) => {
        if (at <= moment) return;
        for (const op of entry.doodleDo ?? []) {
          if (op.op !== "say" || op.id !== spec.id) continue;
          const word = op.word?.trim() || spec.word;
          const own = word.toLowerCase() === spec.word.toLowerCase();
          add(at, { word, sound: op.sound ?? (own ? spec.sound ?? null : null), cue: op.on ?? null, own });
        }
      });
    return out;
  }, [moment, moments, spec]);
  const manyWords = [...byMoment.values()].flat().length > 1;
  //: Whether anything is written beside the mouth; where nothing is, the face is centred.
  const labelled = manyWords || Boolean(spec.sound) || [...byMoment.values()].flat().some((one) => one.sound);
  // The side view's names for its parts reach further left ("tongue"), so it sits a little right.
  const faceX = labelled ? (side ? 92 : 78) : VIEW_W / 2;
  const pulses = useMemo(() => tasks.filter((task) => task.op.op === "pulse" && task.live).map((task) => task.key).join(","), [tasks]);
  //: The word a tap says again: the latest the mouth has been given by now.
  const tapWord = useMemo(() => {
    let found: MouthSaying = byMoment.get(moment)![0]!;
    for (const [at, list] of byMoment) if (at <= current && at >= moment) found = list[list.length - 1] ?? found;
    return found;
  }, [byMoment, current, moment]);

  //: What is written beside the mouth: the taught sound's symbol (as it is reached) and the
  //: word being said, with a count so a word written again is written again by the pen.
  const [written, setWritten] = useState<{ symbol: string | null; word: string; n: number } | null>(
    still && spec.sound ? { symbol: spec.sound, word: spec.word, n: 0 } : null,
  );
  const [syllable, setSyllable] = useState(-1);
  const [said, setSaid] = useState<Set<number>>(() => new Set());
  const [pulsing, setPulsing] = useState(false);

  // What the frame loop reads, kept current without restarting it.
  const live = useRef({ current, paused, clipAt, moments, byMoment, whiteboard, syllables: spec.syllables ?? null });
  live.current = { current, paused, clipAt, moments, byMoment, whiteboard, syllables: spec.syllables ?? null };
  //: The voice's sounds for a clip, once they have come (by its URL).
  const heard = useRef(new Map<string, VoicePhones>());
  //: Where each clip without real timings is heard to speak (by its URL), once decoded.
  const spoken = useRef(new Map<string, Segments>());
  //: Scripts already worked out, by moment and what they were worked out from.
  const scripts = useRef(new Map<string, Part[]>());
  //: Seconds the current moment has been up and not paused: the clock when there is no voice.
  const reading = useRef({ moment: -1, seconds: 0 });
  const replay = useRef<Replay | null>(null);
  const wroteRef = useRef<string | null>(null);
  const shape = useRef<number[] | null>(null);
  const lastFrame = useRef(0);
  const figureRef = useRef<HTMLElement>(null);
  const refs = {
    inner: useRef<SVGPathElement>(null),
    clip: useRef<SVGPathElement>(null),
    upper: useRef<SVGPathElement>(null),
    lower: useRef<SVGPathElement>(null),
    upperTeeth: useRef<SVGRectElement>(null),
    lowerTeeth: useRef<SVGRectElement>(null),
    gaps: useRef<SVGPathElement>(null),
    tongue: useRef<SVGEllipseElement>(null),
    tip: useRef<SVGEllipseElement>(null),
    bite: useRef<SVGRectElement>(null),
    corners: useRef<SVGPathElement>(null),
    sTongue: useRef<SVGPathElement>(null),
    sLower: useRef<SVGGElement>(null),
    sJaw: useRef<SVGGElement>(null),
    sLowerLip: useRef<SVGPathElement>(null),
    sUpperLip: useRef<SVGPathElement>(null),
    sChin: useRef<SVGPathElement>(null),
    sTouch: useRef<SVGCircleElement>(null),
  };
  const refsRef = useRef(refs);
  refsRef.current = refs;

  /** Draw a shape (numbers) into the SVG. */
  const draw = useCallback(
    (now: number[]) => {
      const r = refsRef.current;
      if (side) {
        const s = sidePaths(now);
        r.sTongue.current?.setAttribute("d", s.tongue);
        r.sUpperLip.current?.setAttribute("d", s.upperLip);
        r.sLowerLip.current?.setAttribute("d", s.lowerLip);
        r.sChin.current?.setAttribute("d", s.chin);
        r.sJaw.current?.setAttribute("transform", s.jaw);
        r.sLower.current?.setAttribute("transform", s.lip);
        const ring = r.sTouch.current;
        if (ring) {
          ring.setAttribute("cx", f(s.touch.x));
          ring.setAttribute("cy", f(s.touch.y));
          ring.setAttribute("opacity", s.touch.o.toFixed(2));
        }
        return;
      }
      const p = frontPaths(now, 66, 54);
      r.inner.current?.setAttribute("d", p.inner);
      r.clip.current?.setAttribute("d", p.inner);
      r.upper.current?.setAttribute("d", p.upper);
      r.lower.current?.setAttribute("d", p.lower);
      r.gaps.current?.setAttribute("d", p.gaps);
      r.corners.current?.setAttribute("d", p.corners);
      const set = (el: Element | null, attrs: Record<string, number>) => {
        if (!el) return;
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value.toFixed(2));
      };
      set(r.upperTeeth.current, p.upperTeeth);
      set(r.lowerTeeth.current, p.lowerTeeth);
      set(r.tongue.current, p.tongue);
      set(r.tip.current, p.tip);
      set(r.bite.current, p.bite);
    },
    [side],
  );

  /** The numbers of a mouth shape in this view. */
  const shapeOf = useCallback((viseme: Viseme) => [...(side ? SIDE[viseme] : FRONT[viseme])], [side]);

  // Less movement: the taught sound's shape, still.
  const stillShape = useMemo(() => {
    const sound = spec.sound ?? guessedPhones(spec.word).find((phone) => /[aeiouæɑɒɔəɛɜɪʊʌ]/.test(phone.p))?.p ?? "";
    return shapeOf(sound ? visemeOf(sound) : "rest");
  }, [shapeOf, spec.sound, spec.word]);

  /** A moment's script, as it is heard now: from its clip (its sounds, or its length) or read. */
  const scriptNow = useCallback((at: number, duration: number | null): Part[] => {
    const { moments: all, byMoment: given, syllables } = live.current;
    const entry = all[at];
    const url = entry?.voice ?? null;
    const voice = duration !== null && url ? heard.current.get(url) ?? null : null;
    const speech = duration !== null && url ? spoken.current.get(url) ?? null : null;
    const key = `${at}|${voice ? "voice" : duration !== null ? `clip:${duration.toFixed(2)}` : "read"}|${speech ? "fitted" : ""}`;
    let found = scripts.current.get(key);
    if (!found) {
      found = scriptOf(given.get(at) ?? [], entry?.say ?? "", voice, duration, syllables, speech);
      scripts.current.set(key, found);
    }
    return found;
  }, []);

  // THE FRAME LOOP: the clock of what is being heard, the part of the script said now, its shape
  // eased towards.
  useEffect(() => {
    if (still) {
      draw(stillShape);
      return;
    }
    let frame = 0;
    let lastSyllable = -2;
    let lastShown = "";
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = lastFrame.current ? Math.min(0.1, (now - lastFrame.current) / 1000) : 0.016;
      lastFrame.current = now;
      const { current: at, paused: held, clipAt: clipOf, byMoment: given } = live.current;
      if (reading.current.moment !== at) reading.current = { moment: at, seconds: 0 };
      else if (!held) reading.current.seconds += dt;

      let parts: Part[] | null = null;
      let t = 0;
      let clock = "none";
      const again = replay.current;
      if (again) {
        t = again.audio ? again.audio.currentTime : (now - again.from) / 1000;
        const over = again.audio ? again.audio.ended || (again.audio.paused && t > 0 && held) : false;
        if (over || t > finishedAt(again.parts[0]!.speech) + 0.3) replay.current = null;
        else {
          parts = again.parts;
          clock = "replay";
        }
      }
      if (!parts && given.has(at)) {
        const clip = clipOf?.(at) ?? null;
        const failed = !clip || clip.error !== null;
        const playing = !failed && (!clip.paused || clip.currentTime > 0);
        if (playing) {
          // The clip itself: what the student hears is where the mouth is.
          const length = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : null;
          t = clip.currentTime;
          parts = length !== null ? scriptNow(at, length) : scriptNow(at, null);
          clock = "clip";
        } else if (failed || (reading.current.seconds > NO_VOICE_S && clip.readyState === 0)) {
          // No voice for this line: it is read, and the mouth says its words at a speaking pace.
          t = reading.current.seconds;
          parts = scriptNow(at, null);
          clock = "read";
        }
      }
      if (clock === "clip" || clock === "replay") t += LOOK_AHEAD_S;
      const part = parts ? partAt(parts, t) : null;
      let viseme: Viseme = "rest";
      let syll = -1;
      if (part) {
        const due = visemeAt(part.speech, t);
        viseme = due.viseme;
        if (part.own) syll = syllableAt(part.speech, t);
        // The symbol is written as the taught sound is reached; a word without one as it starts.
        const reached = part.sound ? due.holding : t >= part.speech.start;
        const key = `${part.sound}|${part.word}`;
        if (reached && wroteRef.current !== key) {
          wroteRef.current = key;
          setWritten((was) => ({ symbol: part.sound, word: part.word, n: (was?.n ?? 0) + 1 }));
          if (live.current.whiteboard && part.sound) playSfx("scribble", 0, clock === "replay");
        }
      }
      const shown = `${viseme}|${part?.word ?? ""}|${clock}`;
      if (shown !== lastShown && figureRef.current) {
        lastShown = shown;
        figureRef.current.dataset.viseme = viseme;
        figureRef.current.dataset.word = part?.word ?? "";
        figureRef.current.dataset.clock = clock;
      }
      if (syll !== lastSyllable) {
        lastSyllable = syll;
        setSyllable(syll);
        if (syll >= 0) setSaid((was) => (was.has(syll) ? was : new Set([...was, syll])));
      }
      const target = shapeOf(viseme);
      const was = shape.current ?? target;
      // About 30 ms to move most of the way: quick enough for speech, never a jump.
      const ease = 1 - Math.exp(-dt / 0.03);
      let moved = 0;
      const next = was.map((value, k) => {
        const step = ((target[k] ?? value) - value) * ease;
        moved = Math.max(moved, Math.abs(step));
        return value + step;
      });
      if (shape.current === null || moved > 0.002) {
        shape.current = next;
        draw(next);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, scriptNow, shapeOf, still, stillShape]);

  // In comes the mouth: a pop in the whiteboard style.
  useEffect(() => {
    if (whiteboard && !still) playSfx("pop", 120);
    // Once, as it comes in.
  }, []);

  // A pulse from a later moment: the mouth draws the eye back to it.
  useEffect(() => {
    if (!pulses || still) return;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 1400);
    return () => window.clearTimeout(timer);
  }, [pulses, still]);

  // THE VOICE'S SOUNDS for the moments the mouth speaks in, this one and the next two: asked
  // for ahead, used the moment they come (the estimate covers until then). A studio clip not
  // made yet has none: asked again shortly while its moment is being said.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    for (const at of byMoment.keys()) {
      if (at < current || at > current + 2) continue;
      const url = moments[at]?.voice ?? null;
      if (!url) continue;
      // Where its clip speaks, from the audio itself: used when the voice's times are estimated
      // (the studio voice, or Kokoro asked for where it is not offered) or missing.
      if (!spoken.current.has(url))
        void clipSegments(url).then((found) => {
          if (found?.length) spoken.current.set(url, found);
        });
      if (heard.current.has(url)) continue;
      let tries = 0;
      const ask = () => {
        void phonesFor(url, tries > 0).then((found) => {
          if (cancelled) return;
          if (found && found.phones.length) {
            heard.current.set(url, found);
            return;
          }
          tries += 1;
          if (at === current && tries < 6) timers.push(window.setTimeout(ask, 1500));
        });
      };
      ask();
    }
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [byMoment, current, moments]);

  // TAP: the word again, slowly, in the free voice; or silently, slowly, where it is not offered.
  const tap = useCallback(() => {
    replay.current?.audio?.pause();
    const one = tapWord;
    const own = one.own ? spec.syllables ?? null : null;
    wroteRef.current = null;
    if (whiteboard) playSfx("click", 0, true);
    const session = sessionOf(moments[current]?.voice ?? moments[moment]?.voice);
    void wordSaid(session, one.word).then((got) => {
      if (got && got.phones.length) {
        const audio = new Audio(got.audio);
        const speech = speechFor(got.phones, [got.phones[0]!.start, got.phones[got.phones.length - 1]!.end], one.sound, own);
        const parts = [{ word: one.word, sound: one.sound, own: one.own, speech }];
        replay.current = { audio, from: performance.now(), parts };
        void audio.play().catch(() => {
          replay.current = { audio: null, from: performance.now(), parts };
        });
        return;
      }
      const guess = guessedPhones(one.word);
      const length = guess[guess.length - 1]?.end ?? 0.4;
      const speech = shifted(fittedGuess(one.word, [0, length], one.sound, own), 0.15, 1.6);
      replay.current = { audio: null, from: performance.now(), parts: [{ word: one.word, sound: one.sound, own: one.own, speech }] };
    });
  }, [current, moment, moments, spec.syllables, tapWord, whiteboard]);
  useEffect(() => () => replay.current?.audio?.pause(), []);

  const box = mouthBox(spec);
  const syllables = spec.syllables ?? [];
  const stressed = (spec.stress ?? 0) - 1;
  // The syllables laid out under the mouth, centred, by their letters.
  const laid = useMemo(() => {
    const sizes = syllables.map((s, k) => s.length * (k === stressed ? 13 : 10.5));
    const gap = 16;
    const total = sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, sizes.length - 1);
    let x = VIEW_W / 2 - total / 2;
    return sizes.map((size) => {
      const centre = x + size / 2;
      x += size + gap;
      return centre;
    });
  }, [stressed, syllables]);

  const symbol = written?.symbol ? `/${written.symbol}/` : null;
  const showWord = Boolean(written) && manyWords;
  const label = `A mouth saying "${tapWord.word}"${tapWord.sound ? `, showing the sound /${tapWord.sound}/` : ""}. Tap to hear it again.`;
  // The face, drawn in its own units about (66, 54) front or (78, 56) side, scaled up into place.
  const place = (x: number, y: number) =>
    `translate(${faceX} ${FACE_Y}) scale(${FACE_SCALE}) translate(${-x} ${-y})`;
  return (
    <figure
      ref={figureRef}
      className={`mo${pulsing ? " pulsing" : ""}${side ? " side" : ""}${paused ? " paused" : ""}`}
      style={{ "--dd-size": `${width}px` } as CSSProperties}
      data-viseme="rest"
    >
      <button type="button" className="mo-tap" onClick={tap} aria-label={label} title="Tap to hear it again">
        <svg
          className="mo-svg"
          viewBox={`0 0 ${box.w} ${box.h}`}
          width={width}
          height={height}
          role="img"
          aria-hidden="true"
        >
          {side ? (
            <g
              className="mo-draw"
              fill="none"
              stroke={INK}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={place(80, 58)}
            >
              <circle cx={80} cy={58} r={51} fill="#7c3aed" fillOpacity={0.06} stroke="none" />
              {/* The head: nose, the roof of the mouth with its ridge, the throat. */}
              <path d="M92 4C98 14 104 22 116 30L112 35C109 36 108 37 109 38" pathLength={1} />
              <path d="M100 45C96 41 92 39 86 38C74 35 62 36 54 40C50 42 48 46 47 50" pathLength={1} />
              <path d="M40 40C38 56 38 76 40 102" pathLength={1} />
              <path ref={refs.sUpperLip} fill={LIP} fillOpacity={0.9} d="" />
              <polygon points="100,44 106,45 105,53 101,52" fill="#fff" />
              <g ref={refs.sJaw}>
                <polygon points="100,58 105,57 104,64 100,64" fill="#fff" />
              </g>
              <path ref={refs.sTongue} fill={TONGUE_FILL} fillOpacity={0.75} d="" />
              <g ref={refs.sLower}>
                <path ref={refs.sLowerLip} fill={LIP} fillOpacity={0.9} d="" />
                <path ref={refs.sChin} d="" />
              </g>
              <circle ref={refs.sTouch} r={4.2} fill="none" stroke={TOUCH} strokeWidth={1.8} opacity={0} />
              {/* What each part is, with a short line to it. */}
              <g className="mo-notes" strokeWidth={0.9} stroke={INK} opacity={0.75}>
                <path d="M66 25L70 36" />
                <path d="M117 18L104 44" />
                <path d="M30 84L56 74" />
                <path d="M128 64L117 60" />
              </g>
              <text x={56} y={22} className="mo-note" stroke="none" fill={INK}>
                roof
              </text>
              <text x={110} y={14} className="mo-note" stroke="none" fill={INK}>
                teeth
              </text>
              <text x={2} y={93} className="mo-note" stroke="none" fill={INK}>
                tongue
              </text>
              <text x={124} y={74} className="mo-note" stroke="none" fill={INK}>
                lips
              </text>
            </g>
          ) : (
            <g className="mo-draw" transform={place(66, 54)}>
              <circle cx={66} cy={54} r={48} fill="#ec4899" fillOpacity={0.08} />
              <path
                d="M58 22Q66 30 74 22"
                fill="none"
                stroke={INK}
                strokeWidth={2.2}
                strokeLinecap="round"
                pathLength={1}
              />
              <clipPath id={`mo-in-${id}`}>
                <path ref={refs.clip} d="" />
              </clipPath>
              <path ref={refs.inner} fill={INSIDE} d="" />
              <g clipPath={`url(#mo-in-${id})`}>
                <ellipse ref={refs.tongue} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.3} />
                <rect ref={refs.upperTeeth} fill="#fff" stroke={INK} strokeWidth={1.1} rx={2} />
                <rect ref={refs.lowerTeeth} fill="#fff" stroke={INK} strokeWidth={1.1} rx={2} />
                <path ref={refs.gaps} stroke="#b9b4cc" strokeWidth={0.9} fill="none" />
              </g>
              <path ref={refs.lower} fill={LIP} stroke={INK} strokeWidth={2.3} strokeLinejoin="round" d="" />
              <ellipse ref={refs.tip} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.6} />
              <rect ref={refs.bite} fill="#fff" stroke={INK} strokeWidth={1.2} rx={2} />
              <path ref={refs.upper} fill={LIP} stroke={INK} strokeWidth={2.3} strokeLinejoin="round" d="" />
              <path ref={refs.corners} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" d="" />
            </g>
          )}
          {symbol || showWord ? (
            <g className="mo-symbol" key={`${written?.n ?? 0}`}>
              <text x={NOTE_X} y={side ? 58 : 66} textAnchor="middle" className="mo-ipa">
                {symbol}
              </text>
              {showWord ? (
                <text x={NOTE_X} y={side ? 112 : 94} textAnchor="middle" className="mo-word">
                  {written?.word}
                </text>
              ) : null}
            </g>
          ) : null}
          {syllables.length ? (
            <g className="mo-syllables">
              {syllables.map((part, k) => (
                <text
                  key={k}
                  x={laid[k]}
                  y={MOUTH_H + 26}
                  textAnchor="middle"
                  className={`mo-syl${k === stressed ? " stress" : ""}${k === syllable ? " saying" : ""}${said.has(k) || still ? " said" : ""}`}
                >
                  {part}
                </text>
              ))}
            </g>
          ) : null}
        </svg>
      </button>
      {caption ? <figcaption className="dd-caption">{caption}</figcaption> : null}
    </figure>
  );
}
