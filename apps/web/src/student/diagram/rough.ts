/**
 * THE HAND THAT DRAWS A LIVE DIAGRAM: path data for lines, loops, arcs and boxes that wobble the
 * way a marker on a whiteboard does (after the rough.js look of the SternHost videos, but
 * gentler: a diagram has to be read, so a line bows a little and overshoots its corner a touch,
 * and a circle is closed a little past where it began).
 *
 * Everything is seeded (ink.ts `seeded`), so a diagram drawn again after the board changes size
 * wobbles exactly as it did the first time. Sizes are in the diagram's own units, which are
 * about a screen pixel each.
 */

import { seeded, type Pt } from "../ink.js";

const f = (n: number) => n.toFixed(1);

/** A seeded generator from a string: the same diagram part always wobbles the same way. */
export function seedOf(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return seeded(h >>> 0);
}

/** Points as a polyline's path data. */
export function poly(points: Pt[], close = false): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("") + (close ? "Z" : "");
}

/** A smooth curve through the points (Catmull–Rom as cubic Béziers). */
export function smooth(points: Pt[]): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${f(first[0])} ${f(first[1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * The points of a hand-drawn straight stroke from a to b: a gentle bow, a little tremor, and the
 * ends run on a touch past the corners (`over`, in units) as a quick hand does.
 */
export function handLine(a: Pt, b: Pt, rnd: () => number, over = 0): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const bow = (rnd() - 0.5) * Math.min(3.2, length * 0.018);
  const start: Pt = [a[0] - ux * over * rnd(), a[1] - uy * over * rnd()];
  const end: Pt = [b[0] + ux * over * (0.4 + rnd() * 0.6), b[1] + uy * over * (0.4 + rnd() * 0.6)];
  const steps = Math.max(2, Math.min(6, Math.round(length / 40)));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const off = bow * Math.sin(Math.PI * t) + (i && i < steps ? (rnd() - 0.5) * 0.5 : 0);
    out.push([start[0] + (end[0] - start[0]) * t + nx * off, start[1] + (end[1] - start[1]) * t + ny * off]);
  }
  return out;
}

/** A hand-drawn straight stroke as path data. */
export function line(a: Pt, b: Pt, rnd: () => number, over = 0): string {
  return smooth(handLine(a, b, rnd, over));
}

/**
 * A hand-drawn ellipse: begun at the upper left, carried round a little past where it began, and
 * very slightly egg-shaped, so it reads as drawn, not stamped.
 */
export function loop(cx: number, cy: number, rx: number, ry: number, rnd: () => number, past = 0.06): string {
  const start = -Math.PI * 0.75 + (rnd() - 0.5) * 0.4;
  const turn = Math.PI * 2 * (1 + past);
  const steps = 48;
  const wob = 0.012 + rnd() * 0.01;
  const phase = rnd() * Math.PI * 2;
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (i / steps) * turn;
    // The loop ends a hair off its start, as a hand's does.
    const drift = 1 + (i / steps) * 0.012 + wob * Math.sin(2 * t + phase);
    points.push([cx + Math.cos(t) * rx * drift, cy + Math.sin(t) * ry * drift]);
  }
  return smooth(points);
}

/** The points of a circle's arc from angle a0 to a1 (radians, clockwise on screen). */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, rnd?: () => number): Pt[] {
  const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.12));
  const wob = rnd ? (rnd() - 0.5) * 0.012 : 0;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    const rr = r * (1 + wob * Math.sin(Math.PI * (i / steps)));
    out.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
  }
  return out;
}

/** A hand-drawn box: four strokes, each running a touch past its corner, in one path. */
export function box(x0: number, y0: number, x1: number, y1: number, rnd: () => number, over = 2): string {
  const corners: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return corners.map((a, i) => line(a, corners[(i + 1) % 4]!, rnd, over)).join("");
}

/** A closed outline through the points (a sector, a bar), each side a hand-drawn stroke. */
export function shape(points: Pt[], rnd: () => number): string {
  const all: Pt[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const run = handLine(a, b, rnd, 0);
    all.push(...(i ? run.slice(1) : run));
  });
  return smooth(all) + "Z";
}

/** An open arrowhead at `tip`, coming from `from`. */
export function head(tip: Pt, from: Pt, size = 8): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const a1 = angle + Math.PI - 0.45;
  const a2 = angle + Math.PI + 0.45;
  return `M${f(tip[0] + Math.cos(a1) * size)} ${f(tip[1] + Math.sin(a1) * size)}L${f(tip[0])} ${f(tip[1])}L${f(tip[0] + Math.cos(a2) * size)} ${f(tip[1] + Math.sin(a2) * size)}`;
}

/** A gentle curve from a to b bowed to one side by `bend` (a share of its length). */
export function bowed(a: Pt, b: Pt, bend: number): { d: string; control: Pt; at: (t: number) => Pt } {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const control: Pt = [mx - (b[1] - a[1]) * bend, my + (b[0] - a[0]) * bend];
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * control[0] + t * t * b[0], u * u * a[1] + 2 * u * t * control[1] + t * t * b[1]];
  };
  const points: Pt[] = [];
  for (let i = 0; i <= 16; i += 1) points.push(at(i / 16));
  return { d: smooth(points), control, at };
}
