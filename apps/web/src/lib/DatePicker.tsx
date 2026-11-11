/**
 * A date field that looks like the rest of the app, instead of the browser's own date input,
 * whose box ("mm / dd / yyyy") and calendar are drawn differently on every device.
 *
 * A button shows the chosen day in words ("Thu 14 May 2027"); it opens a month calendar below
 * (or above, near the bottom of the screen). Days before `min` or after `max` cannot be picked.
 * Keyboard: arrows move a day or a week, Page Up/Down a month, Home/End the week's ends, Enter
 * or Space chooses, Escape closes. The month name opens a year row and the twelve months, so a
 * day a year or two away is three taps, not a dozen arrow presses. Values are ISO days, "YYYY-MM-DD", or '' for none, just like
 * a native date input, so it drops in where one was.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import './DatePicker.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Days are counted in UTC so a clock change never moves one. */
const toDay = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5 : null;
};
const toIso = (day: number) => new Date(day * 864e5).toISOString().slice(0, 10);
const parts = (day: number) => {
  const d = new Date(day * 864e5);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7 };
};
const firstOf = (y: number, m: number) => Date.UTC(y, m, 1) / 864e5;
const addMonths = (day: number, by: number) => {
  const { y, m, d } = parts(day);
  const last = new Date(Date.UTC(y, m + by + 1, 0)).getUTCDate();
  return Date.UTC(y, m + by, Math.min(d, last)) / 864e5;
};
const todayDay = () => {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
};
const words = (day: number) =>
  new Date(day * 864e5).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  placeholder = 'Pick a day',
  invalid,
  disabled,
  className,
  clearLabel,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  /** For an optional date: a button under the calendar that empties it, with these words. */
  clearLabel?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const own = useId();
  const buttonId = id ?? own;
  const gridId = `${buttonId}-grid`;
  const chosen = toDay(value);
  const low = min ? toDay(min) : null;
  const high = max ? toDay(max) : null;
  const today = todayDay();
  const clamp = (day: number) => Math.min(high ?? Infinity, Math.max(low ?? -Infinity, day));

  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  // The day with keyboard focus; the calendar shows its month.
  const [focus, setFocus] = useState(() => clamp(chosen ?? today));
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const allowed = (day: number) => (low == null || day >= low) && (high == null || day <= high);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const openCalendar = () => {
    if (disabled) return;
    setFocus(clamp(chosen ?? today));
    setView('days');
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const box = button.current.getBoundingClientRect();
    setUpward(window.innerHeight - box.bottom < 380 && box.top > window.innerHeight - box.bottom);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep keyboard focus on the focused day as it moves.
  useEffect(() => {
    if (!open || view !== 'days') return;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, open, view]);

  const pick = (day: number) => {
    if (!allowed(day)) return;
    if (day !== chosen) onChange(toIso(day));
    close();
  };

  const { y, m } = parts(focus);
  const first = firstOf(y, m);
  const lead = parts(first).wd;
  const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, i) => first + i)];
  while (cells.length % 7) cells.push(null);
  const canBack = low == null || first > low;
  const canOn = high == null || firstOf(y, m + 1) <= high;

  // The years on offer: from the earliest allowed (or this year) for six years, within max.
  const startYear = parts(low ?? today).y;
  const endYear = Math.min(high != null ? parts(high).y : Infinity, startYear + 5);
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  const monthOpen = (year: number, month: number) =>
    (low == null || firstOf(year, month + 1) - 1 >= low) && (high == null || firstOf(year, month) <= high);
  const jump = (year: number, month: number) => {
    const day = Math.min(parts(focus).d, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    setFocus(clamp(Date.UTC(year, month, day) / 864e5));
  };

  const onKey = (event: KeyboardEvent) => {
    if (view === 'months') {
      if (event.key === 'Escape') {
        event.preventDefault();
        setView('days');
      }
      return;
    }
    const moves: Record<string, () => number> = {
      ArrowLeft: () => focus - 1,
      ArrowRight: () => focus + 1,
      ArrowUp: () => focus - 7,
      ArrowDown: () => focus + 7,
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => focus - parts(focus).wd,
      End: () => focus + (6 - parts(focus).wd),
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(focus);
    } else if (moves[event.key]) {
      event.preventDefault();
      setFocus(clamp(moves[event.key]!()));
    }
  };

  return (
    <div ref={wrap} className={cx('dp', open && 'open', invalid && 'invalid', disabled && 'disabled', className)}>
      <button
        ref={button}
        id={buttonId}
        type="button"
        className="dp-button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy ? `${labelledBy} ${buttonId}` : undefined}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? close(false) : openCalendar())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openCalendar();
          }
        }}
      >
        <svg className="dp-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className={cx('dp-value', chosen == null && 'empty')}>{chosen == null ? placeholder : words(chosen)}</span>
        <svg className="dp-chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={cx('dp-pop', upward && 'up')} role="dialog" aria-label="Choose a day" onKeyDown={onKey}>
          <div className="dp-head">
            <button
              type="button"
              className="dp-nav"
              aria-label="Previous month"
              disabled={view === 'months' || !canBack}
              onClick={() => setFocus(clamp(addMonths(focus, -1)))}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="dp-month"
              aria-live="polite"
              aria-expanded={view === 'months'}
              aria-label={view === 'months' ? 'Back to the days' : `${MONTHS[m]} ${y}: choose month and year`}
              onClick={() => setView(view === 'days' ? 'months' : 'days')}
            >
              {MONTHS[m]} <span>{y}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="dp-nav"
              aria-label="Next month"
              disabled={view === 'months' || !canOn}
              onClick={() => setFocus(clamp(addMonths(focus, 1)))}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {view === 'months' ? (
            <div className="dp-pick">
              <div className="dp-years" role="group" aria-label="Year">
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className={cx('dp-chip', year === y && 'on')}
                    aria-pressed={year === y}
                    onClick={() => jump(year, monthOpen(year, m) ? m : year === startYear ? parts(low ?? today).m : 0)}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <div className="dp-months" role="group" aria-label="Month">
                {MONTHS.map((name, month) => (
                  <button
                    key={name}
                    type="button"
                    className={cx('dp-chip', month === m && 'on')}
                    aria-pressed={month === m}
                    disabled={!monthOpen(y, month)}
                    onClick={() => {
                      jump(y, month);
                      setView('days');
                    }}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <>
          <div className="dp-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day.slice(0, 2)}</span>
            ))}
          </div>
          <div ref={grid} id={gridId} className="dp-grid" role="grid" aria-label={`${MONTHS[m]} ${y}`}>
            {cells.map((day, index) =>
              day == null ? (
                <span key={`gap-${index}`} className="dp-gap" />
              ) : (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  role="gridcell"
                  tabIndex={day === focus ? 0 : -1}
                  className={cx('dp-day', day === chosen && 'on', day === today && 'today', !allowed(day) && 'off')}
                  aria-selected={day === chosen}
                  aria-disabled={!allowed(day) || undefined}
                  aria-label={words(day)}
                  onClick={() => pick(day)}
                >
                  {parts(day).d}
                </button>
              ),
            )}
          </div>
          </>
          )}
          {clearLabel && chosen != null ? (
            <button
              type="button"
              className="dp-clear"
              onClick={() => {
                onChange('');
                close();
              }}
            >
              {clearLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
