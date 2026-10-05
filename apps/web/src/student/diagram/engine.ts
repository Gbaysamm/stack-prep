/**
 * LIVE DIAGRAMS: THE PEN THAT DRAWS AND CHANGES A DIAGRAM DESCRIBED AS DATA
 * (docs/plans/doodles-v2-contract.md section 8).
 *
 * One engine per diagram on the board. A lesson describes the diagram (`diagram: {id, kind,
 * ...}`): a graph, a Venn diagram, a pie or bar chart, a histogram, a number line, a probability
 * tree, a table or an ogive. The engine lays it out in its own units (about a screen pixel
 * each), and turns its arrival and each thing a later moment does to it (`diagram_do`) into steps
 * for the board's one pen (drawIn.ts `DrawItem`s), so it is drawn exactly as a sketch or a doodle
 * is: an outline traced, a fill scribbled in, words written left to right, and anything that
 * grows or slides moved with the nib on it.
 *
 * The kinds (diagram/kinds/*.ts) each know their own layout and actions; this file holds what
 * they share:
 *
 * - the drawing's layers (fills under the ink, words over it, the lesson's marks, and the
 *   student's own hover over everything), and helpers that make hand-drawn strokes, fills,
 *   words and dots in them;
 * - the diagram's PARTS: everything the lesson or the student can point at (a region, a sector,
 *   a bar, a point, a branch, a cell), with what it means in words, where a note or a pair's dot
 *   attaches, and how to light it;
 * - the actions every kind takes: highlight, label and arrow, and a board line's link;
 * - where a note goes: beside its part, clear of every other word on the diagram.
 *
 * The same steps finished at once (`instant`) give the end state: a diagram put in again (the
 * board changed width) or a student who asked for less motion sees it exactly as it was left.
 */

import type { DiagramColour, LessonDiagram, LessonDiagramOp } from "../api.js";
import { planDrawing, type DrawItem } from "../drawIn.js";
import type { Pt } from "../ink.js";
import type { SfxName } from "../sfx.js";
import { bowed, head, line, loop, seedOf } from "./rough.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The ink, and the softer ink of an axis's numbers. */
export const INK = "#1d1b3a";
export const SOFT = "#57527a";
export const NOTE = "#5b21b6";
export const FAINT = "#e7e3f1";

/** Each colour as a stroke and as a fill, by its meaning (docs/lesson-style-guide.md 5). */
export const PALETTE: Record<DiagramColour, { stroke: string; fill: string }> = {
  blue: { stroke: "#2563eb", fill: "#60a5fa" },
  green: { stroke: "#15803d", fill: "#4ade80" },
  purple: { stroke: "#6d28d9", fill: "#a78bfa" },
  orange: { stroke: "#c2410c", fill: "#fb923c" },
  red: { stroke: "#b91c1c", fill: "#f87171" },
  pink: { stroke: "#be185d", fill: "#f472b6" },
  yellow: { stroke: "#a16207", fill: "#fde047" },
  grey: { stroke: "#475569", fill: "#cbd5e1" },
};
/** The colours a run of things (sectors, sets, bars) takes in turn where none is given. */
export const CYCLE: DiagramColour[] = ["blue", "pink", "yellow", "green", "purple", "orange"];

export interface UBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Something on a diagram the lesson or the student can point at. */
export interface Part {
  name: string;
  /** What it is, in words: shown when the student hovers or taps it, and read aloud. */
  info: string;
  /** Where a note or a pair's dot attaches to it. */
  anchor: Pt;
  box: UBox;
  /** Lights it: makes its glow in `layer` (a highlighter for an area, a broad stroke for a line). */
  glow: (layer: SVGGElement, colour: string, mode: "hover" | "mark") => SVGGraphicsElement[];
  /** Kept out of the keyboard's tour (a whole set, the universal box): reached by tapping. */
  quiet?: boolean;
  /** A thin thing (a curve, a branch, a hop): a link lights its length, not a blob over it. */
  thin?: boolean;
}

/** What the pen does next: its steps, and anything to put right once they are done. */
export interface Build {
  items: DrawItem[];
  /** The whole fitted to at most this long (an arrival with many small strokes). */
  totalMs?: number;
  after?: () => void;
  /** The sound it makes in the whiteboard style (sfx.ts), as it starts. */
  sfx?: SfxName | null;
}

/** A kind of diagram: how big it is, and how it draws and changes. */
export interface KindModule {
  /** Its size in its own units, from the description (and the actions the lesson will take). */
  view(spec: LessonDiagram, plan?: LessonDiagramOp[]): [number, number];
  create(engine: DiagramEngine, spec: LessonDiagram, plan?: LessonDiagramOp[]): Kind;
}

export interface Kind {
  /** The pen's steps for the diagram's arrival, in teaching order. */
  drawIn(): Build;
  /** An action of this kind's own; null where it is one every kind takes (highlight, …). */
  op(op: LessonDiagramOp): Build | null;
  /** The part under a point (in units), for a hover or a tap. */
  hit(p: Pt): string | null;
  /** A reading at a point: a graph's nearest point on a curve, with its coordinates. */
  probe?(p: Pt): { at: Pt; text: string } | null;
  /** A part named another way (sector:Rice, a set expression): its canonical part. */
  partFor?(name: string): Part | null;
  /** The whole diagram in words, for a screen reader. */
  describe(): string;
}

/** A board line's link to a part, as LiveDiagram hands it in. */
export interface LinkTask {
  part: string | null;
  kind: string;
}

type Attrs = Record<string, string | number | undefined>;

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const made = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined) made.setAttribute(name, String(value));
  parent?.appendChild(made);
  return made;
}

/** A number as the board writes it: a real minus sign, and no more decimals than it needs. */
export function fmt(n: number, places = 2): string {
  if (!Number.isFinite(n)) return "?";
  const round = Math.round(n * 10 ** places) / 10 ** places;
  const text = String(Math.abs(round) < 1e-9 ? 0 : round);
  return text.replace(/^-/, "−");
}

export function boxOfPoints(points: Pt[], pad = 0): UBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

export function centreOf(b: UBox): Pt {
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

function overlaps(a: UBox, b: UBox, pad = 0): boolean {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
}

/** A glow for an area: the shape `d` filled with the highlighter, under the ink. */
export function areaGlow(d: string): Part["glow"] {
  return (layer, colour, mode) => [
    el("path", { d, fill: colour, "fill-opacity": mode === "hover" ? 0.42 : 0.38, stroke: "none", class: "ld-glow" }, layer),
  ];
}

/** A glow for a line: a broad soft stroke along `d`. */
export function lineGlow(d: string, width = 11): Part["glow"] {
  return (layer, colour, mode) => [
    el(
      "path",
      {
        d,
        fill: "none",
        stroke: colour,
        "stroke-opacity": mode === "hover" ? 0.5 : 0.55,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: "ld-glow",
      },
      layer,
    ),
  ];
}

/** A glow for a point: a soft disc round it. */
export function dotGlow(p: Pt, r = 9): Part["glow"] {
  return (layer, colour, mode) => [
    el("circle", { cx: p[0], cy: p[1], r, fill: colour, "fill-opacity": mode === "hover" ? 0.5 : 0.55, class: "ld-glow" }, layer),
  ];
}

export interface TextOptions {
  size?: number;
  anchor?: "start" | "middle" | "end";
  colour?: string;
  weight?: number;
  /** Where y is: the text's middle (default) or its baseline. */
  baseline?: "middle" | "base";
  cls?: string;
}

export class DiagramEngine {
  svg!: SVGSVGElement;
  defs!: SVGDefsElement;
  /** Fills and shading, under everything. */
  paint!: SVGGElement;
  /** The lesson's highlighter, over the fills and under the ink. */
  glowLayer!: SVGGElement;
  ink!: SVGGElement;
  words!: SVGGElement;
  /** The lesson's notes and arrows. */
  marks!: SVGGElement;
  /** The student's hover: never drawn by the pen, never part of the lesson. */
  hover!: SVGGElement;
  view: [number, number] = [360, 260];
  kind!: Kind;
  /** True while steps are being finished at once rather than drawn. */
  instant = false;
  /** Plays a sound in the whiteboard style (LiveDiagram sets it; silent in the classic style). */
  sound: ((name: SfxName) => void) | null = null;
  readonly parts = new Map<string, Part>();
  /** The words already on the diagram, which a new note keeps clear of. */
  readonly taken: UBox[] = [];
  /** Points along the strokes drawn (curves, axes), which a new note keeps clear of too. */
  readonly inked: Pt[] = [];
  private patterns = new Set<string>();
  private seq = 0;
  private uid = `ld${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    private host: HTMLElement,
    readonly spec: LessonDiagram,
    private module: KindModule,
    /** Every action the lesson takes on it, in order (a table keeps room for a total row). */
    private lessonOps: LessonDiagramOp[] = [],
  ) {}

  /** The drawing into the host, empty: nothing is drawn until `drawIn`. */
  mount(): void {
    this.parts.clear();
    this.taken.length = 0;
    this.inked.length = 0;
    this.patterns.clear();
    this.view = this.module.view(this.spec, this.lessonOps);
    const svg = el("svg", {
      class: "ld-svg",
      viewBox: `0 0 ${this.view[0]} ${this.view[1]}`,
      "aria-hidden": "true",
      focusable: "false",
    });
    this.svg = svg;
    this.defs = el("defs", {}, svg);
    this.paint = el("g", { class: "ld-paint" }, svg);
    this.glowLayer = el("g", { class: "ld-glowlayer" }, svg);
    this.ink = el("g", { class: "ld-ink" }, svg);
    this.words = el("g", { class: "ld-words" }, svg);
    this.marks = el("g", { class: "ld-marks" }, svg);
    this.hover = el("g", { class: "ld-hover" }, svg);
    this.host.replaceChildren(svg);
    this.kind = this.module.create(this, this.spec, this.lessonOps);
  }

  /** A fresh id for a clip, mask or pattern in this drawing. */
  id(what: string): string {
    this.seq += 1;
    return `${this.uid}-${what}-${this.seq}`;
  }

  /** A seeded wobble for something on this diagram. */
  rnd(what: string): () => number {
    return seedOf(`${this.spec.id}|${what}`);
  }

  colour(name: DiagramColour | null | undefined, fallback: DiagramColour): { stroke: string; fill: string } {
    return PALETTE[name && name in PALETTE ? name : fallback];
  }

  /* ------------------------------------------------------------------ making things */

  stroke(layer: SVGGElement, d: string, opts: { colour?: string; width?: number; dash?: string; opacity?: number; cls?: string } = {}): SVGPathElement {
    return el(
      "path",
      {
        d,
        fill: "none",
        stroke: opts.colour ?? INK,
        "stroke-width": opts.width ?? 2.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": opts.dash,
        "stroke-opacity": opts.opacity,
        class: opts.cls,
      },
      layer,
    );
  }

  fill(layer: SVGGElement, d: string, colour: string, opacity = 0.45, cls?: string): SVGPathElement {
    return el("path", { d, fill: colour, "fill-opacity": opacity, stroke: "none", class: cls }, layer);
  }

  /** A diagonal hatch over a tint, in a colour: shading done by hand. */
  hatch(name: DiagramColour): string {
    const id = `${this.uid}-hatch-${name}`;
    if (!this.patterns.has(id)) {
      this.patterns.add(id);
      const c = PALETTE[name];
      const pattern = el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width: 8, height: 8, patternTransform: "rotate(-38)" },
        this.defs,
      );
      el("rect", { width: 8, height: 8, fill: c.fill, "fill-opacity": 0.22 }, pattern);
      el("line", { x1: 1, y1: 0, x2: 1, y2: 8, stroke: c.stroke, "stroke-width": 1.7, "stroke-opacity": 0.55 }, pattern);
    }
    return `url(#${id})`;
  }

  text(layer: SVGGElement, x: number, y: number, words: string, opts: TextOptions = {}): SVGTextElement {
    const size = opts.size ?? 17;
    const made = el(
      "text",
      {
        x,
        y: opts.baseline === "base" ? y : y + size * 0.34,
        "font-size": size,
        "text-anchor": opts.anchor ?? "middle",
        fill: opts.colour ?? INK,
        "font-weight": opts.weight ?? 700,
        class: opts.cls ? `ld-text ${opts.cls}` : "ld-text",
      },
      layer,
    );
    made.textContent = words;
    return made;
  }

  /** A text's box in units, measured where it can be, else estimated from its letters. */
  measure(text: SVGTextElement): UBox {
    try {
      const b = text.getBBox();
      if (b.width > 0) return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    } catch {
      // Not laid out: estimated below.
    }
    const size = Number(text.getAttribute("font-size")) || 17;
    const w = (text.textContent ?? "").length * size * 0.46;
    const x = Number(text.getAttribute("x")) || 0;
    const y = Number(text.getAttribute("y")) || 0;
    const anchor = text.getAttribute("text-anchor");
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    return { x0, y0: y - size * 0.8, x1: x0 + w, y1: y + size * 0.25 };
  }

  /** Words that stay put: their room is kept, so later notes keep clear of them. */
  keep(text: SVGTextElement): SVGTextElement {
    this.taken.push(this.measure(text));
    return text;
  }

  dot(layer: SVGGElement, p: Pt, opts: { r?: number; colour?: string; open?: boolean } = {}): SVGCircleElement {
    const colour = opts.colour ?? INK;
    return el(
      "circle",
      {
        cx: p[0],
        cy: p[1],
        r: opts.r ?? 4.2,
        fill: opts.open ? "#fff" : colour,
        stroke: colour,
        "stroke-width": opts.open ? 2.2 : 1.2,
      },
      layer,
    );
  }

  /* ------------------------------------------------------------------ the pen's steps */

  /** The pen's steps for each group in turn (outlines, then colour, then words, per group). */
  plan(...groups: (SVGGraphicsElement | null | undefined)[][]): DrawItem[] {
    const out: DrawItem[] = [];
    for (const group of groups) {
      const elements = group.filter((one): one is SVGGraphicsElement => Boolean(one));
      if (elements.length) out.push(...planDrawing(this.svg, elements));
    }
    return out;
  }

  /** A step that changes something with the nib on it (a bar rising, a sector sliding out). */
  motion(ms: number, show: (p: number) => void, tip: (p: number) => Pt | null, finish: () => void = () => undefined): DrawItem {
    return {
      kind: "stroke",
      ms,
      show,
      tip: (p) => {
        const at = tip(p);
        return at ? this.screen(at) : null;
      },
      finish: () => {
        show(1);
        finish();
      },
    };
  }

  /**
   * The same step, making a sound as it starts: a sound for each of several things one action
   * draws (a ladder's rows, a tick each). Silent when the step is shown done at once.
   */
  withSound(item: DrawItem, name: SfxName): DrawItem {
    if (this.instant) return item;
    let played = false;
    return {
      ...item,
      show: (p) => {
        if (!played && p > 0) {
          played = true;
          this.sound?.(name);
        }
        item.show(p);
      },
    };
  }

  /** A short spring after the words land: they pop as they arrive (not when shown at once). */
  popAfter(elements: Element[]): () => void {
    return () => {
      if (this.instant) return;
      for (const element of elements) {
        element.classList.remove("ld-pop");
        // Restarted on purpose: a value written again pops again.
        void (element as SVGGraphicsElement).getBBox?.();
        element.classList.add("ld-pop");
      }
    };
  }

  /* ------------------------------------------------------------------ geometry */

  screen(p: Pt): Pt | null {
    const m = this.svg?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(p[0], p[1]).matrixTransform(m);
    return [q.x, q.y];
  }

  /** A point on the screen in the diagram's units. */
  units(clientX: number, clientY: number): Pt | null {
    const m = this.svg?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  }

  /** A part by any of its names. */
  part(name: string | null | undefined): Part | null {
    if (!name) return null;
    return this.parts.get(name) ?? this.kind.partFor?.(name) ?? null;
  }

  /** The parts the keyboard visits, in the order they were drawn. */
  tour(): Part[] {
    return Array.from(this.parts.values()).filter((part) => !part.quiet);
  }

  /** Where a pair's dot goes for a part (or the whole diagram): a thin one's anchor, else its top right. */
  linkPoint(name: string | null): Pt {
    const part = this.part(name);
    if (part?.thin) return [part.anchor[0] + 6, part.anchor[1] - 6];
    if (part) return [part.box.x1, part.box.y0];
    return [this.view[0] - 6, 6];
  }

  /* ------------------------------------------------------------------ notes */

  /**
   * Where a note of `w` by `h` goes beside `anchor`: the first place round it (right, left,
   * above, below, then the corners, then further out) clear of every word on the diagram and
   * inside it. Returns the note's box.
   */
  noteSpot(anchor: Pt, w: number, h: number, avoid: UBox[] = []): UBox {
    const [vw, vh] = this.view;
    const gap = 10;
    const tries: Pt[] = [];
    for (const reach of [1, 1.8, 2.8]) {
      const g = gap * reach;
      tries.push(
        [anchor[0] + g, anchor[1] - h / 2],
        [anchor[0] - g - w, anchor[1] - h / 2],
        [anchor[0] - w / 2, anchor[1] - g - h],
        [anchor[0] - w / 2, anchor[1] + g],
        [anchor[0] + g * 0.7, anchor[1] - g * 0.7 - h],
        [anchor[0] - g * 0.7 - w, anchor[1] - g * 0.7 - h],
        [anchor[0] + g * 0.7, anchor[1] + g * 0.7],
        [anchor[0] - g * 0.7 - w, anchor[1] + g * 0.7],
      );
    }
    const blocked = [...this.taken, ...avoid];
    const crosses = (b: UBox) => this.inked.some((p) => p[0] > b.x0 - 2 && p[0] < b.x1 + 2 && p[1] > b.y0 - 2 && p[1] < b.y1 + 2);
    let best: UBox | null = null;
    for (const strict of [true, false])
      for (const [x, y] of tries) {
        const b = { x0: x, y0: y, x1: x + w, y1: y + h };
        const inside = b.x0 >= 2 && b.y0 >= 2 && b.x1 <= vw - 2 && b.y1 <= vh - 2;
        if (!inside) continue;
        if (blocked.some((o) => overlaps(b, o, 2))) continue;
        // Clear of the strokes too, where it can be.
        if (strict && crosses(b)) continue;
        return b;
      }
    // Nowhere clear: the first that fits inside, else to the right, kept on the drawing.
    for (const [x, y] of tries) {
      const b = { x0: x, y0: y, x1: x + w, y1: y + h };
      if (b.x0 >= 2 && b.y0 >= 2 && b.x1 <= vw - 2 && b.y1 <= vh - 2) {
        best = b;
        break;
      }
    }
    if (best) return best;
    const x = Math.max(2, Math.min(vw - w - 2, anchor[0] + gap));
    const y = Math.max(2, Math.min(vh - h - 2, anchor[1] - h / 2));
    return { x0: x, y0: y, x1: x + w, y1: y + h };
  }

  /**
   * A note written beside `anchor`, with a short pointer to it where it sits away from it: the
   * words and the pointer, made (not yet drawn), and their room kept.
   */
  note(anchor: Pt, words: string, colour = NOTE, size = 16, avoid: UBox[] = []): { text: SVGTextElement; pointer: SVGPathElement | null } {
    const text = this.text(this.marks, 0, 0, words, { size, anchor: "start", colour });
    const m = this.measure(text);
    const w = m.x1 - m.x0;
    const h = m.y1 - m.y0;
    const spot = this.noteSpot(anchor, w, h, avoid);
    text.setAttribute("x", String(spot.x0));
    text.setAttribute("y", String(spot.y0 + h * 0.5 + size * 0.34));
    this.taken.push(spot);
    // The pointer: from the note's nearest edge to just short of the anchor.
    const cx = Math.max(spot.x0, Math.min(spot.x1, anchor[0]));
    const cy = Math.max(spot.y0, Math.min(spot.y1, anchor[1]));
    const far = Math.hypot(anchor[0] - cx, anchor[1] - cy);
    let pointer: SVGPathElement | null = null;
    if (far > 16) {
      const from: Pt = [cx + ((anchor[0] - cx) / far) * 3, cy + ((anchor[1] - cy) / far) * 3];
      const to: Pt = [anchor[0] - ((anchor[0] - cx) / far) * 4, anchor[1] - ((anchor[1] - cy) / far) * 4];
      pointer = this.stroke(this.marks, line(from, to, this.rnd(`ptr${words}`)), { colour, width: 1.6, opacity: 0.85 });
    }
    return { text, pointer };
  }

  /* ------------------------------------------------------------------ what every kind takes */

  /** An action: the kind's own, else one every kind takes. */
  build(op: LessonDiagramOp): Build {
    const own = this.kind.op(op);
    if (own) return own;
    const answer = Boolean(op.answer);
    const colourName = (answer ? "green" : op.colour) ?? null;
    switch (op.op) {
      case "highlight": {
        const part = this.part(op.part);
        if (!part) return { items: [] };
        const glow = part.glow(this.glowLayer, colourName ? PALETTE[colourName].fill : PALETTE.yellow.fill, "mark");
        const groups: SVGGraphicsElement[][] = [glow];
        if (op.text) {
          const n = this.note(part.anchor, op.text, colourName ? PALETTE[colourName].stroke : NOTE);
          groups.push([n.pointer, n.text].filter(Boolean) as SVGGraphicsElement[]);
          return { items: this.plan(...groups), sfx: answer ? "ding" : "pop", after: this.popAfter([n.text]) };
        }
        return { items: this.plan(...groups), sfx: answer ? "ding" : null };
      }
      case "label": {
        const part = this.part(op.part);
        if (!part || !op.text) return { items: [] };
        const n = this.note(part.anchor, op.text, colourName ? PALETTE[colourName].stroke : NOTE);
        return {
          items: this.plan([n.pointer, n.text].filter(Boolean) as SVGGraphicsElement[]),
          sfx: answer ? "ding" : "pop",
          after: this.popAfter([n.text]),
        };
      }
      case "arrow": {
        const a = this.part(op.part);
        const b = this.part(op.to_part);
        if (!a || !b) return { items: [] };
        return this.arrow(a.anchor, b.anchor, op.text ?? null, colourName ? PALETTE[colourName].stroke : NOTE, answer);
      }
      default:
        return { items: [] };
    }
  }

  /** A curved arrow from one place to another, its words by its middle. */
  arrow(from: Pt, to: Pt, words: string | null, colour: string, answer = false): Build {
    const far = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const a: Pt = [from[0] + ((to[0] - from[0]) / far) * 6, from[1] + ((to[1] - from[1]) / far) * 6];
    const b: Pt = [to[0] - ((to[0] - from[0]) / far) * 7, to[1] - ((to[1] - from[1]) / far) * 7];
    const curve = bowed(a, b, 0.18);
    const shaft = this.stroke(this.marks, curve.d, { colour, width: 2.2 });
    const tip = this.stroke(this.marks, head(b, curve.at(0.9), 8), { colour, width: 2.2 });
    const groups: SVGGraphicsElement[][] = [[shaft], [tip]];
    let after: (() => void) | undefined;
    if (words) {
      const n = this.note(curve.at(0.5), words, colour, 15);
      groups.push([n.text]);
      after = this.popAfter([n.text]);
    }
    return { items: this.plan(...groups), sfx: answer ? "ding" : "whoosh", after };
  }

  /** A board line's link to a part: the part is lit as the line's mark is. */
  link(task: LinkTask): Build {
    const part = this.part(task.part);
    if (!part) return { items: [] };
    if (task.kind === "strike") {
      const [x0, y0, x1, y1] = [part.box.x0, part.box.y0, part.box.x1, part.box.y1];
      const cross = this.stroke(this.marks, line([x0, y1], [x1, y0], this.rnd(`x${part.name}`)), {
        colour: PALETTE.red.stroke,
        width: 2.6,
      });
      return { items: this.plan([cross]), sfx: "error" };
    }
    if (task.kind === "circle" && part.box.x1 - part.box.x0 < 90 && part.box.y1 - part.box.y0 < 70) {
      const [cx, cy] = centreOf(part.box);
      const ring = this.stroke(
        this.marks,
        loop(cx, cy, (part.box.x1 - part.box.x0) / 2 + 8, (part.box.y1 - part.box.y0) / 2 + 7, this.rnd(`o${part.name}`)),
        { colour: "#ec4899", width: 2.4 },
      );
      return { items: this.plan([ring]) };
    }
    const b = part.box;
    if (part.thin || b.x1 - b.x0 > 130 || b.y1 - b.y0 > 130)
      return { items: this.plan(part.glow(this.glowLayer, PALETTE.yellow.fill, "mark")) };
    // A highlighter's blob over the part's own spot (its count, its value), not a flood of it.
    const [cx, cy] = centreOf(b);
    const blob = el(
      "path",
      {
        d: loop(cx, cy, (b.x1 - b.x0) / 2 + 6, (b.y1 - b.y0) / 2 + 3, this.rnd(`hl${part.name}`), 0),
        fill: PALETTE.yellow.fill,
        "fill-opacity": 0.6,
        stroke: "none",
      },
      this.glowLayer,
    );
    return { items: this.plan([blob]) };
  }
}
