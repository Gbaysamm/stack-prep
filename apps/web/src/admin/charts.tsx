/**
 * The admin dashboard's charts: columns over time (or over bands), and ranked bars.
 *
 * Every chart here shows one measure, so it is one colour and needs no legend; its heading
 * says what it shows. Columns are drawn at the container's real width (no stretched viewBox,
 * so text stays its size), at most 24px thick with a rounded top, on hairline gridlines.
 * Hovering or focusing a column shows its value; a hidden table carries every value for
 * screen readers.
 */
import { useEffect, useRef, useState } from 'react';
import './charts.css';

export interface Column {
  /** Under the axis, when there is room for it. */
  label: string;
  /** In the tooltip and the table: the column's full name, e.g. "Tue 14 Oct". */
  title: string;
  value: number;
}

const compact = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`;

/**
 * A clean top for the axis: twice a whole step of 1, 2 or 5 times a power of ten, so both
 * gridlines above zero are whole numbers (counts are never 12.5).
 */
function niceMax(value: number): number {
  const half = Math.max(1, value / 2);
  const power = 10 ** Math.floor(Math.log10(half));
  const step = [1, 2, 5, 10].find((m) => m * power >= half) ?? 10;
  return 2 * step * power;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function ColumnChart({
  columns,
  format = compact,
  height = 180,
  label,
  every,
}: {
  columns: Column[];
  format?: (value: number) => string;
  height?: number;
  /** What the chart shows, for screen readers. */
  label: string;
  /** Label every nth column under the axis; by default as many as fit. */
  every?: number;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 40;
  const bottom = 24;
  const top = 8;
  const plotWidth = Math.max(0, width - left - 4);
  const plotHeight = height - top - bottom;
  const max = niceMax(Math.max(0, ...columns.map((c) => c.value)));
  const band = columns.length ? plotWidth / columns.length : 0;
  const barWidth = Math.max(2, Math.min(24, band * 0.68));
  const step = every ?? Math.max(1, Math.ceil(columns.length / Math.max(1, Math.floor(plotWidth / 64))));
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const ticks = [0, max / 2, max];

  const bar = (value: number, x: number) => {
    const h = Math.max(0, (value / max) * plotHeight);
    if (h === 0) return '';
    const r = Math.min(4, h, barWidth / 2);
    const base = top + plotHeight;
    const yTop = base - h;
    return `M${x},${base}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barWidth - r}Q${x + barWidth},${yTop} ${x + barWidth},${yTop + r}V${base}Z`;
  };

  const shown = hover !== null ? columns[hover] : null;
  return (
    <div className="ch-box" ref={box}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="ch-grid" x1={left} x2={width - 4} y1={y(tick)} y2={y(tick)} />
              <text className="ch-tick" x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {format(tick)}
              </text>
            </g>
          ))}
          {columns.map((column, index) => {
            const x = left + band * index + (band - barWidth) / 2;
            return (
              <g key={column.title}>
                <path className={`ch-bar ${hover === index ? 'on' : ''}`} d={bar(column.value, x)} />
                {/* Counted back from the newest, so the latest column is always named. */}
                {(columns.length - 1 - index) % step === 0 ? (
                  <text className="ch-tick" x={x + barWidth / 2} y={height - 6} textAnchor="middle">
                    {column.label}
                  </text>
                ) : null}
                <rect
                  className="ch-hit"
                  x={left + band * index}
                  y={top}
                  width={band}
                  height={plotHeight}
                  tabIndex={0}
                  aria-label={`${column.title}: ${format(column.value)}`}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {shown && hover !== null && (
        <div
          className="ch-tip"
          style={{
            left: Math.min(Math.max(left + band * hover + band / 2, 70), width - 70),
            top: Math.max(0, y(shown.value) - 52),
          }}
          role="status"
        >
          <span>{shown.title}</span>
          <strong>{format(shown.value)}</strong>
        </div>
      )}
      <table className="ch-sr">
        <caption>{label}</caption>
        <tbody>
          {columns.map((column) => (
            <tr key={column.title}>
              <th scope="row">{column.title}</th>
              <td>{format(column.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
}

/** Ranked bars, largest first, with the value at each bar's tip. */
export function BarList({
  rows,
  format = compact,
  most = 10,
  label,
}: {
  rows: BarRow[];
  format?: (value: number) => string;
  most?: number;
  label: string;
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, most);
  const rest = sorted.slice(most);
  if (rest.length) {
    top.push({ key: 'other', label: `${rest.length} more`, value: rest.reduce((sum, row) => sum + row.value, 0) });
  }
  const max = Math.max(1, ...top.map((row) => row.value));
  return (
    <ul className="ch-bars" aria-label={label}>
      {top.map((row) => (
        <li key={row.key}>
          <span className="ch-bars-label">{row.label}</span>
          <span className="ch-bars-track">
            <span className="ch-bars-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="ch-bars-value">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}
