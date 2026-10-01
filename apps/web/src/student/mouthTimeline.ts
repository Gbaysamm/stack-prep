/**
 * THE TALKING MOUTH'S CLOCK (Mouth.tsx): which mouth shape is due at a moment of a voice clip.
 *
 * A clip's sounds come from the API as `[{p, start, end}]` in IPA (app/mouth_voice.py): the
 * Kokoro voice's own timings, or the studio voice's estimated. The mouth says one word of the
 * clip, so the sounds inside that word's window are taken (`speechFor`), its taught sound found
 * among them (`findTarget`, which knows the papers' British IPA and the American forms espeak
 * gives), and its syllables placed over them (`syllableSpans`). `visemeAt` then reads the shape
 * for any time, holding the taught sound's shape for HOLD_S however briefly the voice says it.
 *
 * A moment's SCRIPT (`scriptFor`) is every time the mouth says a word in that moment's clip:
 * each word it is given there (its own, or a later `say`), every time the voice says it after
 * that word's cue and before the next one's, from the voice's sounds where there are some and
 * from the spelling, fitted to where the word is said, where there are not. `partAt` reads it.
 */

import { foldWord, spokenWords, type SpokenWord } from "./wordClock.js";
import type { LessonCue } from "./api.js";

/** A mouth shape. */
export type Viseme =
  | "rest"
  | "closed"
  | "fv"
  | "th"
  | "slight"
  | "spread"
  | "lax"
  | "wide"
  | "round"
  | "roundLax"
  | "sh"
  | "r"
  | "back"
  | "mid";

export interface Phone {
  p: string;
  start: number;
  end: number;
}

/**
 * How long the taught sound's shape is held, at least, in clip seconds: long enough to be seen
 * however briefly the voice says it, short enough that the rest of the word still shows.
 */
export const HOLD_S = 0.25;

const LONG = "ː";

/** The sound without its length mark. */
function bare(p: string): string {
  return p.replaceAll(LONG, "");
}

const VISEMES: [Viseme, string[]][] = [
  ["closed", ["p", "b", "m"]],
  ["fv", ["f", "v"]],
  ["th", ["θ", "ð"]],
  ["sh", ["ʃ", "ʒ", "tʃ", "dʒ", "ʧ", "ʤ"]],
  ["slight", ["t", "d", "n", "s", "z", "l", "ɾ", "ɫ", "ʔ"]],
  ["spread", ["i", "j"]],
  ["lax", ["ɪ", "ᵻ", "e", "ɛ"]],
  ["wide", ["æ", "a", "ɑ", "ʌ", "ɐ"]],
  ["round", ["u", "o", "ɔ", "ɒ", "w"]],
  ["roundLax", ["ʊ"]],
  ["r", ["ɹ", "r", "ɚ"]],
  ["back", ["k", "g", "ɡ", "ŋ", "h", "x"]],
  ["mid", ["ə", "ɜ"]],
];
const BY_SOUND = new Map<string, Viseme>(
  VISEMES.flatMap(([viseme, sounds]) => sounds.map((sound) => [sound, viseme] as [string, Viseme])),
);

/** The mouth shape of a sound (IPA). An affricate is its own; a diphthong is its first part. */
export function visemeOf(p: string): Viseme {
  const sound = bare(p.trim());
  if (!sound) return "rest";
  return BY_SOUND.get(sound) ?? BY_SOUND.get(sound[0]!) ?? "slight";
}

/**
 * What a taught sound (as the lesson writes it, usually British) may be heard as in the voice's
 * sounds (espeak's American English): each list is the first sound that counts.
 */
const HEARD_AS: Record<string, string[]> = {
  i: ["i"],
  "ɪ": ["ɪ", "ᵻ", "i"],
  e: ["e", "ɛ"],
  "ɛ": ["ɛ", "e"],
  "æ": ["æ", "a"],
  "ɑ": ["ɑ", "a"],
  "ɒ": ["ɒ", "ɑ", "ɔ"],
  "ɔ": ["ɔ", "ɑ"],
  "ʊ": ["ʊ"],
  u: ["u"],
  "ʌ": ["ʌ", "ə", "ɐ"],
  "ɜ": ["ɜ", "ɚ"],
  "ə": ["ə", "ɐ", "ɚ", "ᵻ"],
  "ɚ": ["ɚ", "ɜ", "ə"],
  "eɪ": ["e"],
  "aɪ": ["a"],
  "ɔɪ": ["ɔ"],
  "əʊ": ["o", "ə"],
  "oʊ": ["o"],
  "aʊ": ["a"],
  "ɪə": ["ɪ", "i"],
  "eə": ["ɛ", "e"],
  "ʊə": ["ʊ", "u"],
  r: ["ɹ", "r"],
  "ɹ": ["ɹ", "r"],
  g: ["g", "ɡ"],
  "ɡ": ["g", "ɡ"],
  t: ["t", "ɾ"],
  "tʃ": ["tʃ", "ʧ"],
  "dʒ": ["dʒ", "ʤ"],
};

/** Whether a taught sound is a diphthong, held over both its parts. */
function gliding(sound: string): boolean {
  return bare(sound).length === 2 && !["tʃ", "dʒ"].includes(bare(sound));
}

/** The first and last index of the sounds that make the taught sound, or null. */
export function findTarget(phones: Phone[], sound: string | null | undefined): [number, number] | null {
  if (!sound) return null;
  const want = bare(sound.trim().replace(/^\/|\/$/g, ""));
  const accepts = HEARD_AS[want] ?? [want];
  for (let k = 0; k < phones.length; k += 1) {
    const heard = bare(phones[k]!.p);
    if (accepts.includes(heard) || accepts.includes(heard[0] ?? "")) {
      // A diphthong as two sounds: its glide is held too.
      const next = phones[k + 1];
      const glide = gliding(want) && heard.length === 1 && next && ["ɪ", "ʊ", "ə", "i", "u"].includes(bare(next.p));
      return [k, glide ? k + 1 : k];
    }
  }
  return null;
}

const VOWELS = new Set("aeiouæɑɒɔəɚɛɜɪʊʌɐᵻ");

function isVowel(p: string): boolean {
  return VOWELS.has(bare(p)[0] ?? "");
}

/**
 * Where each syllable is said: one span per syllable, in clip seconds. Where the vowels heard
 * are as many as the syllables, each syllable is its vowel with the consonants that belong to
 * it (one between two vowels starts the next; of more, the first ends the one before); else
 * the word's time is shared out by the syllables' lengths.
 */
export function syllableSpans(phones: Phone[], start: number, end: number, syllables: string[]): [number, number][] {
  if (!syllables.length) return [];
  const nuclei: number[] = [];
  phones.forEach((phone, k) => {
    // A diphthong heard as two vowels is one nucleus.
    if (isVowel(phone.p) && !(k > 0 && nuclei[nuclei.length - 1] === k - 1 && isVowel(phones[k - 1]!.p) && ["ɪ", "ʊ", "ə"].includes(bare(phone.p)))) nuclei.push(k);
  });
  if (nuclei.length === syllables.length && phones.length) {
    const spans: [number, number][] = [];
    let from = start;
    nuclei.forEach((nucleus, i) => {
      const next = nuclei[i + 1];
      let until = end;
      if (next !== undefined) {
        const between = next - nucleus - 1;
        // The consonants between: one goes with the next syllable, of more the first stays.
        const last = between <= 1 ? nucleus : nucleus + 1;
        until = phones[last]!.end;
      }
      spans.push([from, Math.max(from, until)]);
      from = until;
    });
    return spans;
  }
  const lengths = syllables.map((s) => Math.max(1, s.length));
  const total = lengths.reduce((a, b) => a + b, 0);
  let at = start;
  return lengths.map((length) => {
    const span = ((end - start) * length) / total;
    const out: [number, number] = [at, at + span];
    at += span;
    return out;
  });
}

/** The words of a cue or a mouth's word, as they are matched. */
function wanted(words: string): string[] {
  return spokenWords(words);
}

/** Every place `want` is said in `words`, as [first word, last word] indices. */
function runs(words: SpokenWord[], want: string[]): [number, number][] {
  const heard = words.map((word) => foldWord(word.w));
  const out: [number, number][] = [];
  if (!want.length) return out;
  for (let k = 0; k + want.length <= heard.length; k += 1)
    if (want.every((word, j) => heard[k + j] === word)) out.push([k, k + want.length - 1]);
  return out;
}

/**
 * When the mouth's word is said in the clip: its first time at or after the cue's words (their
 * nth time) where the mouth has a cue, else its first time. Null where it is not said; then
 * `cueAt` is when the cue's words start, if they are said, for the mouth to say its word then.
 */
export function wordWindow(
  words: SpokenWord[],
  word: string,
  cue?: { word: string; nth?: number | null } | null,
): { window: [number, number] | null; cueAt: number | null } {
  let after = -Infinity;
  let cueAt: number | null = null;
  if (cue && cue.word) {
    const found = runs(words, wanted(cue.word));
    const hit = found[Math.max(1, cue.nth ?? 1) - 1] ?? found[0];
    if (hit) {
      cueAt = words[hit[0]]!.start;
      after = cueAt - 0.01;
    }
  }
  const mine = runs(words, wanted(word)).find(([first]) => words[first]!.start >= after);
  return {
    window: mine ? [words[mine[0]]!.start, words[mine[1]]!.end] : null,
    cueAt,
  };
}

/** The mouth's word as it is said: its sounds, its taught sound, its syllables. */
export interface Speech {
  phones: Phone[];
  start: number;
  end: number;
  /** The taught sound's first and last index in `phones`, if it is heard. */
  target: [number, number] | null;
  syllables: [number, number][];
}

/** The sounds of `phones` inside [start, end] (with a little slack), as the word's speech. */
export function speechFor(
  phones: Phone[],
  window: [number, number],
  sound: string | null | undefined,
  syllables: string[] | null | undefined,
): Speech {
  const [start, end] = window;
  const mine = phones.filter((phone) => phone.end > start - 0.015 && phone.start < end + 0.015);
  const from = mine.length ? Math.min(start, mine[0]!.start) : start;
  const until = mine.length ? Math.max(end, mine[mine.length - 1]!.end) : end;
  return {
    phones: mine,
    start: from,
    end: until,
    target: findTarget(mine, sound),
    syllables: syllableSpans(mine, from, until, syllables ?? []),
  };
}

/** The same speech, moved to start at `at` and stretched by `scale`. */
export function shifted(speech: Speech, at: number, scale = 1): Speech {
  const move = (t: number) => at + (t - speech.start) * scale;
  return {
    phones: speech.phones.map((phone) => ({ p: phone.p, start: move(phone.start), end: move(phone.end) })),
    start: at,
    end: move(speech.end),
    target: speech.target,
    syllables: speech.syllables.map(([a, b]) => [move(a), move(b)] as [number, number]),
  };
}

/** When the taught sound's shape is held: from its first sound for at least HOLD_S. */
export function holdSpan(speech: Speech): [number, number] | null {
  if (!speech.target) return null;
  const first = speech.phones[speech.target[0]]!;
  const last = speech.phones[speech.target[1]]!;
  return [first.start, Math.max(last.end, first.start + HOLD_S)];
}

/** How far through the speech a time is: before it, during, or after it (with the hold). */
export function finishedAt(speech: Speech): number {
  const hold = holdSpan(speech);
  return Math.max(speech.end, hold ? hold[1] : speech.end);
}

/** The mouth shape at time `t`, and whether it is the taught sound held. */
export function visemeAt(speech: Speech, t: number): { viseme: Viseme; holding: boolean } {
  const hold = holdSpan(speech);
  if (hold && t >= hold[0] && t <= hold[1]) {
    return { viseme: visemeOf(speech.phones[speech.target![0]]!.p), holding: true };
  }
  let last: Phone | null = null;
  for (const phone of speech.phones) {
    if (t < phone.start) break;
    if (t < phone.end) return { viseme: visemeOf(phone.p), holding: false };
    last = phone;
  }
  // A short gap between two sounds keeps the shape before it; a longer one rests.
  if (last && t - last.end < 0.06 && t <= speech.end) return { viseme: visemeOf(last.p), holding: false };
  return { viseme: "rest", holding: false };
}

/** Which syllable is being said at `t` (from 0), or -1. */
export function syllableAt(speech: Speech, t: number): number {
  return speech.syllables.findIndex(([a, b]) => t >= a && t < b);
}

/* ---- Without a voice's sounds: a guess from the spelling --------------------------------- */

const SPELLINGS: [RegExp, string][] = [
  [/^tch/, "tʃ"],
  [/^ch/, "tʃ"],
  [/^sh/, "ʃ"],
  [/^th/, "θ"],
  [/^ph/, "f"],
  [/^ng/, "ŋ"],
  [/^ck/, "k"],
  [/^qu/, "kw"],
  [/^wh/, "w"],
  [/^(ee|ea|ie)/, "iː"],
  [/^(oo)/, "uː"],
  [/^(ou|ow)/, "aʊ"],
  [/^(oi|oy)/, "ɔɪ"],
  [/^(ai|ay|ei|ey)/, "eɪ"],
  [/^(ar)/, "ɑː"],
  [/^(or|aw|au)/, "ɔː"],
  [/^(er|ir|ur)/, "ɜː"],
  [/^a/, "æ"],
  [/^e/, "e"],
  [/^i/, "ɪ"],
  [/^o/, "ɒ"],
  [/^u/, "ʌ"],
  [/^y/, "j"],
  [/^c/, "k"],
  [/^x/, "ks"],
  [/^j/, "dʒ"],
];

/** The word's sounds guessed from its spelling, each a typical length, from time 0. */
export function guessedPhones(word: string): Phone[] {
  const out: Phone[] = [];
  let rest = word.toLowerCase().replace(/[^a-z]/g, "");
  let at = 0;
  while (rest) {
    const rule = SPELLINGS.find(([pattern]) => pattern.test(rest));
    const taken = rule ? rest.match(rule[0])![0] : rest[0]!;
    const sounds = rule ? (rule[1] === "ks" ? ["k", "s"] : rule[1] === "kw" ? ["k", "w"] : [rule[1]]) : [taken];
    // A doubled letter is one sound; a final silent e is none.
    if (!(out.length && sounds.length === 1 && out[out.length - 1]!.p === sounds[0] && taken.length === 1) && !(rest === "e" && out.length > 1)) {
      for (const sound of sounds) {
        const span = isVowel(sound) ? (sound.includes(LONG) || sound.length > 1 ? 0.2 : 0.13) : 0.08;
        out.push({ p: sound, start: at, end: at + span });
        at += span;
      }
    }
    rest = rest.slice(taken.length);
  }
  return out;
}

/* ---- A moment's script: every word the mouth says in it -------------------------------- */

/** A word the mouth is given in a moment: its own, or a later `say`. */
export interface MouthSaying {
  word: string;
  sound: string | null;
  cue: LessonCue | null;
  /** The mouth's own word, whose syllables are written under it. */
  own: boolean;
}

/** One time the mouth says a word, in clip seconds. */
export interface Part {
  word: string;
  sound: string | null;
  own: boolean;
  speech: Speech;
}

/** At most this many times a word is said again in one moment ("gnash. Gnash.") are mouthed. */
const MOST_TIMES = 3;

/** A word's sounds guessed from its spelling, fitted into [start, end]. */
export function fittedGuess(
  word: string,
  window: [number, number],
  sound: string | null | undefined,
  syllables: string[] | null | undefined,
): Speech {
  const guess = guessedPhones(word);
  const length = guess[guess.length - 1]?.end ?? 0.4;
  const base = speechFor(guess, [0, length], sound, syllables);
  const span = Math.max(0.12, window[1] - window[0]);
  return shifted(base, window[0], span / Math.max(0.05, length));
}

/** Where the cue's words start in `words` (their nth time, else the first), or null. */
function cueStart(words: SpokenWord[], cue: LessonCue | null): number | null {
  if (!cue || !cue.word) return null;
  const found = runs(words, wanted(cue.word));
  const hit = found[Math.max(1, cue.nth || 1) - 1] ?? found[0];
  return hit ? words[hit[0]]!.start : null;
}

/**
 * Every time the mouth says a word in a moment, in order. `words` are the clip's words (the
 * voice's own timings, or estimated from the text); `phones` its sounds, where the voice gives
 * them (else each word's sounds are guessed from its spelling and fitted to where it is said).
 */
export function scriptFor(
  sayings: MouthSaying[],
  words: SpokenWord[],
  phones: Phone[] | null,
  syllables: string[] | null | undefined,
): Part[] {
  const starts = sayings.map((one) => cueStart(words, one.cue));
  const parts: Part[] = [];
  let floor = -Infinity;
  sayings.forEach((one, k) => {
    const own = one.own ? syllables : null;
    const from = Math.max(floor, starts[k] ?? floor);
    const next = starts.slice(k + 1).find((at): at is number => at !== null && at > from) ?? Infinity;
    const said = runs(words, wanted(one.word))
      .filter(([first]) => words[first]!.start >= from - 0.01 && words[first]!.start < next - 0.01)
      .slice(0, MOST_TIMES);
    if (!said.length) {
      // Not heard in the clip: said silently at its cue, or just after the word before.
      const last = parts[parts.length - 1];
      const at = starts[k] ?? (last ? finishedAt(last.speech) + 0.1 : words[0]?.start ?? 0.3);
      const guess = guessedPhones(one.word);
      const speech = fittedGuess(one.word, [at, at + (guess[guess.length - 1]?.end ?? 0.4)], one.sound, own);
      parts.push({ word: one.word, sound: one.sound, own: one.own, speech });
      floor = speech.end;
      return;
    }
    for (const [first, last] of said) {
      const window: [number, number] = [words[first]!.start, words[last]!.end];
      let speech = phones?.length ? speechFor(phones, window, one.sound, own) : null;
      if (!speech || !speech.phones.length) speech = fittedGuess(one.word, window, one.sound, own);
      parts.push({ word: one.word, sound: one.sound, own: one.own, speech });
      floor = window[1];
    }
  });
  return parts;
}

/** The part being said at `t` (its taught sound's hold included), or null between words. */
export function partAt(parts: Part[], t: number): Part | null {
  for (const part of parts) {
    if (t >= part.speech.start - 0.02 && t <= finishedAt(part.speech) + 0.06) return part;
  }
  return null;
}
