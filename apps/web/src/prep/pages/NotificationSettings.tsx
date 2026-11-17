/**
 * Settings → Notifications (founder, 17 Nov 2026): what comes by email. Three switches, each
 * saved the moment it is flipped (and put back if the server refuses). Everything always shows in
 * the app's bell; these are only the emails.
 */
import { useEffect, useState } from 'react';

import { failure, friendly, reach } from '../../lib/friendlyError.js';
import { Skeleton, useToast } from '../ui.js';

interface Prefs {
  email_reminders: boolean;
  email_reports: boolean;
  email_account: boolean;
  email: string | null;
}
type Key = 'email_reminders' | 'email_reports' | 'email_account';

const ROWS: { key: Key; name: string; line: string }[] = [
  {
    key: 'email_reminders',
    name: 'Reminders',
    line: 'When your streak is at risk, after a missed day, the exam countdown, and mocks on your plan. One a day at most.',
  },
  { key: 'email_reports', name: 'Weekly report', line: 'Every Sunday evening: your week in practice and what to focus on next.' },
  { key: 'email_account', name: 'Account and plan', line: 'Your plan starting or ending, and changes to your password or login.' },
];

export function NotificationSettings({ studentId }: { studentId: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const toast = useToast();
  const url = `/v1/student/${studentId}/notification-settings`;

  useEffect(() => {
    reach(url)
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        setPrefs((await response.json()) as Prefs);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [url]);

  const flip = (key: Key) => {
    if (!prefs) return;
    const before = prefs;
    const on = !prefs[key];
    setPrefs({ ...prefs, [key]: on });
    reach(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [key]: on }) })
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        toast(`${ROWS.find((r) => r.key === key)?.name} emails ${on ? 'on' : 'off'}`);
      })
      .catch((error) => {
        setPrefs(before);
        toast(friendly(error));
      });
  };

  if (!prefs) {
    return problem ? <p className="rs-error">{problem}</p> : <Skeleton height={220} radius={10} />;
  }
  return (
    <div className="sj-card rs ns">
      {prefs.email ? null : (
        <p className="ns-note">
          Add an email under <a href="#set-signin">Signing in</a> to get these. Until then everything shows in the app's bell.
        </p>
      )}
      {ROWS.map((row) => (
        <div key={row.key} className="rs-row">
          <div className="rs-words">
            <b id={`ns-${row.key}`}>{row.name}</b>
            <small>{row.line}</small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs[row.key]}
            aria-labelledby={`ns-${row.key}`}
            className={`ns-switch ${prefs[row.key] ? 'on' : ''}`}
            onClick={() => flip(row.key)}
          >
            <i aria-hidden="true" />
          </button>
        </div>
      ))}
      <p className="ns-foot">
        {prefs.email ? `Sent to ${prefs.email}. ` : ''}In the app, the bell always shows everything.
      </p>
    </div>
  );
}
