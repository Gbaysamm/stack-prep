/**
 * AN OGIVE (section 8, `kind: ogive`): a cumulative frequency curve. `points: [[x, cf], …]` are
 * the upper class boundaries and the running totals; `start: [x, 0]` (optional) is where the
 * curve begins at nothing. The axes sit on the chart's edges, from 0 up to a tidy height over
 * the last total (or `y`), with `x_label` and `y_label` along them.
 *
 * Arriving, the pen draws the axes and, unless the description says `later: true`, plots the
 * points one by one and joins them with a smooth curve. Actions: plot (the same, later), read
 * (from a value on one axis, a dashed line across to the curve and on to the other axis, the
 * value read written at its foot: `y: 20` reads the median of 40, `x: 35` reads how many scored
 * 35 or less). Parts: 'curve', 'point:1'… (the plotted points, from 1), 'read:1'….
 */

import type { DiagramColour, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import { Axes, axesView, niceStep, type AxesSpec } from "../axes.js";
import {
  PALETTE,
  boxOfPoints,
  dotGlow,
  fmt,
  lineGlow,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { line, poly, smooth } from "../rough.js";

function dataOf(spec: LessonDiagram): Pt[] {
  const points = (spec.points ?? []).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2);
  return spec.start ? [spec.start, ...points] : points;
}

function axesOf(spec: LessonDiagram): AxesSpec {
  const data = dataOf(spec);
  const xs = data.map((p) => p[0]);
  const top = spec.y?.[1] ?? (() => {
    const most = Math.max(1, ...data.map((p) => p[1]));
    const step = niceStep(most, 6);
    return Math.ceil((most * 1.05) / step) * step;
  })();
  const x: [number, number] = spec.x ?? [Math.min(0, ...xs), Math.max(1, ...xs)];
  return {
    x,
    y: [0, top],
    xStep: spec.x_step ?? spec.step ?? niceStep(x[1] - x[0], 7),
    yStep: spec.y_step ?? niceStep(top, 6),
    xLabel: spec.x_label,
    yLabel: spec.y_label ?? "cumulative frequency",
    grid: spec.grid ?? true,
    crossing: false,
  };
}

class Ogive implements Kind {
  axes: Axes;
  data: Pt[];
  curve: SVGPathElement | null = null;
  samples: Pt[] = [];
  reads = 0;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const axesSpec = axesOf(spec);
    this.axes = new Axes(axesSpec, { ...axesView(axesSpec, 360, 230).frame });
    this.data = dataOf(spec);
  }

  private plot(): SVGGraphicsElement[][] {
    const at = this.data.map(([x, y]) => this.axes.at(x, y));
    const c = PALETTE.blue;
    const groups: SVGGraphicsElement[][] = [];
    // Each point a small cross, as one is plotted by hand.
    const crosses = at.map((p, i) => {
      const r = 4;
      const d = `M${p[0] - r} ${p[1] - r}L${p[0] + r} ${p[1] + r}M${p[0] + r} ${p[1] - r}L${p[0] - r} ${p[1] + r}`;
      const name = `point:${i + 1}`;
      const [x, y] = this.data[i]!;
      this.e.parts.set(name, { name, info: `(${fmt(x)}, ${fmt(y)}): ${fmt(y)} up to ${fmt(x)}`, anchor: p, box: boxOfPoints([p], 6), glow: dotGlow(p, 9) });
      return this.e.stroke(this.e.marks, d, { colour: c.stroke, width: 2.2 });
    });
    groups.push(...crosses.map((one) => [one]));
    const d = smooth(at);
    this.curve = this.e.stroke(this.e.ink, d, { colour: c.stroke, width: 2.8 });
    groups.push([this.curve]);
    this.samples = this.sample(d);
    this.e.inked.push(...this.samples.filter((_, i) => i % 3 === 0));
    this.e.parts.set("curve", {
      name: "curve",
      info: "the cumulative frequency curve",
      anchor: at[Math.floor(at.length * 0.7)] ?? at[0] ?? [0, 0],
      box: boxOfPoints(at.length ? at : [[0, 0]], 4),
      thin: true,
      glow: lineGlow(d, 10),
    });
    return groups;
  }

  /** Points along the drawn curve (as drawn: the smooth one), for reading off it. */
  private sample(d: string): Pt[] {
    const probe = this.e.stroke(this.e.hover, d, { opacity: 0 });
    const out: Pt[] = [];
    try {
      const length = probe.getTotalLength();
      for (let i = 0; i <= 300; i += 1) {
        const p = probe.getPointAtLength((length * i) / 300);
        out.push([p.x, p.y]);
      }
    } catch {
      out.push(...this.data.map(([x, y]) => this.axes.at(x, y)));
    }
    probe.remove();
    return out;
  }

  /** Where the curve is at a height (in units), or at an x (in units). */
  private crossing(value: number, axis: "y" | "x"): Pt | null {
    const k = axis === "y" ? 1 : 0;
    for (let i = 1; i < this.samples.length; i += 1) {
      const a = this.samples[i - 1]!;
      const b = this.samples[i]!;
      if ((a[k] - value) * (b[k] - value) <= 0 && a[k] !== b[k]) {
        const t = (value - a[k]) / (b[k] - a[k]);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return null;
  }

  drawIn(): Build {
    const groups = this.axes.draw(this.e);
    this.e.inked.push(...this.axes.trace());
    if (!this.spec.later) groups.push(...this.plot());
    return { items: this.e.plan(...groups), totalMs: 5200 };
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "plot": {
        if (this.curve) return { items: [] };
        return { items: this.e.plan(...this.plot()), sfx: "scribble" };
      }
      case "read": {
        if (!this.curve) return { items: [] };
        const colour: DiagramColour = op.answer ? "green" : op.colour ?? "orange";
        const c = PALETTE[colour];
        const f = this.axes.frame;
        const byY = typeof op.y === "number";
        const value = byY ? op.y! : typeof op.x === "number" ? op.x : null;
        if (value === null) return { items: [] };
        const hit = byY ? this.crossing(this.axes.sy(value), "y") : this.crossing(this.axes.sx(value), "x");
        if (!hit) return { items: [] };
        const [vx, vy] = this.axes.value(hit);
        const start: Pt = byY ? [f.left, hit[1]] : [hit[0], f.bottom];
        const foot: Pt = byY ? [hit[0], f.bottom] : [f.left, hit[1]];
        const rnd = this.e.rnd(`read${value}`);
        const first = this.e.stroke(this.e.marks, line(start, hit, rnd), { colour: c.stroke, width: 2.3, dash: "7 5" });
        const second = this.e.stroke(this.e.marks, line(hit, foot, rnd), { colour: c.stroke, width: 2.3, dash: "7 5" });
        const dot = this.e.dot(this.e.marks, hit, { colour: c.stroke, r: 4 });
        const given = byY
          ? this.e.text(this.e.marks, f.left + 6, hit[1] - 10, fmt(value), { size: 15, colour: c.stroke, anchor: "start" })
          : this.e.text(this.e.marks, hit[0] + 5, f.bottom - 10, fmt(value), { size: 15, colour: c.stroke, anchor: "start" });
        this.e.keep(given);
        const read = byY ? vx : vy;
        const words = op.text ?? `≈ ${fmt(read, 1)}`;
        const label = byY
          ? this.e.text(this.e.marks, foot[0] + 6, f.bottom - 12, words, { size: 17, colour: c.stroke, anchor: "start" })
          : this.e.text(this.e.marks, f.left + 6, foot[1] - 12, words, { size: 17, colour: c.stroke, anchor: "start" });
        this.e.keep(label);
        this.reads += 1;
        const name = `read:${this.reads}`;
        this.e.parts.set(name, {
          name,
          info: `${byY ? `at ${fmt(value)}` : `at x = ${fmt(value)}`}: ${words}`,
          anchor: hit,
          box: boxOfPoints([start, hit, foot], 5),
          thin: true,
          glow: lineGlow(poly([start, hit, foot]), 8),
        });
        return { items: this.e.plan([given], [first], [dot], [second], [label]), sfx: op.answer ? "ding" : "pop", after: this.e.popAfter([label]) };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    let best: { name: string; d: number } | null = null;
    for (const part of this.e.parts.values()) {
      if (!part.name.startsWith("point:")) continue;
      const d = Math.hypot(part.anchor[0] - p[0], part.anchor[1] - p[1]);
      if (d < 11 && (!best || d < best.d)) best = { name: part.name, d };
    }
    return best?.name ?? null;
  }

  probe(p: Pt): { at: Pt; text: string } | null {
    let best: { at: Pt; d: number } | null = null;
    for (const s of this.samples) {
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < 24 && (!best || d < best.d)) best = { at: s, d };
    }
    if (!best) return null;
    const [x, y] = this.axes.value(best.at);
    return { at: best.at, text: `${fmt(y, 1)} up to ${fmt(x, 1)}` };
  }

  describe(): string {
    return `A cumulative frequency curve through ${this.data.map(([x, y]) => `(${fmt(x)}, ${fmt(y)})`).join(", ")}`;
  }
}

export const ogive: KindModule = {
  view: (spec) => axesView(axesOf(spec), 360, 230).size,
  create: (engine, spec) => new Ogive(engine, spec),
};
