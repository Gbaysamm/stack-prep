/**
 * THE MOUTH'S SHAPES (Mouth.tsx, mouthTimeline.ts): one articulation per British RP phoneme
 * (docs/plans/2026-10-01-exact-lip-sync.md, step 1).
 *
 * Each of the 44 phonemes is a set of measured parameters, all 0 to 1:
 * - LIPS AND JAW: `jaw` (opening), `round` (lip rounding), `spread` (lip spreading), `protrude`
 *   (lips pushed forward), `close` (lips sealed, for p b m), `labiodental` (lower lip to the
 *   upper teeth, for f v), `interdental` (tongue tip between the teeth, for θ ð).
 * - TEETH: `upperTeeth`, `lowerTeeth`: how much of each row shows.
 * - TONGUE, for the side view: `tipX` (0 drawn back, 0.5 at the alveolar ridge, 1 between the
 *   teeth), `tipY` (0 low, 1 touching the roof), `bodyX` (0 back, 1 front), `bodyY` (0 low,
 *   1 high).
 * Both views are drawn from these same numbers (Mouth.tsx `frontShape`, `sideShape`).
 *
 * Sources, cited per row (`src`):
 * - Cruttenden, *Gimson's Pronunciation of English*, 8th ed. (2014): ch. 8 (vowels: tongue
 *   height and frontness, lip position) and ch. 9 (consonants: place and manner).
 * - Roach, *English Phonetics and Phonology*, 4th ed. (2009): ch. 2 to 4 (vowels and
 *   diphthongs, with their lip positions), ch. 5 to 8 (consonants).
 * The numbers place each phoneme on the vowel chart (height to jaw and tongue body, frontness
 * to tongue body) and give the lip positions these books describe; they are an articulatory
 * reading of those descriptions for drawing, for an expert to sign off.
 *
 * Diphthongs move from their first target to their second over their duration (Roach ch. 4).
 * Affricates move from the stop's closure into their fricative.
 *
 * `rpPhoneme` maps any IPA the voice gives (espeak's American forms, a long mark written ":",
 * stress marks, diacritics) to the nearest of the set, so nothing unknown ever breaks the mouth.
 */

/** The 44 phonemes of British RP, diphthongs and affricates as one symbol each. */
export const RP_VOWELS = ["iː", "ɪ", "e", "æ", "ʌ", "ɑː", "ɒ", "ɔː", "ʊ", "uː", "ɜː", "ə"] as const;
export const RP_DIPHTHONGS = ["eɪ", "aɪ", "ɔɪ", "əʊ", "aʊ", "ɪə", "eə", "ʊə"] as const;
export const RP_CONSONANTS = [
  "p", "b", "t", "d", "k", "g", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  "tʃ", "dʒ", "m", "n", "ŋ", "l", "r", "w", "j",
] as const;
export const RP_PHONEMES: readonly string[] = [...RP_VOWELS, ...RP_DIPHTHONGS, ...RP_CONSONANTS];

/** The numbers of a mouth's position. */
export interface Pose {
  jaw: number;
  round: number;
  spread: number;
  protrude: number;
  close: number;
  labiodental: number;
  interdental: number;
  upperTeeth: number;
  lowerTeeth: number;
  tipX: number;
  tipY: number;
  bodyX: number;
  bodyY: number;
}
export const POSE_KEYS: (keyof Pose)[] = [
  "jaw", "round", "spread", "protrude", "close", "labiodental", "interdental",
  "upperTeeth", "lowerTeeth", "tipX", "tipY", "bodyX", "bodyY",
];

/** A phoneme's shape: its pose (and, for a diphthong or affricate, the pose it moves to). */
export interface Shape {
  pose: Pose;
  /** The second target: a diphthong's glide, an affricate's fricative release. */
  to?: Pose;
  /** Voiced: the vocal folds vibrate (the voice box mark buzzes). */
  voiced: boolean;
  /** Takes the next sound's shape (h: the mouth is already set for the vowel after it). */
  adapts?: boolean;
  /** Where the numbers come from. */
  src: string;
}

/** The mouth at rest: lips lightly together, teeth apart, tongue low and relaxed. */
export const REST: Pose = {
  jaw: 0.04, round: 0.1, spread: 0, protrude: 0, close: 0.6, labiodental: 0, interdental: 0,
  upperTeeth: 0, lowerTeeth: 0, tipX: 0.4, tipY: 0.2, bodyX: 0.5, bodyY: 0.45,
};

/** A pose: a neutral mouth with the given numbers. */
function pose(set: Partial<Pose>): Pose {
  return {
    jaw: 0.3, round: 0, spread: 0, protrude: 0, close: 0, labiodental: 0, interdental: 0,
    upperTeeth: 0.6, lowerTeeth: 0.3, tipX: 0.4, tipY: 0.2, bodyX: 0.5, bodyY: 0.5,
    ...set,
  };
}

/* ---- Vowels: Cruttenden ch. 8, Roach ch. 2 and 3 ------------------------------------------ */

const V: Record<(typeof RP_VOWELS)[number], Shape> = {
  "iː": {
    pose: pose({ jaw: 0.12, spread: 1, upperTeeth: 1, lowerTeeth: 0.9, tipX: 0.45, tipY: 0.3, bodyX: 1, bodyY: 1 }),
    voiced: true,
    src: "Close front unrounded, lips spread (Cruttenden 8.9.1; Roach 2.3)",
  },
  "ɪ": {
    pose: pose({ jaw: 0.24, spread: 0.6, upperTeeth: 0.9, lowerTeeth: 0.6, tipX: 0.45, tipY: 0.25, bodyX: 0.8, bodyY: 0.8 }),
    voiced: true,
    src: "Close-mid front centralised, lips loosely spread (Cruttenden 8.9.2; Roach 2.2)",
  },
  e: {
    pose: pose({ jaw: 0.4, spread: 0.5, upperTeeth: 0.8, lowerTeeth: 0.4, tipX: 0.45, tipY: 0.2, bodyX: 0.9, bodyY: 0.6 }),
    voiced: true,
    src: "Front between close-mid and open-mid, lips loosely spread (Cruttenden 8.9.3; Roach 2.2)",
  },
  "æ": {
    pose: pose({ jaw: 0.8, spread: 0.35, upperTeeth: 0.7, lowerTeeth: 0.2, tipX: 0.42, tipY: 0.05, bodyX: 0.8, bodyY: 0.12 }),
    voiced: true,
    src: "Front open (now nearly fully open in RP), lips neutrally open (Cruttenden 8.9.4; Roach 2.2)",
  },
  "ʌ": {
    pose: pose({ jaw: 0.65, spread: 0.15, upperTeeth: 0.6, lowerTeeth: 0.2, tipX: 0.4, tipY: 0.1, bodyX: 0.5, bodyY: 0.2 }),
    voiced: true,
    src: "Central, open-mid to open, lips neutrally open (Cruttenden 8.9.6; Roach 2.2)",
  },
  "ɑː": {
    pose: pose({ jaw: 0.9, spread: 0.1, upperTeeth: 0.5, lowerTeeth: 0.1, tipX: 0.38, tipY: 0.05, bodyX: 0.1, bodyY: 0.05 }),
    voiced: true,
    src: "Open back unrounded, lips neutrally open (Cruttenden 8.9.7; Roach 2.3)",
  },
  "ɒ": {
    pose: pose({ jaw: 0.75, round: 0.4, protrude: 0.2, upperTeeth: 0.4, lowerTeeth: 0.1, tipX: 0.38, tipY: 0.05, bodyX: 0.05, bodyY: 0.15 }),
    voiced: true,
    src: "Open back, slightly rounded (Cruttenden 8.9.8; Roach 2.2)",
  },
  "ɔː": {
    pose: pose({ jaw: 0.42, round: 0.8, protrude: 0.6, upperTeeth: 0.3, lowerTeeth: 0, tipX: 0.36, tipY: 0.1, bodyX: 0.1, bodyY: 0.55 }),
    voiced: true,
    src: "Back, between close-mid and open-mid, medium rounding (Cruttenden 8.9.9; Roach 2.3)",
  },
  "ʊ": {
    pose: pose({ jaw: 0.25, round: 0.65, protrude: 0.4, upperTeeth: 0.4, lowerTeeth: 0.1, tipX: 0.38, tipY: 0.15, bodyX: 0.3, bodyY: 0.75 }),
    voiced: true,
    src: "Close-mid back centralised, lips closely but loosely rounded (Cruttenden 8.9.10; Roach 2.2)",
  },
  "uː": {
    pose: pose({ jaw: 0.15, round: 1, protrude: 0.85, upperTeeth: 0.2, lowerTeeth: 0, tipX: 0.36, tipY: 0.15, bodyX: 0.4, bodyY: 0.9 }),
    voiced: true,
    src: "Close back (fronted in modern RP), lips closely rounded (Cruttenden 8.9.11; Roach 2.3)",
  },
  "ɜː": {
    pose: pose({ jaw: 0.35, spread: 0.25, upperTeeth: 0.7, lowerTeeth: 0.4, tipX: 0.42, tipY: 0.15, bodyX: 0.5, bodyY: 0.5 }),
    voiced: true,
    src: "Central between close-mid and open-mid, lips neutral to spread (Cruttenden 8.9.12; Roach 2.3)",
  },
  "ə": {
    pose: pose({ jaw: 0.3, spread: 0.1, upperTeeth: 0.6, lowerTeeth: 0.3, tipX: 0.4, tipY: 0.15, bodyX: 0.5, bodyY: 0.45 }),
    voiced: true,
    src: "Central mid, lips relaxed and neutral (Cruttenden 8.9.13; Roach 2.4)",
  },
};

/** The open front start of aɪ and aʊ: further back and more open than æ (Cruttenden 8.10.2). */
const A_START = pose({ jaw: 0.85, spread: 0.25, upperTeeth: 0.6, lowerTeeth: 0.15, tipX: 0.4, tipY: 0.05, bodyX: 0.65, bodyY: 0.05 });
/** The open-mid front start of eə, opener than e (Cruttenden 8.10.7). */
const E_OPEN = pose({ jaw: 0.5, spread: 0.4, upperTeeth: 0.8, lowerTeeth: 0.35, tipX: 0.44, tipY: 0.15, bodyX: 0.85, bodyY: 0.45 });

/* ---- Diphthongs: Cruttenden 8.10, Roach ch. 4 --------------------------------------------- */

const D: Record<(typeof RP_DIPHTHONGS)[number], Shape> = {
  "eɪ": { pose: V.e.pose, to: V["ɪ"].pose, voiced: true, src: "Closing, front e to ɪ, lips spread throughout (Cruttenden 8.10.1; Roach 4.2)" },
  "aɪ": { pose: A_START, to: V["ɪ"].pose, voiced: true, src: "Closing, open front a to ɪ, lips neutral to loosely spread (Cruttenden 8.10.2; Roach 4.2)" },
  "ɔɪ": { pose: V["ɔː"].pose, to: V["ɪ"].pose, voiced: true, src: "Closing, rounded ɔ to spread ɪ (Cruttenden 8.10.3; Roach 4.2)" },
  "əʊ": { pose: { ...V["ə"].pose, round: 0.3, protrude: 0.2 }, to: V["ʊ"].pose, voiced: true, src: "Closing, central ə to ʊ, lips slightly rounded from the start, rounding on the glide (Cruttenden 8.10.4; Roach 4.2)" },
  "aʊ": { pose: A_START, to: V["ʊ"].pose, voiced: true, src: "Closing, open a to ʊ, lips rounding on the glide (Cruttenden 8.10.5; Roach 4.2)" },
  "ɪə": { pose: V["ɪ"].pose, to: V["ə"].pose, voiced: true, src: "Centring, ɪ to ə, lips neutral (Cruttenden 8.10.6; Roach 4.2)" },
  "eə": { pose: E_OPEN, to: V["ə"].pose, voiced: true, src: "Centring, open-mid ɛ to ə (often a long ɛː), lips neutral (Cruttenden 8.10.7; Roach 4.2)" },
  "ʊə": { pose: V["ʊ"].pose, to: V["ə"].pose, voiced: true, src: "Centring, rounded ʊ to ə (Cruttenden 8.10.8; Roach 4.2)" },
};

/* ---- Consonants: Cruttenden ch. 9, Roach ch. 5 to 8 --------------------------------------- */

/** The lips sealed, the tongue free in its neutral place. */
const BILABIAL = pose({ jaw: 0.08, close: 1, upperTeeth: 0, lowerTeeth: 0 });
const ALVEOLAR_STOP = pose({ jaw: 0.15, spread: 0.2, upperTeeth: 1, lowerTeeth: 0.8, tipX: 0.5, tipY: 1, bodyX: 0.6, bodyY: 0.6 });
const VELAR_STOP = pose({ jaw: 0.25, spread: 0.1, upperTeeth: 0.7, lowerTeeth: 0.4, tipX: 0.36, tipY: 0.1, bodyX: 0, bodyY: 1 });
const LABIODENTAL = pose({ jaw: 0.12, labiodental: 1, upperTeeth: 1, lowerTeeth: 0, tipX: 0.42, tipY: 0.2 });
const DENTAL = pose({ jaw: 0.2, interdental: 1, spread: 0.15, upperTeeth: 1, lowerTeeth: 0.8, tipX: 1, tipY: 0.55, bodyX: 0.6, bodyY: 0.5 });
const ALVEOLAR_FRICATIVE = pose({ jaw: 0.1, spread: 0.35, upperTeeth: 1, lowerTeeth: 1, tipX: 0.5, tipY: 0.85, bodyX: 0.6, bodyY: 0.6 });
/** ʃ ʒ: blade to the back of the ridge, front of the tongue raised; lips PROTRUDED and slightly
 *  rounded, teeth close together (Cruttenden 9.4.6: "lips somewhat rounded"; Roach 7.1). */
const POSTALVEOLAR = pose({ jaw: 0.15, round: 0.45, protrude: 0.95, upperTeeth: 1, lowerTeeth: 0.9, tipX: 0.42, tipY: 0.8, bodyX: 0.75, bodyY: 0.75 });
/** tʃ dʒ: the same lips, from a closure behind the ridge (Cruttenden 9.3.2; Roach 7.1). */
const POSTALVEOLAR_STOP = { ...POSTALVEOLAR, tipX: 0.46, tipY: 1 };

const C: Record<(typeof RP_CONSONANTS)[number], Shape> = {
  p: { pose: BILABIAL, voiced: false, src: "Bilabial plosive: lips sealed for the whole hold (Cruttenden 9.2.3; Roach 5.3)" },
  b: { pose: BILABIAL, voiced: true, src: "Bilabial plosive: lips sealed for the whole hold (Cruttenden 9.2.3; Roach 5.3)" },
  m: { pose: { ...BILABIAL, jaw: 0.05 }, voiced: true, src: "Bilabial nasal: lips sealed, air through the nose (Cruttenden 9.5.1; Roach 8.1)" },
  t: { pose: ALVEOLAR_STOP, voiced: false, src: "Alveolar plosive: tip on the ridge, teeth close (Cruttenden 9.2.4; Roach 5.3)" },
  d: { pose: ALVEOLAR_STOP, voiced: true, src: "Alveolar plosive: tip on the ridge, teeth close (Cruttenden 9.2.4; Roach 5.3)" },
  n: { pose: { ...ALVEOLAR_STOP, jaw: 0.18 }, voiced: true, src: "Alveolar nasal: tip on the ridge (Cruttenden 9.5.2; Roach 8.1)" },
  k: { pose: VELAR_STOP, voiced: false, src: "Velar plosive: back of the tongue on the soft palate (Cruttenden 9.2.5; Roach 5.3)" },
  g: { pose: VELAR_STOP, voiced: true, src: "Velar plosive: back of the tongue on the soft palate (Cruttenden 9.2.5; Roach 5.3)" },
  "ŋ": { pose: { ...VELAR_STOP, jaw: 0.22 }, voiced: true, src: "Velar nasal: back of the tongue on the soft palate (Cruttenden 9.5.3; Roach 8.1)" },
  f: { pose: LABIODENTAL, voiced: false, src: "Labiodental fricative: lower lip to the upper teeth (Cruttenden 9.4.1; Roach 6.2)" },
  v: { pose: LABIODENTAL, voiced: true, src: "Labiodental fricative: lower lip to the upper teeth (Cruttenden 9.4.1; Roach 6.2)" },
  "θ": { pose: DENTAL, voiced: false, src: "Dental fricative: tongue tip between or against the teeth (Cruttenden 9.4.2; Roach 6.2)" },
  "ð": { pose: DENTAL, voiced: true, src: "Dental fricative: tongue tip between or against the teeth (Cruttenden 9.4.2; Roach 6.2)" },
  s: { pose: ALVEOLAR_FRICATIVE, voiced: false, src: "Alveolar fricative: blade near the ridge, teeth close, lips spread a little (Cruttenden 9.4.5; Roach 6.2)" },
  z: { pose: ALVEOLAR_FRICATIVE, voiced: true, src: "Alveolar fricative: blade near the ridge, teeth close, lips spread a little (Cruttenden 9.4.5; Roach 6.2)" },
  "ʃ": { pose: POSTALVEOLAR, voiced: false, src: "Palato-alveolar fricative: lips protruded and slightly rounded (Cruttenden 9.4.6; Roach 6.2)" },
  "ʒ": { pose: POSTALVEOLAR, voiced: true, src: "Palato-alveolar fricative: lips protruded and slightly rounded (Cruttenden 9.4.6; Roach 6.2)" },
  h: { pose: pose({ jaw: 0.3 }), voiced: false, adapts: true, src: "Glottal fricative: the mouth is already set for the following vowel (Cruttenden 9.4.8; Roach 6.2)" },
  "tʃ": { pose: POSTALVEOLAR_STOP, to: POSTALVEOLAR, voiced: false, src: "Palato-alveolar affricate: closure, then ʃ release, lips protruded (Cruttenden 9.3.2; Roach 7.1)" },
  "dʒ": { pose: POSTALVEOLAR_STOP, to: POSTALVEOLAR, voiced: true, src: "Palato-alveolar affricate: closure, then ʒ release, lips protruded (Cruttenden 9.3.2; Roach 7.1)" },
  l: { pose: pose({ jaw: 0.25, spread: 0.1, upperTeeth: 0.9, lowerTeeth: 0.6, tipX: 0.5, tipY: 1, bodyX: 0.4, bodyY: 0.45 }), voiced: true, src: "Alveolar lateral: tip on the ridge, sides lowered (Cruttenden 9.6.1; Roach 8.2)" },
  r: { pose: pose({ jaw: 0.2, round: 0.45, protrude: 0.45, upperTeeth: 0.6, lowerTeeth: 0.3, tipX: 0.42, tipY: 0.65, bodyX: 0.45, bodyY: 0.5 }), voiced: true, src: "Post-alveolar approximant: tip raised behind the ridge, not touching, lips slightly rounded (Cruttenden 9.6.2; Roach 8.2)" },
  w: { pose: pose({ jaw: 0.1, round: 1, protrude: 0.9, upperTeeth: 0, lowerTeeth: 0, tipX: 0.36, tipY: 0.15, bodyX: 0.05, bodyY: 0.9 }), voiced: true, src: "Labial-velar approximant: lips closely rounded, back of the tongue raised as for uː (Cruttenden 9.7.2; Roach 8.2)" },
  j: { pose: pose({ jaw: 0.12, spread: 0.7, upperTeeth: 0.9, lowerTeeth: 0.8, tipX: 0.45, tipY: 0.3, bodyX: 1, bodyY: 1 }), voiced: true, src: "Palatal approximant: front of the tongue raised as for iː, lips spread (Cruttenden 9.7.1; Roach 8.2)" },
};

/** Every phoneme's shape. */
export const SHAPES: Record<string, Shape> = { ...V, ...D, ...C };

/* ---- Any IPA to the nearest RP phoneme --------------------------------------------------- */

/** Other symbols the voice may give (espeak's American English, older notations), as RP. */
const NEAREST: Record<string, string> = {
  i: "iː", u: "uː", "ɑ": "ɑː", "ɔ": "ɔː", "ɜ": "ɜː", o: "ɔː", "oː": "ɔː",
  "ɛ": "e", "ɛː": "eə", "ɛə": "eə", "eː": "eə", a: "æ", "aː": "ɑː", "ɐ": "ə", "ᵻ": "ɪ", "ɨ": "ɪ",
  "ʉ": "uː", "ʉː": "uː", y: "uː", "ɚ": "ə", "ɝ": "ɜː", "ɘ": "ə", "ɵ": "ə", "ɤ": "ʌ", "ʏ": "ʊ",
  "oʊ": "əʊ", "ɔʊ": "əʊ", "ɒʊ": "əʊ", "ɛɪ": "eɪ", "ʌɪ": "aɪ", "ɑɪ": "aɪ", "ɑʊ": "aʊ", "æʊ": "aʊ",
  "ɔə": "ɔː", "ʊɹ": "ʊə", "ɪɹ": "ɪə", "ɛɹ": "eə",
  "ɹ": "r", "ɻ": "r", "ɾ": "t", "ʔ": "t", "ɫ": "l", "ɬ": "l", "ɡ": "g", "ʧ": "tʃ", "ʤ": "dʒ",
  "ʍ": "w", x: "k", "ç": "h", "ɣ": "g", "ɦ": "h", "ɱ": "m", "ɲ": "n", "c": "k", "q": "k",
  "ts": "s", "dz": "z",
};

/** A first letter's nearest phoneme, for a symbol not known at all. */
const BY_FIRST: Record<string, string> = {
  "ʊ": "ʊ", "ɪ": "ɪ", "ə": "ə", "e": "e", "æ": "æ", "ʌ": "ʌ", "ɒ": "ɒ",
};

const LENGTH = /[ː:ˑ]/g;
/** Stress and tone marks, syllable dots, diacritics (combining marks), ties and brackets. */
const MARKS = /[ˈˌ.ˀʰʷʲ˞'"/\[\]()̀-ͯ͜͡-]/g;

/**
 * The nearest RP phoneme to an IPA symbol, or "" for nothing at all (a pause, an empty string).
 * Never throws; an unknown symbol becomes its nearest known one, else ə.
 */
export function rpPhoneme(raw: string | null | undefined): string {
  const text = (raw ?? "").replace(MARKS, "").trim();
  if (!text) return "";
  const long = /[ː:]/.test(text);
  const bare = text.replace(LENGTH, "");
  if (!bare) return "";
  const asLong = long ? `${bare}ː` : bare;
  if (asLong in SHAPES) return asLong;
  if (bare in SHAPES) return bare;
  if (asLong in NEAREST) return NEAREST[asLong]!;
  if (bare in NEAREST) return NEAREST[bare]!;
  // A longer run: its first two letters, then its first letter.
  const two = bare.slice(0, 2);
  if (two in SHAPES) return two;
  if (two in NEAREST) return NEAREST[two]!;
  const one = [...bare][0] ?? "";
  if (one in SHAPES) return long && `${one}ː` in SHAPES ? `${one}ː` : one;
  if (one in NEAREST) return NEAREST[one]!;
  return BY_FIRST[one] ?? "ə";
}

/** A phoneme's shape (any IPA, mapped to RP). */
export function shapeOf(p: string): Shape | null {
  const rp = rpPhoneme(p);
  return rp ? SHAPES[rp]! : null;
}

/** Whether a sound is voiced. */
export function isVoiced(p: string): boolean {
  return shapeOf(p)?.voiced ?? false;
}

/** Ease in and out, 0 to 1. */
export function smooth(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

/** Between two poses, by `k` (0 is `a`, 1 is `b`); `keys` limits which numbers move. */
export function mix(a: Pose, b: Pose, k: number, keys: (keyof Pose)[] = POSE_KEYS): Pose {
  const out = { ...a };
  for (const key of keys) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/**
 * A phoneme's pose `frac` of the way through it: a monophthong holds its pose; a diphthong
 * holds its first target for the first quarter, glides, and settles on the second for the last
 * fifth; an affricate holds its closure for the first third and releases into its fricative.
 */
export function poseOf(p: string, frac = 0.5): Pose {
  const shape = shapeOf(p);
  if (!shape) return REST;
  if (!shape.to) return shape.pose;
  const rp = rpPhoneme(p);
  const affricate = rp === "tʃ" || rp === "dʒ";
  const [from, until] = affricate ? [0.3, 0.55] : [0.25, 0.8];
  return mix(shape.pose, shape.to, smooth((frac - from) / (until - from)));
}
