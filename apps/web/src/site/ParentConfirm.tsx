/**
 * /parent/:token — where the Confirm button in a parent's invitation email leads (apps/api
 * routers/parents.py). No sign-in: the link is the proof. It asks for one tap rather than
 * confirming on opening, because mail scanners open links on their own.
 */
import { useEffect, useState } from 'react';

import { failure, friendly, reach } from '../lib/friendlyError.js';
import '../prep/prep.css';
import './ParentConfirm.css';

interface Invitation {
  student_name: string;
  parent_name: string;
  confirmed: boolean;
}

export function ParentConfirm() {
  const token = window.location.pathname.split('/')[2] ?? '';
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Confirm · Stack Prep';
    reach(`/v1/public/parents/${token}`)
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        setInvite((await response.json()) as Invitation);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const response = await reach(`/v1/public/parents/${token}/confirm`, { method: 'POST' });
      if (!response.ok) throw await failure(response);
      setInvite((await response.json()) as Invitation);
    } catch (error) {
      setProblem(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  const student = invite?.student_name.split(' ')[0] ?? '';
  return (
    <div className="sj pc">
      <main className="pc-card">
        <div className="pc-brand">
          <img src="/brand/mark-96.png" alt="" width={34} height={34} />
          <span className="sj-display">Stack Prep</span>
        </div>
        <section className="pc-sticker">
          <div className="pc-hero">
            <span className="pc-eyebrow">For parents</span>
            <h1 className="sj-display">
              {problem
                ? 'This link has expired'
                : !invite
                  ? 'One moment…'
                  : invite.confirmed
                    ? "You're all set"
                    : `${student} added you on Stack Prep`}
            </h1>
          </div>
          <div className="pc-body">
            {problem ? (
              <p>{problem}</p>
            ) : !invite ? null : invite.confirmed ? (
              <>
                <p>
                  Thank you, {invite.parent_name.split(' ')[0]}. You'll get {student}'s weekly report every Sunday evening,
                  and a note if three days pass without study.
                </p>
                <p className="pc-quiet">You can close this page.</p>
              </>
            ) : (
              <>
                <p>
                  {invite.student_name} is preparing for their exams with Stack Prep and added you as their parent or
                  guardian.
                </p>
                <ul className="pc-list">
                  <li>
                    <b>A weekly report</b> every Sunday evening: days studied, questions, accuracy and next week's
                    focus.
                  </li>
                  <li>
                    <b>An alert if they stop</b>, when three days pass without study.
                  </li>
                </ul>
                <button type="button" className="sj-btn pc-go" disabled={busy} onClick={() => void confirm()}>
                  {busy ? 'Confirming…' : 'Confirm'}
                </button>
                <p className="pc-quiet">Don't know {student}? Close this page. Nothing is shared until you confirm.</p>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
