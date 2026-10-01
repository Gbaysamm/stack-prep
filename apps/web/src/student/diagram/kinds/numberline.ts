/**
 * A NUMBER LINE (section 8, `kind: numberline`): `range: [a, b]` with a tick every `step` (default
 * 1), numbered, with arrowheads at both ends, and the description's own `points`.
 *
 * Actions: point (a dot at x, filled or `open`, with its words), hop (an arc from one number to
 * another with the step written over it: +3, −2), interval (an inequality: a thick band along
 * the line between `from` and `to`, a filled circle at an end that is included and an open one
 * at an end that is not, `from_open` / `to_open`, and an arrow on to the end of the line where
 * an end is left out), label (words at x, or by a part).
 *
 * Parts: 'point:1'…, 'hop:1'…, 'interval:1'… (from 1, in the order they are drawn).
 */

import type { DiagramColour, DiagramDot, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  PALETTE,
  SOFT,
  boxOfPoints,
  dotGlow,
  fmt,
  lineGlow,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { bowed, head, line } from "../rough.js";

const VIEW: [number, number] = [360, 140];
const Y = 92;
const LEFT = 30;
const RIGHT = 330;

class NumberLine implements Kind {
  range: [number, number];
  step: number;
  counts = { point: 0, hop: 0, interval: 0 };

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    this.range = spec.range ?? [-5, 5];
    this.step = spec.step ?? 1;
  }

  sx(v: number): number {
    const [a, b] = this.range;
    return LEFT + ((v - a) / (b - a || 1)) * (RIGHT - LEFT);
  }

  private point(x: number, words: string | null, colour: DiagramColour, open: boolean): Build {
    const c = PALETTE[colour];
    const p: Pt = [this.sx(x), Y];
    const dot = this.e.dot(this.e.marks, p, { colour: c.stroke, open, r: 5 });
    this.e.taken.push({ x0: p[0] - 6, y0: p[1] - 6, x1: p[0] + 6, y1: p[1] + 6 });
    this.counts.point += 1;
    const name = `point:${this.counts.point}`;
    const groups: SVGGraphicsElement[][] = [[dot]];
    let text: SVGTextElement | null = null;
    if (words) {
      text = this.e.keep(this.e.text(this.e.marks, p[0], Y - 20, words, { size: 16, colour: c.stroke }));
      groups.push([text]);
    }
    this.e.parts.set(name, { name, info: words ? `${words} (x = ${fmt(x)})` : `x = ${fmt(x)}`, anchor: p, box: boxOfPoints([p], 7), glow: dotGlow(p, 10) });
    return { items: this.e.plan(...groups), sfx: "pop", after: this.e.popAfter(text ? [text] : []) };
  }

  drawIn(): Build {
    const rnd = this.e.rnd("line");
    const axis = this.e.stroke(this.e.ink, line([LEFT - 14, Y], [RIGHT + 14, Y], rnd, 1), { width: 2.4 });
    const heads = this.e.stroke(this.e.ink, head([RIGHT + 16, Y], [RIGHT, Y], 8) + head([LEFT - 16, Y], [LEFT, Y], 8), { width: 2.4 });
    let ticks = "";
    const [a, b] = this.range;
    const values: number[] = [];
    for (let v = Math.ceil(a / this.step - 1e-9) * this.step; v <= b + 1e-9; v += this.step) values.push(Math.round(v / this.step) * this.step);
    for (const v of values) ticks += `M${this.sx(v).toFixed(1)} ${Y - 6}V${Y + 6}`;
    const tickPath = this.e.stroke(this.e.ink, ticks, { width: 1.8, colour: SOFT });
    const numbers = this.e.text(this.e.words, 0, 0, "", { size: 14, colour: SOFT, weight: 600 });
    const every = (RIGHT - LEFT) / Math.max(1, values.length) < 16 ? 2 : 1;
    values.forEach((v, i) => {
      if (i % every && i !== values.length - 1) return;
      const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      span.setAttribute("x", this.sx(v).toFixed(1));
      span.setAttribute("y", String(Y + 25));
      span.textContent = fmt(v);
      numbers.appendChild(span);
    });
    numbers.removeAttribute("x");
    numbers.removeAttribute("y");
    this.e.keep(numbers);
    const items = this.e.plan([axis], [heads], [tickPath], [numbers]);
    for (const dot of (this.spec.points ?? []) as DiagramDot[]) {
      if (Array.isArray(dot) || typeof dot.x !== "number") continue;
      items.push(...this.point(dot.x, dot.text ?? null, dot.colour ?? "blue", Boolean(dot.open)).items);
    }
    return { items, totalMs: 3600 };
  }

  op(op: LessonDiagramOp): Build | null {
    const colour: DiagramColour = op.answer ? "green" : op.colour ?? "blue";
    const c = PALETTE[colour];
    switch (op.op) {
      case "point": {
        if (typeof op.x !== "number") return { items: [] };
        const built = this.point(op.x, op.text ?? null, colour, Boolean(op.open));
        return { ...built, sfx: op.answer ? "ding" : "pop" };
      }
      case "hop": {
        if (typeof op.from !== "number" || typeof op.to !== "number") return { items: [] };
        const a: Pt = [this.sx(op.from), Y - 4];
        const b: Pt = [this.sx(op.to), Y - 4];
        const span = Math.abs(b[0] - a[0]);
        const bend = (op.to >= op.from ? -1 : 1) * Math.min(0.42, 34 / Math.max(20, span) + 0.12);
        const curve = bowed(a, b, bend);
        const hopColour = op.colour ? c.stroke : PALETTE.purple.stroke;
        const arc = this.e.stroke(this.e.marks, curve.d, { colour: hopColour, width: 2.4 });
        const tip = this.e.stroke(this.e.marks, head(b, curve.at(0.86), 7), { colour: hopColour, width: 2.4 });
        const d = op.to - op.from;
        const words = op.text ?? `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))}`;
        const apex = curve.at(0.5);
        const text = this.e.keep(this.e.text(this.e.marks, apex[0], apex[1] - 11, words, { size: 16, colour: hopColour }));
        this.e.taken.push({ x0: Math.min(a[0], b[0]), y0: apex[1] - 4, x1: Math.max(a[0], b[0]), y1: Y - 6 });
        this.counts.hop += 1;
        const name = `hop:${this.counts.hop}`;
        this.e.parts.set(name, { name, info: `from ${fmt(op.from)} to ${fmt(op.to)}: ${words}`, anchor: apex, box: boxOfPoints([a, b, apex], 6), thin: true, glow: lineGlow(curve.d, 9) });
        return { items: this.e.plan([arc], [tip], [text]), sfx: "whoosh", after: this.e.popAfter([text]) };
      }
      case "interval": {
        const from = typeof op.from === "number" ? op.from : null;
        const to = typeof op.to === "number" ? op.to : null;
        const x0 = from === null ? LEFT - 12 : this.sx(from);
        const x1 = to === null ? RIGHT + 12 : this.sx(to);
        const band = this.e.stroke(this.e.paint, line([x0, Y], [x1, Y], this.e.rnd(`band${from}${to}`)), {
          colour: c.fill,
          width: 10,
          opacity: 0.55,
        });
        const groups: SVGGraphicsElement[][] = [[band]];
        const ends: SVGGraphicsElement[] = [];
        if (from !== null) ends.push(this.e.dot(this.e.marks, [x0, Y], { colour: c.stroke, open: Boolean(op.from_open), r: 5.5 }));
        if (to !== null) ends.push(this.e.dot(this.e.marks, [x1, Y], { colour: c.stroke, open: Boolean(op.to_open), r: 5.5 }));
        if (from === null) ends.push(this.e.stroke(this.e.marks, head([LEFT - 16, Y], [LEFT, Y], 9), { colour: c.stroke, width: 3 }));
        if (to === null) ends.push(this.e.stroke(this.e.marks, head([RIGHT + 16, Y], [RIGHT, Y], 9), { colour: c.stroke, width: 3 }));
        groups.push(ends);
        const words = op.text ?? describeInterval(from, to, Boolean(op.from_open), Boolean(op.to_open));
        const mid = ((from === null ? LEFT : x0) + (to === null ? RIGHT : x1)) / 2;
        // Over the band, slid along it until it is clear of what is written there already.
        const text = this.e.text(this.e.marks, mid, Y - 24, words, { size: 18, colour: c.stroke });
        const room = this.e.measure(text);
        const w = room.x1 - room.x0;
        const lo = Math.max(8 + w / 2, Math.min(x0, x1));
        const hi = Math.min(VIEW[0] - 8 - w / 2, Math.max(x0, x1));
        const clear = (x: number, y: number) =>
          !this.e.taken.some((o) => x - w / 2 < o.x1 + 3 && x + w / 2 > o.x0 - 3 && y - 14 < o.y1 + 2 && y + 4 > o.y0 - 2);
        let spot: Pt = [mid, Y - 24];
        search: for (const y of [Y - 24, Y - 46, Y - 66]) {
          for (let k = 0; k <= 40; k += 1) {
            const x = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6;
            if (x < lo || x > hi) continue;
            if (clear(x, y)) {
              spot = [x, y];
              break search;
            }
          }
        }
        text.setAttribute("x", String(spot[0]));
        text.setAttribute("y", String(spot[1] + 18 * 0.34));
        this.e.keep(text);
        groups.push([text]);
        this.counts.interval += 1;
        const name = `interval:${this.counts.interval}`;
        this.e.parts.set(name, {
          name,
          info: words,
          // Its dot by its first end that is there: the boundary.
          anchor: [from !== null ? x0 : to !== null ? x1 : mid, Y - 4],
          box: { x0: Math.min(x0, x1), y0: Y - 10, x1: Math.max(x0, x1), y1: Y + 10 },
          thin: true,
          glow: lineGlow(line([x0, Y], [x1, Y], this.e.rnd("g")), 16),
        });
        return { items: this.e.plan(...groups), sfx: op.answer ? "ding" : "scribble", after: this.e.popAfter([text]) };
      }
      case "label": {
        if (typeof op.x !== "number" || !op.text) return null;
        const n = this.e.note([this.sx(op.x), Y - 8], op.text, op.colour ? c.stroke : PALETTE.purple.stroke, 16);
        return { items: this.e.plan([n.pointer, n.text].filter(Boolean) as SVGGraphicsElement[]), sfx: "pop", after: this.e.popAfter([n.text]) };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    let best: { name: string; d: number } | null = null;
    for (const part of this.e.parts.values()) {
      const b = part.box;
      const inside = p[0] >= b.x0 - 4 && p[0] <= b.x1 + 4 && p[1] >= b.y0 - 6 && p[1] <= b.y1 + 6;
      if (!inside) continue;
      const d = Math.hypot(part.anchor[0] - p[0], part.anchor[1] - p[1]) + (part.name.startsWith("interval") ? 20 : 0);
      if (!best || d < best.d) best = { name: part.name, d };
    }
    return best?.name ?? null;
  }

  describe(): string {
    return `A number line from ${fmt(this.range[0])} to ${fmt(this.range[1])}`;
  }
}

/** An interval in symbols: x > 2, −1 ≤ x < 3. */
function describeInterval(from: number | null, to: number | null, fromOpen: boolean, toOpen: boolean): string {
  if (from !== null && to !== null) return `${fmt(from)} ${fromOpen ? "<" : "≤"} x ${toOpen ? "<" : "≤"} ${fmt(to)}`;
  if (from !== null) return `x ${fromOpen ? ">" : "≥"} ${fmt(from)}`;
  if (to !== null) return `x ${toOpen ? "<" : "≤"} ${fmt(to)}`;
  return "every x";
}

export const numberline: KindModule = {
  view: () => VIEW,
  create: (engine, spec) => new NumberLine(engine, spec),
};
