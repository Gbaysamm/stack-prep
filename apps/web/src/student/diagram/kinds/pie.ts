/**
 * A PIE CHART (section 8, `kind: pie`): sectors from the top, clockwise, each with its label and
 * its value, angle or share written in it (or beside it, where it is thin).
 *
 * Sectors are given by `value` (their angles are their shares of the total, or of `total`) or by
 * `angle` in degrees. `text` on a sector replaces what is written after its label ('?' for the
 * sector being found). Arriving, the pen draws the circle's outline and each sector not marked
 * `later`, one by one: its two edges, its colour, its words.
 *
 * Parts: 'sector:1', 'sector:2'… from the top, clockwise (from 1), or 'sector:<label>'.
 * Actions: draw-sector (one sector, or the next later one), pull-out (it slides out from the
 * centre), angle (the angle at the centre, marked with an arc and written).
 */

import type { DiagramColour, DiagramSector, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  CYCLE,
  INK,
  PALETTE,
  el,
  fmt,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { arcPoints, line, loop, smooth } from "../rough.js";

interface Sector {
  index: number;
  spec: DiagramSector;
  a0: number;
  a1: number;
  degrees: number;
  colour: DiagramColour;
  drawn: boolean;
  group: SVGGElement | null;
  shift: Pt;
  label: SVGTextElement | null;
  value: SVGTextElement | null;
}

const VIEW: [number, number] = [360, 268];
const CX = 180;
const CY = 136;
const R = 104;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;

class Pie implements Kind {
  sectors: Sector[];
  total: number;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const list = spec.sectors ?? [];
    const byAngle = list.every((s) => typeof s.angle === "number");
    const sum = list.reduce((acc, s) => acc + (byAngle ? s.angle ?? 0 : s.value ?? 0), 0) || 1;
    this.total = byAngle ? 360 : sum;
    let at = 0;
    this.sectors = list.map((s, index) => {
      const degrees = byAngle ? s.angle ?? 0 : ((s.value ?? 0) / sum) * 360;
      const sector: Sector = {
        index,
        spec: s,
        a0: at,
        a1: at + degrees,
        degrees,
        colour: s.colour ?? CYCLE[index % CYCLE.length]!,
        drawn: false,
        group: null,
        shift: [0, 0],
        label: null,
        value: null,
      };
      at += degrees;
      return sector;
    });
  }

  private find(part: string | null | undefined): Sector | null {
    if (!part) return null;
    const m = /^sector:(.+)$/.exec(part.trim());
    if (!m) return null;
    const key = m[1]!.trim();
    const n = Number(key);
    if (Number.isInteger(n)) return this.sectors[n - 1] ?? null;
    return this.sectors.find((s) => s.spec.label.toLowerCase() === key.toLowerCase()) ?? null;
  }

  partFor(name: string) {
    const s = this.find(name);
    return s ? this.e.parts.get(`sector:${s.index + 1}`) ?? null : null;
  }

  private outline(s: Sector): string {
    const a = rad(s.a0);
    const b = rad(s.a1);
    const rnd = this.e.rnd(`sector${s.index}`);
    const arc = arcPoints(CX, CY, R, a, b, rnd);
    // Straight edges into a sharp corner at the centre, the rim a smooth curve.
    return `M${CX} ${CY}L${smooth(arc).slice(1)}L${CX} ${CY}Z`;
  }

  private words(s: Sector): string {
    if (s.spec.text) return s.spec.text;
    const show = this.spec.show ?? (typeof s.spec.angle === "number" ? "angle" : "value");
    if (show === "none") return "";
    if (show === "angle") return `${fmt(s.degrees, 1)}°`;
    if (show === "percent") return `${fmt((s.degrees / 360) * 100, 1)}%`;
    return fmt(s.spec.value ?? 0);
  }

  private info(s: Sector): string {
    const parts = [`${fmt(s.degrees, 1)}°`, `${fmt((s.degrees / 360) * 100, 1)}%`];
    if (typeof s.spec.value === "number") parts.unshift(fmt(s.spec.value));
    return `${s.spec.label}: ${s.spec.text && s.spec.text !== "?" ? s.spec.text : parts.join(", ")}`;
  }

  /** The middle of the sector's arc, `k` of the way out. */
  private mid(s: Sector, k: number): Pt {
    const m = rad((s.a0 + s.a1) / 2);
    return [CX + s.shift[0] + Math.cos(m) * R * k, CY + s.shift[1] + Math.sin(m) * R * k];
  }

  private drawSector(s: Sector): SVGGraphicsElement[][] {
    const c = PALETTE[s.colour];
    const group = el("g", { class: "ld-sector" }, this.e.paint);
    s.group = group;
    const d = this.outline(s);
    const fill = el("path", { d, fill: c.fill, "fill-opacity": 0.5, stroke: "none" }, group);
    const edge = el(
      "path",
      { d, fill: "none", stroke: INK, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" },
      group,
    );
    s.drawn = true;
    // Its words: inside where it is wide enough, else outside with a leader.
    const wide = s.degrees >= 34;
    const value = this.words(s);
    const texts: SVGGraphicsElement[] = [];
    if (wide) {
      const [x, y] = this.mid(s, 0.6);
      const label = this.e.text(group, x, value ? y - 9 : y, s.spec.label, { size: 16 });
      s.label = label;
      texts.push(label);
      if (value) {
        s.value = this.e.text(group, x, y + 11, value, { size: value === "?" ? 20 : 15, colour: value === "?" ? PALETTE.orange.stroke : INK, weight: 700 });
        texts.push(s.value);
      }
    } else {
      const [ax, ay] = this.mid(s, 0.92);
      const [bx, by] = this.mid(s, 1.2);
      const right = bx >= CX;
      const leader = el(
        "path",
        { d: line([ax, ay], [bx, by], this.e.rnd(`lead${s.index}`)), fill: "none", stroke: INK, "stroke-width": 1.5 },
        group,
      );
      texts.push(leader);
      const label = this.e.text(group, bx + (right ? 4 : -4), by, `${s.spec.label}${value ? ` ${value}` : ""}`, {
        size: 15,
        anchor: right ? "start" : "end",
      });
      s.label = label;
      texts.push(label);
    }
    for (const t of texts) if (t instanceof SVGTextElement) this.e.keep(t);
    const name = `sector:${s.index + 1}`;
    this.e.parts.set(name, {
      name,
      info: this.info(s),
      anchor: this.mid(s, 0.95),
      box: { x0: this.mid(s, 0.6)[0] - 16, y0: this.mid(s, 0.6)[1] - 16, x1: this.mid(s, 0.6)[0] + 16, y1: this.mid(s, 0.6)[1] + 16 },
      glow: (layer, colour, mode) => [
        el(
          "path",
          {
            d,
            fill: colour,
            "fill-opacity": mode === "hover" ? 0.45 : 0.55,
            transform: `translate(${s.shift[0]} ${s.shift[1]})`,
          },
          layer,
        ),
      ],
    });
    return [[edge, fill], texts];
  }

  drawIn(): Build {
    // The whole, faint: the sectors' own edges are the ink, and a slice pulled out leaves its
    // place in the whole behind it.
    const ring = this.e.stroke(this.e.paint, loop(CX, CY, R, R, this.e.rnd("rim"), 0.03), { width: 1.6, colour: "#c9c3dd", dash: "5 5" });
    const groups: SVGGraphicsElement[][] = [[ring]];
    for (const s of this.sectors) if (!s.spec.later) groups.push(...this.drawSector(s));
    return { items: this.e.plan(...groups), totalMs: 4800 };
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "draw-sector": {
        const s = this.find(op.part) ?? this.sectors.find((one) => !one.drawn);
        if (!s || s.drawn) return { items: [] };
        return { items: this.e.plan(...this.drawSector(s)), sfx: "pop" };
      }
      case "pull-out": {
        const s = this.find(op.part);
        if (!s?.group) return { items: [] };
        const m = rad((s.a0 + s.a1) / 2);
        const to: Pt = [Math.cos(m) * 16, Math.sin(m) * 16];
        const from = s.shift;
        const group = s.group;
        const part = this.e.parts.get(`sector:${s.index + 1}`);
        const move = (p: number) => {
          const q = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
          s.shift = [from[0] + (to[0] - from[0]) * q, from[1] + (to[1] - from[1]) * q];
          group.setAttribute("transform", `translate(${s.shift[0].toFixed(2)} ${s.shift[1].toFixed(2)})`);
        };
        const item = this.e.motion(
          520,
          move,
          () => this.mid(s, 1.0),
          () => {
            if (part) part.anchor = this.mid(s, 0.95);
          },
        );
        return { items: [item], sfx: "whoosh" };
      }
      case "angle": {
        const s = this.find(op.part);
        if (!s) return { items: [] };
        const colour: DiagramColour = op.answer ? "green" : op.colour ?? "purple";
        const c = PALETTE[colour];
        const r = 24;
        const cx = CX + s.shift[0];
        const cy = CY + s.shift[1];
        const arc = this.e.stroke(this.e.marks, smooth(arcPoints(cx, cy, r, rad(s.a0), rad(s.a1))), { colour: c.stroke, width: 2.4 });
        const words = op.text ?? `${fmt(s.degrees, 1)}°`;
        let text: SVGTextElement;
        let pointer: SVGPathElement | null = null;
        if (s.value && s.group) {
          // Written where the "?" (or the value) was: the slice now says what it is.
          const x = Number(s.value.getAttribute("x"));
          const y = Number(s.value.getAttribute("y")) - 20 * 0.34;
          s.value.remove();
          text = this.e.text(s.group, x, y, words, { size: 21, colour: c.stroke });
          s.value = text;
        } else {
          const m = rad((s.a0 + s.a1) / 2);
          const n = this.e.note([cx + Math.cos(m) * r, cy + Math.sin(m) * r], words, c.stroke, 18);
          text = n.text;
          pointer = n.pointer;
        }
        // The sector's own value, where it was '?', is now known.
        const part = this.e.parts.get(`sector:${s.index + 1}`);
        if (part) part.info = `${s.spec.label}: ${words}`;
        return {
          items: this.e.plan([arc], [pointer, text].filter(Boolean) as SVGGraphicsElement[]),
          sfx: op.answer ? "ding" : "pop",
          after: this.e.popAfter([text]),
        };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    for (const s of this.sectors) {
      if (!s.drawn) continue;
      const x = p[0] - CX - s.shift[0];
      const y = p[1] - CY - s.shift[1];
      if (Math.hypot(x, y) > R + 2) continue;
      let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      if (deg >= s.a0 && deg < s.a1) return `sector:${s.index + 1}`;
    }
    return null;
  }

  describe(): string {
    return `A pie chart: ${this.sectors.map((s) => this.info(s)).join("; ")}`;
  }
}

export const pie: KindModule = {
  view: () => VIEW,
  create: (engine, spec) => new Pie(engine, spec),
};
