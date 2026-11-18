/**
 * The phone's More (founder, 18 Nov 2026): the fifth tab of the bottom bar opens this sheet from
 * the bottom, in place of the hamburger and its side drawer, so the top of the phone holds only
 * the page. It opens on the student (avatar, name, level and XP, streak), then the study pages as
 * coloured tiles, then the account pages as a list, and Sign out.
 */
import { useEffect, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

import { useGame } from './gameApi.js';
import {
  IconBook,
  IconBookmark,
  IconChart,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconClose,
  IconFlame,
  IconHelp,
  IconLayers,
  IconLogout,
  IconMail,
  IconSettings,
  IconSparkles,
  IconTarget,
} from './icons.js';
import { useIdentity } from './store.js';
import './MoreSheet.css';

type Page = { to: string; label: string; icon: ComponentType<{ size?: number }>; tone?: string };

/** The study pages the four tabs leave out: tiles, each in its own colour. */
const STUDY: Page[] = [
  { to: '/checkup', label: 'Check-up', icon: IconTarget, tone: 'lime' },
  { to: '/mock', label: 'Mock exam', icon: IconClock, tone: 'yellow' },
  { to: '/subjects', label: 'Subjects', icon: IconLayers, tone: 'purple' },
  { to: '/bookmarks', label: 'Saved', icon: IconBookmark, tone: 'pink' },
];
/** The account and help pages: a list. */
const ACCOUNT: Page[] = [
  { to: '/plans', label: 'Plans', icon: IconSparkles },
  { to: '/exams', label: 'Exams and goals', icon: IconBook },
  { to: '/messages', label: 'Messages', icon: IconMail },
  { to: '/settings', label: 'Settings', icon: IconSettings },
  { to: '/help', label: 'Help and guides', icon: IconHelp },
];

const here = (path: string, to: string) => path === to || path.startsWith(`${to}/`);

/** Whether a path is one of More's pages, so the tab shows as the current one. */
export const inMore = (path: string) =>
  [...STUDY, ...ACCOUNT, { to: '/profile' }].some((page) => here(path, page.to));

export function MoreSheet({
  open,
  onClose,
  name,
  initials,
  studentId,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  initials: string;
  studentId: string | null;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const { identity } = useIdentity();
  const game = useGame(studentId ?? '', open && studentId ? 'open' : 'closed');
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const tab = open ? 0 : -1;

  return createPortal(
    // `display: contents`: the wrapper takes no room of its own (it once added a screen of
    // empty space under every page).
    <div className="sj ms-root">
      <div className={`ms-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <section className={`ms-sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="More" aria-hidden={!open}>
        <span className="ms-handle" aria-hidden="true" />
        <div className="ms-head">
          <b className="sj-display">More</b>
          <button type="button" className="ms-close" onClick={onClose} aria-label="Close" tabIndex={tab}>
            <IconClose size={18} />
          </button>
        </div>

        <Link to="/profile" className="ms-me" onClick={onClose} tabIndex={tab}>
          <span className="ms-avatar">{initials}</span>
          <span className="ms-me-text">
            <b className="sj-display">{name}</b>
            {game ? (
              <>
                <span className="ms-me-line">
                  <span className="ms-lvl">Level {game.level}</span>
                  <span className="ms-streak">
                    <IconFlame size={13} /> {game.streak_days}
                  </span>
                </span>
                <span className="ms-xp" aria-label={`${game.level_into} of ${game.level_needs} XP to level ${game.level + 1}`}>
                  <i style={{ width: `${Math.round((100 * game.level_into) / Math.max(1, game.level_needs))}%` }} />
                </span>
              </>
            ) : (
              <span className="ms-me-line">View your profile</span>
            )}
          </span>
          <IconChevronRight size={18} className="ms-me-go" />
        </Link>

        <nav className="ms-grid" aria-label="Study">
          {STUDY.map(({ to, label, icon: Icon, tone }) => (
            <Link key={to} to={to} className={`ms-tile ${tone} ${here(pathname, to) ? 'here' : ''}`} onClick={onClose} tabIndex={tab}>
              <span className="ms-icon">
                <Icon size={20} />
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <nav className="ms-list" aria-label="Account">
          {ACCOUNT.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={here(pathname, to) ? 'here' : undefined} onClick={onClose} tabIndex={tab}>
              <Icon size={18} />
              <span>{label}</span>
              <IconChevronRight size={16} className="ms-go" />
            </Link>
          ))}
          {identity?.role === 'admin' ? (
            <>
              <a href="/admin" tabIndex={tab}>
                <IconChart size={18} />
                <span>Admin dashboard</span>
                <IconChevronRight size={16} className="ms-go" />
              </a>
              <a href="/review" tabIndex={tab}>
                <IconCheck size={18} />
                <span>Reviewer dashboard</span>
                <IconChevronRight size={16} className="ms-go" />
              </a>
            </>
          ) : null}
          <button type="button" className="ms-out" onClick={onSignOut} tabIndex={tab}>
            <IconLogout size={18} />
            <span>Sign out</span>
          </button>
        </nav>
      </section>
    </div>,
    document.body,
  );
}
