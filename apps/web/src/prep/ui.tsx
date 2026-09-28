/**
 * The shared building blocks every page is made of. Thin on purpose: the look lives in
 * prep.css, and these only give it a name and the behaviour a component needs (a button that
 * can be a link, a dialog that traps Escape, a toast that leaves on its own).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';

import { IconArrowLeft, IconCheck } from './icons.js';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ button */

type Tone = 'primary' | 'soft' | 'dark' | 'lime' | 'ghost' | 'danger';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Renders a router link instead of a button. */
  to?: string;
  icon?: ReactNode;
  /** An icon after the label that nudges right on hover. */
  trailing?: ReactNode;
  busy?: boolean;
};

export function Button({
  tone = 'primary',
  size = 'md',
  block,
  to,
  icon,
  trailing,
  busy,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = cx(
    'sj-btn',
    tone !== 'primary' && tone,
    size !== 'md' && size,
    block && 'block',
    className,
  );
  const inner = (
    <>
      {busy ? <Spinner /> : icon}
      {children}
      {trailing ? <span className="arrow">{trailing}</span> : null}
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={classes} style={rest.style} onClick={rest.onClick as never}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || busy} {...rest}>
      {inner}
    </button>
  );
}

export function IconButton({
  label,
  children,
  small,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; small?: boolean }) {
  return (
    <button
      type="button"
      className={cx('sj-iconbtn', small && 'sm', className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="sj-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

/* ------------------------------------------------------------------ text + surfaces */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('sj-eyebrow', className)}>{children}</div>;
}

export function Badge({
  tone,
  dot,
  children,
  className,
}: {
  tone?: 'green' | 'yellow' | 'pink' | 'orange' | 'dark' | 'ghost';
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('sj-badge', tone, className)}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

export function Card({
  sticker,
  hover,
  flat,
  padLg,
  className,
  children,
  style,
  onClick,
  as = 'div',
}: {
  sticker?: true | 'pink' | 'green' | 'yellow' | 'ink';
  hover?: boolean;
  flat?: boolean;
  padLg?: boolean;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  as?: 'div' | 'section' | 'article';
}) {
  const Tag = as;
  const classes = cx(
    'sj-card',
    sticker && 'sticker',
    typeof sticker === 'string' && sticker,
    hover && 'hover',
    flat && 'flat',
    padLg && 'pad-lg',
    className,
  );
  return (
    <Tag
      className={classes}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}

export function Tile({
  tone,
  label,
  corner,
  children,
  foot,
  className,
}: {
  tone?: 'purple' | 'ink' | 'lime' | 'yellow' | 'pink' | 'lav';
  label: ReactNode;
  corner?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('sj-tile', tone, className)}>
      <div className="head">
        <Eyebrow>{label}</Eyebrow>
        {corner}
      </div>
      {children}
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ progress */

export function Track({
  value,
  max = 1,
  tone,
  thin,
  onDark,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'green' | 'pink';
  thin?: boolean;
  onDark?: boolean;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={cx('sj-track', tone, thin && 'thin', onDark && 'on-dark')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A ring meter. `value` 0..1; `color` is the fill, the rail takes the text colour. */
export function Ring({
  value,
  size = 112,
  stroke = 12,
  color = 'var(--green-400)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = 50 - stroke / 2 / (size / 100);
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // Drawn from empty, so the meter fills as the page arrives rather than appearing full.
    const id = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="sj-ring" style={{ '--size': `${size}px`, '--stroke': `${stroke / (size / 100)}px` } as CSSProperties}>
      <svg viewBox="0 0 100 100">
        <circle className="rail" cx="50" cy="50" r={r} />
        <circle
          className="fill"
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="label">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ page frame */

export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** A back link above the heading: a path, or true for history back. */
  back?: { to?: string; label: string };
}) {
  const navigate = useNavigate();
  return (
    <>
      {back ? (
        back.to ? (
          <Link className="sj-back" to={back.to}>
            <IconArrowLeft size={18} />
            {back.label}
          </Link>
        ) : (
          <button type="button" className="sj-back" onClick={() => navigate(-1)}>
            <IconArrowLeft size={18} />
            {back.label}
          </button>
        )
      ) : null}
      <header className="sj-pagehead">
        <div className="text">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="sj-display sj-h1">{title}</h1>
          {sub ? <p className="sub">{sub}</p> : null}
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </header>
    </>
  );
}

/**
 * The page's opening band: deep ink with the brand's glow and a small stack of blocks (the
 * Stackjunior mark, abstracted), carrying the page's name, one line on what it is for, its main
 * actions and, optionally, one number that matters on the right. Every main page opens with it,
 * which is what makes the app read as one place.
 */
export function PageHero({
  eyebrow,
  title,
  sub,
  actions,
  aside,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** Right-hand slot, e.g. a stat or a ring. */
  aside?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <section className="sj-hero sj-rise">
      <div className="sj-hero-art" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>
      <div className="sj-hero-body">
        {back ? (
          <Link className="sj-hero-back" to={back.to}>
            <IconArrowLeft size={16} />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="sj-hero-eyebrow">{eyebrow}</div> : null}
        <h1 className="sj-display sj-hero-title">{title}</h1>
        {sub ? <p className="sj-hero-sub">{sub}</p> : null}
        {actions ? <div className="sj-hero-actions">{actions}</div> : null}
      </div>
      {aside ? <div className="sj-hero-aside">{aside}</div> : null}
    </section>
  );
}

/**
 * A short numbered sequence ("how it works", "your path"). No boxes: each step is a big numeral,
 * a title and a line of text standing on the page under a thin rule; the current step's rule is
 * lit. Three across on a laptop, a single column on a phone. Use this everywhere steps appear.
 */
export function Steps({
  steps,
  current,
}: {
  steps: { title: ReactNode; body?: ReactNode; action?: ReactNode; note?: ReactNode }[];
  /** Index of the step the student is on; earlier ones show as done. Omit for a neutral list. */
  current?: number;
}) {
  return (
    <ol className="sj-steps" style={{ '--n': steps.length } as CSSProperties}>
      {steps.map((step, index) => {
        const state = current === undefined ? '' : index < current ? 'done' : index === current ? 'now' : 'later';
        return (
          <li key={index} className={cx('sj-step', state)}>
            <div className="sj-step-top">
              <span className="num">{String(index + 1).padStart(2, '0')}</span>
              {state === 'done' ? (
                <span className="flag done">
                  <IconCheck size={14} /> Done
                </span>
              ) : state === 'now' ? (
                <span className="flag now">You are here</span>
              ) : null}
            </div>
            <h3 className="sj-step-title">{step.title}</h3>
            {step.body ? <p className="sj-step-body">{step.body}</p> : null}
            {step.action || step.note ? (
              <div className="sj-step-foot">{step.action ?? <span className="sj-step-note">{step.note}</span>}</div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ height = 20, width = '100%', radius }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="sj-skel" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sj-empty">
      <div className="head">
        <div className="art">{icon}</div>
        <h3 className="sj-h3">{title}</h3>
      </div>
      {children ? <p className="sj-muted" style={{ maxWidth: '52ch' }}>{children}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sj">
      <div className="sj-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="sj-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={box}>
          {icon ? <div className="sj-spark" style={{ marginBottom: 18 }}>{icon}</div> : null}
          <h2 id={titleId} className="sj-display sj-h2">
            {title}
          </h2>
          {children ? <div style={{ marginTop: 10, color: 'var(--gray-600)' }}>{children}</div> : null}
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ toast */

interface ToastItem {
  id: number;
  text: string;
}
const ToastContext = createContext<(text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string) => {
    const id = next.current++;
    setItems((current) => [...current.slice(-2), { id, text }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="sj-toasts" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="sj-toast">
            <IconCheck size={18} />
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------------------------------------------ motion */

/** A number that counts up to its value when it first appears (and when the value changes). */
export function CountUp({
  value,
  decimals = 0,
  duration = 900,
  suffix = '',
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return (
    <>
      {shown.toFixed(decimals)}
      {suffix}
    </>
  );
}

/**
 * A card that leans toward the pointer: a few degrees of tilt and a moving highlight. For the
 * one hero card on a page, not for lists. Does nothing on touch screens or with reduced motion.
 */
export function Tilt({ children, className, max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== 'mouse') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div ref={ref} className={cx('sj-tilt', className)} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  );
}

/** True while the viewport is at most `px` wide. */
export function useNarrow(px = 860): boolean {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const on = () => setNarrow(list.matches);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

/* ------------------------------------------------------------------ little helpers */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SP';
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export { cx };
