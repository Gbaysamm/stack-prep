/**
 * THE TALKING MOUTH (docs/plans/doodles-v2-contract.md section 7): for oral English, a mouth on
 * the board that says a word in time with the voice, so the student sees the shape of each
 * sound as they hear it.
 *
 * - THE SHAPES. Twelve visemes (mouthTimeline.ts) drawn in the doodles' style: ink #1d1b3a with
 *   round caps, soft pink lips and tongue, white teeth. From the front (`view: front`): lips,
 *   teeth and tongue. From the side (`view: side`): a cut-away of the head with the tongue's
 *   place, for consonants such as θ, ð, l, r. Each shape is a set of numbers (how wide, how
 *   open, how round, where the tongue tip is...), and the drawing is made from them every frame,
 *   so one shape becomes the next by easing the numbers: a smooth morph, never a cut.
 * - IN TIME WITH THE VOICE. The shape due is read from the playing clip's own `currentTime` on
 *   every frame, so a pause holds the mouth and the board's speed carries it along exactly. The
 *   clip's sounds come from the API (`/phones`): the Kokoro voice's own timings, or the studio
 *   voice's estimated. The mouth says its word where the clip says it: at its `on` word, or the
 *   word's first time.
 * - THE TAUGHT SOUND (`sound`) is held for at least 0.4 s (the mouth waits on it while the voice
 *   goes on), and its symbol is written beside the mouth as it is reached.
 * - STRESS: `syllables` are written under the mouth; the stressed one grows big and pulses
 *   while it is said, the others stay small.
 * - TAP: the word again, slowly (speed 0.8), in the free Kokoro voice only, with the mouth
 *   moving to it; where that voice is not offered, the mouth says it silently.
 * - `doodle_do: {op: say, word}` makes the same mouth say another word later (sheep, then ship).
 * - Less movement asked for: the taught sound's shape, still, with its symbol.
 * - Sound effects (a pop as it comes in, the pen as the symbol is written) only in the
 *   whiteboard style.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  api,
  type LessonCue,
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
  guessedPhones,
  shifted,
  speechFor,
  syllableAt,
  visemeAt,
  visemeOf,
  wordWindow,
  type Speech,
  type Viseme,
} from "./mouthTimeline.js";
import { playSfx } from "./sfx.js";
import { cueSeconds } from "./wordClock.js";
import "./mouth.css";

/* ---- The shapes, as numbers ---------------------------------------------------------------- */

/** From the front: [half-width, half-opening, roundness, lip, upper teeth, lower teeth, tongue
 *  height, tongue tip out, bite (teeth on lip), pushed out]. */
type FrontShape = [number, number, number, number, number, number, number, number, number, number];

const FRONT: Record<Viseme, FrontShape> = {
  rest: [30, 1.2, 0.15, 7, 0, 0, 0, 0, 0, 0],
  closed: [29, 0, 0.1, 6.2, 0, 0, 0, 0, 0, 0],
  fv: [31, 4, 0.1, 7, 1, 0, 0, 0, 1, 0],
  th: [31, 6.5, 0.2, 7, 1, 0.8, 0.6, 1, 0, 0],
  slight: [31, 7, 0.25, 7, 0.9, 0.7, 0.5, 0, 0, 0],
  spread: [40, 5.5, 0.08, 6, 1, 0.9, 0.4, 0, 0, 0],
  lax: [33, 8.5, 0.3, 7, 0.9, 0.5, 0.45, 0, 0, 0],
  wide: [32, 19, 0.45, 7, 0.7, 0.3, 0.45, 0, 0, 0],
  round: [14, 11, 0.55, 9, 0.2, 0, 0.2, 0, 0, 1],
  roundLax: [20, 10, 0.5, 8.5, 0.4, 0.2, 0.3, 0, 0, 0.6],
  sh: [20, 8, 0.5, 9.5, 1, 1, 0.2, 0, 0, 1],
  r: [22, 8, 0.45, 8, 0.6, 0.3, 0.3, 0, 0, 0.5],
  back: [30, 12, 0.35, 7, 0.6, 0.4, 0.9, 0, 0, 0],
  mid: [30, 10, 0.35, 7, 0.6, 0.4, 0.45, 0, 0, 0],
};

/** From the side: [jaw (degrees), lips sealed, lower lip to teeth, lips pushed out], then the
 *  tongue's back, top, front, tip, underside and floor, as x, y pairs. */
type SideShape = number[];
const TONGUE: Record<string, number[]> = {
  rest: [48, 66, 68, 58, 88, 60, 99, 63, 93, 70, 84, 78],
  alveolar: [48, 66, 70, 56, 88, 50, 97, 46, 92, 56, 84, 74],
  th: [50, 66, 72, 58, 92, 56, 108, 56, 98, 62, 86, 76],
  r: [48, 62, 66, 54, 82, 50, 88, 43, 86, 52, 80, 72],
  back: [50, 46, 60, 44, 80, 58, 98, 66, 92, 72, 84, 80],
  sh: [48, 62, 70, 52, 88, 46, 95, 50, 90, 58, 84, 74],
  spread: [48, 60, 72, 48, 90, 52, 99, 62, 93, 68, 84, 76],
  lax: [48, 62, 72, 52, 90, 56, 99, 64, 93, 70, 84, 78],
  wide: [44, 74, 66, 72, 88, 74, 100, 77, 94, 84, 84, 90],
  round: [48, 52, 58, 48, 80, 60, 97, 66, 92, 72, 84, 80],
  mid: [46, 66, 68, 62, 88, 64, 99, 68, 93, 74, 84, 82],
};
const SIDE: Record<Viseme, SideShape> = {
  rest: [2, 0.6, 0, 0, ...TONGUE.rest!],
  closed: [0, 1, 0, 0, ...TONGUE.rest!],
  fv: [3, 0, 1, 0, ...TONGUE.rest!],
  th: [5, 0, 0, 0, ...TONGUE.th!],
  slight: [4, 0, 0, 0, ...TONGUE.alveolar!],
  spread: [4, 0, 0, 0, ...TONGUE.spread!],
  lax: [6, 0, 0, 0, ...TONGUE.lax!],
  wide: [13, 0, 0, 0, ...TONGUE.wide!],
  round: [5, 0, 0, 1, ...TONGUE.round!],
  roundLax: [6, 0, 0, 0.6, ...TONGUE.round!],
  sh: [3, 0, 0, 1, ...TONGUE.sh!],
  r: [5, 0, 0, 0.5, ...TONGUE.r!],
  back: [7, 0, 0, 0, ...TONGUE.back!],
  mid: [8, 0, 0, 0, ...TONGUE.mid!],
};

const INK = "#1d1b3a";
const LIP = "#f6a5c8";
const TONGUE_FILL = "#f472b6";
const INSIDE = "#4a1d3f";

const f = (n: number) => n.toFixed(1);

/** The front view's paths for a shape. */
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
  const upH = 2 + up * Math.min(6, 0.85 * h + 1);
  const loH = 2 + lo * Math.min(5, 1.15 * h);
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

/** The side view's moving parts for a shape. */
function sidePaths(shape: number[]) {
  const [jaw = 0, seal = 0, bite = 0, push = 0, ...t] = shape;
  const p = push * 5;
  const pt = (i: number): [number, number] => [t[i * 2] ?? 0, t[i * 2 + 1] ?? 0];
  const tongue = closedCurve([[46, 90], pt(0), pt(1), pt(2), pt(3), pt(4), pt(5), [62, 88]]);
  const upperLip = `M109 38C${f(115 + p)} 40 ${f(118 + p)} 46 ${f(115 + p)} 51L106 51C107 46 108 42 109 38Z`;
  const lowerLip = `M106 56C${f(114 + p)} 55 ${f(117 + p)} 60 ${f(113 + p)} 66L105 64C105 61 105 58 106 56Z`;
  const chin = `M${f(113 + p)} 66C108 69 105 71 107 77C109 85 104 92 92 96C80 100 66 102 56 104`;
  return {
    tongue,
    upperLip,
    lowerLip,
    chin,
    jaw: `rotate(${f(jaw)} 44 46)`,
    lip: `rotate(${f(jaw)} 44 46) translate(${f(-4 * bite)} ${f(-5 * seal - 6 * bite)})`,
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

/* ---- The component ------------------------------------------------------------------------- */

/** What the mouth needs of a moment of the lesson. */
export interface MouthMoment {
  say?: string;
  voice?: string | null;
  doodleDo?: LessonDoodleOp[] | null;
}

/** One time the mouth says a word: in the moment that brings it in, or a later `say`. */
interface Saying {
  moment: number;
  word: string;
  sound: string | null;
  cue: LessonCue | null;
  /** The mouth's own word, whose syllables are written under it. */
  own: boolean;
}

/** Where the mouth's time comes from. */
type Clock =
  | { kind: "clip"; audio: HTMLAudioElement; speech: Speech }
  | { kind: "replay"; audio: HTMLAudioElement; speech: Speech }
  | { kind: "silent"; from: number; speech: Speech };

const VIEW_W = 214; // room for the symbol and a long word beside the face, unclipped
const MOUTH_H = 110;
const SYLLABLE_H = 34;

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

  const sayings: Saying[] = useMemo(() => {
    const out: Saying[] = [
      { moment, word: spec.word, sound: spec.sound ?? null, cue: spec.on ?? null, own: true },
    ];
    // Its later moments' `say` actions, read from the moments themselves rather than waiting
    // for the action to be played: the mouth keeps its own time, on the word.
    if (spec.id)
      moments.forEach((entry, at) => {
        if (at <= moment) return;
        for (const op of entry.doodleDo ?? []) {
          if (op.op !== "say" || op.id !== spec.id) continue;
          const word = op.word?.trim() || spec.word;
          const own = word.toLowerCase() === spec.word.toLowerCase();
          const sound = op.sound ?? (own ? spec.sound ?? null : null);
          out.push({ moment: at, word, sound, cue: op.on ?? null, own });
        }
      });
    return out;
  }, [moment, moments, spec]);
  //: Whether anything is written beside the mouth; where nothing is, the mouth is centred.
  const labelled = sayings.length > 1 || sayings.some((one) => one.sound);
  const cx = labelled ? 66 : VIEW_W / 2;
  const saying = useMemo(
    () => [...sayings].reverse().find((one) => one.moment <= current) ?? sayings[0]!,
    [current, sayings],
  );
  const pulses = useMemo(() => tasks.filter((task) => task.op.op === "pulse" && task.live).map((task) => task.key).join(","), [tasks]);

  //: What is written beside the mouth: the taught sound's symbol (as it is reached) and the
  //: word being said, with a count so a word written again is written again by the pen.
  const [written, setWritten] = useState<{ symbol: string | null; word: string; n: number } | null>(
    still && spec.sound ? { symbol: spec.sound, word: spec.word, n: 0 } : null,
  );
  const [syllable, setSyllable] = useState(-1);
  const [said, setSaid] = useState<Set<number>>(() => new Set());
  const [pulsing, setPulsing] = useState(false);

  const clock = useRef<Clock | null>(null);
  //: The lesson's own clip clock, which the mouth goes back to after a tapped replay.
  const lessonClock = useRef<Clock | null>(null);
  const wroteRef = useRef<string | null>(null);
  const clockSound = useRef<string | null>(spec.sound ?? null);
  const clockWord = useRef<string>(spec.word);
  const whiteboardRef = useRef(whiteboard);
  whiteboardRef.current = whiteboard;
  const shape = useRef<number[] | null>(null);
  const lastFrame = useRef(0);
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
    sUpper: useRef<SVGPathElement>(null),
    sLower: useRef<SVGGElement>(null),
    sJaw: useRef<SVGGElement>(null),
    sLowerLip: useRef<SVGPathElement>(null),
    sUpperLip: useRef<SVGPathElement>(null),
    sChin: useRef<SVGPathElement>(null),
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
        return;
      }
      const p = frontPaths(now, cx, 54);
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
    [cx, side],
  );

  /** The numbers of a mouth shape in this view. */
  const shapeOf = useCallback((viseme: Viseme) => [...(side ? SIDE[viseme] : FRONT[viseme])], [side]);

  // Less movement: the taught sound's shape, still.
  const stillShape = useMemo(() => {
    const sound = spec.sound ?? guessedPhones(spec.word).find((phone) => /[aeiouæɑɒɔəɛɜɪʊʌ]/.test(phone.p))?.p ?? "";
    return shapeOf(sound ? visemeOf(sound) : "rest");
  }, [shapeOf, spec.sound, spec.word]);

  // THE FRAME LOOP: the shape due now, from the clock, eased towards.
  useEffect(() => {
    if (still) {
      draw(stillShape);
      return;
    }
    let frame = 0;
    let lastSyllable = -2;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = lastFrame.current ? Math.min(0.1, (now - lastFrame.current) / 1000) : 0.016;
      lastFrame.current = now;
      const running = clock.current;
      let viseme: Viseme = "rest";
      let syll = -1;
      if (running) {
        const t =
          running.kind === "silent" ? (now - running.from) / 1000 : running.audio.currentTime;
        const due = visemeAt(running.speech, t);
        viseme = due.viseme;
        syll = syllableAt(running.speech, t);
        // The symbol is written as the taught sound is reached; a word without one is
        // written as it starts.
        const sound = clockSound.current;
        const word = clockWord.current;
        const due2 = sound ? due.holding : t >= running.speech.start;
        if (due2 && wroteRef.current !== `${sound}|${word}`) {
          wroteRef.current = `${sound}|${word}`;
          setWritten((was) => ({ symbol: sound, word, n: (was?.n ?? 0) + 1 }));
          if (whiteboardRef.current && sound) playSfx("scribble", 0, running.kind === "replay");
        }
        if (running.kind !== "clip" && t > finishedAt(running.speech) + 0.3) {
          // A replay over: back to the lesson's clip (where it has gone on, or ended).
          clock.current = lessonClock.current?.kind === "clip" ? lessonClock.current : null;
        }
      }
      if (syll !== lastSyllable) {
        lastSyllable = syll;
        setSyllable(syll);
        if (syll >= 0) setSaid((was) => (was.has(syll) ? was : new Set([...was, syll])));
      }
      const target = shapeOf(viseme);
      const was = shape.current ?? target;
      // About 35 ms to move most of the way: quick enough for speech, never a jump.
      const ease = 1 - Math.exp(-dt / 0.035);
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
  }, [draw, shapeOf, still, stillShape]);

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

  // THE LESSON'S VOICE: when the current saying's moment is being said, the mouth follows its
  // clip. Its sounds are asked for once; a studio clip not yet made is asked again shortly.
  useEffect(() => {
    if (saying.moment !== current) return;
    const entry = moments[saying.moment];
    const url = entry?.voice ?? null;
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const own = saying.own ? spec.syllables ?? null : null;
    const fallback = (audio: HTMLAudioElement | null) => {
      // No sounds from the voice: the word's spelling, placed where its words are estimated
      // to be said in the clip, or a moment after it comes in where there is no clip.
      const guess = guessedPhones(saying.word);
      const base = speechFor(guess, [0, guess[guess.length - 1]?.end ?? 0.4], saying.sound, own);
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0 && entry?.say) {
        const at =
          cueSeconds({ word: saying.cue?.word ?? saying.word, nth: saying.cue?.nth ?? 1 }, entry.say, audio.duration) ?? 0.3;
        clock.current = { kind: "clip", audio, speech: shifted(base, at) };
      } else {
        clock.current = { kind: "silent", from: performance.now(), speech: shifted(base, 0.9) };
      }
      lessonClock.current = clock.current;
      clockSound.current = saying.sound;
      clockWord.current = saying.word;
    };
    const attempt = () => {
      const audio = clipAt?.(saying.moment) ?? null;
      if (!url) {
        fallback(audio);
        return;
      }
      void phonesFor(url, tries > 0).then((found) => {
        if (cancelled) return;
        if (!found || !found.phones.length) {
          tries += 1;
          if (tries < 5 && audio) timer = window.setTimeout(attempt, 1500);
          else fallback(audio);
          return;
        }
        const placed = wordWindow(found.words, saying.word, saying.cue);
        let speech: Speech;
        if (placed.window) speech = speechFor(found.phones, placed.window, saying.sound, own);
        else {
          // The word is not said in the clip: the mouth says it, silently, at its cue.
          const guess = guessedPhones(saying.word);
          speech = shifted(speechFor(guess, [0, guess[guess.length - 1]?.end ?? 0.4], saying.sound, own), placed.cueAt ?? 0.3);
        }
        clockSound.current = saying.sound;
        clockWord.current = saying.word;
        clock.current = audio
          ? { kind: "clip", audio, speech }
          : { kind: "silent", from: performance.now(), speech };
        lessonClock.current = clock.current;
      });
    };
    attempt();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clipAt, current, moments, saying, spec.syllables]);

  // TAP: the word again, slowly, in the free voice; or silently where it is not offered.
  const replaying = useRef<HTMLAudioElement | null>(null);
  const tap = useCallback(() => {
    replaying.current?.pause();
    const word = saying.word;
    const own = saying.own ? spec.syllables ?? null : null;
    clockSound.current = saying.sound;
    clockWord.current = word;
    wroteRef.current = null;
    if (whiteboard) playSfx("click", 0, true);
    const session = sessionOf(moments[saying.moment]?.voice ?? moments[moment]?.voice);
    void wordSaid(session, word).then((got) => {
      if (got && got.phones.length) {
        const audio = new Audio(got.audio);
        replaying.current = audio;
        const speech = speechFor(got.phones, [got.phones[0]!.start, got.phones[got.phones.length - 1]!.end], saying.sound, own);
        clock.current = { kind: "replay", audio, speech };
        void audio.play().catch(() => {
          clock.current = { kind: "silent", from: performance.now(), speech };
        });
        return;
      }
      // Silently: the word as the lesson's voice said it (if it was heard), slowed down.
      const was = clock.current?.speech;
      const guess = guessedPhones(word);
      const base =
        was && was.phones.length && lessonClock.current?.speech === was
          ? was
          : speechFor(guess, [0, guess[guess.length - 1]?.end ?? 0.4], saying.sound, own);
      clock.current = { kind: "silent", from: performance.now(), speech: shifted(base, 0.15, 1.6) };
    });
  }, [moment, moments, saying, spec.syllables, whiteboard]);
  useEffect(() => () => replaying.current?.pause(), []);

  const box = mouthBox(spec);
  const syllables = spec.syllables ?? [];
  const stressed = (spec.stress ?? 0) - 1;
  // The syllables laid out under the mouth, centred, by their letters.
  const laid = useMemo(() => {
    const sizes = syllables.map((s, k) => s.length * (k === stressed ? 11 : 9.2));
    const gap = 14;
    const total = sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, sizes.length - 1);
    let x = VIEW_W / 2 - total / 2;
    return sizes.map((size) => {
      const centre = x + size / 2;
      x += size + gap;
      return centre;
    });
  }, [stressed, syllables]);

  const symbol = written?.symbol ? `/${written.symbol}/` : null;
  const showWord = Boolean(written) && sayings.length > 1;
  const label = `A mouth saying "${saying.word}"${saying.sound ? `, showing the sound /${saying.sound}/` : ""}. Tap to hear it again.`;
  return (
    <figure
      className={`mo${pulsing ? " pulsing" : ""}${side ? " side" : ""}${paused ? " paused" : ""}`}
      style={{ "--dd-size": `${width}px` } as CSSProperties}
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
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={labelled ? undefined : "translate(12 0)"}
            >
              <circle cx={78} cy={56} r={50} fill="#7c3aed" fillOpacity={0.06} stroke="none" />
              {/* The head: nose, the roof of the mouth with its ridge, the throat. */}
              <path d="M92 4C98 14 104 22 116 30L112 35C109 36 108 37 109 38" pathLength={1} />
              <path d="M100 45C96 41 92 39 86 38C74 35 62 36 54 40C50 42 48 46 47 50" pathLength={1} />
              <path d="M40 40C38 56 38 76 40 102" pathLength={1} />
              <path ref={refs.sUpperLip} fill={LIP} fillOpacity={0.85} d="" />
              <polygon points="100,44 106,45 105,53 101,52" fill="#fff" />
              <g ref={refs.sJaw}>
                <polygon points="100,58 105,57 104,64 100,64" fill="#fff" />
              </g>
              <path ref={refs.sTongue} fill={TONGUE_FILL} fillOpacity={0.7} d="" />
              <g ref={refs.sLower}>
                <path ref={refs.sLowerLip} fill={LIP} fillOpacity={0.85} d="" />
                <path ref={refs.sChin} d="" />
              </g>
              <text x={60} y={30} className="mo-note" stroke="none" fill={INK}>
                roof
              </text>
              <text x={58} y={90} className="mo-note" stroke="none" fill={INK}>
                tongue
              </text>
            </g>
          ) : (
            <g className="mo-draw">
              <circle cx={cx} cy={54} r={48} fill="#ec4899" fillOpacity={0.08} />
              <path
                d={`M${cx - 8} 22Q${cx} 30 ${cx + 8} 22`}
                fill="none"
                stroke={INK}
                strokeWidth={2.4}
                strokeLinecap="round"
                pathLength={1}
              />
              <clipPath id={`mo-in-${id}`}>
                <path ref={refs.clip} d="" />
              </clipPath>
              <path ref={refs.inner} fill={INSIDE} d="" />
              <g clipPath={`url(#mo-in-${id})`}>
                <ellipse ref={refs.tongue} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.4} />
                <rect ref={refs.upperTeeth} fill="#fff" stroke={INK} strokeWidth={1.2} rx={2} />
                <rect ref={refs.lowerTeeth} fill="#fff" stroke={INK} strokeWidth={1.2} rx={2} />
                <path ref={refs.gaps} stroke="#b9b4cc" strokeWidth={0.9} fill="none" />
              </g>
              <path
                ref={refs.lower}
                fill={LIP}
                stroke={INK}
                strokeWidth={2.6}
                strokeLinejoin="round"
                d=""
              />
              <ellipse ref={refs.tip} fill={TONGUE_FILL} stroke={INK} strokeWidth={1.8} />
              <rect ref={refs.bite} fill="#fff" stroke={INK} strokeWidth={1.3} rx={2} />
              <path
                ref={refs.upper}
                fill={LIP}
                stroke={INK}
                strokeWidth={2.6}
                strokeLinejoin="round"
                d=""
              />
              <path ref={refs.corners} fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" d="" />
            </g>
          )}
          {symbol || showWord ? (
            <g className="mo-symbol" key={`${written?.n ?? 0}`}>
              <text x={152} y={side ? 64 : 58} textAnchor="middle" className="mo-ipa">
                {symbol}
              </text>
              {showWord ? (
                <text x={152} y={side ? 84 : 78} textAnchor="middle" className="mo-word">
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
                  y={MOUTH_H + 22}
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
