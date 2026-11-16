/**
 * One student's whole picture: who they are and what they're aiming for, how active they are,
 * their score in each subject, their mocks, and their Premium and payments. With the actions
 * an admin needs: a temporary password, a role, Premium days, and suspending or restoring.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { naira, type Standing } from '../prep/billingApi.js';
import { useStaff } from '../staff/StaffGate.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { ColumnChart } from './charts.js';
import { DiscountForm, discountWords, type Billing, type Discount } from './PremiumPage.js';
import { CLASS_NAMES, ago } from './StudentsPage.js';

type Role = 'student' | 'reviewer' | 'admin';

interface Account {
  student_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  has_password: boolean;
  status: string;
  role: Role;
  created_at: string;
  school_name: string | null;
  state: string | null;
  class_level: string | null;
  target_institution: string | null;
  target_course: string | null;
  target_aggregate: number | null;
}

interface SubjectProgress {
  subject_id: string;
  subject_name: string;
  examination_short_name: string;
  goal: { target_score: number | null; exam_date: string | null; days_to_exam: number | null } | null;
  scores: { score: number | null; predicted: number | null; answered: number; topics_tried: number; change: number | null } | null;
  practice: { runs_finished: number; questions_answered: number; correct_unaided: number; taught: number };
}

interface Tally {
  questions: number;
  answered: number;
  correct: number;
  percent: number | null;
  aggregate?: number | null;
}

interface MockSummary {
  mock_id: string;
  status: 'submitted' | 'in_progress';
  preset: string;
  duration_minutes: number;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  overall: Tally | null;
  subjects: { name: string; tally: Tally }[];
  integrity_flags: number;
}

interface StudentDetail {
  account: Account;
  activity: {
    last_active_at: string | null;
    questions_answered: number;
    days_active_30: number;
    last_30_days: number[];
    reports_sent: number;
    bookmarks: number;
  };
  progress: { subjects: SubjectProgress[]; streak_days: number };
  mocks: MockSummary[];
  premium: Standing;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const or = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '—' : value);

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function StudentPage() {
  const { studentId = '' } = useParams();
  const { user } = useStaff();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [giftDays, setGiftDays] = useState('30');
  const [giftPlan, setGiftPlan] = useState('');
  const [catalogue, setCatalogue] = useState<Billing | null>(null);
  const [offers, setOffers] = useState<Discount[]>([]);
  const [offering, setOffering] = useState(false);

  const load = useCallback(() => {
    request<StudentDetail>(`/v1/admin/students/${studentId}`)
      .then((next) => {
        setData(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [studentId]);
  useEffect(load, [load]);
  const loadOffers = useCallback(() => {
    request<Discount[]>(`/v1/admin/billing/discounts?student_id=${studentId}`)
      .then(setOffers)
      .catch(() => undefined);
  }, [studentId]);
  useEffect(() => {
    request<Billing>('/v1/admin/billing')
      .then((next) => {
        setCatalogue(next);
        setGiftPlan((current) => current || next.plans.find((plan) => plan.kind === 'paid')?.id || '');
      })
      .catch(() => undefined);
    loadOffers();
  }, [loadOffers]);

  const act = async (key: string, run: () => Promise<string>) => {
    setBusy(key);
    setNotice(null);
    try {
      setNotice({ ok: true, text: await run() });
      load();
    } catch (error) {
      setNotice({ ok: false, text: friendly(error) });
    } finally {
      setBusy(null);
    }
  };

  if (problem && !data) {
    return (
      <>
        <StaffPageHead title="Student" />
        <p className="st-error">{problem}</p>
        <Link to="/students">Back to students</Link>
      </>
    );
  }
  if (!data) return <p className="st-muted">Loading…</p>;

  const { account, activity, progress, mocks, premium } = data;
  const me = account.student_id === user.student_id;
  const name = account.display_name;

  const temporary = () =>
    act('password', async () => {
      if (!window.confirm(`Give ${name} a temporary password? Their current password stops working and every device is signed out.`)) {
        return 'Nothing changed.';
      }
      const made = await request<{ password: string }>(`/v1/admin/students/${account.student_id}/password`, { method: 'POST' });
      setPassword(made.password);
      return 'A temporary password is set. Pass it on; they can change it in Account settings.';
    });

  const toggleStatus = () =>
    act('status', async () => {
      const suspend = account.status === 'active';
      if (suspend && !window.confirm(`Suspend ${name}? They are signed out and can't sign in until restored. Nothing is deleted.`)) {
        return 'Nothing changed.';
      }
      await request(`/v1/admin/students/${account.student_id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: suspend ? 'suspended' : 'active' }),
      });
      return suspend ? `${name} is suspended.` : `${name} can sign in again.`;
    });

  const changeRole = (role: Role) =>
    act('role', async () => {
      await request(`/v1/admin/students/${account.student_id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
      return role === 'student' ? `${name} is a student only.` : `${name} is now ${role === 'admin' ? 'an admin' : 'a reviewer'}.`;
    });

  const gift = (event: FormEvent) => {
    event.preventDefault();
    const days = Number(giftDays);
    if (!Number.isInteger(days) || days < 1 || days > 730) {
      setNotice({ ok: false, text: 'Enter a number of days from 1 to 730.' });
      return;
    }
    if (!giftPlan) {
      setNotice({ ok: false, text: 'Add a paid plan in Pricing & plans first.' });
      return;
    }
    void act('gift', async () => {
      const done = await request<{ plan_name: string; plan_until: string | null }>(
        `/v1/admin/billing/students/${account.student_id}/gift`,
        { method: 'POST', body: JSON.stringify({ plan_id: giftPlan, days }) },
      );
      return `${done.plan_name} given${done.plan_until ? `, until ${date(done.plan_until)}` : ''}.`;
    });
  };

  return (
    <>
      <p className="st-back">
        <Link to="/students">← Students</Link>
      </p>
      <StaffPageHead
        title={name}
        sub={[account.email, account.phone].filter(Boolean).join(' · ') || 'No email or phone'}
        actions={
          <span className="st-tags">
            {premium.plan_name && <span className="st-pill good">{premium.plan_name}</span>}
            {account.role !== 'student' && <span className={`st-pill ${account.role}`}>{account.role === 'admin' ? 'Admin' : 'Reviewer'}</span>}
            <span className={`st-pill ${account.status === 'active' ? 'good' : 'bad'}`}>
              {account.status === 'active' ? 'Active' : account.status === 'suspended' ? 'Suspended' : account.status}
            </span>
          </span>
        }
      />

      {notice && (
        <p className={notice.ok ? 'st-notice' : 'st-error'} role="status">
          {notice.text}
        </p>
      )}
      {password && (
        <section className="st-panel st-password">
          <h2>Temporary password</h2>
          <p className="st-muted">Shown once. Give it to {name}; they sign in with it and change it in Account settings.</p>
          <div className="st-row">
            <code>{password}</code>
            <button type="button" className="sj-btn ghost sm" onClick={() => void navigator.clipboard?.writeText(password)}>
              Copy
            </button>
            <button type="button" className="sj-btn ghost sm" onClick={() => setPassword(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      <div className="st-grid two st-top">
        <div className="st-col">
        <section className="st-panel">
          <h2>About them</h2>
          <dl className="st-details">
            <Detail label="School">{or(account.school_name)}</Detail>
            <Detail label="State">{or(account.state)}</Detail>
            <Detail label="Class">{account.class_level ? CLASS_NAMES[account.class_level] : '—'}</Detail>
            <Detail label="Aiming for">
              {account.target_course || account.target_institution
                ? [account.target_course, account.target_institution].filter(Boolean).join(' at ')
                : '—'}
            </Detail>
            <Detail label="UTME target">{account.target_aggregate ? `${account.target_aggregate} / 400` : '—'}</Detail>
            <Detail label="Joined">{date(account.created_at)}</Detail>
          </dl>
        </section>
        <section className="st-panel">
          <h2>Plan and payments</h2>
          <p className="st-muted" style={{ marginTop: 0 }}>
            {premium.plan_name
              ? `On ${premium.plan_name}${premium.plan_until ? ` until ${date(premium.plan_until)}` : ''}.`
              : premium.premium
                ? 'Has everything (an admin account).'
                : premium.limits_on
                  ? `Free plan: ${premium.practice_used_today}${
                      premium.allowance.practice_per_day !== null ? ` of ${premium.allowance.practice_per_day}` : ''
                    } practice questions today, ${premium.mocks_used} mocks${
                      premium.allowance.mocks !== null ? ` of ${premium.allowance.mocks}` : ''
                    }.`
                  : 'Free plan. The limits are off, so nothing is held back.'}
          </p>
          {premium.receipts.length === 0 ? (
            <p className="st-empty">No payments.</p>
          ) : (
            <ul className="st-list">
              {premium.receipts.map((receipt) => (
                <li key={receipt.reference}>
                  <span className="st-cell">
                    <strong>{receipt.plan_name}</strong>
                    <span className="st-muted">
                      {date(receipt.paid_at ?? receipt.created_at)} · {receipt.length_label}
                      {receipt.discount_label ? ` · ${receipt.discount_label}` : ''}
                    </span>
                  </span>
                  <span className="st-cell st-end">
                    <strong>{receipt.amount_kobo === 0 ? 'Free' : naira(receipt.amount_kobo)}</strong>
                    <span className={`st-pill ${receipt.status === 'paid' ? 'good' : receipt.status === 'pending' ? 'warn' : 'bad'}`}>
                      {receipt.status === 'paid' ? 'Paid' : receipt.status === 'pending' ? 'Not finished' : receipt.status === 'abandoned' ? 'Cancelled' : 'Failed'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>

        <section className="st-panel">
          <h2>Actions</h2>
          <div className="st-actions">
            <div className="st-action">
              <div>
                <strong>Temporary password</strong>
                <span className="st-muted">For a student who can't reset it by email.</span>
              </div>
              <button type="button" className="sj-btn ghost sm" disabled={busy !== null || me} onClick={() => void temporary()}>
                {busy === 'password' ? 'Setting…' : 'Set one'}
              </button>
            </div>
            <form className="st-action st-action-wide" onSubmit={gift}>
              <div>
                <strong>Give a plan</strong>
                <span className="st-muted">
                  {premium.plan_name && premium.plan_until
                    ? `On ${premium.plan_name} until ${date(premium.plan_until)}. More of the same plan follows on.`
                    : 'Free, for the days you choose.'}
                </span>
              </div>
              <span className="st-row">
                <Select
                  size="sm"
                  className="st-pick"
                  aria-label="Plan"
                  value={giftPlan}
                  onChange={setGiftPlan}
                  placeholder="No plans yet"
                  options={(catalogue?.plans ?? [])
                    .filter((plan) => plan.kind === 'paid')
                    .map((plan) => ({ value: plan.id, label: plan.name }))}
                />
                <input className="st-days" inputMode="numeric" aria-label="Days" value={giftDays} onChange={(event) => setGiftDays(event.target.value)} />
                <button type="submit" className="sj-btn ghost sm" disabled={busy !== null}>
                  {busy === 'gift' ? 'Giving…' : 'Give'}
                </button>
              </span>
            </form>
            <div className="st-action">
              <div>
                <strong>Make an offer</strong>
                <span className="st-muted">
                  {offers.filter((offer) => offer.active).length
                    ? offers
                        .filter((offer) => offer.active)
                        .map((offer) => `${discountWords(offer)} (${offer.used ? 'used' : 'waiting'})`)
                        .join('; ')
                    : 'A discount for this student only, up to 100% off. They see it on their plans page.'}
                </span>
              </div>
              <button type="button" className="sj-btn ghost sm" disabled={busy !== null || offering} onClick={() => setOffering(true)}>
                Make one
              </button>
            </div>
            {offering && catalogue && (
              <DiscountForm
                plans={catalogue.plans}
                lengths={catalogue.lengths}
                studentId={account.student_id}
                onDone={(made) => {
                  setOffering(false);
                  if (made) {
                    setNotice({ ok: true, text: `Offer made: ${discountWords(made)}.` });
                    loadOffers();
                  }
                }}
              />
            )}
            <div className="st-action">
              <div>
                <strong>Role</strong>
                <span className="st-muted">Reviewers check questions; admins run this dashboard.</span>
              </div>
              <Select<Role>
                size="sm"
                className="st-pick"
                aria-label="Role"
                value={account.role}
                disabled={busy !== null || me}
                onChange={(value) => void changeRole(value)}
                options={[
                  { value: 'student', label: 'Student' },
                  { value: 'reviewer', label: 'Reviewer' },
                  { value: 'admin', label: 'Admin' },
                ]}
              />
            </div>
            <div className="st-action">
              <div>
                <strong>{account.status === 'active' ? 'Suspend' : 'Restore'}</strong>
                <span className="st-muted">
                  {account.status === 'active' ? 'Signs them out and stops them signing in. Nothing is deleted.' : 'Lets them sign in again.'}
                </span>
              </div>
              <button
                type="button"
                className={`sj-btn sm ${account.status === 'active' ? 'danger' : ''}`}
                disabled={busy !== null || me}
                onClick={() => void toggleStatus()}
              >
                {account.status === 'active' ? 'Suspend' : 'Restore'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="st-panel">
        <h2>Activity</h2>
        <div className="st-stats five st-stats-flat">
          <div className="st-stat">
            <span>Questions answered</span>
            <strong>{activity.questions_answered.toLocaleString('en-NG')}</strong>
          </div>
          <div className="st-stat">
            <span>Days active, last 30</span>
            <strong>{activity.days_active_30}</strong>
          </div>
          <div className="st-stat">
            <span>Last active</span>
            <strong className="st-stat-text">{ago(activity.last_active_at)}</strong>
          </div>
          <div className="st-stat">
            <span>Streak</span>
            <strong>{progress.streak_days} {progress.streak_days === 1 ? 'day' : 'days'}</strong>
          </div>
          <div className="st-stat">
            <span>Bookmarks · reports</span>
            <strong>
              {activity.bookmarks} · {activity.reports_sent}
            </strong>
          </div>
        </div>
        <h3 className="st-subhead">Questions answered a day, last 30 days</h3>
        <ColumnChart
          height={140}
          label={`Questions ${name} answered each day, last 30 days`}
          columns={activity.last_30_days.map((value, index) => {
            const day = new Date();
            day.setDate(day.getDate() - (29 - index));
            return {
              label: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              title: day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
              value,
            };
          })}
        />
      </section>

      <section className="st-panel">
        <h2>Subjects</h2>
        {progress.subjects.length === 0 ? (
          <p className="st-empty">No subjects yet.</p>
        ) : (
          <div className="st-table-wrap">
            <table className="st-table st-stack">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th style={{ textAlign: 'right' }}>Last check-up</th>
                  <th style={{ textAlign: 'right' }}>Target</th>
                  <th>Exam</th>
                  <th style={{ textAlign: 'right' }}>Practised</th>
                </tr>
              </thead>
              <tbody>
                {progress.subjects.map((subject) => (
                  <tr key={subject.subject_id}>
                    <td data-label="Subject">
                      <span className="st-cell">
                        <strong>{subject.subject_name}</strong>
                        <span className="st-muted">{subject.examination_short_name}</span>
                      </span>
                    </td>
                    <td data-label="Score" style={{ textAlign: 'right' }}>
                      <span>
                        {subject.scores?.score ?? '—'}
                        {subject.scores?.change ? (
                          <span className="st-muted"> ({subject.scores.change > 0 ? '+' : ''}{subject.scores.change})</span>
                        ) : null}
                      </span>
                    </td>
                    <td data-label="Last check-up" style={{ textAlign: 'right' }}>{subject.scores?.predicted ?? '—'}</td>
                    <td data-label="Target" style={{ textAlign: 'right' }}>{subject.goal?.target_score ?? '—'}</td>
                    <td data-label="Exam" className="st-muted">
                      {subject.goal?.exam_date
                        ? `${date(subject.goal.exam_date)}${subject.goal.days_to_exam !== null && subject.goal.days_to_exam >= 0 ? ` (${subject.goal.days_to_exam} days)` : ''}`
                        : '—'}
                    </td>
                    <td data-label="Practised" style={{ textAlign: 'right' }}>
                      <span className="st-cell">
                        {subject.practice.questions_answered} questions
                        <span className="st-muted">{subject.practice.runs_finished} runs finished</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

        <section className="st-panel">
          <h2>Mocks</h2>
          {mocks.length === 0 ? (
            <p className="st-empty">No mocks yet.</p>
          ) : (
            <ul className="st-list">
              {mocks.map((mock) => (
                <li key={mock.mock_id}>
                  <span className="st-cell">
                    <strong>{mock.status === 'in_progress' ? 'Running now' : mock.subjects.map((s) => s.name).join(', ')}</strong>
                    <span className="st-muted">
                      {date(mock.started_at)}
                      {mock.preset === 'utme' ? ' · Scheduled' : ''}
                      {mock.integrity_flags > 0 ? ` · left the test ${mock.integrity_flags} ${mock.integrity_flags === 1 ? 'time' : 'times'}` : ''}
                    </span>
                  </span>
                  <span className="st-cell st-end">
                    {mock.overall ? (
                      <>
                        <strong>{mock.overall.percent ?? 0}%</strong>
                        {mock.overall.aggregate != null && <span className="st-muted">{mock.overall.aggregate} / 400</span>}
                      </>
                    ) : (
                      <span className="st-pill warn">In progress</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
    </>
  );
}
