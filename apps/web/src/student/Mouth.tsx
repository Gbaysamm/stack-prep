/**
 * THE TALKING MOUTH (docs/plans/doodles-v2-contract.md section 7): for oral English, a mouth on
 * the board that says a word in time with the voice, so the student sees the shape of each
 * sound as they hear it.
 *
 * - THE SHAPES. One per British RP phoneme, 44 in all (mouthShapes.ts): each a set of measured
 *   numbers (jaw opening, lip rounding, spreading and protrusion, lips sealed, lip to teeth,
 *   tongue between the teeth, teeth showing, tongue tip and body), from Cruttenden's Gimson and
 *   Roach. Diphthongs glide between two targets; the lips start moving towards the next sound
 *   60 to 120 ms before it; p, b and m stay sealed for their whole hold (mouthTimeline.ts,
 *   `poseAt`). Drawn in the doodles' style: ink #1d1b3a with round caps, soft pink lips and
 *   tongue, white teeth. THE LIPS FROM THE FRONT are always the main, large view: a Cupid's bow
 *   upper lip and a full lower lip, the teeth as they show, the tongue tip between the teeth
 *   (θ ð) or up behind the top teeth (t d n l), the lips' inner rim turned out as they push
 *   forward (ʃ ʒ uː w). For consonant place (`view: side`) a small cut-away of the head sits
 *   beside it as well, with the tongue's place and a ring where it touches. Both views are
 *   drawn from the same numbers (`frontShape`, `sideShape`), eased every frame: a smooth
 *   morph, never a cut.
 * - THE VOICE BOX beside the mouth: its folds close and buzz for a voiced sound (b d g v ð z ʒ
 *   dʒ m n ŋ l r w j and every vowel) and stand open and still for a voiceless one, so nation
 *   and vision, or f and v, visibly differ.
 * - THE WORD STRIP under the mouth: one small mouth per sound of the word being said, its IPA
 *   under it, the one being said lit. Tapping a tile shows that sound's shape on the big mouth,
 *   slowly, for PIN_MS (the free voice says whole words only, so the tile is not voiced).
 *   It scrolls sideways inside itself when a word is long; the page never does.
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
 * - `data-viseme` (the RP phoneme being said, or "rest"), `data-voiced`, `data-word` and
 *   `data-clock` on the figure say what it is doing, for checks.
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
  poseAt,
  RESTING,
  scriptFor,
  shifted,
  speechFor,
  syllableAt,
  type MouthSaying,
  type MouthState,
  type Part,
} from "./mouthTimeline.js";
import { isVoiced, POSE_KEYS, poseOf, rpPhoneme, type Pose } from "./mouthShapes.js";
import { alignToSpeech, clipSegments, retimed, type Segments } from "./clipSpeech.js";
import { playSfx } from "./sfx.js";
import { estimatedSpoken, typicalSeconds, wordSpans } from "./wordClock.js";
import "./mouth.css";

/* ---- The shapes, as numbers ---------------------------------------------------------------- */

/** From the front: [half-width, half-opening, roundness, lip, upper teeth, lower teeth, tongue
 *  height, tongue tip out, bite (teeth on lip), pushed out, tongue tip up behind the teeth]. */
type FrontShape = [number, number, number, number, number, number, number, number, number, number, number];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The front view's numbers for a pose (mouthShapes.ts). */
export function frontShape(a: Pose): FrontShape {
  // Spread lips are wide; rounded and protruded lips narrow to a small round opening.
  // Pressed together (p b m) the lips thin and stretch a little.
  const w = Math.max(12, 31 + 11 * a.spread - 16 * a.round - 6 * a.protrude + 2 * a.close);
  let open = 4 + 22 * a.jaw;
  if (a.round > 0) open = Math.max(open * (1 - 0.25 * a.round), 9 * a.round + 4 * a.protrude);
  const h = open * (1 - a.close);
  const roundness = 0.12 + 0.43 * a.round + 0.2 * a.protrude;
  const lip = 7 - 1.4 * a.spread + 1.2 * a.protrude - 0.8 * a.close;
  const open01 = 1 - a.close;
  const tongue = 0.2 + 0.75 * Math.max(a.bodyY * (1 - a.bodyX), a.tipY * 0.6, a.bodyY * 0.4);
  return [
    w,
    h,
    roundness,
    lip,
    a.upperTeeth * open01,
    a.lowerTeeth * open01 * (1 - a.labiodental),
    clamp01(tongue),
    a.interdental,
    a.labiodental,
    a.protrude,
    clamp01((a.tipY - 0.6) / 0.4) * (1 - a.interdental) * open01,
  ];
}

/** The side view's numbers for a pose: [jaw (degrees), lips sealed, lower lip to teeth, lips
 *  pushed out], then the tongue's back, top, front, tip, underside and floor, as x, y pairs. */
export function sideShape(a: Pose): number[] {
  const back: [number, number] = [48 + 4 * (1 - a.bodyX) * a.bodyY, 72 - 28 * a.bodyY * (1 - 0.7 * a.bodyX)];
  const top: [number, number] = [58 + 14 * a.bodyX, 72 - 26 * a.bodyY];
  const tip: [number, number] = [89 + 20 * a.tipX, 66 - 20 * a.tipY + 18 * (0.5 - a.bodyY) * (1 - a.tipY)];
  const front: [number, number] = [80 + 8 * a.bodyX + 4 * a.tipX, (top[1] + tip[1]) / 2 - 1.5];
  const under: [number, number] = [tip[0] - 6, tip[1] + 7 + 3 * a.tipY];
  const floor: [number, number] = [84, Math.max(tip[1] + 12, 76 + 8 * (0.5 - a.bodyY))];
  return [
    1 + 17 * a.jaw,
    a.close,
    a.labiodental,
    Math.max(a.protrude, a.round * 0.4),
    ...back,
    ...top,
    ...front,
    ...tip,
    ...under,
    ...floor,
  ];
}

const INK = "#1d1b3a";
const LIP = "#f6a5c8";
const TONGUE_FILL = "#f472b6";
const INSIDE = "#4a1d3f";
const TOUCH = "#db2777";
/** The wet inner rim of the lips, seen as they push forward. */
const LIP_RIM = "#e0679f";

const f = (n: number) => n.toFixed(1);

/** The front view's paths for a shape, about (cx, cy) in the face's own units. */
function frontPaths(shape: number[], cx: number, cy: number) {
  const [w, h, round, lip, up, lo, tongue, tip, bite, push, tipUp = 0] = shape as FrontShape;
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
  // The Cupid's bow: two peaks either side of a V-shaped dip under the philtrum.
  const peak = top - T - 2.6;
  const dip = top - T + 1.8;
  const PL = cx - Math.max(4.5, w * 0.27);
  const PR = cx + Math.max(4.5, w * 0.27);
  const upper =
    `M${f(Lo)} ${f(cy)}C${f(Lo + 2)} ${f(cy - (cy - peak) * 0.5)} ${f(PL - w * 0.35)} ${f(peak + 0.6)} ${f(PL)} ${f(peak)}` +
    `C${f(PL + 1.5)} ${f(peak - 0.2)} ${f(cx - 1.6)} ${f(dip - 0.6)} ${f(cx)} ${f(dip)}` +
    `C${f(cx + 1.6)} ${f(dip - 0.6)} ${f(PR - 1.5)} ${f(peak - 0.2)} ${f(PR)} ${f(peak)}` +
    `C${f(PR + w * 0.35)} ${f(peak + 0.6)} ${f(Ro - 2)} ${f(cy - (cy - peak) * 0.5)} ${f(Ro)} ${f(cy)}` +
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
    // The tongue tip up behind the top teeth (t d n l), seen through the opening.
    tipUp: { cx, cy: top + upH + 1.5, rx: Math.max(4, Math.min(9, w * 0.32)), ry: 3.6, opacity: tipUp },
    // The lips' inner rim, turned out as they push forward.
    rim: { width: 1 + 3 * push, opacity: 0.85 * push },
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

/** One sound of the word strip: a small front view of its shape, drawn once. */
function ShapeTile({ p }: { p: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const s = frontPaths(frontShape(poseOf(p, 0.2)), 66, 54);
  return (
    <svg className="mo-tile-svg" viewBox="18 22 96 64" aria-hidden="true">
      <clipPath id={`mo-t-${id}`}>
        <path d={s.inner} />
      </clipPath>
      <path d={s.inner} fill={INSIDE} />
      <g clipPath={`url(#mo-t-${id})`}>
        <ellipse {...s.tongue} fill={TONGUE_FILL} />
        <rect {...s.upperTeeth} fill="#fff" rx={2} />
        <rect {...s.lowerTeeth} fill="#fff" rx={2} />
        <ellipse {...s.tipUp} fill={TONGUE_FILL} />
        <path d={s.inner} fill="none" stroke={LIP_RIM} strokeWidth={s.rim.width * 2} opacity={s.rim.opacity} />
      </g>
      <path d={s.lower} fill={LIP} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <ellipse {...s.tip} fill={TONGUE_FILL} stroke={INK} strokeWidth={2} />
      <rect {...s.bite} fill="#fff" stroke={INK} strokeWidth={1.6} rx={2} />
      <path d={s.upper} fill={LIP} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
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
/** The word strip under it all: one small mouth per sound of the word. */
const STRIP_H = 52;
/** How long a tapped tile's shape is shown on the big mouth. */
const PIN_MS = 600;
/** The voice box, beside the mouth: right of the face and below its middle. */
const VOICE_DX = 70;
const VOICE_Y = 116;
/** The lips are drawn in their own units (about 100 across) and scaled up by this. */
const FACE_SCALE = 1.5;
const FACE_Y = 64;
/** The small side view (consonant place), in the right-hand column under the symbol. */
const INSET = { x: 196, y: 104, scale: 0.5 };
/** The column the symbol and the compared word are written in. */
const NOTE_X = 196;

/** The mouth's drawing box (viewBox units): the face, its symbol, and its syllables. */
export function mouthBox(spec: LessonMouth): { w: number; h: number } {
  return { w: VIEW_W, h: MOUTH_H + (spec.syllables?.length ? SYLLABLE_H : 0) + STRIP_H };
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
  const faceX = labelled ? 74 : VIEW_W / 2;
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
  //: The word strip: the sounds of the word being said (or last said), and the one lit.
  const [strip, setStrip] = useState<{ key: string; word: string; tiles: { p: string; k: number }[] } | null>(null);
  const [stripAt, setStripAt] = useState(-1);
  const stripLive = useRef<{ key: string; tiles: { p: string; k: number }[] } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  //: A tapped tile: its shape shown on the big mouth for PIN_MS.
  const pin = useRef<{ p: string; k: number; from: number } | null>(null);

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
  const shape = useRef<Pose | null>(null);
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
    tipUp: useRef<SVGEllipseElement>(null),
    rim: useRef<SVGPathElement>(null),
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
    (pose: Pose) => {
      const r = refsRef.current;
      if (side) {
        // The small side view, beside the lips.
        const s = sidePaths(sideShape(pose));
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
      }
      const p = frontPaths(frontShape(pose), 66, 54);
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
      set(r.tipUp.current, p.tipUp);
      set(r.bite.current, p.bite);
      const rim = r.rim.current;
      if (rim) {
        rim.setAttribute("d", p.inner);
        rim.setAttribute("stroke-width", f(p.rim.width * 2));
        rim.setAttribute("opacity", p.rim.opacity.toFixed(2));
      }
    },
    [side],
  );

  // Less movement: the taught sound's shape, still.
  const stillShape = useMemo(() => {
    const sound = spec.sound ?? guessedPhones(spec.word).find((phone) => /[aeiouæɑɒɔəɛɜɪʊʌ]/.test(phone.p))?.p ?? "";
    return sound ? poseOf(sound, 0.5) : RESTING.pose;
  }, [spec.sound, spec.word]);

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
    let lastLit = -2;
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
      let state: MouthState = RESTING;
      let syll = -1;
      // The word strip: the word being said, from the voice's own sounds (never a spelling guess,
      // which would teach the wrong sounds); before the first, the mouth's own word as heard.
      const forStrip =
        part && !part.speech.guessed ? part : !stripLive.current ? parts?.find((one) => one.own && !one.speech.guessed) ?? null : null;
      if (forStrip) {
        const key = `${forStrip.word}|${forStrip.speech.start.toFixed(3)}|${forStrip.speech.phones.length}`;
        if (stripLive.current?.key !== key) {
          const tiles = forStrip.speech.phones
            .map((phone, k) => ({ p: rpPhoneme(phone.p), k }))
            .filter((tile) => tile.p);
          stripLive.current = { key, tiles };
          setStrip({ key, word: forStrip.word, tiles });
        }
      }
      let lit = -1;
      if (part) {
        const due = poseAt(part.speech, t);
        state = due;
        if (stripLive.current && part === forStrip && due.index >= 0)
          lit = stripLive.current.tiles.findIndex((tile) => tile.k === due.index);
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
      // A tapped tile: its shape, shown slowly, over whatever else is due.
      const pinned = pin.current;
      if (pinned && now - pinned.from < PIN_MS) {
        state = {
          pose: poseOf(pinned.p, (now - pinned.from) / PIN_MS),
          p: pinned.p,
          index: pinned.k,
          voiced: isVoiced(pinned.p),
          holding: true,
        };
        lit = pinned.k;
      } else if (pinned) pin.current = null;
      if (lit !== lastLit) {
        lastLit = lit;
        setStripAt(lit);
      }
      const shown = `${state.p || "rest"}|${state.voiced && state.p ? 1 : 0}|${part?.word ?? ""}|${clock}`;
      if (shown !== lastShown && figureRef.current) {
        lastShown = shown;
        figureRef.current.dataset.viseme = state.p || "rest";
        figureRef.current.dataset.voiced = state.voiced && state.p ? "1" : "0";
        figureRef.current.dataset.word = part?.word ?? "";
        figureRef.current.dataset.clock = clock;
      }
      if (syll !== lastSyllable) {
        lastSyllable = syll;
        setSyllable(syll);
        if (syll >= 0) setSaid((was) => (was.has(syll) ? was : new Set([...was, syll])));
      }
      const target = state.pose;
      const was = shape.current ?? target;
      // About 30 ms to move most of the way: quick enough for speech, never a jump. The lips
      // seal and part a little quicker (20 ms), so p, b and m close as they are heard.
      const ease = 1 - Math.exp(-dt / 0.03);
      const seal = 1 - Math.exp(-dt / 0.02);
      let moved = 0;
      const next = { ...was };
      for (const key of POSE_KEYS) {
        const step = (target[key] - was[key]) * (key === "close" ? seal : ease);
        moved = Math.max(moved, Math.abs(step));
        next[key] = was[key] + step;
      }
      if (shape.current === null || moved > 0.002) {
        shape.current = next;
        draw(next);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, scriptNow, still, stillShape]);

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

  // A TILE TAPPED: its sound's shape on the big mouth, slowly. (The free voice's say endpoint
  // takes whole words, so a single sound cannot be voiced alone: the shape is shown instead.)
  const showSound = useCallback(
    (k: number, p: string) => {
      pin.current = { p, k, from: performance.now() };
      if (whiteboard) playSfx("click", 0, true);
    },
    [whiteboard],
  );

  // The lit tile kept in view inside the strip (the strip scrolls, never the page).
  useEffect(() => {
    const row = stripRef.current;
    const tile = row?.querySelectorAll<HTMLElement>(".mo-tile")[stripAt];
    if (!row || !tile || row.scrollWidth <= row.clientWidth) return;
    const left = tile.offsetLeft - (row.clientWidth - tile.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: still ? "auto" : "smooth" });
  }, [still, stripAt]);

  const box = mouthBox(spec);
  const stripTop = box.h - STRIP_H;
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
  // The lips, drawn in their own units about (66, 54), scaled up into place.
  const place = (x: number, y: number) =>
    `translate(${faceX} ${FACE_Y}) scale(${FACE_SCALE}) translate(${-x} ${-y})`;
  return (
    <figure
      ref={figureRef}
      className={`mo${pulsing ? " pulsing" : ""}${side ? " side" : ""}${paused ? " paused" : ""}`}
      style={{ "--dd-size": `${width}px` } as CSSProperties}
      data-viseme="rest"
      data-voiced="0"
    >
      <div className="mo-stage">
        <button type="button" className="mo-tap" onClick={tap} aria-label={label} title="Tap to hear it again">
          <svg
            className="mo-svg"
            viewBox={`0 0 ${box.w} ${box.h}`}
            width={width}
            height={height}
            role="img"
            aria-hidden="true"
          >
            <g className="mo-draw" transform={place(66, 54)}>
              <circle cx={66} cy={54} r={44} fill="#ec4899" fillOpacity={0.08} />
              <clipPath id={`mo-in-${id}`}>
                <path ref={refs.clip} d="" />
              </clipPath>
              <path ref={refs.inner} fill={INSIDE} d="" />
              <g clipPath={`url(#mo-in-${id})`}>
                <ellipse ref={refs.tongue} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.3} />
                <rect ref={refs.upperTeeth} fill="#fff" stroke={INK} strokeWidth={1.1} rx={2} />
                <rect ref={refs.lowerTeeth} fill="#fff" stroke={INK} strokeWidth={1.1} rx={2} />
                <path ref={refs.gaps} stroke="#b9b4cc" strokeWidth={0.9} fill="none" />
                <ellipse ref={refs.tipUp} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.1} opacity={0} />
                <path ref={refs.rim} fill="none" stroke={LIP_RIM} opacity={0} d="" />
              </g>
              <path ref={refs.lower} fill={LIP} stroke={INK} strokeWidth={2.3} strokeLinejoin="round" d="" />
              <ellipse ref={refs.tip} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.6} />
              <rect ref={refs.bite} fill="#fff" stroke={INK} strokeWidth={1.2} rx={2} />
              <path ref={refs.upper} fill={LIP} stroke={INK} strokeWidth={2.3} strokeLinejoin="round" d="" />
              <path ref={refs.corners} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" d="" />
            </g>
            {side ? (
              // The small side view, for where the tongue goes (consonant place).
              <g
                className="mo-draw mo-inset"
                fill="none"
                stroke={INK}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={`translate(${INSET.x} ${INSET.y}) scale(${INSET.scale}) translate(-78 -62)`}
              >
                <circle cx={78} cy={62} r={48} fill="#7c3aed" fillOpacity={0.07} stroke="none" />
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
                <circle ref={refs.sTouch} r={5} fill="none" stroke={TOUCH} strokeWidth={2.6} opacity={0} />
              </g>
            ) : null}
            {/* The voice box: folds closed and buzzing for a voiced sound, open and still if not. */}
            <g className="mo-voice" transform={`translate(${faceX + VOICE_DX} ${VOICE_Y})`}>
              <rect x={-6.5} y={-9} width={13} height={18} rx={5.5} fill="#fff" stroke={INK} strokeWidth={1.5} />
              <path className="mo-folds" d="M-3.8 -5.2L0 5.2L3.8 -5.2" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <g className="mo-buzz" fill="none" stroke={TOUCH} strokeWidth={1.5} strokeLinecap="round">
                <path d="M10 -4.5q2.6 4.5 0 9M14 -7q4 7 0 14" />
                <path d="M-10 -4.5q-2.6 4.5 0 9M-14 -7q-4 7 0 14" />
              </g>
              <text y={21} textAnchor="middle" className="mo-voice-label">
                voice
              </text>
            </g>
            {symbol || showWord ? (
              <g className="mo-symbol" key={`${written?.n ?? 0}`}>
                <text x={NOTE_X} y={side ? 50 : 66} textAnchor="middle" className="mo-ipa">
                  {symbol}
                </text>
                {showWord ? (
                  <text x={NOTE_X} y={side ? 74 : 94} textAnchor="middle" className="mo-word">
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
        <div
          ref={stripRef}
          className="mo-strip"
          style={{ top: `${(100 * stripTop) / box.h}%`, height: `${(100 * STRIP_H) / box.h}%` }}
          role="group"
          aria-label={strip ? `The sounds of "${strip.word}". Tap one to see its shape.` : undefined}
        >
          <div className="mo-strip-row">
            {strip ? (
              strip.tiles.map((tile, k) => (
                <button
                  key={`${strip.key}:${k}`}
                  type="button"
                  className={`mo-tile${k === stripAt ? " on" : ""}`}
                  onClick={() => showSound(k, tile.p)}
                  aria-label={`/${tile.p}/: show its shape`}
                  title={`/${tile.p}/`}
                >
                  <ShapeTile p={tile.p} />
                  <span className="mo-tile-ipa">{tile.p}</span>
                </button>
              ))
            ) : (
              <span className="mo-strip-word">{spec.word}</span>
            )}
          </div>
        </div>
      </div>
      {caption ? <figcaption className="dd-caption">{caption}</figcaption> : null}
    </figure>
  );
}
