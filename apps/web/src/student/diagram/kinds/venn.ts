/**
 * A VENN DIAGRAM (section 8, `kind: venn`): two or three sets, each with its name (and its total),
 * in a universal set where there is one, and the number in each region.
 *
 * The regions are worked out from the geometry: every region is "in these sets and not in those"
 * (a membership), drawn as the universal box clipped to the circles it is in and masked by the
 * ones it is not, so a region of any shape is shaded exactly; a tap is placed by testing the
 * point against each circle. Each region's count is written at its roomiest point.
 *
 * Regions are named by the sets' keys, in the order the sets are given:
 *   two sets A, B:   'A only', 'B only', 'A∩B', 'outside'
 *   three sets:      'A only', 'B only', 'C only', 'A∩B only', 'A∩C only', 'B∩C only',
 *                    'A∩B∩C', 'outside'
 * and any SET EXPRESSION names the regions it covers, for shade and highlight: keys and U,
 * ∩ (or &), ∪ (or |), ' (the complement, after), − (or -, \: difference) and brackets, e.g.
 * "A∪B", "(A∪B)'", "A∩B'", "A−B". 'neither' (or 'none') is 'outside'; 'both' is 'A∩B' of two.
 *
 * Arriving: the universal box and its name, then each set's circle and name (not one marked
 * `later`), then the counts given. Actions: draw-set, fill (write a count in a region), shade.
 */

import type { DiagramColour, DiagramSet, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  CYCLE,
  INK,
  PALETTE,
  el,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
  type Part,
  type UBox,
} from "../engine.js";
import { box as handBox, loop } from "../rough.js";

interface Circle {
  key: string;
  set: DiagramSet;
  cx: number;
  cy: number;
  r: number;
  colour: DiagramColour;
  drawn: boolean;
  clip: string;
  mask: string;
}

const VIEW2: [number, number] = [360, 262];
const VIEW3: [number, number] = [360, 318];

/** A membership as a bit mask: bit i set where the point is in set i. */
type Mask = number;

function layout(n: number): { centres: Pt[]; r: number; frame: UBox } {
  if (n === 3)
    return {
      centres: [
        [138, 128],
        [222, 128],
        [180, 200],
      ],
      r: 70,
      frame: { x0: 12, y0: 30, x1: 348, y1: 306 },
    };
  return {
    centres: [
      [128, 150],
      [232, 150],
    ],
    r: 82,
    frame: { x0: 12, y0: 30, x1: 348, y1: 250 },
  };
}

/** The set expression's regions, as memberships. Throws on what it cannot read. */
export function regionsOf(expr: string, keys: string[]): Set<Mask> {
  const all = new Set<Mask>();
  for (let m = 0; m < 1 << keys.length; m += 1) all.add(m);
  const text = expr
    .trim()
    .replace(/[&]/g, "∩")
    .replace(/[|]/g, "∪")
    .replace(/[’′]/g, "'")
    .replace(/[\\−-]/g, "−");
  const lower = text.toLowerCase();
  if (["outside", "neither", "none", "neither of them", "none of them"].includes(lower)) return new Set([0]);
  if (lower === "both" && keys.length === 2) return new Set([3]);
  // 'A only', 'A∩B only': in exactly those sets.
  const only = /^(.*?)\s+only$/i.exec(text);
  if (only) {
    const named = only[1]!.split("∩").map((k) => k.trim());
    let mask = 0;
    for (const k of named) {
      const i = keys.indexOf(k);
      if (i < 0) throw new Error(`no set ${k}`);
      mask |= 1 << i;
    }
    return new Set([mask]);
  }
  let at = 0;
  const s = text.replace(/\s+/g, "");
  const peek = () => s[at];
  const ofKey = (): Set<Mask> => {
    const match = /^[A-Za-z][A-Za-z0-9]{0,2}/.exec(s.slice(at));
    if (!match) throw new Error(`unexpected ${s.slice(at) || "end"}`);
    // The longest key that matches (keys may be one to three letters).
    const word = match[0];
    let key = "";
    for (let len = word.length; len > 0; len -= 1) {
      const candidate = word.slice(0, len);
      if (candidate === "U" || keys.includes(candidate)) {
        key = candidate;
        break;
      }
    }
    if (!key) throw new Error(`no set ${word}`);
    at += key.length;
    if (key === "U" && !keys.includes("U")) return new Set(all);
    const i = keys.indexOf(key);
    return new Set([...all].filter((m) => m & (1 << i)));
  };
  const atom = (): Set<Mask> => {
    let out: Set<Mask>;
    if (peek() === "(") {
      at += 1;
      out = union();
      if (peek() !== ")") throw new Error("missing )");
      at += 1;
    } else out = ofKey();
    while (peek() === "'") {
      at += 1;
      out = new Set([...all].filter((m) => !out.has(m)));
    }
    return out;
  };
  const inter = (): Set<Mask> => {
    let out = atom();
    while (peek() === "∩") {
      at += 1;
      const next = atom();
      out = new Set([...out].filter((m) => next.has(m)));
    }
    return out;
  };
  function union(): Set<Mask> {
    let out = inter();
    while (peek() === "∪" || peek() === "−") {
      const op = s[at++];
      const next = inter();
      out = op === "∪" ? new Set([...out, ...next]) : new Set([...out].filter((m) => !next.has(m)));
    }
    return out;
  }
  const result = union();
  if (at !== s.length) throw new Error(`unexpected ${s.slice(at)}`);
  return result;
}

/** A region's canonical name, from its membership. */
export function regionName(mask: Mask, keys: string[]): string {
  if (mask === 0) return "outside";
  const inside = keys.filter((_, i) => mask & (1 << i));
  if (inside.length === keys.length) return inside.join("∩");
  return `${inside.join("∩")} only`;
}

class Venn implements Kind {
  circles: Circle[];
  frame: UBox;
  keys: string[];
  /** Where each region's count is written. */
  spots = new Map<Mask, Pt>();
  /** The count written in each region, and its words on the drawing. */
  counts = new Map<Mask, { text: string; el: SVGTextElement }>();
  universal: { name: string; total?: number | string | null } | null;
  shaded = 0;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const sets = (spec.sets ?? []).slice(0, 3);
    const { centres, r, frame } = layout(sets.length);
    this.frame = frame;
    this.keys = sets.map((set) => set.key);
    this.universal = spec.universal ?? null;
    this.circles = sets.map((set, i) => {
      const [cx, cy] = centres[i]!;
      const clip = e.id("in");
      const mask = e.id("out");
      const cp = el("clipPath", { id: clip }, e.defs);
      el("circle", { cx, cy, r }, cp);
      const mk = el(
        "mask",
        { id: mask, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: e.view[0], height: e.view[1] },
        e.defs,
      );
      el("rect", { x: 0, y: 0, width: e.view[0], height: e.view[1], fill: "#fff" }, mk);
      el("circle", { cx, cy, r, fill: "#000" }, mk);
      return { key: set.key, set, cx, cy, r, colour: set.colour ?? (["blue", "pink", "yellow"] as DiagramColour[])[i] ?? CYCLE[i]!, drawn: false, clip, mask };
    });
    this.findSpots();
    for (let m = 0; m < 1 << this.circles.length; m += 1) {
      if (m === 0 && !this.universal) continue;
      this.e.parts.set(regionName(m, this.keys), this.regionPart(new Set([m]), regionName(m, this.keys)));
    }
  }

  private membership(p: Pt): Mask {
    let m = 0;
    this.circles.forEach((c, i) => {
      if (Math.hypot(p[0] - c.cx, p[1] - c.cy) <= c.r) m |= 1 << i;
    });
    return m;
  }

  /** The roomiest point of each region: furthest from every edge round it. */
  private findSpots() {
    const best = new Map<Mask, { p: Pt; score: number }>();
    const f = this.frame;
    for (let x = f.x0 + 6; x <= f.x1 - 6; x += 3)
      for (let y = f.y0 + 6; y <= f.y1 - 6; y += 3) {
        const p: Pt = [x, y];
        const m = this.membership(p);
        let room = Math.min(x - f.x0, f.x1 - x, y - f.y0, f.y1 - y);
        for (const c of this.circles) room = Math.min(room, Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r));
        // Outside: low down and to the right, where it reads as "the rest".
        const score = m === 0 ? Math.min(room, 26) + (x + y) * 0.02 : room;
        const was = best.get(m);
        if (!was || score > was.score) best.set(m, { p, score });
      }
    for (const [m, { p }] of best) this.spots.set(m, p);
  }

  /** What a region is, in words: "Maths only", "Maths and Physics", "neither". */
  private words(mask: Mask): string {
    const names = this.circles.map((c) => c.set.name);
    if (mask === 0) return this.circles.length === 2 ? "in neither" : "in none of them";
    const inside = names.filter((_, i) => mask & (1 << i));
    if (inside.length === 1) return `${inside[0]} only`;
    if (inside.length === names.length) return names.length === 2 ? `in both ${inside.join(" and ")}` : "in all three";
    return `${inside.join(" and ")} only`;
  }

  /** The region (or regions) as a drawing: the box clipped to its sets, masked by the rest. */
  private regionShape(masks: Set<Mask>, parent: SVGGElement, fill: string, opacity = 1): SVGGElement {
    const group = el("g", {}, parent);
    for (const m of masks) {
      if (m === 0 && !this.universal) continue;
      let host: SVGGElement = group;
      // The tightest box it can be in: the box of the circles it is inside.
      let b: UBox = { ...this.frame };
      this.circles.forEach((c, i) => {
        if (m & (1 << i)) {
          host = el("g", { "clip-path": `url(#${c.clip})` }, host);
          b = {
            x0: Math.max(b.x0, c.cx - c.r),
            y0: Math.max(b.y0, c.cy - c.r),
            x1: Math.min(b.x1, c.cx + c.r),
            y1: Math.min(b.y1, c.cy + c.r),
          };
        } else host = el("g", { mask: `url(#${c.mask})` }, host);
      });
      el("rect", { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill, "fill-opacity": opacity }, host);
    }
    return group;
  }

  private regionPart(masks: Set<Mask>, name: string): Part {
    const list = [...masks];
    const first = list[0] ?? 0;
    const anchor = list.length === 1 ? this.spots.get(first) ?? [180, 140] : this.centreOf(list);
    const box = list.length === 1 ? { x0: anchor[0] - 14, y0: anchor[1] - 14, x1: anchor[0] + 14, y1: anchor[1] + 14 } : this.boxOf(list);
    const count = list.length === 1 ? this.counts.get(first)?.text : null;
    return {
      name,
      info: list.length === 1 ? `${this.words(first)}${count ? `: ${count}` : ""}` : name,
      anchor,
      box,
      glow: (layer, colour, mode) => [this.regionShape(masks, layer, colour, mode === "hover" ? 0.4 : 0.36)],
    };
  }

  private centreOf(list: Mask[]): Pt {
    const points = list.map((m) => this.spots.get(m)).filter((p): p is Pt => Boolean(p));
    if (!points.length) return [180, 140];
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }

  private boxOf(list: Mask[]): UBox {
    const points = list.map((m) => this.spots.get(m)).filter((p): p is Pt => Boolean(p));
    return {
      x0: Math.min(...points.map((p) => p[0])) - 14,
      y0: Math.min(...points.map((p) => p[1])) - 14,
      x1: Math.max(...points.map((p) => p[0])) + 14,
      y1: Math.max(...points.map((p) => p[1])) + 14,
    };
  }

  /** A region by any name: canonical, an alias, or a set expression. */
  partFor(name: string): Part | null {
    let masks: Set<Mask>;
    try {
      masks = regionsOf(name, this.keys);
    } catch {
      return null;
    }
    if (!this.universal) masks.delete(0);
    if (!masks.size) return null;
    if (masks.size === 1) {
      const m = [...masks][0]!;
      return this.e.parts.get(regionName(m, this.keys)) ?? null;
    }
    return this.regionPart(masks, name);
  }

  private drawSet(c: Circle): SVGGraphicsElement[][] {
    const colours = PALETTE[c.colour];
    const tint = el("circle", { cx: c.cx, cy: c.cy, r: c.r, fill: colours.fill, "fill-opacity": 0.13 }, this.e.paint);
    const ring = this.e.stroke(this.e.ink, loop(c.cx, c.cy, c.r, c.r, this.e.rnd(`set${c.key}`), 0.04), {
      colour: colours.stroke,
      width: 2.8,
    });
    // Its name over it (the third set's under it), kept inside the box.
    const i = this.circles.indexOf(c);
    const nx = c.cx;
    const ny = i === 2 ? c.cy + c.r + 13 : c.cy - c.r - 13;
    const total = c.set.total;
    const words = `${c.set.name}${total !== null && total !== undefined && total !== "" ? ` (${total})` : ""}`;
    const name = this.e.text(this.e.words, nx, ny, words, { size: 17, colour: colours.stroke });
    const room = this.e.measure(name);
    const half = (room.x1 - room.x0) / 2;
    name.setAttribute("x", String(Math.max(this.frame.x0 + 6 + half, Math.min(this.frame.x1 - 6 - half, nx))));
    this.e.keep(name);
    c.drawn = true;
    this.e.parts.set(c.key, {
      name: c.key,
      info: `${c.set.name}${total !== null && total !== undefined && total !== "" ? `: ${total}` : ""}`,
      anchor: [c.cx + (i === 0 ? -c.r * 0.7 : c.r * 0.7), c.cy - c.r * 0.7],
      box: { x0: c.cx - c.r, y0: c.cy - c.r, x1: c.cx + c.r, y1: c.cy + c.r },
      glow: (layer, colour, mode) => [
        el("circle", { cx: c.cx, cy: c.cy, r: c.r, fill: colour, "fill-opacity": mode === "hover" ? 0.35 : 0.45 }, layer),
      ],
      quiet: true,
    });
    return [[ring, tint], [name]];
  }

  /** Write `words` in a region (replacing what was there). */
  private writeCount(mask: Mask, words: string, colour?: DiagramColour): SVGTextElement | null {
    const spot = this.spots.get(mask);
    if (!spot) return null;
    const was = this.counts.get(mask);
    if (was) {
      was.el.remove();
      this.counts.delete(mask);
    }
    const unknown = /^[?x-z]$/i.test(words.trim());
    const fill = colour ? PALETTE[colour].stroke : unknown ? PALETTE.orange.stroke : INK;
    const text = this.e.keep(this.e.text(this.e.words, spot[0], spot[1], words, { size: 24, colour: fill, cls: "ld-count" }));
    this.counts.set(mask, { text: words, el: text });
    const name = regionName(mask, this.keys);
    const part = this.e.parts.get(name);
    if (part) part.info = `${this.words(mask)}: ${words}`;
    return text;
  }

  drawIn(): Build {
    const groups: SVGGraphicsElement[][] = [];
    if (this.universal) {
      const f = this.frame;
      const frame = this.e.stroke(this.e.ink, handBox(f.x0, f.y0, f.x1, f.y1, this.e.rnd("U"), 3), { width: 2.4 });
      const total = this.universal.total;
      const words = `${this.universal.name}${total !== null && total !== undefined && total !== "" ? ` (${total})` : ""}`;
      const name = this.e.keep(this.e.text(this.e.words, f.x0 + 4, f.y0 - 13, words, { size: 17, anchor: "start" }));
      groups.push([frame], [name]);
      this.e.parts.set("U", {
        name: "U",
        info: `${this.universal.name}${total !== null && total !== undefined && total !== "" ? `: ${total}` : ""}`,
        anchor: [f.x1 - 10, f.y0 + 10],
        box: { ...f },
        glow: (layer, colour, mode) => [
          el("rect", { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0, fill: colour, "fill-opacity": mode === "hover" ? 0.3 : 0.4 }, layer),
        ],
        quiet: true,
      });
    }
    for (const c of this.circles) if (!c.set.later) groups.push(...this.drawSet(c));
    const written: SVGTextElement[] = [];
    for (const [where, value] of Object.entries(this.spec.counts ?? {})) {
      const part = this.partFor(where);
      const mask = part ? this.maskOf(part.name) : null;
      if (mask === null) continue;
      const text = this.writeCount(mask, String(value));
      if (text) written.push(text);
    }
    if (written.length) groups.push(written);
    return { items: this.e.plan(...groups), totalMs: 4600 };
  }

  private maskOf(name: string): Mask | null {
    try {
      const masks = regionsOf(name, this.keys);
      return masks.size === 1 ? [...masks][0]! : null;
    } catch {
      return null;
    }
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "draw-set": {
        const c = this.circles.find((one) => one.key === op.part) ?? this.circles.find((one) => !one.drawn);
        if (!c || c.drawn) return { items: [] };
        return { items: this.e.plan(...this.drawSet(c)), sfx: "pop" };
      }
      case "fill": {
        const mask = op.part ? this.maskOf(op.part) : null;
        if (mask === null || op.text == null) return { items: [] };
        const text = this.writeCount(mask, String(op.text), op.answer ? "green" : op.colour ?? undefined);
        if (!text) return { items: [] };
        return { items: this.e.plan([text]), sfx: op.answer ? "ding" : "tick", after: this.e.popAfter([text]) };
      }
      case "shade": {
        let masks: Set<Mask>;
        try {
          masks = regionsOf(op.part ?? "", this.keys);
        } catch {
          return { items: [] };
        }
        if (!this.universal) masks.delete(0);
        const colour: DiagramColour = op.answer ? "green" : op.colour ?? "purple";
        const shape = this.regionShape(masks, this.e.paint, this.e.hatch(colour));
        this.shaded += 1;
        const rects = Array.from(shape.querySelectorAll("rect"));
        const groups: SVGGraphicsElement[][] = rects.map((rect) => [rect]);
        let after: (() => void) | undefined;
        if (op.text) {
          // Under the box, in the shading's colour: a key to it (the view keeps room for it).
          const f = this.frame;
          const y = f.y1 + 10 + (this.shaded - 1) * 22;
          const swatch = el("rect", { x: f.x0 + 4, y, width: 18, height: 13, rx: 2, fill: this.e.hatch(colour), stroke: PALETTE[colour].stroke, "stroke-width": 1.2 }, this.e.marks);
          const text = this.e.keep(this.e.text(this.e.marks, f.x0 + 30, y + 7, op.text, { size: 16, colour: PALETTE[colour].stroke, anchor: "start" }));
          groups.push([swatch], [text]);
          after = this.e.popAfter([text]);
        }
        return { items: this.e.plan(...groups), sfx: op.answer ? "ding" : "scribble", after };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    const f = this.frame;
    const m = this.membership(p);
    if (m === 0) {
      if (!this.universal) return null;
      if (p[0] < f.x0 || p[0] > f.x1 || p[1] < f.y0 || p[1] > f.y1) return null;
    }
    // Only regions of sets already drawn.
    if (this.circles.some((c, i) => m & (1 << i) && !c.drawn)) return null;
    return regionName(m, this.keys);
  }

  describe(): string {
    const names = this.circles.map((c) => c.set.name).join(" and ");
    const counts = [...this.counts.entries()].map(([m, c]) => `${this.words(m)}: ${c.text}`).join("; ");
    return `A Venn diagram of ${names}${this.universal ? ` in ${this.universal.name}` : ""}${counts ? `. ${counts}` : ""}`;
  }
}

export const venn: KindModule = {
  view: (spec, plan = []) => {
    const [w, h] = (spec.sets ?? []).length === 3 ? VIEW3 : VIEW2;
    // Room under the box for each shading's key.
    const keys = Math.min(2, plan.filter((op) => op.op === "shade" && op.text).length);
    return [w, h + keys * 22];
  },
  create: (engine, spec) => new Venn(engine, spec),
};
