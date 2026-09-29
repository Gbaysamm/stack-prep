/**
 * THE PASSAGE ON THE BOARD, and the teacher's marks in it.
 *
 * A comprehension question is answered from its passage, and a lesson about it keeps pointing
 * back into it: "the first paragraph says…", "look at the word but". So the passage is kept on
 * the board beside the working (on a phone, in a sheet pinned over it that folds away), and the
 * lesson marks it the way it marks a line: the words that decide the answer highlighted, a word
 * underlined or circled, a tempting detail struck through, a short note written between the
 * lines. Every mark in the passage belongs with a line of the working, and the two are lit
 * together by a hover or a tap on either (Board.tsx, `pairLinks`): a numbered flag in the
 * passage's margin, the same number beside the line, and a line drawn across where it runs clear.
 *
 * NOTES GO BETWEEN THE LINES, NEVER OVER THE WORDS. A note is set just under the words it is
 * about, in room opened for it: the line those words end on is made taller (an empty inline
 * box after them), and the note sits in the space that makes. Two notes on one line share the
 * room side by side where they fit and stack where they do not, so no note ever covers the
 * passage or another note.
 *
 * THE PASSAGE FOLLOWS THE LESSON. Each mark, as it goes up, scrolls the passage smoothly to it
 * (to the very bottom if that is where it is), and the words flash as it arrives; the passage
 * then stays there while the moment plays. A pair lit from the working brings its words into
 * view the same way.
 *
 * A CLOZE PASSAGE prints its gaps as ___(16)___. Each is drawn as a numbered gap; the one this
 * question asks about is lit from the start, and at the moment of the answer the right word is
 * written into it by the pen.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  drawCircle,
  drawHighlight,
  drawStrike,
  drawStroke,
  seeded,
  stillMotion,
  type Box,
} from "./ink.js";
import { findInPassage, foldPassage, paragraphs, type Token } from "./passage.js";

/** What a mark in the passage may be. */
export type PassageKind = "highlight" | "underline" | "circle" | "strike" | "label";

/** A mark in the passage as the board hands it over: what, where, when, and its pair. */
export interface PassageMark {
  /** The mark's key (`<moment>-<place in its list>`), the same as its link's. */
  key: string;
  kind: PassageKind;
  /** Its words as they read in the passage, and which occurrence (from 1). */
  target: string;
  nth: number;
  /** A short note written between the lines under the words, if any. */
  text: string | null;
  /** Seconds after its moment's marks start that it goes up. */
  delay: number;
  /** The number of the line of working it goes with, or null. */
  number: number | null;
  /** Found by the board itself (a quote on a line): matched ignoring case. */
  loose?: boolean;
}

/** How many colours the pairs cycle through (board.css, `.pair-N`). */
const PAIR_COLOURS = 5;

/** Where a cloze gap starts: a run of underscores. */
const GAP_START = /^__/;

interface Placed {
  mark: PassageMark;
  start: number;
  end: number;
}

interface Shape {
  key: string;
  kind: PassageKind;
  number: number | null;
  d: string;
  width?: number;
  delay: number;
}

interface NoteSpot {
  key: string;
  left: number;
  top: number;
  caret: number;
}

interface Flag {
  key: string;
  number: number;
  top: number;
  bottom: number;
  delay: number;
  /** The first mark of its pair in the passage: it carries the number. */
  lead: boolean;
}

interface Layout {
  shapes: Shape[];
  notes: NoteSpot[];
  flags: Flag[];
  /** Each mark's rows, in the text's own coordinates: where to scroll to. */
  rows: Map<string, Box[]>;
}

/** How far above the passage window's bottom edge a mark is brought: clear of its fade (board.css). */
const CLEAR_BOTTOM = 36;

/** Where a note may go: the passage's width less this much at each side. */
const NOTE_INSET = 4;
/** Air between a line of the passage and a note under it, and after the note. */
const NOTE_GAP = 3;

const pairClass = (number: number | null) =>
  number === null ? "unpaired" : `pair-${(number - 1) % PAIR_COLOURS}`;

/** Rows of text a set of inline boxes runs across: one box per line, as the words wrap. */
function rowsOf(rects: DOMRect[], base: DOMRect): Box[] {
  const rows: Box[] = [];
  const sorted = rects
    .filter((r) => r.width >= 0.5 && r.height >= 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  for (const r of sorted) {
    const box = { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top };
    const middle = (box.top + box.bottom) / 2;
    const row = rows.find((one) => middle > one.top && middle < one.bottom);
    if (row) {
      row.left = Math.min(row.left, box.left);
      row.right = Math.max(row.right, box.right);
      row.top = Math.min(row.top, box.top);
      row.bottom = Math.max(row.bottom, box.bottom);
    } else rows.push(box);
  }
  return rows;
}

export function PassagePanel({
  title,
  body,
  marks,
  gap,
  answerText,
  answerUp,
  lit,
  onLit,
}: {
  title: string | null;
  body: string;
  marks: PassageMark[];
  /** The cloze gap this question asks about, or null. */
  gap: number | null;
  /** The right option's words, written into that gap at the answer. */
  answerText: string | null;
  /** The lesson has reached its answer. */
  answerUp: boolean;
  /** The pair lit by a hover or a tap. */
  lit: number | null;
  onLit: (number: number | null, tapped?: boolean) => void;
}) {
  const folded = useMemo(() => foldPassage(body), [body]);
  const paras = useMemo(() => paragraphs(body), [body]);
  const placed: Placed[] = useMemo(() => {
    const out: Placed[] = [];
    for (const mark of marks) {
      const found =
        findInPassage(folded, mark.target, mark.nth) ??
        (mark.loose ? findInPassage(folded, mark.target, mark.nth, true) : null);
      if (found) out.push({ mark, start: found[0], end: found[1] });
    }
    return out;
  }, [folded, marks]);
  const noted = placed.filter((one) => one.mark.text);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  //: The room each note has opened under its line, in pixels, and where everything is.
  const [rooms, setRooms] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<Layout>({ shapes: [], notes: [], flags: [], rows: new Map() });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [width, setWidth] = useState(0);
  //: On a phone the passage folds away; a new mark opens it again.
  const [open, setOpen] = useState(true);
  //: The mark just arrived at, flashed as the passage gets there.
  const [arrived, setArrived] = useState<{ key: string; at: number } | null>(null);

  // The text's width: a change re-lays the notes and the marks.
  useEffect(() => {
    const text = textRef.current;
    if (!text || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(text.clientWidth));
    observer.observe(text);
    void document.fonts?.ready.then(() => setWidth((was) => was + 0.001));
    return () => observer.disconnect();
  }, []);

  // THE LAYOUT, measured from where the words really are. First the room each note needs (its
  // line made taller by the note's height, or by the notes' when two share a line and must
  // stack); once that has settled, every mark's strokes, the notes' places and the flags.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const base = text.getBoundingClientRect();
    const full = text.clientWidth;
    const lh = Number.parseFloat(window.getComputedStyle(text).lineHeight) || 26;
    const rows = new Map<string, Box[]>();
    for (const one of placed) {
      const rects = Array.from(text.querySelectorAll<HTMLElement>(`[data-k~="${one.mark.key}"]`)).flatMap(
        (el) => Array.from(el.getClientRects()),
      );
      rows.set(one.mark.key, rowsOf(rects, base));
    }
    // Notes, grouped by the line their room is on.
    const sized = noted
      .map((one) => {
        const chip = text.querySelector<HTMLElement>(`[data-note="${one.mark.key}"]`);
        const room = text.querySelector<HTMLElement>(`[data-room="${one.mark.key}"]`);
        const all = rows.get(one.mark.key) ?? [];
        const last = all[all.length - 1];
        if (!chip || !room || !last) return null;
        const r = room.getBoundingClientRect();
        return {
          key: one.mark.key,
          w: Math.min(chip.offsetWidth, full - NOTE_INSET * 2),
          h: chip.offsetHeight,
          line: Math.round(r.top - base.top),
          prefer: last.left,
          middle: (last.left + last.right) / 2,
        };
      })
      .filter((one): one is NonNullable<typeof one> => one !== null);
    const lines = new Map<number, typeof sized>();
    for (const one of sized) lines.set(one.line, [...(lines.get(one.line) ?? []), one]);
    const want: Record<string, number> = {};
    const spots: NoteSpot[] = [];
    for (const [line, group] of lines) {
      group.sort((a, b) => a.prefer - b.prefer);
      // Side by side where they fit on the line, else one under another.
      let right = NOTE_INSET - 8;
      const side = group.map((one) => {
        const left = Math.max(one.prefer - 6, right + 8);
        right = left + one.w;
        return left;
      });
      const overflow = right - (full - NOTE_INSET);
      const fits = group.reduce((sum, one) => sum + one.w + 8, -8) <= full - NOTE_INSET * 2;
      let room: number;
      if (fits) {
        // Slid back from the right edge as far as needed, keeping their order.
        let shift = Math.max(0, overflow);
        for (let i = group.length - 1; i >= 0; i -= 1) {
          const nextLeft = i + 1 < group.length ? side[i + 1]! : full - NOTE_INSET + 8;
          side[i] = Math.min(side[i]! - shift, nextLeft - 8 - group[i]!.w);
          shift = 0;
        }
        room = Math.max(...group.map((one) => one.h)) + NOTE_GAP * 2 + 2;
        group.forEach((one, i) => {
          const left = Math.max(NOTE_INSET, side[i]!);
          spots.push({ key: one.key, left, top: line + lh + NOTE_GAP, caret: one.middle - left });
        });
      } else {
        let y = line + lh + NOTE_GAP;
        for (const one of group) {
          const left = Math.max(NOTE_INSET, Math.min(one.prefer - 6, full - NOTE_INSET - one.w));
          spots.push({ key: one.key, left, top: y, caret: one.middle - left });
          y += one.h + NOTE_GAP + 1;
        }
        room = y - (line + lh) + NOTE_GAP;
      }
      for (const one of group) want[one.key] = Math.ceil(room);
    }
    const same =
      Object.keys(want).length === Object.keys(rooms).length &&
      Object.entries(want).every(([key, value]) => rooms[key] === value);
    if (!same) {
      setRooms(want);
      return;
    }
    // The strokes, from the rows as they now lie.
    const shapes: Shape[] = [];
    const flags: Flag[] = [];
    const flagged = new Set<number>();
    placed.forEach((one, index) => {
      const { mark } = one;
      const boxes = rows.get(mark.key) ?? [];
      if (boxes.length === 0) return;
      const rnd = seeded(index * 97 + one.start * 7 + 5);
      const base0 = { key: mark.key, kind: mark.kind, number: mark.number, delay: mark.delay };
      if (mark.kind === "highlight") {
        const { d, width: breadth } = drawHighlight(boxes, rnd);
        shapes.push({ ...base0, d, width: breadth });
      } else if (mark.kind === "strike") {
        shapes.push({ ...base0, d: drawStrike(boxes, rnd) });
      } else if (mark.kind === "circle") {
        shapes.push({ ...base0, d: boxes.map((box) => drawCircle(box, rnd)).join(" ") });
      } else {
        // An underline, or for a note alone a light line under the words it is about.
        const d = boxes
          .map((box) => drawStroke([box.left - 1, box.bottom + 2], [box.right + 2, box.bottom + 1], rnd))
          .join(" ");
        shapes.push({ ...base0, d });
      }
      if (mark.number !== null) {
        const top = boxes[0]!.top;
        const bottom = boxes[boxes.length - 1]!.bottom;
        flags.push({ key: mark.key, number: mark.number, top, bottom, delay: mark.delay, lead: !flagged.has(mark.number) });
        flagged.add(mark.number);
      }
    });
    const next: Layout = { shapes, notes: spots, flags, rows };
    const was = layoutRef.current;
    const sig = (l: Layout) =>
      JSON.stringify([l.shapes.map((s) => [s.key, s.d.length, s.d.slice(0, 40)]), l.notes, l.flags]);
    if (sig(next) !== sig(was)) setLayout(next);
    else layoutRef.current = { ...was, rows };
  });

  /** Scroll the passage so a piece of it (rows in the text's coordinates) is well in view. */
  const bring = useCallback((top: number, bottom: number, instant = false) => {
    const scroller = scrollRef.current;
    const text = textRef.current;
    if (!scroller || !text) return;
    const offset = text.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const a = offset + top;
    const b = offset + bottom;
    const view = scroller.clientHeight;
    const inView = a >= scroller.scrollTop + 12 && b <= scroller.scrollTop + view - CLEAR_BOTTOM;
    if (inView) return;
    // A third of the way down, so the words before it are there to read too.
    const goal = Math.max(0, Math.min(scroller.scrollHeight - view, a - Math.min(view * 0.3, Math.max(12, view - (b - a) - CLEAR_BOTTOM))));
    scroller.scrollTo({ top: goal, behavior: instant || stillMotion() ? "auto" : "smooth" });
  }, []);

  /** Go to a mark: open the passage if it is folded, scroll to it, and flash it. */
  const visit = useCallback(
    (key: string, flash = true) => {
      setOpen(true);
      const go = () => {
        const boxes = layoutRef.current.rows.get(key);
        if (!boxes || boxes.length === 0) return;
        bring(boxes[0]!.top, boxes[boxes.length - 1]!.bottom);
        if (flash) setArrived({ key, at: performance.now() });
      };
      // After the fold has opened and the room for its note is made.
      window.setTimeout(go, 60);
    },
    [bring],
  );

  // FOLLOWING THE LESSON: each new mark, at its turn in its moment.
  const seen = useRef(new Set<string>());
  const timers = useRef<number[]>([]);
  useEffect(() => {
    for (const one of placed) {
      if (seen.current.has(one.mark.key)) continue;
      seen.current.add(one.mark.key);
      timers.current.push(window.setTimeout(() => visit(one.mark.key), one.mark.delay * 1000));
    }
    // A replay takes the marks off: they are followed again when they come back.
    const live = new Set(placed.map((one) => one.mark.key));
    for (const key of Array.from(seen.current)) if (!live.has(key)) seen.current.delete(key);
  }, [placed, visit]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  // A pair lit from the working brings its words into view.
  useEffect(() => {
    if (lit === null) return;
    const first = placed.find((one) => one.mark.number === lit);
    if (first) visit(first.mark.key, false);
  }, [lit, placed, visit]);

  // THE CLOZE GAP: in view from the start, and again when its word is written in.
  const gapInView = useCallback(
    (instant: boolean) => {
      const text = textRef.current;
      const element = gap === null ? null : text?.querySelector<HTMLElement>(`[data-gap="${gap}"]`);
      if (!text || !element) return;
      const base = text.getBoundingClientRect();
      const r = element.getBoundingClientRect();
      bring(r.top - base.top, r.bottom - base.top, instant);
    },
    [bring, gap],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => gapInView(true), 80);
    return () => window.clearTimeout(timer);
  }, [gapInView]);
  useEffect(() => {
    if (!answerUp) return;
    setOpen(true);
    const timer = window.setTimeout(() => gapInView(false), 60);
    return () => window.clearTimeout(timer);
  }, [answerUp, gapInView]);

  // The flash lasts as long as its animation (board.css, `pp-arrive`).
  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setArrived(null), 1700);
    return () => window.clearTimeout(timer);
  }, [arrived]);

  /** The pair under the pointer: a marked run of words, or a flag. */
  const pairAt = (target: EventTarget | null): number | null => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-k], [data-flag]") : null;
    if (!element) return null;
    const keys = (element.dataset.k ?? element.dataset.flag ?? "").split(" ");
    for (const key of keys) {
      const number = placed.find((one) => one.mark.key === key)?.mark.number;
      if (number != null) return number;
    }
    return null;
  };

  const litKeys = new Set(placed.filter((one) => lit !== null && one.mark.number === lit).map((one) => one.mark.key));
  const numberOf = new Map(placed.map((one) => [one.mark.key, one.mark.number]));
  const cuts = new Set<number>();
  for (const one of placed) {
    cuts.add(one.start);
    cuts.add(one.end);
  }
  // A note's room goes at the end of the word its words end in (after any stop or comma): an
  // empty box is a place a line may break, and one before a full stop would push the stop
  // onto a line of its own.
  const roomAt = (end: number) => {
    let at = end;
    while (at < body.length && !/\s/.test(body.charAt(at)) && !GAP_START.test(body.slice(at, at + 2))) at += 1;
    return at;
  };
  const notesAt = new Map<number, string[]>();
  for (const one of noted) {
    const at = roomAt(one.end);
    cuts.add(at);
    notesAt.set(at, [...(notesAt.get(at) ?? []), one.mark.key]);
  }

  /** The empty boxes after a run of words that make room for its notes under the line. */
  const roomsAt = (at: number): ReactNode[] =>
    (notesAt.get(at) ?? []).map((key) => (
      <span
        key={`room-${key}`}
        className="pp-room"
        data-room={key}
        style={{ "--room": `${rooms[key] ?? 0}px` } as CSSProperties}
      />
    ));

  const keysOver = (from: number, to: number) =>
    placed.filter((one) => one.start < to && one.end > from).map((one) => one.mark.key);

  const renderToken = (token: Token, index: number): ReactNode[] => {
    const out: ReactNode[] = [];
    if (token.kind === "gap") {
      const end = token.start + token.raw.length;
      const keys = keysOver(token.start, end);
      const current = token.n === gap;
      const filled = current && answerUp && Boolean(answerText);
      out.push(
        <span
          key={`gap-${index}`}
          className={`pp-gap${current ? " current" : ""}${filled ? " filled" : ""}`}
          data-gap={token.n}
          data-k={keys.length ? keys.join(" ") : undefined}
          aria-label={filled ? `gap ${token.n}: ${answerText}` : `gap ${token.n}`}
        >
          <span className="pp-gap-n">{token.n}</span>
          {filled ? (
            <span className="pp-gap-word">
              <span className="pp-gap-ink">{answerText}</span>
              <span className="pp-gap-pen" aria-hidden="true">
                <svg viewBox="-9 -84 18 86" width="12" height="57">
                  <path className="pb-pen-nib" d="M-1.6 0h3.2l1.6-6.4h-6.4z" />
                  <path className="pb-pen-cone" d="M-3.2-6.2h6.4l2.2-7.6h-10.8z" />
                  <rect x="-6.5" y="-66.5" width="13" height="53.2" rx="3" fill="#f4f1f9" stroke="#cfc8dc" strokeWidth="0.8" />
                  <rect className="pb-pen-band" x="-6.5" y="-47" width="13" height="15" />
                  <rect x="-7.4" y="-82" width="14.8" height="19" rx="3.8" fill="#1b1726" />
                </svg>
              </span>
            </span>
          ) : (
            <span className="pp-gap-blank" />
          )}
        </span>,
        ...roomsAt(end),
      );
      return out;
    }
    const end = token.start + token.text.length;
    const inside = Array.from(cuts).filter((at) => at > token.start && at < end);
    const edges = [token.start, ...inside.sort((a, b) => a - b), end];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      const words = body.slice(from, to);
      const keys = keysOver(from, to);
      out.push(
        keys.length ? (
          <span
            key={`run-${index}-${from}`}
            className={`pp-run${keys.some((key) => litKeys.has(key)) ? " lit" : ""}`}
            data-k={keys.join(" ")}
          >
            {words}
          </span>
        ) : (
          <span key={`run-${index}-${from}`}>{words}</span>
        ),
        ...roomsAt(to),
      );
    }
    return out;
  };

  const arrivedKey = arrived?.key ?? null;
  const under = layout.shapes.filter((shape) => shape.kind === "highlight");
  const over = layout.shapes.filter((shape) => shape.kind !== "highlight");
  const cls = (shape: { key: string; number: number | null }) =>
    `${pairClass(shape.number)}${litKeys.has(shape.key) ? " lit" : ""}${arrivedKey === shape.key ? " arrive" : ""}`;
  const timing = (delay: number) => ({ "--delay": `${delay}s` }) as CSSProperties;

  return (
    <section className={`pp ${open ? "" : "shut"}`} aria-label="The passage">
      <div className="pp-head">
        <span className="sj-eyebrow">The passage</span>
        {title ? <strong className="pp-title">{title}</strong> : null}
        <button
          type="button"
          className="pp-toggle"
          aria-expanded={open}
          onClick={() => setOpen((now) => !now)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <div className="pp-scroll" ref={scrollRef}>
        <div
          className="pp-text"
          ref={textRef}
          onMouseOver={(event) => {
            const number = pairAt(event.target);
            if (number !== null && number !== lit) onLit(number);
          }}
          onMouseLeave={() => onLit(null)}
          onClick={(event) => {
            const number = pairAt(event.target);
            if (number !== null) onLit(number, true);
          }}
        >
          {paras.map((tokens, index) => (
            <p key={`p-${index}`}>{tokens.flatMap((token, t) => renderToken(token, index * 1000 + t))}</p>
          ))}
          <div className="pp-marks" aria-hidden="true" data-width={width}>
            {under.length ? (
              <svg className="pp-marks-svg under">
                {under.map((shape) => (
                  <g key={shape.key} className={`pp-mark highlight ${cls(shape)}`} style={timing(shape.delay)}>
                    <path d={shape.d} pathLength={1} style={{ strokeWidth: shape.width }} />
                  </g>
                ))}
              </svg>
            ) : null}
            <svg className="pp-marks-svg">
              {over.map((shape) => (
                <g key={shape.key} className={`pp-mark ${shape.kind} ${cls(shape)}`} style={timing(shape.delay)}>
                  <path d={shape.d} pathLength={1} />
                </g>
              ))}
            </svg>
            {layout.flags.map((flag) => (
              <span
                key={`flag-${flag.key}`}
                className={`pp-flag ${cls({ key: flag.key, number: flag.number })}${flag.lead ? " lead" : ""}`}
                data-flag={flag.key}
                style={{ top: flag.top, height: Math.max(6, flag.bottom - flag.top), ...timing(flag.delay) }}
                onMouseEnter={() => onLit(flag.number)}
                onClick={(event) => {
                  event.stopPropagation();
                  onLit(flag.number, true);
                }}
              >
                {flag.lead ? <b>{flag.number}</b> : null}
                <span className="pb-link-anchor" data-link-fig={flag.key} />
              </span>
            ))}
          </div>
          {/* The notes: measured where they are, then set between the lines (above). */}
          {noted.map((one) => {
            const spot = layout.notes.find((note) => note.key === one.mark.key);
            return (
              <span
                key={`note-${one.mark.key}`}
                data-note={one.mark.key}
                className={`pp-note ${cls({ key: one.mark.key, number: numberOf.get(one.mark.key) ?? null })}${
                  spot ? "" : " unplaced"
                }`}
                style={{
                  left: spot?.left ?? 0,
                  top: spot?.top ?? 0,
                  "--caret": `${Math.round(spot?.caret ?? 14)}px`,
                  ...timing(one.mark.delay),
                } as CSSProperties}
              >
                {one.mark.text}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
