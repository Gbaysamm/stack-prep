/**
 * A GRAPH (section 8, `kind: graph`): axes with their ranges and ticks, and curves drawn from a
 * function of x (diagram/expr.ts, never eval) or from points.
 *
 * Arriving, the pen draws the axes (ticks, numbers, names), then each plot not marked `later`
 * left to right with its label at its end, then the description's own points.
 *
 * Actions: plot (a later curve draws itself), point (a dot with its coordinates written),
 * intercepts (where a curve crosses the axes, each a dot with its coordinates), vertex (its
 * turning point), line (y = mx + c, or through two points: a new plot), shade (under a curve,
 * or between two, over a stretch of x), gradient (a rise-over-run triangle on a curve).
 * Hovering or tapping anywhere near a curve reads off the nearest point on it.
 */

import type { DiagramColour, DiagramDot, DiagramPlot, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import { Axes, axesView, niceStep, type AxesSpec } from "../axes.js";
import {
  CYCLE,
  INK,
  PALETTE,
  boxOfPoints,
  dotGlow,
  el,
  fmt,
  lineGlow,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
  type Part,
} from "../engine.js";
import { tryFn, type Fn } from "../expr.js";
import { line, poly, smooth } from "../rough.js";

interface Curve {
  name: string;
  label: string | null;
  colour: DiagramColour;
  fn: Fn | null;
  /** The curve as values, in order of x. */
  values: Pt[];
  join: "smooth" | "straight" | "none";
  drawn: boolean;
  later: boolean;
}

export function graphAxes(spec: LessonDiagram): AxesSpec {
  const x = spec.x ?? [-5, 5];
  const y = spec.y ?? [-5, 5];
  return {
    x,
    y,
    xStep: spec.x_step ?? spec.step ?? niceStep(x[1] - x[0], 10),
    yStep: spec.y_step ?? spec.step ?? niceStep(y[1] - y[0], 10),
    xLabel: spec.x_label,
    yLabel: spec.y_label,
    grid: Boolean(spec.grid),
    crossing: true,
  };
}

/** A curve's values: a function sampled across its stretch, or its points in order. */
function valuesOf(plot: DiagramPlot, x: [number, number]): { fn: Fn | null; values: Pt[] } {
  const fn = tryFn(plot.fn);
  if (fn) {
    const [a, b] = plot.domain ?? x;
    const lo = Math.max(a, x[0]);
    const hi = Math.min(b, x[1]);
    const values: Pt[] = [];
    const n = 240;
    for (let i = 0; i <= n; i += 1) {
      const vx = lo + ((hi - lo) * i) / n;
      values.push([vx, fn(vx)]);
    }
    return { fn, values };
  }
  const points = (plot.points ?? []).filter((p) => Array.isArray(p) && p.length === 2) as Pt[];
  return { fn: null, values: [...points].sort((p, q) => p[0] - q[0]) };
}

class Graph implements Kind {
  axes: Axes;
  curves: Curve[] = [];
  points = 0;
  shades = 0;
  gradients = 0;
  clipId: string;
  plotLayer: SVGGElement;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const axesSpec = graphAxes(spec);
    this.axes = new Axes(axesSpec, axesView(axesSpec).frame);
    // Curves are kept to the frame (a little past it), as a graph on squared paper is.
    this.clipId = e.id("clip");
    const clip = el("clipPath", { id: this.clipId }, e.defs);
    const f = this.axes.frame;
    el("rect", { x: f.left - 6, y: f.top - 6, width: f.right - f.left + 12, height: f.bottom - f.top + 12 }, clip);
    this.plotLayer = el("g", { "clip-path": `url(#${this.clipId})` }, e.ink);
    (spec.plots ?? []).forEach((plot) => this.addCurve(plot));
    e.parts.set("axis:x", this.axisPart("x"));
    e.parts.set("axis:y", this.axisPart("y"));
  }

  private axisPart(which: "x" | "y"): Part {
    const f = this.axes.frame;
    const [ox, oy] = this.axes.origin();
    const a: Pt = which === "x" ? [f.left, oy] : [ox, f.bottom];
    const b: Pt = which === "x" ? [f.right, oy] : [ox, f.top];
    return {
      name: `axis:${which}`,
      info: which === "x" ? `the ${this.spec.x_label || "x"} axis` : `the ${this.spec.y_label || "y"} axis`,
      anchor: which === "x" ? [f.right - 10, oy] : [ox, f.top + 10],
      box: boxOfPoints([a, b], 4),
      glow: lineGlow(poly([a, b])),
      quiet: true,
    };
  }

  addCurve(plot: DiagramPlot): Curve {
    const { fn, values } = valuesOf(plot, this.axes.spec.x);
    const curve: Curve = {
      name: `plot:${this.curves.length + 1}`,
      label: plot.label ?? (plot.fn ? `y = ${plot.fn}` : null),
      colour: plot.colour ?? CYCLE[this.curves.length % CYCLE.length]!,
      fn,
      values,
      join: plot.join ?? (fn ? "smooth" : "straight"),
      drawn: false,
      later: Boolean(plot.later),
    };
    this.curves.push(curve);
    return curve;
  }

  /** The curve in units, split where it leaves the graph far above or below. */
  private runs(curve: Curve): Pt[][] {
    const [ya, yb] = this.axes.spec.y;
    const span = yb - ya;
    const out: Pt[][] = [];
    let run: Pt[] = [];
    for (const [x, y] of curve.values) {
      if (!Number.isFinite(y) || y > yb + span * 0.6 || y < ya - span * 0.6) {
        if (run.length > 1) out.push(run);
        run = [];
        continue;
      }
      run.push(this.axes.at(x, y));
    }
    if (run.length > 1) out.push(run);
    return out;
  }

  /** Whether a point in units is on the graph's paper. */
  private inFrame(p: Pt, pad = 0): boolean {
    const f = this.axes.frame;
    return p[0] >= f.left - pad && p[0] <= f.right + pad && p[1] >= f.top - pad && p[1] <= f.bottom + pad;
  }

  private curvePart(curve: Curve, d: string, shown: Pt[]): Part {
    const anchor = shown[Math.floor(shown.length * 0.78)] ?? shown[0] ?? [0, 0];
    return {
      name: curve.name,
      info: curve.label ?? "a curve",
      anchor,
      box: boxOfPoints(shown.length ? shown : [[0, 0]], 4),
      thin: true,
      glow: (layer, colour, mode) => {
        const g = el("g", { "clip-path": `url(#${this.clipId})` }, layer);
        lineGlow(d)(g, colour, mode);
        return [g];
      },
    };
  }

  /** The pen's groups for a curve: the curve left to right, then its label by its end. */
  private drawCurve(curve: Curve): SVGGraphicsElement[][] {
    const c = PALETTE[curve.colour];
    const runs = this.runs(curve);
    const groups: SVGGraphicsElement[][] = [];
    const shown = runs.flat().filter((p) => this.inFrame(p));
    let d = "";
    if (curve.join === "none") {
      for (const run of runs) for (const p of run) groups.push([this.e.dot(this.plotLayer, p, { colour: c.stroke, r: 3.6 })]);
    } else {
      d = runs.map((run) => (curve.join === "smooth" ? smooth(run) : poly(run))).join("");
      groups.push([this.e.stroke(this.plotLayer, d, { colour: c.stroke, width: 2.8 })]);
    }
    curve.drawn = true;
    shown.forEach((p, i) => {
      if (i % 2 === 0) this.e.inked.push(p);
    });
    this.e.parts.set(curve.name, this.curvePart(curve, d || poly(shown), shown));
    if (curve.label && shown.length) {
      // By the end of the curve where it is still on the paper, clear of everything written.
      const end = shown[shown.length - 1]!;
      const n = this.e.note(end, curve.label, c.stroke, 16);
      groups.push([n.text, n.pointer].filter(Boolean) as SVGGraphicsElement[]);
    }
    return groups;
  }

  private dotGroups(p: Pt, words: string | null, colour: DiagramColour, open = false): { groups: SVGGraphicsElement[][]; text: SVGTextElement | null } {
    const c = PALETTE[colour];
    const dot = this.e.dot(this.e.marks, p, { colour: c.stroke, open });
    this.e.taken.push({ x0: p[0] - 5, y0: p[1] - 5, x1: p[0] + 5, y1: p[1] + 5 });
    const groups: SVGGraphicsElement[][] = [[dot]];
    let text: SVGTextElement | null = null;
    if (words) {
      const n = this.e.note(p, words, c.stroke === PALETTE.blue.stroke ? INK : c.stroke, 15);
      text = n.text;
      groups.push([n.text, n.pointer].filter(Boolean) as SVGGraphicsElement[]);
    }
    return { groups, text };
  }

  private addPoint(x: number, y: number, words: string | null, colour: DiagramColour, info?: string): { groups: SVGGraphicsElement[][]; text: SVGTextElement | null } {
    const p = this.axes.at(x, y);
    this.points += 1;
    const name = `point:${this.points}`;
    const out = this.dotGroups(p, words, colour);
    this.e.parts.set(name, {
      name,
      info: info ?? words ?? `(${fmt(x)}, ${fmt(y)})`,
      anchor: p,
      box: boxOfPoints([p], 6),
      glow: dotGlow(p, 10),
    });
    return out;
  }

  private curveOf(part: string | null | undefined): Curve | null {
    if (!part) return null;
    return this.curves.find((curve) => curve.name === part) ?? null;
  }

  drawIn(): Build {
    const groups = this.axes.draw(this.e);
    this.e.inked.push(...this.axes.trace());
    for (const curve of this.curves) if (!curve.later) groups.push(...this.drawCurve(curve));
    for (const dot of (this.spec.points ?? []) as DiagramDot[]) {
      if (Array.isArray(dot) || typeof dot.x !== "number") continue;
      const y = typeof dot.y === "number" ? dot.y : 0;
      groups.push(...this.addPoint(dot.x, y, dot.text ?? `(${fmt(dot.x)}, ${fmt(y)})`, dot.colour ?? "blue").groups);
    }
    return { items: this.e.plan(...groups), totalMs: 4200 };
  }

  op(op: LessonDiagramOp): Build | null {
    const colour: DiagramColour = op.answer ? "green" : op.colour ?? "blue";
    const sfx = op.answer ? "ding" : "pop";
    switch (op.op) {
      case "plot": {
        const curve = this.curveOf(op.part) ?? this.curves.find((one) => !one.drawn);
        if (!curve || curve.drawn) return { items: [] };
        if (op.colour) curve.colour = op.colour;
        return { items: this.e.plan(...this.drawCurve(curve)), sfx: "scribble" };
      }
      case "line": {
        let fnText: string | null = null;
        let values: Pt[] | null = null;
        if (typeof op.m === "number") {
          const c = typeof op.c === "number" ? op.c : 0;
          fnText = `${op.m}*x + (${c})`;
        } else if (op.through) {
          values = op.through as Pt[];
        }
        const plot: DiagramPlot = values
          ? { points: extend(values, this.axes.spec.x), join: "straight", label: op.label ?? op.text ?? null, colour: op.colour ?? "purple" }
          : { fn: fnText, label: op.label ?? op.text ?? lineName(op.m ?? 0, op.c ?? 0), colour: op.colour ?? "purple" };
        const curve = this.addCurve(plot);
        return { items: this.e.plan(...this.drawCurve(curve)), sfx: "scribble" };
      }
      case "point": {
        const curve = this.curveOf(op.part);
        const x = typeof op.x === "number" ? op.x : 0;
        const y = typeof op.y === "number" ? op.y : curve?.fn ? curve.fn(x) : 0;
        const words = op.text ?? `(${fmt(x)}, ${fmt(y)})`;
        const made = this.addPoint(x, y, words, colour, op.text ? `${op.text}: (${fmt(x)}, ${fmt(y)})` : undefined);
        return { items: this.e.plan(...made.groups), sfx, after: this.e.popAfter(made.text ? [made.text] : []) };
      }
      case "intercepts": {
        const curve = this.curveOf(op.part);
        if (!curve) return { items: [] };
        const groups: SVGGraphicsElement[][] = [];
        const texts: SVGTextElement[] = [];
        const axis = op.axis ?? "both";
        if (axis !== "y") {
          for (const x of roots(curve)) {
            const made = this.addPoint(x, 0, `(${fmt(x)}, 0)`, colour, `crosses the x axis at (${fmt(x)}, 0)`);
            groups.push(...made.groups);
            if (made.text) texts.push(made.text);
          }
        }
        const [xa, xb] = this.axes.spec.x;
        if (axis !== "x" && xa <= 0 && xb >= 0) {
          const y = curve.fn ? curve.fn(0) : interpolate(curve.values, 0);
          if (y !== null && Number.isFinite(y)) {
            const made = this.addPoint(0, y, `(0, ${fmt(y)})`, colour, `crosses the y axis at (0, ${fmt(y)})`);
            groups.push(...made.groups);
            if (made.text) texts.push(made.text);
          }
        }
        return { items: this.e.plan(...groups), sfx, after: this.e.popAfter(texts) };
      }
      case "vertex": {
        const curve = this.curveOf(op.part);
        const turn = curve ? turning(curve) : null;
        if (!turn) return { items: [] };
        const [x, y, kind] = turn;
        const words = `(${fmt(x)}, ${fmt(y)})${op.text ? ` ${op.text}` : ""}`;
        const made = this.addPoint(x, y, words, op.answer ? "green" : op.colour ?? "orange", `the ${kind} point, (${fmt(x)}, ${fmt(y)})`);
        return { items: this.e.plan(...made.groups), sfx, after: this.e.popAfter(made.text ? [made.text] : []) };
      }
      case "shade":
        return this.shade(op, colour);
      case "gradient":
        return this.gradient(op, colour);
      default:
        return null;
    }
  }

  private shade(op: LessonDiagramOp, colour: DiagramColour): Build {
    const top = this.curveOf(op.part);
    if (!top) return { items: [] };
    const other = this.curveOf(op.to_part);
    const range = Array.isArray(op.x) ? op.x : null;
    const [xa, xb] = range ?? [top.values[0]?.[0] ?? this.axes.spec.x[0], top.values[top.values.length - 1]?.[0] ?? this.axes.spec.x[1]];
    const valueAt = (curve: Curve | null, x: number) =>
      curve ? (curve.fn ? curve.fn(x) : interpolate(curve.values, x) ?? 0) : 0;
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    const n = 80;
    for (let i = 0; i <= n; i += 1) {
      const x = xa + ((xb - xa) * i) / n;
      upper.push(this.axes.at(x, valueAt(top, x)));
      lower.push(this.axes.at(x, valueAt(other, x)));
    }
    const d = poly([...upper, ...lower.reverse()], true);
    const g = el("g", { "clip-path": `url(#${this.clipId})` }, this.e.paint);
    const area = el("path", { d, fill: this.e.hatch(colour), stroke: "none" }, g);
    this.shades += 1;
    const name = `shade:${this.shades}`;
    const box = boxOfPoints([...upper, ...lower]);
    const middle: Pt = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    this.e.parts.set(name, {
      name,
      info: op.text ?? (other ? "the region between the curves" : "the region under the curve"),
      anchor: middle,
      box,
      glow: (layer, c, mode) => {
        const wrap = el("g", { "clip-path": `url(#${this.clipId})` }, layer);
        el("path", { d, fill: c, "fill-opacity": mode === "hover" ? 0.4 : 0.5 }, wrap);
        return [wrap];
      },
    });
    const groups: SVGGraphicsElement[][] = [[area]];
    let text: SVGTextElement | null = null;
    if (op.text) {
      const note = this.e.note(middle, op.text, PALETTE[colour].stroke, 15);
      text = note.text;
      groups.push([note.text, note.pointer].filter(Boolean) as SVGGraphicsElement[]);
    }
    return { items: this.e.plan(...groups), sfx: op.answer ? "ding" : "scribble", after: this.e.popAfter(text ? [text] : []) };
  }

  private gradient(op: LessonDiagramOp, colour: DiagramColour): Build {
    const curve = this.curveOf(op.part);
    const range = Array.isArray(op.x) ? op.x : null;
    if (!curve || !range) return { items: [] };
    const f = (x: number) => (curve.fn ? curve.fn(x) : interpolate(curve.values, x) ?? 0);
    const [x1, x2] = range;
    const y1 = f(x1);
    const y2 = f(x2);
    const a = this.axes.at(x1, y1);
    const corner = this.axes.at(x2, y1);
    const b = this.axes.at(x2, y2);
    const c = PALETTE[colour];
    const rnd = this.e.rnd(`grad${x1}${x2}`);
    const run = this.e.stroke(this.e.marks, line(a, corner, rnd), { colour: c.stroke, width: 2.2, dash: "6 5" });
    const rise = this.e.stroke(this.e.marks, line(corner, b, rnd), { colour: c.stroke, width: 2.2, dash: "6 5" });
    const dots = [this.e.dot(this.e.marks, a, { colour: c.stroke, r: 3.4 }), this.e.dot(this.e.marks, b, { colour: c.stroke, r: 3.4 })];
    const runText = this.e.keep(
      this.e.text(this.e.marks, (a[0] + corner[0]) / 2, a[1] + (y2 >= y1 ? 15 : -13), `run ${fmt(x2 - x1)}`, { size: 14, colour: c.stroke }),
    );
    const riseText = this.e.keep(
      this.e.text(this.e.marks, corner[0] + 8, (corner[1] + b[1]) / 2, `rise ${fmt(y2 - y1)}`, { size: 14, colour: c.stroke, anchor: "start" }),
    );
    const groups: SVGGraphicsElement[][] = [[...dots], [run], [runText], [rise], [riseText]];
    const texts = [runText, riseText];
    const words = op.text ?? `gradient = ${fmt(y2 - y1)} ÷ ${fmt(x2 - x1)} = ${fmt((y2 - y1) / (x2 - x1 || 1))}`;
    const n = this.e.note([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], words, c.stroke, 15);
    groups.push([n.text, n.pointer].filter(Boolean) as SVGGraphicsElement[]);
    texts.push(n.text);
    this.gradients += 1;
    const name = `gradient:${this.gradients}`;
    const box = boxOfPoints([a, corner, b], 6);
    this.e.parts.set(name, { name, info: words, anchor: corner, box, glow: lineGlow(poly([a, corner, b]), 8) });
    return { items: this.e.plan(...groups), sfx: op.answer ? "ding" : "pop", after: this.e.popAfter(texts) };
  }

  hit(p: Pt): string | null {
    let best: { name: string; d: number } | null = null;
    for (const part of this.e.parts.values()) {
      if (!part.name.startsWith("point:")) continue;
      const d = Math.hypot(part.anchor[0] - p[0], part.anchor[1] - p[1]);
      if (d < 12 && (!best || d < best.d)) best = { name: part.name, d };
    }
    if (best) return best.name;
    for (const part of this.e.parts.values())
      if (part.name.startsWith("shade:") && p[0] >= part.box.x0 && p[0] <= part.box.x1 && p[1] >= part.box.y0 && p[1] <= part.box.y1)
        return part.name;
    return null;
  }

  probe(p: Pt): { at: Pt; text: string } | null {
    if (!this.inFrame(p, 10)) return null;
    let best: { at: Pt; v: Pt; d: number } | null = null;
    for (const curve of this.curves) {
      if (!curve.drawn) continue;
      const [vx] = this.axes.value(p);
      // Near the pointer's x (and along the curve, for a steep one).
      for (const v of curve.values) {
        const at = this.axes.at(v[0], v[1]);
        if (!this.inFrame(at)) continue;
        const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
        if (d < 26 && (!best || d < best.d)) best = { at, v, d };
      }
      if (curve.fn && !best) {
        const y = curve.fn(vx);
        const at = this.axes.at(vx, y);
        const d = Math.abs(at[1] - p[1]);
        if (d < 26 && this.inFrame(at)) best = { at, v: [vx, y], d };
      }
    }
    if (!best) return null;
    return { at: best.at, text: `(${fmt(best.v[0], 2)}, ${fmt(best.v[1], 2)})` };
  }

  describe(): string {
    const drawn = this.curves.filter((curve) => curve.drawn && curve.label).map((curve) => curve.label);
    return `A graph${drawn.length ? ` of ${drawn.join(" and ")}` : ""}, x from ${fmt(this.axes.spec.x[0])} to ${fmt(this.axes.spec.x[1])}`;
  }
}

/** The line y = mx + c in words as the board writes it. */
function lineName(m: number, c: number): string {
  const mPart = m === 1 ? "x" : m === -1 ? "−x" : `${fmt(m)}x`;
  if (c === 0) return `y = ${mPart}`;
  return `y = ${mPart} ${c > 0 ? "+" : "−"} ${fmt(Math.abs(c))}`;
}

/** A line through two points, run on to the edges of the x range. */
function extend(points: Pt[], x: [number, number]): [number, number][] {
  const [a, b] = points as [Pt, Pt];
  if (!a || !b || a[0] === b[0]) return points as [number, number][];
  const m = (b[1] - a[1]) / (b[0] - a[0]);
  return [
    [x[0], a[1] + m * (x[0] - a[0])],
    [x[1], a[1] + m * (x[1] - a[0])],
  ];
}

/** Where a curve crosses (or touches) y = 0. */
function roots(curve: Curve): number[] {
  const out: number[] = [];
  const v = curve.values;
  const f = curve.fn;
  for (let i = 1; i < v.length; i += 1) {
    const [x0, y0] = v[i - 1]!;
    const [x1, y1] = v[i]!;
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) {
      out.push(x0);
      continue;
    }
    if (y0 * y1 < 0) {
      let lo = x0;
      let hi = x1;
      let flo = y0;
      for (let k = 0; k < 50 && f; k += 1) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      out.push(f ? (lo + hi) / 2 : x0 - (y0 * (x1 - x0)) / (y1 - y0));
    }
  }
  // Touching: a turning point on the axis.
  const turn = turning(curve);
  if (turn && Math.abs(turn[1]) < 1e-6 && !out.some((x) => Math.abs(x - turn[0]) < 1e-3)) out.push(turn[0]);
  const last = v[v.length - 1];
  if (last && last[1] === 0) out.push(last[0]);
  return out.map((x) => Math.round(x * 1e6) / 1e6).filter((x, i, all) => all.indexOf(x) === i);
}

/** A curve's first turning point: its x, its y, and whether it is the lowest or highest. */
function turning(curve: Curve): [number, number, "lowest" | "highest"] | null {
  const v = curve.values;
  for (let i = 1; i < v.length - 1; i += 1) {
    const a = v[i - 1]![1];
    const b = v[i]![1];
    const c = v[i + 1]![1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    const low = b <= a && b < c;
    const high = b >= a && b > c;
    if (!low && !high) continue;
    let lo = v[i - 1]![0];
    let hi = v[i + 1]![0];
    const f = curve.fn;
    if (f) {
      // Golden-section search on the bracket.
      const sign = low ? 1 : -1;
      for (let k = 0; k < 60; k += 1) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (sign * f(m1) < sign * f(m2)) hi = m2;
        else lo = m1;
      }
      const x = Math.round(((lo + hi) / 2) * 1e6) / 1e6;
      return [x, Math.round(f(x) * 1e6) / 1e6, low ? "lowest" : "highest"];
    }
    return [v[i]![0], b, low ? "lowest" : "highest"];
  }
  return null;
}

/** A curve's value at x, from its points (joined straight), or null outside them. */
export function interpolate(values: Pt[], x: number): number | null {
  for (let i = 1; i < values.length; i += 1) {
    const [x0, y0] = values[i - 1]!;
    const [x1, y1] = values[i]!;
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1)) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return null;
}

export const graph: KindModule = {
  view: (spec) => axesView(graphAxes(spec)).size,
  create: (engine, spec) => new Graph(engine, spec),
};

