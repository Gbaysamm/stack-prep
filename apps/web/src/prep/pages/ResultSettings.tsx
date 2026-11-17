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

  return (
    <div className="sj-card pro-account">
      <dl className="pro-facts pro-settings">
        <div>
          <dt>
            Show my mock results as
            <small>
              Out of 400 is how UTME reports your score: four subjects, each out of 100. However many
              subjects a mock has, it is scaled to 400, and the percentage is shown beside it.
            </small>
          </dt>
          <dd>
            <div className="pro-seg" role="radiogroup" aria-label="Show my mock results as">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={profile.score_display === choice.value}
                  className={cx('pro-seg-btn', profile.score_display === choice.value && 'on')}
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
          </dd>
        </div>
        <div>
          <dt>
            <label htmlFor="pro-target">My UTME target</label>
            <small>The overall score you're aiming for, out of 400. Your mock results show how close you are.</small>
          </dt>
          <dd>
            <form
              className="pro-target"
              onSubmit={(event) => {
                event.preventDefault();
                if (targetValid && targetChanged) {
                  void save({ target_aggregate: typed }, typed === null ? 'UTME target cleared' : `UTME target set to ${typed}`);
                }
              }}
            >
              <span className="pro-target-box">
                <input
                  id="pro-target"
                  className="sj-input sj-num"
                  inputMode="numeric"
                  placeholder="280"
                  value={target}
                  maxLength={3}
                  aria-invalid={!targetValid}
                  aria-describedby={targetValid ? undefined : 'pro-target-error'}
                  onChange={(event) => setTarget(event.target.value.replace(/[^0-9]/g, ''))}
                />
                <span aria-hidden="true">/400</span>
              </span>
              <Button size="sm" type="submit" disabled={saving || !targetValid || !targetChanged}>
                Save
              </Button>
            </form>
            {targetValid ? null : (
              <small className="pro-target-error" id="pro-target-error">
                Enter a score from 0 to 400.
              </small>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
