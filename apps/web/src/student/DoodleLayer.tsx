/**
 * WHERE THE DOODLES GO on the working: beside the line each belongs to, in free board, never over
 * the writing, a mark, a mark's words or another doodle.
 *
 * A doodle comes in with the moment that names it (`doodle: {name, caption?, near?}`, or two
 * with `doodles: [..]`), beside the line `near` names (by default the moment's own line, or the
 * latest line before it when the moment writes none). It is looked for in the right-hand gutter
 * of the working first, level with its line and then a little higher, then just after the end
 * of the line; only in board already written on (never below the lowest line, where the next
 * line will be written). Where nothing is free at full size it tries smaller, and where nothing
 * is free even then, it makes room: the lines after its own are moved down and it sits under its
 * line, at the right (two under one line side by side where they fit, else one under the other).
 *
 * DOODLES V2 (docs/plans/doodles-v2-contract.md):
 * - A doodle's `size`: small (about 70px), medium (120px, the default) or a scene (320x200 on a
 *   laptop). A scene takes the right-hand panel when the lesson has no figure or passage there
 *   (Board.tsx gives it one), else a wider place beside the working; on a phone it always goes
 *   in room made under its line.
 * - A `repeat` is a community of small figures, laid out in a row, grid or cluster, sized to
 *   hold every arrangement its actions will spread it into (doodleArt.ts).
 * - Its later moments' `doodle_do` actions, and board lines linked to it (`to: {doodle, part}`),
 *   are its tasks, played by the pen as their moment's line is written (LiveDoodle.tsx). A doodle
 *   that writes notes beside itself is given room for them on its right.
 * - A board line linked to a doodle is joined to it by a line across, drawn from the pair's
 *   numbered dot on the working to the dot beside the doodle's part, and kept where it runs
 *   clear of everything; lit with both ends on a hover or a tap.
 *
 * Like the marks, a doodle stays once it is up. At most about two are meant to share a
 * screenful; a doodle with another close above it is drawn smaller.
 *
 * The marks keep off the doodles in turn: each placed doodle is a `.dd-spot`, which the board
 * counts as writing when it lays out a mark's words and routes (Board.tsx, `measureMarks`).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";

import type { LessonDoodle, LessonDoodleOp, LessonDoodleRef, LessonMouth } from "./api.js";
import { CELL, charsIn, repeatCount, repeatShape, viewBoxOf } from "./doodleArt.js";
import type { ArtSource, DoodleEngine } from "./doodleEngine.js";
import { libraryDoodle } from "./doodles/index.js";
import { stillMotion, type Box, type Pt } from "./ink.js";
import { LiveDoodle, type DoodleTask } from "./LiveDoodle.js";
import { Mouth, mouthBox } from "./Mouth.js";

/** What the layer needs of a moment of the lesson. */
export interface DoodleMoment {
  items: string[];
  doodle?: LessonDoodleRef | null;
  doodles?: LessonDoodleRef[] | null;
  doodleDo?: LessonDoodleOp[] | null;
  /** A talking mouth it brings in (Mouth.tsx), and what it says and its voice, for the mouth. */
  mouth?: LessonMouth | null;
  say?: string;
  voice?: string | null;
}

/** A board line's link to a doodle (Board.tsx `pairLinks`): the pair, and what it points at. */
export interface DoodleLink {
  /** The mark's key (`<moment>-<place>`), as the working's end of the pair has it. */
  key: string;
  number: number;
  /** The moment whose mark it is. */
  set: number;
  doodle: string;
  part: string | null;
  /** The mark's kind on the working: the doodle's part gets the same kind of mark. */
  kind: string;
}

interface Due {
  key: string;
  /** The moment that brings it in. */
  moment: number;
  /** The moment whose line it sits by. */
  near: number;
  id: string | null;
  source: ArtSource;
  sourceKey: string;
  alt: string;
  caption: string | null;
  size: "small" | "medium" | "scene" | "repeat" | "mouth";
  /** A talking mouth (Mouth.tsx) rather than a picture. */
  mouth?: LessonMouth;
  /** The art's width over its height. */
  aspect: number;
  /** For a repeat: its width in its own units (figures are CELL units each). */
  units: number;
  /** The longest note it writes beside itself, in characters (0: none). */
  notes: number;
  /** Asked to be drawn small. */
  small: boolean;
  tasks: DoodleTask[];
}

interface Spot {
  left: number;
  top: number;
  /** The art's width and height. */
  w: number;
  h: number;
  /** The room on its right for its notes. */
  note: number;
  /** The whole of what it covers, the caption and notes included. */
  outerW: number;
  outerH: number;
  /** The line moved down to make room under it, if it had to be. */
  roomUnder: number | null;
  /** In the right-hand panel rather than on the working. */
  panel: boolean;
  /** The line it was placed by: a talking mouth follows the lines that make it speak. */
  near?: number;
}

const GAP = 10;

/** The art's widths to try, largest first, for a kind of doodle on this width of board. */
function widths(due: Due, column: number, phone: boolean): number[] {
  // A talking mouth is the lesson's main picture: its box holds the face (about two thirds of
  // it), the symbol beside it and its syllables.
  if (due.size === "mouth") return phone ? [176, 164, 152] : [236, 220, 204];
  if (due.size === "repeat") {
    const figure = due.small ? (phone ? [22, 20, 18] : [24, 21, 18]) : phone ? [24, 21, 18] : [30, 26, 23];
    return figure.map((px) => (due.units * px) / CELL);
  }
  if (due.size === "scene") return phone ? [Math.min(320, column)] : [320, 288, 256];
  if (due.size === "small") return phone ? [60, 54, 48] : [72, 64, 56];
  return phone ? [84, 76, 68] : [124, 108, 92];
}

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

/** The whole footprint of a doodle drawn `w` wide: the art, its caption, its notes' room. */
function footprint(due: Due, w: number, column: number, phone: boolean): Omit<Spot, "left" | "top" | "roomUnder" | "panel"> {
  const h = w / due.aspect;
  let note = 0;
  if (due.notes > 0) {
    const want = Math.min(phone ? 140 : 230, due.notes * 7.4 + 22);
    // Notes on the right only where the art and some notes fit across the column; else they
    // are written inside the picture, by the part.
    if (w + want <= column) note = want;
    else if (column - w >= charsIn(0) * 7.4 + 30) note = column - w;
  }
  const room = captionRoom(due.caption, Math.min(w, 180));
  return { w, h, note, outerW: Math.max(w, room.w) + note, outerH: h + room.h };
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
    // A live diagram (DiagramLayer.tsx) is kept off too.
    .querySelectorAll<HTMLElement>(".pb-question, .pb-line.answer, .pb-coachline, .pb-asked, .ld-spot")
    .forEach((element) => found.push(relative(element.getBoundingClientRect(), base)));
  // The marks: their strokes (a circle, an arrow's bow), their words and the pairs' dots.
  sheet
    .querySelectorAll<Element>(".pb-marks .pb-mark, .pb-mark-label, .pb-marks .pb-pairdot, .pb-carried")
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) found.push(relative(rect, base));
    });
  return found;
}

/** Whether the right-hand panel for scenes is there to be used (a wide board, no figure). */
function panelOpen(panel: HTMLElement | null): boolean {
  return Boolean(panel && panel.offsetParent !== null && panel.clientWidth >= 240);
}

/**
 * Find a spot for each doodle in turn: beside its line if it can, else under it with room made.
 * `settled` is the spots already settled, which stay where they are.
 */
function place(
  sheet: HTMLElement,
  due: Due[],
  settled: Map<string, Spot>,
  screen: number,
  panel: HTMLElement | null,
): Map<string, Spot> {
  const base = sheet.getBoundingClientRect();
  // The column the working is written in: the sheet less its side padding (the page's gutter).
  const style = getComputedStyle(sheet);
  const minX = Number.parseFloat(style.paddingLeft) || 0;
  const width = sheet.clientWidth - (Number.parseFloat(style.paddingRight) || 0);
  const column = width - minX;
  const phone = column < 520;
  const inPanel = panelOpen(panel);
  const spots = new Map<string, Spot>();
  const blocked = obstacles(sheet, base);
  const lowest = Math.max(0, ...blocked.map((box) => box.bottom));
  const doodleBoxes: Box[] = [];
  /** What has been put under each line already: the next goes beside it, or under it. */
  const under = new Map<number, { left: number; bottom: number; top: number }>();
  const boxOf = (spot: Spot): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + spot.outerW,
    bottom: spot.top + spot.outerH,
  });
  for (const doodle of due) {
    const kept = settled.get(doodle.key);
    // A scene, or a talking mouth, takes the right-hand panel where there is one.
    const panelled = (doodle.size === "scene" || doodle.size === "mouth") && inPanel;
    if (kept && kept.panel === panelled && (kept.panel || kept.near === undefined || kept.near === doodle.near)) {
      spots.set(doodle.key, kept);
      if (!kept.panel) doodleBoxes.push(boxOf(kept));
      if (kept.roomUnder !== null) {
        const was = under.get(kept.roomUnder);
        under.set(kept.roomUnder, {
          left: Math.min(was?.left ?? Infinity, kept.left),
          top: Math.min(was?.top ?? Infinity, kept.top),
          bottom: Math.max(was?.bottom ?? 0, kept.top + kept.outerH),
        });
      }
      continue;
    }
    if (panelled && panel) {
      // The panel's own column: as wide as it is (up to a comfortable size), one under another.
      const w = Math.min(doodle.size === "mouth" ? 300 : 400, panel.clientWidth - 28);
      const print = footprint(doodle, w, w + 1, false);
      spots.set(doodle.key, { ...print, note: 0, outerW: w, left: 0, top: 0, roomUnder: null, panel: true });
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
    const all = widths(doodle, column, phone);
    const options = all.slice(Math.min(all.length - 1, crowd));
    // On a phone a scene, a talking mouth, or a group of figures wider than half the column,
    // goes straight under its line, where it has the width.
    const wide =
      phone && (doodle.size === "scene" || doodle.size === "mouth" || (options[0] ?? 0) > column * 0.5);
    let found: Spot | null = null;
    for (const artW of wide ? [] : options) {
      const print = footprint(doodle, Math.min(artW, column), column, phone);
      const w = print.outerW;
      const h = print.outerH;
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
        found = { ...print, left, top, roomUnder: null, panel: false, near: doodle.near };
        break;
      }
      if (found) break;
    }
    if (!found) {
      // No room beside it anywhere: room is made under the line, and the doodle sits there, at
      // the size it has room for (the one smaller where another shares the screenful).
      const artW = Math.min(options[0] ?? 80, column);
      const print = footprint(doodle, artW, column, phone);
      const was = under.get(doodle.near);
      // A mouth is centred under its line, where the eye goes next, not pushed to the edge.
      const centred = print.outerW > column * 0.6 || doodle.size === "mouth";
      let left = centred ? minX + (column - print.outerW) / 2 : Math.max(minX, width - print.outerW);
      // Under the line's own box, where it is a card (the answer) taller than its words.
      let top = Math.max(row.bottom, relative(line.getBoundingClientRect(), base).bottom) + 8;
      if (was) {
        // Beside the one already there, where it fits; else under it.
        if (was.left - GAP * 2 - print.outerW >= minX) {
          left = was.left - GAP * 2 - print.outerW;
          top = was.top;
        } else top = was.bottom + GAP;
      }
      found = { ...print, left, top, roomUnder: doodle.near, panel: false, near: doodle.near };
    }
    spots.set(doodle.key, found);
    doodleBoxes.push(boxOf(found));
    if (found.roomUnder !== null) {
      const was = under.get(found.roomUnder);
      under.set(found.roomUnder, {
        left: Math.min(was?.left ?? Infinity, found.left),
        top: Math.min(was?.top ?? Infinity, found.top),
        bottom: Math.max(was?.bottom ?? 0, found.top + found.outerH),
      });
    }
  }
  return spots;
}

/** A mark's kind on the working, as the doodle's part is marked for it. */
function doodleMark(kind: string): LessonDoodleOp["op"] {
  if (kind === "highlight" || kind === "underline" || kind === "circle") return kind;
  if (kind === "strike") return "cross";
  return "circle";
}

/** The ops that write words beside the doodle (not a group's names, not an arrow's). */
const NOTE_OPS = new Set(["label", "circle", "highlight", "underline", "cross"]);

export function DoodleLayer({
  sheetRef,
  moments,
  shown,
  itemsShown,
  pointing,
  doodles,
  paused,
  links = [],
  lit = null,
  onLit = () => undefined,
  panel = null,
  hold,
  clipAt,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  /** The lesson's moments, in order. */
  moments: DoodleMoment[];
  /** How many moments are up. */
  shown: number;
  /** How many of the newest moment's pieces are up. */
  itemsShown: number;
  /** The moment whose marks are going up: its line is written, and its actions are due. */
  pointing: number | null;
  /** The lesson's own pictures (`custom:…`). */
  doodles?: LessonDoodle[];
  paused: boolean;
  /** Board lines' links to doodles, as they are due. */
  links?: DoodleLink[];
  lit?: number | null;
  onLit?: (number: number | null, tapped?: boolean) => void;
  /** The right-hand panel a scene may take, where the board has made one. */
  panel?: HTMLElement | null;
  /**
   * The whiteboard style's timing (Board.tsx): for a moment's doodle k (`doodle`) or action k
   * (`do`), true to hold it back, false to let it go now, null for the usual rule.
   */
  hold?: (moment: number, what: "doodle" | "do", k: number) => boolean | null;
  /** A moment's voice clip, for a talking mouth to keep time with (Mouth.tsx). */
  clipAt?: (moment: number) => HTMLAudioElement | null;
}) {
  const artOf = useCallback(
    (name: string): { svg: string; alt: string } | null => {
      if (name.startsWith("custom:")) {
        const own = (doodles ?? []).find((doodle) => doodle.name === name);
        return own ? { svg: own.svg, alt: own.alt_text ?? "A doodle" } : null;
      }
      const shared = libraryDoodle(name);
      return shared ? { svg: shared.svg, alt: shared.alt } : null;
    },
    [doodles],
  );
  const stageArt = useCallback((name: string) => artOf(name)?.svg ?? null, [artOf]);

  // Every action in the lesson on each id, in order: a group's room is kept for all of them.
  const plans = useMemo(() => {
    const out = new Map<string, LessonDoodleOp[]>();
    for (const moment of moments)
      for (const op of moment.doodleDo ?? []) out.set(op.id, [...(out.get(op.id) ?? []), op]);
    return out;
  }, [moments]);

  // The doodles due: every moment up to the one being said that brings one in, whose line is on
  // the board; and what has been done to each so far.
  const due: Due[] = useMemo(() => {
    const out: Due[] = [];
    const byId = new Map<string, Due>();
    const current = shown - 1;
    moments.slice(0, shown).forEach((moment, index) => {
      const refs = [moment.doodle, ...(moment.doodles ?? [])].filter(
        (ref): ref is LessonDoodleRef => Boolean(ref && (ref.name || ref.repeat)),
      );
      refs.forEach((ref, k) => {
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
        if (hold?.(index, "doodle", k) === true) return;
        const id = ref.id?.trim() || null;
        const plan = id ? plans.get(id) ?? [] : [];
        const count = repeatCount(ref);
        let source: ArtSource;
        let alt: string;
        let aspect = 1;
        let units = 0;
        let size: Due["size"];
        if (count > 0) {
          const kinds = Array.isArray(ref.repeat)
            ? ref.repeat.map((kind) => ({ svg: artOf(kind.name)?.svg ?? "", n: kind.n }))
            : [{ svg: artOf(ref.name)?.svg ?? "", n: count }];
          if (kinds.every((kind) => !kind.svg)) return;
          source = { kind: "repeat", ref, kinds, plan };
          const shape = repeatShape(ref, plan);
          aspect = shape.width / shape.height;
          units = shape.width;
          size = "repeat";
          alt = `${count} ${artOf(Array.isArray(ref.repeat) ? ref.repeat[0]!.name : ref.name)?.alt.toLowerCase() ?? "figures"}`;
        } else {
          const art = artOf(ref.name);
          if (!art) return;
          source = { kind: "single", name: ref.name, svg: art.svg };
          const [, , w, h] = viewBoxOf(art.svg);
          aspect = w / h;
          size = ref.size === "scene" ? "scene" : ref.size === "small" ? "small" : "medium";
          alt = art.alt;
        }
        const notes = Math.max(0, ...plan.filter((op) => NOTE_OPS.has(op.op) && op.text).map((op) => op.text!.length));
        const item: Due = {
          key: id ? `id:${id}` : `${index}:${k}:${ref.name}`,
          moment: index,
          near,
          id,
          source,
          sourceKey: JSON.stringify([ref.name, ref.repeat ?? null, ref.layout ?? null, plan.map((op) => [op.op, op.n, Boolean(op.text)])]),
          alt,
          caption: ref.caption?.trim() || null,
          size,
          aspect: aspect > 0 && Number.isFinite(aspect) ? aspect : 1,
          units,
          // A group writes its notes over itself, in room of its own.
          notes: size === "repeat" ? 0 : notes,
          small: ref.size === "small",
          tasks: [],
        };
        out.push(item);
        if (id) byId.set(id, item);
      });
      // A talking mouth it brings in, placed like a doodle (Mouth.tsx).
      const mouth = moment.mouth;
      if (mouth?.word) {
        // By its line, or (until that is written) the line before: the mouth comes in as its
        // moment starts, so it is there for the first word said. In the right-hand panel it
        // needs no line, and comes in with its moment even when nothing is written yet. On the
        // working (a phone), it moves down to each later line that makes it speak, so it is in
        // view as it says its word rather than scrolled away above.
        let speaks = index;
        const mouthId = mouth.id?.trim();
        if (mouthId)
          moments.slice(index + 1, shown).forEach((later, k) => {
            if ((later.doodleDo ?? []).some((op) => op.op === "say" && op.id === mouthId)) speaks = index + 1 + k;
          });
        let near = speaks;
        while (near >= 0 && (!moments[near]?.items.length || (near === shown - 1 && itemsShown === 0)))
          near -= 1;
        const up = near >= 0 || panel !== null;
        if (up) {
          const id = mouth.id?.trim() || null;
          const box = mouthBox(mouth);
          const item: Due = {
            key: id ? `id:${id}` : `${index}:mouth`,
            moment: index,
            near,
            id,
            source: { kind: "single", name: "mouth", svg: "" },
            sourceKey: `mouth:${mouth.word}:${mouth.view ?? "front"}`,
            alt: `A mouth saying ${mouth.word}`,
            caption: mouth.caption?.trim() || null,
            size: "mouth",
            mouth,
            aspect: box.w / box.h,
            units: 0,
            notes: 0,
            small: false,
            tasks: [],
          };
          out.push(item);
          if (id) byId.set(id, item);
        }
      }
      // This moment's actions and links, once its line is written (or it is past).
      // Actions go in order: one held back holds back those after it (and the links), so a
      // doodle's list of tasks only ever grows at its end.
      const open = index < current || pointing === index;
      let held = false;
      (moment.doodleDo ?? []).forEach((op, k) => {
        const rule = hold?.(index, "do", k) ?? null;
        held ||= rule === true || (rule === null && !open);
        if (held) return;
        byId.get(op.id)?.tasks.push({ key: `${index}:${k}`, op, live: index === current });
      });
      if (open && !held) {
        for (const link of links.filter((one) => one.set === index)) {
          byId.get(link.doodle)?.tasks.push({
            key: `link:${link.key}`,
            op: { id: link.doodle, op: doodleMark(link.kind), part: link.part },
            live: index === current,
            link: { key: link.key, number: link.number },
          });
        }
      }
    });
    return out;
  }, [artOf, hold, itemsShown, links, moments, panel, plans, pointing, shown]);

  const [spots, setSpots] = useState<Map<string, Spot>>(() => new Map());
  const settled = useRef(new Map<string, Spot>());
  const width = useRef(0);
  const room = useRef(new Map<HTMLElement, string>());
  const engines = useRef(new Map<string, DoodleEngine>());

  /** Make the room a doodle under its line needs: its line's bottom margin grows by it. */
  const makeRoom = useCallback((sheet: HTMLElement, placed: Map<string, Spot>) => {
    for (const [element, was] of room.current) element.style.marginBottom = was;
    room.current.clear();
    const need = new Map<number, number>();
    for (const spot of placed.values()) {
      if (spot.roomUnder === null) continue;
      const line = sheet.querySelector<HTMLElement>(`[data-line="${spot.roomUnder}"]`);
      if (!line) continue;
      const top = line.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top;
      need.set(spot.roomUnder, Math.max(need.get(spot.roomUnder) ?? 0, spot.top + spot.outerH - top));
    }
    for (const [at, height] of need) {
      const line = sheet.querySelector<HTMLElement>(`[data-line="${at}"]`);
      if (!line) continue;
      if (!room.current.has(line)) room.current.set(line, line.style.marginBottom);
      line.style.marginBottom = `${height + 22}px`;
    }
  }, []);

  const layout = useCallback(
    (fresh: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      // A talking mouth moving down to a later line: the room made for it under its old line
      // goes, so the lines below move up; everything is found again from the top, as the lines
      // are now, rather than placed by where they were.
      const moved = due.some((doodle) => {
        const kept = doodle.mouth ? settled.current.get(doodle.key) : undefined;
        return kept !== undefined && !kept.panel && kept.near !== undefined && kept.near !== doodle.near;
      });
      const ink = sheet.closest(".pb-ink");
      const screen = ink?.clientHeight ?? 700;
      if (fresh || moved) {
        // The board changed width: everything is found again, from the top. One at a time, in
        // order, with the room each makes under its line made before the next is placed, so a
        // doodle under a later line is placed where that line will be, not where it was.
        for (const [element, was] of room.current) element.style.marginBottom = was;
        room.current.clear();
        settled.current = new Map();
        // In the order of their lines down the board (a mouth brought in early may now sit by a
        // later line than a doodle brought in after it).
        const downward = [...due].sort((a, b) => a.near - b.near);
        for (let count = 1; count < downward.length; count += 1) {
          settled.current = place(sheet, downward.slice(0, count), settled.current, screen, panel);
          makeRoom(sheet, settled.current);
        }
      }
      const placed = place(sheet, due, settled.current, screen, panel);
      settled.current = placed;
      makeRoom(sheet, placed);
      setSpots(placed);
    },
    [due, makeRoom, panel, sheetRef],
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
      // By its key and its line: a mouth that moves down to a later line is looked at again.
      const seen = `${key}@${spot.roomUnder}`;
      if (shownKeys.current.has(seen) || spot.roomUnder === null) continue;
      shownKeys.current.add(seen);
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
        const bottom = sheet.getBoundingClientRect().top + spot.top + spot.outerH;
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
  const render = (doodle: Due, spot: Spot) =>
    doodle.mouth ? (
      <Mouth
        spec={doodle.mouth}
        moment={doodle.moment}
        tasks={doodle.tasks}
        current={shown - 1}
        moments={moments}
        clipAt={clipAt}
        width={Math.round(spot.w)}
        height={Math.round(spot.h)}
        caption={doodle.caption}
        paused={paused}
      />
    ) : (
    <LiveDoodle
      drawKey={`${doodle.key}:${doodle.sourceKey.length}`}
      doodleId={doodle.id}
      source={doodle.source}
      sourceKey={doodle.sourceKey}
      width={Math.round(spot.w)}
      height={Math.round(spot.h)}
      caption={doodle.caption}
      alt={doodle.alt}
      tasks={doodle.tasks}
      paused={paused}
      noteRoom={Math.round(spot.note)}
      engines={engines.current}
      stageArt={stageArt}
      lit={lit}
      onLit={onLit}
    />
  );
  const inPanel = due.filter((doodle) => spots.get(doodle.key)?.panel);
  return (
    <div className="dd-layer">
      {due.map((doodle) => {
        const spot = spots.get(doodle.key);
        if (!spot || spot.panel) return null;
        return (
          <div
            key={doodle.key}
            className="dd-spot"
            style={{ left: spot.left, top: spot.top, width: spot.outerW, height: spot.outerH }}
            data-moment={doodle.moment}
          >
            {render(doodle, spot)}
          </div>
        );
      })}
      {panel && inPanel.length
        ? createPortal(
            inPanel.map((doodle) => (
              <div key={doodle.key} className="dd-panelspot" data-moment={doodle.moment}>
                {render(doodle, spots.get(doodle.key)!)}
              </div>
            )),
            panel,
          )
        : null}
      {links.length ? (
        <DoodleLinks sheetRef={sheetRef} links={links} lit={lit} onLit={onLit} />
      ) : null}
    </div>
  );
}

/** How long a line across that cannot stay is held once drawn, before it is let go. */
const HOLD_MS = 2800;

interface Across {
  key: string;
  number: number;
  d: string;
  clean: boolean;
  fresh: boolean;
}

/**
 * THE LINES ACROSS between a board line and the doodle it links to: from the working's end of
 * the pair (the piece, or its numbered dot) to the dot beside the doodle's part. Kept where it
 * runs clear of the writing, the marks and the other doodles; where it cannot, drawn as its
 * mark goes up and then let go, the numbered dots saying what goes with what; drawn again while
 * the pair is lit.
 */
export function DoodleLinks({
  sheetRef,
  links,
  lit,
  onLit,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  links: DoodleLink[];
  lit: number | null;
  onLit: (number: number | null, tapped?: boolean) => void;
}) {
  const [across, setAcross] = useState<Across[]>([]);
  const seen = useRef(new Map<string, number>());
  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const base = sheet.getBoundingClientRect();
    const blocked = obstacles(sheet, base);
    const doodleBoxes = Array.from(sheet.querySelectorAll<HTMLElement>(".dd-spot")).map((spot) =>
      relative(spot.getBoundingClientRect(), base),
    );
    const now = performance.now();
    const out: Across[] = [];
    for (const link of links) {
      const start = sheet.querySelector(`[data-link-work="${link.key}"]`)?.getBoundingClientRect();
      const end = document.querySelector(`[data-link-doodle="${link.key}"]`)?.getBoundingClientRect();
      if (!start || !end || end.width === 0) continue;
      if (!seen.current.has(link.key)) seen.current.set(link.key, now);
      const a: Pt = [start.left - base.left, start.top - base.top];
      const dot: Pt = [end.left + end.width / 2 - base.left, end.top + end.height / 2 - base.top];
      // Stopped just short of the dot, so the line points at it rather than covering it.
      const far = Math.hypot(dot[0] - a[0], dot[1] - a[1]) || 1;
      const b: Pt = [dot[0] - ((dot[0] - a[0]) / far) * 11, dot[1] - ((dot[1] - a[1]) / far) * 11];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const reach = Math.max(40, Math.abs(dx) * 0.45);
      const c1: Pt = [a[0] + reach, a[1]];
      const c2: Pt = Math.abs(dx) > Math.abs(dy) ? [b[0] - Math.sign(dx) * reach * 0.7, b[1]] : [b[0], b[1] - Math.sign(dy) * Math.max(30, Math.abs(dy) * 0.4)];
      const route: Pt[] = [];
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        const u = 1 - t;
        route.push([
          u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
          u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
        ]);
      }
      // Its own ends are not in its way: the working's dot beside its piece, and the doodle the
      // line goes to.
      const holds = (o: Box, p: Pt, pad: number) =>
        p[0] > o.left - pad && p[0] < o.right + pad && p[1] > o.top - pad && p[1] < o.bottom + pad;
      const others = [
        ...blocked.filter((o) => !holds(o, a, 26)),
        ...doodleBoxes.filter((o) => !holds(o, b, 2)),
      ];
      const clear = (p: Pt, i: number) => {
        if (i < 2 || i > 22) return true;
        return !others.some((o) => holds(o, p, 2));
      };
      const clean = route.every(clear);
      const fresh = !stillMotion() && now - (seen.current.get(link.key) ?? now) < HOLD_MS;
      if (!clean && !fresh && lit !== link.number) continue;
      out.push({
        key: link.key,
        number: link.number,
        d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)}C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`,
        clean,
        fresh,
      });
    }
    setAcross((was) => (JSON.stringify(was) === JSON.stringify(out) ? was : out));
  }, [links, lit, sheetRef]);

  useEffect(() => {
    const sheet = sheetRef.current;
    const ink = sheet?.closest<HTMLElement>(".pb-ink");
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    again();
    const timer = window.setInterval(again, 400);
    ink?.addEventListener("scroll", again, { passive: true });
    window.addEventListener("resize", again);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      ink?.removeEventListener("scroll", again);
      window.removeEventListener("resize", again);
    };
  }, [measure, sheetRef]);

  if (across.length === 0) return null;
  return (
    <svg className="pb-links dd-links" aria-hidden="true">
      {across.map((line) => {
        const state = lit === line.number ? "lit" : line.clean ? (line.fresh ? "draw" : "kept") : "pass";
        return (
          <g
            key={line.key}
            className={`pb-link pair-${(line.number - 1) % 5} ${state}`}
            style={{ "--delay": "0s" } as CSSProperties}
            onMouseEnter={() => onLit(line.number)}
            onMouseLeave={() => onLit(null)}
            onClick={() => onLit(line.number, true)}
          >
            <path className="pb-link-hit" d={line.d} />
            <path className="pb-link-line" d={line.d} pathLength={1} />
          </g>
        );
      })}
    </svg>
  );
}
