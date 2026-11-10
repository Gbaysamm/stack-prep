/**
 * Accounts: sign up, log in, log out, and "who am I". The session is an HttpOnly cookie
 * (`sp_session`) the browser keeps for us; every call is same-origin, so fetch sends it by default.
 */

import { request } from '../lib/friendlyError.js';

export type Role = 'student' | 'reviewer' | 'admin';

export interface LoginDetails {
  email: string | null;
  phone: string | null;
}

export interface AuthUser {
  student_id: string;
  display_name: string;
  login: string;
  /** student, reviewer or admin. A reviewer uses /review only; an admin may use everything. */
  role?: Role;
}

export interface SignupBody {
  display_name: string;
  /** Both required at sign-up; either one signs in afterwards. */
  email: string;
  phone: string;
  password: string;
  /** A sandbox student to turn into this account, so their progress comes with them. */
  claim_student_id?: string;
}

/** Which form field a server error is about, when that is clear from the response. */
export type AuthField = 'display_name' | 'login' | 'email' | 'phone' | 'password';

export class AuthError extends Error {
  status: number;
  field?: AuthField;
  constructor(message: string, status: number, field?: AuthField) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const OFFLINE = "We couldn't reach Stack Prep. Check your connection and try again.";

function fieldFrom(text: string): AuthField | undefined {
  if (/password/i.test(text)) return 'password';
  const email = /\be-?mail\b/i.test(text);
  const phone = /\b(phone|number)\b/i.test(text);
  // One named alone is about that field (sign-up asks for both); either, or a login, the login.
  if (email && !phone) return 'email';
  if (phone && !email) return 'phone';
  if (email || phone || /\blogin\b/i.test(text)) return 'login';
  if (/\bname\b/i.test(text)) return 'display_name';
  return undefined;
}

/** FastAPI sends `detail` as a sentence for our own errors, or a list for validation failures. */
async function failure(response: Response): Promise<AuthError> {
  let message = '';
  let field: AuthField | undefined;
  try {
    const body = (await response.json()) as { detail?: unknown };
    const detail = body.detail;
    if (typeof detail === 'string') {
      message = detail;
      field = fieldFrom(detail);
    } else if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const where = String(first.loc?.[first.loc.length - 1] ?? '');
      field = (['display_name', 'login', 'email', 'phone', 'password'] as const).find((name) => name === where);
      message = (first.msg ?? '').replace(/^Value error, /, '');
    }
  } catch {
    /* not JSON */
  }
  if (!message) {
    message =
      response.status === 429
        ? 'Too many tries. Wait a minute, then try again.'
        : response.status >= 500
          ? 'Something went wrong on our side. Try again in a moment.'
          : 'That did not work. Check your details and try again.';
  }
  return new AuthError(message, response.status, field);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/v1/auth${path}`, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  } catch {
    throw new AuthError(OFFLINE, 0);
  }
  if (!response.ok) throw await failure(response);
  return response;
}

export const authApi = {
  signup: async (body: SignupBody) =>
    (await (await send('/signup', { method: 'POST', body: JSON.stringify(body) })).json()) as AuthUser,
  login: async (login: string, password: string) =>
    (await (await send('/login', { method: 'POST', body: JSON.stringify({ login, password }) })).json()) as AuthUser,
  logout: async () => {
    await send('/logout', { method: 'POST' });
  },
  /** Emails a six-digit reset code, when an account uses that email. Says the same either way. */
  forgot: async (login: string) =>
    ((await (await send('/forgot', { method: 'POST', body: JSON.stringify({ login }) })).json()) as { detail: string })
      .detail,
  /** Sets a new password with the emailed code, and signs in. */
  reset: async (login: string, code: string, password: string) =>
    (await (
      await send('/reset', { method: 'POST', body: JSON.stringify({ login, code, password }) })
    ).json()) as AuthUser,
  /** The signed-in person's email and phone (either can be a login). */
  loginDetails: () => request<LoginDetails>('/v1/auth/login-details'),
  /** Change or remove the email or phone; one must remain. Needs the current password. */
  changeLoginDetails: (change: { current_password: string; email?: string | null; phone?: string | null }) =>
    request<LoginDetails>('/v1/auth/login-details', { method: 'POST', body: JSON.stringify(change) }),
  /** A new password; other devices are signed out, this one stays in. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  /** The signed-in student, or null when there is no session (401). Other failures throw. */
  me: async (): Promise<AuthUser | null> => {
    try {
      return (await (await send('/me')).json()) as AuthUser;
    } catch (error) {
      if (error instanceof AuthError && (error.status === 401 || error.status === 403)) return null;
      throw error;
    }
  },
};

/* ------------------------------------------------------------------ login ids */

/** Strips the spacing people type into phone numbers. */
const squash = (value: string) => value.replace(/[\s()-]/g, '');

export function looksLikePhone(value: string): boolean {
  return /^\+?\d/.test(value.trim()) && /^[+\d\s()-]*$/.test(value.trim());
}

/** An email address, or a Nigerian mobile number in any of the usual shapes. */
export function validLogin(value: string): boolean {
  const text = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return true;
  const digits = squash(text);
  return /^(\+?234\d{10}|0\d{10}|[789]\d{9})$/.test(digits);
}

/** What we send: emails as typed (trimmed), phone numbers without their spaces. */
export function cleanLogin(value: string): string {
  const text = value.trim();
  return looksLikePhone(text) ? squash(text) : text;
}
