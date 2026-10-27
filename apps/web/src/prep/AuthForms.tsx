/**
 * The account forms, on light surfaces only (the welcome page's form side and the white dialog):
 * create an account, log in, reset a forgotten password, and the claim dialog that turns a device-only sandbox student into a
 * real account without losing their progress.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthError, authApi, cleanLogin, looksLikePhone, validLogin } from './authApi.js';
import { IconArrowRight, IconCheck } from './icons.js';
import { identityFrom, useIdentity, type Identity } from './store.js';

import { Button, Dialog, cx, useToast } from './ui.js';
import './auth.css';

/* ------------------------------------------------------------------ icons (eye, alert) */

function IconEye({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a16.6 16.6 0 0 1-2.4 3.3" />
      <path d="M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

function IconAlert({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.4" r="0.6" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ pieces */

function Field({
  id,
  label,
  aside,
  message,
  error,
  bad,
  children,
}: {
  id: string;
  /** Marks the field invalid when its error is shown elsewhere (the password's strength line). */
  bad?: boolean;
  label: ReactNode;
  /** Something at the end of the label row, e.g. "Forgot password?". */
  aside?: ReactNode;
  /** Helper text, shown while there is no error. */
  message?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx('auth-field', error || bad ? 'bad' : null)}>
      <div className="auth-labelrow">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="auth-msg err" id={`${id}-msg`}>
          <IconAlert size={16} />
          <span>{error}</span>
        </p>
      ) : message ? (
        <p className="auth-msg" id={`${id}-msg`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** A password box with a show/hide toggle that keeps the caret where it was. */
function PasswordInput({
  id,
  inputRef,
  describedBy,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  inputRef: React.RefObject<HTMLInputElement>;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const caret = useRef<[number | null, number | null] | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && caret.current && document.activeElement === input) {
      try {
        input.setSelectionRange(caret.current[0], caret.current[1]);
      } catch {
        /* some input types refuse selection; nothing to restore */
      }
    }
    caret.current = null;
  }, [shown, inputRef]);
  return (
    <div className="auth-pw">
      <input
        id={id}
        ref={inputRef}
        type={shown ? 'text' : 'password'}
        className="sj-input auth-input"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        className="auth-eye"
        aria-label="Show password"
        aria-pressed={shown}
        aria-controls={id}
        title={shown ? 'Hide password' : 'Show password'}
        // Keep focus (and the caret) in the box when the toggle is clicked.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const input = inputRef.current;
          if (input) caret.current = [input.selectionStart, input.selectionEnd];
          setShown((value) => !value);
        }}
      >
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ strength */

const RULES = [
  { key: 'len8', label: '8+ characters', test: (p: string) => p.length >= 8 },
  { key: 'len12', label: '12+ characters', test: (p: string) => p.length >= 12 },
  { key: 'case', label: 'Upper and lower case', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { key: 'digit', label: 'A number', test: (p: string) => /\d/.test(p) },
  { key: 'symbol', label: 'A symbol', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
] as const;

const LEVELS = [
  { label: '', tone: '' },
  { label: 'Too short', tone: 'short' },
  { label: 'Weak', tone: 'weak' },
  { label: 'Okay', tone: 'okay' },
  { label: 'Strong', tone: 'strong' },
] as const;

/** 0 empty, 1 too short, 2 weak, 3 okay, 4 strong. Only "too short" ever blocks. */
export function strength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (password.length < 8) return 1;
  const extras = RULES.slice(1).filter((rule) => rule.test(password)).length;
  return extras <= 1 ? 2 : extras === 2 ? 3 : 4;
}

/** One line on what would make the password stronger, or that it is already strong. */
function strengthHint(password: string): string {
  if (!password) return 'Use 8 or more characters. Longer is stronger.';
  if (password.length < 8) {
    const left = 8 - password.length;
    return `Add ${left} more ${left === 1 ? 'character' : 'characters'} (8 is the minimum).`;
  }
  const digit = /\d/.test(password);
  const symbol = /[^A-Za-z0-9\s]/.test(password);
  const mixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
  if (strength(password) === 4) return 'Strong password. Nice.';
  if (!digit && !symbol) return 'Add a number or a symbol to make it stronger.';
  if (!mixed) return 'Mix capital and small letters to make it stronger.';
  if (!digit || !symbol) return `Add a ${digit ? 'symbol' : 'number'} to make it stronger.`;
  return 'Make it 12 characters or more to make it stronger.';
}

function Strength({ password, flagShort, id, error }: { password: string; flagShort: boolean; id: string; error?: string }) {
  const level = strength(password);
  const { label, tone } = LEVELS[level];
  const short = Boolean(error) || (flagShort && password.length < 8);
  return (
    <div className={cx('auth-strength', tone, short && 'need')} id={id}>
      <div className="auth-meter" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= level ? 'on' : undefined} />
        ))}
      </div>
      <p className="auth-strength-line">
        <span className="auth-strength-hint">{error ?? strengthHint(password)}</span>
        {level ? (
          <span className="auth-strength-label">
            <span className="sr">Strength: </span>
            {label}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** The login box: one field for an email or a phone number; the keyboard follows what is typed. */
function LoginInput({
  id,
  value,
  onChange,
  onBlur,
  inputRef,
  describedBy,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      className="sj-input auth-input"
      inputMode={looksLikePhone(value) ? 'tel' : 'email'}
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder="you@example.com or 0803 123 4567"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      maxLength={120}
    />
  );
}

function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div className="auth-alert" role="alert">
      <IconAlert size={18} />
      <div>{children}</div>
    </div>
  );
}

const BAD_LOGIN = 'Enter an email address, or a Nigerian phone number like 0803 123 4567.';

/* ------------------------------------------------------------------ create account */

type SignupErrors = Partial<Record<'name' | 'login' | 'password' | 'confirm', string>>;

export function SignupForm({
  claimStudentId,
  defaultName = '',
  defaultLogin = '',
  submitLabel,
  onDone,
  onSwitchToLogin,
  autoFocus,
}: {
  /** Turn this sandbox student into the new account. */
  claimStudentId?: string;
  defaultName?: string;
  defaultLogin?: string;
  submitLabel?: string;
  onDone: (identity: Identity) => void;
  /** Offered when the email or phone is already taken. */
  onSwitchToLogin?: (login: string) => void;
  autoFocus?: boolean;
}) {
  const ids = useId();
  const nameId = `${ids}-name`;
  const loginId = `${ids}-login`;
  const pwId = `${ids}-pw`;
  const confirmId = `${ids}-confirm`;
  const refs = {
    name: useRef<HTMLInputElement>(null),
    login: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const [name, setName] = useState(defaultName);
  const [login, setLogin] = useState(defaultLogin);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<SignupErrors>({});
  const [taken, setTaken] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    // After the frame, so a dialog opening around the form has taken focus first.
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => (defaultName ? refs.login : refs.name).current?.focus());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = (key: keyof SignupErrors) => {
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === 'login') setTaken(false);
    if (alert) setAlert(null);
  };

  const focusFirst = (found: SignupErrors) => {
    const order = ['name', 'login', 'password', 'confirm'] as const;
    const first = order.find((key) => found[key]);
    if (first) window.requestAnimationFrame(() => refs[first].current?.focus());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    const found: SignupErrors = {};
    if (!name.trim()) found.name = claimStudentId ? 'Tell us your name.' : 'Tell us your first name.';
    if (!login.trim()) found.login = 'Enter your email or phone number.';
    else if (!validLogin(login)) found.login = BAD_LOGIN;
    if (password.length < 8) found.password = password ? 'Use at least 8 characters.' : 'Choose a password of at least 8 characters.';
    if (!confirm) found.confirm = 'Type your password again.';
    else if (confirm !== password) found.confirm = "These don't match. Check both passwords.";
    setErrors(found);
    setTaken(false);
    setAlert(null);
    if (Object.keys(found).length) {
      focusFirst(found);
      return;
    }
    setBusy(true);
    try {
      const user = await authApi.signup({
        display_name: name.trim(),
        login: cleanLogin(login),
        password,
        ...(claimStudentId ? { claim_student_id: claimStudentId } : {}),
      });
      onDone(identityFrom(user));
    } catch (failure) {
      setBusy(false);
      const error = failure instanceof AuthError ? failure : new AuthError('Something went wrong. Try again.', 0);
      if (error.status === 409) {
        setErrors({ login: error.message });
        setTaken(true);
        focusFirst({ login: error.message });
      } else if (error.status === 422 && error.field) {
        const key = error.field === 'display_name' ? 'name' : error.field;
        setErrors({ [key]: error.message });
        focusFirst({ [key]: error.message });
      } else {
        setAlert(error.message);
      }
    }
  };

  const level = strength(password);
  const matches = confirm.length > 0 && confirm === password;
  const mismatch = confirm.length > 0 && !matches && (confirm.length >= password.length || tried);

  return (
    <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
      {alert ? <FormAlert>{alert}</FormAlert> : null}

      <Field id={nameId} label={claimStudentId ? 'Your name' : 'First name'} error={errors.name}>
        <input
          id={nameId}
          ref={refs.name}
          className="sj-input auth-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clear('name');
          }}
          placeholder="e.g. Ada"
          autoComplete="name"
          autoCapitalize="words"
          maxLength={60}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${nameId}-msg` : undefined}
          disabled={busy}
        />
      </Field>

      <Field
        id={loginId}
        label="Email or phone number"
        message="We'll use this to log you in on any device."
        error={
          errors.login ? (
            <>
              {errors.login}
              {taken && onSwitchToLogin ? (
                <>
                  {' '}
                  <button type="button" className="auth-inline" onClick={() => onSwitchToLogin(login)}>
                    Log in instead
                  </button>
                </>
              ) : null}
            </>
          ) : undefined
        }
      >
        <LoginInput
          id={loginId}
          inputRef={refs.login}
          value={login}
          onChange={(value) => {
            setLogin(value);
            clear('login');
          }}
          onBlur={() => {
            if (login.trim() && !validLogin(login)) setErrors((current) => ({ ...current, login: BAD_LOGIN }));
          }}
          invalid={Boolean(errors.login)}
          describedBy={`${loginId}-msg`}
          disabled={busy}
        />
      </Field>

      <Field id={pwId} label="Password" bad={Boolean(errors.password)}>
        <PasswordInput
          id={pwId}
          inputRef={refs.password}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clear('password');
            if (errors.confirm && event.target.value === confirm) clear('confirm');
          }}
          autoComplete="new-password"
          maxLength={128}
          invalid={Boolean(errors.password)}
          describedBy={`${pwId}-strength`}
          disabled={busy}
        />
        <Strength password={password} flagShort={tried} error={errors.password} id={`${pwId}-strength`} />
      </Field>

      <Field
        id={confirmId}
        label="Confirm password"
        error={errors.confirm}
        message={
          matches ? (
            <span className="auth-match ok">
              <IconCheck size={15} strokeWidth={2.6} />
              Passwords match
            </span>
          ) : mismatch ? (
            <span className="auth-match no">Doesn't match yet</span>
          ) : undefined
        }
      >
        <PasswordInput
          id={confirmId}
          inputRef={refs.confirm}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            clear('confirm');
          }}
          autoComplete="new-password"
          maxLength={128}
          invalid={Boolean(errors.confirm)}
          describedBy={`${confirmId}-msg`}
          disabled={busy}
        />
      </Field>
      <span className="sr" aria-live="polite">
        {matches ? 'Passwords match.' : ''}
      </span>

      <Button
        type="submit"
        block
        busy={busy}
        className="auth-submit"
        trailing={busy ? undefined : <IconArrowRight size={18} />}
        data-level={level}
      >
        {busy ? 'Creating your account…' : (submitLabel ?? 'Create my account')}
      </Button>
      <p className="auth-consent">
        By creating an account you agree that Stack Prep stores your answers to build your study plan.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ forgotten password */

/**
 * Two steps in the dialog: the email on the account, then the six-digit code from that email
 * and a new password. Setting it signs the student in.
 */
function ForgotPassword({
  defaultLogin,
  onDone,
}: {
  defaultLogin: string;
  onDone: (identity: Identity) => void;
}) {
  const ids = useId();
  const emailId = `${ids}-email`;
  const codeId = `${ids}-code`;
  const pwId = `${ids}-newpw`;
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(looksLikePhone(defaultLogin) ? '' : defaultLogin);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string }>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => (sentTo ? codeRef : emailRef).current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [sentTo]);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const typed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed)) {
      setErrors({ email: typed ? 'Enter a valid email address.' : 'Enter the email address on your account.' });
      emailRef.current?.focus();
      return;
    }
    setErrors({});
    setAlert(null);
    setBusy(true);
    try {
      setNote(await authApi.forgot(typed));
      setSentTo(typed);
      setCode('');
    } catch (failure) {
      setAlert(failure instanceof AuthError ? failure.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !sentTo) return;
    const digits = code.replace(/\s/g, '');
    const found: typeof errors = {};
    if (!/^\d{6}$/.test(digits)) found.code = 'Enter the 6-digit code from the email.';
    if (password.length < 8) found.password = 'Use at least 8 characters.';
    setErrors(found);
    setAlert(null);
    if (found.code || found.password) {
      (found.code ? codeRef : pwRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      onDone(identityFrom(await authApi.reset(sentTo, digits, password)));
    } catch (failure) {
      setBusy(false);
      const message = failure instanceof AuthError ? failure.message : 'Something went wrong. Try again.';
      if (failure instanceof AuthError && failure.field === 'password') setErrors({ password: message });
      else setAlert(message);
    }
  };

  if (!sentTo) {
    return (
      <form className="auth-form" onSubmit={ask} noValidate aria-busy={busy || undefined}>
        <p className="auth-dialog-lede">
          Enter the email address on your account and we&rsquo;ll send you a 6-digit code to set a new password.
        </p>
        {alert ? <FormAlert>{alert}</FormAlert> : null}
        <Field
          id={emailId}
          label="Email address"
          error={errors.email}
          message="Signed up with a phone number? Ask Stack Prep support to reset it for you."
        >
          <input
            id={emailId}
            ref={emailRef}
            type="email"
            className="sj-input auth-input"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            maxLength={120}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors({});
            }}
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={`${emailId}-msg`}
            disabled={busy}
          />
        </Field>
        <Button
          type="submit"
          block
          busy={busy}
          className="auth-submit"
          trailing={busy ? undefined : <IconArrowRight size={18} />}
        >
          {busy ? 'Sending…' : 'Send me a code'}
        </Button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={reset} noValidate aria-busy={busy || undefined}>
      <p className="auth-dialog-lede">
        {note} Check <strong>{sentTo}</strong>, including the spam folder.
      </p>
      {alert ? <FormAlert>{alert}</FormAlert> : null}
      <Field
        id={codeId}
        label="6-digit code"
        error={errors.code}
        aside={
          <button type="button" className="auth-inline" onClick={() => void ask()} disabled={busy}>
            Send a new code
          </button>
        }
      >
        <input
          id={codeId}
          ref={codeRef}
          className="sj-input auth-input auth-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          maxLength={7}
          onChange={(event) => {
            setCode(event.target.value.replace(/[^\d ]/g, ''));
            if (errors.code) setErrors((current) => ({ ...current, code: undefined }));
            if (alert) setAlert(null);
          }}
          aria-invalid={Boolean(errors.code) || undefined}
          aria-describedby={errors.code ? `${codeId}-msg` : undefined}
          disabled={busy}
        />
      </Field>
      <Field id={pwId} label="New password" bad={Boolean(errors.password)}>
        <PasswordInput
          id={pwId}
          inputRef={pwRef}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
          autoComplete="new-password"
          maxLength={128}
          invalid={Boolean(errors.password)}
          describedBy={`${pwId}-strength`}
          disabled={busy}
        />
        <Strength
          password={password}
          flagShort={Boolean(errors.password)}
          id={`${pwId}-strength`}
          error={errors.password}
        />
      </Field>
      <Button
        type="submit"
        block
        busy={busy}
        className="auth-submit"
        trailing={busy ? undefined : <IconArrowRight size={18} />}
      >
        {busy ? 'Saving…' : 'Set password and log in'}
      </Button>
      <button
        type="button"
        className="auth-inline auth-back"
        onClick={() => {
          setSentTo(null);
          setAlert(null);
          setErrors({});
        }}
        disabled={busy}
      >
        Use a different email
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ log in */

export function LoginForm({
  defaultLogin = '',
  onDone,
  autoFocus,
}: {
  defaultLogin?: string;
  onDone: (identity: Identity) => void;
  autoFocus?: boolean;
}) {
  const ids = useId();
  const loginId = `${ids}-login`;
  const pwId = `${ids}-pw`;
  const loginRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const [login, setLogin] = useState(defaultLogin);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => (defaultLogin ? pwRef : loginRef).current?.focus());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (!login.trim()) found.login = 'Enter the email or phone number you signed up with.';
    else if (!validLogin(login)) found.login = BAD_LOGIN;
    if (!password) found.password = 'Enter your password.';
    setErrors(found);
    setAlert(null);
    if (found.login || found.password) {
      window.requestAnimationFrame(() => (found.login ? loginRef : pwRef).current?.focus());
      return;
    }
    setBusy(true);
    try {
      const user = await authApi.login(cleanLogin(login), password);
      onDone(identityFrom(user));
    } catch (failure) {
      setBusy(false);
      setAlert(failure instanceof AuthError ? failure.message : 'Something went wrong. Try again.');
      window.requestAnimationFrame(() => pwRef.current?.select());
    }
  };

  const closeForgot = useCallback(() => setForgot(false), []);

  return (
    <>
      <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
        {alert ? <FormAlert>{alert}</FormAlert> : null}
        <Field id={loginId} label="Email or phone number" error={errors.login}>
          <LoginInput
            id={loginId}
            inputRef={loginRef}
            value={login}
            onChange={(value) => {
              setLogin(value);
              if (errors.login) setErrors((current) => ({ ...current, login: undefined }));
              if (alert) setAlert(null);
            }}
            invalid={Boolean(errors.login)}
            describedBy={errors.login ? `${loginId}-msg` : undefined}
            disabled={busy}
          />
        </Field>
        <Field
          id={pwId}
          label="Password"
          error={errors.password}
          aside={
            <button type="button" className="auth-inline" onClick={() => setForgot(true)}>
              Forgot password?
            </button>
          }
        >
          <PasswordInput
            id={pwId}
            inputRef={pwRef}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              if (alert) setAlert(null);
            }}
            autoComplete="current-password"
            maxLength={128}
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? `${pwId}-msg` : undefined}
            disabled={busy}
          />
        </Field>
        <Button
          type="submit"
          block
          busy={busy}
          className="auth-submit"
          trailing={busy ? undefined : <IconArrowRight size={18} />}
        >
          {busy ? 'Logging you in…' : 'Log in'}
        </Button>
      </form>
      {/* Outside the form: a submit inside the dialog would otherwise reach the login form too. */}
      <Dialog open={forgot} onClose={closeForgot} title="Reset your password">
        <ForgotPassword defaultLogin={login.trim()} onDone={onDone} />
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ claim a sandbox */

/** Turns the signed-in sandbox student into a real account, progress and all. */
export function ClaimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { identity, signIn } = useIdentity();
  const toast = useToast();
  const navigate = useNavigate();
  // Set when the API could not attach the sandbox's progress and made a fresh account instead.
  const [fresh, setFresh] = useState(false);
  const close = useCallback(() => {
    onClose();
    if (fresh) {
      setFresh(false);
      navigate('/onboarding');
    }
  }, [fresh, navigate, onClose]);
  if (!identity) return null;
  if (fresh) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Your login is ready, on a new account"
        actions={
          <Button onClick={close} trailing={<IconArrowRight size={18} />}>
            Set up my account
          </Button>
        }
      >
        We couldn't move this device's practice across, so we made you a new account. Your earlier practice stays on
        the old device. From now on, everything you do is saved to your login and works on any device.
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title="Create your login">
      <p className="auth-dialog-lede">
        Add an email or phone number and a password. Everything you've done so far comes with you, and you can
        log in on any phone or laptop.
      </p>
      <SignupForm
        claimStudentId={identity.studentId}
        defaultName={identity.displayName}
        submitLabel="Create my login"
        autoFocus
        onDone={(next) => {
          const claimed = next.studentId === identity.studentId;
          signIn(next);
          if (claimed) {
            onClose();
            toast('Your login is ready. Use it on any device.');
          } else {
            setFresh(true);
          }
        }}
      />
    </Dialog>
  );
}
