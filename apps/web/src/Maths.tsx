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
import type { ReactNode } from 'react';

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

export function Maths({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SEGMENT)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text.slice(cursor, start));

    const display = match[1] !== undefined;
    const html = typeset((match[1] ?? match[2] ?? '').trim(), display);
    parts.push(
      html === null ? (
        match[0]
      ) : (
        <span
          key={`${start}`}
          className={display ? 'sp-maths block' : 'sp-maths'}
          // Not the model's text: KaTeX's markup, built from an escaped expression.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ),
    );
    cursor = start + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
