/**
 * Badges in the app (founder, 18 Nov 2026; apps/api badges.py): the art, the shelf on Progress,
 * and the watcher that shows each new badge once, and a new level once, on the next ordinary
 * page (never in the middle of a run).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { failure, reach } from '../lib/friendlyError.js';
import { Celebrate } from './Celebrate.js';
import { useGame } from './gameApi.js';
import {
  IconBolt,
  IconBook,
  IconCheck,
  IconClock,
  IconFlame,
  IconLock,
  IconSpark,
  IconTarget,
  IconTrophy,
} from './icons.js';
import './Badges.css';

export interface BadgeView {
  id: string;
  name: string;
  line: string;
  tone: string;
  icon: string;
}
export interface ShelfBadge extends BadgeView {
  unlocked_at: string | null;
  progress: number;
  target: number;
}

const ICONS = {
  target: IconTarget,
  book: IconBook,
  clock: IconClock,
  check: IconCheck,
  flame: IconFlame,
  spark: IconSpark,
  trophy: IconTrophy,
  bolt: IconBolt,
} as const;

/** A round sticker in the badge's colour with its icon; grey with a lock while locked. */
export function BadgeArt({
  badge,
  size = 88,
  locked = false,
}: {
  badge: Pick<BadgeView, 'tone' | 'icon'>;
  size?: number;
  locked?: boolean;
}) {
  const Icon = locked ? IconLock : (ICONS[badge.icon as keyof typeof ICONS] ?? IconTrophy);
  return (
    <span className={`bg-art ${locked ? 'locked' : badge.tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.42)} />
    </span>
  );
}

/** The level as art: the number on a purple disc. */
export function LevelArt({ level, size = 88 }: { level: number; size?: number }) {
  return (
    <span className="bg-art level" style={{ width: size, height: size }} aria-hidden="true">
      <b className="sj-display" style={{ fontSize: Math.round(size * 0.42) }}>
        {level}
      </b>
    </span>
  );
}

const levelKey = (studentId: string) => `sp-level-${studentId}`;

type Moment = { badge: BadgeView } | { level: number };

/** Shows each new badge once, then a new level once, on ordinary pages. */
export function BadgeWatcher({ studentId }: { studentId: string }) {
  const { pathname } = useLocation();
  const game = useGame(studentId, pathname);
  const [queue, setQueue] = useState<Moment[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!game) return;
    const next: Moment[] = [];
    for (const badge of game.badges_new ?? []) if (!shown.has(badge.id)) next.push({ badge });
    let seenLevel = 0;
    try {
      seenLevel = Number(localStorage.getItem(levelKey(studentId)) ?? '0');
    } catch {
      seenLevel = game.level;
    }
    if (!seenLevel) {
      // The first time on this device: remember the level, with no moment.
      try {
        localStorage.setItem(levelKey(studentId), String(game.level));
      } catch {
        /* nothing to remember with */
      }
    } else if (game.level > seenLevel && !shown.has(`level-${game.level}`)) {
      next.push({ level: game.level });
    }
    if (next.length) {
      setShown((now) => {
        const all = new Set(now);
        for (const m of next) all.add('badge' in m ? m.badge.id : `level-${m.level}`);
        return all;
      });
      setQueue((now) => [...now, ...next]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const current = queue[0];
  if (!current) return null;
  const done = () => {
    setQueue((now) => now.slice(1));
    if ('badge' in current) {
      void reach(`/v1/student/${studentId}/badges/seen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [current.badge.id] }),
      }).catch(() => undefined);
    } else {
      try {
        localStorage.setItem(levelKey(studentId), String(current.level));
      } catch {
        /* shown once this visit anyway */
      }
    }
  };
  return 'badge' in current ? (
    <Celebrate
      title={current.badge.name}
      sub={`New badge · ${current.badge.line}`}
      next="Nice"
      onDone={done}
      art={<BadgeArt badge={current.badge} />}
    />
  ) : (
    <Celebrate
      title={`Level ${current.level}`}
      sub="You levelled up. Keep learning to reach the next one."
      next="Keep going"
      onDone={done}
      art={<LevelArt level={current.level} />}
    />
  );
}

/** Every badge: unlocked in colour with the date, locked grey with how far along (Progress). */
export function BadgeShelf({ studentId }: { studentId: string }) {
  const [shelf, setShelf] = useState<ShelfBadge[] | null>(null);
  const game = useGame(studentId);
  useEffect(() => {
    reach(`/v1/student/${studentId}/badges`)
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        setShelf((await response.json()) as ShelfBadge[]);
      })
      .catch(() => setShelf([]));
  }, [studentId]);
  if (!shelf || !shelf.length) return null;
  const got = shelf.filter((b) => b.unlocked_at).length;
  return (
    <div className="bg-shelf sj-card">
      {game ? (
        <div className="bg-level">
          <LevelArt level={game.level} size={48} />
          <div className="bg-level-text">
            <b>Level {game.level}</b>
            <span className="bg-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((100 * game.level_into) / Math.max(1, game.level_needs))}%` }} />
            </span>
            <small>
              {game.xp_total.toLocaleString()} XP · {(game.level_needs - game.level_into).toLocaleString()} to level {game.level + 1}
            </small>
          </div>
        </div>
      ) : null}
      <p className="bg-count">
        <b>{got}</b> of {shelf.length} unlocked
      </p>
      <ul className="bg-grid">
        {shelf.map((badge) => {
          const locked = !badge.unlocked_at;
          return (
            <li key={badge.id} className={locked ? 'locked' : undefined} title={badge.line}>
              <BadgeArt badge={badge} size={56} locked={locked} />
              <b>{badge.name}</b>
              <small>
                {locked
                  ? `${badge.progress.toLocaleString()}/${badge.target.toLocaleString()}`
                  : new Date(badge.unlocked_at ?? '').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
