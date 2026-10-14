/**
 * THE TALKING MOUTH'S CLOCK (Mouth.tsx): which mouth shape is due at a moment of a voice clip.
 *
 * A clip's sounds come from the API as `[{p, start, end}]` in IPA (app/mouth_voice.py): the
 * Kokoro voice's own timings, or the studio voice's estimated. The mouth says one word of the
 * clip, so the sounds inside that word's window are taken (`speechFor`), its taught sound found
 * among them (`findTarget`, which knows the papers' British IPA and the American forms espeak
 * gives), and its syllables placed over them (`syllableSpans`). `poseAt` then reads the mouth's
 * position for any time from the RP shape table (mouthShapes.ts), holding the taught sound's
 * shape for HOLD_S however briefly the voice says it, with COARTICULATION: in the last 60 to
 * 120 ms before a sound the lips and jaw move towards its rounding and opening, as real lips do
 * ("enclosure" rounds before its vowel), while p, b and m keep the lips sealed for their whole
 * hold.
 *
 * A moment's SCRIPT (`scriptFor`) is every time the mouth says a word in that moment's clip:
 * each word it is given there (its own, or a later `say`), every time the voice says it after
 * that word's cue and before the next one's, from the voice's sounds where there are some and
 * from the spelling, fitted to where the word is said, where there are not. `partAt` reads it.
 */

import { foldWord, spokenWords, type SpokenWord } from "./wordClock.js";
import type { LessonCue } from "./api.js";
import { mix, poseOf, REST, rpPhoneme, SHAPES, smooth, type Pose } from "./mouthShapes.js";

export interface Phone {
  p: string;
  start: number;
  end: number;
  /** The index of the word it belongs to in the clip's words, where the API gives it. */
  w?: number;
}

/**
 * How long the taught sound's shape is held, at least, in clip seconds: long enough to be seen
 * however briefly the voice says it, short enough that the rest of the word still shows.
 */
export const HOLD_S = 0.25;

const LONG = "ː";

/** The sound without its length mark. */
function bare(p: string): string {
  return p.replaceAll(LONG, "").replaceAll(":", "");
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
  // The voice's sounds in RP: the taught sound itself, mapped as they are.
  const rp = rpPhoneme(want);
  const exact = phones.findIndex((phone) => rpPhoneme(phone.p) === rp);
  if (exact >= 0) return [exact, exact];
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
  /** Its sounds were guessed from the spelling, not given by the voice. */
  guessed?: boolean;
}

/** The sounds of `phones` inside [start, end] (with a little slack), as the word's speech. */
export function speechFor(
  phones: Phone[],
  window: [number, number],
  sound: string | null | undefined,
  syllables: string[] | null | undefined,
  /** The word's first and last index in the clip's words: where every sound says which word it
   *  is in (`w`), those words' sounds exactly. */
  words?: [number, number],
): Speech {
  const [start, end] = window;
  const indexed = words && phones.length > 0 && phones.every((phone) => typeof phone.w === "number");
  const mine = indexed
    ? phones.filter((phone) => phone.w! >= words[0] && phone.w! <= words[1])
    : phones.filter((phone) => phone.end > start - 0.015 && phone.start < end + 0.015);
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
    phones: speech.phones.map((phone) => ({ ...phone, start: move(phone.start), end: move(phone.end) })),
    start: at,
    end: move(speech.end),
    target: speech.target,
    syllables: speech.syllables.map(([a, b]) => [move(a), move(b)] as [number, number]),
    guessed: speech.guessed,
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

/** The mouth at a moment: its position, the sound being said, and whether it is voiced. */
export interface MouthState {
  pose: Pose;
  /** The sound being said, in RP ("" at rest). */
  p: string;
  /** Its index in the speech's sounds, or -1 at rest. */
  index: number;
  voiced: boolean;
  /** The taught sound, held. */
  holding: boolean;
}

export const RESTING: MouthState = { pose: REST, p: "", index: -1, voiced: false, holding: false };

/** Coarticulation: how long before a sound the lips and jaw start moving towards it. */
export const ANTICIPATE_MIN_S = 0.06;
export const ANTICIPATE_MAX_S = 0.12;
/** What is anticipated: the lips' rounding and spreading, their protrusion, the jaw. */
const ANTICIPATED: (keyof Pose)[] = ["jaw", "round", "spread", "protrude"];
/** Two sounds closer than this are one stretch of speech (a later one is anticipated). */
const JOINED_S = 0.08;

/** What the lips aim for ahead of a sound: its start. */
function aimFor(p: string): Pose {
  return poseOf(p, 0);
}

/** A sound's own pose `frac` of the way through it; h takes the shape of what follows. */
function ownPose(phones: Phone[], k: number, frac: number): Pose {
  const rp = rpPhoneme(phones[k]!.p);
  const next = phones[k + 1];
  if (SHAPES[rp]?.adapts && next && next.start - phones[k]!.end < JOINED_S) return { ...poseOf(next.p, 0), close: 0 };
  return poseOf(rp, frac);
}

/**
 * The mouth at time `t`: the sound being said, its shape (a diphthong gliding, an affricate
 * releasing), moved towards the next sound's lips and jaw in the last 60 to 120 ms before it.
 * p, b and m keep their lips sealed (`close` 1) for their whole span: closure is never blended.
 * A short gap between two sounds keeps the shape before it; a longer one rests.
 */
export function poseAt(speech: Speech, t: number): MouthState {
  const phones = speech.phones;
  const hold = holdSpan(speech);
  if (hold && t >= hold[0] && t <= hold[1]) {
    const [a, b] = speech.target!;
    const frac = (t - hold[0]) / Math.max(0.001, hold[1] - hold[0]);
    const pose =
      a === b
        ? poseOf(phones[a]!.p, frac)
        : mix(poseOf(phones[a]!.p, 0), poseOf(phones[b]!.p, 1), smooth((frac - 0.25) / 0.55));
    const p = rpPhoneme(phones[a]!.p);
    return { pose, p, index: a, voiced: SHAPES[p]?.voiced ?? false, holding: true };
  }
  let k = phones.findIndex((phone) => t >= phone.start && t < phone.end);
  if (k < 0) {
    let last = -1;
    phones.forEach((phone, j) => {
      if (phone.end <= t) last = j;
    });
    if (last < 0 || t - phones[last]!.end >= 0.06 || t > speech.end) return RESTING;
    k = last;
  }
  const phone = phones[k]!;
  const span = Math.max(0.001, phone.end - phone.start);
  const frac = Math.max(0, Math.min(1, (t - phone.start) / span));
  let pose = ownPose(phones, k, frac);
  const next = phones[k + 1];
  if (next && next.start - phone.end < JOINED_S) {
    const lead = Math.min(ANTICIPATE_MAX_S, Math.max(ANTICIPATE_MIN_S, span * 0.6));
    const from = next.start - lead;
    if (t > from) pose = mix(pose, aimFor(next.p), smooth((t - from) / lead), ANTICIPATED);
  }
  const p = rpPhoneme(phone.p);
  return { pose, p, index: k, voiced: SHAPES[p]?.voiced ?? false, holding: false };
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
  return { ...shifted(base, window[0], span / Math.max(0.05, length)), guessed: true };
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
      let speech = phones?.length ? speechFor(phones, window, one.sound, own, [first, last]) : null;
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
