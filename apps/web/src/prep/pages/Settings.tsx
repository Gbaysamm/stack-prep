/**
 * /settings — the student's own account: who they are and where they're aiming (the profile the
 * admin dashboard shows), how mock results are shown, how they sign in, and their password.
 */
import { useEffect, useState, type FormEvent } from 'react';

import { friendly } from '../../lib/friendlyError.js';
import { api } from '../../student/api.js';
import { AboutField, AboutFields, aboutChange, draftOf, type AboutDraft } from '../AboutFields.js';
import { ClaimDialog } from '../AuthForms.js';
import { authApi, type LoginDetails } from '../authApi.js';
import { IconArrowRight, IconLock } from '../icons.js';
import { useIdentity, useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Skeleton, useToast } from '../ui.js';
import { Note, Section } from './Home.js';
import { ResultSettings } from './ResultSettings.js';
import './Settings.css';

const Field = AboutField;

/* ------------------------------------------------------------------ about you */

function AboutYou({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { identity, signIn } = useIdentity();
  const load = useLoad(() => api.profile(studentId), [studentId]);
  const [saved, setSaved] = useState<AboutDraft | null>(null);
  const [draft, setDraft] = useState<AboutDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!load.data) return;
    setSaved(draftOf(load.data));
    setDraft(draftOf(load.data));
  }, [load.data]);

  if (!draft || !saved) {
    return (
      <div className="sj-card set-card">
        {load.error ? (
          <Note
            icon={<IconLock size={18} />}
            tone="pink"
            title="We couldn't load your details"
            action={
              <Button tone="soft" onClick={load.reload}>
                Try again
              </Button>
            }
          />
        ) : (
          <Skeleton height={260} radius={12} />
        )}
      </div>
    );
  }

  const set = (key: keyof AboutDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  };
  const change = aboutChange(draft, saved);
  const changed = Object.keys(change).length > 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed || busy) return;
    if (!draft.display_name.trim()) {
      setError('Enter your name.');
      return;
    }
    setBusy(true);
    try {
      const next = await api.updateProfile(studentId, change);
      setSaved(draftOf(next));
      setDraft(draftOf(next));
      if (identity && next.display_name !== identity.displayName) signIn({ ...identity, displayName: next.display_name });
      toast('Your details are saved');
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sj-card set-card" onSubmit={save} noValidate>
      <AboutFields draft={draft} onChange={set} withName />
      <div className="set-actions">
        {error ? (
          <p className="set-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="set-quiet">Only you and the Stack Prep team see these.</p>
        )}
        <Button type="submit" busy={busy} disabled={!changed}>
          Save details
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ signing in */

function SignIn() {
  const toast = useToast();
  const { identity, signIn } = useIdentity();
  const load = useLoad(() => authApi.loginDetails(), []);
  const [saved, setSaved] = useState<LoginDetails | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!load.data) return;
    setSaved(load.data);
    setEmail(load.data.email ?? '');
    setPhone(load.data.phone ?? '');
  }, [load.data]);

  if (!saved) {
    return (
      <div className="sj-card set-card">
        {load.error ? (
          <p className="set-error">{friendly(load.error)}</p>
        ) : (
          <Skeleton height={150} radius={12} />
        )}
      </div>
    );
  }

  const emailChanged = email.trim() !== (saved.email ?? '');
  const phoneChanged = phone.trim() !== (saved.phone ?? '');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (!emailChanged && !phoneChanged)) return;
    if (!password) {
      setError('Enter your current password to change how you sign in.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await authApi.changeLoginDetails({
        current_password: password,
        ...(emailChanged ? { email: email.trim() || null } : {}),
        ...(phoneChanged ? { phone: phone.trim() || null } : {}),
      });
      setSaved(next);
      setEmail(next.email ?? '');
      setPhone(next.phone ?? '');
      setPassword('');
      if (identity) signIn({ ...identity, login: next.email ?? next.phone ?? identity.login });
      toast('Your sign-in details are saved');
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sj-card set-card" onSubmit={save} noValidate>
      <div className="about-grid">
        <Field label="Email" hint="Password reset codes are sent here.">
          {(id) => (
            <input
              id={id}
              type="email"
              className="sj-input"
              value={email}
              maxLength={120}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field label="Phone number" hint="A Nigerian number, like 0803 123 4567.">
          {(id) => (
            <input
              id={id}
              type="tel"
              className="sj-input"
              value={phone}
              maxLength={20}
              autoComplete="tel"
              placeholder="0803 123 4567"
              onChange={(event) => {
                setPhone(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        {emailChanged || phoneChanged ? (
          <Field label="Current password" hint="To keep your account safe, confirm it's you.">
            {(id) => (
              <input
                id={id}
                type="password"
                className="sj-input"
                value={password}
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
            )}
          </Field>
        ) : null}
      </div>
      <div className="set-actions">
        {error ? (
          <p className="set-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="set-quiet">You can sign in with either one. Keep at least one.</p>
        )}
        <Button type="submit" busy={busy} disabled={!emailChanged && !phoneChanged}>
          Save sign-in
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ password */

function Password() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!current) return setError('Enter your current password.');
    if (next.length < 8) return setError('Use at least 8 characters for your new password.');
    if (next !== confirm) return setError("The new passwords don't match. Check both.");
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed. Other devices are signed out.');
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sj-card set-card" onSubmit={save} noValidate>
      <div className="about-grid three">
        <Field label="Current password">
          {(id) => (
            <input
              id={id}
              type="password"
              className="sj-input"
              value={current}
              autoComplete="current-password"
              onChange={(event) => {
                setCurrent(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field label="New password" hint="8 or more characters.">
          {(id) => (
            <input
              id={id}
              type="password"
              className="sj-input"
              value={next}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => {
                setNext(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field label="New password again">
          {(id) => (
            <input
              id={id}
              type="password"
              className="sj-input"
              value={confirm}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => {
                setConfirm(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
      </div>
      <div className="set-actions">
        {error ? (
          <p className="set-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="set-quiet">Changing it signs you out on your other devices.</p>
        )}
        <Button type="submit" busy={busy} disabled={!current && !next && !confirm}>
          Change password
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ the page */

export function Settings() {
  usePageTitle('Account settings');
  const student = useStudent();
  const { sandbox } = useIdentity();
  const [claiming, setClaiming] = useState(false);

  return (
    <div className="sj-page pro-page set-page">
      <PageHero
        eyebrow="Account settings"
        title="Your account"
        sub="Your details, how your results are shown, and how you sign in."
      />

      <Section eyebrow="About you" title="Your school and your aim" id="set-about" className="sj-rise d1">
        <AboutYou studentId={student.studentId} />
      </Section>

      <Section eyebrow="Mock results" title="How your scores are shown" id="set-results" className="sj-rise d2">
        <ResultSettings studentId={student.studentId} />
      </Section>

      <Section eyebrow="Signing in" title="Email, phone and password" id="set-signin" className="sj-rise d3">
        {sandbox ? (
          <Note
            card
            icon={<IconLock size={18} />}
            tone="yellow"
            title="No login yet"
            action={
              <Button onClick={() => setClaiming(true)} trailing={<IconArrowRight size={18} />}>
                Create login
              </Button>
            }
          >
            Your progress lives on this device only. Add an email or phone number and a password to keep it safe.
          </Note>
        ) : (
          <div className="set-stack">
            <SignIn />
            <Password />
          </div>
        )}
      </Section>
      <ClaimDialog open={claiming} onClose={() => setClaiming(false)} />
    </div>
  );
}
