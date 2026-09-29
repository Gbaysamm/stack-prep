/**
 * THE FIGURE IN THE WORKING, and the teacher's marks on it.
 *
 * A geometry step points into the diagram — "the angle at R", "the tangent PQ" — and a student
 * cannot follow it with the picture left behind at the top of the board. So a question's figure
 * is kept in the working: on a wide screen in a column of its own beside the lines, held in
 * view while the working scrolls past; on a phone pinned over the working, where it can be
 * folded away. And the lesson can mark the figure itself as it marks a line: circle the point
 * B, trace the side AB, draw the arc of the angle at B with its size beside it, point an arrow
 * at a point, write a few words at a place.
 *
 * THE PICTURE IS STILL ONLY A PICTURE. The figure is shown through <img>, as everywhere else
 * (see Figures.tsx): nothing in it runs. To know where its points are, the same file is also
 * fetched as text (it is our own, from our own server) and read — never put into the page as
 * it came. What is read is copied, element by element, into a clean drawing that holds only
 * geometry (paths, circles, lines, text and the attributes that place them; no styles, links,
 * scripts or anything else), mounted out of sight just long enough for the browser to measure
 * it, and removed. Measuring in the browser, rather than reading numbers out of the markup,
 * means every label is found where it is really drawn: text anchored at its end or middle,
 * turned on its side, or moved by a group's transform.
 *
 * FINDING A POINT FROM ITS LABEL. The drawings print one label per point, beside the point, and
 * most mark the point with a small filled dot. A label is matched to its point like this:
 *
 *   1. the dots (filled circles no more than 5 units across the radius) near the label — within
 *      about two and a half letter-heights of the label's box;
 *   2. failing a dot, the ends of the straight lines (path segments, polygon and line
 *      elements) near it, a corner where several lines meet counting as nearer;
 *   3. failing those, the centre of a drawn circle near it, then the nearest place on a drawn
 *      circle's rim.
 *
 * A candidate is only taken if this label is the nearest label to it — so the x written inside
 * an angle, which sits close to the vertex, is not mistaken for the vertex's own letter. A label
 * that owns no point (an angle's name, a size like 44°, a curve's equation) is a place of its
 * own: marks on it are drawn round its words.
 *
 * Marks are drawn in the figure's own units in an overlay with the drawing's viewBox, laid
 * exactly over the image, so they scale with it; line widths and sizes are given in screen
 * pixels and converted, so a mark on a figure shown small on a phone is as bold as one on the
 * working.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { QuestionFigure } from "../Figures.js";
import type { FigureSpot, LessonPoint } from "./api.js";
import {
  arrowAlong,
  cubicRoute,
  drawCircle,
  drawHighlight,
  drawLoop,
  drawStrike,
  drawStroke,
  labelWidth,
  markDelays,
  seeded,
  through,
  unsteady,
  type Box,
  type Pt,
} from "./ink.js";

/** The marks a moment has drawn, as the board keeps them (see `MarkSet` in Board.tsx). */
export interface FigureMarkSet {
  index: number;
  points: LessonPoint[];
  state: "live" | "past" | "gone";
}

/* ---- Reading a drawing ------------------------------------------------------------------- */

interface PrintedLabel {
  text: string;
  box: Box;
  centre: Pt;
  /** Its letter height, in the drawing's units. */
  size: number;
}

interface Ring {
  centre: Pt;
  r: number;
}

interface Geometry {
  view: { x: number; y: number; w: number; h: number };
  labels: PrintedLabel[];
  dots: Pt[];
  rings: Ring[];
  segments: [Pt, Pt][];
  /** Where straight lines end, with how many of them meet there. */
  ends: { at: Pt; count: number }[];
  centroid: Pt;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** What the clean copy keeps: shapes, text and what places them. Nothing else crosses over. */
const KEEP_TAGS = new Set([
  "svg", "g", "text", "tspan", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect",
]);
const KEEP_ATTRS = new Set([
  "viewBox", "width", "height", "x", "y", "dx", "dy", "d", "cx", "cy", "r", "rx", "ry",
  "x1", "y1", "x2", "y2", "points", "transform", "font-family", "font-size", "font-weight",
  "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "fill", "stroke",
  "stroke-width",
]);

function cleanCopy(source: Element): SVGElement | null {
  const tag = source.localName;
  if (!KEEP_TAGS.has(tag)) return null;
  const copy = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const attribute of Array.from(source.attributes)) {
    if (!KEEP_ATTRS.has(attribute.name)) continue;
    // Colours are kept only as plain values: nothing that could point elsewhere.
    if (/url\s*\(/i.test(attribute.value)) continue;
    copy.setAttribute(attribute.name, attribute.value);
  }
  if (tag === "text" || tag === "tspan") {
    const children = Array.from(source.children).filter((child) => child.localName === "tspan");
    if (children.length === 0) copy.textContent = source.textContent;
    else for (const child of children) {
      const inner = cleanCopy(child);
      if (inner) copy.appendChild(inner);
    }
    return copy;
  }
  for (const child of Array.from(source.children)) {
    const inner = cleanCopy(child);
    if (inner) copy.appendChild(inner);
  }
  return copy;
}

/** The straight pieces of a path, and whether each point is a line's end, from its `d`. */
function pathLines(d: string): [Pt, Pt][] {
  const tokens = d.match(/[MmLlHhVvZzAaCcSsQqTt]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const lines: [Pt, Pt][] = [];
  let at = 0;
  let command = "";
  let here: Pt = [0, 0];
  let begin: Pt = [0, 0];
  const num = () => Number(tokens[at++]);
  const counts: Record<string, number> = {
    m: 2, l: 2, h: 1, v: 1, z: 0, a: 7, c: 6, s: 4, q: 4, t: 2,
  };
  while (at < tokens.length) {
    const token = tokens[at]!;
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      at += 1;
      if (command === "Z" || command === "z") {
        if (here[0] !== begin[0] || here[1] !== begin[1]) lines.push([here, begin]);
        here = begin;
        continue;
      }
    } else if (!command) break;
    const lower = command.toLowerCase();
    const relative = command !== command.toUpperCase();
    const need = counts[lower] ?? 0;
    if (need === 0 || at + need > tokens.length) break;
    const base: Pt = relative ? here : [0, 0];
    if (lower === "m") {
      here = [base[0] + num(), base[1] + num()];
      begin = here;
      // Pairs after a move are lines.
      command = relative ? "l" : "L";
    } else if (lower === "l") {
      const next: Pt = [base[0] + num(), base[1] + num()];
      lines.push([here, next]);
      here = next;
    } else if (lower === "h") {
      const next: Pt = [(relative ? here[0] : 0) + num(), here[1]];
      lines.push([here, next]);
      here = next;
    } else if (lower === "v") {
      const next: Pt = [here[0], (relative ? here[1] : 0) + num()];
      lines.push([here, next]);
      here = next;
    } else {
      // A curve: skip to its end point. Its ends are not corners of the figure's lines.
      for (let i = 0; i < need - 2; i += 1) num();
      here = [base[0] + num(), base[1] + num()];
    }
  }
  return lines;
}

type Matrix = DOMMatrix;

function apply(m: Matrix, p: Pt): Pt {
  return [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f];
}

/** Measure the drawing in the browser: a clean copy, mounted out of sight, then removed. */
function measure(markup: string): Geometry | null {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const source = parsed.documentElement;
  if (!source || source.localName !== "svg" || parsed.querySelector("parsererror")) return null;
  const view = (source.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = Number.parseFloat(source.getAttribute("width") ?? "") || view[2] || 300;
  const height = Number.parseFloat(source.getAttribute("height") ?? "") || view[3] || 200;
  const box =
    view.length === 4 && view.every(Number.isFinite)
      ? { x: view[0]!, y: view[1]!, w: view[2]!, h: view[3]! }
      : { x: 0, y: 0, w: width, h: height };
  const svg = cleanCopy(source) as SVGSVGElement | null;
  if (!svg) return null;
  svg.setAttribute("width", String(box.w));
  svg.setAttribute("height", String(box.h));
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:strict;" +
    `width:${box.w}px;height:${box.h}px;`;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const rootInverse = svg.getScreenCTM()?.inverse();
    const toRoot = (element: SVGGraphicsElement): Matrix | null => {
      const screen = element.getScreenCTM();
      return rootInverse && screen ? rootInverse.multiply(screen) : null;
    };
    const labels: PrintedLabel[] = [];
    svg.querySelectorAll<SVGTextElement>("text").forEach((element) => {
      const text = (element.textContent ?? "").trim();
      const m = toRoot(element);
      if (!text || !m) return;
      const b = element.getBBox();
      const corners = [
        apply(m, [b.x, b.y]),
        apply(m, [b.x + b.width, b.y]),
        apply(m, [b.x, b.y + b.height]),
        apply(m, [b.x + b.width, b.y + b.height]),
      ];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const lb: Box = {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      };
      labels.push({
        text,
        box: lb,
        centre: [(lb.left + lb.right) / 2, (lb.top + lb.bottom) / 2],
        size: Math.min(lb.right - lb.left, lb.bottom - lb.top) || 12,
      });
    });
    const dots: Pt[] = [];
    const rings: Ring[] = [];
    svg.querySelectorAll<SVGCircleElement>("circle").forEach((element) => {
      const m = toRoot(element);
      if (!m) return;
      const centre = apply(m, [element.cx.baseVal.value, element.cy.baseVal.value]);
      const r = element.r.baseVal.value * Math.hypot(m.a, m.b);
      const fill = (element.getAttribute("fill") ?? inherited(element, "fill") ?? "black").trim();
      if (r <= 5 && fill !== "none") dots.push(centre);
      else if (r > 5) rings.push({ centre, r });
    });
    const segments: [Pt, Pt][] = [];
    svg.querySelectorAll<SVGGraphicsElement>("path, line, polyline, polygon").forEach((element) => {
      const m = toRoot(element);
      if (!m) return;
      let lines: [Pt, Pt][] = [];
      if (element.localName === "path") lines = pathLines(element.getAttribute("d") ?? "");
      else if (element.localName === "line") {
        const n = (name: string) => Number.parseFloat(element.getAttribute(name) ?? "0");
        lines = [[[n("x1"), n("y1")], [n("x2"), n("y2")]]];
      } else {
        const values = (element.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
        const points: Pt[] = [];
        for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i]!, values[i + 1]!]);
        for (let i = 1; i < points.length; i += 1) lines.push([points[i - 1]!, points[i]!]);
        if (element.localName === "polygon" && points.length > 2)
          lines.push([points[points.length - 1]!, points[0]!]);
      }
      for (const [a, b] of lines) {
        const pa = apply(m, a);
        const pb = apply(m, b);
        // Tick marks and right-angle marks are short; they are not the figure's lines.
        if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 12) continue;
        segments.push([pa, pb]);
      }
    });
    const ends: { at: Pt; count: number }[] = [];
    for (const segment of segments)
      for (const p of segment) {
        const same = ends.find((e) => Math.hypot(e.at[0] - p[0], e.at[1] - p[1]) < 2.5);
        if (same) same.count += 1;
        else ends.push({ at: p, count: 1 });
      }
    const all: Pt[] = [...dots, ...ends.map((e) => e.at)];
    const centroid: Pt = all.length
      ? [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length]
      : [box.x + box.w / 2, box.y + box.h / 2];
    return { view: box, labels, dots, rings, segments, ends, centroid };
  } finally {
    host.remove();
  }
}

function inherited(element: Element, name: string): string | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const value = node.getAttribute(name);
    if (value) return value;
  }
  return null;
}

const readings = new Map<string, Promise<Geometry | null>>();

/** The drawing's geometry, read once per figure and kept for the page's life. */
function useGeometry(url: string, markup?: string): Geometry | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useEffect(() => {
    let live = true;
    let reading = readings.get(url);
    if (!reading && markup !== undefined) {
      // A lesson's sketch arrives as its own text: nothing to fetch.
      reading = Promise.resolve(measure(markup));
      readings.set(url, reading);
    }
    if (!reading) {
      reading = fetch(url, { credentials: "same-origin" })
        .then((response) => {
          const type = response.headers.get("content-type") ?? "";
          return response.ok && type.includes("svg") ? response.text() : null;
        })
        .then((markup) => (markup ? measure(markup) : null))
        .catch(() => null);
      readings.set(url, reading);
    }
    void reading.then((found) => {
      if (live) setGeometry(found);
    });
    return () => {
      live = false;
    };
  }, [url, markup]);
  return geometry;
}

/* ---- Finding what a mark names ----------------------------------------------------------- */

function gap(p: Pt, box: Box): number {
  const dx = Math.max(box.left - p[0], 0, p[0] - box.right);
  const dy = Math.max(box.top - p[1], 0, p[1] - box.bottom);
  return Math.hypot(dx, dy);
}

/** The point a label names (see the head of this file), or null for a label of its own. */
function pointOf(geo: Geometry, label: PrintedLabel): Pt | null {
  const reach = Math.max(24, label.size * 2.5);
  const nearestLabelIs = (p: Pt) => {
    let best: PrintedLabel | null = null;
    for (const other of geo.labels) if (!best || gap(p, other.box) < gap(p, best.box)) best = other;
    return best === label;
  };
  const pick = (candidates: { at: Pt; score: number }[]) =>
    candidates
      .filter((c) => gap(c.at, label.box) <= reach)
      .sort((a, b) => a.score - b.score)
      .find((c) => nearestLabelIs(c.at))?.at ?? null;
  return (
    pick(geo.dots.map((at) => ({ at, score: gap(at, label.box) }))) ??
    pick(geo.ends.map((e) => ({ at: e.at, score: gap(e.at, label.box) - 3 * (e.count - 1) }))) ??
    pick(geo.rings.map((ring) => ({ at: ring.centre, score: gap(ring.centre, label.box) }))) ??
    pick(
      geo.rings.map((ring) => {
        const dx = label.centre[0] - ring.centre[0];
        const dy = label.centre[1] - ring.centre[1];
        const d = Math.hypot(dx, dy) || 1;
        const at: Pt = [ring.centre[0] + (dx / d) * ring.r, ring.centre[1] + (dy / d) * ring.r];
        return { at, score: gap(at, label.box) };
      }),
    )
  );
}

/** One place a target names: a point (with its printed label, if any) or a label on its own. */
interface Place {
  at: Pt;
  label: PrintedLabel | null;
  /** True where this is a point of the figure; false for a label with no point of its own. */
  isPoint: boolean;
}

/** A label as it is matched: spaces ignored, every minus or dash the same minus. */
function normLabel(text: string): string {
  return text.replace(/\s+/g, "").replace(/[−–]/g, "-");
}

/**
 * The printed labels a target names (lesson_marks.py `split_target` is the same rule): a
 * label's whole text — 'B', '(0, 4)', '1 − √2' — or a list of them; and only where the whole
 * text is no label and every character is a one-letter label, the shorthand 'AB' (a side) or
 * 'ABC' (an angle).
 */
function splitTarget(target: string | string[], labels: PrintedLabel[]): PrintedLabel[] | null {
  const byText = (text: string) =>
    labels.find((label) => normLabel(label.text) === normLabel(text)) ?? null;
  if (Array.isArray(target)) {
    const found = target.map(byText);
    return found.every(Boolean) ? (found as PrintedLabel[]) : null;
  }
  const whole = byText(target);
  if (whole) return [whole];
  const letters = Array.from(normLabel(target));
  const found = letters.map((char) => (/\p{L}/u.test(char) ? byText(char) : null));
  return letters.length > 0 && found.every(Boolean) ? (found as PrintedLabel[]) : null;
}

function places(geo: Geometry, target: LessonPoint["target"]): Place[] | null {
  if (!target) return null;
  if (typeof target === "object" && !Array.isArray(target)) {
    const spot = target as FigureSpot;
    return Number.isFinite(spot.x) && Number.isFinite(spot.y)
      ? [{ at: [spot.x, spot.y], label: null, isPoint: true }]
      : null;
  }
  const labels = splitTarget(target, geo.labels);
  if (!labels || labels.length === 0 || labels.length > 3) return null;
  return labels.map((label) => {
    const at = pointOf(geo, label);
    return at ? { at, label, isPoint: true } : { at: label.centre, label, isPoint: false };
  });
}

/* ---- Drawing the marks ------------------------------------------------------------------- */

interface FigureShape {
  key: string;
  kind: LessonPoint["kind"];
  state: FigureMarkSet["state"];
  d: string;
  /** Drawn as a fill (a wedge or a spot of highlighter) rather than a stroke. */
  fill?: boolean;
  width?: number;
  head?: string;
  label?: { x: number; y: number; text: string };
  delay: number;
}

const unit = (v: Pt): Pt => {
  const d = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / d, v[1] / d];
};
const add = (a: Pt, b: Pt, s = 1): Pt => [a[0] + b[0] * s, a[1] + b[1] * s];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

/**
 * Where a mark's words go: a chip about `w` by `h` placed the given distance from `at` in the
 * best of several directions — clear of the printed labels and lines, inside the drawing, and
 * as near as possible to the direction preferred (away from the figure, or along a bisector).
 */
function chipSpot(
  geo: Geometry,
  at: Pt,
  prefer: Pt,
  w: number,
  h: number,
  distance: number,
  taken: Box[],
): Pt {
  const { view } = geo;
  let best: { centre: Pt; score: number } | null = null;
  const base = Math.atan2(prefer[1], prefer[0]);
  // Three distances, sixteen directions: a little further out in the preferred direction is
  // better than the right distance on the far side of the figure, where it would not read as
  // belonging to its mark.
  for (let j = 0; j < 48; j += 1) {
    const i = j % 16;
    const further = Math.floor(j / 16);
    const turn = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
    const dir: Pt = [Math.cos(turn), Math.sin(turn)];
    // Far enough that the chip's nearest edge, not its middle, is `distance` away.
    const reach =
      distance * (1 + further * 0.6) + further * h * 0.5 +
      Math.abs(dir[0]) * (w / 2) + Math.abs(dir[1]) * (h / 2);
    const centre = add(at, dir, reach);
    const box: Box = {
      left: centre[0] - w / 2,
      top: centre[1] - h / 2,
      right: centre[0] + w / 2,
      bottom: centre[1] + h / 2,
    };
    let score = Math.ceil(i / 2) * 1.1 + further * 1.5;
    for (const label of geo.labels) if (overlaps(box, label.box, 2)) score += 10;
    for (const other of taken) if (overlaps(box, other, 2)) score += 12;
    for (const [a, b] of geo.segments) {
      if (crosses(a, b, box)) score += 4;
      // Words with one of the figure's lines between them and their mark read as belonging to
      // whatever is on the other side.
      if (intersects(a, b, at, centre)) score += 7;
    }
    // The panel leaves a margin round the drawing, so a chip may reach a little past it.
    const margin = h * 0.6;
    const out =
      Math.max(0, view.x - margin - box.left) +
      Math.max(0, box.right - (view.x + view.w + margin)) +
      Math.max(0, view.y - margin - box.top) +
      Math.max(0, box.bottom - (view.y + view.h + margin));
    score += out * 0.4;
    if (!best || score < best.score) best = { centre, score };
  }
  return best!.centre;
}

function overlaps(a: Box, b: Box, pad: number): boolean {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}

/** Whether segments ab and cd cross (not merely touch at an end). */
function intersects(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
}

/** Whether the segment ab passes through the box (sampled: good enough for placing words). */
function crosses(a: Pt, b: Pt, box: Box): boolean {
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    if (x > box.left && x < box.right && y > box.top && y < box.bottom) return true;
  }
  return false;
}

/** The part of a ring two points on it cut off: the shorter way round. */
function ringFor(geo: Geometry, p: Pt, q: Pt): Ring | null {
  for (const ring of geo.rings) {
    const near = Math.max(4, ring.r * 0.05);
    const dp = Math.abs(Math.hypot(p[0] - ring.centre[0], p[1] - ring.centre[1]) - ring.r);
    const dq = Math.abs(Math.hypot(q[0] - ring.centre[0], q[1] - ring.centre[1]) - ring.r);
    if (dp < near && dq < near) return ring;
  }
  return null;
}

/** A hand-drawn arc about `centre` from angle a0 through `sweep`, a little past each end. */
function handArc(centre: Pt, r: number, a0: number, sweep: number, rnd: () => number, k: number): Pt[] {
  const over = Math.min(0.12, (6 * k) / r) * Math.sign(sweep || 1);
  const from = a0 - over;
  const span = sweep + 2 * over;
  const count = Math.max(8, Math.round((Math.abs(span) * r) / (5 * k)));
  const points: Pt[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const radius = r * (1 + 0.035 * (t - 0.5)) + (rnd() - 0.5) * 0.8 * k;
    const angle = from + span * t;
    points.push([centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius]);
  }
  return points;
}

function figureShapes(
  geo: Geometry,
  sets: FigureMarkSet[],
  figure: DrawingKey,
  k: number,
): FigureShape[] {
  const shapes: FigureShape[] = [];
  const taken: Box[] = [];
  const chipBox = (centre: Pt, text: string): Box => {
    const w = labelWidth(text) * k;
    const h = 22 * k;
    return { left: centre[0] - w / 2, top: centre[1] - h / 2, right: centre[0] + w / 2, bottom: centre[1] + h / 2 };
  };
  const chip = (at: Pt, prefer: Pt, text: string | null, distance: number) => {
    if (!text) return undefined;
    const centre = chipSpot(geo, at, prefer, labelWidth(text) * k, 22 * k, distance, taken);
    taken.push(chipBox(centre, text));
    return { x: centre[0], y: centre[1], text };
  };
  const away = (p: Pt): Pt => {
    const v = sub(p, geo.centroid);
    return Math.hypot(v[0], v[1]) < 1 ? [0, -1] : unit(v);
  };
  for (const set of sets) {
    const delays = markDelays(set.points);
    set.points.forEach((point, n) => {
      if (point.figure !== figure) return;
      const found = places(geo, point.target);
      if (!found) return;
      const rnd = seeded(set.index * 131 + n * 17 + 11);
      const key = `${set.index}-${n}`;
      const text = point.text?.trim() || null;
      const base = { key, kind: point.kind, state: set.state, delay: delays[n] ?? 0 };
      const [p, q, r] = found;
      if (!p) return;
      // An angle: three places, the vertex in the middle.
      if (r && q) {
        const vertex = q.at;
        const u1 = unit(sub(p.at, vertex));
        const u2 = unit(sub(r.at, vertex));
        let bisector = unit(add(u1, u2));
        if (Math.hypot(u1[0] + u2[0], u1[1] + u2[1]) < 0.05) bisector = [-u1[1], u1[0]];
        const short = Math.min(
          Math.hypot(p.at[0] - vertex[0], p.at[1] - vertex[1]),
          Math.hypot(r.at[0] - vertex[0], r.at[1] - vertex[1]),
        );
        const radius = Math.max(16 * k, Math.min(short * 0.34, 38 * k, 40));
        const a1 = Math.atan2(u1[1], u1[0]);
        let sweep = Math.atan2(u2[1], u2[0]) - a1;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep <= -Math.PI) sweep += 2 * Math.PI;
        const arc = handArc(vertex, radius, a1, sweep, rnd, k);
        if (point.kind === "highlight") {
          const edge = handArc(vertex, radius * 1.15, a1, sweep, rnd, k);
          const d = `M${vertex[0].toFixed(1)} ${vertex[1].toFixed(1)} ` + through(edge).replace(/^M/, "L") + " Z";
          shapes.push({ ...base, d, fill: true, label: chip(vertex, bisector, text, radius * 1.15 + 6 * k) });
          return;
        }
        if (point.kind === "circle") {
          const size = 10 * k;
          const box: Box = { left: vertex[0] - size, top: vertex[1] - size, right: vertex[0] + size, bottom: vertex[1] + size };
          shapes.push({ ...base, d: drawCircle(box, rnd, k), label: chip(vertex, [-bisector[0], -bisector[1]], text, 22 * k) });
          return;
        }
        if (point.kind === "arrow") {
          const tip = add(vertex, bisector, radius * 0.75);
          const tail = add(vertex, bisector, radius + 52 * k);
          const bend: Pt = [-bisector[1] * 10 * k, bisector[0] * 10 * k];
          const route = cubicRoute(tail, add(add(tail, bend), sub(tip, tail), 0.35), add(add(tip, bend), sub(tail, tip), 0.35), tip);
          const { d, head } = arrowAlong(unsteady(route, rnd, 0.8 * k), 10 * k);
          shapes.push({ ...base, d, head, label: chip(tail, bisector, text, 4 * k) });
          return;
        }
        if (point.kind === "strike") {
          const middle = add(vertex, bisector, radius * 0.7);
          const s = 8 * k;
          const d = `${drawStroke([middle[0] - s, middle[1] - s], [middle[0] + s, middle[1] + s], rnd, k)} ${drawStroke([middle[0] + s, middle[1] - s], [middle[0] - s, middle[1] + s], rnd, k)}`;
          shapes.push({ ...base, d, label: chip(middle, bisector, text, 14 * k) });
          return;
        }
        // arc, underline, label: the angle's arc (a label writes its words there too).
        shapes.push({
          ...base,
          kind: point.kind === "label" ? "arc" : point.kind,
          d: through(arc.filter((_, i) => i % 2 === 0 || i === arc.length - 1)),
          label: chip(vertex, bisector, text, radius + 5 * k),
        });
        return;
      }
      // A side, or with an arc, the part of a circle between two points.
      if (q) {
        const a = p.at;
        const b = q.at;
        const middle: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const along = unit(sub(b, a));
        let normal: Pt = [-along[1], along[0]];
        if (normal[0] * (middle[0] - geo.centroid[0]) + normal[1] * (middle[1] - geo.centroid[1]) < 0)
          normal = [-normal[0], -normal[1]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (point.kind === "arc") {
          const ring = ringFor(geo, a, b);
          if (ring) {
            const a0 = Math.atan2(a[1] - ring.centre[1], a[0] - ring.centre[0]);
            let sweep = Math.atan2(b[1] - ring.centre[1], b[0] - ring.centre[0]) - a0;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            while (sweep <= -Math.PI) sweep += 2 * Math.PI;
            const outside = ring.r + 5 * k;
            const arc = handArc(ring.centre, outside, a0, sweep, rnd, k);
            const mid = a0 + sweep / 2;
            const dir: Pt = [Math.cos(mid), Math.sin(mid)];
            shapes.push({
              ...base,
              d: through(arc.filter((_, i) => i % 2 === 0 || i === arc.length - 1)),
              label: chip(add(ring.centre, dir, outside), dir, text, 6 * k),
            });
            return;
          }
          // Not on a drawn circle: a bow between the two points, bulging away from the figure.
          const bulge = add(middle, normal, Math.min(length * 0.2, 26 * k));
          const route = cubicRoute(a, add(a, sub(bulge, a), 0.9), add(b, sub(bulge, b), 0.9), b);
          shapes.push({ ...base, d: through(route.filter((_, i) => i % 3 === 0 || i === route.length - 1)), label: chip(bulge, normal, text, 6 * k) });
          return;
        }
        if (point.kind === "highlight") {
          const ends = [add(a, along, 3 * k * -1), add(b, along, 3 * k)] as [Pt, Pt];
          shapes.push({
            ...base,
            d: drawStroke(ends[0], ends[1], rnd, k),
            width: 11 * k,
            label: chip(middle, normal, text, 10 * k),
          });
          return;
        }
        if (point.kind === "underline") {
          const off = 7 * k;
          const from = add(add(a, along, length * 0.08), normal, off);
          const to = add(add(b, along, -length * 0.08), normal, off);
          shapes.push({ ...base, d: drawStroke(from, to, rnd, k), label: chip(middle, normal, text, off + 8 * k) });
          return;
        }
        if (point.kind === "circle") {
          const turn = Math.atan2(along[1], along[0]);
          shapes.push({ ...base, d: drawLoop(middle, length / 2 + 12 * k, 12 * k, turn, rnd), label: chip(middle, normal, text, 16 * k) });
          return;
        }
        if (point.kind === "strike") {
          const s = 8 * k;
          const d = `${drawStroke(add(add(middle, along, -s), normal, -s), add(add(middle, along, s), normal, s), rnd, k)} ${drawStroke(add(add(middle, along, s), normal, -s), add(add(middle, along, -s), normal, s), rnd, k)}`;
          shapes.push({ ...base, d, label: chip(middle, normal, text, 14 * k) });
          return;
        }
        if (point.kind === "arrow") {
          const tip = add(middle, normal, 5 * k);
          const tail = add(middle, normal, 58 * k);
          const bend: Pt = [along[0] * 12 * k, along[1] * 12 * k];
          const route = cubicRoute(tail, add(tail, bend), add(tip, bend), tip);
          const { d, head } = arrowAlong(unsteady(route, rnd, 0.8 * k), 10 * k);
          shapes.push({ ...base, d, head, label: chip(tail, normal, text, 4 * k) });
          return;
        }
        // label: the words beside the side's middle, off the figure.
        const spot = chip(middle, normal, text, 8 * k);
        if (spot) shapes.push({ ...base, d: "", label: spot });
        return;
      }
      // One place: a point, a label of its own, or a place in the drawing's units.
      const at = p.at;
      const printed = p.label;
      const out = away(at);
      if (point.kind === "circle") {
        let box: Box;
        if (printed && p.isPoint) {
          // Round the point and its letter together: "this point, B".
          box = {
            left: Math.min(at[0] - 3 * k, printed.box.left),
            top: Math.min(at[1] - 3 * k, printed.box.top),
            right: Math.max(at[0] + 3 * k, printed.box.right),
            bottom: Math.max(at[1] + 3 * k, printed.box.bottom),
          };
        } else if (printed) box = printed.box;
        else box = { left: at[0] - 4 * k, top: at[1] - 4 * k, right: at[0] + 4 * k, bottom: at[1] + 4 * k };
        const centre: Pt = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
        const reach = Math.max(box.right - box.left, box.bottom - box.top) / 2 + 16 * k;
        shapes.push({ ...base, d: drawCircle(box, rnd, k), label: chip(centre, away(centre), text, reach) });
        return;
      }
      if (point.kind === "highlight") {
        if (printed && !p.isPoint) {
          const { d, width } = drawHighlight([printed.box], rnd, k);
          shapes.push({ ...base, d, width, label: chip(at, out, text, 14 * k) });
          return;
        }
        const r0 = 9 * k;
        const blob = handArc(at, r0, 0, Math.PI * 2, rnd, k);
        shapes.push({ ...base, d: through(blob) + " Z", fill: true, label: chip(at, out, text, 14 * k) });
        return;
      }
      if (point.kind === "strike") {
        if (printed) {
          shapes.push({ ...base, d: drawStrike([printed.box], rnd, k), label: chip(printed.centre, out, text, 12 * k) });
          return;
        }
        const s = 7 * k;
        const d = `${drawStroke([at[0] - s, at[1] - s], [at[0] + s, at[1] + s], rnd, k)} ${drawStroke([at[0] + s, at[1] - s], [at[0] - s, at[1] + s], rnd, k)}`;
        shapes.push({ ...base, d, label: chip(at, out, text, 12 * k) });
        return;
      }
      if (point.kind === "underline" && printed) {
        const b = printed.box;
        shapes.push({ ...base, d: drawStroke([b.left - 2 * k, b.bottom + 3 * k], [b.right + 3 * k, b.bottom + 2 * k], rnd, k), label: chip(printed.centre, out, text, 12 * k) });
        return;
      }
      if (point.kind === "arrow" || point.kind === "underline") {
        // Come in from the side with the most room: clear of the printed letters and lines.
        let bestDir: Pt = out;
        let bestScore = Number.POSITIVE_INFINITY;
        const base0 = Math.atan2(out[1], out[0]);
        for (let i = 0; i < 12; i += 1) {
          const turn = base0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
          const dir: Pt = [Math.cos(turn), Math.sin(turn)];
          let score = Math.ceil(i / 2) * 0.5;
          const a = add(at, dir, 8 * k);
          const b = add(at, dir, 56 * k);
          for (let s = 0; s <= 10; s += 1) {
            const x = a[0] + (b[0] - a[0]) * (s / 10);
            const y = a[1] + (b[1] - a[1]) * (s / 10);
            for (const label of geo.labels)
              if (x > label.box.left - 2 && x < label.box.right + 2 && y > label.box.top - 2 && y < label.box.bottom + 2) score += 3;
            const { view } = geo;
            if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) score += 1.5;
          }
          if (score < bestScore) {
            bestScore = score;
            bestDir = dir;
          }
        }
        const tip = add(at, bestDir, 7 * k);
        const tail = add(at, bestDir, 56 * k);
        const bend: Pt = [-bestDir[1] * 9 * k, bestDir[0] * 9 * k];
        const route = cubicRoute(tail, add(add(tail, bend), sub(tip, tail), 0.3), add(add(tip, bend), sub(tail, tip), 0.3), tip);
        const { d, head } = arrowAlong(unsteady(route, rnd, 0.8 * k), 10 * k);
        shapes.push({ ...base, kind: "arrow", d, head, label: chip(tail, bestDir, text, 4 * k) });
        return;
      }
      // label (or an arc at a single place, which has no angle to draw): words at the place.
      const spot = printed && p.isPoint ? chip(at, out, text, 14 * k) : chip(at, out, text, 4 * k);
      if (spot) shapes.push({ ...base, kind: "label", d: "", label: spot });
    });
  }
  return shapes;
}

/* ---- The panel --------------------------------------------------------------------------- */

function FigureCanvas({
  drawing,
  sets,
}: {
  drawing: Drawing;
  sets: FigureMarkSet[];
}) {
  const { figure, key: index } = drawing;
  const geometry = useGeometry(figure.url, drawing.markup);
  const imageRef = useRef<HTMLImageElement>(null);
  //: The drawing's units per screen pixel, as the image is shown now.
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image || !geometry) return;
    const read = () => {
      const shown = image.getBoundingClientRect().width;
      if (shown > 0) setK(geometry.view.w / shown);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(image);
    return () => observer.disconnect();
  }, [geometry]);
  const shapes = useMemo(
    () => (geometry && k > 0 ? figureShapes(geometry, sets, index, k) : []),
    [geometry, sets, index, k],
  );
  const view = geometry?.view;
  const box = view ? `${view.x} ${view.y} ${view.w} ${view.h}` : undefined;
  const under = shapes.filter((shape) => shape.kind === "highlight");
  const over = shapes.filter((shape) => shape.kind !== "highlight" && shape.d);
  const timing = (shape: FigureShape) => ({ "--delay": `${shape.delay}s` }) as CSSProperties;
  const ratio =
    view && view.h > 0
      ? view.w / view.h
      : figure.width && figure.height
        ? figure.width / figure.height
        : undefined;
  return (
    <div
      className={`pb-figure ${drawing.markup !== undefined ? "sketch" : ""}`}
      style={ratio ? ({ "--ratio": ratio } as CSSProperties) : undefined}
    >
      <img
        ref={imageRef}
        src={figure.url}
        alt={figure.alt_text ?? "The diagram printed with this question"}
        width={figure.width ?? undefined}
        height={figure.height ?? undefined}
        onLoad={() => {
          const image = imageRef.current;
          if (image && geometry) setK(geometry.view.w / (image.getBoundingClientRect().width || 1));
        }}
      />
      {view && shapes.length ? (
        <>
          {under.length ? (
            <svg className="pb-figmarks under" viewBox={box} aria-hidden="true">
              {under.map((shape) => (
                <g key={shape.key} className={`pb-mark highlight ${shape.state} ${shape.fill ? "fill" : ""}`} style={timing(shape)}>
                  <path className="pb-mark-line" d={shape.d} pathLength={1} style={shape.width ? { strokeWidth: shape.width } : undefined} />
                </g>
              ))}
            </svg>
          ) : null}
          <svg
            className="pb-figmarks"
            viewBox={box}
            aria-hidden="true"
            style={{ "--k": k } as CSSProperties}
          >
            {over.map((shape) => (
              <g key={shape.key} className={`pb-mark ${shape.kind} ${shape.state} ${shape.fill ? "fill" : ""}`} style={timing(shape)}>
                <path className="pb-mark-line" d={shape.d} pathLength={1} />
                {shape.head ? <path className="pb-mark-head" d={shape.head} pathLength={1} /> : null}
              </g>
            ))}
          </svg>
          {shapes.map((shape) =>
            shape.label ? (
              <span
                key={`label-${shape.key}`}
                className={`pb-mark-label ${shape.kind} ${shape.state} center`}
                aria-hidden="true"
                style={{
                  left: `${((shape.label.x - view.x) / view.w) * 100}%`,
                  top: `${((shape.label.y - view.y) / view.h) * 100}%`,
                  ...timing(shape),
                }}
              >
                {shape.label.text}
              </span>
            ) : null,
          )}
        </>
      ) : null}
    </div>
  );
}

/** Which diagram a mark is on: a printed figure's number, or the lesson's own sketch. */
export type DrawingKey = number | "sketch" | "sketch_b";

/** One diagram on the desk: a question's printed figure, or a sketch the lesson brings. */
export interface Drawing {
  key: DrawingKey;
  figure: QuestionFigure;
  /** A sketch's own SVG text (its `figure.url` is a data: URL of the same). */
  markup?: string;
  /** Whether it is on the board yet: a sketch comes in when the lesson turns to it. */
  shown: boolean;
}

/**
 * The question's figures, and the sketches its lesson draws, kept in the working: beside the
 * lines on a wide screen (held in view as the working scrolls), pinned over them on a phone,
 * where a tap folds it away and brings it back. A mark that goes up on a folded figure lights
 * the button, so the student knows the teacher has just pointed at it.
 *
 * A sketch is brought in when the lesson first turns to it — faded and wiped in from the left
 * like a line being written — and its column is held empty until then on a wide screen, so the
 * working does not change width under the student when it arrives.
 */
export function FigurePanel({
  drawings,
  sets,
}: {
  drawings: Drawing[];
  sets: FigureMarkSet[];
}) {
  const [open, setOpen] = useState(true);
  const count = sets.reduce(
    (sum, set) => sum + set.points.filter((point) => point.figure != null).length,
    0,
  );
  const seen = useRef(count);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (count > seen.current && !open) setFresh(true);
    seen.current = count;
  }, [count, open]);
  const up = drawings.filter((drawing) => drawing.shown);
  if (drawings.length === 0) return null;
  const printed = up.filter((drawing) => typeof drawing.key === "number").length;
  const title =
    printed > 1 ? "The figures" : printed === 1 ? "The figure" : up.length > 1 ? "Sketches" : "A sketch";
  return (
    <aside
      className={`pb-figpanel ${open ? "" : "shut"} ${up.length ? "" : "waiting"}`}
      aria-label={printed ? "The figure" : "A sketch of the question"}
      aria-hidden={up.length ? undefined : true}
    >
      <div className="pb-fighead">
        <span className="sj-eyebrow">{title}</span>
        <button
          type="button"
          className={`pb-figtoggle ${fresh ? "fresh" : ""}`}
          aria-expanded={open}
          onClick={() => {
            setOpen((now) => !now);
            setFresh(false);
          }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <div className="pb-figbody">
        {up.map((drawing) => (
          <FigureCanvas key={String(drawing.key)} drawing={drawing} sets={sets} />
        ))}
      </div>
    </aside>
  );
}
