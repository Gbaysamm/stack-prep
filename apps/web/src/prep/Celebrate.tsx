/**
 * A short reward when the student finishes something (founder, 17 Nov 2026: "a nice animation
 * that adds to the dopamine", as Brilliant does at the end of a lesson). Confetti in the brand
 * colours falls, a lime tick pops in on a sticker card, then it goes on by itself; a tap skips it.
 * With reduced motion asked for, the card shows still and nothing falls.
 */

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconArrowRight, IconCheck } from './icons.js';
import './Celebrate.css';

const COLOURS = ['#6b0bff', '#85de4c', '#ffd84a', '#fe7698', '#d7bdff', '#00aa0f'];
const PIECES = 46;
/** How long the moment lasts before it goes on by itself. */
const HOLD_MS = 2600;

export function Celebrate({
  title,
  sub,
  next,
  onDone,
}: {
  title: string;
  sub?: ReactNode;
  /** What tapping on (or waiting) leads to, said on the button. */
  next: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return createPortal(
    <div className="sj">
      <div className="cb-scrim" role="dialog" aria-modal="true" aria-label={title} onClick={onDone}>
        <div className="cb-confetti" aria-hidden="true">
          {Array.from({ length: PIECES }, (_, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${(i * 37) % 100}%`,
                  '--d': `${(i % 7) * 0.08}s`,
                  '--t': `${1.6 + (i % 5) * 0.25}s`,
                  '--r': `${(i * 53) % 360}deg`,
                  '--drift': `${((i % 9) - 4) * 14}px`,
                  background: COLOURS[i % COLOURS.length],
                } as CSSProperties
              }
              className={i % 3 === 0 ? 'round' : undefined}
            />
          ))}
        </div>
        <div className="cb-card">
          <span className="cb-tick">
            <IconCheck size={34} />
          </span>
          <b className="sj-display">{title}</b>
          {sub ? <span className="cb-sub">{sub}</span> : null}
          <button type="button" className="cb-next" onClick={onDone}>
            {next} <IconArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
