/**
 * Notifications (founder, 17 Nov 2026): everything the student has been told, newest first.
 * All or only unread; Mark all read. A tap opens one in place, with its whole message and a
 * button to where it points, and reads it (/notifications/:id opens that one, as the bell does).
 * Each can be marked unread again or deleted; every change shows at once.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { NoteGlyph } from '../Bell.js';
import { IconArrowRight, IconBell, IconCheck, IconMail, IconTrash } from '../icons.js';
import { actionWord, ago, notes, useInbox, type Notification } from '../notificationsApi.js';
import { usePageTitle, useStudent } from '../store.js';
import { Skeleton } from '../ui.js';
import './Notifications.css';

type Show = 'all' | 'unread';

export function Notifications() {
  usePageTitle('Notifications');
  const { studentId } = useStudent();
  const { noteId } = useParams();
  const navigate = useNavigate();
  const inbox = useInbox(studentId, 'page');
  const [show, setShow] = useState<Show>('all');

  // Opening one reads it.
  useEffect(() => {
    const note = inbox?.items.find((n) => n.id === noteId);
    if (note && !note.read) notes.setRead(studentId, note.id, true);
  }, [noteId, inbox, studentId]);
  // Coming from the bell, the opened one is brought into view.
  useEffect(() => {
    if (noteId) document.getElementById(`nf-${noteId}`)?.scrollIntoView({ block: 'center' });
  }, [noteId, inbox === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!inbox) {
    return (
      <div className="sj-page nf" aria-busy="true" aria-label="Loading your notifications">
        <Skeleton height={32} width={220} radius={8} />
        <Skeleton height={40} width={200} radius={10} />
        <Skeleton height={360} radius={10} />
      </div>
    );
  }

  const list = show === 'unread' ? inbox.items.filter((n) => !n.read) : inbox.items;
  const toggle = (note: Notification) =>
    navigate(note.id === noteId ? '/notifications' : `/notifications/${note.id}`, { replace: true });

  return (
    <div className="sj-page nf">
      {/* No dark header (founder, 17 Nov 2026): the counts are on the tabs. */}
      <h1 className="nf-title sj-display">Notifications</h1>

      <div className="nf-bar">
        <div className="nf-seg" role="tablist" aria-label="Which notifications">
          {(
            [
              ['all', `All ${inbox.items.length}`],
              ['unread', `Unread ${inbox.unread}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={show === value}
              className={show === value ? 'on' : undefined}
              onClick={() => setShow(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {inbox.unread ? (
          <button type="button" className="nf-textbtn" onClick={() => notes.readAll(studentId)}>
            <IconCheck size={16} /> Mark all read
          </button>
        ) : null}
      </div>

      {list.length ? (
        <ul className="nf-list sj-card">
          {list.map((note) => {
            const open = note.id === noteId;
            const action = actionWord(note.link_url);
            return (
              <li key={note.id} id={`nf-${note.id}`} className={`nf-item ${note.read ? '' : 'new'} ${open ? 'open' : ''}`}>
                <button type="button" className="nf-head" aria-expanded={open} onClick={() => toggle(note)}>
                  <NoteGlyph note={note} size={38} />
                  <span className="nf-text">
                    <b>{note.title}</b>
                    {note.body && !open ? <span className="nf-short">{note.body}</span> : null}
                    <small>
                      {note.read ? null : <i className="nf-dot" aria-hidden="true" />}
                      {ago(note.created_at)}
                      {note.read ? '' : ' · unread'}
                    </small>
                  </span>
                </button>
                <span className="nf-tools">
                  <button
                    type="button"
                    className="nf-icon"
                    title={note.read ? 'Mark as unread' : 'Mark as read'}
                    aria-label={note.read ? `Mark “${note.title}” as unread` : `Mark “${note.title}” as read`}
                    onClick={() => notes.setRead(studentId, note.id, !note.read)}
                  >
                    {note.read ? <IconMail size={16} /> : <IconCheck size={16} />}
                  </button>
                  <button
                    type="button"
                    className="nf-icon bin"
                    title="Delete"
                    aria-label={`Delete “${note.title}”`}
                    onClick={() => {
                      if (open) navigate('/notifications', { replace: true });
                      notes.remove(studentId, note.id);
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                </span>
                {open ? (
                  <div className="nf-more">
                    {note.body ? <p>{note.body}</p> : null}
                    <div className="nf-actions">
                      {action && note.link_url ? (
                        <Link to={note.link_url} className="sj-btn sm">
                          {action} <IconArrowRight size={15} />
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="nf-textbtn"
                        onClick={() => {
                          notes.setRead(studentId, note.id, false);
                          navigate('/notifications', { replace: true });
                        }}
                      >
                        Mark as unread
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="nf-empty sj-card">
          <span className="nf-empty-icon" aria-hidden="true">
            <IconBell size={22} />
          </span>
          <b className="sj-display">{show === 'unread' && inbox.items.length ? 'Nothing unread' : 'No notifications yet'}</b>
          <p>
            {show === 'unread' && inbox.items.length
              ? 'You have read everything. New reminders and rewards will show here.'
              : "We'll tell you when your streak is at risk, when you reach a milestone, and when your plan needs you."}
          </p>
          <Link to="/home" className="sj-btn sm">
            Go to today's plan <IconArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}
