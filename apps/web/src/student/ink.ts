/**
 * THE MARKER'S STROKES, shared by the marks over the working (Board.tsx) and the marks over a
 * question's diagram (FigureBoard.tsx), so a circle round a term and a circle round a point on
 * the figure are the same hand.
 *
 * Everything here is pure geometry: boxes and points in, SVG path data out. Each shape wobbles
 * the way a hand does, from a seeded generator, so a mark redrawn after the board changes size
 * wobbles the same way it did the first time rather than shimmering.
 *
 * Sizes are in the pixels of the board. A mark on a figure is drawn in the figure's own units
 * (its SVG viewBox), which are scaled to fit wherever the figure is shown; those callers pass
 * `k`, the figure's units per screen pixel, so a circle is as round and a stroke as thick there
 * as on the working.
 */

export type Pt = [number, number];

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A mark's few words: beside it on the right, on the left, centred above it, or centred on it. */
export interface Label {
  x: number;
  y: number;
  side: "right" | "left" | "above" | "center";
  text: string;
}

/** Whether the student has asked for less movement: marks then go up whole, nothing travels. */
export function stillMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A small seeded generator, so a mark wobbles the same way every time it is redrawn. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

/** A smooth open curve through the points (Catmull–Rom, as cubic Béziers). */
export function through(points: Pt[]): string {
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
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * A loop round a box, the way a hand circles something: an ellipse a little wider than it is
 * tall, begun at the upper left and carried a little past where it began.
 */
export function drawCircle(box: Box, rnd: () => number, k = 1): string {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const ry = Math.max(13 * k, (box.bottom - box.top) / 2 + 6 * k);
  // Never taller than it is wide: round a single figure, not bracket it.
  const rx = Math.max(ry + 5 * k, (box.right - box.left) / 2 + 10 * k);
  return drawLoop([cx, cy], rx, ry, 0, rnd);
}

/** The same loop about a centre, with its long axis turned by `turn` radians. */
export function drawLoop(centre: Pt, rx: number, ry: number, turn: number, rnd: () => number): string {
  const start = -2.35 + (rnd() - 0.5) * 0.3;
  // A hand does not close a circle exactly: it goes a little past where it began.
  const sweep = Math.PI * 2 + 0.5;
  const points: Pt[] = [];
  const count = 22;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const angle = start + sweep * t;
    const wobble = 1 + (rnd() - 0.5) * 0.06;
    const grow = 1 + 0.08 * t;
    const x = Math.cos(angle) * rx * grow * wobble;
    const y = Math.sin(angle) * ry * grow * wobble;
    points.push([centre[0] + x * cos - y * sin, centre[1] + x * sin + y * cos]);
  }
  return through(points);
}

/**
 * A highlighter pass along each row: a broad flat stroke, a touch uneven top and bottom and
 * not quite level, the way a chisel marker goes across words.
 */
export function drawHighlight(rows: Box[], rnd: () => number, k = 1): { d: string; width: number } {
  let d = "";
  let width = 0;
  for (const row of rows) {
    const height = row.bottom - row.top;
    width = Math.max(width, height * 0.82);
    const x0 = row.left - 3 * k + (rnd() - 0.5) * 2 * k;
    const x1 = row.right + 3 * k + (rnd() - 0.5) * 3 * k;
    const y = (row.top + row.bottom) / 2 + height * 0.04;
    const tilt = (rnd() - 0.5) * 2.2 * k;
    const points: Pt[] = [];
    const count = Math.max(3, Math.round((x1 - x0) / (60 * k)) + 2);
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      points.push([x0 + (x1 - x0) * t, y + tilt * (t - 0.5) + (rnd() - 0.5) * 1.4 * k]);
    }
    d += (d ? " " : "") + through(points);
  }
  return { d, width };
}

/** A crossing-out: one quick line through each row, rising a little, overshooting the ends. */
export function drawStrike(rows: Box[], rnd: () => number, k = 1): string {
  let d = "";
  for (const row of rows) {
    const height = row.bottom - row.top;
    const y = (row.top + row.bottom) / 2 + height * 0.06;
    const x0 = row.left - 5 * k;
    const x1 = row.right + 6 * k;
    const rise = Math.min(5 * k, (x1 - x0) * 0.03) + rnd() * 1.5 * k;
    const points: Pt[] = [];
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      points.push([x0 + (x1 - x0) * t, y + rise * (0.5 - t) + (rnd() - 0.5) * 1.6 * k]);
    }
    d += (d ? " " : "") + through(points);
  }
  return d;
}

/** A hand-drawn straight stroke from `a` to `b`: not quite straight, not quite even. */
export function drawStroke(a: Pt, b: Pt, rnd: () => number, k = 1): string {
  const points: Pt[] = [];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const bow = (rnd() - 0.5) * Math.min(4 * k, length * 0.04);
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const off = bow * Math.sin(Math.PI * t) + (rnd() - 0.5) * 0.9 * k;
    points.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  return through(points);
}

export function arrowHead(tip: Pt, from: Pt, size = 10): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const a1 = angle + Math.PI - 0.5;
  const a2 = angle + Math.PI + 0.5;
  return `M${f(tip[0] + Math.cos(a1) * size)} ${f(tip[1] + Math.sin(a1) * size)} L${f(tip[0])} ${f(tip[1])} L${f(tip[0] + Math.cos(a2) * size)} ${f(tip[1] + Math.sin(a2) * size)}`;
}

export function bezierAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + e * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + e * p3[1],
  ];
}

/** About how wide a label's chip is: 13px semibold, and its padding. */
export function labelWidth(text: string): number {
  return Math.min(text.length * 7.4 + 22, 260);
}

/** Room a label needs beside its mark before it is put on the other side instead. */
export const LABEL_ROOM = 150;

/* ---- Routes: the way a piece travels, as a run of close-set points ------------------------- */

/**
 * A ROUTE is the path an arrow or a moving piece takes, kept as points a few pixels apart
 * rather than as curves: the same points are drawn as the arrow's stroke, walked by the piece
 * that travels along it, and read back for where its head points. Keeping one list means the
 * piece can never drift off the line it leaves behind.
 */
export type Route = Pt[];

/** A cubic Bézier as close-set points. */
export function cubicRoute(p0: Pt, c1: Pt, c2: Pt, p3: Pt): Route {
  const length =
    Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) +
    Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) +
    Math.hypot(p3[0] - c2[0], p3[1] - c2[1]);
  const count = Math.max(8, Math.min(90, Math.round(length / 5)));
  const points: Route = [];
  for (let i = 0; i <= count; i += 1) points.push(bezierAt(p0, c1, c2, p3, i / count));
  return points;
}

/**
 * Straight runs joined by rounded corners — the way a hand takes a line round the end of a row
 * of working and down the margin, without the corners a ruler would leave.
 */
export function cornerRoute(corners: Pt[], radius: number): Route {
  if (corners.length < 3) return corners.length === 2 ? cubicRoute(corners[0]!, corners[0]!, corners[1]!, corners[1]!) : corners;
  const points: Route = [corners[0]!];
  for (let i = 1; i < corners.length - 1; i += 1) {
    const prev = corners[i - 1]!;
    const here = corners[i]!;
    const next = corners[i + 1]!;
    const inLength = Math.hypot(here[0] - prev[0], here[1] - prev[1]) || 1;
    const outLength = Math.hypot(next[0] - here[0], next[1] - here[1]) || 1;
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const a: Pt = [here[0] - ((here[0] - prev[0]) / inLength) * r, here[1] - ((here[1] - prev[1]) / inLength) * r];
    const b: Pt = [here[0] + ((next[0] - here[0]) / outLength) * r, here[1] + ((next[1] - here[1]) / outLength) * r];
    const last = points[points.length - 1]!;
    points.push(...straight(last, a).slice(1));
    // The corner itself: a quadratic curve with the corner as its control point.
    for (let s = 1; s <= 6; s += 1) {
      const t = s / 6;
      const u = 1 - t;
      points.push([
        u * u * a[0] + 2 * u * t * here[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * here[1] + t * t * b[1],
      ]);
    }
  }
  const last = points[points.length - 1]!;
  points.push(...straight(last, corners[corners.length - 1]!).slice(1));
  return points;
}

function straight(a: Pt, b: Pt): Route {
  const count = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
  const points: Route = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return points;
}

/**
 * A hand's unsteadiness along a route: a slow sideways drift of a pixel or so, none at the
 * ends, so the stroke still starts and lands exactly where it was aimed.
 */
export function unsteady(route: Route, rnd: () => number, amount = 1): Route {
  const phase = rnd() * Math.PI * 2;
  const waves = 1.5 + rnd() * 1.5;
  return route.map((point, i) => {
    const prev = route[i - 1] ?? point;
    const next = route[i + 1] ?? point;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    const t = i / Math.max(1, route.length - 1);
    const off = Math.sin(phase + t * Math.PI * 2 * waves) * amount * Math.sin(Math.PI * t);
    return [point[0] - (dy / length) * off, point[1] + (dx / length) * off] as Pt;
  });
}

/** How far along the route each point is. */
export function distances(route: Route): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1]!;
    const b = route[i]!;
    out.push(out[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/** The point `s` pixels along the route. */
export function along(route: Route, lengths: number[], s: number): Pt {
  const total = lengths[lengths.length - 1] ?? 0;
  const at = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < at) i += 1;
  const a = route[i - 1] ?? route[0]!;
  const b = route[i] ?? a;
  const span = (lengths[i] ?? 0) - (lengths[i - 1] ?? 0) || 1;
  const t = (at - (lengths[i - 1] ?? 0)) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The stroke and the head of an arrow along a route: the head aimed along its last stretch. */
export function arrowAlong(route: Route, size = 10): { d: string; head: string } {
  const lengths = distances(route);
  const total = lengths[lengths.length - 1] ?? 0;
  const tip = route[route.length - 1] ?? [0, 0];
  const back = along(route, lengths, total - Math.min(total * 0.4, size * 1.3));
  // Drawn through every third point: close enough to follow the route, far enough apart that
  // the curve is smooth rather than faceted.
  const sparse = route.filter((_, i) => i % 3 === 0 || i === route.length - 1);
  return { d: through(sparse), head: arrowHead(tip, back, size) };
}

/** The pause between one mark in a moment and the next. */
export const MARK_STAGGER_S = 0.55;

/** The time a `move` takes before the next mark: lifted, carried, set down. */
const MOVE_TURN_S = 1.7;

/**
 * When each of a moment's marks starts, in seconds: in the order the lesson lists them, each
 * after the one before — and after a moving piece has landed — whether it is drawn over the
 * working or over the figure, so the two stay in the one order the teacher points in.
 */
export function markDelays(points: { kind: string }[]): number[] {
  const delays: number[] = [];
  points.reduce((wait, point) => {
    delays.push(wait);
    return wait + (point.kind === "move" ? MOVE_TURN_S : MARK_STAGGER_S);
  }, 0);
  return delays;
}
