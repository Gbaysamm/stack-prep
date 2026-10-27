/**
 * Who is using the app, and a small hook for loading data.
 *
 * The session is the source of truth: on start the app asks the API who is signed in (the
 * `sp_session` cookie). While it asks, a small branded splash shows, so a signed-in student never
 * sees the welcome page flash by. A student from before accounts existed (remembered on this
 * device under the first version's storage key, with no password) stays signed in as a
 * *sandbox* identity until they create a login. Everything else — which exam, which session —
 * lives in the URL, where the back button can reach it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { authApi, type AuthUser, type Role } from './authApi.js';
import { Splash } from './Splash.js';

export interface Identity {
  studentId: string;
  displayName: string;
  /** The email or phone number they log in with; absent for a sandbox identity. */
  login?: string;
  /** True for a device-only student with no login yet. */
  sandbox: boolean;
  /** student, reviewer or admin; a sandbox identity is always a student. */
  role?: Role;
}

/** The first version's key: a sandbox student with no password, on this device only. */
const SANDBOX_KEY = 'scorepilot.student';
/** The last signed-in account, kept only so the splash can greet them; never trusted. */
const HINT_KEY = 'stackprep.session-hint';

function store(key: string, value: unknown) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: nothing is remembered between visits, which is fine.
  }
}

function recall<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readSandbox(): Identity | null {
  const parsed = recall<{ studentId?: string; displayName?: string }>(SANDBOX_KEY);
  return parsed?.studentId
    ? { studentId: parsed.studentId, displayName: parsed.displayName ?? 'Student', sandbox: true }
    : null;
}

/** Development only: `?as=<student id>` signs that student in as a sandbox, for screenshots. */
function devIdentity(): Identity | null {
  if (!import.meta.env.DEV) return null;
  try {
    const as = new URLSearchParams(window.location.search).get('as');
    if (!as) return null;
    const signedIn = { studentId: as, displayName: 'Tolu Adeyemi' };
    store(SANDBOX_KEY, signedIn);
    return { ...signedIn, sandbox: true };
  } catch {
    return null;
  }
}

export function identityFrom(user: AuthUser): Identity {
  return {
    studentId: user.student_id,
    displayName: user.display_name,
    login: user.login,
    sandbox: false,
    role: user.role ?? 'student',
  };
}

/** The name the splash greets, from the last visit; null when we have never met. */
export function sessionHint(): string | null {
  return recall<{ displayName?: string }>(HINT_KEY)?.displayName ?? readSandbox()?.displayName ?? null;
}

interface IdentityContextValue {
  identity: Identity | null;
  /** True while the signed-in student has no login yet (progress lives on this device only). */
  sandbox: boolean;
  /** Signs in with an account the API has just returned (sign up, log in, or a claimed sandbox). */
  signIn: (identity: Identity) => void;
  /** Ends the session on the server, then forgets this device's student. */
  signOut: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextValue>({
  identity: null,
  sandbox: false,
  signIn: () => undefined,
  signOut: async () => undefined,
});

type Status = { state: 'checking' } | { state: 'ready'; identity: Identity | null };

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => {
    const dev = devIdentity();
    return dev ? { state: 'ready', identity: dev } : { state: 'checking' };
  });

  useEffect(() => {
    if (status.state !== 'checking') return;
    let live = true;
    authApi
      .me()
      .then((user) => {
        if (!live) return;
        if (user) {
          const identity = identityFrom(user);
          store(HINT_KEY, { displayName: identity.displayName });
          setStatus({ state: 'ready', identity });
        } else {
          // No session. A student from before accounts keeps their device-only progress.
          store(HINT_KEY, null);
          setStatus({ state: 'ready', identity: readSandbox() });
        }
      })
      .catch(() => {
        // The API could not answer (offline, or accounts not deployed yet): fall back to what
        // this device knows, so nobody is locked out by a blip. Pages will show their own errors.
        if (live) setStatus({ state: 'ready', identity: readSandbox() });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identity = status.state === 'ready' ? status.identity : null;

  const signIn = useCallback((next: Identity) => {
    if (next.sandbox) {
      store(SANDBOX_KEY, { studentId: next.studentId, displayName: next.displayName });
    } else {
      // A real account: the device-only record is now claimed (or replaced), so forget it.
      store(SANDBOX_KEY, null);
      store(HINT_KEY, { displayName: next.displayName });
    }
    setStatus({ state: 'ready', identity: next });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // No session to end (a sandbox student), or the API is unreachable: still forget locally.
    }
    store(SANDBOX_KEY, null);
    store(HINT_KEY, null);
    store('scorepilot.place', null);
    setStatus({ state: 'ready', identity: null });
  }, []);

  const value = useMemo(
    () => ({ identity, sandbox: identity?.sandbox ?? false, signIn, signOut }),
    [identity, signIn, signOut],
  );
  if (status.state === 'checking') return <Splash name={sessionHint()} />;
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export const useIdentity = () => useContext(IdentityContext);

/** The signed-in student, for pages behind `RequireStudent`. */
export function useStudent(): Identity {
  const { identity } = useIdentity();
  if (!identity) throw new Error('useStudent outside RequireStudent');
  return identity;
}

/** Sends anyone not signed in to the welcome page, and back here afterwards. */
export function RequireStudent({ children }: { children: ReactNode }) {
  const { identity } = useIdentity();
  const location = useLocation();
  if (!identity) return <Navigate to="/?mode=login" replace state={{ from: location.pathname + location.search }} />;
  if (identity.role === 'reviewer') return <ReviewerHere />;
  return <>{children}</>;
}

/** A reviewer account is for the reviewer dashboard only (migration 031): say so, kindly. */
function ReviewerHere() {
  const { identity, signOut } = useIdentity();
  return (
    <main className="sj-staffnote">
      <div className="sj-staffnote-card">
        <h1>This is a reviewer account</h1>
        <p>
          {identity?.displayName}, your account reviews questions, so it opens the reviewer
          dashboard rather than the student app.
        </p>
        <div className="sj-staffnote-actions">
          <a className="sj-btn" href="/review">
            Go to the reviewer dashboard
          </a>
          <button type="button" className="sj-btn ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ data */

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads `fetcher` when `key` changes. The last good data stays on screen while it reloads, so a
 * page does not flash back to skeletons; a stale response never overwrites a newer one.
 */
export function useLoad<T>(fetcher: () => Promise<T>, key: unknown[]): Loaded<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const call = ++latest.current;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((value) => {
        if (call === latest.current) setData(value);
      })
      .catch((failure: Error) => {
        if (call === latest.current) setError(failure.message || 'Something went wrong.');
      })
      .finally(() => {
        if (call === latest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload };
}

/** What `useCachedLoad` has fetched this visit, by key: kept so going back to a subject is instant. */
const loaded = new Map<string, unknown>();

/**
 * `useLoad` for data that follows a choice on the page (the subject in the switcher): keyed by a
 * string, remembered for the visit, and shown at once when the same key comes round again, while
 * a fresh copy is fetched quietly behind it. A key never seen before has no data (so the previous
 * subject's never shows under the new one's name) and `loading` is true until it arrives.
 */
export function useCachedLoad<T>(cacheKey: string, fetcher: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string; data: T | undefined; error: string | null; loading: boolean }>(
    () => ({ key: cacheKey, data: loaded.get(cacheKey) as T | undefined, error: null, loading: true }),
  );
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const call = ++latest.current;
    setState({ key: cacheKey, data: loaded.get(cacheKey) as T | undefined, error: null, loading: true });
    fetcherRef
      .current()
      .then((value) => {
        loaded.set(cacheKey, value);
        if (call === latest.current) setState({ key: cacheKey, data: value, error: null, loading: false });
      })
      .catch((failure: Error) => {
        if (call === latest.current)
          setState((current) => ({ ...current, error: failure.message || 'Something went wrong.', loading: false }));
      });
  }, [cacheKey, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  // The render straight after the key changes comes before the effect: answer for the new key.
  if (state.key !== cacheKey) {
    return { data: loaded.get(cacheKey) as T | undefined, error: null, loading: true, reload };
  }
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

/* ------------------------------------------------------------------ page title */

const TitleContext = createContext<(title: string) => void>(() => undefined);
export const TitleProvider = TitleContext.Provider;

/** Names the page: in the browser tab, and in the phone's top bar. */
export function usePageTitle(title: string) {
  const set = useContext(TitleContext);
  useEffect(() => {
    set(title);
    document.title = title ? `${title} · Stack Prep` : 'Stack Prep';
  }, [set, title]);
}
