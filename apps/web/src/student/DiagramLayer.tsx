/**
 * WHERE THE LIVE DIAGRAMS GO on the board (docs/plans/doodles-v2-contract.md section 8), and
 * what is due on each.
 *
 * A diagram comes in with the moment that names it (`diagram: {id, kind, ...}`), once the line
 * it belongs to (`near`, by default the moment's own, or the latest before it) is up, or in the
 * whiteboard style on its word. It goes:
 *
 * - on a wide screen with no figure or passage beside the working, in that right-hand column
 *   (the one a doodle scene takes, Board.tsx), one under another, as wide as the column;
 * - otherwise under its line, room made for it there (the line's bottom padding grows by it),
 *   as wide as the working allows (up to about 400px, a `scene` up to 560px; on a phone, the
 *   column).
 *
 * Its tasks are its later moments' `diagram_do` actions and the board lines linked to its parts
 * (`to: {diagram, part}`), each due as its moment's marks are (after the line is written, or on
 * its word), and played by the pen in order (LiveDiagram.tsx). A line across joins each linked
 * board line to its dot by the part, as for a doodle (DoodleLayer.tsx `DoodleLinks`).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";

import type { LessonDiagram, LessonDiagramOp } from "./api.js";
import { useBoardPrefs } from "./boardPrefs.js";
import { DoodleLinks, type DoodleLink } from "./DoodleLayer.js";
import { LiveDiagram, diagramAspect, type DiagramTask } from "./LiveDiagram.js";

/** What the layer needs of a moment of the lesson. */
export interface DiagramMoment {
  items: string[];
  diagram?: LessonDiagram | null;
  diagramDo?: LessonDiagramOp[] | null;
}

/** A board line's link to a diagram's part (Board.tsx `pairLinks`). */
export interface DiagramLink {
  key: string;
  number: number;
  set: number;
  diagram: string;
  part: string | null;
  kind: string;
}

interface Due {
  key: string;
  moment: number;
  near: number;
  spec: LessonDiagram;
  plan: LessonDiagramOp[];
  tasks: DiagramTask[];
}

interface Spot {
  left: number;
  top: number;
  /** The drawing's width, and the card's whole height. */
  w: number;
  h: number;
  outerW: number;
  under: number | null;
  panel: boolean;
}

/** The card round the drawing: its padding, and the caption's line. */
const CARD_PAD = 22;
const CAPTION_H = 28;

function panelOpen(panel: HTMLElement | null): boolean {
  return Boolean(panel && panel.offsetParent !== null && panel.clientWidth >= 240);
}

export function DiagramLayer({
  sheetRef,
  moments,
  shown,
  itemsShown,
  pointing,
  paused,
  speed = 1,
  links = [],
  lit = null,
  onLit = () => undefined,
  panel = null,
  hold,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  moments: DiagramMoment[];
  /** How many moments are up. */
  shown: number;
  /** How many of the newest moment's pieces are up. */
  itemsShown: number;
  /** The moment whose marks are going up: its line is written, and its actions are due. */
  pointing: number | null;
  paused: boolean;
  speed?: number;
  links?: DiagramLink[];
  lit?: number | null;
  onLit?: (number: number | null, tapped?: boolean) => void;
  /** The right-hand column a diagram may take, where the board has one. */
  panel?: HTMLElement | null;
  /**
   * The whiteboard style's timing (Board.tsx): for a moment's diagram (`diagram`) or action k
   * (`do`), true to hold it back, false to let it go now, null for the usual rule.
   */
  hold?: (moment: number, what: "diagram" | "do", k: number) => boolean | null;
}) {
  const whiteboard = useBoardPrefs().style === "whiteboard";

  // Every action the lesson takes on each diagram, in order: its room is kept for all of them.
  const plans = useMemo(() => {
    const out = new Map<string, LessonDiagramOp[]>();
    for (const moment of moments)
      for (const op of moment.diagramDo ?? []) out.set(op.id, [...(out.get(op.id) ?? []), op]);
    return out;
  }, [moments]);

  const due: Due[] = useMemo(() => {
    const out: Due[] = [];
    const byId = new Map<string, Due>();
    const current = shown - 1;
    moments.slice(0, shown).forEach((moment, index) => {
      const spec = moment.diagram;
      if (spec?.id && spec.kind) {
        let near = typeof spec.near === "number" ? spec.near : index;
        if (!moments[near]?.items.length) {
          near = -1;
          for (let back = index; back >= 0; back -= 1)
            if (moments[back]?.items.length) {
              near = back;
              break;
            }
        }
        const lineUp = near >= 0 && !(near === current && itemsShown === 0);
        const held = hold?.(index, "diagram", 0) === true;
        if ((lineUp || near < 0) && !held && !byId.has(spec.id)) {
          const item: Due = {
            key: spec.id,
            moment: index,
            near: Math.max(0, near),
            spec,
            plan: plans.get(spec.id) ?? [],
            tasks: [],
          };
          out.push(item);
          byId.set(spec.id, item);
        }
      }
      const open = index < current || pointing === index;
      let held = false;
      (moment.diagramDo ?? []).forEach((op, k) => {
        const rule = hold?.(index, "do", k) ?? null;
        held ||= rule === true || (rule === null && !open);
        if (held) return;
        byId.get(op.id)?.tasks.push({ key: `${index}:${k}`, op, live: index === current });
      });
      if (open && !held)
        for (const link of links.filter((one) => one.set === index))
          byId.get(link.diagram)?.tasks.push({
            key: `link:${link.key}`,
            link: { key: link.key, number: link.number, part: link.part, kind: link.kind },
            live: index === current,
          });
    });
    return out;
  }, [hold, itemsShown, links, moments, plans, pointing, shown]);

  const [spots, setSpots] = useState<Map<string, Spot>>(() => new Map());
  const room = useRef(new Map<HTMLElement, string>());
  const width = useRef(0);

  const layout = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Put back the room made last time, so the lines are measured as they are.
    for (const [element, was] of room.current) element.style.paddingBottom = was;
    room.current.clear();
    const base = sheet.getBoundingClientRect();
    const style = getComputedStyle(sheet);
    const minX = Number.parseFloat(style.paddingLeft) || 0;
    const maxX = sheet.clientWidth - (Number.parseFloat(style.paddingRight) || 0);
    const column = maxX - minX;
    const phone = column < 520;
    const inPanel = panelOpen(panel);
    const out = new Map<string, Spot>();
    const below = new Map<number, number>();
    for (const item of due) {
      const aspect = diagramAspect(item.spec, item.plan);
      const caption = item.spec.caption ? CAPTION_H : 0;
      if (inPanel && panel) {
        const w = Math.min(420, panel.clientWidth - CARD_PAD - 4);
        out.set(item.key, { left: 0, top: 0, w, h: w / aspect + caption + CARD_PAD, outerW: w + CARD_PAD, under: null, panel: true });
        continue;
      }
      const most = phone ? column - CARD_PAD : item.spec.size === "scene" ? 560 : 400;
      const w = Math.max(200, Math.min(most, column - CARD_PAD));
      const h = w / aspect + caption + CARD_PAD;
      const outerW = w + CARD_PAD;
      const line = sheet.querySelector<HTMLElement>(`[data-line="${item.near}"]`);
      if (!line) continue;
      const bottom = line.getBoundingClientRect().bottom - base.top;
      const top = bottom + 10 + (below.get(item.near) ?? 0);
      below.set(item.near, (below.get(item.near) ?? 0) + h + 14);
      const left = phone ? minX + (column - outerW) / 2 : minX + Math.min(28, Math.max(0, column - outerW));
      out.set(item.key, { left, top, w, h, outerW, under: item.near, panel: false });
    }
    // Room under each line for what sits there.
    for (const [at, height] of below) {
      const line = sheet.querySelector<HTMLElement>(`[data-line="${at}"]`);
      if (!line) continue;
      room.current.set(line, line.style.paddingBottom);
      line.style.paddingBottom = `${Math.ceil(height + 12)}px`;
    }
    setSpots((was) => (JSON.stringify([...was]) === JSON.stringify([...out]) ? was : out));
  }, [due, panel, sheetRef]);

  useLayoutEffect(() => {
    layout();
  }, [layout]);

  // Laid out again when the board changes width.
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
      frame = requestAnimationFrame(() => latest.current());
    });
    observer.observe(sheet);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sheetRef]);
  useEffect(
    () => () => {
      for (const [element, was] of room.current) element.style.paddingBottom = was;
    },
    [],
  );

  // A diagram put under its line is brought into view above the coach card while the board is
  // following that line.
  const looked = useRef(new Set<string>());
  useEffect(() => {
    const sheet = sheetRef.current;
    const ink = sheet?.closest<HTMLElement>(".pb-ink");
    if (!sheet || !ink) return;
    const timers: number[] = [];
    for (const [key, spot] of spots) {
      if (spot.panel || looked.current.has(key)) continue;
      looked.current.add(key);
      timers.push(
        window.setTimeout(() => {
          const lines = Array.from(sheet.querySelectorAll<HTMLElement>("[data-line]"));
          if (lines.some((row) => Number(row.dataset.line) > (spot.under ?? 0) + 1)) return;
          const view = ink.getBoundingClientRect();
          const stage = ink.closest<HTMLElement>(".pb-stage");
          const coach = Number.parseFloat(stage ? getComputedStyle(stage).getPropertyValue("--coach-room") : "") || 76;
          const floor = view.bottom - coach - 12;
          const bottom = sheet.getBoundingClientRect().top + spot.top + spot.h;
          const line = sheet.querySelector<HTMLElement>(`[data-line="${spot.under}"]`)?.getBoundingClientRect();
          if (bottom > floor && line) {
            const by = Math.min(bottom - floor, line.top - view.top - 12);
            if (by > 2) ink.scrollBy({ top: by, behavior: "smooth" });
          }
        }, 700),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sheetRef, spots]);

  // Lines across go to a diagram on the working; one in the column beside it is paired by its
  // numbered dots, and lit with its line on a hover or a tap (LiveDiagram.tsx).
  const doodleLinks: DoodleLink[] = useMemo(
    () =>
      links
        .filter((link) => spots.get(link.diagram)?.panel === false)
        .map((link) => ({ key: link.key, number: link.number, set: link.set, doodle: link.diagram, part: link.part, kind: link.kind })),
    [links, spots],
  );

  if (due.length === 0) return null;
  const render = (item: Due, spot: Spot) => (
    <LiveDiagram
      drawKey={`${item.key}:${JSON.stringify(item.spec).length}`}
      spec={item.spec}
      plan={item.plan}
      width={Math.round(spot.w)}
      caption={item.spec.caption?.trim() || null}
      tasks={item.tasks}
      paused={paused}
      speed={speed}
      whiteboard={whiteboard}
      lit={lit}
      onLit={onLit}
    />
  );
  const inPanel = due.filter((item) => spots.get(item.key)?.panel);
  return (
    <div className="ld-layer">
      {due.map((item) => {
        const spot = spots.get(item.key);
        if (!spot || spot.panel) return null;
        return (
          <div
            key={item.key}
            className="ld-spot dd-spot"
            style={{ left: spot.left, top: spot.top, width: spot.outerW, height: spot.h }}
            data-moment={item.moment}
          >
            {render(item, spot)}
          </div>
        );
      })}
      {panel && inPanel.length
        ? createPortal(
            inPanel.map((item) => (
              <div key={item.key} className="ld-panelspot" data-moment={item.moment}>
                {render(item, spots.get(item.key)!)}
              </div>
            )),
            panel,
          )
        : null}
      {doodleLinks.length ? <DoodleLinks sheetRef={sheetRef} links={doodleLinks} lit={lit} onLit={onLit} /> : null}
    </div>
  );
}
