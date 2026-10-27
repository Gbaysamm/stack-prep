/**
 * Turning any failure into one plain sentence a student or a member of staff can act on.
 *
 * The API speaks to people already: its 4xx details are short sentences ("That email/phone and
 * password don't match."). Everything else (a proxy's HTML error page, a validation list, a
 * dropped connection, a server crash) must never reach the screen as it is. This is the one
 * place that decides what is shown instead.
 */

/** Raised when a session has ended: every app listens for it and sends the person to sign in. */
export const SESSION_ENDED = 'stackprep:session-ended';

export class FriendlyError extends Error {
  /** The HTTP status, or 0 when the request never got an answer. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FriendlyError';
    this.status = status;
  }
}

const OFFLINE = "We couldn't reach Stack Prep. Check your internet connection and try again.";
const SERVER = 'Something went wrong on our side. Please try again in a moment.';
const ENDED = 'Your session has ended. Please sign in again.';
const NOT_ALLOWED = "Your account can't open this.";
const NOT_FOUND = "We couldn't find that. It may have been removed.";
const INVALID = 'Some of what was entered is not quite right. Please check it and try again.';

/** A server detail is shown only when it is plainly a sentence meant for people. */
function readable(detail: unknown): string | null {
  if (typeof detail !== 'string') return null;
  const text = detail.trim();
  if (!text || text.length > 240) return null;
  if (/<[a-z!/]/i.test(text)) return null; // HTML
  if (/traceback|exception|sqlalchemy|asyncpg|psycopg|undefined|null|\[object/i.test(text)) return null;
  return text;
}

/** The sentence for a failed response, from its status and whatever body it carried. */
export function messageFor(status: number, body: unknown): string {
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : body;
  if (status === 401) return ENDED;
  if (status >= 500) return SERVER;
  const said = readable(detail);
  if (said) return said;
  if (status === 403) return NOT_ALLOWED;
  if (status === 404) return NOT_FOUND;
  if (status === 409 || status === 422 || status === 400) return INVALID;
  return SERVER;
}

/** The sentence for anything thrown: a FriendlyError keeps its own, anything else is generic. */
export function friendly(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  if (error instanceof TypeError) return OFFLINE; // fetch's network failure
  if (error instanceof Error && readable(error.message)) return error.message;
  return SERVER;
}

/**
 * fetch, then either the parsed JSON or a FriendlyError. A 401 also announces SESSION_ENDED,
 * unless `quiet401` (the "who am I" check, where no session is an answer, not an event).
 */
export async function request<T>(url: string, init: RequestInit = {}, quiet401 = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new FriendlyError(OFFLINE, 0);
  }
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const type = response.headers.get('content-type') ?? '';
    return (type.includes('json') ? await response.json() : await response.text()) as T;
  }
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = await response.text().catch(() => null);
  }
  if (response.status === 401 && !quiet401) window.dispatchEvent(new Event(SESSION_ENDED));
  throw new FriendlyError(messageFor(response.status, body), response.status);
}
