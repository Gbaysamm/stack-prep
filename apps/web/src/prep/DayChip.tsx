/**
 * Today's plan as a small ring in the top bar, beside the streak (founder, 18 Nov 2026: the daily
 * goal is today's roadmap). It fills as the day's items are done and turns green when they all
 * are; a tap opens the roadmap. Nothing when there is no plan today.
 */
import { Link, useLocation } from 'react-router-dom';

import { useGame } from './gameApi.js';
import './DayChip.css';

export function DayChip({ studentId }: { studentId: string }) {
  const { pathname } = useLocation();
  const game = useGame(studentId, pathname);
  if (!game || game.plan_total === 0) return null;
  const share = Math.min(1, game.plan_done / game.plan_total);
  const done = game.plan_done >= game.plan_total;
  const C = 2 * Math.PI * 9;
  return (
    <Link
      to="/roadmap"
      className={`dc ${done ? 'done' : ''}`}
      aria-label={`Today's plan: ${game.plan_done} of ${game.plan_total} done`}
      title="Today's plan"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle className="dc-track" cx="12" cy="12" r="9" />
        <circle className="dc-fill" cx="12" cy="12" r="9" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - share) }} />
      </svg>
      <b className="sj-mono">
        {game.plan_done}/{game.plan_total}
      </b>
      <span className="dc-word">today</span>
    </Link>
  );
}
