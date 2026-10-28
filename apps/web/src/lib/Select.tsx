/**
 * A dropdown that looks like the rest of the app, instead of the browser's own <select>, whose
 * button and list are drawn differently on every device and never line up with our inputs.
 *
 * A button shows the chosen option; it opens a list below (or above, near the bottom of the
 * screen). Keyboard: Up/Down move, Home/End jump, Enter or Space chooses, Escape closes, and
 * typing jumps to the option that starts with what was typed. A long list (more than ten) gets
 * a search box. Give it an `id` and a <label htmlFor> works as it would with a <select>.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './Select.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** A second, quieter line under the label. */
  hint?: string;
  disabled?: boolean;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  id,
  placeholder = 'Choose…',
  disabled,
  size = 'md',
  className,
  searchable,
  'aria-label': ariaLabel,
  icon,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** "sm" matches the small buttons in tables and staff pages. */
  size?: 'sm' | 'md';
  className?: string;
  /** A search box at the top of the list; on by default for more than ten options. */
  searchable?: boolean;
  'aria-label'?: string;
  icon?: ReactNode;
}) {
  const own = useId();
  const buttonId = id ?? own;
  const listId = `${buttonId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const withSearch = searchable ?? options.length > 10;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const chosen = options.find((option) => option.value === value);

  const close = (focus = true) => {
    setOpen(false);
    setQuery('');
    if (focus) button.current?.focus();
  };

  const openList = () => {
    if (disabled) return;
    const at = Math.max(0, options.findIndex((option) => option.value === value));
    setActive(at);
    setOpen(true);
  };

  // Below the button, unless there's more room above it.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const box = button.current.getBoundingClientRect();
    setUpward(window.innerHeight - box.bottom < 280 && box.top > window.innerHeight - box.bottom);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (withSearch) search.current?.focus();
    else list.current?.focus();
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (option: SelectOption<T> | undefined) => {
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  const step = (from: number, by: number) => {
    let next = from;
    for (let i = 0; i < shown.length; i += 1) {
      next = Math.min(shown.length - 1, Math.max(0, next + by));
      if (!shown[next]?.disabled) return next;
    }
    return from;
  };

  const onListKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((n) => step(n, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((n) => step(n, -1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(step(-1, 1));
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(step(shown.length, -1));
    } else if (event.key === 'Enter' || (event.key === ' ' && !withSearch)) {
      event.preventDefault();
      pick(shown[active]);
    } else if (event.key === 'Tab') {
      close(false);
    } else if (!withSearch && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      // Type-ahead: jump to the first option starting with what was typed in the last second.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 1000 ? typed.current.text : '') + event.key.toLowerCase(), at: now };
      const found = shown.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
      if (found >= 0) setActive(found);
    }
  };

  return (
    <div ref={wrap} className={cx('sx', `sx-${size}`, open && 'open', disabled && 'disabled', className)}>
      <button
        ref={button}
        id={buttonId}
        type="button"
        className="sx-button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !open) {
            event.preventDefault();
            openList();
          }
        }}
      >
        {icon ? <span className="sx-icon">{icon}</span> : null}
        <span className={cx('sx-value', !chosen && 'empty')}>{chosen ? chosen.label : placeholder}</span>
        <svg className="sx-chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={cx('sx-pop', upward && 'up')} onKeyDown={onListKey}>
          {withSearch ? (
            <input
              ref={search}
              className="sx-search"
              value={query}
              placeholder="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          ) : null}
          <ul
            ref={list}
            id={listId}
            className="sx-list"
            role="listbox"
            tabIndex={-1}
            aria-labelledby={ariaLabel ? undefined : buttonId}
            aria-label={ariaLabel}
            aria-activedescendant={!withSearch && shown[active] ? `${listId}-${active}` : undefined}
          >
            {shown.length === 0 ? <li className="sx-none">Nothing matches “{query}”.</li> : null}
            {shown.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={cx('sx-option', index === active && 'active', option.value === value && 'on', option.disabled && 'off')}
                onMouseMove={() => !option.disabled && setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
              >
                <span className="sx-option-text">
                  <span>{option.label}</span>
                  {option.hint ? <small>{option.hint}</small> : null}
                </span>
                {option.value === value ? (
                  <svg className="sx-tick" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
