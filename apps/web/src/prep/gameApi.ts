/**
 * The student's game state (apps/api routers/game.py): XP and level, the streak, and today's
 * roadmap, for the reward moment and, later, the top bar and Home. `before`/`after` lets a
 * reward fill the day's ring from where it was to where it is now.
 */
import { failure, reach } from '../lib/friendlyError.js';
import type { DayRing, Gain } from './Celebrate.js';

export interface Game {
  xp_total: number;
  xp_today: number;
  level: number;
  level_into: number;
  level_needs: number;
  streak_days: number;
  active_today: boolean;
  plan_done: number;
  plan_total: number;
}

export async function loadGame(studentId: string): Promise<Game | null> {
  try {
    const response = await reach(`/v1/student/${studentId}/game`);
    if (!response.ok) throw await failure(response);
    return (await response.json()) as Game;
  } catch {
    return null; // the reward still shows, without these figures
  }
}

/** The day's ring for a reward: from today's progress before, to now. None with no plan today. */
export function dayRing(before: Game | null, after: Game | null): DayRing | undefined {
  if (!after || after.plan_total === 0) return undefined;
  return {
    from: Math.min(before?.plan_done ?? after.plan_done, after.plan_done),
    to: after.plan_done,
    of: after.plan_total,
    label: "today's plan",
  };
}

/** The streak as a gain, when there is one. */
export function streakGain(after: Game | null): Gain[] {
  return after && after.streak_days > 0 ? [{ kind: 'streak', label: 'Day streak', value: after.streak_days }] : [];
}
