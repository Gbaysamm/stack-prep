/**
 * The frame every page sits in.
 *
 * AppShell: a dark-glass sidebar on a laptop, a glass tab bar floating at the bottom on a phone,
 * and a glass top bar that carries the page's name on small screens. FocusShell: for a check-up,
 * a practice run and the board — no navigation at all, one slim bar with the way out.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { ClaimDialog } from "./AuthForms.js";
import {
  IconArrowLeft,
  IconBolt,
  IconBook,
  IconChart,
  IconCalendar,
  IconChevronDown,
  IconClock,
  IconClose,
  IconHelp,
  IconHome,
  IconLock,
  IconLogout,
  IconMenu,
  IconTarget,
  IconUser,
} from "./icons.js";
import {
  CountdownTip,
  countdownNote,
  countdownTo,
  plainDays,
  upcomingExams,
  useExamCountdowns,
  whenText,
} from "./countdown.js";
import { progressApi, type Overview } from "./progressApi.js";
import { StreakChip } from "./Streak.js";
import { TitleProvider, useIdentity, useLoad, useStudent } from "./store.js";
import { Dialog, Button, IconButton, initials } from "./ui.js";

const NAV = [
  { to: "/home", label: "Home", icon: IconHome },
  { to: "/practice", label: "Practice", icon: IconBolt },
  { to: "/checkup", label: "Check-up", icon: IconTarget },
  { to: "/mock", label: "Mock exam", icon: IconClock },
  { to: "/progress", label: "Progress", icon: IconChart },
  { to: "/profile", label: "Profile", icon: IconUser },
] as const;

/** Places a student goes less often than every day: under the main list, and in the phone menu. */
const MORE = [
  { to: "/exams", label: "Exams & subjects", icon: IconBook },
  { to: "/help", label: "Help & guides", icon: IconHelp },
] as const;

export function Brand({ light = true }: { light?: boolean }) {
  return (
    <Link to="/home" className="sj-brand" aria-label="Stack Prep home">
      <img src="/brand/mark-96.png" alt="" width={40} height={40} />
      <span
        className="word"
        style={light ? undefined : { color: "var(--ink-900)" }}
      >
        Stack Prep
        <small>by Stackjunior</small>
      </span>
    </Link>
  );
}

/** The sidebar's exam card: the nearest exam day, counted per exam, and the others beneath. */
function Countdown() {
  const student = useStudent();
  const exams = useExamCountdowns(student.studentId, undefined);
  const upcoming = upcomingExams(exams);
  const next = upcoming[0];
  if (!next) {
    // Still loading: an empty card of the same height would jump; draw nothing until known.
    if (exams === undefined) return null;
    return (
      <div className="sj-countdown">
        <div className="sj-navlabel" style={{ padding: 0, marginBottom: 8 }}>
          Your exam
        </div>
        <div className="what" style={{ marginTop: 0, marginBottom: 12 }}>
          Set a target and a date, and your plan counts down with you.
        </div>
        <Button to="/onboarding" tone="lime" size="sm" block>
          Set my goal
        </Button>
      </div>
    );
  }
  const days = next.days_to_next ?? 0;
  const note = countdownNote(next);
  const others = upcoming.slice(1, 3);
  return (
    <div className="sj-countdown">
      <div className="cd-head">
        <span className="sj-navlabel">Exam countdown</span>
        <CountdownTip onDark />
      </div>
      <div className="days">
        {days === 0 ? (
          "Today"
        ) : (
          <>
            {days}
            <span className="unit">{days === 1 ? "day" : "days"}</span>
          </>
        )}
      </div>
      <div className="what">{countdownTo(next)}</div>
      {note ? <div className="cd-note">{note}</div> : null}
      {others.length ? (
        <ul className="cd-others" aria-label="Your other exams">
          {others.map((exam) => (
            <li key={exam.examination_id}>
              <strong>{exam.short_name}</strong>
              <span>{whenText(exam)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The laptop top bar's left side: the nearest exam, counted per exam, and how it is counted. */
function TopContext({ overview }: { overview: Overview | undefined }) {
  const student = useStudent();
  const next = upcomingExams(useExamCountdowns(student.studentId, overview))[0];
  if (!next) return <div className="sj-topctx" />;
  const days = next.days_to_next ?? 0;
  return (
    <div className="sj-topctx">
      <Link to={`/exams/${next.examination_id}`} className="sj-topchip">
        <IconCalendar size={17} />
        <span>
          <strong>{next.short_name}</strong>
          <span className="sep">·</span>
          {next.sits_together
            ? days === 0
              ? "exam day"
              : `${plainDays(days)} to go`
            : `next ${next.next_subject_names.length > 1 ? "papers" : "paper"}: ${whenText(next)}`}
        </span>
      </Link>
      <CountdownTip className="sj-topctx-tip" />
    </div>
  );
}

function NavList({ onPick }: { onPick?: () => void }) {
  return (
    <>
      <div className="sj-navlabel">Study</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onPick}
            className={({ isActive }) =>
              `sj-navitem ${isActive ? "active" : ""}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sj-navlabel">More</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {MORE.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onPick}
            className={({ isActive }) =>
              `sj-navitem ${isActive ? "active" : ""}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/**
 * The account control in the laptop top bar: avatar, name and a chevron in one outlined pill,
 * opening a small menu. Closes on a pick, a click outside, or Escape.
 */
function ProfileMenu({
  name,
  account,
  onSignOut,
}: {
  name: string;
  /** The line under the name: their login, or that this is a device-only sandbox. */
  account: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const first = name.trim().split(/\s+/)[0] ?? name;
  return (
    <div className="sj-account" ref={box}>
      <button
        type="button"
        className={`sj-account-btn ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sj-avatar">{initials(name)}</span>
        <span className="sj-account-name">{first}</span>
        <IconChevronDown size={16} className="chev" />
      </button>
      {open ? (
        <div className="sj-account-menu" role="menu">
          <div className="sj-account-head">
            <span className="sj-avatar lg">{initials(name)}</span>
            <span>
              <strong>{name}</strong>
              <small>{account}</small>
            </span>
          </div>
          <Link to="/profile" role="menuitem" className="sj-account-item">
            <IconUser size={18} />
            Profile
          </Link>
          <Link to="/exams" role="menuitem" className="sj-account-item">
            <IconBook size={18} />
            Exams &amp; subjects
          </Link>
          <Link to="/help" role="menuitem" className="sj-account-item">
            <IconHelp size={18} />
            Help &amp; guides
          </Link>
          <button
            type="button"
            role="menuitem"
            className="sj-account-item danger"
            onClick={onSignOut}
          >
            <IconLogout size={18} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Who is signed in, at the foot of the laptop sidebar, with the way out. */
function SidebarAccount({
  name,
  onSignOut,
}: {
  name: string;
  onSignOut: () => void;
}) {
  return (
    <div className="sj-sideacct">
      <Link to="/profile" className="who">
        <span className="sj-avatar">{initials(name)}</span>
        <span>
          <strong>{name}</strong>
          <small>View profile</small>
        </span>
      </Link>
      <button
        type="button"
        className="out"
        aria-label="Sign out"
        title="Sign out"
        onClick={onSignOut}
      >
        <IconLogout size={18} />
      </button>
    </div>
  );
}

export function AppShell() {
  const student = useStudent();
  const { signOut, sandbox } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState("");
  const [claiming, setClaiming] = useState(false);
  const closeClaim = useCallback(() => setClaiming(false), []);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A student remembered on this device who no longer exists on the server (a reset test
  // database, a removed account) is signed out, rather than left on pages that cannot load.
  const check = useLoad(
    () => progressApi.overview(student.studentId),
    [student.studentId],
  );
  useEffect(() => {
    if (check.error === "unknown student") {
      void signOut().then(() => navigate("/", { replace: true }));
    } else if (check.error === "Log in to continue." || check.error === "That isn't your account.") {
      // The server wants a login for this student (or this device holds someone else's):
      // clear the stale identity and ask for one, coming back here afterwards.
      const from = location.pathname;
      void signOut().then(() => navigate("/?mode=login", { replace: true, state: { from } }));
    }
  }, [check.error, location.pathname, navigate, signOut]);

  // The phone menu closes when the student goes somewhere, or presses Escape.
  useEffect(() => setMenu(false), [location.pathname]);
  const leave = () => {
    setMenu(false);
    void signOut().then(() => navigate("/", { replace: true }));
  };
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <TitleProvider value={setTitle}>
      <div className="sj-shell">
        <div className="sj-canvas" />
        <aside className="sj-sidebar sj-glass dark" aria-label="Main">
          <Brand />
          <NavList />
          <div className="spacer" />
          <Countdown />
          <SidebarAccount name={student.displayName} onSignOut={leave} />
        </aside>

        <div className="sj-main">
          <header className={`sj-topbar ${scrolled ? "scrolled" : ""}`}>
            <div className="sj-topbar-in">
              <IconButton
                label="Menu"
                className="sj-menubtn"
                onClick={() => setMenu(true)}
                aria-expanded={menu}
              >
                <IconMenu size={20} />
              </IconButton>
              <Link
                to="/home"
                className="brandmark"
                aria-label="Stack Prep home"
                style={{ flex: "none" }}
              >
                <img src="/brand/mark-96.png" alt="" width={34} height={34} />
              </Link>
              <span className="title">{title}</span>
            <span className="sj-crumb">
              <span className="root">Stack Prep</span>
              <span className="sep" aria-hidden="true">/</span>
              <strong>{title}</strong>
            </span>
              <TopContext overview={check.data} />
              <div className="right">
                {check.data ? (
                  <StreakChip overview={check.data} studentId={student.studentId} />
                ) : null}
                <ProfileMenu
                  name={student.displayName}
                  account={
                    sandbox
                      ? "No login yet · this device only"
                      : (student.login ?? "Signed in")
                  }
                  onSignOut={leave}
                />
                <Link
                  to="/profile"
                  className="sj-avatar sj-phone-avatar"
                  aria-label={`Profile: ${student.displayName}`}
                >
                  {initials(student.displayName)}
                </Link>
              </div>
            </div>
          </header>
          {sandbox ? <SandboxBanner onCreate={() => setClaiming(true)} /> : null}
          <main id="main">
            <Outlet />
          </main>
        </div>

        {/* The phone menu: the sidebar, slid in from the left over a dimmed page. */}
        <div
          className={`sj-drawer-scrim ${menu ? "open" : ""}`}
          onClick={() => setMenu(false)}
          aria-hidden="true"
        />
        <aside
          className={`sj-drawer sj-glass dark ${menu ? "open" : ""}`}
          aria-label="Menu"
          aria-hidden={!menu}
        >
          <div className="sj-drawer-head">
            <Brand />
            <button
              type="button"
              className="sj-drawer-close"
              aria-label="Close menu"
              onClick={() => setMenu(false)}
              tabIndex={menu ? 0 : -1}
            >
              <IconClose size={20} />
            </button>
          </div>
          {menu ? <NavList onPick={() => setMenu(false)} /> : null}
          <div className="spacer" />
          {menu ? <Countdown /> : null}
          <SidebarAccount name={student.displayName} onSignOut={leave} />
        </aside>

        <ClaimDialog open={claiming} onClose={closeClaim} />

        <nav className="sj-bottomnav sj-glass dark" aria-label="Main">
          {/* Five tabs fit a phone; the mock exam is in the menu there. */}
          {NAV.filter(({ to }) => to !== "/mock").map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `sj-tab ${to === "/practice" ? "main" : ""} ${isActive ? "active" : ""}`
              }
            >
              <span className="pip">
                <Icon size={20} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </TitleProvider>
  );
}

/**
 * For a student with no login yet: their progress lives only on this device. A slim note above
 * every page, with the way to fix it; it goes the moment they create a login.
 */
export function SandboxBanner({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="auth-bannerwrap">
      <aside className="auth-banner" aria-label="Save your progress">
        <span className="auth-banner-icon" aria-hidden="true">
          <IconLock size={18} />
        </span>
        <p className="auth-banner-text">
          <strong>Your progress lives only on this device.</strong>
          <span className="more"> Create a login to use it anywhere.</span>
        </p>
        <Button size="sm" onClick={onCreate}>
          Create login
        </Button>
      </aside>
    </div>
  );
}

/**
 * A page with no navigation: the student is doing one thing. `exitTo` is where the close button
 * goes; when `confirmExit` is set, leaving asks first.
 */
export function FocusShell({
  eyebrow,
  title,
  exitTo,
  confirmExit,
  progress,
  right,
  children,
  backInstead,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  exitTo: string;
  confirmExit?: { title: string; body: string; leave: string; stay: string };
  /** 0..1, drawn as a line along the bottom of the bar. */
  progress?: number;
  right?: ReactNode;
  children: ReactNode;
  /** Show a back arrow on the left instead of a close button on the right. */
  backInstead?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const exitButton = (
    <Link
      to={exitTo}
      className="sj-iconbtn"
      aria-label={backInstead ? "Back" : "Leave"}
      title={backInstead ? "Back" : "Leave"}
      onClick={(event) => {
        if (confirmExit) {
          event.preventDefault();
          setAsking(true);
        }
      }}
    >
      {backInstead ? <IconArrowLeft size={20} /> : <IconClose size={20} />}
    </Link>
  );
  return (
    <div className="sj-focus">
      <header className="sj-focusbar">
        {backInstead ? exitButton : null}
        <div className="what">
          {eyebrow ? <span className="sj-eyebrow">{eyebrow}</span> : null}
          <strong>{title}</strong>
        </div>
        <div className="right">
          {right}
          {backInstead ? null : exitButton}
        </div>
        {progress !== undefined ? (
          <div className="progress" aria-hidden="true">
            <span
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
            />
          </div>
        ) : null}
      </header>
      {children}
      {confirmExit ? (
        <Dialog
          open={asking}
          onClose={() => setAsking(false)}
          title={confirmExit.title}
          actions={
            <>
              <Button tone="ghost" onClick={() => setAsking(false)}>
                {confirmExit.stay}
              </Button>
              <Button to={exitTo} tone="dark">
                {confirmExit.leave}
              </Button>
            </>
          }
        >
          {confirmExit.body}
        </Dialog>
      ) : null}
    </div>
  );
}
