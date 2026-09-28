/**
 * The streak chip in the top bar, and the dialog it opens.
 *
 * The server sends the streak as two facts (`streak_days`, `active_today`; apps/api
 * routers/progress.py `streak`): consecutive days with at least one answer in practice, a guided
 * run or a check-up, ending today, or ending yesterday while today has not started. It sends no
 * day-by-day list, so the row of days is drawn from what is known:
 *  - the streak's own days are exact (they are the `streak_days` days ending today or yesterday),
 *    and so is the day just before it (a gap, or the streak would be longer);
 *  - older days come from the run history: a day on which a run with answers was started.
 *    Check-ups are not in that list, so an older day may show empty when a check-up was done.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { IconArrowRight, IconCheck, IconFlame } from './icons.js';
import { progressApi, type Overview, type PracticeRun } from './progressApi.js';
import { Button, Dialog, cx } from './ui.js';
import './Streak.css';

/** Two weeks: enough to see a habit, short enough to read at a glance on a phone. */
const DAYS = 14;

type DayState = 'done' | 'missed' | 'today' | 'none';

interface Day {
  date: Date;
  state: DayState;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function streakDays(
  streak: number,
  activeToday: boolean,
  runs: Pick<PracticeRun, 'started_at' | 'answered'>[],
  now = new Date(),
): Day[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const practised = new Set(runs.filter((run) => run.answered > 0).map((run) => dayKey(new Date(run.started_at))));
  // Days back from today (0 = today) that the streak covers, exactly.
  const first = activeToday ? 0 : 1;
  const last = first + streak - 1;
  const days: Day[] = [];
  for (let back = DAYS - 1; back >= 0; back--) {
    const date = new Date(today);
    date.setDate(today.getDate() - back);
    let state: DayState;
    if (back === 0) state = activeToday ? 'done' : 'today';
    else if (streak > 0 && back >= first && back <= last) state = 'done';
    else if (back === last + 1 || (streak === 0 && back === 1)) state = 'missed';
    else state = practised.has(dayKey(date)) ? 'done' : 'none';
    days.push({ date, state });
  }
  return days;
}

const STATE_WORD: Record<DayState, string> = {
  done: 'practised',
  missed: 'no practice',
  none: 'no practice',
  today: 'not yet',
};

/** The chip: a real button, so it takes focus, Enter and Space like any other. */
export function StreakChip({ overview, studentId }: { overview: Overview; studentId: string }) {
  // Development only: `?demo=streak` opens the dialog on load, for screenshots.
  const [open, setOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'streak',
  );
  const streak = overview.streak_days;
  return (
    <>
      <button
        type="button"
        className={cx('sj-streak sj-topstreak', overview.active_today && 'on')}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={streak > 0 ? `${streak}-day streak. Open your streak` : 'No streak yet. Open your streak'}
      >
        <IconFlame size={17} />
        <span className="sj-topstreak-long">{streak > 0 ? `${streak}-day streak` : 'No streak yet'}</span>
        <span className="sj-topstreak-short" aria-hidden="true">
          {streak}
        </span>
      </button>
      <StreakDialog open={open} onClose={() => setOpen(false)} overview={overview} studentId={studentId} />
    </>
  );
}

function StreakDialog({
  open,
  onClose,
  overview,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  overview: Overview;
  studentId: string;
}) {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Pick<PracticeRun, 'started_at' | 'answered'>[]>(overview.recent_runs);
  // More of the run history, once the dialog is open, for the days before the streak.
  useEffect(() => {
    if (!open) return;
    let live = true;
    progressApi
      .runs(studentId, 100)
      .then((page) => live && setRuns(page.runs))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, studentId]);

  const streak = overview.streak_days;
  const today = overview.active_today;
  const days = streakDays(streak, today, runs);
  const status = today
    ? { tone: 'done', text: 'Today counts. You’ve answered a question today.' }
    : streak > 0
      ? { tone: 'wait', text: 'Not yet today. Answer one question before midnight to keep it.' }
      : { tone: 'wait', text: 'Answer one question today to start a streak.' };

  const go = () => {
    onClose();
    navigate('/practice');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your streak"
      actions={
        <>
          <Button tone="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={go} trailing={<IconArrowRight size={18} />}>
            {today ? 'Practise more' : 'Practise now'}
          </Button>
        </>
      }
    >
      <div className="sk">
        <div className="sk-top">
          <span className={cx('sk-flame', today && 'on')} aria-hidden="true">
            <IconFlame size={26} />
          </span>
          <span className="sk-num">
            <span className="sj-num">{streak}</span>
            <span className="sk-unit">{streak === 1 ? 'day in a row' : 'days in a row'}</span>
          </span>
        </div>

        <p className={cx('sk-status', status.tone)}>
          <span className="sk-status-ico" aria-hidden="true">
            {status.tone === 'done' ? <IconCheck size={14} /> : null}
          </span>
          {status.text}
        </p>

        <div className="sk-days-wrap">
          <span className="sk-days-label">The last two weeks, today last</span>
          <ol className="sk-days">
            {days.map((day, index) => {
              const label = day.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
              return (
                <li key={index} className={cx('sk-day', day.state, index === days.length - 1 && 'is-today')}>
                  <span className="sk-dot">
                    {day.state === 'done' ? <IconCheck size={12} /> : null}
                  </span>
                  <span className="sk-wd" aria-hidden="true">
                    {day.date.toLocaleDateString('en-GB', { weekday: 'narrow' })}
                  </span>
                  <span className="sk-sr">
                    {label}: {STATE_WORD[day.state]}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="sk-rule">
          A day counts when you answer at least one question, in practice or a check-up. Yesterday still counts until
          today ends, so answer one before midnight to keep your streak going.
        </p>
      </div>
    </Dialog>
  );
}
