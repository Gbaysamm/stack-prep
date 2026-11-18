/**
 * Settings → Parent or guardian (founder, 17-18 Nov 2026; apps/api routers/parents.py).
 * The student adds up to two; each gets an email to confirm. Once confirmed they get the weekly
 * report and a note if the student stops, and they stay: only a waiting invitation can be taken
 * back. Every change shows at once.
 */
import { useEffect, useState, type FormEvent } from 'react';

import { failure, friendly, reach } from '../../lib/friendlyError.js';
import { Select } from '../../lib/Select.js';
import { AboutField } from '../AboutFields.js';
import { Button, Skeleton, useToast } from '../ui.js';

type Relationship = 'mother' | 'father' | 'guardian' | 'other';
interface Parent {
  id: string;
  name: string;
  email: string;
  relationship: Relationship;
  status: 'pending' | 'active';
  invited_at: string | null;
}

const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Someone else' },
];
const MOST = 2;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!response.ok) throw await failure(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function ParentSettings({ studentId }: { studentId: string }) {
  const url = `/v1/student/${studentId}/parents`;
  const toast = useToast();
  const [parents, setParents] = useState<Parent[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('mother');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<Parent[]>(url)
      .then(setParents)
      .catch((problem) => setError(friendly(problem)));
  }, [url]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || !email.trim()) {
      setError('Enter their name and email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await call<Parent[]>(url, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), relationship }),
      });
      setParents(next);
      setName('');
      setEmail('');
      toast(`We've emailed ${name.trim().split(' ')[0]} a link to confirm`);
    } catch (problem) {
      setError(friendly(problem));
    } finally {
      setBusy(false);
    }
  };

  const resend = (parent: Parent) =>
    call<void>(`${url}/${parent.id}/resend`, { method: 'POST' })
      .then(() => toast(`Sent again to ${parent.email}`))
      .catch((problem) => toast(friendly(problem)));

  const takeBack = (parent: Parent) => {
    const before = parents;
    setParents((now) => now?.filter((p) => p.id !== parent.id) ?? now);
    call<void>(`${url}/${parent.id}`, { method: 'DELETE' })
      .then(() => toast('Invitation taken back'))
      .catch((problem) => {
        setParents(before);
        toast(friendly(problem));
      });
  };

  if (!parents) {
    return error ? <p className="set-error">{error}</p> : <Skeleton height={200} radius={10} />;
  }

  return (
    <div className="sj-card set-card pp">
      {parents.length ? (
        <ul className="pp-list">
          {parents.map((parent) => (
            <li key={parent.id} className="pp-row">
              <span className="pp-avatar" aria-hidden="true">
                {initials(parent.name)}
              </span>
              <span className="pp-who">
                <b>{parent.name}</b>
                <small>
                  {RELATIONSHIPS.find((r) => r.value === parent.relationship)?.label} · {parent.email}
                </small>
              </span>
              {parent.status === 'active' ? (
                <span className="pp-chip on">Gets your reports</span>
              ) : (
                <span className="pp-side">
                  <span className="pp-chip">Waiting to confirm</span>
                  <span className="pp-acts">
                    <button type="button" className="pp-link" onClick={() => void resend(parent)}>
                      Send again
                    </button>
                    <button type="button" className="pp-link quiet" onClick={() => takeBack(parent)}>
                      Take back
                    </button>
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {parents.length < MOST ? (
        <form className="pp-form" onSubmit={add} noValidate>
          <div className="about-grid three">
            <AboutField label="Their name">
              {(id) => (
                <input
                  id={id}
                  className="sj-input"
                  value={name}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Ngozi Okafor"
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
              )}
            </AboutField>
            <AboutField label="Their email">
              {(id) => (
                <input
                  id={id}
                  type="email"
                  className="sj-input"
                  value={email}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="parent@example.com"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                />
              )}
            </AboutField>
            <AboutField label="They are your">
              {(id) => <Select id={id} value={relationship} onChange={setRelationship} options={RELATIONSHIPS} />}
            </AboutField>
          </div>
          <div className="set-actions">
            {error ? (
              <p className="set-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="set-quiet">They confirm by email, then get your weekly report.</p>
            )}
            <Button type="submit" busy={busy}>
              {parents.length ? 'Add another' : 'Add parent'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
