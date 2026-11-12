/**
 * A DOODLE THAT TAKES PART IN THE LESSON (doodles v2, docs/plans/doodles-v2-contract.md).
 *
 * Drawn in by the pen like any doodle (Doodle.tsx), then acted on by later moments: each of its
 * `doodle_do` actions, and each board line's link to it, is a task, done one after another by
 * the pen (doodleEngine.ts) as its moment reaches it, after that moment's line is written and
 * in time with the voice. A task of a moment already past (or the whole thing, for a student
 * who asked for less motion, or when the board changes width and it is put in again) is shown
 * done at once, exactly as it would have been left. A paused lesson pauses the pen.
 *
 * A board line linked to one of its parts gets the pair's numbered dot here too, beside the
 * part, lit with its line on a hover or a tap (Board.tsx `pairLinks`, DoodleLayer.tsx).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import type { LessonDoodleOp } from "./api.js";
import { DoodlePen, captionItem, drawnOnce } from "./Doodle.js";
import { DoodleEngine, type ArtSource, type Build } from "./doodleEngine.js";
import { runDrawing, workingPenBusy } from "./drawIn.js";
import { stillMotion } from "./ink.js";
import "./doodle.css";

/** One thing the pen does to the doodle. */
export interface DoodleTask {
  /** Unique within the doodle: which moment, and which of its actions or links. */
  key: string;
  op: LessonDoodleOp;
  /** Its moment is being said now, so it is played; otherwise it is shown done. */
  live: boolean;
  /** A board line's link to the doodle: the pair's number. */
  link?: { key: string; number: number };
}

/** Tasks already played this visit (by doodle and task): shown again, they are not replayed. */
const playedOnce = new Set<string>();

/** How many colours the pairs cycle through (board.css, `.pair-N`); as Board.tsx has it. */
const PAIR_COLOURS = 5;

interface Dot {
  key: string;
  number: number;
  x: number;
  y: number;
}

export function LiveDoodle({
  drawKey,
  doodleId,
  source,
  sourceKey,
  width,
  height,
  caption,
  alt,
  tasks,
  paused,
  noteRoom,
  engines,
  stageArt,
  lit,
  onLit,
  pop = false,
}: {
  /** Names this drawing, so one drawn already this visit is not drawn again. */
  drawKey: string;
  /** The id later moments name it by, if it has one. */
  doodleId: string | null;
  source: ArtSource;
  /** Changes when the art does. */
  sourceKey: string;
  /** The art's size on the screen, in pixels. */
  width: number;
  height: number;
  caption: string | null;
  alt: string;
  tasks: DoodleTask[];
  paused: boolean;
  /** Room kept to the right of the art for its notes, in pixels. */
  noteRoom: number;
  /** Every doodle's engine on the board, by id, for an arrow across to another. */
  engines: Map<string, DoodleEngine>;
  stageArt: (name: string) => string | null;
  lit: number | null;
  onLit: (number: number | null, tapped?: boolean) => void;
  /** Its pieces pop into place rather than being drawn stroke by stroke (a scene). */
  pop?: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLElement>(null);
  const engineRef = useRef<DoodleEngine | null>(null);
  const running = useRef<(() => void) | null>(null);
  const drawn = useRef(false);
  const done = useRef(0);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [alive, setAlive] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);

  /** Where each link's dot goes: beside the top right of its part, in the figure's pixels. */
  const placeDots = useCallback(() => {
    const engine = engineRef.current;
    const root = rootRef.current;
    if (!engine || !root) return;
    const frame = root.getBoundingClientRect();
    const found: Dot[] = [];
    for (const task of tasksRef.current.slice(0, done.current)) {
      if (!task.link) continue;
      const box = engine.linkBox(task.op.part);
      const corner = engine.screen([box.x1, box.y0]);
      if (!corner) continue;
      found.push({
        key: task.link.key,
        number: task.link.number,
        x: Math.min(corner[0] - frame.left + 6, frame.width + 4),
        y: Math.max(corner[1] - frame.top - 4, 6),
      });
    }
    setDots((was) => (JSON.stringify(was) === JSON.stringify(found) ? was : found));
  }, []);

  /** Run the next step: the drawing in, then each task in order, one at a time. */
  const pump = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || running.current) return;
    const start = (make: () => Build, instant: boolean, then: () => void) => {
      engine.instant = instant;
      let build: Build;
      try {
        build = make();
      } finally {
        engine.instant = false;
      }
      if (instant || build.items.length === 0) {
        for (const item of build.items) {
          item.show(1);
          item.finish();
        }
        build.after?.();
        then();
        return;
      }
      const natural = build.items.reduce((sum, item) => sum + item.ms, 0);
      let over = false;
      const stop = runDrawing({
        items: build.items,
        host: rootRef.current ?? artRef.current!,
        pen: penRef.current,
        totalMs: build.totalMs && natural > build.totalMs ? build.totalMs : undefined,
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
      const instant = stillMotion() || drawnOnce.has(drawKey);
      const words = !instant && captionRef.current ? captionItem(captionRef.current) : null;
      start(
        () => engine.drawIn(words),
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
      placeDots();
      return;
    }
    const seen = `${drawKey}|${task.key}`;
    start(
      () => engine.build(task.op),
      stillMotion() || !task.live || playedOnce.has(seen),
      () => {
        playedOnce.add(seen);
        done.current = index + 1;
        placeDots();
        pump();
      },
    );
  }, [drawKey, placeDots]);

  // The art goes in, and everything due is done on it: again from the start whenever its size
  // changes, when all that was done before is shown done at once.
  useLayoutEffect(() => {
    const host = artRef.current;
    if (!host) return;
    running.current?.();
    running.current = null;
    const engine = new DoodleEngine(host, source, {
      stageArt,
      other: (id) => engines.get(id) ?? null,
      noteRoom,
      pop,
    });
    engineRef.current = engine;
    if (doodleId) engines.set(doodleId, engine);
    drawn.current = false;
    done.current = 0;
    setDots([]);
    if (!engine.mount()) {
      setAlive(true);
      return;
    }
    pump();
    return () => {
      running.current?.();
      running.current = null;
      if (captionRef.current) captionRef.current.style.opacity = "";
      if (doodleId && engines.get(doodleId) === engine) engines.delete(doodleId);
    };
    // `source` follows `sourceKey`; the helpers are stable.
  }, [sourceKey, width, height, noteRoom, caption, pop]);

  // New tasks as the lesson reaches them.
  useEffect(() => {
    pump();
  }, [tasks, pump]);

  return (
    <figure
      ref={rootRef}
      className={`dd dd-live ${alive ? "alive" : "drawing"}`}
      style={{ "--dd-size": `${width}px`, "--dd-h": `${height}px`, paddingRight: noteRoom } as CSSProperties}
      data-paused={paused ? "" : undefined}
      data-doodle-id={doodleId ?? undefined}
      role="img"
      aria-label={caption ? `${alt} (${caption})` : alt}
    >
      <div className="dd-art" ref={artRef} />
      {caption ? (
        <figcaption className="dd-caption" ref={captionRef as RefObject<HTMLElement>}>
          {caption}
        </figcaption>
      ) : null}
      {dots.map((dot) => (
        <span
          key={dot.key}
          className={`pb-pairdot fig dd-dot pair-${(dot.number - 1) % PAIR_COLOURS}${lit === dot.number ? " lit" : ""}`}
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
      <DoodlePen penRef={penRef} lift="done" />
    </figure>
  );
}
