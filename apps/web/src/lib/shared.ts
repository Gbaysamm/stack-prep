/**
 * ONE REQUEST, SHARED (founder, 13 Nov 2026: every page was slow, and each made the same calls
 * many times; with many students that is load the server does not need).
 *
 * Data several parts of a page ask for (the overview, billing, announcements, settings,
 * features) is fetched once: callers at the same moment share one request, and the answer is
 * reused for a short while. Any change the student makes (a POST, PUT, PATCH or DELETE to the
 * API: an answer, a finished run, a new goal) forgets everything, so nothing shown is stale
 * after an action. A failed request is not kept.
 */

interface Held {
  at: number;
  value: Promise<unknown>;
}

const held = new Map<string, Held>();

/** `load()`'s answer for `key`: the request in flight, or one made under `ttlMs` ago. */
export function shared<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = held.get(key);
  if (hit && now - hit.at < ttlMs) return (hit.value as Promise<T>).then(own);
  const value = load();
  held.set(key, { at: now, value });
  value.catch(() => {
    if (held.get(key)?.value === value) held.delete(key);
  });
  return value.then(own);
}

/** Each caller its own copy, so one that changes what it got changes it for no one else. */
function own<T>(value: T): T {
  return typeof structuredClone === "function" && value !== null && typeof value === "object"
    ? structuredClone(value)
    : value;
}

/** Forget everything kept (after any change the student makes). */
export function forgetShared(): void {
  held.clear();
}

let installed = false;

/** Forget the kept answers whenever the app changes something on the server. */
export function installSharedReset(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const done = original(input, init);
      // Forgotten before and after, so a read racing the change is not kept either.
      forgetShared();
      return done.finally(forgetShared);
    }
    return original(input, init);
  };
}

/** How long each kind of shared answer is kept. */
export const KEEP = {
  /** The home overview: scores, runs, streak. Short, and reset by any change. */
  overview: 30_000,
  /** Plan standing, support threads, announcements. */
  account: 60_000,
  /** The app's public settings and the feature switches. */
  settings: 300_000,
} as const;
