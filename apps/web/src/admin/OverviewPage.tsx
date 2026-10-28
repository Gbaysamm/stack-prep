/**
 * Overview: how Stack Prep is doing, for a chosen period. Totals first, then a chart for each
 * of sign-ups, active students, questions answered, mocks and money taken, which subjects
 * students aim at, how their latest mocks scored, and what the question bank holds.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { friendly, request } from '../lib/friendlyError.js';
import { naira } from '../prep/billingApi.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { BarList, ColumnChart, type Column } from './charts.js';

interface DayPoint {
  day: string;
  signups: number;
  active: number;
  answered: number;
  mocks: number;
  paid_kobo: number;
}

export interface AdminOverview {
  days: number;
  totals: {
    students: number;
    new_students: number;
    active_students: number;
    active_today: number;
    questions_answered: number;
    mocks_submitted: number;
    premium_now: number;
    paid_kobo: number;
  };
  series: DayPoint[];
  subjects: { subject_id: string; name: string; students: number }[];
  mock_scores: { low: number; students: number }[];
  content: { subject_id: string; name: string; questions: number; open_reports: number }[];
}

const PERIODS = [7, 30, 90] as const;

const whole = (n: number) => n.toLocaleString('en-NG');
const short = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const long = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const nairaShort = (kobo: number) => {
  const amount = kobo / 100;
  return amount >= 1000 ? `₦${+(amount / 1000).toFixed(1)}K` : `₦${amount}`;
};

function daily(series: DayPoint[], key: keyof Omit<DayPoint, 'day'>): Column[] {
  return series.map((point) => ({ label: short(point.day), title: long(point.day), value: point[key] }));
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="st-panel st-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small className="st-muted">{note}</small>}
    </div>
  );
}

export function OverviewPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setProblem(null);
    request<AdminOverview>(`/v1/admin/overview?days=${days}`)
      .then((next) => live && setData(next))
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [days]);

  const period = `last ${days} days`;
  return (
    <>
      <StaffPageHead
        title="Overview"
        sub="How students are using Stack Prep. Days are Nigerian days."
        actions={
          <div className="st-seg" role="tablist" aria-label="Period">
            {PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={days === value}
                className={days === value ? 'on' : undefined}
                onClick={() => setDays(value)}
              >
                {value} days
              </button>
            ))}
          </div>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && (
        <div className={data.days === days ? undefined : 'st-stale'}>
          <div className="st-stats four">
            <Stat label="Students" value={whole(data.totals.students)} note={`${whole(data.totals.new_students)} new, ${period}`} />
            <Stat
              label="Active"
              value={whole(data.totals.active_students)}
              note={`answered a question, ${period}; ${whole(data.totals.active_today)} today`}
            />
            <Stat label="Questions answered" value={whole(data.totals.questions_answered)} note={period} />
            <Stat
              label="Money taken"
              value={naira(data.totals.paid_kobo)}
              note={`${period}; ${whole(data.totals.premium_now)} on Premium now`}
            />
          </div>

          <div className="st-grid two">
            <section className="st-panel">
              <h2>Sign-ups a day</h2>
              <ColumnChart columns={daily(data.series, 'signups')} label={`New students each day, ${period}`} />
            </section>
            <section className="st-panel">
              <h2>Active students a day</h2>
              <ColumnChart
                columns={daily(data.series, 'active')}
                label={`Students who answered at least one question each day, ${period}`}
              />
            </section>
            <section className="st-panel">
              <h2>Questions answered a day</h2>
              <ColumnChart columns={daily(data.series, 'answered')} label={`Questions answered each day, ${period}`} />
            </section>
            <section className="st-panel">
              <h2>Mocks submitted a day</h2>
              <ColumnChart
                columns={daily(data.series, 'mocks')}
                label={`Mock exams submitted each day, ${period}`}
              />
              <p className="st-muted st-chart-note">{whole(data.totals.mocks_submitted)} in the {period}.</p>
            </section>
            <section className="st-panel">
              <h2>Money taken a day</h2>
              <ColumnChart
                columns={daily(data.series, 'paid_kobo')}
                format={nairaShort}
                label={`Premium payments each day, ${period}`}
              />
              <p className="st-muted st-chart-note">
                <Link to="/premium">Plans and payments</Link>
              </p>
            </section>
            <section className="st-panel">
              <h2>Latest mock scores (%)</h2>
              <ColumnChart
                columns={data.mock_scores.map((band) => ({
                  label: `${band.low}`,
                  title: band.low === 90 ? '90 to 100%' : `${band.low} to ${band.low + 9}%`,
                  value: band.students,
                }))}
                every={1}
                label="Students by the percentage on their latest mock"
              />
              <p className="st-muted st-chart-note">Each student's latest submitted mock, skipped questions counted wrong.</p>
            </section>
          </div>

          <div className="st-grid two">
            <section className="st-panel">
              <h2>Subjects students are aiming at</h2>
              {data.subjects.length === 0 ? (
                <p className="st-empty">No student has set a subject goal yet.</p>
              ) : (
                <BarList
                  rows={data.subjects.map((subject) => ({ key: subject.subject_id, label: subject.name, value: subject.students }))}
                  label="Students with a goal in each subject"
                />
              )}
            </section>
            <section className="st-panel">
              <h2>Question bank</h2>
              <div className="st-table-wrap">
                <table className="st-table st-compact">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th style={{ textAlign: 'right' }}>Questions</th>
                      <th style={{ textAlign: 'right' }}>Open reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.content.map((row) => (
                      <tr key={row.subject_id}>
                        <td data-label="Subject">{row.name}</td>
                        <td data-label="Questions" style={{ textAlign: 'right' }}>
                          {whole(row.questions)}
                        </td>
                        <td data-label="Open reports" style={{ textAlign: 'right' }}>
                          {row.open_reports > 0 ? <Link to="/reports">{row.open_reports}</Link> : '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
