/**
 * The door to a staff dashboard: sign in, then only the roles the dashboard allows get through.
 *
 * Staff sign in with the same account as everyone (email or phone and a password); what they may
 * open is their role (migration 031). An admin may open both dashboards and the student app; a
 * reviewer only the reviewer dashboard. A session that ends while the page is open brings the
 * sign-in back, over the page, so nothing typed is lost to a reload.
 */
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { FriendlyError, SESSION_ENDED, friendly, request } from '../lib/friendlyError.js';
import '../prep/prep.css';
import './staff.css';

export type StaffRole = 'reviewer' | 'admin';

export interface StaffUser {
  student_id: string;
  display_name: string;
  login: string;
  role: 'student' | StaffRole;
}

interface StaffContextValue {
  user: StaffUser;
  signOut: () => Promise<void>;
}

const StaffContext = createContext<StaffContextValue | null>(null);

export function useStaff(): StaffContextValue {
  const value = useContext(StaffContext);
  if (!value) throw new Error('useStaff outside StaffGate');
  return value;
}

const me = () => request<StaffUser>('/v1/auth/me', {}, true).catch((error: unknown) => {
  if (error instanceof FriendlyError && error.status === 401) return null;
  throw error;
});

export function StaffGate({
  allow,
  title,
  children,
}: {
  allow: StaffRole[];
  /** The dashboard's name, for the sign-in card ("Admin dashboard"). */
  title: string;
  children: ReactNode;
}) {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    me()
      .then(setUser)
      .catch((error) => setProblem(friendly(error)));
  }, []);

  useEffect(() => {
    const onEnded = () => setEnded(true);
    window.addEventListener(SESSION_ENDED, onEnded);
    return () => window.removeEventListener(SESSION_ENDED, onEnded);
  }, []);

  const signOut = useCallback(async () => {
    await request('/v1/auth/logout', { method: 'POST' }, true).catch(() => undefined);
    setUser(null);
  }, []);

  let page: ReactNode;
  if (user === undefined && !problem) {
    page = <div className="st-center"><span className="st-loading" aria-label="Loading" /></div>;
  } else if (problem) {
    page = (
      <Card title={title}>
        <p className="st-lead">{problem}</p>
        <button type="button" className="sj-btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </Card>
    );
  } else if (!user) {
    page = <SignIn title={title} onDone={setUser} />;
  } else if (!allow.includes(user.role as StaffRole)) {
    page = (
      <Card title={title}>
        <p className="st-lead">
          {user.display_name}, your account can&apos;t open the {title.toLowerCase()}.
          {user.role === 'student' ? ' Ask an admin if you should have access.' : ''}
        </p>
        <div className="st-row">
          {user.role !== 'reviewer' && (
            <a className="sj-btn" href="/home">
              Go to the student app
            </a>
          )}
          {user.role === 'reviewer' && (
            <a className="sj-btn" href="/review">
              Go to the reviewer dashboard
            </a>
          )}
          <button type="button" className="sj-btn ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </Card>
    );
  } else {
    page = (
      <StaffContext.Provider value={{ user, signOut }}>
        {children}
        {ended && (
          <div className="st-overlay" role="dialog" aria-modal="true" aria-label="Sign in again">
            <SignIn
              title={title}
              note="Your session ended. Sign in again to carry on where you were."
              defaultLogin={user.login}
              onDone={(next) => {
                setUser(next);
                setEnded(false);
              }}
            />
          </div>
        )}
      </StaffContext.Provider>
    );
  }
  return <div className="sj st-root">{page}</div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="st-center">
      <div className="st-card">
        <div className="st-brand">
          <span className="st-logo" aria-hidden="true">S</span>
          <span>
            Stack Prep <small>{title}</small>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

function SignIn({
  title,
  note,
  defaultLogin = '',
  onDone,
}: {
  title: string;
  note?: string;
  defaultLogin?: string;
  onDone: (user: StaffUser) => void;
}) {
  const [login, setLogin] = useState(defaultLogin);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!login.trim() || !password) {
      setError('Enter your email or phone number and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await request<StaffUser>(
        '/v1/auth/login',
        { method: 'POST', body: JSON.stringify({ login: login.trim(), password }) },
        true,
      );
      onDone(user);
    } catch (caught) {
      setError(
        caught instanceof FriendlyError && caught.status === 401
          ? "That email/phone and password don't match."
          : friendly(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={title}>
      <h1 className="st-title">Sign in</h1>
      <p className="st-lead">{note ?? 'Use your Stack Prep email or phone number and password.'}</p>
      <form className="st-form" onSubmit={submit} noValidate>
        <label className="st-field">
          <span>Email or phone number</span>
          <input
            autoFocus={!defaultLogin}
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>
        <label className="st-field">
          <span>Password</span>
          <input
            autoFocus={Boolean(defaultLogin)}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="sj-btn st-wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Card>
  );
}
