/**
 * System: Settings (changed without a release), System health (is everything set up and
 * working), and the Audit log (what staff have done). apps/api routers/admin_system.py.
 */
import { useCallback, useEffect, useState } from 'react';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { StaffPageHead } from '../staff/StaffShell.js';

/* ------------------------------------------------------------------ settings */

interface Setting {
  key: string;
  kind: 'bool' | 'text' | 'number';
  label: string;
  help: string;
  group: string;
  value: boolean | string | number;
  default: boolean | string | number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean | string | number>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    request<Setting[]>('/v1/admin/settings')
      .then(setSettings)
      .catch((error) => setProblem(friendly(error)));
  }, []);

  const changed = Object.keys(draft).filter((key) => {
    const setting = settings?.find((s) => s.key === key);
    return setting && setting.value !== draft[key];
  });

  const save = async () => {
    if (!changed.length || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const body = Object.fromEntries(
        changed.map((key) => {
          const setting = settings!.find((s) => s.key === key)!;
          const value = draft[key]!;
          return [key, setting.kind === 'number' ? Number(value) : value];
        }),
      );
      const next = await request<Setting[]>('/v1/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
      setSettings(next);
      setDraft({});
      setNotice(`Saved ${changed.length === 1 ? 'the change' : `${changed.length} changes`}.`);
    } catch (error) {
      setProblem(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set((settings ?? []).map((s) => s.group))];
  return (
    <>
      <StaffPageHead
        title="Settings"
        sub="Switches and details for the whole app. Changes apply at once and are kept in the audit log."
        actions={
          <button type="button" className="sj-btn" disabled={!changed.length || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : changed.length ? `Save ${changed.length === 1 ? 'the change' : `${changed.length} changes`}` : 'Saved'}
          </button>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {notice && !changed.length && <p className="st-notice">{notice}</p>}
      {!settings && !problem && <p className="st-muted">Loading…</p>}
      {groups.map((group) => (
        <section key={group} className="st-panel">
          <h2>{group}</h2>
          <div className="st-settings">
            {settings!
              .filter((s) => s.group === group)
              .map((setting) => {
                const value = setting.key in draft ? draft[setting.key]! : setting.value;
                return (
                  <div key={setting.key} className="st-setting">
                    <div>
                      <strong>{setting.label}</strong>
                      <span className="st-muted">{setting.help}</span>
                    </div>
                    {setting.kind === 'bool' ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(value)}
                        aria-label={setting.label}
                        className={`st-toggle ${value ? 'on' : ''}`}
                        onClick={() => setDraft({ ...draft, [setting.key]: !value })}
                      >
                        <span />
                      </button>
                    ) : (
                      <input
                        className="st-setting-input"
                        aria-label={setting.label}
                        inputMode={setting.kind === 'number' ? 'decimal' : undefined}
                        value={String(value)}
                        onChange={(event) => setDraft({ ...draft, [setting.key]: event.target.value })}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ health */

interface Health {
  checks: { name: string; state: 'ok' | 'warning' | 'problem'; detail: string }[];
  environment: string;
  python: string;
  release: string | null;
  database_size_mb: number;
  counts: Record<string, number>;
  checked_at: string;
}

const STATE: Record<string, [string, string]> = {
  ok: ['Working', 'good'],
  warning: ['Needs a look', 'warn'],
  problem: ['Not working', 'bad'],
};

const COUNT_NAMES: Record<string, string> = {
  accounts: 'Accounts',
  questions: 'Questions live',
  answers: 'Answers recorded',
  mocks: 'Mocks sat',
  coach_questions: 'Coach questions',
  payments: 'Payments',
};

export function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    request<Health>('/v1/admin/health')
      .then((next) => {
        setHealth(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const problems = health?.checks.filter((check) => check.state !== 'ok').length ?? 0;
  return (
    <>
      <StaffPageHead
        title="System health"
        sub={
          health
            ? problems
              ? `${problems} ${problems === 1 ? 'thing needs' : 'things need'} attention. Checked ${new Date(health.checked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
              : `Everything is working. Checked ${new Date(health.checked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
            : 'Whether each part Stack Prep depends on is there and set up.'
        }
        actions={
          <button type="button" className="sj-btn ghost" disabled={busy} onClick={load}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!health && !problem && <p className="st-muted">Checking…</p>}
      {health && (
        <>
          <section className="st-panel">
            <ul className="st-checks">
              {health.checks.map((check) => (
                <li key={check.name}>
                  <span className={`st-dot ${STATE[check.state]![1]}`} aria-hidden="true" />
                  <span className="st-cell">
                    <strong>{check.name}</strong>
                    <span className="st-muted">{check.detail}</span>
                  </span>
                  <span className={`st-pill ${STATE[check.state]![1]}`}>{STATE[check.state]![0]}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="st-stats st-stats-six">
            {Object.entries(health.counts).map(([key, value]) => (
              <div key={key} className="st-panel st-stat">
                <span>{COUNT_NAMES[key] ?? key}</span>
                <strong>{value.toLocaleString('en-NG')}</strong>
              </div>
            ))}
          </div>
          <section className="st-panel">
            <h2>Server</h2>
            <dl className="st-details st-details-four">
              <div>
                <dt>Environment</dt>
                <dd>{health.environment}</dd>
              </div>
              <div>
                <dt>Release</dt>
                <dd>{health.release ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Database size</dt>
                <dd>{health.database_size_mb.toLocaleString('en-NG')} MB</dd>
              </div>
              <div>
                <dt>Python</dt>
                <dd>{health.python}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ audit log */

interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  summary: string;
  target_kind: string | null;
  target_id: string | null;
  created_at: string;
}

interface AuditPage {
  entries: AuditEntry[];
  next_before: number | null;
  actions: string[];
}

const ACTION_GROUPS: Record<string, string> = {
  student: 'Students',
  plan: 'Plans',
  plans: 'Plans',
  length: 'Plans',
  discount: 'Discounts',
  setting: 'Settings',
  staff: 'Staff',
  report: 'Reports',
  support: 'Support',
  announcement: 'Announcements',
};

export function AuditPageView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(
    (before?: number) => {
      const params = new URLSearchParams({ limit: '50' });
      if (action) params.set('action', action);
      if (query) params.set('q', query);
      if (before) params.set('before', String(before));
      request<AuditPage>(`/v1/admin/audit?${params}`)
        .then((page) => {
          setEntries((current) => (before && current ? [...current, ...page.entries] : page.entries));
          setNext(page.next_before);
          setActions(page.actions);
          setProblem(null);
        })
        .catch((error) => setProblem(friendly(error)));
    },
    [action, query],
  );
  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const groups = [...new Set(actions.map((name) => name.split('.')[0]!))];
  return (
    <>
      <StaffPageHead title="Audit log" sub="Every change staff made from the dashboards: who, what and when." />
      <section className="st-panel st-filters st-filters-two">
        <label className="st-field st-search">
          <span>Search</span>
          <input type="search" value={typed} placeholder="A name, a plan, a code…" onChange={(event) => setTyped(event.target.value)} />
        </label>
        <div className="st-field">
          <span>Kind of change</span>
          <Select
            aria-label="Kind of change"
            value={action}
            onChange={setAction}
            options={[
              { value: '', label: 'Everything' },
              ...groups.map((group) => ({ value: group, label: ACTION_GROUPS[group] ?? group })),
            ]}
          />
        </div>
      </section>
      <section className="st-panel">
        {problem && <p className="st-error">{problem}</p>}
        {!entries && !problem && <p className="st-muted">Loading…</p>}
        {entries && entries.length === 0 && <p className="st-empty">Nothing recorded{query || action ? ' that matches' : ' yet'}.</p>}
        {entries && entries.length > 0 && (
          <ul className="st-audit">
            {entries.map((entry) => (
              <li key={entry.id}>
                <span className="st-audit-when st-muted">
                  {new Date(entry.created_at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="st-cell">
                  <span>{entry.summary}</span>
                  <span className="st-muted">
                    {entry.actor_name} · {ACTION_GROUPS[entry.action.split('.')[0]!] ?? entry.action}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {next !== null && (
          <div className="st-row st-pager">
            <button type="button" className="sj-btn ghost sm" onClick={() => load(next)}>
              Show older
            </button>
          </div>
        )}
      </section>
    </>
  );
}
