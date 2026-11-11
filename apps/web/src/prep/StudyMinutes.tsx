/**
 * How long a study day is: only the times that work for the days left are offered (from the
 * least the plan needs, studyTime.ts, up to five hours), plus a custom time. A time that is too
 * short is never shown, rather than shown and struck out.
 */
import { useEffect, useState } from 'react';

import { MAX_RUNS_PER_DAY, RUN_MINUTES, type LeastTime } from './studyTime.js';
import { cx } from './ui.js';
import './StudyMinutes.css';

const IconMinus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const LADDER = [15, 30, 45, 60, 90, 120, 180, 240, 300];
/** Chips shown: the least and the next few longer times; Custom covers the rest. */
const SHOWN = 5;
const MOST = MAX_RUNS_PER_DAY * RUN_MINUTES;
/** 45 → "45 min", 90 → "1 h 30", 120 → "2 h". */
const length = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);

export function StudyMinutes({
  value,
  onChange,
  least,
  labelledBy,
}: {
  value: number;
  onChange: (minutes: number) => void;
  least: LeastTime | null;
  labelledBy: string;
}) {
  const floor = least?.minutes ?? RUN_MINUTES;
  const chips = [floor, ...LADDER.filter((m) => m > floor)].slice(0, SHOWN);
  const [custom, setCustom] = useState(() => !chips.includes(value));

  // A time below the least is raised to it as soon as the date or days make it too short.
  useEffect(() => {
    if (value < floor) onChange(floor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  return (
    <div className="sm">
      <div className="sm-chips" role="group" aria-labelledby={labelledBy}>
        {chips.map((m) => (
          <button
            key={m}
            type="button"
            className="sj-chip"
            aria-pressed={!custom && value === m}
            onClick={() => {
              setCustom(false);
              onChange(m);
            }}
          >
            {length(m)}
          </button>
        ))}
        <button type="button" className="sj-chip" aria-pressed={custom} onClick={() => setCustom(true)}>
          Custom
        </button>
      </div>
      {custom ? (
        <div className="sm-custom" role="group" aria-label="Your own time a day">
          <button
            type="button"
            className="sm-step"
            aria-label="15 minutes less"
            disabled={value <= floor}
            onClick={() => onChange(Math.max(floor, value - RUN_MINUTES))}
          >
            <IconMinus />
          </button>
          <span className="sm-value" aria-live="polite">
            <b>{length(value)}</b>
            <span>a day</span>
          </span>
          <button
            type="button"
            className="sm-step"
            aria-label="15 minutes more"
            disabled={value >= MOST}
            onClick={() => onChange(Math.min(MOST, value + RUN_MINUTES))}
          >
            <IconPlus />
          </button>
        </div>
      ) : null}
      {least ? (
        <p className={cx('sm-note', !least.enough && 'short')} aria-live="polite">
          {least.enough
            ? `${least.daysLeft} days to go, so at least ${length(least.minutes)} a day.`
            : `${least.daysLeft} days to go: even 5 hours a day won't reach every topic, so your plan starts with the ones that come up most.`}
        </p>
      ) : null}
    </div>
  );
}
