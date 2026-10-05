/**
 * THE DIVISION LADDER (section 9, `kind: ladder`): the Nigerian exercise-book layout for
 * repeated division, written as a student writes it.
 *
 *   2 | 39
 *   2 | 19   R 1   ↑
 *   2 |  9   R 1   ↑
 *     |  …
 *     |  0   R 1   ↑      ∴ 39₁₀ = 100111₂
 *
 * Three modes, each with its rows COMPUTED from the numbers (never typed):
 *
 * - `divisor` (base ten to base n): `{divisor: 2, number: 39}`. Each row is the quotient with
 *   its remainder ("R 1") on the same line, down to 0; `read` draws the arrow up the remainders
 *   and writes the result with its bases.
 * - `factors`: `{mode: factors, number: 360}`. Each row is divided by its smallest prime, down to
 *   1; `read` writes the number as the product of the primes (and in index form).
 * - `lcm`: `{mode: lcm, numbers: [12, 18, 30], find?: lcm|hcf|both}`. The numbers sit on one row;
 *   the primes they all share go first (those rows give the HCF), then any prime that divides
 *   one of them, a number it does not divide carried down unchanged, until every one is 1.
 *   `find: hcf` stops when they share no prime. `read` writes the LCM and/or the HCF.
 *
 * Arriving, the pen writes the top line (the divisor, the bar, the number). Actions: `step`
 * (the next row, or `n` rows; a tick each in the whiteboard style) and `read` (a ding). Parts:
 * 'row:0' or 'number' (the top line), 'row:1'… (each row the steps write), 'divisors' (the
 * column left of the bar), 'remainders' (divisor mode) and 'result' once read.
 */

import type { LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  INK,
  NOTE,
  PALETTE,
  areaGlow,
  el,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
  type Part,
  type TextOptions,
  type UBox,
} from "../engine.js";
import { head, line, loop, poly } from "../rough.js";

const SIZE = 23;
const ROW = 38;
const PAD = 18;
/** A digit's width in the hand, at SIZE (a little over, as the columns are right-aligned). */
const DIGIT = SIZE * 0.5;
const RESULT_SIZE = 22;
const RESULT_ROW = 34;
const MIN_W = 300;

export type LadderMode = "divisor" | "factors" | "lcm";
export type LadderFind = "lcm" | "hcf" | "both";

/** One line of the ladder: the numbers on it, the divisor written left of its bar, and (divisor
 * mode) the remainder that came with them. */
export interface Rung {
  values: number[];
  divisor: number | null;
  remainder: number | null;
  /** lcm mode: its divisor divides every number on the line (it goes into the HCF). */
  common: boolean;
}

function smallestPrime(n: number): number {
  for (let p = 2; p * p <= n; p += 1) if (n % p === 0) return p;
  return n;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function ladderMode(spec: LessonDiagram): LadderMode {
  if (spec.mode === "factors" || spec.mode === "lcm" || spec.mode === "divisor") return spec.mode;
  return spec.numbers?.length ? "lcm" : "divisor";
}

function findOf(spec: LessonDiagram): LadderFind {
  return spec.find === "hcf" || spec.find === "both" ? spec.find : "lcm";
}

/** The lcm ladder's next divisor: a prime all the numbers share, else (finding the LCM) the
 * smallest prime that divides any of them. */
function nextShared(values: number[], find: LadderFind): { divisor: number | null; common: boolean } {
  const live = values.filter((v) => v > 1);
  if (!live.length) return { divisor: null, common: false };
  // The smallest prime dividing all of them: the smallest prime of their HCF.
  const shared = values.reduce(gcd);
  if (shared > 1) return { divisor: smallestPrime(shared), common: true };
  if (find === "hcf") return { divisor: null, common: false };
  return { divisor: Math.min(...live.map(smallestPrime)), common: false };
}

/** Every line of the ladder, the top one first, worked out from the description. */
export function ladderRungs(spec: LessonDiagram): Rung[] {
  const mode = ladderMode(spec);
  const rungs: Rung[] = [];
  const most = 14;
  if (mode === "divisor") {
    const base = Math.round(spec.divisor ?? 2);
    let n = Math.round(spec.number ?? 0);
    if (base < 2 || n < 1) return [{ values: [Math.max(0, n)], divisor: null, remainder: null, common: false }];
    rungs.push({ values: [n], divisor: base, remainder: null, common: false });
    while (n > 0 && rungs.length <= most) {
      const r = n % base;
      n = Math.floor(n / base);
      rungs.push({ values: [n], divisor: n > 0 ? base : null, remainder: r, common: false });
    }
    return rungs;
  }
  if (mode === "factors") {
    let n = Math.round(spec.number ?? 0);
    if (n < 2) return [{ values: [Math.max(0, n)], divisor: null, remainder: null, common: false }];
    rungs.push({ values: [n], divisor: smallestPrime(n), remainder: null, common: false });
    while (n > 1 && rungs.length <= most) {
      n /= smallestPrime(n);
      rungs.push({ values: [n], divisor: n > 1 ? smallestPrime(n) : null, remainder: null, common: false });
    }
    return rungs;
  }
  const find = findOf(spec);
  let values = (spec.numbers ?? []).map((v) => Math.round(v));
  if (values.length < 1 || values.some((v) => v < 1)) return [{ values, divisor: null, remainder: null, common: false }];
  let next = nextShared(values, find);
  rungs.push({ values, divisor: next.divisor, remainder: null, common: next.common });
  while (next.divisor && rungs.length <= most) {
    const p = next.divisor;
    values = values.map((v) => (v % p === 0 ? v / p : v));
    next = nextShared(values, find);
    rungs.push({ values, divisor: next.divisor, remainder: null, common: next.common });
  }
  return rungs;
}

/** A run of words, some raised (an index) or lowered (a base). */
interface Seg {
  t: string;
  sub?: boolean;
  sup?: boolean;
}

const plain = (t: string): Seg => ({ t });
const sub = (t: string): Seg => ({ t, sub: true });
const sup = (t: string): Seg => ({ t, sup: true });

/** The result's lines, as the board writes them (and the same words, flat, for its note). */
function resultLines(spec: LessonDiagram, rungs: Rung[]): Seg[][] {
  const mode = ladderMode(spec);
  const top = rungs[0]!;
  if (mode === "divisor") {
    const digits = rungs
      .slice(1)
      .map((r) => r.remainder ?? 0)
      .reverse()
      .join("");
    return [[plain("∴ "), plain(String(top.values[0])), sub("10"), plain(" = "), plain(digits), sub(String(spec.divisor ?? ""))]];
  }
  const divisors = rungs.map((r) => r.divisor).filter((d): d is number => d !== null);
  const times = (list: number[]) => list.join(" × ");
  const indexForm = (list: number[]): Seg[] => {
    const counts = new Map<number, number>();
    for (const p of list) counts.set(p, (counts.get(p) ?? 0) + 1);
    const out: Seg[] = [];
    [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([p, k], i) => {
        out.push(plain(`${i ? " × " : ""}${p}`));
        if (k > 1) out.push(sup(String(k)));
      });
    return out;
  };
  if (mode === "factors") {
    const lines: Seg[][] = [[plain(`∴ ${top.values[0]} = ${times(divisors)}`)]];
    if (new Set(divisors).size < divisors.length) lines.push([plain("= "), ...indexForm(divisors)]);
    return lines;
  }
  const find = findOf(spec);
  const lines: Seg[][] = [];
  const common = rungs.filter((r) => r.common && r.divisor).map((r) => r.divisor!);
  if (find !== "lcm") {
    const hcf = common.reduce((a, b) => a * b, 1);
    lines.push([plain(common.length > 1 ? `HCF = ${times(common)} = ${hcf}` : `HCF = ${hcf}`)]);
  }
  if (find !== "hcf") {
    const lcm = divisors.reduce((a, b) => a * b, 1);
    const product = `LCM = ${times(divisors)}`;
    if (product.length > 26) lines.push([plain(product)], [plain(`= ${lcm}`)]);
    else lines.push([plain(`${product} = ${lcm}`)]);
  }
  return lines;
}

const flat = (segs: Seg[]) => segs.map((s) => s.t).join("");

/** The ladder's columns, in its own units. */
interface Layout {
  divRight: number;
  barX: number;
  /** Each number column's right edge. */
  cols: number[];
  remX: number;
  arrowX: number;
  right: number;
  y0: number;
}

function layoutOf(spec: LessonDiagram, rungs: Rung[]): Layout {
  const mode = ladderMode(spec);
  const divDigits = Math.max(1, ...rungs.map((r) => String(r.divisor ?? "").length));
  const divRight = PAD + divDigits * DIGIT + 4;
  const barX = divRight + 12;
  const count = rungs[0]?.values.length ?? 1;
  const cols: number[] = [];
  let x = barX + 10;
  for (let c = 0; c < count; c += 1) {
    const digits = Math.max(1, ...rungs.map((r) => String(r.values[c] ?? "").length));
    x += (c ? 24 : 4) + digits * DIGIT;
    cols.push(x);
  }
  const last = cols[cols.length - 1] ?? x;
  const remX = last + 22;
  const arrowX = remX + (mode === "divisor" ? 50 : 0);
  const right = mode === "divisor" ? arrowX + 10 : last + 6;
  return { divRight, barX, cols, remX, arrowX, right, y0: PAD };
}

function readPlanned(plan: LessonDiagramOp[]): boolean {
  return plan.some((op) => op.op === "read");
}

function view(spec: LessonDiagram, plan: LessonDiagramOp[] = []): [number, number] {
  const rungs = ladderRungs(spec);
  const lay = layoutOf(spec, rungs);
  let w = Math.max(MIN_W, lay.right + PAD + 60);
  let h = lay.y0 + rungs.length * ROW + PAD;
  if (readPlanned(plan)) {
    const lines = resultLines(spec, rungs);
    const widest = Math.max(...lines.map((l) => flat(l).length));
    w = Math.max(w, PAD * 2 + widest * RESULT_SIZE * 0.47);
    h += 10 + lines.length * RESULT_ROW;
  }
  return [Math.round(w), Math.round(h)];
}

class Ladder implements Kind {
  mode: LadderMode;
  rungs: Rung[];
  lay: Layout;
  /** How many rows the steps have written (the top line is row 0). */
  stepped = 0;
  read = false;
  remBox: UBox | null = null;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    this.mode = ladderMode(spec);
    this.rungs = ladderRungs(spec);
    this.lay = layoutOf(spec, this.rungs);
  }

  private mid(k: number): number {
    return this.lay.y0 + k * ROW + ROW / 2;
  }

  private rowBox(k: number): UBox {
    return { x0: PAD - 6, y0: this.lay.y0 + k * ROW + 2, x1: this.lay.right + 4, y1: this.lay.y0 + (k + 1) * ROW - 2 };
  }

  private rect(b: UBox): string {
    return poly(
      [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x1, b.y1],
        [b.x0, b.y1],
      ],
      true,
    );
  }

  /** Words with raised or lowered pieces, in one <text> the pen writes left to right. */
  private rich(x: number, y: number, segs: Seg[], opts: TextOptions): SVGTextElement {
    const size = opts.size ?? SIZE;
    const text = this.e.text(this.e.words, x, y, "", opts);
    let shift = 0;
    for (const seg of segs) {
      const want = seg.sub ? 0.3 : seg.sup ? -0.45 : 0;
      const span = el("tspan", {}, text);
      const dy = (want - shift) * size;
      if (Math.abs(dy) > 0.01) span.setAttribute("dy", dy.toFixed(1));
      if (seg.sub || seg.sup) span.setAttribute("font-size", String(Math.round(size * 0.62)));
      span.textContent = seg.t;
      shift = want;
    }
    return text;
  }

  /** The bar beside row k: one stroke from the row's top to its bottom, so the rows join up. */
  private bar(k: number): SVGPathElement {
    const top = this.lay.y0 + k * ROW + (k === 0 ? 5 : 0);
    const last = k === this.rungs.length - 1;
    const bottom = this.lay.y0 + (k + 1) * ROW - (last ? 6 : 0);
    return this.e.stroke(this.e.ink, line([this.lay.barX, top], [this.lay.barX, bottom], this.e.rnd(`bar${k}`), 0), { width: 2.6 });
  }

  private numbers(k: number): SVGTextElement[] {
    const rung = this.rungs[k]!;
    return rung.values.map((v, c) =>
      this.e.text(this.e.words, this.lay.cols[c]!, this.mid(k), String(v), { size: SIZE, anchor: "end", weight: 600 }),
    );
  }

  private divisorText(k: number): SVGTextElement | null {
    const d = this.rungs[k]!.divisor;
    if (d === null) return null;
    return this.e.text(this.e.words, this.lay.divRight, this.mid(k), String(d), { size: SIZE, anchor: "end", weight: 600 });
  }

  private remainderText(k: number): SVGTextElement | null {
    const r = this.rungs[k]!.remainder;
    if (r === null) return null;
    return this.e.text(this.e.words, this.lay.remX, this.mid(k), `R ${r}`, { size: SIZE, anchor: "start", weight: 600 });
  }

  /** What row k says, in words. */
  private rowInfo(k: number): string {
    const rung = this.rungs[k]!;
    const vals = rung.values.join(", ");
    if (k === 0) return rung.divisor ? `${vals}, divided by ${rung.divisor}` : vals;
    const before = this.rungs[k - 1]!;
    const p = before.divisor;
    if (this.mode === "divisor") return `${before.values[0]} ÷ ${p} = ${rung.values[0]} remainder ${rung.remainder}`;
    if (this.mode === "factors") return `${before.values[0]} ÷ ${p} = ${rung.values[0]}`;
    return `${before.values.join(", ")} ÷ ${p} → ${vals}${before.common ? ` (${p} divides them all)` : ""}`;
  }

  private setRowPart(k: number) {
    const b = this.rowBox(k);
    const name = `row:${k}`;
    const anchor: Pt = [this.mode === "divisor" ? this.lay.remX + 40 : this.lay.right + 2, this.mid(k)];
    this.e.parts.set(name, { name, info: this.rowInfo(k), anchor, box: b, glow: areaGlow(this.rect(b)) });
  }

  /** The divisor column and the remainder column, as far as they are written. */
  private setColumns() {
    const withDivisor = this.rungs.slice(0, this.stepped + 1).filter((r) => r.divisor !== null);
    const lastDiv = this.rungs.slice(0, this.stepped + 1).reduce((at, r, k) => (r.divisor !== null ? k : at), 0);
    const db: UBox = {
      x0: PAD - 6,
      y0: this.lay.y0 + 2,
      x1: this.lay.barX - 4,
      y1: this.lay.y0 + (lastDiv + 1) * ROW - 2,
    };
    this.e.parts.set("divisors", {
      name: "divisors",
      info: `divided by ${withDivisor.map((r) => r.divisor).join(", ")}`,
      anchor: [db.x0, db.y0 + 6],
      box: db,
      glow: areaGlow(this.rect(db)),
      quiet: true,
    });
    if (this.mode !== "divisor" || this.stepped < 1) return;
    const rb: UBox = {
      x0: this.lay.remX - 5,
      y0: this.lay.y0 + ROW + 3,
      x1: this.lay.remX + 38,
      y1: this.lay.y0 + (this.stepped + 1) * ROW - 3,
    };
    this.remBox = rb;
    const rems = this.rungs
      .slice(1, this.stepped + 1)
      .map((r) => r.remainder)
      .reverse();
    this.e.parts.set("remainders", {
      name: "remainders",
      info: `the remainders, from the bottom up: ${rems.join(", ")}`,
      anchor: [rb.x1, rb.y0 + 8],
      box: rb,
      glow: areaGlow(this.rect(rb)),
      quiet: true,
    });
  }

  partFor(name: string): Part | null {
    const n = name.trim().toLowerCase();
    if (n === "number" || n === "top") return this.e.parts.get("row:0") ?? null;
    if (n === "divisor") return this.e.parts.get("divisors") ?? null;
    if (n === "remainder") return this.e.parts.get("remainders") ?? null;
    return this.e.parts.get(n) ?? null;
  }

  drawIn(): Build {
    const div = this.divisorText(0);
    const bar = this.bar(0);
    const nums = this.numbers(0);
    for (const t of [div, ...nums]) if (t) this.e.keep(t);
    this.setRowPart(0);
    this.setColumns();
    return { items: this.e.plan([div], [bar], nums) };
  }

  /** Row k's strokes and words, in the order a hand writes them: the bar down beside it, the
   * quotient (and its remainder), then the divisor for the next division. */
  private rowGroups(k: number): SVGGraphicsElement[][] {
    const bar = this.bar(k);
    const nums = this.numbers(k);
    const rem = this.remainderText(k);
    const div = this.divisorText(k);
    for (const t of [...nums, rem, div]) if (t) this.e.keep(t);
    return [[bar], [...nums, rem].filter(Boolean) as SVGGraphicsElement[], [div].filter(Boolean) as SVGGraphicsElement[]];
  }

  private stepRows(n: number): { items: Build["items"]; ticks: number[] } {
    const items: Build["items"] = [];
    const ticks: number[] = [];
    for (let i = 0; i < n && this.stepped < this.rungs.length - 1; i += 1) {
      this.stepped += 1;
      ticks.push(items.length);
      items.push(...this.e.plan(...this.rowGroups(this.stepped)));
      this.setRowPart(this.stepped);
    }
    this.setColumns();
    return { items, ticks };
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "step": {
        const n = Math.max(1, Math.round(op.n ?? 1));
        const { items, ticks } = this.stepRows(n);
        // A tick as each row starts (the whiteboard's sound; none when shown at once).
        ticks.forEach((at) => {
          const item = items[at];
          if (item) items[at] = this.e.withSound(item, "tick");
        });
        return { items, totalMs: Math.max(1800, 1000 * ticks.length), sfx: null };
      }
      case "read":
        return this.readOut(op);
      default:
        return null;
    }
  }

  private readOut(op: LessonDiagramOp): Build {
    // Anything not yet written is written first (the loader allows a read only at the end).
    const rest = this.stepRows(this.rungs.length);
    const groups: SVGGraphicsElement[][] = [];
    const colour = op.answer ? PALETTE.green.stroke : op.colour ? PALETTE[op.colour].stroke : INK;
    const last = this.rungs.length - 1;
    if (this.mode === "divisor" && last >= 1) {
      // The arrow up the remainders, from the last row to the first.
      const x = this.lay.arrowX;
      const from: Pt = [x, this.mid(last) + 8];
      const to: Pt = [x, this.mid(1) - 10];
      const shaft = this.e.stroke(this.e.marks, line(from, to, this.e.rnd("readup"), 0), { colour: NOTE, width: 2.6 });
      const tip = this.e.stroke(this.e.marks, head(to, [x, to[1] + 10], 10), { colour: NOTE, width: 2.6 });
      groups.push([shaft], [tip]);
      for (let k = 1; k <= last; k += 1) this.e.inked.push([x, this.mid(k)]);
    }
    if (this.mode === "lcm" && findOf(this.spec) === "both") {
      // The shared divisors ringed: their product is the HCF.
      const rings: SVGGraphicsElement[] = [];
      this.rungs.forEach((r, k) => {
        if (!r.common || r.divisor === null) return;
        const cx = this.lay.divRight - (String(r.divisor).length * DIGIT) / 2;
        rings.push(
          this.e.stroke(this.e.marks, loop(cx, this.mid(k), String(r.divisor).length * DIGIT * 0.5 + 7, 15, this.e.rnd(`ring${k}`)), {
            colour: PALETTE.pink.stroke,
            width: 2.2,
          }),
        );
      });
      if (rings.length) groups.push(rings);
    }
    const lines = resultLines(this.spec, this.rungs);
    const top = this.lay.y0 + this.rungs.length * ROW + 10;
    const texts = lines.map((segs, i) =>
      this.rich(PAD, top + i * RESULT_ROW + RESULT_ROW / 2, segs, { size: RESULT_SIZE, anchor: "start", colour, weight: 700 }),
    );
    texts.forEach((t) => groups.push([t]));
    const boxes = texts.map((t) => {
      this.e.keep(t);
      return this.e.measure(t);
    });
    const b: UBox = {
      x0: Math.min(...boxes.map((m) => m.x0)) - 4,
      y0: Math.min(...boxes.map((m) => m.y0)) - 2,
      x1: Math.max(...boxes.map((m) => m.x1)) + 4,
      y1: Math.max(...boxes.map((m) => m.y1)) + 2,
    };
    this.read = true;
    this.e.parts.set("result", {
      name: "result",
      info: lines.map(flat).join(" "),
      anchor: [b.x1, (b.y0 + b.y1) / 2],
      box: b,
      glow: areaGlow(this.rect(b)),
    });
    return {
      items: [...rest.items, ...this.e.plan(...groups)],
      totalMs: 2600 + 900 * rest.ticks.length,
      sfx: "ding",
      after: this.e.popAfter(texts),
    };
  }

  hit(p: Pt): string | null {
    const result = this.e.parts.get("result");
    const inside = (b: UBox) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
    if (result && inside(result.box)) return "result";
    for (let k = 0; k <= this.stepped; k += 1) if (inside(this.rowBox(k))) return `row:${k}`;
    return null;
  }

  describe(): string {
    const top = this.rungs[0]!;
    if (this.mode === "divisor") return `A division ladder: ${top.values[0]} divided by ${this.spec.divisor} again and again`;
    if (this.mode === "factors") return `A division ladder: ${top.values[0]} divided by its prime factors`;
    return `A division ladder: ${top.values.join(", ")} divided by primes`;
  }
}

export const ladder: KindModule = {
  view,
  create: (engine, spec) => new Ladder(engine, spec),
};
