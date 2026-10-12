/**
 * The mock exam's scientific calculator: a panel over the question, like the one in JAMB's CBT.
 * On a laptop it floats beside the paper and can be dragged by its title bar; on a phone it is a
 * sheet along the bottom. The arithmetic is in calc.ts; this is only the keys and the display.
 *
 * Typing works while the panel has focus, and its key presses stop here, so a digit typed into
 * the calculator never answers the question underneath.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';

import { IconClose } from '../icons.js';
import { display, initialCalc, press, type CalcState, type Key } from './calc.js';

interface Pad {
  key: Key;
  label?: string;
  tone?: 'fn' | 'op' | 'num' | 'eq' | 'clear' | 'mem';
  wide?: boolean;
  title?: string;
}

const PADS: Pad[] = [
  { key: 'DRG', tone: 'mem', title: 'Switch degrees and radians' },
  { key: 'MC', tone: 'mem', title: 'Memory clear' },
  { key: 'MR', tone: 'mem', title: 'Memory recall' },
  { key: 'M+', tone: 'mem', title: 'Add to memory' },
  { key: 'M−', tone: 'mem', title: 'Subtract from memory' },
  { key: 'AC', tone: 'clear', title: 'All clear' },

  { key: 'sin', tone: 'fn' },
  { key: 'cos', tone: 'fn' },
  { key: 'tan', tone: 'fn' },
  { key: 'log', tone: 'fn', title: 'Logarithm, base 10' },
  { key: 'ln', tone: 'fn', title: 'Natural logarithm' },
  { key: 'C', tone: 'clear', title: 'Clear entry' },

  { key: 'sin⁻¹', tone: 'fn' },
  { key: 'cos⁻¹', tone: 'fn' },
  { key: 'tan⁻¹', tone: 'fn' },
  { key: '10ˣ', tone: 'fn' },
  { key: 'eˣ', tone: 'fn' },
  { key: 'DEL', label: '⌫', tone: 'clear', title: 'Backspace' },

  { key: 'x²', tone: 'fn' },
  { key: 'x³', tone: 'fn' },
  { key: 'xʸ', tone: 'fn', title: 'Power' },
  { key: '√', tone: 'fn', title: 'Square root' },
  { key: '∛', tone: 'fn', title: 'Cube root' },
  { key: 'ʸ√x', tone: 'fn', title: 'y-th root: type y, then this, then x' },

  { key: '1/x', tone: 'fn' },
  { key: 'n!', tone: 'fn', title: 'Factorial' },
  { key: 'nPr', tone: 'fn', title: 'Permutations: n, nPr, r' },
  { key: 'nCr', tone: 'fn', title: 'Combinations: n, nCr, r' },
  { key: 'π', tone: 'fn' },
  { key: 'e', tone: 'fn' },

  { key: '7', tone: 'num' },
  { key: '8', tone: 'num' },
  { key: '9', tone: 'num' },
  { key: '(', tone: 'op' },
  { key: ')', tone: 'op' },
  { key: '÷', tone: 'op' },

  { key: '4', tone: 'num' },
  { key: '5', tone: 'num' },
  { key: '6', tone: 'num' },
  { key: '%', tone: 'op' },
  { key: 'EXP', label: '×10ˣ', tone: 'op', title: 'EXP: times ten to the power' },
  { key: '×', tone: 'op' },

  { key: '1', tone: 'num' },
  { key: '2', tone: 'num' },
  { key: '3', tone: 'num' },
  { key: '±', tone: 'op', title: 'Change sign' },
  { key: 'Ans', tone: 'op', title: 'Last answer' },
  { key: '−', tone: 'op' },

  { key: '0', tone: 'num', wide: true },
  { key: '.', tone: 'num' },
  { key: '=', tone: 'eq', wide: true },
  { key: '+', tone: 'op' },
];

/** The physical keyboard, while the calculator has focus. */
function keyFor(event: ReactKeyboardEvent): Key | null {
  const k = event.key;
  if (/^[0-9]$/.test(k)) return k as Key;
  const map: Record<string, Key> = {
    '.': '.',
    ',': '.',
    '+': '+',
    '-': '−',
    '*': '×',
    x: '×',
    '/': '÷',
    '^': 'xʸ',
    '(': '(',
    ')': ')',
    '%': '%',
    '!': 'n!',
    Enter: '=',
    '=': '=',
    Backspace: 'DEL',
    Delete: 'AC',
    s: 'sin',
    c: 'cos',
    t: 'tan',
    l: 'log',
    n: 'ln',
    r: '√',
    p: 'π',
    e: 'e',
    E: 'EXP',
    a: 'Ans',
  };
  return map[k] ?? null;
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CalcState>(initialCalc);
  const [lit, setLit] = useState<Key | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  const hit = (key: Key) => {
    setState((current) => press(current, key));
    setLit(key);
    window.setTimeout(() => setLit((now) => (now === key ? null : now)), 120);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Nothing typed here reaches the exam's own shortcuts.
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    const key = keyFor(event);
    if (key) {
      event.preventDefault();
      hit(key);
    }
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if (window.matchMedia('(max-width: 860px)').matches) return;
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    setOffset({ x: from.ox + event.clientX - from.x, y: from.oy + event.clientY - from.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const expression = display(state.tokens);
  return (
    <div
      ref={panel}
      className="mx-calc"
      role="dialog"
      aria-label="Calculator"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ '--dx': `${offset.x}px`, '--dy': `${offset.y}px` } as CSSProperties}
    >
      <div
        className="mx-calc-head"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <strong>Calculator</strong>
        <span className="mx-calc-mode sj-mono" aria-label={state.angle === 'deg' ? 'Degrees' : 'Radians'}>
          {state.angle.toUpperCase()}
        </span>
        {state.memory !== 0 ? <span className="mx-calc-mode sj-mono">M</span> : null}
        <button type="button" className="mx-calc-close" aria-label="Close calculator" onClick={onClose}>
          <IconClose size={18} />
        </button>
      </div>
      <div className="mx-calc-screen" aria-live="polite">
        <div className="mx-calc-expr sj-mono">{expression || ' '}</div>
        <div className={`mx-calc-out sj-mono ${state.error ? 'error' : ''}`}>
          {state.done || state.error ? state.output : expression ? ' ' : state.output}
        </div>
      </div>
      <div className="mx-calc-keys">
        {PADS.map((pad) => (
          <button
            key={pad.key}
            type="button"
            className={`mx-key ${pad.tone ?? 'num'} ${pad.wide ? 'wide' : ''} ${lit === pad.key ? 'lit' : ''}`}
            title={pad.title}
            aria-label={pad.title ?? pad.label ?? pad.key}
            onClick={() => hit(pad.key)}
            // Keep focus on the panel, so the keyboard keeps working after a click.
            onMouseDown={(event) => event.preventDefault()}
          >
            {pad.key === 'DRG' ? (state.angle === 'deg' ? 'DEG' : 'RAD') : (pad.label ?? pad.key)}
          </button>
        ))}
      </div>
    </div>
  );
}
