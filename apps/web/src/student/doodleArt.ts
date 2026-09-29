/**
 * DOODLES V2: THE ART'S SHAPE BEFORE IT IS DRAWN (docs/plans/doodles-v2-contract.md).
 *
 * Pure geometry, shared by the layer that places a doodle (DoodleLayer.tsx: how much room it
 * needs) and the engine that draws and acts on it (doodleEngine.ts: where each thing goes):
 *
 * - A REPEAT GROUP is a community of small 40x40 figures, laid out in a row, a grid or a
 *   cluster. A `group` gathers the first n into a block on the left, looped and named; a
 *   `split` sends the first n to the left and the rest to the right. A gathered block that
 *   falls wholly on the left keeps together at the left side's inner edge, next to the right —
 *   so 42 students, 18 gathered as "both", split 32 | 10, read "Maths" (14, then the 18 both)
 *   and "Physics only"; a split that cuts through the gathered block breaks it up, its loop
 *   wiped away. Every arrangement the lesson will reach is known up front, so the picture
 *   is given room for the widest from the start and nothing jumps when it spreads.
 * - A STAGE is a doodle's next drawing. Where the later file keeps every element of the earlier
 *   one byte-identical and in order, and only appends, it is a BUILD-UP: only the new strokes
 *   are drawn.
 */

import type { LessonDoodleOp, LessonDoodleRef } from "./api.js";

/** A figure's cell in a repeat group, in the group's own units: the 40-unit figure and a gap. */
export const CELL = 44;
/** The band under a spread group for the names written beneath each block. */
export const NAME_BAND = 50;
/** The band over a group for the notes written above the figures they are about. */
export const NOTE_BAND = 34;
/** The band over a group for the numbers a count writes over each figure. */
export const COUNT_BAND = 24;
/** The actions that write a note by what they mark. */
const NOTED = new Set(["label", "circle", "highlight", "underline", "cross"]);
/** The gap between the blocks of a spread group. */
const BLOCK_GAP = CELL * 0.9;
/** Space round the whole group. */
const MARGIN = 6;

export type Layout = "row" | "grid" | "cluster";

/** A box in some SVG's units. */
export interface UBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where every figure of a group sits (its cell's top-left), and each block's box. */
export interface Arrangement {
  slots: [number, number][];
  /** The blocks, in the order the segments were given. */
  blocks: UBox[];
  width: number;
  height: number;
}

/** The size of a community: how many, and in what first layout. */
export interface RepeatShape {
  count: number;
  layout: Layout;
  /** The rows the blocks of a spread keep to. */
  rows: number;
  /** The whole picture, in units: wide enough for every arrangement the lesson reaches. */
  width: number;
  height: number;
  /** Whether it will be spread into named blocks (a band for the names is kept under it). */
  named: boolean;
  /** Whether notes are written over it (a band for them is kept above it). */
  noted: boolean;
  /** Whether it is counted (a band for the numbers is kept above it). */
  counted: boolean;
}

export function repeatCount(ref: Pick<LessonDoodleRef, "repeat">): number {
  const repeat = ref.repeat;
  if (Array.isArray(repeat)) return Math.min(50, repeat.reduce((sum, kind) => sum + Math.max(0, kind.n), 0));
  return typeof repeat === "number" ? Math.max(0, Math.min(50, Math.floor(repeat))) : 0;
}

function gridCols(count: number, layout: Layout): number {
  if (layout === "row") return Math.max(1, Math.min(count, 12));
  return Math.max(1, Math.ceil(Math.sqrt(count * 1.8)));
}

/** The first layout, before anything is gathered or split: cells from (0, 0). */
function firstLayout(count: number, layout: Layout): Arrangement {
  if (layout === "cluster") {
    // A sunflower's seeds: evenly packed, loosely round, with no two on top of each other.
    const step = CELL * 0.64;
    const radius = step * Math.sqrt(count) + CELL / 2;
    const slots: [number, number][] = [];
    for (let i = 0; i < count; i += 1) {
      const r = step * Math.sqrt(i + 0.5);
      const turn = i * 2.39996;
      slots.push([radius + r * Math.cos(turn) - CELL / 2, radius + r * Math.sin(turn) - CELL / 2]);
    }
    const xs = slots.map((s) => s[0]);
    const ys = slots.map((s) => s[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const moved = slots.map(([x, y]) => [x - minX, y - minY] as [number, number]);
    const width = Math.max(...xs) - minX + CELL;
    const height = Math.max(...ys) - minY + CELL;
    return { slots: moved, blocks: [{ x0: 0, y0: 0, x1: width, y1: height }], width, height };
  }
  const cols = gridCols(count, layout);
  const rows = Math.ceil(count / cols);
  const slots: [number, number][] = [];
  for (let i = 0; i < count; i += 1) slots.push([(i % cols) * CELL, Math.floor(i / cols) * CELL]);
  return {
    slots,
    blocks: [{ x0: 0, y0: 0, x1: cols * CELL, y1: rows * CELL }],
    width: cols * CELL,
    height: rows * CELL,
  };
}

/** The rows a spread keeps to: as many as the first layout had, so the picture keeps its height. */
function spreadRows(count: number, layout: Layout): number {
  if (layout === "cluster") return Math.max(1, Math.ceil(Math.sqrt(count / 1.8)));
  return Math.max(1, Math.ceil(count / gridCols(count, layout)));
}

/**
 * Blocks side by side, each filled row by row, `rows` high: the member at each place. `sides`
 * says which side of a split each block is on: blocks on one side sit closer together.
 */
export function blocksLayout(segments: number[][], rows: number, sides?: number[]): Arrangement {
  const slots: [number, number][] = [];
  const blocks: UBox[] = [];
  let x = 0;
  let height = 0;
  segments.forEach((members, index) => {
    if (index > 0) x += sides && sides[index] === sides[index - 1] ? CELL * 0.35 : BLOCK_GAP;
    const cols = Math.max(1, Math.ceil(members.length / rows));
    const used = Math.ceil(members.length / cols);
    members.forEach((member, k) => {
      slots[member] = [x + (k % cols) * CELL, Math.floor(k / cols) * CELL];
    });
    blocks.push({ x0: x, y0: 0, x1: x + cols * CELL, y1: used * CELL });
    height = Math.max(height, used * CELL);
    x += cols * CELL;
  });
  return { slots, blocks, width: x, height };
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** A spread: its blocks left to right, the side each is on (0 left, 1 right), and which block
 * is the gathered one (null where there is none, or a split has broken it up). */
export interface Spread {
  segments: number[][];
  sides: number[];
  gatheredAt: number | null;
}

/**
 * The arrangement a group is in after its first `gathered` figures have been gathered and the
 * first `split` sent left (null: not split). Null for neither.
 */
export function segmentsOf(count: number, gathered: number, split: number | null): Spread | null {
  if (split !== null) {
    if (gathered > 0 && split >= gathered) {
      // The gathered block is all on the left: it keeps together at the left's inner edge.
      const rest = range(gathered, split);
      const segments = rest.length ? [rest, range(0, gathered), range(split, count)] : [range(0, gathered), range(split, count)];
      const sides = rest.length ? [0, 0, 1] : [0, 1];
      return { segments, sides, gatheredAt: rest.length ? 1 : 0 };
    }
    return { segments: [range(0, split), range(split, count)], sides: [0, 1], gatheredAt: null };
  }
  if (gathered > 0) return { segments: [range(0, gathered), range(gathered, count)], sides: [0, 1], gatheredAt: 0 };
  return null;
}

/**
 * Every arrangement a group goes through as the lesson's actions reach it, the first included.
 * `ops` is this group's actions in the order the lesson plays them.
 */
export function arrangements(
  count: number,
  layout: Layout,
  ops: Pick<LessonDoodleOp, "op" | "n">[],
): Arrangement[] {
  const out = [firstLayout(count, layout)];
  const rows = spreadRows(count, layout);
  let gathered = 0;
  for (const op of ops) {
    const n = Math.max(1, Math.floor(op.n ?? 0));
    if (op.op === "group") {
      gathered = Math.min(count, n);
      const spread = segmentsOf(count, gathered, null)!;
      out.push(blocksLayout(spread.segments, rows, spread.sides));
    } else if (op.op === "split") {
      const spread = segmentsOf(count, gathered, Math.min(n, Math.max(1, count - 1)))!;
      out.push(blocksLayout(spread.segments, rows, spread.sides));
      if (spread.gatheredAt === null) gathered = 0;
    }
  }
  return out;
}

/** A community's whole size, room for every arrangement it reaches, and how it is centred. */
export function repeatShape(
  ref: LessonDoodleRef,
  ops: Pick<LessonDoodleOp, "op" | "n" | "text">[],
): RepeatShape {
  const count = repeatCount(ref);
  const layout: Layout = ref.layout === "row" || ref.layout === "cluster" ? ref.layout : "grid";
  const all = arrangements(count, layout, ops);
  const named = ops.some((op) => op.op === "group" || op.op === "split");
  const counted = ops.some((op) => op.op === "count");
  const noted = ops.some((op) => NOTED.has(op.op) && Boolean(op.text));
  return {
    count,
    layout,
    rows: spreadRows(count, layout),
    width: Math.max(...all.map((a) => a.width)) + MARGIN * 2,
    height:
      Math.max(...all.map((a) => a.height)) +
      MARGIN * 2 +
      (named ? NAME_BAND : 0) +
      (noted ? NOTE_BAND : 0) +
      (counted ? COUNT_BAND : 0),
    named,
    noted,
    counted,
  };
}

/** An arrangement placed in the whole picture: centred across it, from its top margin. */
export function placed(arrangement: Arrangement, shape: RepeatShape): Arrangement {
  const dx = (shape.width - arrangement.width) / 2;
  const top = MARGIN + (shape.noted ? NOTE_BAND : 0) + (shape.counted ? COUNT_BAND : 0);
  const dy = top + (shape.height - top - MARGIN - (shape.named ? NAME_BAND : 0) - arrangement.height) / 2;
  return {
    slots: arrangement.slots.map(([x, y]) => [x + dx, y + dy]),
    blocks: arrangement.blocks.map((b) => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy })),
    width: arrangement.width,
    height: arrangement.height,
  };
}

/** The markup between a file's <svg ...> and </svg>, and its viewBox. */
function inner(svg: string): { body: string; box: string } | null {
  const open = /<svg\b[^>]*>/i.exec(svg);
  const close = svg.lastIndexOf("</svg>");
  if (!open || close < 0) return null;
  const box = /\bviewBox="([^"]*)"/.exec(open[0])?.[1]?.trim() ?? "";
  return { body: svg.slice(open.index + open[0].length, close).trim(), box };
}

/**
 * Whether `next` builds up `last`: the same viewBox, and every element of `last`, byte for byte
 * and in order, then more.
 */
export function buildsUp(last: string, next: string): boolean {
  const a = inner(last);
  const b = inner(next);
  if (!a || !b || a.box !== b.box || !a.body) return false;
  return b.body.length > a.body.length && b.body.startsWith(a.body);
}

/** An art's viewBox as numbers ([x, y, w, h]); 120 square where it has none. */
export function viewBoxOf(svg: string): [number, number, number, number] {
  const found = /<svg\b[^>]*\bviewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i.exec(svg);
  if (!found) return [0, 0, 120, 120];
  const [x, y, w, h] = found.slice(1).map(Number) as [number, number, number, number];
  return w > 0 && h > 0 ? [x, y, w, h] : [0, 0, 120, 120];
}

/** How many characters of the handwriting go to a line in `px` of room, at 17px. */
export function charsIn(px: number): number {
  return Math.max(8, Math.floor(px / 7.4));
}

/** Words broken into lines of at most `most` characters, at spaces. */
export function wrapWords(text: string, most: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > most) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}
