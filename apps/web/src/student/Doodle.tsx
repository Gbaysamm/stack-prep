/**
 * A DOODLE: a small hand-drawn picture on the board that says something the words cannot say as
 * quickly — a snake with a huge bulge in its belly for "eats big meals", a calendar marked
 * "1–2×" for "seldom", a corrugated roof on a little house for "corrugated".
 *
 * DRAWN FROM SCRATCH, BY THE PEN, like a whiteboard explainer: every outline traced with the
 * nib riding it, every fill coloured in by the nib scribbling across it, every word written
 * left to right — nothing fades in, and nothing appears without the pen there (drawIn.ts, the
 * same routine that draws a question's figure). The caption under it is written the same way.
 *
 * THEN IT COMES ALIVE. Groups marked `data-anim` move once the drawing is finished: a gentle
 * bob, blinking eyes, a wiggle, a pulse, a sway, a slow spin, a brief shake, a pop. A tap (or
 * a hover, with a mouse) makes it react: a squash-and-stretch bounce, and the one-shot move
 * its `data-react` names. A student who would rather nothing moved gets it drawn at once and
 * still; a paused lesson pauses it.
 *
 * NOTHING IN IT RUNS OR FETCHES. The markup is parsed and copied element by element into a
 * fresh SVG, keeping only the shapes the art is drawn with and the attributes that place and
 * colour them (`sanitiseDoodle`): no script, no link, no handler, no style, no url().
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { planDrawing, runDrawing, workingPenBusy, type DrawItem } from "./drawIn.js";
import { stillMotion } from "./ink.js";
import "./doodle.css";

const SVG_NS = "http://www.w3.org/2000/svg";

const KEEP_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text", "tspan",
]);
const KEEP_ATTRS = new Set([
  "viewBox", "x", "y", "dx", "dy", "d", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2",
  // A rect's size (the root's own width and height are dropped where it is drawn).
  "width", "height",
  "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-miterlimit",
  "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "letter-spacing", "data-anim", "data-origin", "data-react",
  // Doodles v2: the parts actions name, a route to move along, a level to fill.
  "data-part", "data-path", "data-fill", "data-level",
]);
export const ANIMS = new Set(["bob", "blink", "wiggle", "pulse", "sway", "spin-slow", "shake", "pop"]);
export const REACTS = new Set(["wiggle", "shake", "pop"]);

/** A value that could reach out or run: a url(), a script scheme, an import, an expression. */
const UNSAFE = /url\s*\(|javascript:|data:|@import|expression\s*\(|[<>]/i;

function cleanCopy(source: Element): SVGElement | null {
  const tag = source.localName;
  if (!KEEP_TAGS.has(tag)) return null;
  const copy = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const attribute of Array.from(source.attributes)) {
    // Only bare names from the list: nothing namespaced (xlink:href), no handler, no style.
    if (attribute.prefix || !KEEP_ATTRS.has(attribute.name)) continue;
    if (UNSAFE.test(attribute.value)) continue;
    copy.setAttribute(attribute.name, attribute.value);
  }
  if (tag === "text" || tag === "tspan") {
    const spans = Array.from(source.children).filter((child) => child.localName === "tspan");
    if (spans.length === 0) copy.textContent = source.textContent;
    else
      for (const span of spans) {
        const inner = cleanCopy(span);
        if (inner) copy.appendChild(inner);
      }
    return copy;
  }
  for (const child of Array.from(source.children)) {
    const inner = cleanCopy(child);
    if (inner) copy.appendChild(inner);
  }
  return copy;
}

/** Where a group turns and scales about: its `data-origin` ("x y", in the art's units). */
function originOf(element: Element): string | null {
  const found = /^\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*$/.exec(element.getAttribute("data-origin") ?? "");
  return found ? `${found[1]}px ${found[2]}px` : null;
}

/**
 * Wrap an element in a group that carries a move, so the move composes with whatever the
 * element's own `transform` already does rather than replacing it.
 */
function wrap(element: Element, className: string, origin: string | null): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", className);
  if (origin) group.setAttribute("style", `transform-box: view-box; transform-origin: ${origin}`);
  element.parentNode?.insertBefore(group, element);
  group.appendChild(element);
  return group;
}

/**
 * The doodle's markup as a fresh, safe SVG, or null when it is not an SVG at all. Each group's
 * `data-anim` and `data-react` are carried on wrappers (`dd-a …`, `dd-r …`), which doodle.css
 * moves; the root's own `data-react` is returned for the whole picture.
 */
export function sanitiseDoodle(markup: string): { svg: SVGSVGElement; react: string | null } | null {
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  } catch {
    return null;
  }
  const source = parsed.documentElement;
  if (!source || source.localName !== "svg" || parsed.querySelector("parsererror")) return null;
  const svg = cleanCopy(source) as SVGSVGElement | null;
  if (!svg) return null;
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 120 120");
  const rootReact = svg.getAttribute("data-react");
  for (const name of ["data-anim", "data-react", "data-origin"]) svg.removeAttribute(name);
  for (const element of Array.from(svg.querySelectorAll("[data-anim], [data-react]"))) {
    const origin = originOf(element);
    const anims = (element.getAttribute("data-anim") ?? "").split(/\s+/).filter((a) => ANIMS.has(a));
    const react = element.getAttribute("data-react")?.trim() ?? "";
    for (const name of ["data-anim", "data-react", "data-origin"]) element.removeAttribute(name);
    let outer: Element = element;
    for (const anim of anims) outer = wrap(outer, `dd-a dd-a-${anim}`, origin);
    if (REACTS.has(react)) wrap(outer, `dd-r dd-r-${react}`, origin);
  }
  return { svg, react: rootReact && REACTS.has(rootReact.trim()) ? rootReact.trim() : null };
}

/** Doodles already drawn this visit, by key: shown again, they are not drawn a second time. */
export const drawnOnce = new Set<string>();

/** The marker as it draws a doodle: the figure's pen (board.css), smaller. */
export function DoodlePen({ penRef, lift = "1" }: { penRef: RefObject<HTMLDivElement>; lift?: string }) {
  return (
    <div ref={penRef} className="pb-figpen dd-pen" aria-hidden="true" data-lift={lift}>
      <div className="pb-figpen-body">
        <svg viewBox="-9 -84 18 86" width="18" height="86">
          <path className="pb-pen-nib" d="M-1.6 0h3.2l1.6-6.4h-6.4z" />
          <path className="pb-pen-cone" d="M-3.2-6.2h6.4l2.2-7.6h-10.8z" />
          <rect x="-6.5" y="-66.5" width="13" height="53.2" rx="3" fill="#f4f1f9" stroke="#cfc8dc" strokeWidth="0.8" />
          <rect className="pb-pen-band" x="-6.5" y="-47" width="13" height="15" />
          <rect x="-7.4" y="-82" width="14.8" height="19" rx="3.8" fill="#1b1726" />
        </svg>
      </div>
    </div>
  );
}

/** The caption, written left to right under the picture with the nib riding its end. */
export function captionItem(element: HTMLElement): DrawItem {
  const chars = Math.max(1, (element.textContent ?? "").length);
  element.style.clipPath = "inset(-0.3em 100% -0.3em -0.3em)";
  return {
    kind: "text",
    ms: 150 + chars * 55,
    show: (p) => {
      element.style.clipPath = `inset(-0.3em ${((1 - p) * 100).toFixed(2)}% -0.3em -0.3em)`;
    },
    tip: (p) => {
      const box = element.getBoundingClientRect();
      const lift = Math.abs(Math.sin(p * chars * Math.PI)) * box.height * 0.18;
      return [box.left + box.width * p, box.top + box.height * 0.78 - lift];
    },
    finish: () => {
      element.style.clipPath = "";
    },
  };
}

export function Doodle({
  svg,
  alt,
  size,
  caption,
  paused = false,
  drawKey,
  instant = false,
  className = "",
  style,
  bump = 0,
  onTap,
  onDrawn,
  parkPen = false,
}: {
  /** The picture, in the board's art format. */
  svg: string;
  alt: string;
  /** Its width and height on the screen, in pixels. */
  size: number;
  /** A few words written under it, in the handwriting font. */
  caption?: string | null;
  paused?: boolean;
  /** Names this drawing, so one drawn already this visit is not drawn again. */
  drawKey: string;
  /** Show it drawn, with no pen (a buddy changing face). */
  instant?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Changed by the caller to make it react, as a tap would. */
  bump?: number;
  onTap?: () => void;
  onDrawn?: () => void;
  /** While the drawing waits, the pen waits just above it rather than on it (the buddy). */
  parkPen?: boolean;
}) {
  const artRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const finished = useRef(onDrawn);
  finished.current = onDrawn;
  const [alive, setAlive] = useState(() => instant || stillMotion() || drawnOnce.has(drawKey));
  const [react, setReact] = useState<string | null>(null);

  // The picture goes in cleaned, and is drawn by the pen unless it is already on the board.
  useLayoutEffect(() => {
    const host = artRef.current;
    if (!host) return;
    const clean = sanitiseDoodle(svg);
    if (!clean) {
      host.replaceChildren();
      setAlive(true);
      return;
    }
    clean.svg.setAttribute("class", "dd-svg");
    clean.svg.setAttribute("aria-hidden", "true");
    clean.svg.removeAttribute("width");
    clean.svg.removeAttribute("height");
    host.replaceChildren(clean.svg);
    setReact(clean.react);
    if (instant || stillMotion() || drawnOnce.has(drawKey)) {
      setAlive(true);
      finished.current?.();
      return;
    }
    setAlive(false);
    const items = planDrawing(
      clean.svg,
      Array.from(clean.svg.querySelectorAll<SVGGraphicsElement>("path, line, polyline, polygon, circle, ellipse, rect, text")),
    );
    if (captionRef.current) items.push(captionItem(captionRef.current));
    const stop = runDrawing({
      items,
      host: rootRef.current ?? host,
      pen: penRef.current,
      paused: () => pausedRef.current,
      hold: workingPenBusy,
      park: parkPen
        ? () => {
            const box = rootRef.current?.getBoundingClientRect();
            // Its nib above the top left, so the barrel, leaning down and right, clears the face.
            return box ? [box.left - 6, box.top - 46] : null;
          }
        : undefined,
      onDone: () => {
        drawnOnce.add(drawKey);
        setAlive(true);
        finished.current?.();
      },
    });
    return () => {
      stop();
      if (captionRef.current) captionRef.current.style.clipPath = "";
    };
    // The caption is part of the drawing; a new caption is a new drawing.
  }, [svg, drawKey, instant, caption, parkPen]);

  // A REACTION: a bounce, and the one-shot move the art asks for. Restarted on every tap.
  const [reacting, setReacting] = useState(0);
  const reactTimer = useRef(0);
  const poke = useCallback(() => {
    if (stillMotion()) return;
    window.clearTimeout(reactTimer.current);
    setReacting(0);
    // A frame with the reaction off, so the same animation can start again from its beginning.
    requestAnimationFrame(() => {
      setReacting((n) => n + 1);
      reactTimer.current = window.setTimeout(() => setReacting(0), 900);
    });
  }, []);
  useEffect(() => () => window.clearTimeout(reactTimer.current), []);
  const bumped = useRef(bump);
  useEffect(() => {
    if (bump === bumped.current) return;
    bumped.current = bump;
    if (alive) poke();
  }, [alive, bump, poke]);

  return (
    <figure
      ref={rootRef}
      className={`dd ${alive ? "alive" : "drawing"}${reacting ? " reacting" : ""} ${className}`}
      style={{ "--dd-size": `${size}px`, ...style } as CSSProperties}
      data-paused={paused ? "" : undefined}
      data-react={react ?? undefined}
      role="img"
      aria-label={caption ? `${alt} (${caption})` : alt}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && alive) poke();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (alive) poke();
        onTap?.();
      }}
    >
      <div className="dd-art" ref={artRef} />
      {caption ? (
        <figcaption className="dd-caption" ref={captionRef as RefObject<HTMLElement>}>
          {caption}
        </figcaption>
      ) : null}
      {alive ? null : <DoodlePen penRef={penRef} />}
    </figure>
  );
}
