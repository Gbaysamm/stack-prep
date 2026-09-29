/**
 * DOODLES V2: THE PEN THAT CHANGES A PICTURE (docs/plans/doodles-v2-contract.md).
 *
 * One engine per doodle on the board. It puts the art into the page (a single picture, or a
 * community of small figures), and turns each thing the lesson does to it — pulse, circle,
 * highlight, underline, cross, label, arrow, stage, move, fill, grow, shrink, count, group,
 * split — into steps for the pen (drawIn.ts's `DrawItem`s), in the whiteboard-video style:
 *
 * - every mark, word and new shape is DRAWN by the pen (drawIn.ts `planDrawing`: an outline
 *   traced, a fill scribbled in, words written left to right);
 * - everything that moves is MOVED with the pen on it (a car pushed along its route, a level
 *   rising under the scribble, a pile swelling as the pen pulls its corner, a crowd walking
 *   into its blocks);
 * - a drawing replaced by one that is not its build-up is CROSSED OUT and WIPED by the pen,
 *   then the new one drawn in the same place. Nothing fades.
 *
 * The same steps, finished at once (`instant`), give the end state: a doodle mounted again
 * (the board changed width, the student scrolled back) or a student who asked for less motion
 * sees everything already done, exactly as it would have been left.
 *
 * Everything is worked out in the doodle's own units (its viewBox), in an ink layer over the
 * art, so marks move and scale with it.
 */

import { sanitiseDoodle } from "./Doodle.js";
import {
  CELL,
  NAME_BAND,
  arrangements,
  blocksLayout,
  buildsUp,
  charsIn,
  placed,
  repeatShape,
  segmentsOf,
  type RepeatShape,
  type UBox,
  wrapWords,
} from "./doodleArt.js";
import { DRAWN, planDrawing, type DrawItem } from "./drawIn.js";
import type { LessonDoodleOp, LessonDoodleRef } from "./api.js";
import type { Pt } from "./ink.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARK = "#ec4899";
const ARROW = "#7c3aed";
const NOTE = "#5b21b6";
const HIGHLIGHT = "#fde047";
const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive";

/** What the pen does next: its steps, and anything to put right once they are done. */
export interface Build {
  items: DrawItem[];
  /** The whole fitted to this long (a crowd drawn one by one), else each at a hand's pace. */
  totalMs?: number;
  after?: () => void;
}

/** What a doodle is drawn from. */
export type ArtSource =
  | { kind: "single"; name: string; svg: string }
  | {
      kind: "repeat";
      ref: LessonDoodleRef;
      /** Each kind of figure's art, and how many of it, in order. */
      kinds: { svg: string; n: number }[];
      /** This group's actions, in the order the lesson plays them (for its room). */
      plan: Pick<LessonDoodleOp, "op" | "n" | "text">[];
    };

export interface EngineEnv {
  /** The lesson's own drawings by name (custom:…), for a stage. */
  stageArt: (name: string) => string | null;
  /** Another doodle's engine by its id, for an arrow across to it. */
  other: (id: string) => DoodleEngine | null;
  /** Room kept to the right of the art for notes, in pixels (0: none, notes go inside). */
  noteRoom: number;
}

interface Xf {
  tx: number;
  ty: number;
  s: number;
  ox: number;
  oy: number;
}

interface Level {
  settled: SVGRectElement;
  liquid: SVGGElement;
  box: UBox;
  level: number;
  colour: string;
  opacity: string;
}

interface Crowd {
  shape: RepeatShape;
  members: SVGGElement[];
  slots: [number, number][];
  gathered: number;
  /** The loop and name round the gathered block, moved with it. */
  deco: SVGGElement | null;
  decoShift: [number, number];
  /** Where the gathered block is now. */
  gatheredBox: UBox | null;
}

let ids = 0;
const ease = (q: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, q))) / 2;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const made = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) made.setAttribute(name, String(value));
  parent?.appendChild(made);
  return made;
}

const f = (n: number) => n.toFixed(2);

/** A loose hand-drawn loop round a box, overshooting where it started. */
function loopPath(b: UBox, pad: number, seed: number): string {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const rx = (b.x1 - b.x0) / 2 + pad;
  const ry = (b.y1 - b.y0) / 2 + pad;
  const points: string[] = [];
  const start = -Math.PI * 0.62 + (seed % 5) * 0.07;
  const steps = 44;
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (i / steps) * Math.PI * 2.14;
    const grow = 1 + 0.07 * (i / steps) + 0.025 * Math.sin(3 * t + seed);
    points.push(`${i ? "L" : "M"}${f(cx + Math.cos(t) * rx * grow)} ${f(cy + Math.sin(t) * ry * grow)}`);
  }
  return points.join("");
}

/** Where the line from a box's centre towards `toward` leaves the box (and `pad` beyond). */
function edge(b: UBox, toward: Pt, pad: number): Pt {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  const hx = (b.x1 - b.x0) / 2 + pad;
  const hy = (b.y1 - b.y0) / 2 + pad;
  const t = Math.min(dx ? hx / Math.abs(dx) : Infinity, dy ? hy / Math.abs(dy) : Infinity);
  return Number.isFinite(t) ? [cx + dx * t, cy + dy * t] : [cx, cy];
}

function centre(b: UBox): Pt {
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

export class DoodleEngine {
  svg!: SVGSVGElement;
  /** The art, all of it, in one group (grown or shrunk whole). */
  art!: SVGGElement;
  /** What the pen writes over the art: marks, notes, arrows, trails. */
  ink!: SVGGElement;
  defs!: SVGDefsElement;
  /** The drawing it is now (a stage replaces it). */
  raw = "";
  view: [number, number, number, number] = [0, 0, 120, 120];
  crowd: Crowd | null = null;
  /** True while steps are being finished at once rather than drawn. */
  instant = false;
  private xf = new Map<Element, Xf>();
  private levels = new Map<string, Level>();
  private notes: UBox[] = [];

  constructor(
    private host: HTMLElement,
    private source: ArtSource,
    private env: EngineEnv,
  ) {}

  /* ---------------------------------------------------------------- putting it in the page */

  /** The art, cleaned, into the host: nothing drawn yet (see `drawIn`). */
  mount(): boolean {
    this.xf.clear();
    this.levels.clear();
    this.notes = [];
    this.crowd = null;
    const svg = el("svg", { class: "dd-svg", "aria-hidden": "true" });
    this.svg = svg;
    this.defs = el("defs", { class: "dd-defs" }, svg);
    this.art = el("g", { class: "dd-whole" }, svg);
    if (this.source.kind === "single") {
      const clean = sanitiseDoodle(this.source.svg);
      if (!clean) return false;
      this.raw = this.source.svg;
      const box = (clean.svg.getAttribute("viewBox") ?? "0 0 120 120").split(/[\s,]+/).map(Number);
      this.view = [box[0] ?? 0, box[1] ?? 0, box[2] || 120, box[3] || 120];
      for (const child of Array.from(clean.svg.childNodes)) this.art.appendChild(child);
    } else {
      this.mountCrowd(this.source);
    }
    svg.setAttribute("viewBox", this.view.join(" "));
    this.ink = el("g", { class: "dd-ink" }, svg);
    this.host.replaceChildren(svg);
    this.setUpLevels(this.art);
    return true;
  }

  private mountCrowd(source: Extract<ArtSource, { kind: "repeat" }>) {
    const shape = repeatShape(source.ref, source.plan);
    this.view = [0, 0, shape.width, shape.height];
    const first = placed(arrangements(shape.count, shape.layout, [])[0]!, shape);
    const members: SVGGElement[] = [];
    let index = 0;
    for (const kind of source.kinds) {
      const clean = sanitiseDoodle(kind.svg);
      for (let k = 0; k < kind.n && index < shape.count; k += 1, index += 1) {
        const slot = first.slots[index] ?? [0, 0];
        const member = el("g", { class: "dd-member", "data-member": index }, this.art);
        member.setAttribute("transform", `translate(${f(slot[0] + 2)} ${f(slot[1] + 2)})`);
        // The figure itself, in a group of its own that can swell without leaving its place.
        const figure = el("g", { class: "dd-figure" }, member);
        if (clean) for (const child of Array.from(clean.svg.children)) figure.appendChild(child.cloneNode(true));
        members.push(member);
      }
    }
    this.crowd = {
      shape,
      members,
      slots: first.slots.slice(0, members.length),
      gathered: 0,
      deco: null,
      decoShift: [0, 0],
      gatheredBox: null,
    };
  }

  /** The screen pixels one of the art's units takes. */
  unit(): number {
    const m = this.ink?.getScreenCTM();
    return m ? Math.max(0.05, Math.hypot(m.a, m.b)) : 1;
  }

  /** A pixel size in the art's units. */
  px(n: number): number {
    return n / this.unit();
  }

  /** The whole art's box: its viewBox. */
  whole(): UBox {
    const [x, y, w, h] = this.view;
    return { x0: x, y0: y, x1: x + w, y1: y + h };
  }

  /** An element's box in the ink layer's units, however it is moved or scaled. */
  boxOf(element: SVGGraphicsElement): UBox | null {
    let b: DOMRect;
    try {
      b = element.getBBox();
    } catch {
      return null;
    }
    const m = element.getScreenCTM();
    const n = this.ink.getScreenCTM();
    if (!m || !n) return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    const k = n.inverse().multiply(m);
    const corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(k));
    return {
      x0: Math.min(...corners.map((p) => p.x)),
      y0: Math.min(...corners.map((p) => p.y)),
      x1: Math.max(...corners.map((p) => p.x)),
      y1: Math.max(...corners.map((p) => p.y)),
    };
  }

  /** A box in another doodle's units, in this one's (for an arrow across to it). */
  private fromOther(other: DoodleEngine, box: UBox): UBox | null {
    const m = other.ink.getScreenCTM();
    const n = this.ink.getScreenCTM();
    if (!m || !n) return null;
    const k = n.inverse().multiply(m);
    const a = new DOMPoint(box.x0, box.y0).matrixTransform(k);
    const b = new DOMPoint(box.x1, box.y1).matrixTransform(k);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }

  /** A point in the ink's units, on the screen. */
  screen(p: Pt): Pt | null {
    const m = this.ink.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(p[0], p[1]).matrixTransform(m);
    return [q.x, q.y];
  }

  part(name: string | null | undefined): SVGGraphicsElement | null {
    if (!name) return null;
    return this.svg.querySelector<SVGGraphicsElement>(`[data-part="${CSS.escape(name)}"]`);
  }

  /** What an action is about: a part, the first n of a group, or the whole doodle. */
  target(op: Pick<LessonDoodleOp, "part" | "n">): UBox {
    const part = this.part(op.part);
    if (part) return this.boxOf(part) ?? this.whole();
    if (this.crowd) return this.membersBox(op.n ?? this.crowd.members.length);
    return this.contentBox();
  }

  /** Where the art actually is (its drawn shapes), within its viewBox. */
  contentBox(): UBox {
    const b = this.boxOf(this.art);
    const w = this.whole();
    if (!b) return w;
    return { x0: Math.max(w.x0, b.x0), y0: Math.max(w.y0, b.y0), x1: Math.min(w.x1, b.x1), y1: Math.min(w.y1, b.y1) };
  }

  private membersBox(n: number): UBox {
    const crowd = this.crowd!;
    const slots = crowd.slots.slice(0, Math.max(1, n));
    return {
      x0: Math.min(...slots.map((s) => s[0])) + 2,
      y0: Math.min(...slots.map((s) => s[1])) + 2,
      x1: Math.max(...slots.map((s) => s[0])) + CELL - 2,
      y1: Math.max(...slots.map((s) => s[1])) + CELL - 2,
    };
  }

  /** The elements the pen draws in a picture: every shape and word, but its definitions. */
  private drawable(root: Element): SVGGraphicsElement[] {
    return Array.from(root.querySelectorAll<SVGGraphicsElement>(DRAWN)).filter(
      (element) => !element.closest("defs, clipPath, mask") && !element.hasAttribute("data-path"),
    );
  }

  /** The pen's steps for drawing these, or none when they are to be there at once. */
  private draw(elements: SVGGraphicsElement[]): DrawItem[] {
    return this.instant || elements.length === 0 ? [] : planDrawing(this.svg, elements);
  }

  /* ---------------------------------------------------------------- levels (fill) */

  /** Each `data-fill` group's level: its shape emptied, and a liquid inside it, clipped to it. */
  private setUpLevels(root: Element) {
    for (const group of Array.from(root.querySelectorAll<SVGGElement>("g[data-fill]"))) {
      const name = group.getAttribute("data-fill") ?? "";
      if (!name || this.levels.has(name)) continue;
      const shapes = Array.from(group.querySelectorAll<SVGGraphicsElement>("path, circle, ellipse, rect, polygon"));
      if (!shapes.length) continue;
      let box: DOMRect;
      try {
        box = group.getBBox();
      } catch {
        continue;
      }
      const style = getComputedStyle(shapes[0]!);
      const coloured = style.fill && style.fill !== "none" && !style.fill.startsWith("url");
      const colour = coloured ? style.fill : "#3b82f6";
      const opacity = coloured ? style.fillOpacity || "0.5" : "0.45";
      for (const shape of shapes) shape.style.fill = "none";
      ids += 1;
      const clip = el("clipPath", { id: `dd-clip-${ids}` }, this.defs);
      for (const shape of shapes) {
        const copy = shape.cloneNode(false) as SVGElement;
        for (const name of ["style", "class", "fill", "stroke", "mask", "opacity"]) copy.removeAttribute(name);
        clip.appendChild(copy);
      }
      const liquid = el("g", { class: "dd-liquid", "clip-path": `url(#dd-clip-${ids})` }, group);
      const b: UBox = { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height };
      const start = Math.min(1, Math.max(0, Number.parseFloat(group.getAttribute("data-level") ?? "0") || 0));
      const settled = el(
        "rect",
        { x: f(b.x0 - 2), width: f(b.x1 - b.x0 + 4), fill: colour, "fill-opacity": opacity },
        liquid,
      );
      const level: Level = { settled, liquid, box: b, level: start, colour, opacity };
      this.setLevel(level, start);
      this.levels.set(name, level);
    }
  }

  private setLevel(level: Level, to: number) {
    const h = level.box.y1 - level.box.y0;
    level.level = to;
    level.settled.setAttribute("y", f(level.box.y1 - to * h));
    level.settled.setAttribute("height", f(Math.max(0, to * h + 2)));
    level.settled.style.display = to > 0 ? "" : "none";
  }

  /* ---------------------------------------------------------------- moving and scaling a part */

  /** The group that carries a part's moves: made round it the first time it is moved. */
  private carrier(target: SVGGraphicsElement | null): SVGGElement {
    if (!target) return this.art;
    const parent = target.parentElement;
    if (parent?.classList.contains("dd-xf")) return parent as unknown as SVGGElement;
    const wrap = document.createElementNS(SVG_NS, "g");
    wrap.setAttribute("class", "dd-xf");
    target.parentNode?.insertBefore(wrap, target);
    wrap.appendChild(target);
    return wrap;
  }

  private xfOf(carrier: SVGGElement): Xf {
    let found = this.xf.get(carrier);
    if (!found) {
      let b: DOMRect | null = null;
      try {
        b = carrier.getBBox();
      } catch {
        b = null;
      }
      found = { tx: 0, ty: 0, s: 1, ox: b ? b.x + b.width / 2 : 0, oy: b ? b.y + b.height : 0 };
      this.xf.set(carrier, found);
    }
    return found;
  }

  private applyXf(carrier: SVGGElement, x: Xf) {
    carrier.setAttribute(
      "transform",
      `translate(${f(x.tx)} ${f(x.ty)}) translate(${f(x.ox)} ${f(x.oy)}) scale(${x.s.toFixed(4)}) translate(${f(-x.ox)} ${f(-x.oy)})`,
    );
  }

  /** How a step in the ink's units reads in the carrier's own (its parent's) units. */
  private inkToCarrier(carrier: SVGGElement): (d: Pt) => Pt {
    const parent = carrier.parentElement as unknown as SVGGraphicsElement | null;
    const m = parent?.getScreenCTM?.();
    const n = this.ink.getScreenCTM();
    if (!m || !n) return (d) => d;
    const k = m.inverse().multiply(n);
    return ([dx, dy]) => [k.a * dx + k.c * dy, k.b * dx + k.d * dy];
  }

  /* ---------------------------------------------------------------- the pen's steps */

  /** Drawing the whole doodle in, as the lesson brings it: a crowd one figure at a time. */
  drawIn(caption: DrawItem | null): Build {
    if (this.crowd) {
      const items: DrawItem[] = [];
      for (const member of this.crowd.members) items.push(...this.draw(this.drawable(member)));
      if (caption) items.push(caption);
      const n = this.crowd.members.length;
      return { items, totalMs: 1400 + n * 115 };
    }
    const items = this.draw(this.drawable(this.art));
    if (caption) items.push(caption);
    return { items };
  }

  /** One action, as the pen does it. */
  build(op: LessonDoodleOp): Build {
    switch (op.op) {
      case "pulse":
        return this.pulse(op);
      case "circle":
      case "highlight":
      case "underline":
      case "cross":
        return this.markPart(op);
      case "label":
        return { items: this.draw(this.note(op.text ?? "", this.target(op))) };
      case "arrow":
        return this.arrow(op);
      case "stage":
        return this.stage(op);
      case "move":
        return this.move(op);
      case "fill":
        return this.fill(op);
      case "grow":
      case "shrink":
        return this.scale(op);
      case "count":
        return this.count(op);
      case "group":
        return this.gather(op);
      case "split":
        return this.split(op);
      default:
        return { items: [] };
    }
  }

  private pulse(op: LessonDoodleOp): Build {
    const part = this.part(op.part);
    const figures = this.crowd && !part
      ? this.crowd.members
          .slice(0, op.n ?? this.crowd.members.length)
          .map((member) => member.querySelector<SVGGElement>(".dd-figure"))
          .filter((figure): figure is SVGGElement => figure !== null)
      : null;
    const carriers = part ? [this.carrier(part)] : figures ?? [this.art];
    const box = this.target(op);
    const states = carriers.map((carrier) => {
      const x = this.xfOf(carrier);
      if (figures) {
        // A figure swells about its own middle.
        x.ox = 20;
        x.oy = 20;
      }
      return { carrier, x, s0: x.s };
    });
    const corner: Pt = [box.x1, box.y0];
    return {
      items: [
        {
          kind: "stroke",
          ms: 950,
          show: (p) => {
            const beat = Math.abs(Math.sin(p * Math.PI * 2));
            for (const s of states) {
              s.x.s = s.s0 * (1 + 0.14 * beat);
              this.applyXf(s.carrier, s.x);
            }
          },
          // The pen taps it twice.
          tip: (p) => this.screen([corner[0] + this.px(4), corner[1] - this.px(10) * Math.abs(Math.sin(p * Math.PI * 2))]),
          finish: () => {
            for (const s of states) {
              s.x.s = s.s0;
              this.applyXf(s.carrier, s.x);
            }
          },
        },
      ],
    };
  }

  /** A circle, highlight, underline or cross on a part (or all of it), and its words. */
  private markPart(op: Pick<LessonDoodleOp, "op" | "part" | "n" | "text">, colourOf?: string): Build {
    const b = this.target(op);
    const made = this.markShapes(op.op, b, colourOf);
    if (op.text) made.push(...this.note(op.text, b));
    return { items: this.draw(made) };
  }

  /** The strokes of a mark round a box, in the ink layer. */
  markShapes(kind: string, b: UBox, colour?: string): SVGGraphicsElement[] {
    const w = this.px(2.8);
    const pad = this.px(5);
    const stroke = {
      fill: "none",
      stroke: colour ?? MARK,
      "stroke-width": f(w),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    };
    if (kind === "circle")
      return [el("path", { ...stroke, d: loopPath(b, pad, Math.round(b.x0 + b.y0)) }, this.ink)];
    if (kind === "underline") {
      const y = b.y1 + pad * 0.7;
      return [
        el("path", { ...stroke, d: `M${f(b.x0 - pad * 0.4)} ${f(y)}Q${f((b.x0 + b.x1) / 2)} ${f(y + pad * 0.5)} ${f(b.x1 + pad * 0.4)} ${f(y - pad * 0.2)}` }, this.ink),
      ];
    }
    if (kind === "cross")
      return [
        el("path", { ...stroke, d: `M${f(b.x0 - pad * 0.3)} ${f(b.y0 - pad * 0.3)}L${f(b.x1 + pad * 0.3)} ${f(b.y1 + pad * 0.3)}` }, this.ink),
        el("path", { ...stroke, d: `M${f(b.x1 + pad * 0.3)} ${f(b.y0 - pad * 0.3)}L${f(b.x0 - pad * 0.3)} ${f(b.y1 + pad * 0.3)}` }, this.ink),
      ];
    // A highlighter swiped across it, under the ink's colour.
    const h = b.y1 - b.y0 + pad;
    const swipe = el(
      "path",
      {
        fill: "none",
        stroke: colour ?? HIGHLIGHT,
        "stroke-opacity": "0.55",
        "stroke-width": f(h),
        "stroke-linecap": "butt",
        d: `M${f(b.x0 - pad * 0.3)} ${f((b.y0 + b.y1) / 2)}L${f(b.x1 + pad * 0.3)} ${f((b.y0 + b.y1) / 2)}`,
      },
      this.ink,
    );
    swipe.style.mixBlendMode = "multiply";
    this.ink.insertBefore(swipe, this.ink.firstChild);
    return [swipe];
  }

  /**
   * A short note beside a box, with a pointer back to it: in the room kept to the right of the
   * art where there is some, else just above or below the box, inside the picture.
   */
  note(text: string, b: UBox): SVGGraphicsElement[] {
    const size = this.px(17);
    const view = this.whole();
    const room = this.env.noteRoom;
    const lines = wrapWords(text, charsIn(room > 0 ? room - 12 : (view.x1 - view.x0) * this.unit() * 0.9));
    const lineH = size * 1.02;
    const width = Math.max(...lines.map((l) => l.length)) * size * 0.44;
    const height = lines.length * lineH;
    let x: number;
    let y: number;
    let anchor: "start" | "middle" = "start";
    if (this.crowd) {
      // Over the figures it is about, in the band kept above the group.
      anchor = "middle";
      x = Math.min(Math.max((b.x0 + b.x1) / 2, view.x0 + width / 2), view.x1 - width / 2);
      y = b.y0 - this.px(7) - height + size * 0.8;
    } else if (room > 0) {
      x = view.x1 + this.px(12);
      y = Math.min(Math.max((b.y0 + b.y1) / 2 - height / 2 + size * 0.8, view.y0 + size * 0.8), view.y1 - height + size * 0.8);
    } else {
      anchor = "middle";
      x = Math.min(Math.max((b.x0 + b.x1) / 2, view.x0 + width / 2), view.x1 - width / 2);
      y = b.y0 - this.px(8) - height + size * 0.8 >= view.y0 ? b.y0 - this.px(8) - height + size * 0.8 : b.y1 + this.px(6) + size * 0.8;
    }
    // Clear of the notes already written.
    const boxAt = (top: number): UBox => ({
      x0: anchor === "start" ? x : x - width / 2,
      x1: anchor === "start" ? x + width : x + width / 2,
      y0: top - size * 0.8,
      y1: top - size * 0.8 + height,
    });
    for (let tries = 0; tries < 12 && this.notes.some((n) => overlaps(n, boxAt(y))); tries += 1) y += lineH;
    const placedBox = boxAt(y);
    this.notes.push(placedBox);
    const out: SVGGraphicsElement[] = [];
    // The pointer: from the note's start back to the part.
    const from: Pt = anchor === "start" ? [x - this.px(3), placedBox.y0 + size * 0.45] : [x, placedBox.y1 > b.y0 ? placedBox.y0 - this.px(1) : placedBox.y1];
    const to = edge(b, from, this.px(3));
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > this.px(10)) {
      const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - this.px(6)];
      out.push(
        el(
          "path",
          {
            d: `M${f(from[0])} ${f(from[1])}Q${f(mid[0])} ${f(mid[1])} ${f(to[0])} ${f(to[1])}`,
            fill: "none",
            stroke: NOTE,
            "stroke-width": f(this.px(1.8)),
            "stroke-linecap": "round",
          },
          this.ink,
        ),
      );
      out.push(el("circle", { cx: f(to[0]), cy: f(to[1]), r: f(this.px(2.4)), fill: NOTE }, this.ink));
    }
    const words = el(
      "text",
      {
        x: f(x),
        y: f(y),
        "font-family": HAND,
        "font-size": f(size),
        "font-weight": "700",
        fill: NOTE,
        "text-anchor": anchor,
      },
      this.ink,
    );
    lines.forEach((line, i) => {
      const span = el("tspan", { x: f(x), dy: i ? f(lineH) : "0" }, words);
      span.textContent = line;
    });
    out.push(words);
    return out;
  }

  private arrow(op: LessonDoodleOp): Build {
    const from = this.target({ part: op.part });
    let to: UBox | null = null;
    if (op.to_id) {
      const other = this.env.other(op.to_id);
      if (other) {
        const theirs = other.target({ part: op.to_part });
        to = this.fromOther(other, theirs);
      }
    } else if (op.to_part) {
      to = this.target({ part: op.to_part });
    }
    if (!to) return { items: [] };
    const a = edge(from, centre(to), this.px(4));
    const b = edge(to, centre(from), this.px(6));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.min(this.px(40), length * 0.22);
    const c: Pt = [(a[0] + b[0]) / 2 - (dy / length) * bend, (a[1] + b[1]) / 2 + (dx / length) * bend];
    const w = this.px(2.6);
    const stroke = { fill: "none", stroke: ARROW, "stroke-width": f(w), "stroke-linecap": "round", "stroke-linejoin": "round" };
    const shaft = el("path", { ...stroke, d: `M${f(a[0])} ${f(a[1])}Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}` }, this.ink);
    const tx = b[0] - c[0];
    const ty = b[1] - c[1];
    const tl = Math.hypot(tx, ty) || 1;
    const ux = tx / tl;
    const uy = ty / tl;
    const head = this.px(9);
    const left: Pt = [b[0] - ux * head - uy * head * 0.6, b[1] - uy * head + ux * head * 0.6];
    const right: Pt = [b[0] - ux * head + uy * head * 0.6, b[1] - uy * head - ux * head * 0.6];
    const tip = el("path", { ...stroke, d: `M${f(left[0])} ${f(left[1])}L${f(b[0])} ${f(b[1])}L${f(right[0])} ${f(right[1])}` }, this.ink);
    const made: SVGGraphicsElement[] = [shaft, tip];
    if (op.text) {
      const size = this.px(16);
      const words = el(
        "text",
        { x: f(c[0]), y: f(c[1] - this.px(4)), "font-family": HAND, "font-size": f(size), "font-weight": "700", fill: ARROW, "text-anchor": "middle" },
        this.ink,
      );
      words.textContent = op.text;
      made.push(words);
    }
    return { items: this.draw(made) };
  }

  /**
   * The next drawing. A build-up has its new elements added and drawn, in place; any other is
   * crossed out and wiped away by the pen, and the new one drawn where it was.
   */
  private stage(op: LessonDoodleOp): Build {
    const next = op.stage ? this.env.stageArt(op.stage) : null;
    if (!next || this.crowd) return { items: [] };
    const clean = sanitiseDoodle(next);
    if (!clean) return { items: [] };
    if (buildsUp(this.raw, next)) {
      const had = sanitiseDoodle(this.raw);
      const keep = had ? had.svg.children.length : 0;
      const fresh = Array.from(clean.svg.children).slice(keep);
      const holder = el("g", { class: "dd-stage" }, this.art);
      for (const child of fresh) holder.appendChild(child);
      this.raw = next;
      this.setUpLevels(holder);
      return { items: this.draw(this.drawable(holder)) };
    }
    // Crossed out, wiped, and drawn again.
    const old = this.contentBox();
    const pad = this.px(4);
    const w = this.px(3);
    const stroke = { fill: "none", stroke: MARK, "stroke-width": f(w), "stroke-linecap": "round" };
    const crossing = [
      el("path", { ...stroke, d: `M${f(old.x0 - pad)} ${f(old.y0 - pad)}L${f(old.x1 + pad)} ${f(old.y1 + pad)}` }, this.ink),
      el("path", { ...stroke, d: `M${f(old.x1 + pad)} ${f(old.y0 - pad)}L${f(old.x0 - pad)} ${f(old.y1 + pad)}` }, this.ink),
    ];
    const items = this.draw(crossing);
    const leaving = el("g", { class: "dd-leaving" }, this.svg);
    leaving.appendChild(this.art);
    leaving.appendChild(this.ink);
    // The new drawing, in its own layers, hidden until the pen draws it.
    this.art = el("g", { class: "dd-whole" }, this.svg);
    for (const child of Array.from(clean.svg.childNodes)) this.art.appendChild(child);
    this.ink = el("g", { class: "dd-ink" }, this.svg);
    this.raw = next;
    this.xf.clear();
    this.levels.clear();
    this.notes = [];
    this.art.style.visibility = "hidden";
    this.setUpLevels(this.art);
    // The wipe: the old drawing rubbed out left to right, the pen scrubbing up and down.
    ids += 1;
    const mask = el("mask", { id: `dd-wipe-${ids}`, maskUnits: "userSpaceOnUse" }, this.defs);
    const view = this.whole();
    const span = { x: view.x0 - (view.x1 - view.x0), y: view.y0 - (view.y1 - view.y0), w: (view.x1 - view.x0) * 3, h: (view.y1 - view.y0) * 3 };
    for (const [name, value] of Object.entries({ x: span.x, y: span.y, width: span.w, height: span.h })) mask.setAttribute(name, f(value));
    el("rect", { x: f(span.x), y: f(span.y), width: f(span.w), height: f(span.h), fill: "#fff" }, mask);
    const rub = el("rect", { x: f(old.x0 - pad * 3), y: f(span.y), width: "0", height: f(span.h), fill: "#000" }, mask);
    leaving.setAttribute("mask", `url(#dd-wipe-${ids})`);
    const reach = old.x1 - old.x0 + pad * 6;
    const wipe: DrawItem = {
      kind: "stroke",
      ms: 750,
      show: (p) => rub.setAttribute("width", f(reach * p)),
      tip: (p) =>
        this.screen([old.x0 - pad * 3 + reach * p, old.y0 + (old.y1 - old.y0) * (0.5 + 0.45 * Math.sin(p * Math.PI * 9))]),
      finish: () => {
        leaving.remove();
        mask.remove();
        this.art.style.visibility = "";
      },
    };
    const drawn = this.draw(this.drawable(this.art));
    // Shown for the pen to draw into once the old one is gone.
    const reveal: DrawItem = {
      kind: "stroke",
      ms: 1,
      show: () => {
        this.art.style.visibility = "";
      },
      tip: () => null,
      finish: () => {
        this.art.style.visibility = "";
      },
    };
    if (this.instant) {
      leaving.remove();
      mask.remove();
      this.art.style.visibility = "";
      return { items: [] };
    }
    return { items: [...items, wipe, reveal, ...drawn] };
  }

  private move(op: LessonDoodleOp): Build {
    const part = this.part(op.part);
    const route = op.path ? this.svg.querySelector<SVGPathElement>(`path[data-path="${CSS.escape(op.path)}"]`) : null;
    if (!part || !route) return { items: [] };
    let total = 0;
    try {
      total = route.getTotalLength();
    } catch {
      total = 0;
    }
    const m = route.getScreenCTM();
    const n = this.ink.getScreenCTM();
    const k = m && n ? n.inverse().multiply(m) : null;
    const points: Pt[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const at = route.getPointAtLength((total * i) / 64);
      const q = k ? new DOMPoint(at.x, at.y).matrixTransform(k) : at;
      points.push([q.x, q.y]);
    }
    if (points.length < 2) return { items: [] };
    const carrier = this.carrier(part);
    const x = this.xfOf(carrier);
    const toCarrier = this.inkToCarrier(carrier);
    const start = { tx: x.tx, ty: x.ty };
    const p0 = points[0]!;
    const trail = el(
      "polyline",
      {
        fill: "none",
        stroke: ARROW,
        "stroke-width": f(this.px(2)),
        "stroke-dasharray": `${f(this.px(3))} ${f(this.px(6))}`,
        "stroke-linecap": "round",
        "stroke-opacity": "0.8",
        points: "",
      },
      this.ink,
    );
    this.ink.insertBefore(trail, this.ink.firstChild);
    const along = (s: number): Pt => {
      const at = s * (points.length - 1);
      const i = Math.min(points.length - 2, Math.floor(at));
      const t = at - i;
      const a = points[i]!;
      const b = points[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const set = (s: number) => {
      const here = along(s);
      const [dx, dy] = toCarrier([here[0] - p0[0], here[1] - p0[1]]);
      x.tx = start.tx + dx;
      x.ty = start.ty + dy;
      this.applyXf(carrier, x);
      const upto = Math.floor(s * (points.length - 1));
      trail.setAttribute(
        "points",
        [...points.slice(0, upto + 1), here].map((p) => `${f(p[0])},${f(p[1])}`).join(" "),
      );
    };
    const px = total * (k ? Math.hypot(k.a, k.b) : 1) * this.unit();
    return {
      items: [
        {
          kind: "stroke",
          ms: Math.max(1100, Math.min(4200, px / 0.16)),
          show: (p) => set(ease(p)),
          tip: (p) => {
            const b = this.boxOf(part);
            return b ? this.screen([(b.x0 + b.x1) / 2, b.y0 + (b.y1 - b.y0) * 0.35]) : this.screen(along(ease(p)));
          },
          finish: () => set(1),
        },
      ],
    };
  }

  private fill(op: LessonDoodleOp): Build {
    const level = op.fill ? this.levels.get(op.fill) : this.levels.values().next().value;
    if (!level || op.to == null) return { items: [] };
    const from = level.level;
    const to = Math.min(1, Math.max(0, op.to));
    const h = level.box.y1 - level.box.y0;
    if (this.instant || Math.abs(to - from) < 0.001) {
      this.setLevel(level, to);
      return { items: [] };
    }
    if (to > from) {
      // The new band, scribbled in over what was there.
      const band = el(
        "rect",
        {
          x: f(level.box.x0 - 2),
          y: f(level.box.y1 - to * h),
          width: f(level.box.x1 - level.box.x0 + 4),
          height: f((to - from) * h + 1),
          fill: level.colour,
          "fill-opacity": level.opacity,
        },
        level.liquid,
      );
      return {
        items: this.draw([band]),
        after: () => {
          this.setLevel(level, to);
          band.remove();
        },
      };
    }
    // Falling: the surface wiped down, the pen rubbing along it.
    return {
      items: [
        {
          kind: "fill",
          ms: 500 + (from - to) * 1400,
          show: (p) => this.setLevel(level, from + (to - from) * ease(p)),
          tip: (p) => {
            const surface = level.box.y1 - (from + (to - from) * ease(p)) * h;
            return this.screen([level.box.x0 + (level.box.x1 - level.box.x0) * (0.5 + 0.45 * Math.sin(p * Math.PI * 7)), surface]);
          },
          finish: () => this.setLevel(level, to),
        },
      ],
    };
  }

  private scale(op: LessonDoodleOp): Build {
    const part = this.part(op.part);
    const carrier = part ? this.carrier(part) : this.art;
    const x = this.xfOf(carrier);
    const s0 = x.s;
    const s1 = s0 * (op.by ?? (op.op === "grow" ? 1.3 : 0.7));
    return {
      items: [
        {
          kind: "stroke",
          ms: 900,
          show: (p) => {
            x.s = s0 + (s1 - s0) * ease(p);
            this.applyXf(carrier, x);
          },
          // The pen pulls (or pushes) its top corner.
          tip: () => {
            const b = this.boxOf(carrier) ?? this.whole();
            return this.screen([b.x1, b.y0]);
          },
          finish: () => {
            x.s = s1;
            this.applyXf(carrier, x);
          },
        },
      ],
    };
  }

  /* ---------------------------------------------------------------- a community */

  private count(op: LessonDoodleOp): Build {
    const crowd = this.crowd;
    if (!crowd) return { items: [] };
    const n = Math.min(crowd.members.length, op.n ?? crowd.members.length);
    const size = Math.min(this.px(12), 24);
    const made: SVGGraphicsElement[] = [];
    for (let i = 0; i < n; i += 1) {
      const member = crowd.members[i]!;
      member.querySelector(".dd-count")?.remove();
      const number = el(
        "text",
        // Over the figure's head, in the band kept above the group.
        { class: "dd-count", x: "20", y: "-3", "font-family": HAND, "font-size": f(size), "font-weight": "700", fill: MARK, "text-anchor": "middle" },
        member,
      );
      number.textContent = String(i + 1);
      made.push(number);
    }
    return { items: this.draw(made), totalMs: 500 + n * 130 };
  }

  /** Every figure walking to its place in a new arrangement, the pen with the crowd. */
  private walk(next: [number, number][], shift?: { deco: SVGGElement; from: Pt; to: Pt }): DrawItem {
    const crowd = this.crowd!;
    const was = crowd.slots.map((s) => [...s] as [number, number]);
    const set = (p: number) => {
      crowd.members.forEach((member, i) => {
        const a = was[i]!;
        const b = next[i] ?? a;
        // Each sets off a moment after the one before, so the crowd moves as people do.
        const q = ease(Math.min(1, Math.max(0, p * 1.35 - (i / Math.max(1, crowd.members.length)) * 0.35)));
        member.setAttribute("transform", `translate(${f(a[0] + (b[0] - a[0]) * q + 2)} ${f(a[1] + (b[1] - a[1]) * q + 2)})`);
      });
      if (shift) {
        const q = ease(p);
        shift.deco.setAttribute("transform", `translate(${f(shift.from[0] + (shift.to[0] - shift.from[0]) * q)} ${f(shift.from[1] + (shift.to[1] - shift.from[1]) * q)})`);
      }
    };
    const middle = (p: number): Pt | null => {
      const q = ease(p);
      const xs = was.map((a, i) => a[0] + ((next[i] ?? a)[0] - a[0]) * q);
      const ys = was.map((a, i) => a[1] + ((next[i] ?? a)[1] - a[1]) * q);
      return this.screen([(Math.min(...xs) + Math.max(...xs)) / 2 + CELL / 2, Math.min(...ys) + CELL * 0.3]);
    };
    return {
      kind: "stroke",
      ms: 1300,
      show: set,
      tip: middle,
      finish: () => {
        set(1);
        crowd.slots = next.map((s) => [...s] as [number, number]);
      },
    };
  }

  private blockName(text: string, b: UBox, parent: SVGGElement): SVGGraphicsElement {
    const size = Math.min(this.px(16), NAME_BAND * 0.5);
    const words = el(
      "text",
      { x: f((b.x0 + b.x1) / 2), y: f(b.y1 + size * 1.25), "font-family": HAND, "font-size": f(size), "font-weight": "700", fill: NOTE, "text-anchor": "middle" },
      parent,
    );
    words.textContent = text;
    return words;
  }

  private gather(op: LessonDoodleOp): Build {
    const crowd = this.crowd;
    if (!crowd || !op.n) return { items: [] };
    const n = Math.min(crowd.members.length, op.n);
    const spread = segmentsOf(crowd.members.length, n, null)!;
    const arrangement = placed(blocksLayout(spread.segments, crowd.shape.rows, spread.sides), crowd.shape);
    const walk = this.walk(arrangement.slots);
    crowd.gathered = n;
    crowd.deco?.remove();
    const deco = el("g", { class: "dd-seg" }, this.ink);
    crowd.deco = deco;
    crowd.decoShift = [0, 0];
    const box = arrangement.blocks[0]!;
    crowd.gatheredBox = box;
    const loop = el(
      "path",
      { d: loopPath(box, this.px(4), 3), fill: "none", stroke: ARROW, "stroke-width": f(this.px(2.6)), "stroke-linecap": "round" },
      deco,
    );
    const name = op.text ? this.blockName(op.text, box, deco) : null;
    const drawn = this.draw(name ? [loop, name] : [loop]);
    if (this.instant) walk.finish();
    return { items: this.instant ? [] : [walk, ...drawn] };
  }

  private split(op: LessonDoodleOp): Build {
    const crowd = this.crowd;
    if (!crowd || !op.n) return { items: [] };
    const count = crowd.members.length;
    const taken = Math.min(op.n, Math.max(1, count - 1));
    const spread = segmentsOf(count, crowd.gathered, taken)!;
    const arrangement = placed(blocksLayout(spread.segments, crowd.shape.rows, spread.sides), crowd.shape);
    const [leftName, rightName] = (op.text ?? "").split("|").map((side) => side.trim());
    // Each side's name under its figures (the gathered block has its own name).
    const side = (which: number): UBox => {
      const all = arrangement.blocks.filter((_, i) => spread.sides[i] === which);
      const own = arrangement.blocks.filter((_, i) => spread.sides[i] === which && i !== spread.gatheredAt);
      const boxes = own.length ? own : all;
      return {
        x0: Math.min(...boxes.map((b) => b.x0)),
        y0: Math.min(...boxes.map((b) => b.y0)),
        x1: Math.max(...boxes.map((b) => b.x1)),
        y1: Math.max(...boxes.map((b) => b.y1)),
      };
    };
    const left = side(0);
    const right = side(1);
    let shift: { deco: SVGGElement; from: Pt; to: Pt } | undefined;
    const before: DrawItem[] = [];
    if (crowd.deco && crowd.gatheredBox && crowd.gathered > 0) {
      if (spread.gatheredAt !== null) {
        const block = arrangement.blocks[spread.gatheredAt]!;
        const to: Pt = [crowd.decoShift[0] + block.x0 - crowd.gatheredBox.x0, crowd.decoShift[1] + block.y0 - crowd.gatheredBox.y0];
        shift = { deco: crowd.deco, from: crowd.decoShift, to };
        crowd.decoShift = to;
        crowd.gatheredBox = block;
      } else {
        // The split breaks the gathered block up: its loop and name are wiped away first.
        const deco = crowd.deco;
        const box = this.boxOf(deco) ?? crowd.gatheredBox;
        crowd.deco = null;
        crowd.gathered = 0;
        crowd.gatheredBox = null;
        if (this.instant) deco.remove();
        else before.push(this.wipeAway(deco, box));
      }
    }
    const walk = this.walk(arrangement.slots, shift);
    const names = el("g", { class: "dd-seg" }, this.ink);
    const made: SVGGraphicsElement[] = [];
    if (leftName) made.push(this.blockName(leftName, left, names));
    if (rightName) made.push(this.blockName(rightName, right, names));
    const drawn = this.draw(made);
    if (this.instant) walk.finish();
    return { items: this.instant ? [] : [...before, walk, ...drawn] };
  }

  /** Something the pen has drawn, rubbed out left to right, the pen scrubbing up and down. */
  private wipeAway(group: SVGGElement, box: UBox): DrawItem {
    ids += 1;
    const pad = this.px(6);
    const mask = el("mask", { id: `dd-wipe-${ids}`, maskUnits: "userSpaceOnUse" }, this.defs);
    const area = { x: box.x0 - pad * 2, y: box.y0 - pad * 2, w: box.x1 - box.x0 + pad * 4, h: box.y1 - box.y0 + pad * 4 };
    for (const [name, value] of Object.entries({ x: area.x, y: area.y, width: area.w, height: area.h }))
      mask.setAttribute(name, f(value));
    el("rect", { x: f(area.x), y: f(area.y), width: f(area.w), height: f(area.h), fill: "#fff" }, mask);
    const rub = el("rect", { x: f(area.x), y: f(area.y), width: "0", height: f(area.h), fill: "#000" }, mask);
    group.setAttribute("mask", `url(#dd-wipe-${ids})`);
    return {
      kind: "stroke",
      ms: 650,
      show: (p) => rub.setAttribute("width", f(area.w * p)),
      tip: (p) => this.screen([area.x + area.w * p, box.y0 + (box.y1 - box.y0) * (0.5 + 0.45 * Math.sin(p * Math.PI * 9))]),
      finish: () => {
        group.remove();
        mask.remove();
      },
    };
  }

  /** The box of a named part (or all of it), for the dot of a board line's link. */
  linkBox(part: string | null | undefined): UBox {
    return this.target({ part });
  }
}

function overlaps(a: UBox, b: UBox): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
