/**
 * Which sound effect the board makes, and when (the whiteboard style only; sfx.ts makes them).
 *
 * The board is watched rather than wired: this compares what is up now with what was up a
 * render ago, and sounds what has just arrived, so Board.tsx only has to hand over its state.
 *
 * - the pen starting a line: scribble; the answer's line: ding;
 * - a mark: by what it does: a strike is the error buzz, a move the whoosh, a mark with words
 *   or a pair dot a pop, any other a scribble; each at its turn among its moment's marks;
 * - a doodle arriving: pop; an action on one: a count, group or split ticks, a move whooshes,
 *   a cross buzzes, a stage, grow, shrink or pulse pops;
 * - a picture brought onto the board: whoosh;
 * - the moment after the answer (the trap the student fell into): the error buzz;
 * - a tap on one of the board's buttons: click.
 *
 * sfx.ts throttles them to a few a moment. Pausing stops them.
 */

import { useEffect, useRef } from "react";

import type { LessonDoodleOp, LessonDoodleRef, LessonPoint } from "./api.js";
import { markDelays } from "./ink.js";
import { playSfx, sfxMoment, stopSfx, type SfxName } from "./sfx.js";

/** What the hook needs of a moment. */
interface SfxMoment {
  items: string[];
  answer: boolean;
  doodle?: LessonDoodleRef | null;
  doodles?: LessonDoodleRef[] | null;
  doodleDo?: LessonDoodleOp[] | null;
}

/** The pen's own wait before a line starts (Board.tsx STROKE_DELAY_MS). */
const PEN_LEAD_MS = 180;

/** Doodle actions wait for the working's pen; this is roughly their turn each. */
const ACTION_TURN_MS = 650;

function markSound(point: LessonPoint): SfxName {
  if (point.kind === "strike") return "error";
  if (point.kind === "move") return "whoosh";
  if (point.text || point.to) return "pop";
  return "scribble";
}

function actionSound(op: LessonDoodleOp): SfxName | null {
  switch (op.op) {
    case "count":
    case "group":
    case "split":
      return "tick";
    case "move":
      return "whoosh";
    case "cross":
      return "error";
    case "stage":
    case "grow":
    case "shrink":
    case "pulse":
      return "pop";
    default:
      return null;
  }
}

/** A mark held back for its word (Board.tsx): drawn nowhere, and not sounded. */
export function isHeldMark(point: LessonPoint): boolean {
  return point.line == null && point.figure == null && !point.passage;
}

export function useBoardSfx({
  active,
  paused,
  speed,
  moments,
  shown,
  itemsShown,
  marks,
  doodleDue,
  actionDue,
  picturesUp,
  answerAt,
}: {
  /** The whiteboard style is on. */
  active: boolean;
  paused: boolean;
  speed: number;
  moments: SfxMoment[];
  shown: number;
  itemsShown: number;
  /** The marks up on the board now, by moment, as Board.tsx draws them. */
  marks: { index: number; points: LessonPoint[] }[];
  /** Whether the current moment's doodle k (its `doodle`, then its `doodles`) is due. */
  doodleDue: (k: number) => boolean;
  /** Whether the current moment's doodle action k is due. */
  actionDue: (k: number) => boolean;
  /** How many diagrams are on the board. */
  picturesUp: number;
  /** The answer's moment, or -1. */
  answerAt: number;
}): void {
  const was = useRef<{
    moment: number;
    items: number;
    marks: Set<string>;
    doodles: Set<number>;
    actions: Set<number>;
    pictures: number;
  } | null>(null);

  // Taps on the board's controls.
  useEffect(() => {
    if (!active) return;
    const tapped = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>(".pb button");
      if (button && !button.disabled) playSfx("click", 0, true);
    };
    document.addEventListener("pointerdown", tapped, true);
    return () => document.removeEventListener("pointerdown", tapped, true);
  }, [active]);

  // A pause, or leaving the board, silences them.
  useEffect(() => {
    if (paused || !active) stopSfx();
  }, [active, paused]);
  useEffect(() => () => stopSfx(), []);

  useEffect(() => {
    const current = shown - 1;
    const moment = moments[current];
    const markKeys = new Set<string>();
    for (const set of marks)
      set.points.forEach((point, k) => {
        if (!isHeldMark(point)) markKeys.add(`${set.index}-${k}`);
      });
    const refs = moment
      ? [moment.doodle, ...(moment.doodles ?? [])].filter((ref): ref is LessonDoodleRef => Boolean(ref))
      : [];
    const doodles = new Set(refs.map((_, k) => k).filter((k) => doodleDue(k)));
    const actions = new Set(
      (moment?.doodleDo ?? []).map((_, k) => k).filter((k) => actionDue(k)),
    );
    const before = was.current;
    was.current = { moment: current, items: itemsShown, marks: markKeys, doodles, actions, pictures: picturesUp };
    if (!active || paused || !moment || current < 0) return;
    const fresh = !before || before.moment !== current;
    if (fresh) sfxMoment(current);
    const scale = (ms: number) => ms / (speed || 1);

    // The trap: said after the answer, when the student chose a trap option.
    if (fresh && answerAt >= 0 && current > answerAt && !moment.answer) playSfx("error", scale(200));

    // The pen starting this moment's line. On the render a moment begins, `itemsShown` is still
    // the last moment's (the board resets it just after), so the count is only read from the
    // next render on.
    if (fresh) was.current.items = 0;
    else if (itemsShown > before.items && moment.items.length)
      playSfx(moment.answer ? "ding" : "scribble", scale(PEN_LEAD_MS));

    // Marks just up, each at its turn.
    for (const set of marks) {
      const delays = markDelays(set.points, set.index);
      set.points.forEach((point, k) => {
        const key = `${set.index}-${k}`;
        if (isHeldMark(point) || before?.marks.has(key)) return;
        if (set.index !== current) return;
        playSfx(markSound(point), scale((delays[k] ?? 0) * 1000));
      });
    }

    // Doodles arriving (read from the next render on, as the line is), and the pen acting on
    // them.
    if (fresh) was.current.doodles = new Set();
    else for (const k of doodles) if (!before.doodles.has(k)) playSfx("pop", scale(PEN_LEAD_MS));
    let turn = 0;
    (moment.doodleDo ?? []).forEach((op, k) => {
      if (!actions.has(k) || (!fresh && before.actions.has(k))) return;
      const sound = actionSound(op);
      if (sound) playSfx(sound, scale(turn * ACTION_TURN_MS));
      turn += 1;
    });

    // A picture brought onto the board.
    if (before && picturesUp > before.pictures) playSfx("whoosh");
  },[active, paused, shown, itemsShown, marks, picturesUp, moments, answerAt, speed, doodleDue, actionDue]);
}
