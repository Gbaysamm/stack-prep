/**
 * Staff: who can review questions and who can run the dashboard, and changing that.
 *
 * A role goes to an account that already exists: the person signs up as anyone does, then an admin
 * enters their email or phone number here. An admin cannot take away their own admin role.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { useStaff } from '../staff/StaffGate.js';
import { StaffPageHead } from '../staff/StaffShell.js';

interface Member {
  student_id: string;
  display_name: string;
  login: string | null;
  role: 'reviewer' | 'admin';
  granted_at: string;
  granted_by_name: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export function StaffPage() {
  const { user } = useStaff();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<'reviewer' | 'admin'>('reviewer');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    request<Member[]>('/v1/admin/staff')
      .then((rows) => {
        setMembers(rows);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);

  const grant = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !login.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const member = await request<Member>('/v1/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim(), role }),
      });
      setNotice({ ok: true, text: `${member.display_name} is now ${role === 'admin' ? 'an admin' : 'a reviewer'}.` });
      setLogin('');
      load();
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (member: Member) => {
    if (!window.confirm(`Take away ${member.display_name}'s ${member.role} role?`)) return;
    try {
      await request(`/v1/admin/staff/${member.student_id}`, { method: 'DELETE' });
      setNotice({ ok: true, text: `${member.display_name} is no longer staff.` });
      load();
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    }
  };

  return (
    <>
      <StaffPageHead
        title="Staff"
        sub="Reviewers check questions; admins run the dashboard and can review too."
      />
      <section className="st-panel">
        <h2>Give someone a role</h2>
        <form className="st-inline-form" onSubmit={grant}>
          <label className="st-field">
            <span>Their email or phone number</span>
            <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="ada@example.com" />
          </label>
          <div className="st-field">
            <span>Role</span>
            <Select<'reviewer' | 'admin'>
              aria-label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'reviewer', label: 'Reviewer' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </div>
          <button type="submit" className="sj-btn" disabled={busy || !login.trim()}>
            {busy ? 'Saving…' : 'Give role'}
          </button>
        </form>
        <p className="st-muted" style={{ marginBottom: 0 }}>
          They must have signed up first. They sign in with the same details and land on their dashboard.
        </p>
        {notice && (
          <p className={notice.ok ? 'st-pill good' : 'st-error'} role="status" style={{ marginTop: 12 }}>
            {notice.text}
          </p>
        )}
      </section>

      <section className="st-panel">
        <h2>Current staff</h2>
        {problem && <p className="st-error">{problem}</p>}
        {!members && !problem && <p className="st-muted">Loading…</p>}
        {members && members.length === 0 && <p className="st-empty">No staff yet.</p>}
        {members && members.length > 0 && (
          <div className="st-table-wrap">
            <table className="st-table st-stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Signs in with</th>
                  <th>Role</th>
                  <th>Since</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.student_id}>
                    <td data-label="Name">
                      <strong>{member.display_name}</strong>
                      {member.student_id === user.student_id && <span className="st-muted"> (you)</span>}
                    </td>
                    <td data-label="Signs in with" className="st-muted">{member.login ?? '—'}</td>
                    <td data-label="Role">
                      <span className={`st-pill ${member.role}`}>{member.role === 'admin' ? 'Admin' : 'Reviewer'}</span>
                    </td>
                    <td data-label="Since" className="st-muted">
                      {when(member.granted_at)}
                      {member.granted_by_name ? ` by ${member.granted_by_name}` : ''}
                    </td>
                    <td data-label="" style={{ textAlign: 'right' }}>
                      {member.student_id !== user.student_id && (
                        <button type="button" className="sj-btn ghost sm" onClick={() => void revoke(member)}>
                          Remove role
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
