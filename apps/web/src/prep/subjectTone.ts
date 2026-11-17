/**
 * Each subject's own colour (founder, 17 Nov 2026: pages were too plain, all white and purple).
 * A subject keeps its colour everywhere it appears: the Subjects page, the Exams page.
 */

export interface Tone {
  /** The strong colour: tiles, bars. */
  main: string;
  /** A soft wash: card bands. */
  soft: string;
  /** Text on the soft wash. */
  ink: string;
}

const TONES: Record<string, Tone> = {
  yellow: { main: '#ffd84a', soft: '#fff7d1', ink: '#5a4600' },
  green: { main: '#8fe36b', soft: '#ecfbe3', ink: '#1f5c14' },
  pink: { main: '#ff8fb1', soft: '#ffe9f0', ink: '#8f1238' },
  blue: { main: '#7cb4ff', soft: '#e8f1ff', ink: '#123d7a' },
  orange: { main: '#ffb066', soft: '#fff0e0', ink: '#7a3d00' },
  teal: { main: '#5fd6c4', soft: '#e3f8f5', ink: '#0d5a50' },
  lilac: { main: '#c4a2ff', soft: '#f3ebff', ink: '#4a1a99' },
};

/** The usual subjects keep a fixed colour; any other takes one from its name. */
const BY_NAME: Record<string, keyof typeof TONES> = {
  'use of english': 'yellow',
  english: 'yellow',
  'english language': 'yellow',
  biology: 'green',
  chemistry: 'pink',
  physics: 'blue',
  mathematics: 'orange',
  economics: 'teal',
  government: 'lilac',
  literature: 'lilac',
  'literature in english': 'lilac',
  commerce: 'teal',
  accounting: 'orange',
  'principles of accounts': 'orange',
};

const ORDER = Object.keys(TONES);

export function toneOf(subjectName: string): Tone {
  const key = BY_NAME[subjectName.trim().toLowerCase()];
  if (key) return TONES[key]!;
  let hash = 0;
  for (const ch of subjectName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[ORDER[hash % ORDER.length]!]!;
}

/** Two letters for a subject's tile: "Use of English" → "En", "Chemistry" → "Ch". */
export function initials(subjectName: string): string {
  const words = subjectName.split(/\s+/).filter((w) => !['of', 'and', 'the', 'in'].includes(w.toLowerCase()));
  const main = /english/i.test(subjectName) ? 'English' : (words[0] ?? subjectName);
  return main.slice(0, 2);
}

/** The colours as CSS custom properties, for a card's style. */
export function toneStyle(subjectName: string): Record<string, string> {
  const tone = toneOf(subjectName);
  return { '--c': tone.main, '--c-soft': tone.soft, '--c-ink': tone.ink };
}
