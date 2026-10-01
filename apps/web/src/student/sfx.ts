/**
 * The board's sound effects, made in code (the whiteboard style, docs/lesson-style-guide.md
 * section 6): nothing to download, nothing to license.
 *
 * The seven sounds are SternHost's (scripts/sfx.mjs there), synthesised here sample by sample
 * into Web Audio buffers the first time each is wanted, at the context's own sample rate:
 *
 * | Sound    | On the board                                         |
 * |----------|------------------------------------------------------|
 * | pop      | a chip, a pair dot or a doodle arriving              |
 * | scribble | the pen starting a line (short, quiet)               |
 * | tick     | a count, or an option checked                        |
 * | error    | a strike, or a trap moment                           |
 * | ding     | the answer                                           |
 * | whoosh   | a flight, a move, or the picture panel opening       |
 * | click    | a tap on the board's controls                        |
 *
 * They are mixed well under the voice (15–35%), and THROTTLED: at most MAX_PER_MOMENT in one
 * moment of the lesson, and never the same sound twice within a beat, because three effects in
 * a second is noise rather than emphasis. Pausing the board cancels what is waiting and stops
 * what is sounding. The mute switch (BoardTuning.tsx) is the off switch; reduced motion still
 * allows sound.
 *
 * One AudioContext for the whole page (`sharedAudioContext`), which the board's voice analyser
 * uses too: a browser allows only a handful.
 */

export type SfxName = "pop" | "whoosh" | "ding" | "scribble" | "click" | "tick" | "error";

/** How loud each sits under the voice, 0 to 1. */
const LEVEL: Record<SfxName, number> = {
  pop: 0.3,
  whoosh: 0.2,
  ding: 0.32,
  scribble: 0.15,
  click: 0.18,
  tick: 0.22,
  error: 0.25,
};

/** At most this many effects in one moment of the lesson (clicks on the controls aside). */
export const MAX_PER_MOMENT = 4;

/** The same sound is not played again within this long. */
const SAME_GAP_MS = 220;

/** Any two sounds are at least this far apart: one thing lands at a time. */
const ANY_GAP_MS = 90;

let shared: AudioContext | null = null;

/** The page's one AudioContext, made on first use; null where there is no Web Audio. */
export function sharedAudioContext(): AudioContext | null {
  if (shared) return shared;
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    shared = new Context();
  } catch {
    shared = null;
  }
  return shared;
}

/* ---- The recipes (SternHost scripts/sfx.mjs), as functions of time ----------------------- */

type Recipe = (rate: number, noise: () => number) => Float32Array;

function make(rate: number, seconds: number, at: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) out[i] = at(i / rate);
  return out;
}

/** A state-variable band-pass filter, stateful per sample. */
function bandpass(rate: number): (x: number, freq: number, q?: number) => number {
  let low = 0;
  let band = 0;
  return (x, freq, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, rate / 6)) / rate);
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return band;
  };
}

const RECIPES: Record<SfxName, Recipe> = {
  // A bubbly pop: a fast downward sweep in pitch.
  pop: (rate) => {
    let phase = 0;
    return make(rate, 0.14, (t) => {
      phase += (2 * Math.PI * (220 + 700 * Math.exp(-t * 40))) / rate;
      return Math.sin(phase) * Math.exp(-t * 32) * Math.min(1, t * 900);
    });
  },
  // Air moving: band-passed noise sweeping up.
  whoosh: (rate, noise) => {
    const bp = bandpass(rate);
    const d = 0.42;
    return make(rate, d, (t) => {
      const env = Math.sin((Math.PI * t) / d) ** 2;
      return bp(noise(), 300 + 2600 * (t / d), 0.5) * env;
    });
  },
  // A friendly two-note chime.
  ding: (rate) =>
    make(rate, 0.9, (t) => {
      const n1 = Math.sin(2 * Math.PI * 1318.5 * t) + 0.3 * Math.sin(2 * Math.PI * 2637 * t);
      const n2 = t > 0.09 ? Math.sin(2 * Math.PI * 1975.5 * (t - 0.09)) * Math.exp(-(t - 0.09) * 5) : 0;
      return (n1 * Math.exp(-t * 6) + n2) * Math.min(1, t * 400) * 0.6;
    }),
  // A marker on a whiteboard: band-passed noise in short strokes. Cut to two strokes here,
  // where SternHost has five: the board's own pen is the long sound, this only starts it.
  scribble: (rate, noise) => {
    const bp = bandpass(rate);
    const strokes = [0, 0.13];
    return make(rate, 0.25, (t) => {
      let env = 0;
      for (const s of strokes) if (t >= s && t < s + 0.1) env = Math.sin((Math.PI * (t - s)) / 0.1);
      return bp(noise(), 2400 + 900 * Math.sin(t * 40), 0.4) * env * 0.8;
    });
  },
  // A soft tap.
  click: (rate, noise) =>
    make(rate, 0.06, (t) => (noise() * 0.5 + Math.sin(2 * Math.PI * 1800 * t)) * Math.exp(-t * 120)),
  // A tick, for counting.
  tick: (rate, noise) =>
    make(rate, 0.08, (t) => (Math.sin(2 * Math.PI * 2400 * t) + 0.4 * noise()) * Math.exp(-t * 90)),
  // A gentle "wrong" buzz: two detuned low tones.
  error: (rate) =>
    make(rate, 0.32, (t) => {
      const env = Math.min(1, t * 200) * (t < 0.14 ? 1 : Math.exp(-(t - 0.14) * 25));
      const sq = (f: number) => Math.tanh(Math.sin(2 * Math.PI * f * t) * 3);
      return (sq(196) + sq(185)) * 0.5 * env * (t > 0.16 && t < 0.18 ? 0.2 : 1);
    }),
};

/** The recipe's samples, normalised to the same peak SternHost writes its files at. */
export function synthesise(name: SfxName, rate: number): Float32Array {
  // Deterministic noise, so every board sounds the same.
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  const samples = RECIPES[name](rate, noise);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i]! * k;
  return samples;
}

/* ---- Playing them ------------------------------------------------------------------------ */

const buffers = new Map<SfxName, AudioBuffer>();
const sounding = new Set<AudioBufferSourceNode>();
const waiting = new Set<number>();
let muted = false;
let moment: number | null = null;
let spent = 0;
const lastAt = new Map<SfxName, number>();
let lastAny = -Infinity;

/** Every effect played (or refused), for checking the board in a browser: `window.__sfxLog`. */
interface SfxLogEntry {
  name: SfxName;
  at: number;
  moment: number | null;
  played: boolean;
  why?: string;
}

function log(entry: SfxLogEntry): void {
  const holder = window as unknown as { __sfxLog?: SfxLogEntry[] };
  if (!holder.__sfxLog) return;
  holder.__sfxLog.push(entry);
}

function bufferFor(context: AudioContext, name: SfxName): AudioBuffer {
  let buffer = buffers.get(name);
  if (!buffer || buffer.sampleRate !== context.sampleRate) {
    const samples = synthesise(name, context.sampleRate);
    buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    buffers.set(name, buffer);
  }
  return buffer;
}

export function setSfxMuted(value: boolean): void {
  muted = value;
  if (value) stopSfx();
}

/** A new moment of the lesson: its allowance of effects starts again. */
export function sfxMoment(index: number | null): void {
  if (index === moment) return;
  moment = index;
  spent = 0;
}

/**
 * Play `name` now, or in `delayMs` (cancelled by `stopSfx`, as on a pause). Refused when muted,
 * when the moment has had its share, or too soon after the last; `free` (a tap on a control)
 * is not counted against the moment.
 */
export function playSfx(name: SfxName, delayMs = 0, free = false): void {
  if (muted) return;
  if (delayMs > 0) {
    const timer = window.setTimeout(() => {
      waiting.delete(timer);
      playSfx(name, 0, free);
    }, delayMs);
    waiting.add(timer);
    return;
  }
  const now = performance.now();
  const refuse = (why: string) => log({ name, at: now, moment, played: false, why });
  if (!free && spent >= MAX_PER_MOMENT) return refuse("moment-full");
  if (now - (lastAt.get(name) ?? -Infinity) < SAME_GAP_MS) return refuse("same-too-soon");
  if (!free && now - lastAny < ANY_GAP_MS) return refuse("too-soon");
  const context = sharedAudioContext();
  if (!context) return refuse("no-audio");
  try {
    if (context.state === "suspended") void context.resume();
    const source = context.createBufferSource();
    source.buffer = bufferFor(context, name);
    const gain = context.createGain();
    gain.gain.value = LEVEL[name];
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      sounding.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    sounding.add(source);
    source.start();
  } catch {
    return refuse("failed");
  }
  if (!free) spent += 1;
  lastAt.set(name, now);
  lastAny = now;
  log({ name, at: now, moment, played: true });
}

/** Cancel everything waiting, and stop what is sounding: the board has paused or closed. */
export function stopSfx(): void {
  for (const timer of waiting) window.clearTimeout(timer);
  waiting.clear();
  for (const source of sounding) {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  }
  sounding.clear();
}
