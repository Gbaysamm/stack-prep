/**
 * A LIVE DIAGRAM ON THE BOARD (docs/plans/doodles-v2-contract.md section 8): a graph, a Venn
 * diagram, a chart, a number line, a probability tree, a table or an ogive, described in the
 * lesson as data and drawn by the board's pen (diagram/engine.ts and diagram/kinds/).
 *
 * As a doodle is (LiveDoodle.tsx): it is drawn in, in teaching order, when its moment brings it;
 * then each of its moments' `diagram_do` actions, and each board line's link to one of its
 * parts, is a task done by the pen as its moment reaches it, after the moment's line is
 * written and, in the whiteboard style, on its word. A task of a moment already past (or all of
 * it, for a student who asked for less motion, or when the board changes width) is shown done at
 * once. Pausing the lesson pauses the pen; the voice's speed speeds it.
 *
 * And the student can explore it, in either style:
 * - hovering or tapping a part (a region, a sector, a bar, a point, a branch, a cell) lights it
 *   and says what it is and its value; on a graph or an ogive, the nearest point of the curve is
 *   read off with its coordinates;
 * - with the keyboard: the diagram takes focus, the arrow keys go from part to part, Escape lets
 *   go, and what is lit is read out;
 * - the replay button draws it all again, in teaching order, as the lesson did.
 *
 * The whiteboard style adds the shimmer (whiteboard.css, through the stage's `data-boil`) and the
 * sound of each action (pop, tick, whoosh, ding).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";

import type { LessonDiagram, LessonDiagramOp } from "./api.js";
import { DoodlePen, captionItem } from "./Doodle.js";
import { DiagramEngine, type Build, type Part } from "./diagram/engine.js";
import { KINDS } from "./diagram/kinds/index.js";
import { runDrawing, workingPenBusy } from "./drawIn.js";
import { stillMotion, type Pt } from "./ink.js";
import { playSfx } from "./sfx.js";
import "./diagram/diagram.css";

/** One thing the pen does to the diagram: an action of the lesson's, or a board line's link. */
export interface DiagramTask {
  /** Unique within the diagram: which moment, and which of its actions or links. */
  key: string;
  op?: LessonDiagramOp;
  link?: { key: string; number: number; part: string | null; kind: string };
  /** Its moment is being said now, so it is played; otherwise it is shown done. */
  live: boolean;
}

/** Diagrams drawn in already this visit, and tasks already played: not played again. */
const drawnOnce = new Set<string>();
const playedOnce = new Set<string>();

const PAIR_COLOURS = 5;
/** The longest an action takes the pen, at the lesson's normal speed. */
const ACTION_MS = 1800;
const HOVER = "#fde047";

interface Dot {
  key: string;
  number: number;
  x: number;
  y: number;
}

interface Tip {
  text: string;
  x: number;
  y: number;
}

/** The diagram's size in its own units, from its description: its width over its height. */
export function diagramAspect(spec: LessonDiagram, plan: LessonDiagramOp[]): number {
  const kind = KINDS[spec.kind];
  if (!kind) return 1.4;
  const [w, h] = kind.view(spec, plan);
  return w / (h || 1);
}

export function LiveDiagram({
  drawKey,
  spec,
  plan,
  width,
  caption,
  tasks,
  paused,
  speed = 1,
  whiteboard,
  lit,
  onLit,
}: {
  /** Names this diagram, so one drawn already this visit is not drawn again. */
  drawKey: string;
  spec: LessonDiagram;
  /** Every action the lesson takes on it, for its room. */
  plan: LessonDiagramOp[];
  /** Its width on the screen, in pixels. */
  width: number;
  caption: string | null;
  tasks: DiagramTask[];
  paused: boolean;
  speed?: number;
  whiteboard: boolean;
  lit: number | null;
  onLit: (number: number | null, tapped?: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLElement>(null);
  const engineRef = useRef<DiagramEngine | null>(null);
  const running = useRef<(() => void) | null>(null);
  const drawn = useRef(false);
  const done = useRef(0);
  const replaying = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const soundRef = useRef(whiteboard);
  soundRef.current = whiteboard;
  const [alive, setAlive] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);
  const [tip, setTip] = useState<Tip | null>(null);
  const [said, setSaid] = useState("");
  const [nonce, setNonce] = useState(0);
  const focusAt = useRef(-1);
  const pinned = useRef(false);
  const kind = KINDS[spec.kind];
  const [vw, vh] = kind ? kind.view(spec, plan) : [360, 260];
  const height = Math.round((width * vh) / vw);

  /** Where each link's dot goes: by its part's top right, in the figure's pixels. */
  const placeDots = useCallback(() => {
    const engine = engineRef.current;
    const root = rootRef.current;
    if (!engine || !root) return;
    const frame = root.getBoundingClientRect();
    const found: Dot[] = [];
    for (const task of tasksRef.current.slice(0, done.current)) {
      if (!task.link) continue;
      const corner = engine.screen(engine.linkPoint(task.link.part));
      if (!corner) continue;
      found.push({
        key: task.link.key,
        number: task.link.number,
        x: Math.min(Math.max(corner[0] - frame.left + 4, 8), frame.width - 8),
        y: Math.min(Math.max(corner[1] - frame.top - 4, 8), frame.height - 8),
      });
    }
    setDots((was) => (JSON.stringify(was) === JSON.stringify(found) ? was : found));
  }, []);

  /** Run the next step: the drawing in, then each task in order, one at a time. */
  const pump = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || running.current) return;
    const start = (make: () => Build, instant: boolean, then: () => void, cap?: number, hurry = 1) => {
      engine.instant = instant;
      let build: Build;
      try {
        build = make();
      } catch {
        build = { items: [] };
      } finally {
        engine.instant = false;
      }
      if (instant || build.items.length === 0) {
        for (const item of build.items) {
          item.show(1);
          item.finish();
        }
        engine.instant = true;
        build.after?.();
        engine.instant = false;
        then();
        return;
      }
      if (soundRef.current && build.sfx) playSfx(build.sfx);
      const natural = build.items.reduce((sum, item) => sum + item.ms, 0);
      // An action is a beat of the lesson, not a drawing lesson: at most about two seconds.
      const most = build.totalMs ?? cap;
      const fitted = most && natural > most ? most : natural;
      const rate = (speedRef.current > 0 ? speedRef.current : 1) * hurry;
      let over = false;
      const stop = runDrawing({
        items: build.items,
        host: rootRef.current ?? artRef.current!,
        pen: penRef.current,
        totalMs: fitted !== natural || rate !== 1 ? fitted / rate : undefined,
        paused: () => pausedRef.current,
        hold: workingPenBusy,
        onDone: () => {
          if (over) return;
          over = true;
          running.current = null;
          build.after?.();
          then();
        },
      });
      if (!over)
        running.current = () => {
          over = true;
          stop();
        };
    };

    if (!drawn.current) {
      const instant = stillMotion() || (drawnOnce.has(drawKey) && !replaying.current);
      const words = !instant && captionRef.current ? captionItem(captionRef.current) : null;
      start(
        () => {
          const build = engine.kind.drawIn();
          if (words) build.items.push(words);
          return { ...build, sfx: build.sfx ?? "pop" };
        },
        instant,
        () => {
          drawn.current = true;
          drawnOnce.add(drawKey);
          setAlive(true);
          pump();
        },
      );
      return;
    }
    const index = done.current;
    const task = tasksRef.current[index];
    if (!task) {
      replaying.current = false;
      placeDots();
      return;
    }
    const seen = `${drawKey}|${task.key}`;
    start(
      () => (task.op ? engine.build(task.op) : engine.link({ part: task.link?.part ?? null, kind: task.link?.kind ?? "highlight" })),
      stillMotion() || ((!task.live || playedOnce.has(seen)) && !replaying.current),
      () => {
        playedOnce.add(seen);
        done.current = index + 1;
        placeDots();
        pump();
      },
      ACTION_MS,
      // Behind the voice (several still waiting): the pen catches up at twice its pace.
      !replaying.current && tasksRef.current.length - index > 2 ? 2 : 1,
    );
  }, [drawKey, placeDots]);

  // The diagram goes in, and everything due is done on it: again from the start whenever its
  // size changes (all that was done before shown done at once), or drawn again on a replay.
  useLayoutEffect(() => {
    const host = artRef.current;
    if (!host || !kind) return;
    running.current?.();
    running.current = null;
    const engine = new DiagramEngine(host, spec, kind, plan);
    engine.sound = (name) => {
      if (soundRef.current) playSfx(name);
    };
    engineRef.current = engine;
    drawn.current = false;
    done.current = 0;
    setDots([]);
    setTip(null);
    engine.mount();
    pump();
    return () => {
      running.current?.();
      running.current = null;
      if (captionRef.current) captionRef.current.style.clipPath = "";
    };
    // `spec` and `plan` follow `drawKey`; the helpers are stable.
  }, [drawKey, width, nonce]);

  // New tasks as the lesson reaches them.
  useEffect(() => {
    pump();
  }, [tasks, pump]);

  /* ------------------------------------------------------------------ exploring it */

  const clear = useCallback(() => {
    engineRef.current?.hover.replaceChildren();
    setTip(null);
  }, []);

  /** Light a part (or a reading) and say what it is. */
  const show = useCallback((part: Part | null, reading?: { at: Pt; text: string } | null) => {
    const engine = engineRef.current;
    const root = rootRef.current;
    if (!engine || !root) return;
    engine.hover.replaceChildren();
    let at: Pt | null = null;
    let text = "";
    if (part) {
      part.glow(engine.hover, HOVER, "hover");
      at = part.anchor;
      text = part.info;
    } else if (reading) {
      engine.dot(engine.hover, reading.at, { r: 6, colour: "#7c3aed", open: true });
      at = reading.at;
      text = reading.text;
    }
    if (!at) {
      setTip(null);
      return;
    }
    const screen = engine.screen(at);
    if (!screen) return;
    const frame = root.getBoundingClientRect();
    setTip({ text, x: screen[0] - frame.left, y: screen[1] - frame.top });
  }, []);

  const explore = useCallback(
    (event: ReactPointerEvent) => {
      const engine = engineRef.current;
      if (!engine || !drawn.current) return;
      const p = engine.units(event.clientX, event.clientY);
      if (!p) return;
      const name = engine.kind.hit(p);
      const part = name ? engine.part(name) : null;
      if (part) return show(part);
      const reading = engine.kind.probe?.(p) ?? null;
      if (reading) return show(null, reading);
      clear();
    },
    [clear, show],
  );

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const tour = engine.tour();
      if (!tour.length) return;
      let next = focusAt.current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (next + 1) % tour.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = next <= 0 ? tour.length - 1 : next - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tour.length - 1;
      else if (event.key === "Escape") {
        focusAt.current = -1;
        clear();
        return;
      } else return;
      event.preventDefault();
      focusAt.current = next;
      const part = tour[next]!;
      show(part);
      setSaid(part.info);
    },
    [clear, show],
  );

  // A pair lit from the working (a hover or a tap on its line or dot): its part lights here too.
  const fromLit = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const task = lit === null ? null : tasksRef.current.slice(0, done.current).find((one) => one.link?.number === lit);
    const part = task?.link ? engine.part(task.link.part) : null;
    if (part) {
      fromLit.current = true;
      show(part);
    } else if (fromLit.current) {
      fromLit.current = false;
      clear();
    }
  }, [clear, lit, show]);

  const replay = useCallback(() => {
    if (stillMotion()) return;
    replaying.current = true;
    pinned.current = false;
    setAlive(false);
    setNonce((n) => n + 1);
  }, []);

  if (!kind) return null;
  const label = `${engineRef.current?.kind.describe() ?? spec.kind}${caption ? ` (${caption})` : ""}`;
  return (
    <figure
      ref={rootRef}
      className={`ld ld-${spec.kind} ${alive ? "alive" : "drawing"}`}
      style={{ "--ld-w": `${width}px`, "--ld-h": `${height}px` } as CSSProperties}
      data-paused={paused ? "" : undefined}
      data-diagram-id={spec.id}
      tabIndex={0}
      role="group"
      aria-roledescription="diagram"
      aria-label={`${label}. Use the arrow keys to go through its parts.`}
      onKeyDown={onKey}
      onBlur={() => {
        focusAt.current = -1;
        clear();
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" && !pinned.current) explore(event);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !pinned.current) clear();
      }}
      onPointerDown={(event) => {
        if ((event.target as Element).closest(".ld-replay, .pb-pairdot")) return;
        pinned.current = event.pointerType !== "mouse";
        explore(event);
      }}
    >
      <div className="ld-art" ref={artRef} />
      {caption ? (
        <figcaption className="ld-caption" ref={captionRef as RefObject<HTMLElement>}>
          {caption}
        </figcaption>
      ) : null}
      <button type="button" className="ld-replay" aria-label="Replay the diagram" title="Draw it again" onClick={replay}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M4 3.8v4.6h4.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {tip ? (
        <div
          className="ld-tip"
          role="status"
          style={{ left: Math.max(60, Math.min(width - 60, tip.x)), top: tip.y } as CSSProperties}
        >
          {tip.text}
        </div>
      ) : null}
      {dots.map((dot) => (
        <span
          key={dot.key}
          className={`pb-pairdot fig dd-dot ld-dot pair-${(dot.number - 1) % PAIR_COLOURS}${lit === dot.number ? " lit" : ""}`}
          data-link-doodle={dot.key}
          style={{ left: dot.x, top: dot.y }}
          onMouseEnter={() => onLit(dot.number)}
          onMouseLeave={() => onLit(null)}
          onClick={(event) => {
            event.stopPropagation();
            onLit(dot.number, true);
          }}
        >
          {dot.number}
        </span>
      ))}
      <span className="ld-said" aria-live="polite">
        {said}
      </span>
      <DoodlePen penRef={penRef} lift="done" />
    </figure>
  );
}
