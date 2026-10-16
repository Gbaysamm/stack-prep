/**
 * What an option says: its words, or, for a question whose printed options are drawings (four
 * transistor symbols), its picture.
 *
 * A drawn option's text is only a neutral label ("Symbol A"), so the picture leads and the
 * label sits small under it. The label stays in the page, not hidden, so a screen reader reads
 * the picture's alt text and then the label the option is marked by.
 *
 * The picture is loaded through <img>, as every figure is (Figures.tsx): an SVG in an <img> is
 * only ever a picture. It sits on white whatever the option's state, because the drawings are
 * dark ink with no background of their own; the option's own border still shows its state.
 */

import { Maths } from './Maths.js';
import type { OptionFigure } from './Figures.js';

export function OptionBody({
  body,
  figure,
  size = 'full',
}: {
  body: string;
  figure?: OptionFigure | null;
  /** `small` for an option quoted back in a line ("Your answer"), not the option itself. */
  size?: 'full' | 'small';
}) {
  if (!figure) return <Maths text={body} />;
  return (
    <span className={`sp-option-pic ${size === 'small' ? 'small' : ''}`}>
      <img
        src={figure.url}
        alt={figure.alt_text ?? body}
        width={figure.width ?? undefined}
        height={figure.height ?? undefined}
        loading="eager"
        decoding="async"
        draggable={false}
      />
      <span className="sp-option-label">
        <Maths text={body} />
      </span>
    </span>
  );
}

/** True when any option is a picture: the list then lays out as a grid of pictures. */
export function hasOptionPictures(options: readonly { figure?: OptionFigure | null }[]): boolean {
  return options.some((option) => Boolean(option.figure));
}
