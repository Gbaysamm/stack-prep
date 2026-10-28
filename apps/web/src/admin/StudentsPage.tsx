/**
 * Students: find anyone by name, email, phone or school, narrow by class, Premium or recent
 * activity, and open their whole picture. Staff accounts are left out unless asked for.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { friendly, request } from '../lib/friendlyError.js';
import { StaffPageHead } from '../staff/StaffShell.js';

export interface StudentRow {
  student_id: string;
  display_name: string;
  login: string | null;
  school_name: string | null;
  state: string | null;
  class_level: string | null;
  status: string;
  role: 'student' | 'reviewer' | 'admin';
  created_at: string;
  last_active_at: string | null;
  questions_answered: number;
  premium: boolean;
}

interface StudentPage {
  total: number;
  students: StudentRow[];
}

const PAGE = 50;

export const CLASS_NAMES: Record<string, string> = {
  ss1: 'SS1',
  ss2: 'SS2',
  ss3: 'SS3',
  graduated: 'Finished school',
  other: 'Other',
};

export function ago(iso: string | null): string {
  if (!iso) return 'Never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StudentsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const classLevel = params.get('class') ?? '';
  const premium = params.get('premium') ?? '';
  const active = params.get('active') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const staff = params.get('staff') === '1';
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0);
  const [draft, setDraft] = useState(q);
  const [data, setData] = useState<StudentPage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => setDraft(q), [q]);
  // Search as they type, after a pause.
  useEffect(() => {
    if (draft === q) return;
    const timer = window.setTimeout(() => set('q', draft.trim()), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ sort, limit: String(PAGE), offset: String(page * PAGE) });
    if (q) query.set('q', q);
    if (classLevel) query.set('class_level', classLevel);
    if (premium) query.set('premium', premium);
    if (active) query.set('active_days', active);
    if (staff) query.set('staff', 'true');
    request<StudentPage>(`/v1/admin/students?${query}`)
      .then((next) => {
        if (!live) return;
        setData(next);
        setProblem(null);
      })
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [q, classLevel, premium, active, sort, staff, page]);

  const pages = data ? Math.ceil(data.total / PAGE) : 0;
  return (
    <>
      <StaffPageHead title="Students" sub="Search by name, email, phone or school, and open anyone's full picture." />
      <section className="st-panel st-filters">
        <label className="st-field st-search">
          <span>Search</span>
          <input
            type="search"
            value={draft}
            placeholder="Name, email, phone or school"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <label className="st-field">
          <span>Class</span>
          <select value={classLevel} onChange={(event) => set('class', event.target.value)}>
            <option value="">Any</option>
            {Object.entries(CLASS_NAMES).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="st-field">
          <span>Premium</span>
          <select value={premium} onChange={(event) => set('premium', event.target.value)}>
            <option value="">Anyone</option>
            <option value="true">On Premium</option>
            <option value="false">Free</option>
          </select>
        </label>
        <label className="st-field">
          <span>Active</span>
          <select value={active} onChange={(event) => set('active', event.target.value)}>
            <option value="">Any time</option>
            <option value="1">Today</option>
            <option value="7">In the last 7 days</option>
            <option value="30">In the last 30 days</option>
          </select>
        </label>
        <label className="st-field">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => set('sort', event.target.value)}>
            <option value="newest">Newest</option>
            <option value="active">Last active</option>
            <option value="answered">Most answered</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label className="st-check">
          <input type="checkbox" checked={staff} onChange={(event) => set('staff', event.target.checked ? '1' : '')} />
          Include staff
        </label>
      </section>

      <section className="st-panel">
        {problem && <p className="st-error">{problem}</p>}
        {!data && !problem && <p className="st-muted">Loading…</p>}
        {data && (
          <>
            <p className="st-muted st-count">
              {data.total === 0
                ? 'No one matches.'
                : `${data.total.toLocaleString('en-NG')} ${data.total === 1 ? 'student' : 'students'}`}
            </p>
            {data.students.length > 0 && (
              <div className="st-table-wrap">
                <table className="st-table st-stack">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>School</th>
                      <th>Class</th>
                      <th style={{ textAlign: 'right' }}>Answered</th>
                      <th>Last active</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((row) => (
                      <tr key={row.student_id}>
                        <td data-label="Student">
                          <span className="st-cell">
                            <Link className="st-link" to={`/students/${row.student_id}`}>
                              {row.display_name}
                            </Link>
                            <span className="st-muted">{row.login ?? 'No login'}</span>
                            <span className="st-tags">
                              {row.premium && <span className="st-pill good">Premium</span>}
                              {row.role !== 'student' && <span className={`st-pill ${row.role}`}>{row.role === 'admin' ? 'Admin' : 'Reviewer'}</span>}
                              {row.status !== 'active' && <span className="st-pill bad">{row.status === 'suspended' ? 'Suspended' : row.status}</span>}
                            </span>
                          </span>
                        </td>
                        <td data-label="School">
                          <span className="st-cell">
                            {row.school_name ?? <span className="st-muted">—</span>}
                            {row.state && <span className="st-muted">{row.state}</span>}
                          </span>
                        </td>
                        <td data-label="Class">{row.class_level ? CLASS_NAMES[row.class_level] : <span className="st-muted">—</span>}</td>
                        <td data-label="Answered" style={{ textAlign: 'right' }}>
                          {row.questions_answered.toLocaleString('en-NG')}
                        </td>
                        <td data-label="Last active" className="st-muted">
                          {ago(row.last_active_at)}
                        </td>
                        <td data-label="Joined" className="st-muted">
                          {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div className="st-row st-pager">
                <button type="button" className="sj-btn ghost sm" disabled={page === 0} onClick={() => set('page', String(page - 1))}>
                  Previous
                </button>
                <span className="st-muted">
                  Page {page + 1} of {pages}
                </span>
                <button
                  type="button"
                  className="sj-btn ghost sm"
                  disabled={page + 1 >= pages}
                  onClick={() => set('page', String(page + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
