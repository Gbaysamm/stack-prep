/**
 * A button that opens and closes a panel under it, for "More detail" and the FAQ. A real button
 * with aria-expanded and aria-controls; the panel slides open on a grid row (0fr → 1fr), which
 * the app's reduced-motion rule turns into an instant change. A closed panel is
 * visibility: hidden, so what is inside it is out of the tab order and hidden from readers.
 */

import { useId, type ReactNode } from 'react';

import { IconChevronDown } from '../icons.js';
import { cx } from '../ui.js';

export function Disclosure({
  open,
  onToggle,
  summary,
  children,
  className,
  as: Heading,
}: {
  open: boolean;
  onToggle: () => void;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  /** Wrap the button in a heading, for an FAQ question. */
  as?: 'h3';
}) {
  const id = useId();
  const button = (
    <button type="button" className="hx-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span className="hx-toggle-text">{summary}</span>
      <span className="hx-chev" aria-hidden="true">
        <IconChevronDown size={18} />
      </span>
    </button>
  );
  return (
    <div className={cx('hx-disc', open && 'open', className)}>
      {Heading ? <Heading className="hx-disc-h">{button}</Heading> : button}
      <div className="hx-panel" id={id}>
        <div className="hx-panel-in">{children}</div>
      </div>
    </div>
  );
}
