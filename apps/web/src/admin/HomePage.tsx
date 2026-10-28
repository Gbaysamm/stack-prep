/**
 * The dashboard's front page: the numbers that matter at a glance, what's waiting for someone,
 * quick ways to the common jobs, subjects, and the newest students and payments.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Maths } from '../Maths.js';
import { friendly, request } from '../lib/friendlyError.js';
import { naira } from '../prep/billingApi.js';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconCalendar,
  IconChart,
  IconClock,
  IconFlag,
  IconHelp,
  IconSettings,
  IconSparkles,
  IconTarget,
  IconTrophy,
  IconUser,
} from '../prep/icons.js';
import { useStaff } from '../staff/StaffGate.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { ago } from './StudentsPage.js';

interface Tile {
  key: string;
  label: string;
  value: number;
  sub_value: number | null;
  sub_label: string | null;
  link: string | null;
  money: boolean;
}

interface Person {
  student_id: string;
  display_name: string;
  login: string | null;
  at: string;
  detail: string | null;
}

interface Home {
  tiles: Tile[];
  subjects: { subject_id: string; name: string; questions: number; topics: number; students: number }[];
  new_students: Person[];
  payments: Person[];
  waiting: { kind: 'support' | 'report'; id: string; title: string; detail: string; at: string; link: string }[];
  problems: string[];
}

type Tint = 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'yellow';

/** The figures shown, in order, each with its icon and colour. */
const SHOWN: { key: string; icon: ReactNode; tint: Tint }[] = [
  { key: 'students', icon: <IconUser size={20} />, tint: 'purple' },
  { key: 'active', icon: <IconBolt size={20} />, tint: 'green' },
  { key: 'answers', icon: <IconTarget size={20} />, tint: 'blue' },
  { key: 'mocks', icon: <IconClock size={20} />, tint: 'orange' },
  { key: 'checkups', icon: <IconChart size={20} />, tint: 'yellow' },
  { key: 'revenue', icon: <IconTrophy size={20} />, tint: 'green' },
  { key: 'on_plan', icon: <IconSparkles size={20} />, tint: 'purple' },
  { key: 'reports', icon: <IconFlag size={20} />, tint: 'pink' },
];

const QUICK: { to: string; label: string; icon: ReactNode; tint: Tint }[] = [
  { to: '/students', label: 'Students', icon: <IconUser size={22} />, tint: 'purple' },
  { to: '/premium', label: 'Pricing & plans', icon: <IconSparkles size={22} />, tint: 'green' },
  { to: '/reports', label: 'Question reports', icon: <IconFlag size={22} />, tint: 'pink' },
  { to: '/engagement', label: 'Engagement', icon: <IconCalendar size={22} />, tint: 'blue' },
  { to: '/revenue', label: 'Revenue', icon: <IconTrophy size={22} />, tint: 'orange' },
  { to: '/settings', label: 'Settings', icon: <IconSettings size={22} />, tint: 'yellow' },
];

const TINTS: Tint[] = ['purple', 'green', 'blue', 'orange', 'pink', 'yellow'];
const whole = (n: number) => n.toLocaleString('en-NG');

export function HomePage() {
  const { user } = useStaff();
  const [data, setData] = useState<Home | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    request<Home>('/v1/admin/home')
      .then((next) => {
        setData(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const tiles = new Map((data?.tiles ?? []).map((tile) => [tile.key, tile]));
  const waitingCount = data?.waiting.length ?? 0;

  return (
    <>
      <StaffPageHead
        title={`${greeting}, ${user.display_name.split(' ')[0]}`}
        sub={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <button type="button" className="sj-btn ghost" disabled={busy} onClick={load}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && (
        <>
          {data.problems.length > 0 && (
            <Link to="/health" className="hm-alert">
              <span className="hm-alert-dot" aria-hidden="true" />
              <span>
                <strong>Needs setting up:</strong> {data.problems.join(', ')}.
              </span>
              <span className="hm-alert-go">
                System health <IconArrowRight size={16} />
              </span>
            </Link>
          )}

          <div className="hm-tiles">
            {SHOWN.map(({ key, icon, tint }) => {
              const tile = tiles.get(key);
              if (!tile) return null;
              const body = (
                <>
                  <span className="hm-tile-top">
                    <span className={`hm-icon ${tint}`} aria-hidden="true">
                      {icon}
                    </span>
                    {tile.link && <span className="hm-view">View</span>}
                  </span>
                  <span className="hm-tile-label">{tile.label}</span>
                  <strong className="hm-tile-value">{tile.money ? naira(tile.value) : whole(tile.value)}</strong>
                  <span className="hm-tile-sub">
                    {tile.sub_value !== null ? (
                      <>
                        <i className={`hm-dot ${tint}`} aria-hidden="true" />
                        {tile.money ? naira(tile.sub_value) : whole(tile.sub_value)} {tile.sub_label}
                      </>
                    ) : (
                      ' '
                    )}
                  </span>
                </>
              );
              return tile.link ? (
                <Link key={key} to={tile.link} className="hm-tile">
                  {body}
                </Link>
              ) : (
                <div key={key} className="hm-tile">
                  {body}
                </div>
              );
            })}
          </div>

          <div className="hm-row">
            <section className="hm-card">
              <header className="hm-card-head">
                <div>
                  <h2>Waiting for someone</h2>
                  <p>{waitingCount ? `${waitingCount} need a reply or a decision` : 'Nothing waiting'}</p>
                </div>
                <Link to="/reports" className="hm-more">
                  All reports <IconArrowRight size={15} />
                </Link>
              </header>
              {waitingCount === 0 ? (
                <p className="hm-empty">Support and question reports are all answered.</p>
              ) : (
                <ul className="hm-waiting">
                  {data.waiting.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link to={item.link}>
                        <span className={`hm-icon sm ${item.kind === 'support' ? 'blue' : 'pink'}`} aria-hidden="true">
                          {item.kind === 'support' ? <IconHelp size={16} /> : <IconFlag size={16} />}
                        </span>
                        <span className="hm-waiting-text">
                          <span className="hm-waiting-title">
                            <Maths text={item.title} />
                          </span>
                          <span className="hm-waiting-sub">
                            {item.kind === 'support' ? 'Support' : 'Question report'} · {item.detail}
                          </span>
                        </span>
                        <span className="hm-time">{ago(item.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="hm-card">
              <header className="hm-card-head">
                <div>
                  <h2>Quick actions</h2>
                  <p>The jobs that come up most</p>
                </div>
              </header>
              <div className="hm-quick">
                {QUICK.map((item) => (
                  <Link key={item.to} to={item.to} className="hm-quick-item">
                    <span className={`hm-icon lg ${item.tint}`} aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="hm-row three">
            <section className="hm-card">
              <header className="hm-card-head">
                <div>
                  <h2>Subjects</h2>
                  <p>
                    {whole(data.subjects.reduce((sum, s) => sum + s.questions, 0))} questions in {data.subjects.length} subjects
                  </p>
                </div>
                <Link to="/content" className="hm-more">
                  Content <IconArrowRight size={15} />
                </Link>
              </header>
              <ul className="hm-subjects">
                {data.subjects.map((subject, index) => (
                  <li key={subject.subject_id}>
                    <span className={`hm-letter ${TINTS[index % TINTS.length]}`} aria-hidden="true">
                      {subject.name.slice(0, 1)}
                    </span>
                    <span className="hm-subject-text">
                      <strong>{subject.name}</strong>
                      <span>
                        {subject.topics} topics · {whole(subject.students)} {subject.students === 1 ? 'student' : 'students'}
                      </span>
                    </span>
                    <span className="hm-subject-n">
                      {whole(subject.questions)}
                      <small>questions</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="hm-card">
              <header className="hm-card-head">
                <div>
                  <h2>Newest students</h2>
                  <p>{tiles.get('students')?.sub_value ?? 0} joined today</p>
                </div>
                <Link to="/students" className="hm-more">
                  All <IconArrowRight size={15} />
                </Link>
              </header>
              <ul className="hm-people">
                {data.new_students.map((person, index) => (
                  <li key={person.student_id}>
                    <Link to={`/students/${person.student_id}`}>
                      <span className={`hm-avatar ${TINTS[index % TINTS.length]}`} aria-hidden="true">
                        {person.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="hm-person-text">
                        <strong>{person.display_name}</strong>
                        <span>{person.detail || person.login || '—'}</span>
                      </span>
                      <span className="hm-time">{ago(person.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="hm-card">
              <header className="hm-card-head">
                <div>
                  <h2>Latest payments</h2>
                  <p>{tiles.get('revenue') ? `${naira(tiles.get('revenue')!.value)} this month` : ''}</p>
                </div>
                <Link to="/revenue" className="hm-more">
                  Revenue <IconArrowRight size={15} />
                </Link>
              </header>
              {data.payments.length === 0 ? (
                <p className="hm-empty">No payments yet.</p>
              ) : (
                <ul className="hm-people">
                  {data.payments.map((person) => (
                    <li key={`${person.student_id}-${person.at}`}>
                      <Link to={`/students/${person.student_id}`}>
                        <span className="hm-avatar green" aria-hidden="true">
                          ₦
                        </span>
                        <span className="hm-person-text">
                          <strong>{person.display_name}</strong>
                          <span>{person.detail}</span>
                        </span>
                        <span className="hm-time">{ago(person.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/questions" className="hm-bank">
                <IconBook size={18} /> The question bank: search every question
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
