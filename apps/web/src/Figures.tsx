/**
 * The diagrams printed with a question.
 *
 * Loaded by URL through <img>, never put into the page as markup: the redrawn figures are
 * SVG, and an SVG inside an <img> is only ever a picture — nothing in it runs or fetches.
 *
 * Always on white. The figures are dark ink with no background of their own, drawn as they
 * are printed on the paper, so on the board's dark surface they would all but disappear.
 */

export interface QuestionFigure {
  url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

export function Figures({ figures, compact = false }: { figures?: QuestionFigure[]; compact?: boolean }) {
  if (!figures || figures.length === 0) return null;
  return (
    <div className={`sp-figures ${compact ? 'compact' : ''}`}>
      {figures.map((figure) => (
        <img
          key={figure.url}
          src={figure.url}
          alt={figure.alt_text ?? 'The diagram printed with this question'}
          width={figure.width ?? undefined}
          height={figure.height ?? undefined}
          loading="eager"
          decoding="async"
        />
      ))}
    </div>
  );
}
