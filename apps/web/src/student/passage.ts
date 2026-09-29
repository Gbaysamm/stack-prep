/**
 * THE PASSAGE AS THE BOARD READS IT: finding a piece of it, its cloze gaps, and the quotes on a
 * line of the working that come from it. Pure text in, positions out; PassagePanel.tsx draws.
 *
 * A mark names its words as they read in the passage (`target`), matched the way the loader
 * checks them (database/lesson_marks.py, `norm_passage`): whitespace runs are one space, the
 * spaces round a dash do not count, and curly and straight quotes, apostrophes and every dash
 * read the same. Where the words occur more than once, `nth` (from 1) picks which.
 */

const SAME: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "`": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "―": "-",
  "−": "-",
  "…": "...",
  " ": " ",
};

/** Text as it is matched, and for each of its characters the place in the source it came from. */
export interface Folded {
  text: string;
  from: number[];
}

/** The passage (or a target) folded for matching, keeping where each character came from. */
export function foldPassage(source: string): Folded {
  let text = "";
  const from: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const mapped = SAME[source.charAt(i)] ?? source.charAt(i);
    for (const ch of mapped) {
      const last = text.charAt(text.length - 1);
      if (/\s/.test(ch)) {
        // One space for a run of them, none at the start, and none after a dash.
        if (text === "" || last === " " || last === "-") continue;
        text += " ";
        from.push(i);
      } else if (ch === "-" && last === " ") {
        // No space before a dash either: "ectodermic — they" reads as "ectodermic-they".
        text = text.slice(0, -1) + "-";
        from[from.length - 1] = i;
      } else {
        text += ch;
        from.push(i);
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    from.pop();
  }
  return { text, from };
}

/** The target as it is looked for. */
export function normPassage(text: string): string {
  return foldPassage(text).text;
}

/**
 * Where the `nth` occurrence of `target` is in the passage, as source offsets [start, end), or
 * null where it is not there. `loose` also ignores case (for the quotes the board finds itself;
 * a lesson's own marks are matched exactly, as the loader checked them).
 */
export function findInPassage(
  folded: Folded,
  target: string,
  nth = 1,
  loose = false,
): [number, number] | null {
  const needle = normPassage(target);
  if (!needle) return null;
  const hay = loose ? folded.text.toLowerCase() : folded.text;
  const look = loose ? needle.toLowerCase() : needle;
  let at = -1;
  let from = 0;
  for (let n = 0; n < Math.max(1, nth); n += 1) {
    at = hay.indexOf(look, from);
    if (at < 0) return null;
    from = at + look.length;
  }
  const start = folded.from[at];
  const last = folded.from[at + look.length - 1];
  if (start === undefined || last === undefined) return null;
  return [start, last + 1];
}

/** A cloze gap as the passages print it: ___(16)___. */
export const GAP = /_{2,}\s*\(\s*(\d{1,3})\s*\)\s*_*/g;

/** The gap a cloze question asks about, from its stem ("Gap 16"), or null. */
export function gapOf(stem: string): number | null {
  const found = /^\s*gap\s*(\d{1,3})\b/i.exec(stem);
  return found ? Number(found[1]) : null;
}

/** One paragraph of the passage, as runs of text and gaps, each with where it starts. */
export type Token =
  | { kind: "text"; text: string; start: number }
  | { kind: "gap"; n: number; raw: string; start: number };

/** The passage's paragraphs (a line break starts one), each as its text and gaps. */
export function paragraphs(body: string): Token[][] {
  const out: Token[][] = [];
  const para = /[^\n]+/g;
  for (let m = para.exec(body); m; m = para.exec(body)) {
    const line = m[0];
    if (!line.trim()) continue;
    const base = m.index;
    const tokens: Token[] = [];
    let last = 0;
    GAP.lastIndex = 0;
    for (let g = GAP.exec(line); g; g = GAP.exec(line)) {
      if (g.index > last) tokens.push({ kind: "text", text: line.slice(last, g.index), start: base + last });
      tokens.push({ kind: "gap", n: Number(g[1]), raw: g[0], start: base + g.index });
      last = g.index + g[0].length;
    }
    if (last < line.length) tokens.push({ kind: "text", text: line.slice(last), start: base + last });
    out.push(tokens);
  }
  return out;
}

/**
 * THE QUOTES ON A LINE OF WORKING that come from the passage: a span in double quotes, curly or
 * straight, or in single quotes where they are not apostrophes. A quote cut with an ellipsis or
 * a gap ("… ___ who go out and collect stories") is looked for a piece at a time, and only
 * pieces long enough to mean something (two words, or eight letters) are kept.
 */
export function quotedPieces(line: string): string[] {
  const spans: string[] = [];
  const double = /[“"]([^“”"]{3,}?)[”"]/g;
  for (let m = double.exec(line); m; m = double.exec(line)) spans.push(m[1]!);
  const single = /(?:^|[\s(])[‘']([^‘’']{3,}?)[’'](?=$|[\s),.;:!?])/g;
  for (let m = single.exec(line); m; m = single.exec(line)) spans.push(m[1]!);
  const pieces: string[] = [];
  for (const span of spans)
    for (const raw of span.split(/\.{3,}|…|_{2,}(?:\s*\(\s*\d+\s*\)\s*_*)?/)) {
      const piece = raw.replace(/^[\s.,;:!?*]+|[\s.,;:!?*]+$/g, "").replace(/\*/g, "");
      if (piece.split(/\s+/).length >= 2 || piece.length >= 8) pieces.push(piece);
    }
  return pieces;
}
