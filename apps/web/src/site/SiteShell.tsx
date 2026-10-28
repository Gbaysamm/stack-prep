/**
 * The public site's frame: a header with the pages and the way in, and a footer. Signed-out
 * visitors see "Log in" and "Start free"; a signed-in student sees "Open the app" instead.
 * The pages themselves are in this folder; routes are in prep/PrepApp.tsx.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { IconClose, IconMenu } from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { supportApi, type PublicSettings } from '../prep/supportApi.js';
import './site.css';

export const SIGN_UP = '/?mode=signup';
export const LOG_IN = '/?mode=login';

const PAGES = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

/** The browser tab's title for a public page. */
export function useSiteTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Stack Prep` : 'Stack Prep: know your UTME score, then raise it';
  }, [title]);
}

/** The public settings (support email, WhatsApp, sign-ups open), loaded once per page. */
export function useSiteSettings(): PublicSettings | null {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => {
    supportApi
      .settings()
      .then(setSettings)
      .catch(() => undefined);
  }, []);
  return settings;
}

function Brand() {
  return (
    <Link to="/" className="ps-brand" aria-label="Stack Prep home">
      <img src="/brand/mark-96.png" alt="" width={34} height={34} />
      <span>Stack Prep</span>
    </Link>
  );
}

function WayIn({ onPick }: { onPick?: () => void }) {
  const { identity } = useIdentity();
  return identity ? (
    <Link to="/home" className="sj-btn ps-cta" onClick={onPick}>
      Open the app
    </Link>
  ) : (
    <>
      <Link to={LOG_IN} className="ps-login" onClick={onPick}>
        Log in
      </Link>
      <Link to={SIGN_UP} className="sj-btn ps-cta" onClick={onPick}>
        Start free
      </Link>
    </>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const settings = useSiteSettings();
  useEffect(() => {
    setMenu(false);
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <div className="ps">
      <header className="ps-header">
        <div className="ps-header-in">
          <Brand />
          <nav className="ps-nav" aria-label="Main">
            {PAGES.map((page) => (
              <NavLink key={page.to} to={page.to} className={({ isActive }) => (isActive ? 'on' : undefined)}>
                {page.label}
              </NavLink>
            ))}
          </nav>
          <div className="ps-wayin">
            <WayIn />
          </div>
          <button type="button" className="ps-menubtn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {menu ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
        {menu ? (
          <div className="ps-sheet">
            <nav aria-label="Pages">
              {PAGES.map((page) => (
                <NavLink key={page.to} to={page.to}>
                  {page.label}
                </NavLink>
              ))}
            </nav>
            <div className="ps-sheet-wayin">
              <WayIn onPick={() => setMenu(false)} />
            </div>
          </div>
        ) : null}
      </header>

      <main id="main" className="ps-main">
        {children}
      </main>

      <footer className="ps-footer">
        <div className="ps-footer-in">
          <div className="ps-footer-brand">
            <Brand />
            <p>Real UTME past questions, a score you can trust, and a coach that teaches the step you missed.</p>
          </div>
          <div className="ps-footer-cols">
            <div>
              <h3>Stack Prep</h3>
              <Link to="/how-it-works">How it works</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/about">About</Link>
            </div>
            <div>
              <h3>Help</h3>
              <Link to="/faq">FAQ</Link>
              <Link to="/contact">Contact us</Link>
              {settings?.support_email ? <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a> : null}
            </div>
            <div>
              <h3>The small print</h3>
              <Link to="/terms">Terms of use</Link>
              <Link to="/privacy">Privacy</Link>
            </div>
          </div>
        </div>
        <p className="ps-footer-base">© {new Date().getFullYear()} Stack Prep by StackJunior · Made for UTME candidates in Nigeria</p>
      </footer>
    </div>
  );
}
