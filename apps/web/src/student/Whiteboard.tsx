/**
 * THE WHITEBOARD STYLE (boardPrefs.ts, docs/lesson-style-guide.md): the lesson board as the
 * explainer videos look, kept beside the classic board rather than replacing it, so the two can
 * be compared. Everything here is only mounted when the student has chosen it; the classic board
 * renders none of it.
 *
 * - The style switch in the board's header (`BoardStyleSwitch`), for both styles.
 * - Section headings (`SectionHeading`): a moment's `section:` starts a titled part of the
 *   working, a purple chip over a hand-drawn rule.
 * - The answer's sparkle (`Sparkle`).
 * - The life of the board (`WhiteboardFx`): the hand-drawn shimmer ("line boil") on every
 *   finished mark, doodle and diagram, and values riding their arrows (`travel`).
 *
 * The look itself (handwriting, the paper, room to breathe, the colours, the pops) is
 * whiteboard.css, all of it under `.pb.wb`.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import type { LessonPoint } from "./api.js";
import { useBoardPrefs, writeBoardPrefs, type BoardStyle, type BoardVoice } from "./boardPrefs.js";
import { arrowHead, bezierAt, drawStroke, seeded, setDelays, stillMotion, through, type Pt } from "./ink.js";
import "./whiteboard.css";

/* ---- The handwriting --------------------------------------------------------------------- */

const HAND_FONT_URL = "https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap";

/** Patrick Hand, fetched the first time the whiteboard is shown, never for the classic board. */
function useHandFont(): void {
  useEffect(() => {
    if (document.querySelector(`link[data-wb-font]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HAND_FONT_URL;
    link.dataset.wbFont = "";
    document.head.appendChild(link);
  }, []);
}

/* ---- The switch -------------------------------------------------------------------------- */

function Segmented<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onPick: (value: T) => void;
}) {
  return (
    <div className="wb-seg-row">
      <span className="wb-seg-label" id={`wb-seg-${label}`}>
        {label}
      </span>
      <div className="wb-seg" role="radiogroup" aria-labelledby={`wb-seg-${label}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "on" : ""}
            onClick={() => onPick(option.value)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Board style": a small button in the board's header that opens two segmented toggles, the
 * board's look (Classic | Whiteboard) and its voice (Studio | Kokoro). Folded into one button so
 * the header keeps its room on a phone.
 */
export function BoardStyleSwitch() {
  const prefs = useBoardPrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="wb-switch" ref={rootRef}>
      <button
        type="button"
        className={`wb-switch-btn${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Board style"
        title="Board style"
        onClick={() => setOpen((was) => !was)}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            d="M4 18.5c3.2-.4 4.6-2.3 6.5-5.8 1.5-2.8 3.3-6 6.6-6.9M15.6 4.4l3.8.9-1 3.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M3.5 21h17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
        <span className="wb-switch-text">{prefs.style === "whiteboard" ? "Whiteboard" : "Classic"}</span>
      </button>
      {open ? (
        <div className="wb-switch-pop" id={panelId} role="dialog" aria-label="Board style">
          <Segmented<BoardStyle>
            label="Style"
            value={prefs.style}
            options={[
              { value: "classic", text: "Classic" },
              { value: "whiteboard", text: "Whiteboard" },
            ]}
            onPick={(style) => writeBoardPrefs({ style })}
          />
          <Segmented<BoardVoice>
            label="Voice"
            value={prefs.voice}
            options={[
              { value: "studio", text: "Studio" },
              { value: "kokoro", text: "Kokoro" },
            ]}
            onPick={(voice) => writeBoardPrefs({ voice })}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ---- Sections and the answer's sparkle --------------------------------------------------- */

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A section's heading: a purple chip, and a rule drawn by hand across the board after it. */
export function SectionHeading({ text }: { text: string }) {
  const d = drawStroke([2, 6], [598, 6], seeded(hashOf(text)), 2.2);
  return (
    <div className="wb-section" role="heading" aria-level={3}>
      <span className="wb-section-chip">{text}</span>
      <svg className="wb-section-rule" viewBox="0 0 600 12" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} pathLength={1} />
      </svg>
    </div>
  );
}

/** A burst of hand-drawn rays round the answer: the "ta-da" (SternHost's Sparkle). */
export function Sparkle({ className = "" }: { className?: string }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const reach = i % 2 === 0 ? 1 : 0.62;
    const rnd = seeded(i * 97 + 11);
    const from: Pt = [50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20];
    const to: Pt = [50 + Math.cos(a) * 46 * reach, 50 + Math.sin(a) * 46 * reach];
    return { d: drawStroke(from, to, rnd, 0.5), i };
  });
  return (
    <svg className={`wb-sparkle ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      {rays.map((ray) => (
        <path
          key={ray.i}
          d={ray.d}
          pathLength={1}
          className={ray.i % 2 === 0 ? "long" : "short"}
          style={{ animationDelay: `${120 + ray.i * 35}ms` }}
        />
      ))}
    </svg>
  );
}

/* ---- Line boil --------------------------------------------------------------------------- */

/** How often the hand-drawn shimmer steps: about every four frames, as in the videos. */
const BOIL_MS = 130;
/** How far a point of a finished mark may wander, in screen pixels. */
const BOIL_PX = 0.7;

/** The marks that boil: every finished stroke over the working, a diagram, the passage. */
const BOILING =
  ".pb-marks-svg .pb-mark path, .pb-figmarks .pb-mark path, .pp-marks-svg .pp-mark path, .pb-links path.pb-link-line, .wb-section-rule path";

/** Only absolute moves, lines and curves are wobbled: anything with arcs or flags is left be. */
const WOBBLY = /^[\sMLCQSTZ0-9.,eE+-]+$/;

interface Boiled {
  base: string;
  variants: string[];
  set: string;
}

const boiled = new WeakMap<SVGPathElement, Boiled>();
const variantCache = new Map<string, string[]>();

function wobble(d: string, seed: number, amount: number): string {
  const rnd = seeded(seed);
  return d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (number) =>
    (parseFloat(number) + (rnd() - 0.5) * 2 * amount).toFixed(1),
  );
}

/** Three seeded wobbles of a path, made once and kept. */
function variantsOf(d: string, amount: number): string[] {
  const key = `${amount.toFixed(3)}|${d}`;
  let found = variantCache.get(key);
  if (!found) {
    if (variantCache.size > 600) variantCache.clear();
    const seed = hashOf(d);
    found = [0, 1, 2].map((step) => wobble(d, seed + step * 7919, amount));
    variantCache.set(key, found);
  }
  return found;
}

function boilPaths(stage: HTMLElement, step: number): void {
  const view = { w: window.innerWidth, h: window.innerHeight };
  stage.querySelectorAll<SVGPathElement>(BOILING).forEach((path) => {
    const now = path.getAttribute("d");
    if (!now) return;
    let state = boiled.get(path);
    if (!state || now !== state.set) {
      // New, or redrawn by the board since it last boiled: what it has now is its true shape.
      if (!WOBBLY.test(now)) return;
      state = { base: now, variants: [], set: now };
      boiled.set(path, state);
    }
    const box = path.getBoundingClientRect();
    if (box.bottom < 0 || box.top > view.h || box.right < 0 || box.left > view.w) return;
    if (state.variants.length === 0) {
      const m = path.getScreenCTM();
      const scale = m ? Math.max(0.05, Math.hypot(m.a, m.b)) : 1;
      state.variants = variantsOf(state.base, BOIL_PX / scale);
    }
    const next = state.variants[step] ?? state.base;
    path.setAttribute("d", next);
    state.set = next;
  });
}

/** Put every boiled mark back to its true shape (the style switched back to classic). */
function settlePaths(stage: HTMLElement): void {
  stage.querySelectorAll<SVGPathElement>(BOILING).forEach((path) => {
    const state = boiled.get(path);
    if (state && path.getAttribute("d") === state.set) path.setAttribute("d", state.base);
    boiled.delete(path);
  });
}

/**
 * The shimmer: three wobbles of every finished mark cycled every BOIL_MS, and the doodles and
 * diagrams through three seeded turbulence filters cycled on the same beat (whiteboard.css,
 * `[data-boil]`). Frozen while the lesson is paused, when the student has asked for less
 * movement, and while the page is hidden; only marks in view are touched.
 */
function useBoil(stageRef: RefObject<HTMLElement>, paused: boolean): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || paused || stillMotion()) return;
    let step = Number(stage.dataset.boil ?? 0) || 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      step = (step + 1) % 3;
      stage.dataset.boil = String(step);
      boilPaths(stage, step);
    }, BOIL_MS);
    return () => window.clearInterval(timer);
  }, [paused, stageRef]);
  useEffect(() => {
    const stage = stageRef.current;
    return () => {
      if (!stage) return;
      delete stage.dataset.boil;
      settlePaths(stage);
    };
  }, [stageRef]);
}

/** The filters the doodles and diagrams boil through, one per step, and a still rough one. */
function BoilFilters() {
  return (
    <svg className="wb-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {[0, 1, 2].map((step) => (
          <filter key={step} id={`wb-boil-${step}`} x="-4%" y="-4%" width="108%" height="108%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed={step * 13 + 3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
        <filter id="wb-rough" x="-4%" y="-20%" width="108%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="1" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/* ---- Values that travel ------------------------------------------------------------------ */

interface LiveSet {
  index: number;
  points: LessonPoint[];
  state: string;
  /** When each mark starts, as the board plays them (ink.ts, `planMarks`). */
  delays?: number[];
}

/** How long a value takes to ride its arrow. */
const RIDE_MS = 1150;
/** How long the board looks for the arrow it rides before giving up on the ride: a line across
 * to a doodle or a diagram is only drawn once both its ends are up, which can be a while. */
const FIND_MS = 12000;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A point on a path, on the screen. */
function onScreen(path: SVGPathElement, s: number): Pt | null {
  const m = path.getScreenCTM();
  if (!m) return null;
  const p = path.getPointAtLength(s);
  const q = new DOMPoint(p.x, p.y).matrixTransform(m);
  return [q.x, q.y];
}

/**
 * The arrow a travel rides: of the arrows drawn of its kind, the one with an end on (or nearest)
 * the line it lands in. Returned with which way to ride it: towards the line.
 */
function findArrow(
  stage: HTMLElement,
  point: LessonPoint,
  index: number,
): { path: SVGPathElement; reverse: boolean } | null {
  const target = point.line == null ? index : point.line < 0 ? index + point.line : point.line;
  const line = stage.querySelector<HTMLElement>(`[data-line="${target}"]`);
  if (!line) return null;
  const box = line.getBoundingClientRect();
  const selector = point.from
    ? ".pb-marks-svg .pb-mark.arrow .pb-mark-line"
    : ".pb-links path.pb-link-line";
  let best: { path: SVGPathElement; reverse: boolean; gap: number } | null = null;
  stage.querySelectorAll<SVGPathElement>(selector).forEach((path) => {
    let total = 0;
    try {
      total = path.getTotalLength();
    } catch {
      return;
    }
    if (total < 12) return;
    const a = onScreen(path, 0);
    const b = onScreen(path, total);
    if (!a || !b) return;
    const gap = (p: Pt) =>
      Math.hypot(
        Math.max(box.left - p[0], 0, p[0] - box.right),
        Math.max(box.top - p[1], 0, p[1] - box.bottom),
      );
    const ga = gap(a);
    const gb = gap(b);
    const near = Math.min(ga, gb);
    if (near > 48 || (best && near >= best.gap)) return;
    best = { path, reverse: ga < gb, gap: near };
  });
  return best;
}

/** The way a value rides: where it is `q` of the way along, on the screen. */
interface Way {
  at: (q: number) => Pt | null;
  alive: () => boolean;
  /** It has arrived: a way drawn of its own puts its head on. */
  land: () => void;
  remove: () => void;
}

/** Along an arrow the board has drawn, towards its line. */
function pathWay(path: SVGPathElement, reverse: boolean): Way {
  return {
    at: (q) => {
      let total = 0;
      try {
        total = path.getTotalLength();
      } catch {
        return null;
      }
      return onScreen(path, reverse ? total * (1 - q) : total * q);
    },
    alive: () => path.isConnected,
    land: () => undefined,
    remove: () => undefined,
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function centre(element: Element): Pt {
  const r = element.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/**
 * From a doodle or a diagram to the working: between the anchors the board puts at the two ends
 * of a pair (`data-link-fig` or `data-link-doodle`, and `data-link-work`, by the mark's key), a
 * curve bowed up over the board, drawn by hand in blue behind the chip as it rides.
 */
function anchorWay(stage: HTMLElement, layer: HTMLElement, key: string): Way | null {
  const work = stage.querySelector(`[data-link-work="${key}"]`);
  const from = stage.querySelector(`[data-link-fig="${key}"], [data-link-doodle="${key}"]`);
  if (!work || !from) return null;
  const curve = (): [Pt, Pt, Pt, Pt] => {
    const a = centre(from);
    const b = centre(work);
    const lift = Math.min(90, 30 + Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.12);
    const c1: Pt = [a[0] + (b[0] - a[0]) * 0.25, Math.min(a[1], b[1]) - lift];
    const c2: Pt = [b[0] + (a[0] - b[0]) * 0.2, b[1] - lift * 0.6];
    return [a, c1, c2, b];
  };
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "wb-travel-way");
  const line = document.createElementNS(SVG_NS, "path");
  const head = document.createElementNS(SVG_NS, "path");
  svg.append(line, head);
  layer.appendChild(svg);
  const wobble = seeded(key.length * 31 + key.charCodeAt(0));
  const jitter = Array.from({ length: 17 }, () => (wobble() - 0.5) * 1.6);
  let reached = 0;
  let landed = false;
  const draw = () => {
    const [a, c1, c2, b] = curve();
    const points: Pt[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const p = bezierAt(a, c1, c2, b, (i / 16) * reached);
      points.push([p[0] + jitter[i]!, p[1] + jitter[16 - i]!]);
    }
    line.setAttribute("d", through(points));
    if (landed) head.setAttribute("d", arrowHead(b, bezierAt(a, c1, c2, b, 0.9), 11));
  };
  return {
    at: (q) => {
      reached = Math.max(reached, q);
      const [a, c1, c2, b] = curve();
      draw();
      return bezierAt(a, c1, c2, b, q);
    },
    alive: () => work.isConnected && from.isConnected,
    land: () => {
      landed = true;
      svg.classList.add("landed");
      draw();
    },
    remove: () => svg.remove(),
  };
}

/**
 * WHERE THE NUMBER CAME FROM. Each travel's value goes up on a chip at the far end of the arrow
 * it stands for (travel.ts), springs out, rides the arrow into its line as the arrow is drawn,
 * and lands with a little bounce before it fades: the line keeps the value, the arrow stays as
 * the memory of where it came from. Paused, a chip stops where it is.
 */
function useTravels(
  stageRef: RefObject<HTMLElement>,
  layerRef: RefObject<HTMLDivElement>,
  sets: LiveSet[],
  paused: boolean,
): void {
  const started = useRef(new Set<string>());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rides = useRef(new Set<() => void>());
  useEffect(() => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer || stillMotion()) return;
    const newest = Math.max(-1, ...sets.map((set) => set.index));
    for (const set of sets) {
      if (set.state !== "live" || set.index !== newest) continue;
      const delays = setDelays(set);
      set.points.forEach((point, k) => {
        if (!point.travel || point.line == null) return;
        const key = `${set.index}-${k}`;
        if (started.current.has(key)) return;
        started.current.add(key);
        ride(stage, layer, point, set.index, key, (delays[k] ?? 0) * 1000 + 120);
      });
    }

    function ride(
      stage: HTMLElement,
      layer: HTMLElement,
      point: LessonPoint,
      index: number,
      key: string,
      wait: number,
    ) {
      // A clock that only runs while the lesson does.
      let clock = 0;
      let last = performance.now();
      let frame = 0;
      let way: Way | null = null;
      let chip: HTMLSpanElement | null = null;
      let phase: "wait" | "find" | "ride" | "land" = "wait";
      let phaseAt = 0;
      const stop = () => {
        cancelAnimationFrame(frame);
        chip?.remove();
        way?.remove();
        rides.current.delete(stop);
      };
      rides.current.add(stop);
      const place = (p: Pt) => {
        if (chip) chip.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
      };
      const tick = (now: number) => {
        if (!pausedRef.current) clock += Math.min(64, now - last);
        last = now;
        frame = requestAnimationFrame(tick);
        if (phase === "wait") {
          if (clock < wait) return;
          phase = "find";
          phaseAt = clock;
        }
        if (phase === "find") {
          // From another line: along the arrow the board drew. From a doodle or a diagram: a
          // way of its own between the two ends the board pairs (its anchors), drawn as it goes.
          if (point.from) {
            const arrow = findArrow(stage, point, index);
            way = arrow ? pathWay(arrow.path, arrow.reverse) : null;
          } else {
            way = anchorWay(stage, layer, key);
          }
          if (!way) {
            if (clock - phaseAt > FIND_MS) stop();
            return;
          }
          chip = document.createElement("span");
          chip.className = "wb-travel";
          const inner = document.createElement("span");
          inner.className = "wb-travel-chip";
          inner.textContent = point.travel ?? "";
          chip.appendChild(inner);
          layer.appendChild(chip);
          phase = "ride";
          phaseAt = clock;
        }
        if (!way || !chip) return;
        if (!way.alive()) {
          stop();
          return;
        }
        if (phase === "ride") {
          const t = Math.min(1, (clock - phaseAt) / RIDE_MS);
          const p = way.at(easeInOut(t));
          if (p) place(p);
          if (t >= 1) {
            phase = "land";
            phaseAt = clock;
            chip.classList.add("landed");
            way.land();
          }
          return;
        }
        // Landed: it stays on the end of the way (which may scroll) until it has faded.
        const p = way.at(1);
        if (p) place(p);
        if (clock - phaseAt > 1500) stop();
      };
      frame = requestAnimationFrame(tick);
    }
  }, [layerRef, sets, stageRef]);
  useEffect(() => {
    const all = rides.current;
    return () => all.forEach((stop) => stop());
  }, []);
}

/* ---- Everything alive, together ---------------------------------------------------------- */

/**
 * The whiteboard's life, mounted inside the board's stage: the boil, its filters, the travelling
 * values, and the handwriting font. `sets` is the marks up on the board, as the board draws them.
 */
export function WhiteboardFx({
  stageRef,
  paused,
  sets,
}: {
  stageRef: RefObject<HTMLElement>;
  paused: boolean;
  sets: LiveSet[];
}) {
  useHandFont();
  useBoil(stageRef, paused);
  const layerRef = useRef<HTMLDivElement>(null);
  useTravels(stageRef, layerRef, sets, paused);
  return (
    <>
      <BoilFilters />
      <div className={`wb-travels${paused ? " paused" : ""}`} ref={layerRef} aria-hidden="true" />
    </>
  );
}
