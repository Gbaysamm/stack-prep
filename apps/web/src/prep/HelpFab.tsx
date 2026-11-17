/**
 * The help button, bottom right on every page (founder, 17 Nov 2026): a tap opens a panel just
 * above it, like a chat window, to write to the team at once wherever the student is. Sending
 * opens the conversation; earlier ones are a tap away on Messages. Not shown on Messages itself.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { IconArrowRight, IconClose, IconMail } from './icons.js';
import { WriteForm } from './pages/Support.js';
import { useToast } from './ui.js';
import './HelpFab.css';

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { pathname } = useLocation();
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes it; so does a tap anywhere outside the panel and the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest('.hf-btn') && !target.closest('[role="listbox"]')) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  if (pathname.startsWith('/messages') || pathname.startsWith('/help/messages')) return null;

  // Drawn at the top of the document, never inside the page's layout, so opening it can never
  // widen or shift the page (founder, 17 Nov 2026).
  return createPortal(
    <div className="sj hf-root">
      {/* On a phone the page dims behind the sheet; a tap on it closes the sheet. */}
      {open ? <div className="hf-scrim" aria-hidden="true" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div ref={panel} className="hf-panel" role="dialog" aria-modal="false" aria-labelledby="hf-title">
          <span className="hf-handle" aria-hidden="true" />
          <div className="hf-head">
            <span className="hf-icon" aria-hidden="true">
              <IconMail size={18} />
            </span>
            <span className="hf-titles">
              <b id="hf-title" className="sj-display">
                Write to us
              </b>
              <small>A person replies, usually within a day.</small>
            </span>
            <button type="button" className="hf-close" onClick={() => setOpen(false)} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
          <WriteForm
            compact
            onSent={(id) => {
              setOpen(false);
              toast('Sent. We will reply in Messages.');
              navigate(`/messages/${id}`);
            }}
          />
          <button
            type="button"
            className="hf-all"
            onClick={() => {
              setOpen(false);
              navigate('/messages');
            }}
          >
            See your conversations <IconArrowRight size={14} />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`hf-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((now) => !now)}
        aria-label={open ? 'Close' : 'Write to us'}
        aria-expanded={open}
        title="Write to us"
      >
        {open ? <IconClose size={22} /> : <IconMail size={22} />}
      </button>
    </div>,
    document.body,
  );
}
