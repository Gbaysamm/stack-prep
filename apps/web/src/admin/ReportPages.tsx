/**
 * Reports: Engagement (how often students come back), Feature usage (what they use), AI usage
 * (the coach: questions, tokens and cost) and Revenue (money by month and by plan).
 * apps/api routers/admin_reports.py.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendly, request } from '../lib/friendlyError.js';
import { naira } from '../prep/billingApi.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { BarList, ColumnChart, type Column } from './charts.js';

const whole = (n: number) => n.toLocaleString('en-NG');
const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const long = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const days = (rows: { day: string; value: number }[]): Column[] =>
  rows.map((row) => ({ label: short(row.day), title: long(row.day), value: row.value }));

/** Loads a report for a period, with the period switch in the page head. */
function useReport<T>(path: string, period: number | null) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setProblem(null);
    request<T>(period === null ? path : `${path}${path.includes('?') ? '&' : '?'}days=${period}`)
      .then((next) => live && setData(next))
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [path, period]);
  return { data, problem };
}

function Period({ value, onChange, options = [7, 30, 90] }: { value: number; onChange: (n: number) => void; options?: number[] }) {
  return (
    <div className="st-seg" role="tablist" aria-label="Period">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={value === option}
          className={value === option ? 'on' : undefined}
          onClick={() => onChange(option)}
        >
          {option} days
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="st-panel st-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small className="st-muted">{note}</small> : null}
    </div>
  );
}

function Loading({ problem }: { problem: string | null }) {
  return problem ? <p className="st-error">{problem}</p> : <p className="st-muted">Loading…</p>;
}

/* ------------------------------------------------------------------ engagement */

interface Engagement {
  days: number;
  daily_active: { day: string; value: number }[];
  active_today: number;
  active_7: number;
  active_30: number;
  stickiness: number;
  minutes_per_active_day: number;
  cohorts: { week: string; students: number; active: (number | null)[] }[];
  days_active_30: { label: string; students: number }[];
}

export function EngagementPage() {
  const [period, setPeriod] = useState(30);
  const { data, problem } = useReport<Engagement>('/v1/admin/engagement', period);
  return (
    <>
      <StaffPageHead
        title="Engagement"
        sub="How many students come back, how often, and for how long. A student is active on a day they answer a question."
        actions={<Period value={period} onChange={setPeriod} />}
      />
      {!data ? (
        <Loading problem={problem} />
      ) : (
        <>
          <div className="st-stats five">
            <Stat label="Active today" value={whole(data.active_today)} />
            <Stat label="Active, last 7 days" value={whole(data.active_7)} />
            <Stat label="Active, last 30 days" value={whole(data.active_30)} />
            <Stat label="Come back daily" value={`${data.stickiness}%`} note="Average day's actives over the month's" />
            <Stat label="Minutes a day" value={data.minutes_per_active_day} note="Answering, per student who came" />
          </div>
          <section className="st-panel">
            <h2>Active students a day</h2>
            <ColumnChart columns={days(data.daily_active)} label={`Students who answered a question each day, last ${data.days} days`} />
          </section>
          <div className="st-grid two st-top">
            <section className="st-panel">
              <h2>Do new students come back?</h2>
              <p className="st-muted st-chart-note" style={{ marginTop: 0, marginBottom: 12 }}>
                Students grouped by the week they joined, and the share active in each week since.
              </p>
              {data.cohorts.length === 0 ? (
                <p className="st-empty">No one joined in the last eight weeks.</p>
              ) : (
                <div className="st-table-wrap">
                  <table className="st-cohorts">
                    <thead>
                      <tr>
                        <th>Joined</th>
                        <th>Students</th>
                        {data.cohorts[0]!.active.map((_, n) => (
                          <th key={n}>Wk {n}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.cohorts.map((cohort) => (
                        <tr key={cohort.week}>
                          <td>{short(cohort.week)}</td>
                          <td>{cohort.students}</td>
                          {cohort.active.map((share, n) => (
                            <td
                              key={n}
                              className="st-heat"
                              style={share === null ? undefined : { ['--heat' as string]: `${share}%` }}
                              title={share === null ? 'Not reached yet' : `${share}% active in week ${n}`}
                            >
                              {share === null ? '' : `${share}%`}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="st-panel">
              <h2>Days active in the last 30</h2>
              {data.days_active_30.length === 0 ? (
                <p className="st-empty">No one has been active in the last 30 days.</p>
              ) : (
                <BarList
                  rows={data.days_active_30.map((band) => ({ key: band.label, label: band.label, value: band.students }))}
                  label="Students by how many of the last 30 days they were active"
                />
              )}
              <p className="st-muted st-chart-note">How many students came back on how many days.</p>
            </section>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ feature usage */

interface Feature {
  key: string;
  label: string;
  total: number;
  previous: number;
  students: number;
  series: { day: string; value: number }[];
}

function change(now: number, before: number): { text: string; tone: string } {
  if (before === 0) return now ? { text: 'New', tone: 'good' } : { text: '—', tone: '' };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'good' : pct < 0 ? 'bad' : '' };
}

export function FeaturesPage() {
  const [period, setPeriod] = useState(30);
  const { data, problem } = useReport<Feature[]>('/v1/admin/features', period);
  const [chosen, setChosen] = useState('practice_questions');
  const feature = data?.find((item) => item.key === chosen) ?? data?.[0];
  return (
    <>
      <StaffPageHead
        title="Feature usage"
        sub={`What students use, in the last ${period} days, against the ${period} days before. Choose one to see it day by day.`}
        actions={<Period value={period} onChange={setPeriod} />}
      />
      {!data ? (
        <Loading problem={problem} />
      ) : (
        <>
          <div className="st-features">
            {data.map((item) => {
              const delta = change(item.total, item.previous);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`st-panel st-feature ${item.key === feature?.key ? 'on' : ''}`}
                  onClick={() => setChosen(item.key)}
                >
                  <span className="st-feature-label">{item.label}</span>
                  <strong>{whole(item.total)}</strong>
                  <span className="st-feature-foot">
                    <span className={`st-delta ${delta.tone}`}>{delta.text}</span>
                    <span className="st-muted">
                      {whole(item.students)} {item.students === 1 ? 'student' : 'students'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {feature && (
            <section className="st-panel">
              <h2>{feature.label} a day</h2>
              <ColumnChart columns={days(feature.series)} label={`${feature.label} each day, last ${period} days`} />
            </section>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ AI usage */

interface AiUsage {
  days: number;
  turns: number;
  answered_by_model: number;
  fallback: number;
  over_budget: number;
  students: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms_median: number | null;
  latency_ms_p90: number | null;
  cost_usd: number | null;
  cost_naira: number | null;
  daily: { day: string; value: number }[];
  models: { model: string; turns: number; input_tokens: number; output_tokens: number }[];
  top_askers: { student_id: string; display_name: string; turns: number }[];
}

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);

export function AiPage() {
  const [period, setPeriod] = useState(30);
  const { data, problem } = useReport<AiUsage>('/v1/admin/ai', period);
  return (
    <>
      <StaffPageHead
        title="AI usage"
        sub="The coach: questions students asked at the board, the tokens they used, and what it cost."
        actions={<Period value={period} onChange={setPeriod} />}
      />
      {!data ? (
        <Loading problem={problem} />
      ) : (
        <>
          <div className="st-stats five">
            <Stat label="Questions asked" value={whole(data.turns)} note={`by ${whole(data.students)} students`} />
            <Stat
              label="Answered by the model"
              value={whole(data.answered_by_model)}
              note={`${whole(data.fallback)} fell back to the working, ${whole(data.over_budget)} over the daily limit`}
            />
            <Stat label="Tokens" value={`${tokens(data.input_tokens)} in`} note={`${tokens(data.output_tokens)} out`} />
            <Stat
              label="Answer time"
              value={data.latency_ms_median !== null ? `${(data.latency_ms_median / 1000).toFixed(1)} s` : '—'}
              note={data.latency_ms_p90 !== null ? `9 in 10 within ${(data.latency_ms_p90 / 1000).toFixed(1)} s` : undefined}
            />
            <Stat
              label="Estimated cost"
              value={data.cost_naira !== null ? naira(data.cost_naira * 100) : '—'}
              note={
                data.cost_usd !== null ? (
                  `US$${data.cost_usd.toFixed(2)}`
                ) : (
                  <>
                    Set the token prices in <Link to="/settings">Settings</Link>
                  </>
                )
              }
            />
          </div>
          <section className="st-panel">
            <h2>Questions to the coach a day</h2>
            <ColumnChart columns={days(data.daily)} label={`Questions asked of the coach each day, last ${data.days} days`} />
          </section>
          <div className="st-grid two st-top">
            <section className="st-panel">
              <h2>By model</h2>
              {data.models.length === 0 ? (
                <p className="st-empty">The model hasn't answered anything in this period.</p>
              ) : (
                <div className="st-table-wrap">
                  <table className="st-table st-compact">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th style={{ textAlign: 'right' }}>Answers</th>
                        <th style={{ textAlign: 'right' }}>Tokens in</th>
                        <th style={{ textAlign: 'right' }}>Tokens out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((model) => (
                        <tr key={model.model}>
                          <td>{model.model}</td>
                          <td style={{ textAlign: 'right' }}>{whole(model.turns)}</td>
                          <td style={{ textAlign: 'right' }}>{tokens(model.input_tokens)}</td>
                          <td style={{ textAlign: 'right' }}>{tokens(model.output_tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="st-panel">
              <h2>Who asks most</h2>
              {data.top_askers.length === 0 ? (
                <p className="st-empty">No questions in this period.</p>
              ) : (
                <ul className="st-list">
                  {data.top_askers.map((asker) => (
                    <li key={asker.student_id}>
                      <Link to={`/students/${asker.student_id}`} className="st-cell">
                        <strong>{asker.display_name}</strong>
                      </Link>
                      <span className="st-muted">{whole(asker.turns)} questions</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ revenue */

interface Revenue {
  months: { month: string; kobo: number; payments: number }[];
  by_plan: { label: string; kobo: number; payments: number }[];
  by_length: { label: string; kobo: number; payments: number }[];
  by_channel: { label: string; kobo: number; payments: number }[];
  total_kobo: number;
  payments: number;
  payers: number;
  conversion: number;
  discount_kobo: number;
  free_grants: number;
  per_payer_kobo: number;
}

const nairaShort = (kobo: number) => {
  const amount = kobo / 100;
  return amount >= 1_000_000 ? `₦${+(amount / 1_000_000).toFixed(1)}M` : amount >= 1000 ? `₦${+(amount / 1000).toFixed(1)}K` : `₦${amount}`;
};

export function RevenuePage() {
  const [months, setMonths] = useState(12);
  const { data, problem } = useReport<Revenue>(`/v1/admin/revenue?months=${months}`, null);
  return (
    <>
      <StaffPageHead
        title="Revenue"
        sub="Money taken through Paystack, by month and by what was bought."
        actions={
          <div className="st-seg" role="tablist" aria-label="Months">
            {[6, 12, 24].map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={months === option}
                className={months === option ? 'on' : undefined}
                onClick={() => setMonths(option)}
              >
                {option} months
              </button>
            ))}
          </div>
        }
      />
      {!data ? (
        <Loading problem={problem} />
      ) : (
        <>
          <div className="st-stats four">
            <Stat label="Taken, all time" value={naira(data.total_kobo)} note={`${whole(data.payments)} ${data.payments === 1 ? "payment" : "payments"}`} />
            <Stat label="Paying students" value={whole(data.payers)} note={`${data.conversion}% of all students`} />
            <Stat label="Per paying student" value={naira(data.per_payer_kobo)} />
            <Stat
              label="Discounts given"
              value={naira(data.discount_kobo)}
              note={`${whole(data.free_grants)} ${data.free_grants === 1 ? 'plan' : 'plans'} at 100% off`}
            />
          </div>
          <section className="st-panel">
            <h2>Taken each month</h2>
            <ColumnChart
              columns={data.months.map((month) => ({
                label: new Date(`${month.month}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }),
                title: `${new Date(`${month.month}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}: ${month.payments} payments`,
                value: month.kobo,
              }))}
              format={nairaShort}
              every={months > 12 ? 3 : 1}
              label={`Money taken each month, last ${months} months`}
            />
          </section>
          <div className="st-grid three st-top">
            {(
              [
                ['By plan', data.by_plan],
                ['By length', data.by_length],
                ['By how they paid', data.by_channel],
              ] as const
            ).map(([title, rows]) => (
              <section key={title} className="st-panel">
                <h2>{title}</h2>
                {rows.length === 0 ? (
                  <p className="st-empty">No payments yet.</p>
                ) : (
                  <BarList rows={rows.map((row) => ({ key: row.label, label: row.label, value: row.kobo }))} format={nairaShort} label={title} />
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
