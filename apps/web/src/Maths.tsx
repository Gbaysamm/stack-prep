/**
 * Mathematics set rather than spelled out, wherever it appears.
 *
 * LaTeX — `$...$` inside a sentence, `$$...$$` for a line of working on its own — because
 * "divide both sides by three x" is a sentence a student has to decode before they can read
 * it, and `x2 + 3x` is worse still: it is not a typographical inconvenience, it is a
 * different expression from the one the examiner set.
 *
 * Used by the coach's board and by every place a question is shown: the check-up, practice,
 * the diagnostic and the reviewer's queue. A reviewer approving a question must see exactly
 * what the student will see, or the approval means nothing.
 *
 * Text containing no delimiters passes through unchanged, so wrapping a field in this is
 * safe before any of its content has been converted.
 *
 * WHY THIS SPLITS THE STRING. The reply is written by a model, so none of it may become HTML.
 * Only the expression between the delimiters is handed to KaTeX, whose output is KaTeX's own
 * markup built from an escaped input; the prose around it stays a React text node and is
 * escaped the way every other string in this app is. `trust: false` turns off the commands
 * that would let a formula reach outside itself — `\href`, `\url`, `\includegraphics`.
 *
 * WHAT HAPPENS WHEN IT WILL NOT PARSE. The student sees the raw `$...$`. Ugly, and better
 * than a blank where the working was: the same reason the tutor serves a reviewed step
 * instead of an error.
 */

import katex from 'katex';
// mhchem adds \ce{...} for Chemistry: formulae, equations and nuclides ($\ce{H2SO4}$).
import 'katex/contrib/mhchem';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import 'katex/dist/katex.min.css';

/** `$$...$$` first, so a display block is not read as two inline ones. */
const SEGMENT = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function typeset(expression: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(expression, {
      displayMode,
      // A malformed formula is shown in KaTeX's own error style rather than thrown, so one
      // bad expression cannot take the reply down with it.
      throwOnError: false,
      trust: false,
      output: 'html',
    });
  } catch {
    return null;
  }
}

/** Smallest a table or formula is shrunk to before it scrolls sideways instead. */
const MIN_FIT_SCALE = 0.55;

/**
 * A formula or table that cannot wrap, shrunk just enough to fit the width it is given.
 *
 * A frequency table in a question stem is wider than a phone, and a scroll bar hides the
 * columns the question is about. So the type is scaled down to fit, re-measured whenever the
 * box changes width; only past MIN_FIT_SCALE, where it would stop being readable, does it fall
 * back to scrolling.
 */
function FitToWidth({ html, display }: { html: string; display: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    const holder = element?.parentElement;
    if (!element || !holder) return;
    const fit = () => {
      element.style.fontSize = '';
      const natural = element.scrollWidth;
      const room = holder.clientWidth;
      if (natural > room + 1 && room > 0) {
        const scale = Math.max(MIN_FIT_SCALE, room / natural);
        element.style.fontSize = `${scale.toFixed(3)}em`;
      }
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(holder);
    return () => watcher.disconnect();
  }, [html]);
  return (
    <span
      ref={box}
      className={display ? 'sp-maths block sp-fit' : 'sp-maths sp-fit'}
      // Not the model's text: KaTeX's markup, built from an escaped expression.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** `*word*` in English items: the word the question is about, underlined on the paper. */
const TARGET = /\*([^*\n]+)\*/g;

/**
 * Prose around the mathematics. Blank lines are paragraph breaks (a passage keeps its
 * paragraphs), and `*word*` is the tested word, shown the way the paper shows it. Plain React
 * text throughout: nothing here becomes HTML.
 */
function prose(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/\n\s*\n/).forEach((paragraph, p) => {
    if (p > 0) out.push(<span key={`${key}-br${p}`} className="sp-para-break" aria-hidden="true" />);
    let at = 0;
    for (const hit of paragraph.matchAll(TARGET)) {
      const from = hit.index ?? 0;
      if (from > at) out.push(paragraph.slice(at, from));
      out.push(
        <em key={`${key}-t${p}-${from}`} className="sp-target">
          {hit[1]}
        </em>,
      );
      at = from + hit[0].length;
    }
    if (at < paragraph.length) out.push(paragraph.slice(at));
  });
  return out;
}

export function Maths({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SEGMENT)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(...prose(text.slice(cursor, start), `p${cursor}`));

    const display = match[1] !== undefined;
    const html = typeset((match[1] ?? match[2] ?? '').trim(), display);
    parts.push(
      html === null ? (
        match[0]
      ) : display || html.includes('mtable') ? (
        // A displayed formula or a table cannot wrap, so it is shrunk to fit its box.
        <FitToWidth key={`${start}`} html={html} display={display} />
      ) : (
        <span
          key={`${start}`}
          className="sp-maths"
          // Not the model's text: KaTeX's markup, built from an escaped expression.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ),
    );
    cursor = start + match[0].length;
  }

  if (cursor < text.length) parts.push(...prose(text.slice(cursor), `p${cursor}`));
  return <>{parts}</>;
}
