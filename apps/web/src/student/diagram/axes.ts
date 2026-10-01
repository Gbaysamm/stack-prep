/**
 * AXES for the live diagrams that have them (a graph, an ogive, a bar chart, a histogram): the
 * scale from values to the diagram's units, and the pen's strokes for the axes, their ticks,
 * their numbers and their names.
 *
 * A graph's axes cross at the origin where it is in range (with arrowheads on the positive
 * ends, and the origin marked O), as a maths graph is drawn; a chart's sit on its left and bottom
 * edges. Numbers are written with a real minus sign, every tick where there is room, else every
 * other one.
 */

import type { Pt } from "../ink.js";
import { FAINT, INK, SOFT, fmt, type DiagramEngine } from "./engine.js";
import { head, line } from "./rough.js";

export interface AxesSpec {
  x: [number, number];
  y: [number, number];
  xStep: number;
  yStep: number;
  xLabel?: string | null;
  yLabel?: string | null;
  grid?: boolean;
  /** Cross at the origin (a maths graph), or sit on the edges (a chart). */
  crossing: boolean;
  /** No numbers on the x axis (a bar chart writes its categories instead). */
  xNumbers?: boolean;
}

export interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A tidy step for a range: 1, 2 or 5 times a power of ten, giving about `ticks` ticks. */
export function niceStep(span: number, ticks = 8): number {
  const raw = Math.abs(span) / Math.max(1, ticks);
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

/** The view a set of axes needs: the frame for the plot, and the whole size. */
export function axesView(spec: AxesSpec, width = 360, maxPlotH = 270): { frame: Frame; size: [number, number] } {
  const padL = spec.crossing ? 26 : spec.yLabel ? 58 : 44;
  const padR = spec.crossing ? 26 : 18;
  const padT = spec.crossing ? 22 : 18;
  const padB = spec.crossing ? 26 : spec.xLabel ? 50 : 34;
  const plotW = width - padL - padR;
  let plotH: number;
  if (spec.crossing) {
    // Equal scales where they fit, as a maths graph should be; else squeezed upright.
    const k = plotW / (spec.x[1] - spec.x[0] || 1);
    plotH = Math.max(170, Math.min(maxPlotH, (spec.y[1] - spec.y[0]) * k));
  } else plotH = Math.min(maxPlotH, 200);
  const frame = { left: padL, right: padL + plotW, top: padT, bottom: padT + plotH };
  return { frame, size: [width, Math.round(padT + plotH + padB)] };
}

export class Axes {
  constructor(
    readonly spec: AxesSpec,
    readonly frame: Frame,
  ) {}

  sx(x: number): number {
    const [a, b] = this.spec.x;
    return this.frame.left + ((x - a) / (b - a || 1)) * (this.frame.right - this.frame.left);
  }

  sy(y: number): number {
    const [a, b] = this.spec.y;
    return this.frame.bottom - ((y - a) / (b - a || 1)) * (this.frame.bottom - this.frame.top);
  }

  at(x: number, y: number): Pt {
    return [this.sx(x), this.sy(y)];
  }

  /** A point in units back to values. */
  value(p: Pt): Pt {
    const [xa, xb] = this.spec.x;
    const [ya, yb] = this.spec.y;
    return [
      xa + ((p[0] - this.frame.left) / (this.frame.right - this.frame.left)) * (xb - xa),
      ya + ((this.frame.bottom - p[1]) / (this.frame.bottom - this.frame.top)) * (yb - ya),
    ];
  }

  /** Where the axes cross, in units: at 0 where it is in range, else the frame's edge. */
  origin(): Pt {
    const { x, y } = this.spec;
    const ox = this.spec.crossing && x[0] <= 0 && x[1] >= 0 ? this.sx(0) : this.frame.left;
    const oy = this.spec.crossing && y[0] <= 0 && y[1] >= 0 ? this.sy(0) : this.frame.bottom;
    return [ox, oy];
  }

  ticks(range: [number, number], step: number): number[] {
    const out: number[] = [];
    const first = Math.ceil(range[0] / step - 1e-9) * step;
    for (let v = first; v <= range[1] + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  /** Points along the two axes, every few units: notes keep clear of them. */
  trace(): Pt[] {
    const { frame } = this;
    const [ox, oy] = this.origin();
    const out: Pt[] = [];
    for (let x = frame.left; x <= frame.right; x += 5) out.push([x, oy]);
    for (let y = frame.top; y <= frame.bottom; y += 5) out.push([ox, y]);
    return out;
  }

  /**
   * The pen's groups for the axes, in teaching order: the grid (faint), the two axes, their
   * ticks, the numbers along each, and their names.
   */
  draw(engine: DiagramEngine): SVGGraphicsElement[][] {
    const { spec, frame } = this;
    const [ox, oy] = this.origin();
    const groups: SVGGraphicsElement[][] = [];
    const rnd = engine.rnd("axes");
    const xs = this.ticks(spec.x, spec.xStep);
    const ys = this.ticks(spec.y, spec.yStep);

    if (spec.grid) {
      let d = "";
      for (const x of xs) d += `M${this.sx(x).toFixed(1)} ${frame.top}V${frame.bottom}`;
      for (const y of ys) d += `M${frame.left} ${this.sy(y).toFixed(1)}H${frame.right}`;
      groups.push([engine.stroke(engine.paint, d, { colour: FAINT, width: 1 })]);
    }

    const ext = spec.crossing ? 12 : 8;
    const xAxis = engine.stroke(engine.ink, line([frame.left - (spec.crossing ? 8 : 0), oy], [frame.right + ext, oy], rnd, 1), {
      width: 2.2,
    });
    const yAxis = engine.stroke(engine.ink, line([ox, frame.bottom + (spec.crossing ? 8 : 0)], [ox, frame.top - ext], rnd, 1), {
      width: 2.2,
    });
    const heads = engine.stroke(
      engine.ink,
      head([frame.right + ext + 1, oy], [frame.right, oy], 7) + head([ox, frame.top - ext - 1], [ox, frame.top], 7),
      { width: 2.2 },
    );
    groups.push([xAxis, yAxis], [heads]);

    // Ticks, as one stroke each way.
    let ticks = "";
    if (spec.xNumbers !== false)
      for (const x of xs) {
        if (spec.crossing && Math.abs(x) < 1e-9) continue;
        const px = this.sx(x);
        ticks += `M${px.toFixed(1)} ${(oy - 4).toFixed(1)}V${(oy + 4).toFixed(1)}`;
      }
    for (const y of ys) {
      if (Math.abs(y - (spec.crossing ? 0 : spec.y[0])) < 1e-9) continue;
      const py = this.sy(y);
      ticks += `M${(ox - 4).toFixed(1)} ${py.toFixed(1)}H${(ox + 4).toFixed(1)}`;
    }
    if (ticks) groups.push([engine.stroke(engine.ink, ticks, { width: 1.6, colour: SOFT })]);

    // The numbers: every tick where they fit, else every other.
    const numbers: SVGGraphicsElement[] = [];
    if (spec.xNumbers !== false) {
      const room = (frame.right - frame.left) / Math.max(1, xs.length);
      const longest = Math.max(...xs.map((x) => fmt(x).length));
      const every = room < longest * 7 + 6 ? 2 : 1;
      const xText = engine.text(engine.words, 0, 0, "", { size: 13, colour: SOFT, weight: 600 });
      xs.forEach((x, i) => {
        if (spec.crossing && Math.abs(x) < 1e-9) return;
        if (i % every !== 0 && i !== xs.length - 1) return;
        const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        span.setAttribute("x", this.sx(x).toFixed(1));
        span.setAttribute("y", (oy + 18).toFixed(1));
        span.textContent = fmt(x);
        xText.appendChild(span);
      });
      xText.removeAttribute("x");
      xText.removeAttribute("y");
      numbers.push(engine.keep(xText));
    }
    const yRoom = (frame.bottom - frame.top) / Math.max(1, ys.length);
    const yEvery = yRoom < 15 ? 2 : 1;
    const yText = engine.text(engine.words, 0, 0, "", { size: 13, colour: SOFT, weight: 600, anchor: "end" });
    ys.forEach((y, i) => {
      if (spec.crossing && Math.abs(y) < 1e-9) return;
      if (i % yEvery !== 0 && i !== ys.length - 1) return;
      const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      span.setAttribute("x", (ox - 8).toFixed(1));
      span.setAttribute("y", (this.sy(y) + 4.5).toFixed(1));
      span.textContent = fmt(y);
      yText.appendChild(span);
    });
    yText.removeAttribute("x");
    yText.removeAttribute("y");
    numbers.push(engine.keep(yText));
    if (spec.crossing && spec.x[0] <= 0 && spec.x[1] >= 0 && spec.y[0] <= 0 && spec.y[1] >= 0)
      numbers.push(engine.keep(engine.text(engine.words, ox - 9, oy + 13, "O", { size: 13, colour: SOFT, weight: 600 })));
    groups.push(numbers);

    // The axes' names: by the arrowheads on a graph, along the edges on a chart.
    const names: SVGGraphicsElement[] = [];
    if (spec.crossing) {
      names.push(engine.keep(engine.text(engine.words, frame.right + 14, oy - 12, spec.xLabel || "x", { size: 17, cls: "ld-var" })));
      names.push(engine.keep(engine.text(engine.words, ox + 13, frame.top - 10, spec.yLabel || "y", { size: 17, cls: "ld-var" })));
    } else {
      if (spec.xLabel)
        names.push(
          engine.keep(engine.text(engine.words, (frame.left + frame.right) / 2, frame.bottom + 38, spec.xLabel, { size: 15, colour: INK })),
        );
      if (spec.yLabel) {
        const t = engine.text(engine.words, 0, 0, spec.yLabel, { size: 15, colour: INK });
        const cy = (frame.top + frame.bottom) / 2;
        t.setAttribute("x", "0");
        t.setAttribute("y", "0");
        t.setAttribute("transform", `translate(${(frame.left - 40).toFixed(1)} ${cy.toFixed(1)}) rotate(-90)`);
        names.push(t);
      }
    }
    if (names.length) groups.push(names);
    return groups;
  }
}
