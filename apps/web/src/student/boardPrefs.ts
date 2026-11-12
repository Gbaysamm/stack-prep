/**
 * How the lesson board looks and sounds, chosen by the student, so two ways of teaching can be
 * compared side by side rather than one replacing the other.
 *
 * - `style`: 'classic' is the board as it has been (typeset working, marks and doodles);
 *   'whiteboard' is the explainer-video look (docs/lesson-style-guide.md): everything written
 *   by hand, warm paper, sections, sound effects, words landing as they are said.
 * - `voice`: 'studio' is the hosted voice the API has always used; 'kokoro' is a free voice made
 *   on our own server, with no paid service behind it; 'inworld' is Inworld's Nigerian English.
 *
 * The whiteboard and the Inworld voice (Emeka) are everyone's default (founder, 12 Nov 2026): a
 * choice saved before then (`v` below 3) is read as those once; the others stay one tap away.
 * Where Inworld is not configured the server answers with the studio voice.
 *
 * Kept in localStorage, which can be missing or throw (private windows, blocked storage), so
 * every read falls back to the defaults and every write is allowed to fail.
 */

import { useEffect, useState } from 'react';

export type BoardStyle = 'classic' | 'whiteboard';
export type BoardVoice = 'studio' | 'kokoro' | 'inworld';

export interface BoardPrefs {
  style: BoardStyle;
  voice: BoardVoice;
}

const KEY = 'sp.board.prefs';
const EVENT = 'sp:board-prefs';
export const DEFAULT_PREFS: BoardPrefs = { style: 'whiteboard', voice: 'inworld' };
/** Saved choices from before the whiteboard became everyone's board are read as whiteboard. */
const PREFS_VERSION = 3;

/** Set by a page that shows the board its own way (the public lesson showcase): read in place
 *  of the student's saved choice, and changed in place of it, so their choice is never touched. */
let forced: BoardPrefs | null = null;
export function forceBoardPrefs(prefs: BoardPrefs): void {
  forced = prefs;
}

export function readBoardPrefs(): BoardPrefs {
  if (forced) return forced;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BoardPrefs> & { v?: number };
    return {
      style: raw.v === PREFS_VERSION && raw.style === 'classic' ? 'classic' : 'whiteboard',
      voice:
        raw.v === PREFS_VERSION && (raw.voice === 'kokoro' || raw.voice === 'studio') ? raw.voice : 'inworld',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeBoardPrefs(change: Partial<BoardPrefs>): BoardPrefs {
  const next = { ...readBoardPrefs(), ...change };
  if (forced) {
    forced = next;
    window.dispatchEvent(new CustomEvent<BoardPrefs>(EVENT, { detail: next }));
    return next;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, v: PREFS_VERSION }));
  } catch {
    // Not kept past this page; the choice still applies now.
  }
  window.dispatchEvent(new CustomEvent<BoardPrefs>(EVENT, { detail: next }));
  return next;
}

/** The current choice, updated when it changes anywhere on the page. */
export function useBoardPrefs(): BoardPrefs {
  const [prefs, setPrefs] = useState<BoardPrefs>(readBoardPrefs);
  useEffect(() => {
    const changed = (event: Event) => setPrefs((event as CustomEvent<BoardPrefs>).detail);
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, []);
  return prefs;
}
