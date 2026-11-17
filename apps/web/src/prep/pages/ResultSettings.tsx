/**
 * Profile: how mock results are shown, and the overall UTME score the student is aiming for.
 * Both are kept on the student's profile; every mock screen reads them through scoreDisplay.
 */
import { useEffect, useState } from 'react';

import { api, type ScoreDisplay, type StudentProfile } from '../../student/api.js';
import { friendly } from '../../lib/friendlyError.js';
import { useLoad } from '../store.js';
import { Button, Skeleton, cx, useToast } from '../ui.js';
import './Profile.css';

const CHOICES: { value: ScoreDisplay; label: string }[] = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'aggregate', label: 'Out of 400' },
];

export function ResultSettings({ studentId }: { studentId: string }) {
  const toast = useToast();
  const load = useLoad(() => api.profile(studentId), [studentId]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!load.data) return;
    setProfile(load.data);
    setTarget(load.data.target_aggregate == null ? '' : String(load.data.target_aggregate));
  }, [load.data]);

  const save = async (change: Partial<Pick<StudentProfile, 'score_display' | 'target_aggregate'>>, done: string) => {
    setSaving(true);
    try {
      const saved = await api.updateProfile(studentId, change);
      setProfile(saved);
      setTarget(saved.target_aggregate == null ? '' : String(saved.target_aggregate));
      toast(done);
    } catch (error) {
      toast(friendly(error));
    } finally {
      setSaving(false);
    }
  };

  const typed = target.trim() === '' ? null : Number(target);
  const targetValid = typed === null || (Number.isInteger(typed) && typed >= 0 && typed <= 400);
  const targetChanged = profile != null && typed !== profile.target_aggregate;

  if (!profile) {
    return (
      <div className="sj-card pro-account">
        {load.error ? (
          <p className="pro-settings-error">
            We couldn't load your settings.{' '}
            <button type="button" className="pro-copy" onClick={load.reload}>
              Try again
            </button>
          </p>
        ) : (
          <Skeleton height={112} radius={12} />
        )}
      </div>
    );
  }

  // Two plain rows (founder, 17 Nov 2026): a bold name and one line, the control on the right;
  // our purple switch; "/ 400" inside the box; Save only once the number has changed.
  return (
    <div className="sj-card rs">
      <div className="rs-row">
        <div className="rs-words">
          <b>Mock results</b>
          <small>Shown as a percentage, or out of 400 as UTME reports it.</small>
        </div>
        <div className="rs-seg" role="radiogroup" aria-label="Show my mock results as">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={profile.score_display === choice.value}
              className={cx(profile.score_display === choice.value && 'on')}
              disabled={saving}
              onClick={() =>
                profile.score_display !== choice.value &&
                void save({ score_display: choice.value }, `Mock results now shown as ${choice.label.toLowerCase()}`)
              }
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rs-row">
        <div className="rs-words">
          <label htmlFor="pro-target">
            <b>UTME target</b>
          </label>
          <small>The total you are aiming for. Your mocks show how close you are.</small>
        </div>
        <form
          className="rs-target"
          onSubmit={(event) => {
            event.preventDefault();
            if (targetValid && targetChanged) {
              void save({ target_aggregate: typed }, typed === null ? 'UTME target cleared' : `UTME target set to ${typed}`);
            }
          }}
        >
          <span className="rs-box">
            <input
              id="pro-target"
              className="sj-num"
              inputMode="numeric"
              placeholder="280"
              value={target}
              maxLength={3}
              aria-invalid={!targetValid}
              aria-describedby={targetValid ? undefined : 'pro-target-error'}
              onChange={(event) => setTarget(event.target.value.replace(/[^0-9]/g, ''))}
            />
            <span aria-hidden="true">/ 400</span>
          </span>
          {targetChanged && targetValid ? (
            <Button size="sm" type="submit" busy={saving}>
              Save
            </Button>
          ) : null}
        </form>
        {targetValid ? null : (
          <small className="rs-error" id="pro-target-error">
            Enter a score from 0 to 400.
          </small>
        )}
      </div>
    </div>
  );
}
