/**
 * A TABLE (section 8, `kind: table`): a frequency table or any small table of values, drawn by
 * hand: its frame, its header row under a firmer rule, its columns, and its cells.
 *
 *   columns: ['Score', 'Frequency', 'fx']
 *   rows: [[1, 3, ''], [2, 5, '']]      # '' or null: empty, for the lesson to fill
 *
 * Arriving, the pen draws the grid, the headers, then the cells given, row by row. Parts:
 * 'row:2' (the second row of values, from 1), 'col:2' or 'col:<header>', 'cell:2,3' or
 * 'cell:2,<header>', and 'total:<header>' once a total is written. Actions: fill (a cell writes
 * itself), total (a column's values added: down another column as running totals with `into`,
 * a cumulative frequency, else in a total row under the table).
 */

import type { LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  INK,
  PALETTE,
  areaGlow,
  fmt,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { box as handBox, line, poly } from "../rough.js";

const HEAD = 34;
const ROW = 30;
const PAD = 12;
const CHAR = 8.2;

function widths(spec: LessonDiagram): number[] {
  const columns = spec.columns ?? [];
  const rows = spec.rows ?? [];
  return columns.map((head, c) => {
    const longest = Math.max(head.length, 3, ...rows.map((row) => String(row[c] ?? "").length));
    return Math.max(52, longest * CHAR + 26);
  });
}

function hasTotalRow(plan: LessonDiagramOp[]): boolean {
  return plan.some((op) => op.op === "total" && !op.into);
}

function view(spec: LessonDiagram, plan: LessonDiagramOp[] = []): [number, number] {
  const w = widths(spec).reduce((s, x) => s + x, 0);
  const rows = (spec.rows ?? []).length + (hasTotalRow(plan) ? 1 : 0);
  return [Math.max(220, Math.round(w + PAD * 2)), Math.round(PAD * 2 + HEAD + rows * ROW)];
}

class Table implements Kind {
  columns: string[];
  rows: (string | number | null)[][];
  colX: number[] = [];
  colW: number[];
  x0: number;
  y0: number;
  cells = new Map<string, { text: string; el: SVGTextElement | null }>();
  totalRow = false;

  constructor(
    private e: DiagramEngine,
    spec: LessonDiagram,
    private plan: LessonDiagramOp[],
  ) {
    this.columns = spec.columns ?? [];
    this.rows = (spec.rows ?? []).map((row) => [...row]);
    this.colW = widths(spec);
    const total = this.colW.reduce((s, x) => s + x, 0);
    this.x0 = (e.view[0] - total) / 2;
    this.y0 = PAD;
    let x = this.x0;
    for (const w of this.colW) {
      this.colX.push(x);
      x += w;
    }
  }

  private col(key: string): number | null {
    const k = key.trim();
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= this.columns.length) return n - 1;
    const i = this.columns.findIndex((head) => head.toLowerCase() === k.toLowerCase());
    return i >= 0 ? i : null;
  }

  private rowTop(r: number): number {
    return this.y0 + HEAD + r * ROW;
  }

  private cellBox(r: number, c: number) {
    const x0 = this.colX[c]!;
    const y0 = this.rowTop(r);
    return { x0, y0, x1: x0 + this.colW[c]!, y1: y0 + ROW };
  }

  private rect(b: { x0: number; y0: number; x1: number; y1: number }): string {
    return poly(
      [
        [b.x0 + 1, b.y0 + 1],
        [b.x1 - 1, b.y0 + 1],
        [b.x1 - 1, b.y1 - 1],
        [b.x0 + 1, b.y1 - 1],
      ],
      true,
    );
  }

  /** A part by name: a row, a column, a cell or a total. */
  partFor(name: string) {
    const known = this.e.parts.get(name);
    if (known) return known;
    const cell = /^cell:\s*(\d+)\s*,\s*(.+)$/.exec(name);
    if (cell) {
      const c = this.col(cell[2]!);
      return c === null ? null : this.e.parts.get(`cell:${cell[1]},${c + 1}`) ?? null;
    }
    const col = /^col:(.+)$/.exec(name);
    if (col) {
      const c = this.col(col[1]!);
      return c === null ? null : this.e.parts.get(`col:${c + 1}`) ?? null;
    }
    const total = /^total:(.+)$/.exec(name);
    if (total) {
      const c = this.col(total[1]!);
      return c === null ? null : this.e.parts.get(`total:${c + 1}`) ?? null;
    }
    return null;
  }

  private setParts() {
    const n = this.rows.length;
    const left = this.colX[0] ?? 0;
    const right = left + this.colW.reduce((s, x) => s + x, 0);
    for (let r = 0; r < n; r += 1) {
      const b = { x0: left, y0: this.rowTop(r), x1: right, y1: this.rowTop(r) + ROW };
      this.e.parts.set(`row:${r + 1}`, {
        name: `row:${r + 1}`,
        info: this.columns.map((head, c) => `${head} ${this.cells.get(`${r},${c}`)?.text || "?"}`).join(", "),
        anchor: [right, b.y0 + ROW / 2],
        box: b,
        glow: areaGlow(this.rect(b)),
        quiet: true,
      });
    }
    this.columns.forEach((head, c) => {
      const b = { x0: this.colX[c]!, y0: this.y0, x1: this.colX[c]! + this.colW[c]!, y1: this.rowTop(n) };
      this.e.parts.set(`col:${c + 1}`, {
        name: `col:${c + 1}`,
        info: head,
        anchor: [b.x1 - 4, this.y0 + 6],
        box: b,
        glow: areaGlow(this.rect(b)),
        quiet: true,
      });
    });
  }

  private cellPart(r: number, c: number) {
    const b = this.cellBox(r, c);
    const name = `cell:${r + 1},${c + 1}`;
    const value = this.cells.get(`${r},${c}`)?.text ?? "";
    const rowName = this.columns[0] && c > 0 ? `${this.columns[0]} ${this.cells.get(`${r},0`)?.text ?? ""}, ` : "";
    this.e.parts.set(name, {
      name,
      info: `${rowName}${this.columns[c] ?? ""}: ${value || "?"}`,
      anchor: [b.x1 - 6, (b.y0 + b.y1) / 2],
      box: b,
      glow: areaGlow(this.rect(b)),
    });
  }

  /** Write in a cell (replacing what was there). */
  private write(r: number, c: number, words: string, colour = INK): SVGTextElement {
    const was = this.cells.get(`${r},${c}`);
    was?.el?.remove();
    const b = this.cellBox(r, c);
    const unknown = words.trim() === "?";
    const text = this.e.text(this.e.words, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 1, words, {
      size: 17,
      colour: unknown ? PALETTE.orange.stroke : colour,
      weight: 600,
    });
    this.cells.set(`${r},${c}`, { text: words, el: text });
    this.cellPart(r, c);
    return text;
  }

  drawIn(): Build {
    const rnd = this.e.rnd("table");
    const left = this.x0;
    const right = this.x0 + this.colW.reduce((s, x) => s + x, 0);
    this.totalRow = hasTotalRow(this.plan);
    const bottom = this.rowTop(this.rows.length);
    const frame = this.e.stroke(this.e.ink, handBox(left, this.y0, right, bottom, rnd, 2), { width: 2.2 });
    let inner = "";
    for (let c = 1; c < this.columns.length; c += 1) inner += line([this.colX[c]!, this.y0], [this.colX[c]!, bottom], rnd, 0);
    for (let r = 1; r < this.rows.length; r += 1) inner += line([left, this.rowTop(r)], [right, this.rowTop(r)], rnd, 0);
    const grid = this.e.stroke(this.e.ink, inner, { width: 1.3, colour: "#8f8aa8" });
    const rule = this.e.stroke(this.e.ink, line([left, this.y0 + HEAD], [right, this.y0 + HEAD], rnd, 1), { width: 2.4 });
    const headTint = this.e.fill(this.e.paint, this.rect({ x0: left, y0: this.y0, x1: right, y1: this.y0 + HEAD }), PALETTE.purple.fill, 0.16);
    const heads = this.columns.map((head, c) =>
      this.e.text(this.e.words, this.colX[c]! + this.colW[c]! / 2, this.y0 + HEAD / 2 + 1, head, { size: 17, colour: PALETTE.purple.stroke }),
    );
    const groups: SVGGraphicsElement[][] = [[frame], [grid, rule], [headTint], heads];
    this.rows.forEach((row, r) => {
      const written: SVGGraphicsElement[] = [];
      row.forEach((value, c) => {
        if (value === null || value === undefined || value === "") {
          this.cells.set(`${r},${c}`, { text: "", el: null });
          this.cellPart(r, c);
          return;
        }
        written.push(this.write(r, c, typeof value === "number" ? fmt(value) : String(value)));
      });
      if (written.length) groups.push(written);
    });
    this.setParts();
    return { items: this.e.plan(...groups), totalMs: 5200 };
  }

  op(op: LessonDiagramOp): Build | null {
    const colour = op.answer ? PALETTE.green.stroke : op.colour ? PALETTE[op.colour].stroke : PALETTE.blue.stroke;
    switch (op.op) {
      case "fill": {
        const m = /^cell:\s*(\d+)\s*,\s*(.+)$/.exec(op.part ?? "");
        const c = m ? this.col(m[2]!) : null;
        if (!m || c === null || op.text == null) return { items: [] };
        const r = Number(m[1]) - 1;
        const text = this.write(r, c, String(op.text), colour);
        this.setParts();
        return { items: this.e.plan([text]), sfx: op.answer ? "ding" : "tick", after: this.e.popAfter([text]) };
      }
      case "total": {
        const m = /^col:(.+)$/.exec(op.part ?? "");
        const c = m ? this.col(m[1]!) : null;
        if (c === null) return { items: [] };
        const values = this.rows.map((_, r) => Number(this.cells.get(`${r},${c}`)?.text.replace(/−/g, "-") ?? NaN));
        if (op.into) {
          const into = /^col:(.+)$/.exec(op.into);
          const d = into ? this.col(into[1]!) : null;
          if (d === null) return { items: [] };
          let run = 0;
          const texts = values.map((v, r) => {
            run += Number.isFinite(v) ? v : 0;
            return this.write(r, d, fmt(run), colour);
          });
          this.setParts();
          return { items: this.e.plan(...texts.map((t) => [t])), sfx: "tick", after: this.e.popAfter(texts) };
        }
        // A total row under the table.
        const sum = values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
        const r = this.rows.length;
        const left = this.x0;
        const right = this.x0 + this.colW.reduce((s, x) => s + x, 0);
        const y0 = this.rowTop(r);
        const rnd = this.e.rnd("total");
        const box = this.e.stroke(this.e.ink, line([left, y0], [left, y0 + ROW], rnd, 1) + line([left, y0 + ROW], [right, y0 + ROW], rnd, 1) + line([right, y0 + ROW], [right, y0], rnd, 1), { width: 2.2 });
        const rule = this.e.stroke(this.e.ink, line([left, y0 + 2], [right, y0 + 2], rnd, 0), { width: 2.2 });
        const label = this.e.text(this.e.words, this.colX[0]! + this.colW[0]! / 2, y0 + ROW / 2 + 1, "Total", { size: 17, colour: PALETTE.purple.stroke });
        const words = op.text ?? `${fmt(sum)}`;
        const value = this.e.text(this.e.words, this.colX[c]! + this.colW[c]! / 2, y0 + ROW / 2 + 1, words, { size: 18, colour });
        const name = `total:${c + 1}`;
        this.e.parts.set(name, {
          name,
          info: `${this.columns[c] ?? ""} total: ${words}`,
          anchor: [this.colX[c]! + this.colW[c]! - 6, y0 + ROW / 2],
          box: { x0: this.colX[c]!, y0, x1: this.colX[c]! + this.colW[c]!, y1: y0 + ROW },
          glow: areaGlow(this.rect({ x0: this.colX[c]!, y0, x1: this.colX[c]! + this.colW[c]!, y1: y0 + ROW })),
        });
        return { items: this.e.plan([box, rule], [label], [value]), sfx: op.answer ? "ding" : "tick", after: this.e.popAfter([value]) };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    for (const part of this.e.parts.values()) {
      if (!part.name.startsWith("cell:") && !part.name.startsWith("total:")) continue;
      const b = part.box;
      if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1) return part.name;
    }
    const c = this.colX.findIndex((x, i) => p[0] >= x && p[0] <= x + this.colW[i]!);
    if (c >= 0 && p[1] >= this.y0 && p[1] <= this.y0 + HEAD) return `col:${c + 1}`;
    return null;
  }

  describe(): string {
    return `A table with columns ${this.columns.join(", ")} and ${this.rows.length} rows`;
  }
}

export const table: KindModule = {
  view,
  create: (engine, spec, plan) => new Table(engine, spec, plan ?? []),
};
