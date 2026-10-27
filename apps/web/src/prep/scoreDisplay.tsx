/**
 * How a mock result is shown: the percentage, or the UTME aggregate out of 400 with the
 * percentage beside it (the student's choice, kept on their profile). Read once per visit and
 * shared, and read again whenever the profile is saved.
 */
import { useEffect, useState } from 'react';
import { PROFILE_CHANGED, api, type ScoreDisplay, type StudentProfile } from '../student/api.js';
import type { Tally } from './mockApi.js';
import { cx } from './ui.js';

let cached: { studentId: string; profile: Promise<StudentProfile | null> } | null = null;

function profileOf(studentId: string): Promise<StudentProfile | null> {
  if (!cached || cached.studentId !== studentId) {
    cached = { studentId, profile: api.profile(studentId).catch(() => null) };
  }
  return cached.profile;
}

if (typeof window !== 'undefined') {
  window.addEventListener(PROFILE_CHANGED, () => {
    cached = null;
  });
}

/** The student's result settings; percentages and no target until they have loaded. */
export function useResultSettings(studentId: string | null | undefined): {
  display: ScoreDisplay;
  target: number | null;
} {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  useEffect(() => {
    if (!studentId) return;
    let live = true;
    const load = () => profileOf(studentId).then((found) => live && setProfile(found));
    void load();
    window.addEventListener(PROFILE_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(PROFILE_CHANGED, load);
    };
  }, [studentId]);
  return { display: profile?.score_display ?? 'percentage', target: profile?.target_aggregate ?? null };
}

/** A result as a number to read at a glance: "250/400 · 62%", the "/400" and percentage smaller. */
export function ResultScore({
  tally,
  display,
  className,
}: {
  tally: Tally | null | undefined;
  display: ScoreDisplay;
  className?: string;
}) {
  if (!tally || tally.percent === null) return <span className={className}>—</span>;
  if (display === 'aggregate' && tally.aggregate != null) {
    return (
      <span className={className} aria-label={`${tally.aggregate} out of 400, ${tally.percent}%`}>
        <span className="sj-num">{tally.aggregate}</span>
        <small className="score-of">/400 · {tally.percent}%</small>
      </span>
    );
  }
  return <span className={cx(className, 'sj-num')}>{tally.percent}%</span>;
}
