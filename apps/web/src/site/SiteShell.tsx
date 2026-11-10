/**
 * The public site's frame: a header with the pages and the way in, and a footer. Signed-out
 * visitors see "Log in" and "Start free"; a signed-in student sees "Open the app" instead.
 * The pages themselves are in this folder; routes are in prep/PrepApp.tsx.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { IconArrowUp, IconClose, IconMenu } from '../prep/icons.js';
import { useIdentity } from '../prep/store.js';
import { supportApi, type PublicSettings } from '../prep/supportApi.js';
import './site.css';
import './depth.css';

export { LOG_IN, SIGN_UP } from './showcase.js';
import { LOG_IN, SIGN_UP } from './showcase.js';

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

/**
 * A page's opening band, in the app's own look (its dark page heroes): an eyebrow, the title,
 * a line under it, and something to look at on the right. Full width; the page goes on below
 * it on the light paper, so no dark card ever sits straight under it.
 */
export function SiteHero({
  eyebrow,
  title,
  sub,
  art,
  children,
  tall = false,
}: {
  /** More room at the bottom, for a card that overlaps the band's edge (Contact). */
  tall?: boolean;
  eyebrow: string;
  title: ReactNode;
  sub: ReactNode;
  art?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`ps-hero-band ${art ? 'with-art' : ''} ${tall ? 'tall' : ''}`}>
      <div className="ld-hero-sky" aria-hidden="true">
        <span className="a" />
        <span className="b" />
      </div>
      <div className="ps-hero-band-in">
        <div className="ps-hero-band-text">
          <span className="ld-kicker">
            <i /> {eyebrow}
          </span>
          <h1 className="sj-display">{title}</h1>
          <p>{sub}</p>
          {children}
        </div>
        {art ? <div className="ps-hero-band-art">{art}</div> : null}
      </div>
    </section>
  );
}

/** `hero` runs the full width above the page; `bare` hands the whole width to the page. */
export function SiteShell({ children, hero, bare = false }: { children: ReactNode; hero?: ReactNode; bare?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const settings = useSiteSettings();
  useEffect(() => {
    setMenu(false);
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <div className="ps">
      {/* A floating bar of dark glass over the top of each page's hero (every public page opens
          on one). It goes a little more solid once the page has scrolled. */}
      <header className={`ps-header ${scrolled ? 'scrolled' : ''} ${menu ? 'open' : ''}`}>
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
            {menu ? <IconClose size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
        {menu ? (
          <div className="ps-sheet">
            <nav aria-label="Pages">
              {PAGES.map((page) => (
                <NavLink key={page.to} to={page.to} className={({ isActive }) => (isActive ? 'on' : undefined)}>
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

      <main id="main" className={bare ? 'ps-bare' : 'ps-page'}>
        {hero}
        {bare ? children : <div className="ps-main">{children}</div>}
      </main>

      <footer className="ps-footer">
        <div className="ps-footer-in">
          <div className="ps-footer-top">
            <div className="ps-footer-brand">
              <Brand />
              <p>Real UTME past questions, a score you can trust, and a coach that teaches the step you missed.</p>
              <div className="ps-footer-wayin">
                <WayIn />
              </div>
            </div>
            <nav className="ps-footer-cols" aria-label="Footer">
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
            </nav>
          </div>
          <div className="ps-footer-base">
            <span>© {new Date().getFullYear()} Stack Prep by StackJunior</span>
            <button type="button" className="ps-totop" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Back to top <IconArrowUp size={14} />
            </button>
          </div>
        </div>
        <div className="ps-footer-mark" aria-hidden="true">
          Stack Prep
        </div>
      </footer>
    </div>
  );
}
