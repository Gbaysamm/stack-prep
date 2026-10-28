/**
 * The "about you" fields: name (optional here), class, school, state, and the institution and
 * course aimed for. Account settings and onboarding both use them; every one is optional
 * except the name in settings.
 */
import { useId, type ReactNode } from 'react';

import type { ClassLevel, StudentProfile } from '../student/api.js';
import { Select } from '../lib/Select.js';
import { CLASS_LEVELS, NIGERIAN_STATES } from './profileFields.js';
import './AboutFields.css';

export type AboutDraft = {
  display_name: string;
  school_name: string;
  state: string;
  class_level: ClassLevel | '';
  target_institution: string;
  target_course: string;
};

export function draftOf(profile: StudentProfile | null): AboutDraft {
  return {
    display_name: profile?.display_name ?? '',
    school_name: profile?.school_name ?? '',
    state: profile?.state ?? '',
    class_level: profile?.class_level ?? '',
    target_institution: profile?.target_institution ?? '',
    target_course: profile?.target_course ?? '',
  };
}

/** The fields that differ, as a profile change (blank becomes null). */
export function aboutChange(draft: AboutDraft, saved: AboutDraft): Record<string, string | null> {
  const change: Record<string, string | null> = {};
  for (const key of Object.keys(draft) as (keyof AboutDraft)[]) {
    if (draft[key].trim() !== saved[key].trim()) change[key] = draft[key].trim() || null;
  }
  return change;
}

export function AboutField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="sj-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function AboutFields({
  draft,
  onChange,
  withName,
}: {
  draft: AboutDraft;
  onChange: (key: keyof AboutDraft, value: string) => void;
  withName?: boolean;
}) {
  const text = (key: keyof AboutDraft, label: string, max: number, placeholder?: string, auto?: string) => (
    <AboutField label={label}>
      {(id) => (
        <input
          id={id}
          className="sj-input"
          value={draft[key]}
          maxLength={max}
          placeholder={placeholder}
          autoComplete={auto ?? 'off'}
          onChange={(event) => onChange(key, event.target.value)}
        />
      )}
    </AboutField>
  );
  return (
    <div className="about-grid">
      {withName ? text('display_name', 'Your name', 60, undefined, 'name') : null}
      <AboutField label="Class">
        {(id) => (
          <Select
            id={id}
            value={draft.class_level}
            onChange={(value) => onChange('class_level', value)}
            placeholder="Choose…"
            options={[{ value: '', label: 'Not saying' }, ...CLASS_LEVELS.map((level) => ({ value: level.value, label: level.label }))]}
          />
        )}
      </AboutField>
      {text('school_name', 'Your school', 160, 'e.g. Kings College, Lagos')}
      <AboutField label="State">
        {(id) => (
          <Select
            id={id}
            value={draft.state}
            onChange={(value) => onChange('state', value)}
            placeholder="Choose…"
            options={[
              { value: '', label: 'Not saying' },
              ...(draft.state && !NIGERIAN_STATES.includes(draft.state) ? [{ value: draft.state, label: draft.state }] : []),
              ...NIGERIAN_STATES.map((state) => ({ value: state, label: state })),
            ]}
          />
        )}
      </AboutField>
      {text('target_institution', 'University you’re aiming for', 160, 'e.g. University of Lagos')}
      {text('target_course', 'Course you want to study', 120, 'e.g. Medicine and Surgery')}
    </div>
  );
}
