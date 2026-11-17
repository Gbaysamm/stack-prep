/**
 * The bell in the top bar (founder, 17 Nov 2026): the latest five notifications, newest first.
 * A count while some are unread. A tap on one opens it on the Notifications page (and reads it);
 * the bin deletes it at once; Mark all read clears the count. Past five, a full-width button
 * leads to them all.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { IconBell, IconCalendar, IconChart, IconClose, IconFlame, IconTrash, IconTrophy } from './icons.js';
import { ago, notes, useInbox, type Notification } from './notificationsApi.js';
import './Bell.css';

/** How many the bell shows before "See all notifications". */
const IN_BELL = 5;

export function NoteGlyph({ note, size = 34 }: { note: Pick<Notification, 'category'>; size?: number }) {
  const Icon =
    note.category === 'reward'
      ? IconTrophy
      : note.category === 'plan'
        ? IconCalendar
        : note.category === 'report'
          ? IconChart
          : IconFlame;
  return (
    <span className={`bl-glyph ${note.category}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size / 2)} />
    </span>
  );
}

export function Bell({ studentId }: { studentId: string }) {
  const { pathname } = useLocation();
  const inbox = useInbox(studentId, pathname);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const unread = inbox?.unread ?? 0;
  const shown = inbox?.items.slice(0, IN_BELL) ?? [];
  const total = inbox?.total ?? 0;
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="bl" ref={box}>
      <button
        type="button"
        className={`bl-btn ${open ? 'open' : ''}`}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((now) => !now)}
      >
        <IconBell size={20} />
        {unread ? <span className="bl-count">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="bl-panel" role="dialog" aria-labelledby="bl-title">
          <div className="bl-head">
            <b id="bl-title" className="sj-display">
              Notifications
            </b>
            {unread ? (
              <button type="button" className="bl-textbtn" onClick={() => notes.readAll(studentId)}>
                Mark all read
              </button>
            ) : null}
            <button type="button" className="bl-close" onClick={() => setOpen(false)} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
          {shown.length ? (
            <ul className="bl-list">
              {shown.map((note) => (
                <li key={note.id} className={`bl-item ${note.read ? '' : 'new'}`}>
                  <button type="button" className="bl-open" onClick={() => go(`/notifications/${note.id}`)}>
                    <NoteGlyph note={note} />
                    <span className="bl-text">
                      <b>{note.title}</b>
                      {note.body ? <span>{note.body}</span> : null}
                      <small>
                        {note.read ? null : <i className="bl-dot" aria-hidden="true" />}
                        {ago(note.created_at)}
                        {note.read ? null : <span className="bl-sr"> · unread</span>}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="bl-bin"
                    aria-label={`Delete “${note.title}”`}
                    title="Delete"
                    onClick={() => notes.remove(studentId, note.id)}
                  >
                    <IconTrash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="bl-empty">
              <span className="bl-glyph nudge" aria-hidden="true">
                <IconBell size={18} />
              </span>
              <b>{inbox ? 'Nothing yet' : 'Loading…'}</b>
              {inbox ? (
                <span>We'll tell you when your streak is at risk, when you reach a milestone, and when your plan needs you.</span>
              ) : null}
            </div>
          )}
          {total > IN_BELL ? (
            <button type="button" className="bl-all" onClick={() => go('/notifications')}>
              See all notifications ({total})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
