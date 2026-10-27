/**
 * The frame both staff dashboards share: a dark sidebar of sections on a wide screen, a top bar
 * with a menu drawer on a phone, and the signed-in person with a way out at the foot.
 *
 * An admin also sees links across to the other dashboard and the student app; a reviewer sees
 * none, because they may open nothing else.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStaff } from './StaffGate.js';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** A small count beside the label (open reports, say); hidden at zero. */
  count?: number;
  end?: boolean;
}

export function StaffShell({
  title,
  nav,
  children,
}: {
  title: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const { user, signOut } = useStaff();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const sidebar = (
    <>
      <div className="st-side-brand">
        <span className="st-logo" aria-hidden="true">S</span>
        <span>
          Stack Prep <small>{title}</small>
        </span>
      </div>
      <nav className="st-nav" aria-label={title}>
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <span className="st-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="st-nav-label">{item.label}</span>
            {item.count ? <span className="st-nav-count">{item.count}</span> : null}
          </NavLink>
        ))}
      </nav>
      {user.role === 'admin' && (
        <div className="st-switch">
          <span className="st-switch-label">Switch to</span>
          {title !== 'Admin' && <a href="/admin">Admin dashboard</a>}
          {title !== 'Reviewer' && <a href="/review">Reviewer dashboard</a>}
          <a href="/home">Student app</a>
        </div>
      )}
      <div className="st-me">
        <span className="st-avatar" aria-hidden="true">
          {user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="st-me-text">
          <strong>{user.display_name}</strong>
          <small>{user.role === 'admin' ? 'Admin' : 'Reviewer'}</small>
        </span>
        <button type="button" className="st-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="st-shell">
      <aside className="st-sidebar">{sidebar}</aside>
      <header className="st-topbar">
        <button type="button" className="st-menubtn" aria-label="Open menu" onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <span className="st-topbar-title">{title}</span>
      </header>
      {open && (
        <div className="st-drawer" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="st-drawer-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="st-sidebar st-drawer-panel">{sidebar}</aside>
        </div>
      )}
      <main className="st-main">{children}</main>
    </div>
  );
}

/** A page's heading row: its name, a line about it, and its actions on the right. */
export function StaffPageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="st-pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="st-pagehead-actions">{actions}</div>}
    </div>
  );
}
