/**
 * The front door, for anyone not signed in: a split screen. On the left, the ink brand panel
 * (what Stack Prep does); on the right, a light surface with one form in a 400px column. The
 * form is "Create your account" at `/?mode=signup` and "Welcome back" at `/?mode=login` (the bare
 * `/` is the public home page, site/Landing.tsx), so the back button
 * and a shared link land on the right one. On a phone the ink band shrinks to the brand and the
 * headline, and the form comes up over it as a white sheet.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { LoginForm, SignupForm } from "../AuthForms.js";
import { IconBolt, IconSparkles, IconTarget } from "../icons.js";
import { ENDED_KEY, useIdentity, usePageTitle, type Identity } from "../store.js";
import { cx } from "../ui.js";
import "./Welcome.css";

const POINTS = [
  { icon: IconTarget, tone: "lime", title: "Check-up", body: "predicts your score today" },
  { icon: IconBolt, tone: "pink", title: "Practice", body: "shows the exact step you missed" },
  { icon: IconSparkles, tone: "yellow", title: "Coach", body: "talks you through it, out loud" },
] as const;

type Mode = "signup" | "login";

const COPY: Record<Mode, { title: string; sub: string; ask: string; switchTo: string }> = {
  signup: {
    title: "Create your account",
    sub: "It's free, and your progress follows you to any device.",
    ask: "Already have an account?",
    switchTo: "Log in",
  },
  login: {
    title: "Welcome back",
    sub: "Log in to pick up right where you left off.",
    ask: "New to Stack Prep?",
    switchTo: "Create an account",
  },
};

export function Welcome() {
  const [params] = useSearchParams();
  const mode: Mode = params.get("mode") === "login" ? "login" : "signup";
  usePageTitle(mode === "login" ? "Log in" : "Create your account");
  const { signIn } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // "Log in instead" carries the email or phone across and puts the caret in the password box.
  // A session that ran out under the student: say so, and fill in who they were.
  const [ended] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(ENDED_KEY);
    } catch {
      return null;
    }
  });
  const [carry, setCarry] = useState<{ login: string; key: number }>({ login: ended ?? "", key: ended ? 1 : 0 });
  const headings = useRef<Record<Mode, HTMLHeadingElement | null>>({ signup: null, login: null });
  const switched = useRef(false);

  // After a switch, move focus to the new form's heading, so a screen reader announces it and
  // Tab continues into the right fields (without popping a phone keyboard open).
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    if (carry.key && mode === "login") return; // the login form focuses its password box itself
    headings.current[mode]?.focus({ preventScroll: true });
  }, [mode, carry.key]);

  const hrefFor = (next: Mode) => ({ pathname: "/", search: `?mode=${next}` });

  const signedUp = (identity: Identity) => {
    signIn(identity);
    navigate("/onboarding", { replace: true });
  };
  const loggedIn = (identity: Identity) => {
    try {
      window.sessionStorage.removeItem(ENDED_KEY);
    } catch {
      /* nothing to clear */
    }
    signIn(identity);
    navigate(from && from !== "/" ? from : "/home", { replace: true });
  };

  return (
    <div className="wel">
      <section className="wel-brandside" aria-label="About Stack Prep">
        <div className="wel-sky" aria-hidden="true">
          <span className="wel-blob a" />
          <span className="wel-blob b" />
        </div>
        <div className="wel-brandside-in">
          <Link to="/" className="wel-brand sj-rise" aria-label="Stack Prep home">
            <img src="/brand/mark-96.png" alt="" width={36} height={36} />
            <span>Stack Prep</span>
          </Link>
          <div className="wel-pitch">
            <h1 className="sj-display wel-title sj-rise d1">
              Know your score.
              <br />
              <em>Then raise it.</em>
            </h1>
            <p className="wel-lede sj-rise d2">
              A short check-up shows where you stand for UTME, then a coach teaches the exact step you missed.
            </p>
            <ul className="wel-points sj-rise d3" aria-label="What you get">
              {POINTS.map(({ icon: Icon, tone, title, body }) => (
                <li key={title} className="wel-point">
                  <span className={`wel-point-icon ${tone}`} aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="wel-point-text">
                    <strong>{title}</strong> {body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="wel-foot wel-foot-dark">Stack Prep by Stackjunior · Made for UTME candidates in Nigeria</p>
        </div>
      </section>

      <main className="wel-formside">
        <div className="wel-formcol sj-rise d1">
          <div className="wel-stack">
            {(["signup", "login"] as const).map((panel) => {
              const copy = COPY[panel];
              const other: Mode = panel === "signup" ? "login" : "signup";
              const active = panel === mode;
              return (
                <div
                  key={panel}
                  className={cx("wel-panel", active && "on")}
                  hidden={!active}
                >
                  <h2
                    className="sj-display wel-formtitle"
                    tabIndex={-1}
                    ref={(el) => {
                      headings.current[panel] = el;
                    }}
                  >
                    {copy.title}
                  </h2>
                  <p className="wel-formsub">{copy.sub}</p>
                  {panel === "login" && ended !== null && (
                    <p className="wel-ended" role="status">
                      Your session ended, so we signed you out. Sign in again to carry on where you were.
                    </p>
                  )}
                  {panel === "signup" ? (
                    <SignupForm
                      onDone={signedUp}
                      onSwitchToLogin={(login) => {
                        setCarry((current) => ({ login, key: current.key + 1 }));
                        switched.current = true;
                        navigate(hrefFor("login"), { state: location.state });
                      }}
                    />
                  ) : (
                    <LoginForm
                      key={carry.key}
                      defaultLogin={carry.login}
                      autoFocus={carry.key > 0}
                      onDone={loggedIn}
                    />
                  )}
                  <p className="wel-switch">
                    {copy.ask}{" "}
                    <Link
                      to={hrefFor(other)}
                      state={location.state}
                      onClick={() => {
                        switched.current = true;
                      }}
                    >
                      {copy.switchTo}
                    </Link>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <p className="wel-foot wel-foot-light">Stack Prep by Stackjunior · Made for UTME candidates in Nigeria</p>
      </main>
    </div>
  );
}
