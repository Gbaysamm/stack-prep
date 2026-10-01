/**
 * A PROBABILITY TREE (section 8, `kind: tree`): branches from left to right, each with its
 * outcome written at its end and its probability over it, up to three levels deep.
 *
 *   branches:
 *     - {label: Red, p: '3/5', then: [{label: Red, p: '2/4'}, {label: Blue, p: '2/4'}]}
 *     - {label: Blue, p: '2/5', then: [...]}
 *
 * `p` is a fraction ('3/5'), a decimal or a whole number; `levels` (optional) names each level
 * over it ('1st ball', '2nd ball'); `root` (optional) is written at the start.
 *
 * Arriving, the pen draws the branches not marked `later`, level by level (a later branch keeps
 * all of its own branches back with it). Parts: 'branch:Red' (on the first level),
 * 'branch:Red/Blue' (a route, by its outcomes, joined with /). Actions: branch (one later branch
 * drawn, with its probability), path (a route lit from the start to its end, and the
 * probabilities along it multiplied and written under the tree: 3/5 × 2/4 = 3/10).
 */

import type { DiagramBranch, DiagramColour, LessonDiagram, LessonDiagramOp } from "../../api.js";
import type { Pt } from "../../ink.js";
import {
  INK,
  PALETTE,
  SOFT,
  boxOfPoints,
  el,
  lineGlow,
  type Build,
  type DiagramEngine,
  type Kind,
  type KindModule,
} from "../engine.js";
import { line, poly } from "../rough.js";

interface Node {
  path: string;
  label: string;
  p: string | null;
  depth: number;
  parent: Node | null;
  children: Node[];
  later: boolean;
  /** Where its branch ends (the outcome's point) and where its own branches start. */
  end: Pt;
  out: Pt;
  start: Pt;
  drawn: boolean;
  d: string;
}

const WIDTH = 360;
const LABEL_W = 50;
const ROW = 34;

function depthOf(branches: DiagramBranch[] | null | undefined): number {
  if (!branches?.length) return 0;
  return 1 + Math.max(...branches.map((b) => depthOf(b.then)));
}

function leavesOf(branches: DiagramBranch[] | null | undefined): number {
  if (!branches?.length) return 1;
  return branches.reduce((sum, b) => sum + leavesOf(b.then), 0);
}

function view(spec: LessonDiagram, plan: LessonDiagramOp[] = []): [number, number] {
  const rows = leavesOf(spec.branches);
  const paths = Math.min(3, plan.filter((op) => op.op === "path").length);
  const top = spec.levels?.length ? 30 : 12;
  return [WIDTH, Math.round(top + rows * ROW + 10 + paths * 26)];
}

/** A probability as a fraction [top, bottom], or a plain number. */
function parseP(p: string): [number, number] | number | null {
  const frac = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(p);
  if (frac) return [Number(frac[1]), Number(frac[2])];
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a) || 1;
}

/** The probabilities along a route multiplied: '3/5 × 2/4 = 3/10'. */
export function product(ps: string[]): string {
  const parsed = ps.map(parseP);
  if (parsed.some((p) => p === null)) return ps.join(" × ");
  if (parsed.every((p) => Array.isArray(p))) {
    let top = 1;
    let bottom = 1;
    for (const p of parsed as [number, number][]) {
      top *= p[0];
      bottom *= p[1];
    }
    const g = gcd(top, bottom);
    return `${ps.join(" × ")} = ${top / g}/${bottom / g}`;
  }
  const value = (parsed as ([number, number] | number)[]).reduce<number>((acc, p) => acc * (Array.isArray(p) ? p[0] / p[1] : p), 1);
  return `${ps.join(" × ")} = ${Math.round(value * 10000) / 10000}`;
}

class Tree implements Kind {
  roots: Node[] = [];
  all: Node[] = [];
  rootAt: Pt;
  paths = 0;
  bottom: number;

  constructor(
    private e: DiagramEngine,
    private spec: LessonDiagram,
  ) {
    const depth = Math.max(1, depthOf(spec.branches));
    const top = spec.levels?.length ? 30 : 12;
    const rootW = spec.root ? 46 : 14;
    const branchLen = Math.max(44, (WIDTH - rootW - 10) / depth - LABEL_W - 6);
    let row = 0;
    const make = (b: DiagramBranch, parent: Node | null, depth: number, prefix: string, later: boolean): Node => {
      const node: Node = {
        path: prefix ? `${prefix}/${b.label}` : b.label,
        label: b.label,
        p: b.p === null || b.p === undefined ? null : String(b.p),
        depth,
        parent,
        children: [],
        later: later || Boolean(b.later),
        end: [0, 0],
        out: [0, 0],
        start: [0, 0],
        drawn: false,
        d: "",
      };
      node.children = (b.then ?? []).map((child) => make(child, node, depth + 1, node.path, node.later));
      const x = rootW + depth * (branchLen + LABEL_W + 6) + branchLen;
      let y: number;
      if (node.children.length) y = node.children.reduce((s, c) => s + c.end[1], 0) / node.children.length;
      else {
        y = top + row * ROW + ROW / 2;
        row += 1;
      }
      node.end = [x, y];
      node.out = [x + LABEL_W, y];
      this.all.push(node);
      return node;
    };
    this.roots = (spec.branches ?? []).map((b) => make(b, null, 0, "", false));
    const ys = this.roots.map((n) => n.end[1]);
    this.rootAt = [rootW - 6, ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : 60];
    for (const node of this.all) node.start = node.parent ? [node.parent.out[0] - 4, node.parent.end[1]] : this.rootAt;
    this.all.sort((a, b) => a.depth - b.depth || a.end[1] - b.end[1]);
    this.bottom = top + row * ROW + 4;
  }

  private find(part: string | null | undefined): Node | null {
    if (!part) return null;
    const m = /^(?:branch|path):(.+)$/.exec(part.trim());
    const route = (m ? m[1]! : part).split("/").map((s) => s.trim().toLowerCase()).join("/");
    return this.all.find((n) => n.path.toLowerCase() === route) ?? null;
  }

  partFor(name: string) {
    const node = this.find(name);
    return node ? this.e.parts.get(`branch:${node.path}`) ?? null : null;
  }

  private drawBranch(node: Node): SVGGraphicsElement[][] {
    const rnd = this.e.rnd(`branch${node.path}`);
    const d = line(node.start, node.end, rnd, 0);
    node.d = d;
    const stroke = this.e.stroke(this.e.ink, d, { width: 2.4 });
    const groups: SVGGraphicsElement[][] = [[stroke]];
    const words: SVGGraphicsElement[] = [];
    if (node.p) {
      // Over the middle of the branch, on its outer side.
      const mx = (node.start[0] + node.end[0]) / 2;
      const my = (node.start[1] + node.end[1]) / 2;
      const up = node.end[1] < node.start[1] - 1;
      const level = Math.abs(node.end[1] - node.start[1]) < 2;
      const y = level ? my - 11 : up ? my - 12 : my + 15;
      const x = level ? mx : mx - 6;
      words.push(this.e.keep(this.e.text(this.e.words, x, y, node.p, { size: 15, colour: PALETTE.blue.stroke })));
    }
    words.push(this.e.keep(this.e.text(this.e.words, node.end[0] + 6, node.end[1], node.label, { size: 16, anchor: "start" })));
    groups.push(words);
    node.drawn = true;
    const name = `branch:${node.path}`;
    const route = this.route(node);
    this.e.parts.set(name, {
      name,
      info: node.depth === 0 ? `P(${node.label}) = ${node.p ?? "?"}` : `${route.map((n) => n.label).join(", then ")}: ${node.p ?? "?"} on this branch`,
      anchor: [(node.start[0] + node.end[0]) / 2 + 10, (node.start[1] + node.end[1]) / 2],
      box: boxOfPoints([node.start, node.end], 6),
      thin: true,
      glow: lineGlow(d, 10),
    });
    return groups;
  }

  /** The nodes from the first branch to this one. */
  private route(node: Node): Node[] {
    const out: Node[] = [];
    for (let at: Node | null = node; at; at = at.parent) out.unshift(at);
    return out;
  }

  drawIn(): Build {
    const groups: SVGGraphicsElement[][] = [];
    const start = this.e.dot(this.e.ink, this.rootAt, { r: 3.6 });
    groups.push([start]);
    if (this.spec.root) groups.push([this.e.keep(this.e.text(this.e.words, this.rootAt[0] - 8, this.rootAt[1], this.spec.root, { size: 15, anchor: "end" }))]);
    (this.spec.levels ?? []).forEach((title, depth) => {
      const nodes = this.all.filter((n) => n.depth === depth);
      if (!nodes.length) return;
      const x = (nodes[0]!.start[0] + nodes[0]!.end[0]) / 2;
      groups.push([this.e.keep(this.e.text(this.e.words, x, 14, title, { size: 14, colour: SOFT, weight: 600 }))]);
    });
    for (const node of this.all) if (!node.later) groups.push(...this.drawBranch(node));
    return { items: this.e.plan(...groups), totalMs: 5000 };
  }

  op(op: LessonDiagramOp): Build | null {
    switch (op.op) {
      case "branch": {
        const node = this.find(op.part) ?? this.all.find((n) => !n.drawn && (!n.parent || n.parent.drawn));
        if (!node || node.drawn) return { items: [] };
        return { items: this.e.plan(...this.drawBranch(node)), sfx: "pop" };
      }
      case "path": {
        const node = this.find(op.part);
        if (!node) return { items: [] };
        const colour: DiagramColour = op.answer ? "green" : op.colour ?? "green";
        const c = PALETTE[colour];
        const route = this.route(node);
        const groups: SVGGraphicsElement[][] = route.map((n) => {
          const d = n.d || line(n.start, n.end, this.e.rnd(`branch${n.path}`), 0);
          return [el("path", { d, fill: "none", stroke: c.fill, "stroke-width": 9, "stroke-opacity": 0.55, "stroke-linecap": "round" }, this.e.glowLayer)];
        });
        const ps = route.map((n) => n.p ?? "?");
        const words = op.text ?? `${route.map((n) => n.label).join(", then ")}: ${product(ps)}`;
        this.paths += 1;
        const y = this.bottom + 10 + (this.paths - 1) * 26;
        const text = this.e.keep(this.e.text(this.e.marks, 14, y, words, { size: 17, colour: c.stroke === PALETTE.green.stroke ? c.stroke : INK, anchor: "start" }));
        groups.push([text]);
        // The leaf it ends at gets a ring, so the route's end is plain.
        const ring = el("circle", { cx: node.end[0], cy: node.end[1], r: 5, fill: c.stroke }, this.e.marks);
        groups.splice(route.length, 0, [ring]);
        const name = `path:${node.path}`;
        this.e.parts.set(name, {
          name,
          info: words,
          anchor: [14 + 4, y - 8],
          box: { x0: 10, y0: y - 12, x1: WIDTH - 10, y1: y + 10 },
          glow: lineGlow(poly(route.flatMap((n) => [n.start, n.end])), 10),
        });
        return { items: this.e.plan(...groups), sfx: op.answer ? "ding" : "pop", after: this.e.popAfter([text]) };
      }
      default:
        return null;
    }
  }

  hit(p: Pt): string | null {
    let best: { name: string; d: number } | null = null;
    for (const node of this.all) {
      if (!node.drawn) continue;
      const d = Math.min(segment(p, node.start, node.end), Math.hypot(p[0] - node.end[0] - 20, p[1] - node.end[1]) - 6);
      if (d < 9 && (!best || d < best.d)) best = { name: `branch:${node.path}`, d };
    }
    if (best) return best.name;
    for (const part of this.e.parts.values())
      if (part.name.startsWith("path:") && p[1] >= part.box.y0 && p[1] <= part.box.y1) return part.name;
    return null;
  }

  describe(): string {
    return `A probability tree: ${this.all.filter((n) => !n.children.length).map((n) => n.path.replace(/\//g, " then ")).join("; ")}`;
  }
}

function segment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

export const tree: KindModule = {
  view,
  create: (engine, spec) => new Tree(engine, spec),
};
