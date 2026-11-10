/**
 * The journey: a student's path drawn as a winding trail of raised circles, done, current and
 * ahead (locked). Our own take on a learning path: the current circle glows and carries its
 * one action in a callout; the trail ends at exam day. Used for a new student's Home and for
 * the roadmap.
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
  /** The finish: drawn larger, in gold. */
  finish?: boolean;
}

/** How far each stop sits from the centre, in turn: the trail's sway. */
const SWAY = [-70, 10, 80, 10, -70, 10, 80, 10];
const ROW = 118;
const WIDTH = 420;

export function Journey({ stops, action }: { stops: Stop[]; action?: ReactNode }) {
  const points = stops.map((_, index) => ({
    x: WIDTH / 2 + SWAY[index % SWAY.length]!,
    y: ROW / 2 + index * ROW,
  }));
  const height = stops.length * ROW;
  const segment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mid = (from.y + to.y) / 2;
    return `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}`;
  };
  return (
    <div className="jr">
      <div className="jr-track" style={{ width: WIDTH, height }}>
        <svg className="jr-line" width={WIDTH} height={height} aria-hidden="true">
          {points.slice(1).map((point, index) => (
            <path
              key={index}
              d={segment(points[index]!, point)}
              className={stops[index + 1]!.state === 'locked' ? 'ahead' : 'walked'}
            />
          ))}
        </svg>
        <ol className="jr-stops">
          {stops.map((stop, index) => (
            <li
              key={stop.key}
              // The label goes on the side with room: right of a stop left of centre, else left.
              className={cx('jr-stop', stop.state, stop.finish && 'finish', points[index]!.x > WIDTH / 2 ? 'right' : 'left')}
              style={{ left: points[index]!.x, top: points[index]!.y }}
            >
              <span className="jr-node" aria-hidden="true">
                {stop.state === 'done' ? <IconCheck size={30} /> : stop.state === 'locked' && !stop.finish ? <IconLock size={24} /> : stop.icon}
              </span>
              {stop.state === 'current' ? <span className="jr-pulse" aria-hidden="true" /> : null}
              <span className={cx('jr-label', stop.state === 'current' && 'callout')}>
                <b>{stop.title}</b>
                {stop.line ? <span>{stop.line}</span> : null}
                {stop.state === 'current' && action ? <span className="jr-go">{action}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
