/**
 * A BAR CHART or a HISTOGRAM (section 8, `kind: bar` / `kind: histogram`).
 *
 * A bar chart has categories (`bars: [{label, value}]`), each a bar standing apart with its label
 * under it; a histogram has classes on a number line (`bins: [{from, to, value}]`), the bars
 * touching, each as wide as its class. The y axis runs from 0 to `y[1]` (or a tidy height above
 * the tallest bar), with `y_step` between its numbers.
 *
 * Arriving, the pen draws the axes, then each bar not marked `later` rises from the axis, its
 * value written on top. Parts: 'bar:1'… in order (from 1), 'bar:<label>' (a histogram's label
 * is '<from>-<to>'), and 'line:1'… for lines drawn across. Actions: grow (one bar rises, or every
 * later bar in turn), line (a level drawn across, e.g. the mean, with its words).
 */

import type { DiagramColour, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import { Axes, axesView, niceStep, type AxesSpec } from "../axes.js";
import {
  PALETTE,
  areaGlow,
  boxOfPoints,
  el,
  fmt,
  lineGlow,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { line, seedOf, shape } from "../rough.js";

interface Bar {
  index: number;
  label: string;
  value: number;
  x0: number;
  x1: number;
  colour: DiagramColour;
  later: boolean;
  drawn: boolean;
}

function axesOf(spec: LessonDiagram): AxesSpec {
  const histogram = spec.kind === "histogram";
  const values = histogram ? (spec.bins ?? []).map((b) => b.value) : (spec.bars ?? []).map((b) => b.value);
  const top = spec.y?.[1] ?? (() => {
    const most = Math.max(1, ...values);
    const step = niceStep(most, 5);
    return Math.ceil((most * 1.08) / step) * step;
  })();
  const bins = spec.bins ?? [];
  const x: [number, number] = histogram && bins.length
    ? [Math.min(...bins.map((b) => b.from)), Math.max(...bins.map((b) => b.to))]
    : [0, Math.max(1, (spec.bars ?? []).length)];
  return {
    x: spec.x ?? x,
    y: [0, top],
    xStep: spec.x_step ?? (histogram && bins.length ? bins[0]!.to - bins[0]!.from : 1),
    yStep: spec.y_step ?? spec.step ?? niceStep(top, 5),
    xLabel: spec.x_label,
    yLabel: spec.y_label,
    grid: spec.grid ?? true,
    crossing: false,
    xNumbers: histogram,
  };
}

class Bars implements Kind {
  axes: Axes;
  bars: Bar[];
  lines = 0;
  histogram: boolean;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const axesSpec = axesOf(spec);
    this.axes = new Axes(axesSpec, axesView(axesSpec).frame);
    this.histogram = spec.kind === "histogram";
    if (this.histogram) {
      this.bars = (spec.bins ?? []).map((b, index) => ({
        index,
        label: `${fmt(b.from)}-${fmt(b.to)}`,
        value: b.value,
        x0: this.axes.sx(b.from),
        x1: this.axes.sx(b.to),
        colour: b.colour ?? "blue",
        later: Boolean(b.later),
        drawn: false,
      }));
    } else {
      const list = spec.bars ?? [];
      const f = this.axes.frame;
      const slot = (f.right - f.left) / Math.max(1, list.length);
      this.bars = list.map((b, index) => ({
        index,
        label: b.label,
        value: b.value,
        x0: f.left + slot * index + slot * 0.2,
        x1: f.left + slot * (index + 1) - slot * 0.2,
        colour: b.colour ?? "blue",
        later: Boolean(b.later),
        drawn: false,
      }));
    }
  }

  private find(part: string | null | undefined): Bar | null {
    if (!part) return null;
    const m = /^bar:(.+)$/.exec(part.trim());
    if (!m) return null;
    const key = m[1]!.trim();
    const byLabel = this.bars.find((b) => b.label.toLowerCase() === key.toLowerCase());
    if (byLabel) return byLabel;
    const n = Number(key);
    return Number.isInteger(n) ? this.bars[n - 1] ?? null : null;
  }

  partFor(name: string) {
    const b = this.find(name);
    return b ? this.e.parts.get(`bar:${b.index + 1}`) ?? null : null;
  }

  /** The bar's outline at a height (in units from the axis), wobbling the same way each time. */
  private outline(b: Bar, h: number): string {
    const base = this.axes.frame.bottom;
    const rnd = seedOf(`${this.spec.id}|bar${b.index}`);
    return shape(
      [
        [b.x0, base],
        [b.x0, base - h],
        [b.x1, base - h],
        [b.x1, base],
      ],
      rnd,
    );
  }

  private grow(b: Bar): Build {
    const c = PALETTE[b.colour];
    const base = this.axes.frame.bottom;
    const full = base - this.axes.sy(b.value);
    const fill = el("path", { d: this.outline(b, 0.01), fill: c.fill, "fill-opacity": 0.55, stroke: "none" }, this.e.paint);
    const edge = this.e.stroke(this.e.ink, this.outline(b, 0.01), { width: 2.3 });
    const rising = (p: number) => {
      const q = p < 1 ? 1 - Math.pow(1 - p, 2.2) : 1;
      const d = this.outline(b, Math.max(0.01, full * q));
      fill.setAttribute("d", d);
      edge.setAttribute("d", d);
    };
    rising(0);
    const mid = (b.x0 + b.x1) / 2;
    const item = this.e.motion(260 + Math.min(700, full * 3), rising, (p) => [mid, base - full * (p < 1 ? 1 - Math.pow(1 - p, 2.2) : 1)]);
    const value = this.e.keep(this.e.text(this.e.words, mid, base - full - 11, fmt(b.value), { size: 15, colour: c.stroke }));
    // A bar chart's category under its bar; a histogram's classes are on its axis.
    const size = this.bars.length > 6 ? 13 : 15;
    const label = this.histogram ? null : this.e.keep(this.e.text(this.e.words, mid, base + 16, b.label, { size, weight: 600 }));
    b.drawn = true;
    this.e.parts.set(`bar:${b.index + 1}`, {
      name: `bar:${b.index + 1}`,
      info: `${b.label}: ${fmt(b.value)}`,
      anchor: [b.x1, base - full + 6],
      box: { x0: b.x0, y0: base - full, x1: b.x1, y1: base },
      glow: areaGlow(this.outline(b, full)),
    });
    return { items: [...(label ? this.e.plan([label]) : []), item, ...this.e.plan([value])] };
  }

  drawIn(): Build {
    const items = this.e.plan(...this.axes.draw(this.e));
    for (const b of this.bars) if (!b.later) items.push(...this.grow(b).items);
    return { items, totalMs: 5200 };
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "grow": {
        const one = this.find(op.part);
        const list = one ? (one.drawn ? [] : [one]) : this.bars.filter((b) => !b.drawn);
        const items = list.flatMap((b) => this.grow(b).items);
        return { items, sfx: "pop" };
      }
      case "line": {
        if (typeof op.y !== "number") return { items: [] };
        const colour: DiagramColour = op.answer ? "green" : op.colour ?? "purple";
        const c = PALETTE[colour];
        const f = this.axes.frame;
        const y = this.axes.sy(op.y);
        const d = line([f.left, y], [f.right + 4, y], this.e.rnd(`level${op.y}`));
        const stroke = this.e.stroke(this.e.marks, d, { colour: c.stroke, width: 2.6, dash: "9 6" });
        const words = op.text ?? fmt(op.y);
        const text = this.e.keep(this.e.text(this.e.marks, f.right, y - 11, words, { size: 16, colour: c.stroke, anchor: "end" }));
        this.lines += 1;
        const name = `line:${this.lines}`;
        this.e.parts.set(name, {
          name,
          info: words,
          anchor: [f.right, y],
          box: boxOfPoints([[f.left, y], [f.right, y]], 5),
          thin: true,
          glow: lineGlow(d, 9),
        });
        return { items: this.e.plan([stroke], [text]), sfx: op.answer ? "ding" : "pop", after: this.e.popAfter([text]) };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    const base = this.axes.frame.bottom;
    for (const b of this.bars) {
      if (!b.drawn) continue;
      const top = this.axes.sy(b.value);
      if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= Math.min(top, base - 8) - 4 && p[1] <= base + 20) return `bar:${b.index + 1}`;
    }
    for (const part of this.e.parts.values())
      if (part.name.startsWith("line:") && Math.abs(p[1] - part.anchor[1]) < 6 && p[0] >= part.box.x0 && p[0] <= part.box.x1)
        return part.name;
    return null;
  }

  describe(): string {
    return `A ${this.histogram ? "histogram" : "bar chart"}: ${this.bars.map((b) => `${b.label} ${fmt(b.value)}`).join(", ")}`;
  }
}

export const bar: KindModule = {
  view: (spec) => axesView(axesOf(spec)).size,
  create: (engine, spec) => new Bars(engine, spec),
};
