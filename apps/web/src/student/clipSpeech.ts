/**
 * WHERE A CLIP ACTUALLY SPEAKS, for a voice that gives no timings (the studio voice): the clip is
 * decoded in the browser, its loudness read every 10 ms, and the stretches of speech between its
 * silences found. An estimate of when each word is said (spread over the line by length) is
 * then fitted to them (`alignToSpeech`): each pause the text makes (a full stop, a comma) is put
 * in a silence of the clip near where the estimate had it, and the words between two pauses
 * share the speech between those silences. So "Watch my tongue: gnash. Gnash." has its two
 * gnashes where the voice says them, not where an even spread of the letters would put them.
 *
 * Used by the talking mouth (Mouth.tsx). Free and local: the clip is the one already playing.
 */

import type { Phone } from "./mouthTimeline.js";
import type { SpokenWord } from "./wordClock.js";

/** Stretches of speech, in seconds into the clip. */
export type Segments = [number, number][];

const FRAME_S = 0.01;
/** A quiet stretch at least this long is a pause between two stretches of speech. */
const GAP_S = 0.09;
/** Speech shorter than this is a click, not a word. */
const SHORTEST_S = 0.04;

/** Stretches of speech in decoded audio samples. */
export function segmentsOf(samples: Float32Array, rate: number): Segments {
  const step = Math.max(1, Math.round(rate * FRAME_S));
  const levels: number[] = [];
  for (let at = 0; at + step <= samples.length; at += step) {
    let sum = 0;
    for (let k = at; k < at + step; k += 1) sum += samples[k]! * samples[k]!;
    levels.push(Math.sqrt(sum / step));
  }
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  // Speech is well above the quiet between words: a tenth of the loud level, or thrice the floor.
  const threshold = Math.max(loud * 0.1, floor * 3, 1e-4);
  const out: Segments = [];
  let from = -1;
  levels.forEach((level, k) => {
    if (level >= threshold) {
      if (from < 0) from = k;
    } else if (from >= 0) {
      out.push([from * FRAME_S, k * FRAME_S]);
      from = -1;
    }
  });
  if (from >= 0) out.push([from * FRAME_S, levels.length * FRAME_S]);
  // Short quiets inside a word are not pauses; short sounds alone are not words.
  const merged: Segments = [];
  for (const piece of out) {
    const last = merged[merged.length - 1];
    if (last && piece[0] - last[1] < GAP_S) last[1] = piece[1];
    else merged.push([piece[0], piece[1]]);
  }
  return merged.filter(([a, b]) => b - a >= SHORTEST_S);
}

const asked = new Map<string, Promise<Segments | null>>();

/** The clip's stretches of speech, decoded once per URL; null where it cannot be read. */
export function clipSegments(url: string): Promise<Segments | null> {
  let found = asked.get(url);
  if (!found) {
    found = (async () => {
      try {
        if (typeof OfflineAudioContext === "undefined") return null;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const context = new OfflineAudioContext(1, 1, 16000);
        const audio = await context.decodeAudioData(data);
        return segmentsOf(audio.getChannelData(0), audio.sampleRate);
      } catch {
        return null;
      }
    })();
    asked.set(url, found);
  }
  return found;
}

/** Whether a word, as the voice was given it, ends a phrase (the voice pauses after it). */
function endsPhrase(word: string): boolean {
  return /[.,;:!?—]["'”’)]*$/.test(word);
}

/**
 * The words fitted to the clip's speech. `words` are estimated times (any span); `pauses[i]`
 * says the voice pauses after word i (by default, when it ends in punctuation). Returns new
 * times, word for word.
 */
export function alignToSpeech(words: SpokenWord[], segments: Segments, pauses?: boolean[]): SpokenWord[] {
  const n = words.length;
  if (!n || !segments.length) return words;
  const S0 = segments[0]![0];
  const S1 = segments[segments.length - 1]![1];
  const e0 = words[0]!.start;
  const e1 = Math.max(e0 + 0.01, words[n - 1]!.end);
  const scale = (t: number) => S0 + ((t - e0) / (e1 - e0)) * (S1 - S0);
  const est = words.map((word) => ({ w: word.w, start: scale(word.start), end: scale(word.end) }));
  const gaps = segments.slice(1).map((piece, k) => [segments[k]![1], piece[0]] as [number, number]);
  // The text's pauses and the clip's silences, matched in order (a dynamic programme): a pause
  // goes in a silence near where the estimate has it, a long silence is likely a pause of the
  // text (a full stop more than a comma), and a pause or a silence may go unmatched.
  const breaks: { word: number; expect: number; strong: boolean }[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const pause = pauses ? pauses[i] : endsPhrase(words[i]!.w);
    if (pause) breaks.push({ word: i, expect: (est[i]!.end + est[i + 1]!.start) / 2, strong: /[.!?:;]["'”’)]*$/.test(words[i]!.w) });
  }
  const m = breaks.length;
  const g = gaps.length;
  const skipBreak = (k: number) => (breaks[k]!.strong ? 0.45 : 0.25);
  const skipGap = (j: number) => Math.max(0, gaps[j]![1] - gaps[j]![0] - 0.12) * 2.5;
  const pair = (k: number, j: number) => {
    const centre = (gaps[j]![0] + gaps[j]![1]) / 2;
    const far = Math.abs(centre - breaks[k]!.expect);
    return far > 0.9 ? Infinity : far - (gaps[j]![1] - gaps[j]![0]) * (breaks[k]!.strong ? 0.8 : 0.4);
  };
  // cost[k][j]: the best for the first k pauses and the first j silences.
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(g + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(g + 1).fill(0));
  cost[0]![0] = 0;
  for (let k = 0; k <= m; k += 1)
    for (let j = 0; j <= g; j += 1) {
      const here = cost[k]![j]!;
      if (here === Infinity) continue;
      if (k < m && here + skipBreak(k) < cost[k + 1]![j]!) {
        cost[k + 1]![j] = here + skipBreak(k);
        from[k + 1]![j] = 1;
      }
      if (j < g && here + skipGap(j) < cost[k]![j + 1]!) {
        cost[k]![j + 1] = here + skipGap(j);
        from[k]![j + 1] = 2;
      }
      if (k < m && j < g) {
        const both = here + pair(k, j);
        if (both < cost[k + 1]![j + 1]!) {
          cost[k + 1]![j + 1] = both;
          from[k + 1]![j + 1] = 3;
        }
      }
    }
  const matched: { word: number; gap: number }[] = [];
  for (let k = m, j = g; k > 0 || j > 0; ) {
    const step = from[k]![j];
    if (step === 3) {
      matched.unshift({ word: breaks[k - 1]!.word, gap: j - 1 });
      k -= 1;
      j -= 1;
    } else if (step === 1) k -= 1;
    else j -= 1;
  }
  const anchors: { word: number; time: number; end: number }[] = [{ word: 0, time: S0, end: S0 }];
  // Word i ends as its silence starts; word i + 1 starts as it ends.
  for (const one of matched) anchors.push({ word: one.word + 1, time: gaps[one.gap]![1], end: gaps[one.gap]![0] });
  anchors.push({ word: n, time: S1, end: S1 });
  const out: SpokenWord[] = [];
  for (let a = 0; a + 1 < anchors.length; a += 1) {
    const from = anchors[a]!;
    const to = anchors[a + 1]!;
    const span = est.slice(from.word, to.word);
    if (!span.length) continue;
    const t0 = from.time;
    const t1 = Math.max(t0 + 0.05, to.end);
    const a0 = span[0]!.start;
    const a1 = Math.max(a0 + 0.01, span[span.length - 1]!.end);
    for (const word of span) {
      out.push({
        w: word.w,
        start: t0 + ((word.start - a0) / (a1 - a0)) * (t1 - t0),
        end: t0 + ((word.end - a0) / (a1 - a0)) * (t1 - t0),
      });
    }
  }
  return out.length === n ? out : words;
}

/** Sounds timed against `from` words moved, word by word, to the same words' times in `to`. */
export function retimed(phones: Phone[], from: SpokenWord[], to: SpokenWord[]): Phone[] {
  if (from.length !== to.length || !from.length) return phones;
  const out: Phone[] = [];
  let w = 0;
  for (const phone of phones) {
    const middle = (phone.start + phone.end) / 2;
    while (w + 1 < from.length && middle >= from[w + 1]!.start) w += 1;
    const a = from[w]!;
    const b = to[w]!;
    const length = Math.max(0.01, a.end - a.start);
    const move = (t: number) => b.start + ((t - a.start) / length) * (b.end - b.start);
    out.push({ p: phone.p, start: move(phone.start), end: move(phone.end) });
  }
  return out;
}
