/**
 * Content and activity: Subjects & topics, the Question bank (and one question in depth),
 * Question quality, and every Mock and Check-up sat. apps/api routers/admin_content.py.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Maths } from '../Maths.js';
import { friendly, request } from '../lib/friendlyError.js';
import { DatePicker } from '../lib/DatePicker.js';
import { Select } from '../lib/Select.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { ago } from './StudentsPage.js';

const whole = (n: number) => n.toLocaleString('en-NG');
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

function Accuracy({ value }: { value: number | null }) {
  if (value === null) return <span className="st-muted">—</span>;
  const tone = value >= 70 ? 'good' : value >= 40 ? 'warn' : 'bad';
  return <span className={`st-acc ${tone}`}>{value}%</span>;
}

function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setData(null);
    setProblem(null);
    request<T>(path)
      .then((next) => live && setData(next))
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [path]);
  return { data, problem };
}

/* ------------------------------------------------------------------ subjects */

interface SubjectContent {
  subject_id: string;
  name: string;
  examination: string;
  questions: number;
  topics: number;
  years: number;
  with_working: number;
  answered: number;
  accuracy: number | null;
  open_reports: number;
  students: number;
}

export function SubjectsPage() {
  const { data, problem } = useData<SubjectContent[]>('/v1/admin/content/subjects');
  const totals = data?.reduce(
    (sum, s) => ({ questions: sum.questions + s.questions, topics: sum.topics + s.topics, answered: sum.answered + s.answered }),
    { questions: 0, topics: 0, answered: 0 },
  );
  return (
    <>
      <StaffPageHead
        title="Subjects & topics"
        sub="What the question bank holds, subject by subject: questions live, topics, papers, worked solutions, and how students do."
      />
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && totals && (
        <>
          <div className="st-stats four">
            <div className="st-panel st-stat">
              <span>Subjects</span>
              <strong>{data.length}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Questions live</span>
              <strong>{whole(totals.questions)}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Topics covered</span>
              <strong>{whole(totals.topics)}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Answers recorded</span>
              <strong>{whole(totals.answered)}</strong>
            </div>
          </div>
          <section className="st-panel">
            <div className="st-table-wrap">
              <table className="st-table st-stack">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th style={{ textAlign: 'right' }}>Questions</th>
                    <th style={{ textAlign: 'right' }}>Topics</th>
                    <th style={{ textAlign: 'right' }}>Papers</th>
                    <th style={{ textAlign: 'right' }}>With working</th>
                    <th style={{ textAlign: 'right' }}>Students</th>
                    <th style={{ textAlign: 'right' }}>Answered right</th>
                    <th style={{ textAlign: 'right' }}>Open reports</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((subject) => (
                    <tr key={subject.subject_id}>
                      <td data-label="Subject">
                        <span className="st-cell">
                          <Link className="st-link" to={`/content/${subject.subject_id}`}>
                            {subject.name}
                          </Link>
                          <span className="st-muted">{subject.examination}</span>
                        </span>
                      </td>
                      <td data-label="Questions" style={{ textAlign: 'right' }}>
                        {whole(subject.questions)}
                      </td>
                      <td data-label="Topics" style={{ textAlign: 'right' }}>
                        {subject.topics}
                      </td>
                      <td data-label="Papers" style={{ textAlign: 'right' }}>
                        {subject.years}
                      </td>
                      <td data-label="With working" style={{ textAlign: 'right' }}>
                        {subject.questions ? `${Math.round((100 * subject.with_working) / subject.questions)}%` : '—'}
                      </td>
                      <td data-label="Students" style={{ textAlign: 'right' }}>
                        {whole(subject.students)}
                      </td>
                      <td data-label="Answered right" style={{ textAlign: 'right' }}>
                        <Accuracy value={subject.accuracy} />
                      </td>
                      <td data-label="Open reports" style={{ textAlign: 'right' }}>
                        {subject.open_reports ? <Link to="/reports">{subject.open_reports}</Link> : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

interface TopicContent {
  topic_id: string;
  name: string;
  section: string | null;
  questions: number;
  answered: number;
  accuracy: number | null;
  first_year: number | null;
  last_year: number | null;
}

export function SubjectTopicsPage() {
  const { subjectId = '' } = useParams();
  const subjects = useData<SubjectContent[]>('/v1/admin/content/subjects');
  const { data, problem } = useData<TopicContent[]>(`/v1/admin/content/subjects/${subjectId}`);
  const subject = subjects.data?.find((s) => s.subject_id === subjectId);
  const sections = [...new Set((data ?? []).map((t) => t.section ?? 'Other'))];
  return (
    <>
      <p className="st-back">
        <Link to="/content">← Subjects & topics</Link>
      </p>
      <StaffPageHead
        title={subject?.name ?? 'Subject'}
        sub={subject ? `${whole(subject.questions)} questions in ${subject.topics} topics, from ${subject.years} papers.` : undefined}
        actions={
          <Link className="sj-btn ghost" to={`/questions?subject=${subjectId}`}>
            Its questions
          </Link>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data &&
        sections.map((section) => (
          <section key={section} className="st-panel">
            <h2>{section}</h2>
            <div className="st-table-wrap">
              <table className="st-table st-stack">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th style={{ textAlign: 'right' }}>Questions</th>
                    <th>Papers</th>
                    <th style={{ textAlign: 'right' }}>Answers</th>
                    <th style={{ textAlign: 'right' }}>Answered right</th>
                  </tr>
                </thead>
                <tbody>
                  {data
                    .filter((t) => (t.section ?? 'Other') === section)
                    .map((topic) => (
                      <tr key={topic.topic_id}>
                        <td data-label="Topic">
                          <Link className="st-link" to={`/questions?subject=${subjectId}&topic=${topic.topic_id}`}>
                            {topic.name}
                          </Link>
                        </td>
                        <td data-label="Questions" style={{ textAlign: 'right' }}>
                          {topic.questions}
                        </td>
                        <td data-label="Papers" className="st-muted">
                          {topic.first_year && topic.last_year
                            ? topic.first_year === topic.last_year
                              ? topic.first_year
                              : `${topic.first_year} to ${topic.last_year}`
                            : '—'}
                        </td>
                        <td data-label="Answers" style={{ textAlign: 'right' }}>
                          {whole(topic.answered)}
                        </td>
                        <td data-label="Answered right" style={{ textAlign: 'right' }}>
                          <Accuracy value={topic.accuracy} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ question bank */

interface BankQuestion {
  question_id: string;
  subject_name: string;
  topic_name: string | null;
  exam_year: number | null;
  question_number: string | null;
  stem: string;
  review_status: string;
  answered: number;
  accuracy: number | null;
  open_reports: number;
}

const PAGE = 30;

export function QuestionBankPage() {
  const [params, setParams] = useSearchParams();
  const subjects = useData<SubjectContent[]>('/v1/admin/content/subjects');
  const q = params.get('q') ?? '';
  const subject = params.get('subject') ?? '';
  const topic = params.get('topic') ?? '';
  const sort = params.get('sort') ?? 'paper';
  const page = Number(params.get('page') ?? 0) || 0;
  const [draft, setDraft] = useState(q);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'subject') next.delete('topic');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (draft === q) return;
    const timer = window.setTimeout(() => set('q', draft.trim()), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const query = new URLSearchParams({ sort, limit: String(PAGE), offset: String(page * PAGE) });
  if (q) query.set('q', q);
  if (subject) query.set('subject_id', subject);
  if (topic) query.set('topic_id', topic);
  const { data, problem } = useData<{ total: number; questions: BankQuestion[] }>(`/v1/admin/questions?${query}`);
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <>
      <StaffPageHead title="Question bank" sub="Every live question, with how students do on it. Open one for its options, working, and reports." />
      <section className="st-panel st-filters st-filters-bank">
        <label className="st-field st-search">
          <span>Search</span>
          <input type="search" value={draft} placeholder="Words from the question, or its number" onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="st-field">
          <span>Subject</span>
          <Select
            aria-label="Subject"
            value={subject}
            onChange={(value) => set('subject', value)}
            options={[{ value: '', label: 'All subjects' }, ...(subjects.data ?? []).map((s) => ({ value: s.subject_id, label: s.name }))]}
          />
        </div>
        <div className="st-field">
          <span>Sort by</span>
          <Select
            aria-label="Sort by"
            value={sort}
            onChange={(value) => set('sort', value)}
            options={[
              { value: 'paper', label: 'Paper, newest first' },
              { value: 'most_answered', label: 'Most answered' },
              { value: 'least_accurate', label: 'Most missed' },
              { value: 'most_reported', label: 'Most reported' },
            ]}
          />
        </div>
      </section>
      {topic && (
        <p className="st-notice">
          Showing one topic. <button type="button" className="st-linkbtn" onClick={() => set('topic', '')}>Show the whole subject</button>
        </p>
      )}
      <section className="st-panel">
        {problem && <p className="st-error">{problem}</p>}
        {!data && !problem && <p className="st-muted">Loading…</p>}
        {data && (
          <>
            <p className="st-muted st-count">{data.total === 0 ? 'No questions match.' : `${whole(data.total)} questions`}</p>
            <ul className="st-bank">
              {data.questions.map((item) => (
                <li key={item.question_id}>
                  <Link to={`/questions/${item.question_id}`} className="st-bank-item">
                    <span className="st-bank-meta">
                      {item.subject_name}
                      {item.exam_year ? ` · ${item.exam_year}` : ''}
                      {item.question_number ? ` · Q${item.question_number}` : ''}
                      {item.topic_name ? ` · ${item.topic_name}` : ''}
                    </span>
                    <span className="st-bank-stem sp-textbook">
                      <Maths text={item.stem} />
                    </span>
                    <span className="st-bank-stats">
                      <span>{whole(item.answered)} {item.answered === 1 ? 'answer' : 'answers'}</span>
                      <Accuracy value={item.accuracy} />
                      {item.open_reports > 0 && <span className="st-pill bad">{item.open_reports} reported</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="st-row st-pager">
                <button type="button" className="sj-btn ghost sm" disabled={page === 0} onClick={() => set('page', String(page - 1))}>
                  Previous
                </button>
                <span className="st-muted">
                  Page {page + 1} of {pages}
                </span>
                <button type="button" className="sj-btn ghost sm" disabled={page + 1 >= pages} onClick={() => set('page', String(page + 1))}>
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

interface QuestionInDepth {
  question_id: string;
  subject_name: string;
  topic_name: string | null;
  section_name: string | null;
  exam_year: number | null;
  question_number: string | null;
  instructions: string | null;
  stem: string;
  review_status: string;
  solution_steps: string[];
  hints: string[];
  options: { option_key: string; body: string; is_correct: boolean; chosen: number }[];
  answered: number;
  accuracy: number | null;
  students: number;
  lesson_feedback: Record<string, number>;
  reports: { reason: string; detail: string | null; status: string; created_at: string }[];
}

export function QuestionPage() {
  const { questionId = '' } = useParams();
  const { data, problem } = useData<QuestionInDepth>(`/v1/admin/questions/${questionId}`);
  const most = data ? Math.max(1, ...data.options.map((o) => o.chosen)) : 1;
  const feedbackTotal = data ? Object.values(data.lesson_feedback).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <p className="st-back">
        <Link to="/questions">← Question bank</Link>
      </p>
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && (
        <>
          <StaffPageHead
            title={`${data.subject_name}${data.exam_year ? ` ${data.exam_year}` : ''}${data.question_number ? `, Q${data.question_number}` : ''}`}
            sub={[data.section_name, data.topic_name].filter(Boolean).join(' · ') || undefined}
            actions={
              <a className="sj-btn ghost" href="/review/questions">
                Open the reviewer
              </a>
            }
          />
          <div className="st-stats four">
            <div className="st-panel st-stat">
              <span>Answers</span>
              <strong>{whole(data.answered)}</strong>
              <small className="st-muted">by {whole(data.students)} students</small>
            </div>
            <div className="st-panel st-stat">
              <span>Answered right</span>
              <strong>{pct(data.accuracy)}</strong>
            </div>
            <div className="st-panel st-stat">
              <span>Lesson check-ins</span>
              <strong>{feedbackTotal}</strong>
              <small className="st-muted">
                {feedbackTotal
                  ? `${data.lesson_feedback.got_it ?? 0} got it, ${data.lesson_feedback.unsure ?? 0} unsure, ${data.lesson_feedback.too_hard ?? 0} too hard`
                  : 'None yet'}
              </small>
            </div>
            <div className="st-panel st-stat">
              <span>Reports</span>
              <strong>{data.reports.length}</strong>
              <small className="st-muted">{data.reports.filter((r) => r.status === 'open' || r.status === 'triaged').length} open</small>
            </div>
          </div>
          <div className="st-grid two st-top">
            <section className="st-panel">
              <h2>The question</h2>
              {data.instructions && (
                <p className="st-muted">
                  <Maths text={data.instructions} />
                </p>
              )}
              <p className="st-q-stem sp-textbook">
                <Maths text={data.stem} />
              </p>
              <ul className="st-q-options">
                {data.options.map((option) => (
                  <li key={option.option_key} className={option.is_correct ? 'key' : undefined}>
                    <span className="st-q-key">{option.option_key}</span>
                    <span className="st-q-body sp-textbook">
                      <Maths text={option.body} />
                    </span>
                    <span className="st-q-bar" aria-hidden="true">
                      <span style={{ width: `${(100 * option.chosen) / most}%` }} />
                    </span>
                    <span className="st-q-n">
                      {option.chosen}
                      {option.is_correct ? ' · key' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="st-muted st-chart-note">How many times each option was chosen. The key is marked.</p>
            </section>
            <div className="st-col">
              <section className="st-panel">
                <h2>Worked solution</h2>
                {data.solution_steps.length === 0 ? (
                  <p className="st-empty">No worked solution yet.</p>
                ) : (
                  <ol className="st-steps sp-textbook">
                    {data.solution_steps.map((step, index) => (
                      <li key={index}>
                        <Maths text={step} />
                      </li>
                    ))}
                  </ol>
                )}
                {data.hints.length > 0 && (
                  <p className="st-muted">
                    Hint: <Maths text={data.hints[0]!} />
                  </p>
                )}
              </section>
              <section className="st-panel">
                <h2>Reports</h2>
                {data.reports.length === 0 ? (
                  <p className="st-empty">Nobody has reported this question.</p>
                ) : (
                  <ul className="st-list">
                    {data.reports.map((report, index) => (
                      <li key={index}>
                        <span className="st-cell">
                          <strong>{report.reason.replace('_', ' ')}</strong>
                          {report.detail && <span className="st-muted">“{report.detail}”</span>}
                        </span>
                        <span className="st-cell st-end">
                          <span className={`st-pill ${report.status === 'open' || report.status === 'triaged' ? 'warn' : 'good'}`}>
                            {report.status === 'rejected' ? 'Not a problem' : report.status}
                          </span>
                          <span className="st-muted">{ago(report.created_at)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ quality */

interface QualityItem {
  question_id: string;
  subject_name: string;
  exam_year: number | null;
  question_number: string | null;
  stem: string;
  answered: number;
  accuracy: number | null;
  note: string;
}

interface Quality {
  key_doubts: QualityItem[];
  most_missed: QualityItem[];
  most_reported: QualityItem[];
  lessons_not_landing: QualityItem[];
  minimum_answers: number;
}

const QUALITY: { key: keyof Omit<Quality, 'minimum_answers'>; title: string; why: string }[] = [
  {
    key: 'key_doubts',
    title: 'Check the key',
    why: 'More students chose one wrong option than the keyed answer. A wrong key is the usual reason: check it first.',
  },
  { key: 'most_reported', title: 'Most reported', why: 'Questions with open reports from students or checks.' },
  { key: 'lessons_not_landing', title: 'Lessons not landing', why: 'Half or more of the students who checked in said the lesson didn’t help.' },
  { key: 'most_missed', title: 'Most missed', why: 'Answered right least often. Hard is fine; check they are fair and clearly worded.' },
];

export function QualityPage() {
  const [subject, setSubject] = useState('');
  const subjects = useData<SubjectContent[]>('/v1/admin/content/subjects');
  const { data, problem } = useData<Quality>(`/v1/admin/quality${subject ? `?subject_id=${subject}` : ''}`);
  return (
    <>
      <StaffPageHead
        title="Question quality"
        sub="The questions to look at first, so every student is taught the right answer."
        actions={
          <Select
            className="st-pick-wide"
            aria-label="Subject"
            value={subject}
            onChange={setSubject}
            options={[{ value: '', label: 'All subjects' }, ...(subjects.data ?? []).map((s) => ({ value: s.subject_id, label: s.name }))]}
          />
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data &&
        QUALITY.map((group) => (
          <section key={group.key} className="st-panel">
            <div className="st-panel-head">
              <div>
                <h2>
                  {group.title} <span className="st-muted">({data[group.key].length})</span>
                </h2>
                <p className="st-muted st-quality-why">{group.why}</p>
              </div>
            </div>
            {data[group.key].length === 0 ? (
              <p className="st-empty">Nothing here{group.key === 'most_missed' || group.key === 'key_doubts' ? ` with at least ${data.minimum_answers} answers` : ''}.</p>
            ) : (
              <ul className="st-bank">
                {data[group.key].map((item) => (
                  <li key={item.question_id}>
                    <Link to={`/questions/${item.question_id}`} className="st-bank-item">
                      <span className="st-bank-meta">
                        {item.subject_name}
                        {item.exam_year ? ` · ${item.exam_year}` : ''}
                        {item.question_number ? ` · Q${item.question_number}` : ''}
                      </span>
                      <span className="st-bank-stem sp-textbook">
                        <Maths text={item.stem} />
                      </span>
                      <span className="st-bank-stats">
                        <span className="st-pill warn">{item.note}</span>
                        <span>{whole(item.answered)} {item.answered === 1 ? 'answer' : 'answers'}</span>
                        <Accuracy value={item.accuracy} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ mocks and check-ups */

interface MockRow {
  mock_id: string;
  student_id: string;
  display_name: string;
  subjects: string;
  preset: string;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  questions: number;
  right: number;
  percent: number | null;
  integrity_flags: number;
}

function usePaged<T>(path: string) {
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(typed.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const sep = path.includes('?') ? '&' : '?';
  const result = useData<T>(`${path}${sep}limit=${PAGE}&offset=${page * PAGE}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  return { ...result, page, setPage, typed, setTyped };
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) {
  const pages = Math.ceil(total / PAGE);
  if (pages <= 1) return null;
  return (
    <div className="st-row st-pager">
      <button type="button" className="sj-btn ghost sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="st-muted">
        Page {page + 1} of {pages}
      </span>
      <button type="button" className="sj-btn ghost sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ scheduled mocks */
// A mock Stack Prep sets for every student of an examination (routers/admin_content.py). Students
// see it on their Mock exam page while it is open, and sit it once in JAMB's format.

interface ScheduledMockRow {
  id: string;
  examination_id: string;
  examination: string;
  title: string;
  opens_on: string;
  closes_on: string;
  sat: number;
}
interface ScheduledMocksData {
  mocks: ScheduledMockRow[];
  examinations: { id: string; short_name: string; name: string }[];
}
interface MockDraft {
  examination_id: string;
  title: string;
  opens_on: string;
  closes_on: string;
}

const dayWords = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function ScheduledMocks() {
  const [data, setData] = useState<ScheduledMocksData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<MockDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    request<ScheduledMocksData>('/v1/admin/scheduled-mocks')
      .then(setData)
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);

  const set = <K extends keyof MockDraft>(key: K, value: MockDraft[K]) =>
    setDraft((now) => (now ? { ...now, [key]: value } : now));
  const fresh = () =>
    setDraft({
      examination_id: data?.examinations.find((e) => e.short_name === 'UTME')?.id ?? data?.examinations[0]?.id ?? '',
      title: '',
      opens_on: '',
      closes_on: '',
    });
  const ready = Boolean(
    draft && draft.examination_id && draft.title.trim() && draft.opens_on && draft.closes_on && draft.closes_on >= draft.opens_on,
  );

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !ready || busy) return;
    setBusy(true);
    setProblem(null);
    request('/v1/admin/scheduled-mocks', { method: 'POST', body: JSON.stringify(draft) })
      .then(() => {
        setDraft(null);
        load();
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  const cancel = (mock: ScheduledMockRow) => {
    if (!window.confirm(`Cancel “${mock.title}”? Students stop seeing it; mocks already sat keep their results.`)) return;
    request(`/v1/admin/scheduled-mocks/${mock.id}`, { method: 'DELETE' })
      .then(load)
      .catch((error) => setProblem(friendly(error)));
  };

  const today = todayIso();
  return (
    <section className="st-panel">
      <div className="st-panel-head sm-head">
        <div>
          <h2>Scheduled mocks</h2>
          <p className="st-muted">
            Set a mock for every student of an exam. They see it on their Mock exam page between the two days and sit it once, in JAMB’s format.
          </p>
        </div>
        <button type="button" className="sj-btn" onClick={fresh} disabled={!data}>
          Schedule a mock
        </button>
      </div>
      {problem && !draft && <p className="st-error">{problem}</p>}
      {data && data.mocks.length === 0 && <p className="st-muted">Nothing scheduled yet.</p>}
      {data && data.mocks.length > 0 && (
        <div className="st-table-wrap">
          <table className="st-table st-stack">
            <thead>
              <tr>
                <th>Mock</th>
                <th>Open</th>
                <th style={{ textAlign: 'right' }}>Sat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.mocks.map((mock) => (
                <tr key={mock.id}>
                  <td data-label="Mock">
                    <span className="st-cell">
                      {mock.title}
                      <span className="st-muted">
                        {mock.examination}
                        {mock.closes_on < today ? ' · closed' : mock.opens_on <= today ? ' · open now' : ''}
                      </span>
                    </span>
                  </td>
                  <td data-label="Open" className="st-muted">
                    {mock.opens_on === mock.closes_on ? dayWords(mock.opens_on) : `${dayWords(mock.opens_on)} – ${dayWords(mock.closes_on)}`}
                  </td>
                  <td data-label="Sat" style={{ textAlign: 'right' }}>
                    {mock.sat}
                  </td>
                  <td>
                    <button type="button" className="sj-btn ghost sm" onClick={() => cancel(mock)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && data && (
        <div className="pp-drawer" role="dialog" aria-modal="true" aria-label="Schedule a mock">
          <button type="button" className="pp-drawer-scrim" aria-label="Close" onClick={() => !busy && setDraft(null)} />
          <aside className="pp-drawer-panel">
            <header className="pp-drawer-head">
              <h3>Schedule a mock</h3>
              <button type="button" className="pp-drawer-close" aria-label="Close" onClick={() => setDraft(null)} disabled={busy}>
                ×
              </button>
            </header>
            <form className="st-form" onSubmit={save}>
              <div className="st-field">
                <span>Exam</span>
                <Select
                  aria-label="Exam"
                  value={draft.examination_id}
                  onChange={(v) => set('examination_id', v)}
                  options={data.examinations.map((e) => ({ value: e.id, label: e.short_name, hint: e.name }))}
                />
              </div>
              <label className="st-field">
                <span>Name students see</span>
                <input value={draft.title} maxLength={120} placeholder="December mock" onChange={(e) => set('title', e.target.value)} />
              </label>
              <div className="an-two">
                <div className="st-field">
                  <span>First day</span>
                  <DatePicker aria-label="First day" value={draft.opens_on} min={today} onChange={(v) => set('opens_on', v)} />
                </div>
                <div className="st-field">
                  <span>Last day</span>
                  <DatePicker
                    aria-label="Last day"
                    value={draft.closes_on}
                    min={draft.opens_on || today}
                    onChange={(v) => set('closes_on', v)}
                  />
                </div>
              </div>
              {problem && <p className="st-error">{problem}</p>}
              <div className="an-drawer-actions">
                <button type="submit" className="sj-btn" disabled={busy || !ready}>
                  {busy ? 'Saving…' : 'Schedule it'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}

export function MocksPage() {
  const [flagged, setFlagged] = useState(false);
  const { data, problem, page, setPage, typed, setTyped } = usePaged<{
    total: number;
    submitted: number;
    average_percent: number | null;
    mocks: MockRow[];
  }>(`/v1/admin/mocks${flagged ? '?flagged=true' : ''}`);
  const when = useCallback((iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), []);
  return (
    <>
      <StaffPageHead title="Mock exams" sub="Every mock sat: who, which subjects, the score, and whether they left the test." />
      <ScheduledMocks />
      <section className="st-panel st-filters st-filters-two">
        <label className="st-field st-search">
          <span>Student</span>
          <input type="search" value={typed} placeholder="A student's name" onChange={(event) => setTyped(event.target.value)} />
        </label>
        <label className="st-check st-check-pad">
          <input type="checkbox" checked={flagged} onChange={(event) => setFlagged(event.target.checked)} />
          Only mocks where they left the test
        </label>
      </section>
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && (
        <section className="st-panel">
          <p className="st-muted st-count">
            {whole(data.total)} mocks · {whole(data.submitted)} submitted
            {data.average_percent !== null ? ` · ${data.average_percent}% average on this page` : ''}
          </p>
          <div className="st-table-wrap">
            <table className="st-table st-stack">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subjects</th>
                  <th>Started</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th>Left the test</th>
                </tr>
              </thead>
              <tbody>
                {data.mocks.map((mock) => (
                  <tr key={mock.mock_id}>
                    <td data-label="Student">
                      <Link className="st-link" to={`/students/${mock.student_id}`}>
                        {mock.display_name}
                      </Link>
                    </td>
                    <td data-label="Subjects">
                      <span className="st-cell">
                        {mock.subjects || '—'}
                        <span className="st-muted">
                          {mock.questions} questions{mock.preset === 'utme' ? ' · Scheduled' : ''}
                        </span>
                      </span>
                    </td>
                    <td data-label="Started" className="st-muted">
                      {when(mock.started_at)}
                    </td>
                    <td data-label="Score" style={{ textAlign: 'right' }}>
                      {mock.submitted_at === null ? <span className="st-pill warn">Running</span> : <Accuracy value={mock.percent} />}
                    </td>
                    <td data-label="Left the test">
                      {mock.integrity_flags ? (
                        <span className="st-pill bad">
                          {mock.integrity_flags} {mock.integrity_flags === 1 ? 'time' : 'times'}
                        </span>
                      ) : (
                        <span className="st-muted">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} onPage={setPage} />
        </section>
      )}
    </>
  );
}

interface CheckupRow {
  session_id: string;
  student_id: string;
  display_name: string;
  subject_name: string;
  started_at: string;
  ended_at: string | null;
  answered: number;
  right: number;
  percent: number | null;
}

export function CheckupsPage() {
  const { data, problem, page, setPage, typed, setTyped } = usePaged<{ total: number; finished: number; checkups: CheckupRow[] }>(
    '/v1/admin/checkups',
  );
  return (
    <>
      <StaffPageHead title="Check-ups" sub="Every check-up started: the subject, how many questions, and the score that sets where a student starts." />
      <section className="st-panel st-filters st-filters-two">
        <label className="st-field st-search">
          <span>Student</span>
          <input type="search" value={typed} placeholder="A student's name" onChange={(event) => setTyped(event.target.value)} />
        </label>
      </section>
      {problem && <p className="st-error">{problem}</p>}
      {!data && !problem && <p className="st-muted">Loading…</p>}
      {data && (
        <section className="st-panel">
          <p className="st-muted st-count">
            {whole(data.total)} check-ups · {whole(data.finished)} finished
          </p>
          <div className="st-table-wrap">
            <table className="st-table st-stack">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Started</th>
                  <th style={{ textAlign: 'right' }}>Answered</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.checkups.map((row) => (
                  <tr key={row.session_id}>
                    <td data-label="Student">
                      <Link className="st-link" to={`/students/${row.student_id}`}>
                        {row.display_name}
                      </Link>
                    </td>
                    <td data-label="Subject">{row.subject_name}</td>
                    <td data-label="Started" className="st-muted">
                      {ago(row.started_at)}
                    </td>
                    <td data-label="Answered" style={{ textAlign: 'right' }}>
                      {row.answered}
                    </td>
                    <td data-label="Score" style={{ textAlign: 'right' }}>
                      {row.ended_at === null ? <span className="st-pill warn">Not finished</span> : <Accuracy value={row.percent} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} onPage={setPage} />
        </section>
      )}
    </>
  );
}
