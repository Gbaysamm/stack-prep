/**
 * The journey: a student's path as a ladder in one card, done, current and ahead. Square
 * tiles on a line down the left, the words in one column, and the current step as a lit row
 * carrying its one action. Used for a new student's Home and for the roadmap.
 */
import type { ReactNode } from 'react';

import { IconCheck, IconLock } from './icons.js';
import { cx } from './ui.js';
import './Journey.css';

export type StopState = 'done' | 'current' | 'locked';

export interface Stop {
  key: string;
  title: string;
  /** A few words under the title. */
  line?: string;
  icon: ReactNode;
  state: StopState;
  /** The finish: a gold tile. */
  finish?: boolean;
  /** A subtopic's level, 0 to 5: five pips, filled to it. */
  level?: number;
  /** A label between stops ("Today", "Tomorrow"), not a stop itself. */
  heading?: boolean;
}

export const LEVEL_NAMES = ['Not started', 'Weak', 'Developing', 'Exam-ready', 'Strong', 'Mastered'];

function Pips({ level }: { level: number }) {
  return (
    <span className="jr-pips" role="img" aria-label={`Level ${level} of 5: ${LEVEL_NAMES[level]}`} title={`Level ${level} of 5: ${LEVEL_NAMES[level]}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}

/**
 * `continues`: the path goes on past what is shown. The last stops fade and the line runs out
 * of the card, so the list never reads as all there is.
 */
export function Journey({ stops, action, continues }: { stops: Stop[]; action?: ReactNode; continues?: boolean }) {
  return (
    <ol className={cx('sj-card sticker jr', continues && 'continues')}>
      {stops.map((stop, index) => {
        const next = stops[index + 1];
        if (stop.heading) {
          return (
            <li key={stop.key} className="jr-head sj-mono">
              {stop.title}
            </li>
          );
        }
        return (
          <li
            key={stop.key}
            className={cx('jr-step', stop.state, stop.finish && 'finish', next && next.state !== 'locked' && 'walked')}
          >
            <span className="jr-tile" aria-hidden="true">
              {stop.state === 'done' ? <IconCheck size={20} /> : stop.icon}
            </span>
            <span className="jr-words">
              <b>{stop.title}</b>
              {stop.line ? <span>{stop.line}</span> : null}
            </span>
            <span className="jr-end">
              {/* A topic not started yet has no level to show: five grey squares would say nothing. */}
              {stop.level ? <Pips level={stop.level} /> : null}
              {stop.state === 'current' && action ? (
                action
              ) : stop.state === 'done' ? (
                <span className="jr-done sj-mono">Done</span>
              ) : stop.state === 'locked' && !stop.finish ? (
                <IconLock size={16} className="jr-lock" />
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
