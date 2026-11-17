/**
 * /unsubscribe/:token?what=reminders — the link at the foot of every notification email
 * (apps/api routers/notifications.py). No sign-in: the token is the proof. It asks for one tap
 * rather than acting on opening, because mail scanners open links on their own.
 */
import { useState } from 'react';

import { failure, friendly, reach } from '../lib/friendlyError.js';
import '../prep/prep.css';
import './Unsubscribe.css';

type What = 'reminders' | 'reports' | 'account' | 'all';

const WORDS: Record<What, string> = {
  reminders: 'reminder emails',
  reports: 'the weekly report email',
  account: 'account and plan emails',
  all: 'all emails from Stack Prep',
};

export function Unsubscribe() {
  const token = window.location.pathname.split('/')[2] ?? '';
  const asked = new URLSearchParams(window.location.search).get('what');
  const what: What = asked === 'reports' || asked === 'account' || asked === 'all' ? asked : 'reminders';
  const [done, setDone] = useState<What | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const stop = async (choice: What) => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await reach(`/v1/public/notifications/unsubscribe/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ what: choice }),
      });
      if (!response.ok) throw await failure(response);
      setDone(choice);
    } catch (error) {
      setProblem(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sj us">
      <main className="us-card sj-card">
        <img src="/brand/mark-96.png" alt="" width={44} height={44} />
        {done ? (
          <>
            <h1 className="sj-display">Done</h1>
            <p>You won't get {WORDS[done]} any more. You can turn them back on in Settings at any time.</p>
            <a className="sj-btn" href="/settings#set-notifications">
              Open Settings
            </a>
          </>
        ) : (
          <>
            <h1 className="sj-display">Stop {WORDS[what]}?</h1>
            <p>Everything else stays as it is. Notifications still show in the app.</p>
            <div className="us-actions">
              <button type="button" className="sj-btn" disabled={busy} onClick={() => void stop(what)}>
                Stop {WORDS[what]}
              </button>
              {what !== 'all' ? (
                <button type="button" className="us-link" disabled={busy} onClick={() => void stop('all')}>
                  Stop every email instead
                </button>
              ) : null}
            </div>
            {problem ? (
              <p className="us-problem" role="alert">
                {problem}
              </p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
