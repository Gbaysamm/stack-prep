/**
 * DRAWN BY THE PEN, FROM SCRATCH. The one routine that draws a picture onto the board the way a
 * whiteboard explainer does — a question's figure, a lesson's sketch (FigureBoard.tsx) and a
 * doodle (Doodle.tsx) alike — so every picture on the board is made by the same hand.
 *
 * Nothing fades in, and nothing appears without the nib there:
 *
 * - AN OUTLINE is traced: the stroke revealed along its own length (a dash offset, or for a
 *   dashed line a mask carrying a solid copy of it), the nib riding the end of it.
 * - A FILL is coloured in: the nib scribbles across the shape in a zig-zag, and the colour is
 *   revealed under the scribble (a mask holding the zig-zag as a broad stroke, drawn along its
 *   length as the nib goes) — never an opacity fade.
 * - WORDS are written left to right: a mask wipes across the text at the nib, which bobs along
 *   the baseline as a hand does forming letters.
 *
 * Outlines go first, in the drawing's own order; then the colouring in; then the words. Between
 * one and the next the pen lifts and travels, in sight, to where the next begins.
 *
 * Everything here works on a live SVG already in the page (its layout is read: lengths, boxes,
 * the screen transform), and puts every element back as it was when the drawing is done.
 */

import type { Pt } from "./ink.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** One thing the pen does: trace an outline, colour a shape in, or write some words. */
export interface DrawItem {
  kind: "stroke" | "fill" | "text";
  /** How long it takes at a hand's pace, in milliseconds. */
  ms: number;
  /** Its state `p` of the way through (0 to 1). */
  show: (p: number) => void;
  /** Where the nib is, `p` of the way through, on the screen. */
  tip: (p: number) => Pt | null;
  /** Put the element back as the drawing has it, fully drawn. */
  finish: () => void;
}

/** What `drawable` picks out of a picture: every shape and every piece of text. */
export const DRAWN = "path, line, polyline, polygon, circle, ellipse, rect, text";

let masks = 0;

/** A brisk hand's pace along an outline, in screen pixels a millisecond. */
const PACE = 0.55;

/** Screen pixels per user unit of an element, roughly: how big it is actually drawn. */
function scaleOf(element: SVGGraphicsElement): number {
  const m = element.getScreenCTM();
  return m ? Math.max(0.05, Math.hypot(m.a, m.b)) : 1;
}

function screenPoint(element: SVGGraphicsElement, p: Pt): Pt | null {
  const m = element.getScreenCTM();
  if (!m) return null;
  const q = new DOMPoint(p[0], p[1]).matrixTransform(m);
  return [q.x, q.y];
}

function lengthOf(element: SVGGraphicsElement): number {
  try {
    return (element as unknown as SVGGeometryElement).getTotalLength();
  } catch {
    return 0;
  }
}

function boxOf(element: SVGGraphicsElement): DOMRect | null {
  try {
    const box = element.getBBox();
    return box.width > 0 || box.height > 0 ? box : null;
  } catch {
    return null;
  }
}

/** A mask in the element's own units, over its box and a margin, holding `content`. */
function maskOver(
  defs: SVGDefsElement,
  element: SVGGraphicsElement,
  box: DOMRect,
  margin: number,
  content: SVGElement,
): () => void {
  masks += 1;
  const id = `pb-drawmask-${masks}`;
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.setAttribute("id", id);
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  mask.setAttribute("x", String(box.x - margin));
  mask.setAttribute("y", String(box.y - margin));
  mask.setAttribute("width", String(box.width + margin * 2));
  mask.setAttribute("height", String(box.height + margin * 2));
  mask.appendChild(content);
  defs.appendChild(mask);
  const was = element.getAttribute("mask");
  element.setAttribute("mask", `url(#${id})`);
  return () => {
    if (was === null) element.removeAttribute("mask");
    else element.setAttribute("mask", was);
    mask.remove();
  };
}

/** A bare copy of a shape's geometry, to draw with inside a mask. */
function geometryCopy(element: SVGGraphicsElement): SVGElement {
  const copy = element.cloneNode(false) as SVGElement;
  for (const name of ["transform", "mask", "style", "class", "opacity", "stroke-dasharray", "fill", "stroke"])
    copy.removeAttribute(name);
  return copy;
}

/**
 * The zig-zag a hand colours a shape in with, across its box, in the shape's own units: rows
 * from the top down, each pass slanting down to the other side, and the stroke broad enough
 * that the passes overlap and leave no gap.
 */
function scribble(box: DOMRect, pad: number): { points: Pt[]; width: number } {
  const w = box.width + pad * 2;
  const h = box.height + pad * 2;
  const rows = Math.max(2, Math.min(14, Math.ceil(h / Math.max(w / 3, h / 14, 0.001))));
  const step = h / rows;
  const left = box.x - pad;
  const right = left + w;
  const top = box.y - pad;
  const points: Pt[] = [];
  for (let i = 0; i <= rows; i += 1) {
    const y = top + step * i;
    points.push(i % 2 === 0 ? [left, y] : [right, y]);
  }
  return { points, width: step * 2.2 };
}

function lengths(points: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i += 1)
    out.push(out[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  return out;
}

function pointAlong(points: Pt[], at: number[], s: number): Pt {
  let i = 1;
  while (i < at.length - 1 && at[i]! < s) i += 1;
  const a = points[i - 1] ?? points[0]!;
  const b = points[i] ?? a;
  const span = (at[i] ?? 0) - (at[i - 1] ?? 0) || 1;
  const t = Math.max(0, Math.min(1, (s - (at[i - 1] ?? 0)) / span));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * What the pen will do to draw `elements` (a picture's shapes and text, in document order), with
 * every one of them hidden until it is drawn. Outlines first, then fills, then words.
 */
export function planDrawing(svg: SVGSVGElement, elements: SVGGraphicsElement[]): DrawItem[] {
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.insertBefore(defs, svg.firstChild);
  const strokes: DrawItem[] = [];
  const fills: DrawItem[] = [];
  const texts: DrawItem[] = [];

  for (const element of elements) {
    const style = window.getComputedStyle(element);
    const k = scaleOf(element);
    if (element.localName === "text") {
      const box = boxOf(element);
      if (!box) continue;
      const wipe = document.createElementNS(SVG_NS, "rect");
      wipe.setAttribute("x", String(box.x - 2));
      wipe.setAttribute("y", String(box.y - box.height));
      wipe.setAttribute("height", String(box.height * 3));
      wipe.setAttribute("width", "0");
      wipe.setAttribute("fill", "#fff");
      const unmask = maskOver(defs, element, box, box.height, wipe);
      const chars = Math.max(1, (element.textContent ?? "").trim().length);
      texts.push({
        kind: "text",
        ms: 120 + chars * 60,
        show: (p) => wipe.setAttribute("width", String(Math.max(0, (box.width + 4) * p))),
        tip: (p) =>
          screenPoint(element, [
            box.x + box.width * p,
            box.y + box.height * (0.78 - 0.22 * Math.abs(Math.sin(p * chars * Math.PI))),
          ]),
        finish: unmask,
      });
      continue;
    }

    const width = Number.parseFloat(style.strokeWidth) || 0;
    const stroked = style.stroke !== "none" && width > 0 && Number.parseFloat(style.strokeOpacity || "1") > 0;
    const filled =
      style.fill !== "none" &&
      style.fill !== "transparent" &&
      Number.parseFloat(style.fillOpacity || "1") > 0 &&
      !["line", "polyline"].includes(element.localName);
    const length = lengthOf(element);

    // The colour goes on a copy of the shape laid under it, so the outline can be traced first
    // and the inside coloured in after, each by the pen.
    let carrier: SVGGraphicsElement | null = null;
    let uncarry = () => {};
    if (filled && stroked && length > 0) {
      carrier = element.cloneNode(false) as SVGGraphicsElement;
      carrier.removeAttribute("mask");
      carrier.style.stroke = "none";
      element.parentNode?.insertBefore(carrier, element);
      const fillWas = element.style.fill;
      element.style.fill = "none";
      const made = carrier;
      uncarry = () => {
        element.style.fill = fillWas;
        made.remove();
      };
    } else if (filled) carrier = element;

    if (stroked && length > 0) {
      const dashed = style.strokeDasharray && style.strokeDasharray !== "none";
      if (dashed) {
        const box = boxOf(element);
        if (box) {
          const copy = geometryCopy(element);
          copy.setAttribute("fill", "none");
          copy.setAttribute("stroke", "#fff");
          copy.setAttribute("stroke-width", String(width + 6 / k));
          copy.setAttribute("stroke-linecap", "round");
          copy.setAttribute("stroke-linejoin", "round");
          copy.style.strokeDasharray = `${length + 1} ${length + 1}`;
          copy.style.strokeDashoffset = String(length + 1);
          const unmask = maskOver(defs, element, box, width + 12 / k, copy);
          strokes.push({
            kind: "stroke",
            ms: 60 + (length * k) / PACE,
            show: (p) => (copy.style.strokeDashoffset = String((length + 1) * (1 - p))),
            tip: (p) => tipAlong(element, length * p),
            finish: unmask,
          });
        }
      } else {
        const was = {
          dash: element.style.strokeDasharray,
          offset: element.style.strokeDashoffset,
          visibility: element.style.visibility,
        };
        element.style.strokeDasharray = `${length + 1} ${length + 1}`;
        element.style.strokeDashoffset = String(length + 1);
        element.style.visibility = "hidden";
        strokes.push({
          kind: "stroke",
          ms: 60 + (length * k) / PACE,
          show: (p) => {
            element.style.visibility = p > 0 ? was.visibility : "hidden";
            element.style.strokeDashoffset = String((length + 1) * (1 - p));
          },
          tip: (p) => tipAlong(element, length * p),
          finish: () => {
            element.style.strokeDasharray = was.dash;
            element.style.strokeDashoffset = was.offset;
            element.style.visibility = was.visibility;
          },
        });
      }
    }

    if (carrier) {
      const shape = carrier;
      const box = boxOf(shape);
      if (!box) {
        uncarry();
        continue;
      }
      const pad = Math.max(box.width, box.height) * 0.04 + 1 / k;
      const { points, width: broad } = scribble(box, pad);
      const at = lengths(points);
      const total = at[at.length - 1] ?? 0;
      const path = document.createElementNS(SVG_NS, "polyline");
      path.setAttribute("points", points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#fff");
      path.setAttribute("stroke-width", String(broad));
      path.setAttribute("stroke-linecap", "square");
      path.setAttribute("stroke-linejoin", "round");
      path.style.strokeDasharray = `${total + 1} ${total + 1}`;
      path.style.strokeDashoffset = String(total + 1);
      const unmask = maskOver(defs, shape, box, pad + broad, path);
      const area = box.width * box.height * k * k;
      fills.push({
        kind: "fill",
        ms: Math.min(900, 140 + Math.sqrt(area) * 3.2),
        show: (p) => (path.style.strokeDashoffset = String((total + 1) * (1 - p))),
        tip: (p) => screenPoint(shape, pointAlong(points, at, total * p)),
        finish: () => {
          unmask();
          uncarry();
        },
      });
    }
  }
  const plan = [...strokes, ...fills, ...texts];
  // The defs go when the last of the drawing is put back.
  const last = plan[plan.length - 1];
  if (last) {
    const finish = last.finish;
    last.finish = () => {
      finish();
      defs.remove();
    };
  } else defs.remove();
  return plan;
}

function tipAlong(element: SVGGraphicsElement, s: number): Pt | null {
  try {
    const at = (element as unknown as SVGGeometryElement).getPointAtLength(s);
    return screenPoint(element, [at.x, at.y]);
  } catch {
    return null;
  }
}

/** Whether the marker is writing a line of the working: one hand, so a picture waits for it. */
export function workingPenBusy(): boolean {
  return document.querySelector('.pb-pen-rig[data-writing="1"][data-show="1"]') !== null;
}

const ease = (q: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, q))) / 2;

/**
 * Play a plan: each item at its pace, the pen lifting and travelling between them. With
 * `totalMs`, the whole is fitted to that time (a figure drawn over the words of its moment);
 * without, it goes at a hand's own pace.
 *
 * While `hold()` is true the drawing waits (the pen is away writing the working), then makes
 * up the time at up to twice the pace. While `paused()` it stops where it is. Returns a stop.
 */
export function runDrawing({
  items,
  host,
  pen,
  totalMs,
  paused,
  hold = () => false,
  onDone,
}: {
  items: DrawItem[];
  /** What the pen is positioned against. */
  host: HTMLElement;
  pen: HTMLElement | null;
  totalMs?: number;
  paused: () => boolean;
  hold?: () => boolean;
  onDone: () => void;
}): () => void {
  // The travel before each item: from where the last one ended to where this one starts.
  const travel: number[] = [];
  let from: Pt | null = null;
  for (const item of items) {
    const start = item.tip(0);
    travel.push(from && start ? Math.min(260, 45 + Math.hypot(start[0] - from[0], start[1] - from[1]) / 1.4) : 0);
    from = item.tip(1) ?? start ?? from;
  }
  const natural = items.reduce((sum, item, i) => sum + item.ms + (travel[i] ?? 0), 0) || 1;
  const scale = totalMs ? totalMs / natural : 1;
  const spans = items.map((item) => item.ms * scale);
  const hops = travel.map((ms) => ms * scale);
  const ends: (Pt | null)[] = items.map(() => null);

  let clock = 0;
  let owed = 0;
  let last = performance.now();
  let frame = 0;
  let over = false;
  const place = (p: Pt | null, lifted: boolean) => {
    if (!pen || !p) return;
    const frameBox = host.getBoundingClientRect();
    pen.style.transform = `translate(${(p[0] - frameBox.left).toFixed(1)}px, ${(p[1] - frameBox.top).toFixed(1)}px)`;
    pen.dataset.lift = lifted ? "1" : "0";
  };
  const finish = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    for (const item of items) {
      item.show(1);
      item.finish();
    }
    if (pen) pen.dataset.lift = "done";
    onDone();
  };
  const tick = (now: number) => {
    const step = Math.min(100, now - last);
    last = now;
    const away = hold();
    if (!paused()) {
      if (away) owed += step;
      else {
        const extra = Math.min(owed, step);
        owed -= extra;
        clock += step + extra;
      }
    }
    if (pen) pen.dataset.away = away ? "1" : "0";
    let t = clock;
    for (let i = 0; i < items.length; i += 1) {
      const hop = hops[i] ?? 0;
      if (t < hop) {
        // Lifted, on the way from the end of the last to the start of this one.
        const a = ends[i - 1] ?? items[i - 1]?.tip(1) ?? null;
        const b = items[i]!.tip(0);
        if (a && b) {
          const q = ease(t / (hop || 1));
          place([a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q - Math.sin(Math.PI * q) * 6], true);
        } else place(b, true);
        frame = requestAnimationFrame(tick);
        return;
      }
      t -= hop;
      const span = spans[i] ?? 0;
      if (t >= span) {
        items[i]!.show(1);
        ends[i] ??= items[i]!.tip(1);
        t -= span;
        continue;
      }
      const p = span > 0 ? t / span : 1;
      items[i]!.show(p);
      place(items[i]!.tip(p), false);
      frame = requestAnimationFrame(tick);
      return;
    }
    finish();
  };
  if (items.length === 0) {
    // Nothing to draw: done at once.
    finish();
    return () => undefined;
  }
  for (const item of items) item.show(0);
  place(items[0]!.tip(0), true);
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
