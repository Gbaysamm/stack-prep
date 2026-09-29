/**
 * WHERE THE DOODLES GO on the working: beside the line each belongs to, in free board, never over
 * the writing, a mark, a mark's words or another doodle.
 *
 * A doodle comes in with the moment that names it (`doodle: {name, caption?, near?}`), beside
 * the line `near` names (by default the moment's own line, or the latest line before it when
 * the moment writes none). It is looked for in the right-hand gutter of the working first, level
 * with its line and then a little higher, then just after the end of the line; only in board
 * already written on (never below the lowest line, where the next line will be written). Where
 * nothing is free at full size it tries smaller, and where nothing is free even then, it makes
 * room: the lines after its own are moved down and it sits under its line, at the right.
 *
 * Like the marks, a doodle stays once it is up. At most about two are meant to share a
 * screenful; a doodle with another close above it is drawn smaller.
 *
 * The marks keep off the doodles in turn: each placed doodle is a `.dd-spot`, which the board
 * counts as writing when it lays out a mark's words and routes (Board.tsx, `measureMarks`).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { LessonDoodle, LessonDoodleRef } from "./api.js";
import { Doodle } from "./Doodle.js";
import { libraryDoodle } from "./doodles/index.js";
import type { Box } from "./ink.js";

/** What the layer needs of a moment of the lesson. */
export interface DoodleMoment {
  items: string[];
  doodle?: LessonDoodleRef | null;
}

interface Due {
  key: string;
  /** The moment that brings it in. */
  moment: number;
  /** The moment whose line it sits by. */
  near: number;
  svg: string;
  alt: string;
  caption: string | null;
}

interface Spot {
  left: number;
  top: number;
  /** The picture's width and height. */
  size: number;
  /** The whole of what it covers, the caption under it included. */
  w: number;
  h: number;
  /** The line moved down to make room under it, if it had to be. */
  roomUnder: number | null;
}

/** A doodle's size: about 120px beside the working on a laptop, 80px on a phone. */
function sizes(width: number): number[] {
  return width < 520 ? [84, 76, 68] : [124, 108, 92];
}
const GAP = 10;

/**
 * The room a caption takes under a picture of `size`: its width (at most a little wider than
 * the picture, where it wraps onto a second line) and its height. Estimated from the handwriting
 * face's average letter, since the face may not have arrived when the doodle is placed.
 */
export function captionRoom(caption: string | null, size: number): { w: number; h: number } {
  if (!caption) return { w: size, h: 0 };
  const font = Math.min(22, Math.max(17, size * 0.17));
  const wide = caption.length * font * 0.43 + 10;
  const most = size + 56;
  const lines = wide > most ? 2 : 1;
  return { w: Math.max(size, Math.min(wide, most)), h: lines * font * 1.08 + 6 };
}

function meets(a: Box, b: Box, pad: number): boolean {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}

function relative(rect: DOMRect, base: DOMRect): Box {
  return { left: rect.left - base.left, top: rect.top - base.top, right: rect.right - base.left, bottom: rect.bottom - base.top };
}

/** The ink of a line: each written piece's words, as tight boxes, row by row. */
function inkOf(line: Element, base: DOMRect): Box[] {
  const boxes: Box[] = [];
  for (const item of Array.from(line.querySelectorAll(".pb-item"))) {
    const range = document.createRange();
    range.selectNodeContents(item);
    for (const rect of Array.from(range.getClientRects()))
      if (rect.width > 0 && rect.height > 0) boxes.push(relative(rect, base));
  }
  if (boxes.length === 0) boxes.push(relative(line.getBoundingClientRect(), base));
  return boxes;
}

/** Everything on the sheet a doodle must keep off, but for the doodles themselves. */
function obstacles(sheet: HTMLElement, base: DOMRect): Box[] {
  const found: Box[] = [];
  sheet.querySelectorAll("[data-line]").forEach((line) => found.push(...inkOf(line, base)));
  sheet
    .querySelectorAll<HTMLElement>(".pb-question, .pb-line.answer, .pb-coachline, .pb-asked")
    .forEach((element) => found.push(relative(element.getBoundingClientRect(), base)));
  // The marks: their strokes (a circle, an arrow's bow), their words and the pairs' dots.
  sheet
    .querySelectorAll<Element>(".pb-marks .pb-mark, .pb-mark-label, .pb-pairdot, .pb-carried")
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) found.push(relative(rect, base));
    });
  return found;
}

/**
 * Find a spot for each doodle in turn: beside its line if it can, else under it with room made.
 * `taken` is the spots already settled, which stay where they are.
 */
function place(
  sheet: HTMLElement,
  due: Due[],
  settled: Map<string, Spot>,
  screen: number,
): Map<string, Spot> {
  const base = sheet.getBoundingClientRect();
  // The column the working is written in: the sheet less its side padding (the page's gutter).
  const style = getComputedStyle(sheet);
  const minX = Number.parseFloat(style.paddingLeft) || 0;
  const width = sheet.clientWidth - (Number.parseFloat(style.paddingRight) || 0);
  const spots = new Map<string, Spot>();
  const blocked = obstacles(sheet, base);
  const lowest = Math.max(0, ...blocked.map((box) => box.bottom));
  const doodleBoxes: Box[] = [];
  const boxOf = (spot: Spot): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + spot.w,
    bottom: spot.top + spot.h,
  });
  for (const doodle of due) {
    const kept = settled.get(doodle.key);
    if (kept) {
      spots.set(doodle.key, kept);
      doodleBoxes.push(boxOf(kept));
      continue;
    }
    const line = sheet.querySelector<HTMLElement>(`[data-line="${doodle.near}"]`);
    if (!line) continue;
    const ink = inkOf(line, base);
    const row: Box = {
      left: Math.min(...ink.map((b) => b.left)),
      top: Math.min(...ink.map((b) => b.top)),
      right: Math.max(...ink.map((b) => b.right)),
      bottom: Math.max(...ink.map((b) => b.bottom)),
    };
    // Another doodle within a screenful above: this one is drawn smaller, so two can share it.
    const crowd = doodleBoxes.filter((box) => Math.abs(box.bottom - row.bottom) < screen).length;
    const options = sizes(width - minX).slice(Math.min(2, crowd));
    let found: Spot | null = null;
    for (const size of options) {
      const room = captionRoom(doodle.caption, size);
      const w = room.w;
      const h = size + room.h;
      const tries: [number, number][] = [];
      // Level with the line, then higher; never lower than the board written so far.
      const floor = Math.min(lowest, row.bottom + h * 0.35);
      // Just after the end of the line first, where it reads with it; then further along the
      // row, out to the right-hand edge of the column.
      // No higher than just above its line's top: past that it reads as another line's, and room
      // is made under its own instead.
      for (let lift = 0; lift <= floor - row.top + 12; lift += 10) {
        const top = floor - h - lift;
        for (let x = row.right + 36; x + w <= width; x += 18) tries.push([x, top]);
        tries.push([width - w, top]);
      }
      for (const [left, top] of tries) {
        if (top < 0 || left < minX) continue;
        const box = { left, top, right: left + w, bottom: top + h };
        if (blocked.some((b) => meets(box, b, GAP)) || doodleBoxes.some((b) => meets(box, b, GAP))) continue;
        found = { left, top, size, w, h, roomUnder: null };
        break;
      }
      if (found) break;
    }
    if (!found) {
      // No room beside it anywhere: room is made under the line, and the doodle sits there, at
      // the size it has room for (the one smaller where another shares the screenful).
      const size = options[0] ?? 80;
      const room = captionRoom(doodle.caption, size);
      found = {
        left: Math.max(minX, width - room.w),
        top: row.bottom + 8,
        size,
        w: room.w,
        h: size + room.h,
        roomUnder: doodle.near,
      };
    }
    spots.set(doodle.key, found);
    doodleBoxes.push(boxOf(found));
  }
  return spots;
}

export function DoodleLayer({
  sheetRef,
  moments,
  shown,
  itemsShown,
  doodles,
  paused,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  /** The lesson's moments, in order. */
  moments: DoodleMoment[];
  /** How many moments are up. */
  shown: number;
  /** How many of the newest moment's pieces are up. */
  itemsShown: number;
  /** The lesson's own pictures (`custom:…`). */
  doodles?: LessonDoodle[];
  paused: boolean;
}) {
  // The doodles due: every moment up to the one being said that brings one in, whose line is on
  // the board.
  const due: Due[] = useMemo(() => {
    const out: Due[] = [];
    moments.slice(0, shown).forEach((moment, index) => {
      const ref = moment.doodle;
      if (!ref?.name) return;
      let near = typeof ref.near === "number" ? ref.near : index;
      if (!moments[near]?.items.length) {
        near = -1;
        for (let back = index; back >= 0; back -= 1)
          if (moments[back]?.items.length) {
            near = back;
            break;
          }
      }
      if (near < 0 || near > index) return;
      // The line it sits by has to be up: the newest moment's, once its first piece is written.
      if (near === shown - 1 && itemsShown === 0) return;
      const art = ref.name.startsWith("custom:")
        ? (doodles ?? []).find((doodle) => doodle.name === ref.name)
        : null;
      const library = art ? null : libraryDoodle(ref.name);
      const svg = art?.svg ?? library?.svg;
      if (!svg) return;
      out.push({
        key: `${index}:${ref.name}`,
        moment: index,
        near,
        svg,
        alt: art?.alt_text ?? library?.alt ?? "A doodle",
        caption: ref.caption?.trim() || null,
      });
    });
    return out;
  }, [doodles, itemsShown, moments, shown]);

  const [spots, setSpots] = useState<Map<string, Spot>>(() => new Map());
  const settled = useRef(new Map<string, Spot>());
  const width = useRef(0);
  const room = useRef(new Map<HTMLElement, string>());

  /** Make the room a doodle under its line needs: its line's bottom margin grows by it. */
  const makeRoom = useCallback((sheet: HTMLElement, placed: Map<string, Spot>) => {
    for (const [element, was] of room.current) element.style.marginBottom = was;
    room.current.clear();
    for (const spot of placed.values()) {
      if (spot.roomUnder === null) continue;
      const line = sheet.querySelector<HTMLElement>(`[data-line="${spot.roomUnder}"]`);
      if (!line) continue;
      if (!room.current.has(line)) room.current.set(line, line.style.marginBottom);
      line.style.marginBottom = `${spot.h + 22}px`;
    }
  }, []);

  const layout = useCallback(
    (fresh: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (fresh) {
        // The board changed width: everything is found again, from the top.
        for (const [element, was] of room.current) element.style.marginBottom = was;
        room.current.clear();
        settled.current = new Map();
      }
      const ink = sheet.closest(".pb-ink");
      const placed = place(sheet, due, settled.current, ink?.clientHeight ?? 700);
      settled.current = placed;
      makeRoom(sheet, placed);
      setSpots(placed);
    },
    [due, makeRoom, sheetRef],
  );

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    width.current = sheet.clientWidth;
    layout(false);
  }, [layout, sheetRef]);

  // Found again from the top only when the board changes width: a doodle, once up, stays put.
  const latest = useRef(layout);
  latest.current = layout;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (sheet.clientWidth === width.current) return;
      width.current = sheet.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => latest.current(true));
    });
    observer.observe(sheet);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sheetRef]);

  // A doodle made room for under its line is brought into view above the coach card, while the
  // student is following the board (its line in view). Looked at for a few seconds, since the
  // board may still be scrolling its new line into view when the doodle is placed.
  const shownKeys = useRef(new Set<string>());
  // Kept across renders (the spots are laid out again as each line goes up): cleared on leaving.
  const lookTimers = useRef<number[]>([]);
  useEffect(() => () => lookTimers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    const sheet = sheetRef.current;
    const ink = sheet?.closest<HTMLElement>(".pb-ink");
    if (!sheet || !ink) return;
    const timers = lookTimers.current;
    for (const [key, spot] of spots) {
      if (shownKeys.current.has(key) || spot.roomUnder === null) continue;
      shownKeys.current.add(key);
      const look = (tries: number) => {
        // The board has moved on to a later line: it is following that one now, not this.
        const lines = Array.from(sheet.querySelectorAll<HTMLElement>("[data-line]"));
        if (lines.some((row) => Number(row.dataset.line) > (spot.roomUnder ?? 0))) return;
        const line = sheet.querySelector<HTMLElement>(`[data-line="${spot.roomUnder}"]`);
        const view = ink.getBoundingClientRect();
        const lineBox = line?.getBoundingClientRect();
        const stage = ink.closest<HTMLElement>(".pb-stage");
        const coach =
          Number.parseFloat(stage ? getComputedStyle(stage).getPropertyValue("--coach-room") : "") || 76;
        const floor = view.bottom - coach - 12;
        const bottom = sheet.getBoundingClientRect().top + spot.top + spot.h;
        const seen = lineBox && lineBox.top >= view.top && lineBox.bottom <= floor + 4;
        if (seen && bottom > floor) {
          const by = Math.min(bottom - floor, lineBox.top - view.top - 12);
          if (by > 2) ink.scrollBy({ top: by, behavior: "smooth" });
          return;
        }
        if (tries > 0 && !(seen && bottom <= floor)) timers.push(window.setTimeout(() => look(tries - 1), 350));
      };
      timers.push(window.setTimeout(() => look(30), 350));
    }
  }, [sheetRef, spots]);

  if (due.length === 0) return null;
  return (
    <div className="dd-layer">
      {due.map((doodle) => {
        const spot = spots.get(doodle.key);
        if (!spot) return null;
        return (
          <div
            key={doodle.key}
            className="dd-spot"
            style={{ left: spot.left, top: spot.top, width: spot.w, height: spot.h }}
            data-moment={doodle.moment}
          >
            <Doodle
              svg={doodle.svg}
              alt={doodle.alt}
              size={spot.size}
              caption={doodle.caption}
              paused={paused}
              drawKey={`${doodle.key}:${doodle.svg.length}`}
            />
          </div>
        );
      })}
    </div>
  );
}
