/**
 * The whiteboard style's own two controls, beside the board's play controls: the sound effects
 * on or off, and how fast the lesson goes (0.85×, 1×, 1.15×). Both are the student's choice and
 * kept in localStorage, which can be missing or throw, so a read falls back to the default and
 * a write is allowed to fail. The classic style shows neither and plays at 1×.
 *
 * The speed sets the voice's playback rate (pitch kept) and scales the pen and the board's
 * animations with it, so a student who finds the maths too fast can slow the whole board down,
 * not only the talking.
 */

import { useCallback, useEffect, useState } from "react";

import { setSfxMuted } from "./sfx.js";
import "./boardTuning.css";

export const SPEEDS = [0.85, 1, 1.15] as const;
export type BoardSpeed = (typeof SPEEDS)[number];

const SFX_KEY = "sp.board.sfx";
const SPEED_KEY = "sp.board.speed";
const EVENT = "sp:board-tuning";

export interface BoardTuning {
  /** Sound effects off. */
  muted: boolean;
  speed: BoardSpeed;
}

export function readBoardTuning(): BoardTuning {
  let muted = false;
  let speed: BoardSpeed = 1;
  try {
    muted = localStorage.getItem(SFX_KEY) === "off";
    const kept = Number(localStorage.getItem(SPEED_KEY));
    speed = SPEEDS.find((one) => one === kept) ?? 1;
  } catch {
    // Storage blocked: the defaults.
  }
  return { muted, speed };
}

function writeBoardTuning(change: Partial<BoardTuning>): void {
  const next = { ...readBoardTuning(), ...change };
  try {
    localStorage.setItem(SFX_KEY, next.muted ? "off" : "on");
    localStorage.setItem(SPEED_KEY, String(next.speed));
  } catch {
    // Not kept past this page; the choice still applies now.
  }
  window.dispatchEvent(new CustomEvent<BoardTuning>(EVENT, { detail: next }));
}

/** The current choice, updated when it changes anywhere on the page. */
export function useBoardTuning(): BoardTuning & {
  setMuted: (muted: boolean) => void;
  setSpeed: (speed: BoardSpeed) => void;
} {
  const [tuning, setTuning] = useState<BoardTuning>(readBoardTuning);
  useEffect(() => {
    const changed = (event: Event) => setTuning((event as CustomEvent<BoardTuning>).detail);
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, []);
  useEffect(() => setSfxMuted(tuning.muted), [tuning.muted]);
  const setMuted = useCallback((muted: boolean) => writeBoardTuning({ muted }), []);
  const setSpeed = useCallback((speed: BoardSpeed) => writeBoardTuning({ speed }), []);
  return { ...tuning, setMuted, setSpeed };
}

/**
 * The board's CSS animations and transitions run at `rate`: marks, pops, chips, doodles. The
 * pen's own stroke (`pb-stroke`) is left alone, because the board already times it from the
 * voice at its rate, and the hand follows that.
 *
 * Applied on a short interval rather than on `animationstart`, which fires only once an
 * animation's delay has passed, and the delay (a mark's turn in its moment) is scaled too.
 */
export function useAnimationRate(root: () => Element | null, rate: number, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const apply = (to: number) => {
      const element = root();
      if (!element || typeof element.getAnimations !== "function") return;
      for (const animation of element.getAnimations({ subtree: true })) {
        const name = (animation as CSSAnimation).animationName;
        if (name === "pb-stroke") continue;
        if (animation.playbackRate !== to) animation.playbackRate = to;
      }
    };
    if (rate === 1) {
      apply(1);
      return;
    }
    apply(rate);
    const timer = window.setInterval(() => apply(rate), 80);
    return () => {
      window.clearInterval(timer);
      apply(1);
    };
  }, [active, rate, root]);
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {off ? (
        <>
          <path d="m16 9.5 5 5" />
          <path d="m21 9.5-5 5" />
        </>
      ) : (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
          <path d="M18.2 6.5a8 8 0 0 1 0 11" />
        </>
      )}
    </svg>
  );
}

/** The sound switch and the speed, drawn inside the board's control group. */
export function BoardTuningControls({
  muted,
  speed,
  setMuted,
  setSpeed,
}: BoardTuning & {
  setMuted: (muted: boolean) => void;
  setSpeed: (speed: BoardSpeed) => void;
}) {
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
  const said = speed === 1 ? "normal speed" : speed < 1 ? "slower" : "faster";
  return (
    <>
      <button
        type="button"
        className="pb-tune pb-sfx"
        title={muted ? "Sound effects off" : "Sound effects on"}
        aria-label="Sound effects"
        aria-pressed={!muted}
        onClick={() => setMuted(!muted)}
      >
        <SpeakerIcon off={muted} />
      </button>
      <button
        type="button"
        className="pb-tune pb-speed sj-mono"
        title={`Speed ${speed}× (${said}). Tap for ${next}×`}
        aria-label={`Lesson speed ${speed} times, ${said}. Tap for ${next} times`}
        onClick={() => setSpeed(next)}
      >
        {speed === 1 ? "1" : speed}×
      </button>
    </>
  );
}
