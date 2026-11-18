/**
 * The reward moment when the student finishes something (founder, 17-18 Nov 2026: "as Brilliant
 * and Duolingo do"; the first version was too flat). A sequence, each beat showing something
 * gained:
 *
 *   1. the card springs in (overshoots, settles);
 *   2. the badge pops and its tick draws itself; light turns slowly behind it;
 *   3. confetti bursts out of the badge with real motion (speed, gravity, spin, drag);
 *   4. the gains count up one after another (XP, accuracy, the streak);
 *   5. the day's ring fills to its new value, and pulses when the day is complete;
 *   6. the button rises last; the badge keeps floating while it waits.
 *
 * It waits for the student (a tap anywhere first finishes the sequence, then continues). With
 * reduced motion asked for, everything shows at once and nothing flies.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconArrowRight, IconFlame, IconSpark, IconTarget } from './icons.js';
import './Celebrate.css';

const COLOURS = ['#6b0bff', '#85de4c', '#ffd84a', '#fe7698', '#b789ff', '#00aa0f'];

export interface Gain {
  label: string;
  value: number;
  /** Shown before and after the number: "+" and " XP", or "%". */
  prefix?: string;
  suffix?: string;
  kind: 'xp' | 'accuracy' | 'streak';
}

export interface DayRing {
  /** Done before this, and done now, out of `of`. */
  from: number;
  to: number;
  of: number;
  label: string;
}

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up from 0 once `start` is true. */
function CountUp({ value, start, ms = 750 }: { value: number; start: boolean; ms?: number }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (!start || reduced()) {
      if (start) setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, value, ms]);
  return <>{shown.toLocaleString()}</>;
}

/** Confetti thrown out of a point, drawn on a canvas so each piece moves on its own. */
function Burst({ origin, fire }: { origin: { x: number; y: number } | null; fire: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!fire || !origin || !el || reduced()) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = window.innerWidth * ratio;
    el.height = window.innerHeight * ratio;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const pieces = Array.from({ length: 110 }, (_, i) => {
      // Mostly up and out, a fan above the badge, with a few low ones for fullness.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = 7 + Math.random() * 10;
      return {
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 6 + Math.random() * 6,
        spin: (Math.random() - 0.5) * 0.4,
        turn: Math.random() * Math.PI,
        round: i % 4 === 0,
        colour: COLOURS[i % COLOURS.length]!,
        wobble: Math.random() * 10,
      };
    });
    const began = performance.now();
    const LIFE = 2600;
    let frame = 0;
    const draw = (now: number) => {
      const age = now - began;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const fade = age > LIFE - 600 ? Math.max(0, (LIFE - age) / 600) : 1;
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin((age / 180) + p.wobble) * 0.6;
        p.y += p.vy;
        p.turn += p.spin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.turn);
        ctx.fillStyle = p.colour;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // A strip that flips as it turns: its height follows the spin.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.turn * 2)) + 1);
        }
        ctx.restore();
      }
      if (age < LIFE) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [fire, origin]);
  return <canvas ref={canvas} className="cb-burst" aria-hidden="true" />;
}

const GAIN_ICON = { xp: IconSpark, accuracy: IconTarget, streak: IconFlame } as const;

export function Celebrate({
  title,
  sub,
  next,
  onDone,
  gains = [],
  ring,
}: {
  title: string;
  sub?: ReactNode;
  /** What the button says; tapping it (or anywhere, once the sequence is done) goes on. */
  next: string;
  onDone: () => void;
  /** What was earned, counted up one after another. */
  gains?: Gain[];
  /** The day's progress, filling from `from` to `to`. */
  ring?: DayRing;
}) {
  const still = reduced();
  // The beat the sequence has reached: 0 card, 1 badge, 2 burst, 3 title, 4.. gains, then ring, then button.
  const last = 4 + gains.length + (ring ? 1 : 0);
  const [beat, setBeat] = useState(still ? last : 0);
  const badge = useRef<HTMLSpanElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (still) return;
    // The timing of each beat after the card appears, in milliseconds.
    const at = [0, 160, 380, 560, ...gains.map((_, i) => 760 + i * 280)];
    if (ring) at.push(760 + gains.length * 280 + 120);
    at.push((at[at.length - 1] ?? 760) + 360);
    const timers = at.map((ms, i) => window.setTimeout(() => setBeat((now) => Math.max(now, i)), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [still, gains, ring]);

  useEffect(() => {
    if (beat >= 2 && !origin && badge.current) {
      const box = badge.current.getBoundingClientRect();
      setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    }
  }, [beat, origin]);

  const finished = beat >= last;
  const tap = () => (finished ? onDone() : setBeat(last));
  const ringShare = ring ? Math.min(1, (beat >= 4 + gains.length ? ring.to : ring.from) / Math.max(1, ring.of)) : 0;
  const ringDone = Boolean(ring && ring.to >= ring.of && beat >= 4 + gains.length);
  const C = 2 * Math.PI * 36;

  return createPortal(
    <div className="sj">
      <div className={`cb-scrim ${still ? 'still' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={tap}>
        <Burst origin={origin} fire={beat >= 2} />
        <div className={`cb-card ${beat >= 0 ? 'in' : ''}`}>
          <div className="cb-top">
            <span className="cb-rays" aria-hidden="true" />
            <span ref={badge} className={`cb-badge ${beat >= 1 ? 'pop' : ''}`}>
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <path className={`cb-tick ${beat >= 1 ? 'draw' : ''}`} d="M11 21 l6 6 l12 -14" />
              </svg>
            </span>
          </div>
          <div className={`cb-words ${beat >= 3 ? 'in' : ''}`}>
            <b className="sj-display">{title}</b>
            {sub ? <span className="cb-sub">{sub}</span> : null}
          </div>
          {gains.length ? (
            <div className="cb-gains">
              {gains.map((gain, i) => {
                const Icon = GAIN_ICON[gain.kind];
                const shown = beat >= 4 + i;
                return (
                  <div key={gain.label} className={`cb-gain ${gain.kind} ${shown ? 'in' : ''}`}>
                    <span className="cb-gain-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="cb-gain-value">
                      {gain.prefix}
                      <CountUp value={gain.value} start={shown} />
                      {gain.suffix}
                    </span>
                    <span className="cb-gain-label">{gain.label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {ring ? (
            <div className={`cb-ring ${beat >= 4 + gains.length ? 'in' : ''} ${ringDone ? 'done' : ''}`}>
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle className="cb-ring-track" cx="40" cy="40" r="36" />
                <circle
                  className="cb-ring-fill"
                  cx="40"
                  cy="40"
                  r="36"
                  style={{ strokeDasharray: C, strokeDashoffset: C * (1 - ringShare) }}
                />
              </svg>
              <span className="cb-ring-text">
                <b>
                  {beat >= 4 + gains.length ? ring.to : ring.from}/{ring.of}
                </b>
                <small>{ring.label}</small>
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className={`cb-next ${finished ? 'in' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onDone();
            }}
          >
            {next} <IconArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
