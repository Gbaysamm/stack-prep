/**
 * The reviewer's question bank (routers/bank.py): an exam's subjects as a grid, a subject's
 * papers by year, and a paper's questions, where each one is checked and approved (the
 * QuestionPanel from ReviewPage.tsx), edited, or removed, and new ones are added.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Maths } from '../Maths.js';
import { friendly } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { IconArrowLeft, IconArrowRight, IconFlag, IconLayers, IconPencil, IconSparkles, IconTrash } from '../prep/icons.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { REVIEW_CHANGED, api, type QuestionDetail, type Skill } from './api.js';
import {
  bank,
  type ExamPage,
  type PaperLine,
  type PaperPage,
  type QuestionIn,
  type QuestionLine,
  type SubjectPage,
} from './bankApi.js';
import { ImportJson } from './ImportJson.js';
import { QuestionPanel } from './ReviewPage.js';
import './bank.css';

export const TINTS = ['purple', 'green', 'blue', 'orange', 'pink', 'yellow'] as const;
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

export function useLoad<T>(load: () => Promise<T>, key: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setProblem(null);
    load()
      .then((value) => live && setData(value))
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, tick]);
  return { data, problem, reload: useCallback(() => setTick((n) => n + 1), []) };
}

/** Approved out of all, as a bar with words. */
function Progress({ approved, total }: { approved: number; total: number }) {
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="bk-progress">
      <span className="bk-bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span>
        {total ? `${pct}% approved` : 'No questions yet'}
      </span>
    </div>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="bk-crumbs" aria-label="Where you are">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? <span className="bk-sep">/</span> : null}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <strong>{item.label}</strong>}
        </span>
      ))}
    </nav>
  );
}

/** A side panel with a form: adding an exam, a subject, a paper or a question. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="pp-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="pp-drawer-scrim" aria-label="Close" onClick={onClose} />
      <aside className="pp-drawer-panel">
        <header className="pp-drawer-head">
          <h3>{title}</h3>
          <button type="button" className="pp-drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ the exams, in the menu */

export function AddExam({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', short_name: '', exam_body: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bank
      .addExam(form)
      .then((exam) => onAdded(exam.id))
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title="Add an exam" onClose={onClose}>
      <form className="st-form" onSubmit={save}>
        <label className="st-field">
          <span>Short name</span>
          <input value={form.short_name} maxLength={24} placeholder="WAEC" onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
        </label>
        <label className="st-field">
          <span>Full name</span>
          <input
            value={form.name}
            maxLength={120}
            placeholder="West African Senior School Certificate Examination"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="st-field">
          <span>Set by</span>
          <input
            value={form.exam_body}
            maxLength={120}
            placeholder="West African Examinations Council"
            onChange={(e) => setForm({ ...form, exam_body: e.target.value })}
          />
        </label>
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn" disabled={busy || !form.name.trim() || !form.short_name.trim() || !form.exam_body.trim()}>
          {busy ? 'Adding…' : 'Add the exam'}
        </button>
      </form>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ an exam: its subjects */

export function ExamSubjects() {
  const { examId = '' } = useParams();
  const { data, problem, reload } = useLoad<ExamPage>(() => bank.exam(examId), [examId]);
  const [adding, setAdding] = useState(false);
  const totals = useMemo(() => {
    const s = data?.subjects ?? [];
    return {
      questions: s.reduce((n, x) => n + x.questions, 0),
      approved: s.reduce((n, x) => n + x.approved, 0),
      waiting: s.reduce((n, x) => n + x.needs_review, 0),
      flagged: s.reduce((n, x) => n + x.flagged, 0),
    };
  }, [data]);

  return (
    <>
      <StaffPageHead
        title={data ? data.exam.short_name : 'Subjects'}
        sub={data ? `${data.exam.name} · set by ${data.exam.exam_body}` : undefined}
        actions={
          <button type="button" className="sj-btn" onClick={() => setAdding(true)}>
            Add a subject
          </button>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {data && (
        <>
          <div className="bk-stats">
            <div>
              <strong>{totals.questions.toLocaleString('en-NG')}</strong>
              <span>questions</span>
            </div>
            <div>
              <strong>{totals.approved.toLocaleString('en-NG')}</strong>
              <span>approved</span>
            </div>
            <div>
              <strong>{totals.waiting.toLocaleString('en-NG')}</strong>
              <span>waiting for a check</span>
            </div>
            <div className={totals.flagged ? 'warn' : undefined}>
              <strong>{totals.flagged.toLocaleString('en-NG')}</strong>
              <span>reported</span>
            </div>
          </div>
          {data.subjects.length === 0 ? (
            <div className="bk-empty">
              <span className="bk-empty-icon" aria-hidden="true">
                <IconLayers size={26} />
              </span>
              <h2>No subjects yet</h2>
              <p>Add the first subject of {data.exam.short_name}. It can start from the topics of a subject you already have.</p>
              <button type="button" className="sj-btn" onClick={() => setAdding(true)}>
                Add a subject
              </button>
            </div>
          ) : (
            <ul className="bk-grid">
              {data.subjects.map((subject, index) => (
                <li key={subject.subject_id}>
                  <Link to={`/subjects/${subject.subject_id}`} className="bk-card">
                    <span className="bk-card-top">
                      <span className={`bk-letter ${TINTS[index % TINTS.length]}`} aria-hidden="true">
                        {subject.name.slice(0, 1)}
                      </span>
                      {subject.flagged ? (
                        <span className="bk-flag">
                          <IconFlag size={13} /> {subject.flagged}
                        </span>
                      ) : null}
                    </span>
                    <strong className="bk-card-name">{subject.name}</strong>
                    <span className="bk-card-meta">
                      {plural(subject.papers, 'paper')} · {plural(subject.questions, 'question')}
                    </span>
                    <Progress approved={subject.approved} total={subject.questions} />
                    {!subject.has_topics ? <span className="bk-note">No topics yet: questions can't go live</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {adding && data ? (
        <AddSubject
          examId={examId}
          sources={data.topic_sources}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function AddSubject({
  examId,
  sources,
  onClose,
  onAdded,
}: {
  examId: string;
  sources: ExamPage['topic_sources'];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [copy, setCopy] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bank
      .addSubject(examId, { name, copy_topics_from: copy || null })
      .then(onAdded)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title="Add a subject" onClose={onClose}>
      <form className="st-form" onSubmit={save}>
        <label className="st-field">
          <span>Name</span>
          <input value={name} maxLength={80} placeholder="Mathematics" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="st-field">
          <span>Start from the topics of</span>
          <Select
            aria-label="Start from the topics of"
            value={copy}
            onChange={setCopy}
            options={[
              { value: '', label: 'No topics for now' },
              ...sources.map((s) => ({ value: s.subject_id, label: `${s.exam} ${s.name}` })),
            ]}
          />
          <small className="st-muted">
            A question can only go live under a topic. Copying gives this subject the same topic list (you can change it later).
          </small>
        </div>
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn" disabled={busy || name.trim().length < 2}>
          {busy ? 'Adding…' : 'Add the subject'}
        </button>
      </form>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ a subject: its papers */

export function SubjectPapers() {
  const { subjectId = '' } = useParams();
  const { data, problem, reload } = useLoad<SubjectPage>(() => bank.subject(subjectId), [subjectId]);
  const [adding, setAdding] = useState<PaperKind | null>(null);
  const [renaming, setRenaming] = useState<PaperLine | null>(null);
  const [removing, setRemoving] = useState<PaperLine | null>(null);
  const papers = data?.papers ?? [];
  const past = papers.filter((p) => !p.own).sort((a, b) => (b.exam_year ?? 0) - (a.exam_year ?? 0));
  const own = papers.filter((p) => p.own && !p.ai_generated);
  const ai = papers.filter((p) => p.ai_generated);
  const rows = (list: PaperLine[]) => (
    <ul className="bk-rows">
      {list.map((paper) => (
        <PaperRow key={paper.paper_id} paper={paper} onRename={() => setRenaming(paper)} onRemove={() => setRemoving(paper)} />
      ))}
    </ul>
  );

  return (
    <>
      {data && <Crumbs items={[{ to: `/exams/${data.exam.id}`, label: data.exam.short_name }, { label: data.subject.name }]} />}
      <StaffPageHead
        title={data ? data.subject.name : 'Papers'}
        sub={
          data
            ? `${plural(data.subject.questions, 'question')} · ${data.subject.approved.toLocaleString('en-NG')} approved`
            : undefined
        }
        actions={
          <>
            <Link to={`/topics/${subjectId}`} className="sj-btn ghost">
              Topics
            </Link>
            <Link to={`/lessons/${subjectId}`} className="sj-btn ghost">
              Lessons
            </Link>
            <button type="button" className="sj-btn" onClick={() => setAdding('past')}>
              Add a paper
            </button>
          </>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {data && (
        <div className="bk-sections">
          <section className="bk-section">
            <header className="bk-section-head">
              <h2>Past papers</h2>
              <span>{plural(past.length, 'year')}</span>
            </header>
            {past.length ? rows(past) : <p className="st-muted">No past papers yet.</p>}
          </section>
          <section className="bk-section">
            <header className="bk-section-head">
              <h2>Our own sets</h2>
              <button type="button" className="bk-link" onClick={() => setAdding('own')}>
                New set
              </button>
            </header>
            {own.length ? rows(own) : <p className="st-muted">Questions we write ourselves, outside any past paper.</p>}
          </section>
          <section className="bk-section ai">
            <header className="bk-section-head">
              <h2>
                AI-generated sets <span className="bk-ai">AI</span>
              </h2>
              <button type="button" className="bk-link" onClick={() => setAdding('ai')}>
                New AI set
              </button>
            </header>
            {ai.length ? (
              rows(ai)
            ) : (
              <p className="st-muted">
                Questions written by an AI and brought in as JSON. Each one is checked by a reviewer before any student sees it.
              </p>
            )}
          </section>
        </div>
      )}
      {adding ? (
        <AddPaper
          subjectId={subjectId}
          start={adding}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            reload();
          }}
        />
      ) : null}
      {renaming ? (
        <RenamePaper
          paper={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            reload();
          }}
        />
      ) : null}
      {removing ? (
        <RemovePaper
          paper={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

const paperName = (paper: PaperLine) => (paper.own ? paper.title : String(paper.exam_year));

/** One paper as a row: its name, its questions and how many are approved, and its two actions. */
function PaperRow({ paper, onRename, onRemove }: { paper: PaperLine; onRename: () => void; onRemove: () => void }) {
  const share = paper.questions ? Math.round((paper.approved / paper.questions) * 100) : 0;
  return (
    <li className="bk-row">
      <Link to={`/papers/${paper.paper_id}`} className="bk-row-main">
        <strong>{paperName(paper)}</strong>
        <span className="bk-row-count">{plural(paper.questions, 'question')}</span>
        <span className="bk-row-bar" aria-label={`${share}% approved`}>
          <i style={{ width: `${share}%` }} />
        </span>
        <span className="bk-row-share">{paper.questions ? `${share}% approved` : 'Empty'}</span>
        {paper.needs_review ? <span className="bk-row-todo">{paper.needs_review} to check</span> : null}
        {paper.flagged ? (
          <span className="bk-flag">
            <IconFlag size={13} /> {paper.flagged}
          </span>
        ) : null}
      </Link>
      <div className="bk-row-actions">
        <button type="button" onClick={onRename} title={paper.own ? 'Rename' : 'Change the year'} aria-label={`Rename ${paperName(paper)}`}>
          <IconPencil size={16} />
        </button>
        <button type="button" className="danger" onClick={onRemove} title="Remove" aria-label={`Remove ${paperName(paper)}`}>
          <IconTrash size={16} />
        </button>
      </div>
    </li>
  );
}

type PaperKind = 'past' | 'own' | 'ai';
const KIND_WORD: Record<PaperKind, string> = { past: 'A past paper', own: 'A set of our own', ai: 'An AI-generated set' };

function AddPaper({
  subjectId,
  start,
  onClose,
  onAdded,
}: {
  subjectId: string;
  start: PaperKind;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<PaperKind>(start);
  const [year, setYear] = useState('');
  const [title, setTitle] = useState(start === 'ai' ? 'AI-generated practice 1' : '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ok = kind === 'past' ? /^\d{4}$/.test(year) : title.trim().length > 1;
  const save = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bank
      .addPaper(subjectId, kind === 'past' ? { exam_year: Number(year) } : { title, ai_generated: kind === 'ai' })
      .then(onAdded)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title="Add a paper" onClose={onClose}>
      <form className="st-form" onSubmit={save}>
        <div className="st-seg bk-kind" role="radiogroup" aria-label="Kind of paper">
          {(['past', 'own', 'ai'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              className={kind === value ? 'on' : undefined}
              onClick={() => {
                setKind(value);
                if (value === 'ai' && !title) setTitle('AI-generated practice 1');
              }}
            >
              {KIND_WORD[value]}
            </button>
          ))}
        </div>
        {kind === 'past' ? (
          <label className="st-field">
            <span>Year</span>
            <input inputMode="numeric" maxLength={4} value={year} placeholder="2019" onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : (
          <label className="st-field">
            <span>Name of the set</span>
            <input value={title} maxLength={80} placeholder="Stack Prep set 1" onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {kind === 'ai' ? (
          <p className="st-muted">
            Its questions carry an AI badge, are never mixed with past papers, and wait for a reviewer before any student sees them.
          </p>
        ) : null}
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn" disabled={busy || !ok}>
          {busy ? 'Adding…' : 'Add it'}
        </button>
      </form>
    </Drawer>
  );
}

function RenamePaper({ paper, onClose, onDone }: { paper: PaperLine; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(paper.own ? paper.title : String(paper.exam_year ?? ''));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ok = paper.own ? value.trim().length > 1 : /^\d{4}$/.test(value);
  const save = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bank
      .renamePaper(paper.paper_id, paper.own ? { title: value } : { exam_year: Number(value) })
      .then(onDone)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title={paper.own ? 'Rename the set' : 'Change the year'} onClose={onClose}>
      <form className="st-form" onSubmit={save}>
        <label className="st-field">
          <span>{paper.own ? 'Name of the set' : 'Year'}</span>
          {paper.own ? (
            <input value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} autoFocus />
          ) : (
            <input inputMode="numeric" maxLength={4} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} autoFocus />
          )}
        </label>
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn" disabled={busy || !ok}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Drawer>
  );
}

function RemovePaper({ paper, onClose, onDone }: { paper: PaperLine; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = () => {
    setBusy(true);
    bank
      .removePaper(paper.paper_id, paper.questions > 0)
      .then(onDone)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title={`Remove ${paperName(paper)}?`} onClose={onClose}>
      <div className="st-form">
        <p>
          {paper.questions
            ? `Its ${plural(paper.questions, 'question')} stop being served to students at once. Nothing is deleted: answers students already gave, and their scores, stay as they are.`
            : 'It has no questions.'}
        </p>
        {problem && <p className="st-error">{problem}</p>}
        <div className="bk-confirm">
          <button type="button" className="sj-btn ghost" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="sj-btn danger" disabled={busy} onClick={remove}>
            {busy ? 'Removing…' : paper.questions ? `Remove it and its ${plural(paper.questions, 'question')}` : 'Remove it'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ a paper: its questions */

const STATE_WORD: Record<QuestionLine['state'], [string, string]> = {
  approved: ['Approved', 'good'],
  ready: ['Ready to approve', 'admin'],
  needs_review: ['Needs a check', 'warn'],
};

export function PaperQuestions() {
  const { paperId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const open = params.get('q');
  const { data, problem, reload } = useLoad<PaperPage>(() => bank.paper(paperId), [paperId]);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | QuestionDetail | null>(null);
  const [filter, setFilter] = useState<'all' | QuestionLine['state'] | 'flagged'>('all');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (data?.syllabus_version_id) void api.skills(data.syllabus_version_id).then(setSkills).catch(() => undefined);
  }, [data?.syllabus_version_id]);
  useEffect(() => {
    setActionProblem(null);
    if (!open) return setDetail(null);
    let live = true;
    api
      .question(open)
      .then((value) => live && setDetail(value))
      .catch((error) => live && setActionProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [open]);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('q', id);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const act = async (action: () => Promise<QuestionDetail>) => {
    setBusy(true);
    setActionProblem(null);
    try {
      setDetail(await action());
      window.dispatchEvent(new Event(REVIEW_CHANGED));
      reload();
    } catch (error) {
      setActionProblem(friendly(error));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!detail) return;
    const reason = window.prompt('Why remove this question? Students who answered it keep their scores.', 'A duplicate');
    if (reason === null) return;
    try {
      await bank.removeQuestion(detail.question_id, reason || 'Removed by a reviewer');
      select(null);
      reload();
    } catch (error) {
      setActionProblem(friendly(error));
    }
  };

  const questions = (data?.questions ?? []).filter((q) =>
    filter === 'all' ? true : filter === 'flagged' ? q.open_reports > 0 : q.state === filter,
  );
  const counts = useMemo(() => {
    const all = data?.questions ?? [];
    return {
      all: all.length,
      needs_review: all.filter((q) => q.state === 'needs_review').length,
      ready: all.filter((q) => q.state === 'ready').length,
      approved: all.filter((q) => q.state === 'approved').length,
      flagged: all.filter((q) => q.open_reports > 0).length,
    };
  }, [data]);
  // Move between questions with J and K, as in the old queue.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = questions.findIndex((q) => q.question_id === open);
      const next = questions[index + (event.key === 'j' ? 1 : -1)];
      if (next) select(next.question_id);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <>
      {data && (
        <Crumbs
          items={[
            { to: `/exams/${data.exam.id}`, label: data.exam.short_name },
            { to: `/subjects/${data.subject.subject_id}`, label: data.subject.name },
            { label: data.paper.own ? data.paper.title : String(data.paper.exam_year) },
          ]}
        />
      )}
      <StaffPageHead
        title={data ? (data.paper.own ? data.paper.title : `${data.subject.name} ${data.paper.exam_year}`) : 'Paper'}
        sub={
          data
            ? `${data.paper.ai_generated ? 'AI-generated set · ' : ''}${plural(data.paper.questions, 'question')} · ${data.paper.approved} approved · ${data.paper.needs_review} to check`
            : undefined
        }
        actions={
          <>
            {data?.paper.ai_generated ? (
              <button type="button" className="sj-btn ghost" onClick={() => setImporting(true)}>
                <IconSparkles size={16} /> Import JSON
              </button>
            ) : null}
            <button type="button" className="sj-btn" onClick={() => setEditing('new')}>
              Add a question
            </button>
          </>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {data && !data.syllabus_version_id ? (
        <p className="bk-banner">This subject has no topics yet, so its questions can be written and checked but not approved.</p>
      ) : null}
      {data && (
        <div className={`bk-paper ${open ? 'reading' : ''}`}>
          <section className="st-panel bk-list">
            <div className="st-seg bk-filter" role="tablist" aria-label="Show">
              {(
                [
                  ['all', 'All'],
                  ['needs_review', 'To check'],
                  ['ready', 'Ready'],
                  ['approved', 'Approved'],
                  ['flagged', 'Reported'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={filter === value ? 'on' : undefined}
                  onClick={() => setFilter(value)}
                >
                  {label} <span className="bk-count">{counts[value]}</span>
                </button>
              ))}
            </div>
            {questions.length === 0 ? (
              <div className="bk-empty small">
                <p>{data.questions.length === 0 ? 'No questions in this paper yet.' : 'None here.'}</p>
                {data.questions.length === 0 ? (
                  <button type="button" className="sj-btn" onClick={() => setEditing('new')}>
                    Add the first question
                  </button>
                ) : null}
              </div>
            ) : (
              <ol className="bk-questions">
                {questions.map((q) => {
                  const [word, tone] = STATE_WORD[q.state];
                  return (
                    <li key={q.question_id}>
                      <button
                        type="button"
                        className={`bk-q ${q.question_id === open ? 'on' : ''}`}
                        onClick={() => select(q.question_id)}
                      >
                        <span className="bk-q-n">{q.question_number ?? '·'}</span>
                        <span className="bk-q-text">
                          <span className="bk-q-stem">
                            <Maths text={q.stem.length > 140 ? `${q.stem.slice(0, 140)}…` : q.stem} />
                          </span>
                          <span className="bk-q-meta">
                            <span className={`st-pill ${tone}`}>{word}</span>
                            {q.open_reports ? (
                              <span className="bk-flag">
                                <IconFlag size={12} /> {q.open_reports}
                              </span>
                            ) : null}
                            {q.state === 'needs_review' ? (
                              <span className="bk-todo">
                                {[!q.answer_checked && 'answer', !q.level_checked && 'level', !q.skill_checked && 'topic', !q.has_working && 'working']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <div className="bk-read">
            {actionProblem && <p className="st-error">{actionProblem}</p>}
            {detail ? (
              <>
                <div className="bk-actions">
                  <button type="button" className="sj-btn ghost sm" onClick={() => setEditing(detail)}>
                    Edit
                  </button>
                  <button type="button" className="sj-btn ghost sm bk-danger" onClick={() => void remove()}>
                    Remove
                  </button>
                  <span className="st-muted">J / K: next and previous</span>
                </div>
                <QuestionPanel
                  detail={detail}
                  subjectName={data.subject.name}
                  skills={skills}
                  busy={busy}
                  onAct={act}
                  onReportClosed={async () => {
                    setDetail(await api.question(detail.question_id));
                    reload();
                  }}
                  onBack={() => select(null)}
                />
              </>
            ) : (
              <div className="st-panel bk-none">
                <IconArrowLeft size={22} />
                <p>Choose a question to check it, edit it or remove it.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {importing && data ? (
        <ImportJson
          paperId={paperId}
          subjectId={data.subject.subject_id}
          onClose={() => setImporting(false)}
          onImported={reload}
        />
      ) : null}
      {editing && data ? (
        <QuestionEditor
          paper={data}
          skills={skills}
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            reload();
            if (id === open) void api.question(id).then(setDetail);
            else select(id);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ writing a question */

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function QuestionEditor({
  paper,
  skills,
  question,
  onClose,
  onSaved,
}: {
  paper: PaperPage;
  skills: Skill[];
  question: QuestionDetail | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [number, setNumber] = useState(question?.question_number ?? '');
  const [instructions, setInstructions] = useState(question?.instructions ?? '');
  const [stem, setStem] = useState(question?.stem ?? '');
  const [options, setOptions] = useState<string[]>(
    question ? question.options.map((o) => o.body) : ['', '', '', ''],
  );
  const [answer, setAnswer] = useState(question?.options.find((o) => o.is_correct)?.option_key ?? '');
  const [steps, setSteps] = useState(question?.solution_steps.join('\n') ?? '');
  const [hints, setHints] = useState(question?.hints.join('\n') ?? '');
  const [level, setLevel] = useState<number | null>(question?.mastery_level_number ?? null);
  const [skill, setSkill] = useState(question?.primary_skill_id ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const approved = question?.review_status === 'approved';

  const save = (event: FormEvent) => {
    event.preventDefault();
    const body: QuestionIn = {
      question_number: number.trim() || null,
      instructions: instructions.trim() || null,
      stem,
      options: options.map((text, index) => ({ key: KEYS[index]!, body: text })).filter((o) => o.body.trim()),
      answer,
      solution_steps: steps.split('\n').filter((line) => line.trim()),
      hints: hints.split('\n').filter((line) => line.trim()),
      level,
      skill_id: skill || null,
    };
    setBusy(true);
    setProblem(null);
    (question ? bank.editQuestion(question.question_id, body) : bank.addQuestion(paper.paper.paper_id, body))
      .then((saved) => onSaved(saved.question_id))
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };

  const filled = options.filter((o) => o.trim()).length;
  return (
    <Drawer title={question ? `Edit question ${question.question_number ?? ''}` : 'Add a question'} onClose={onClose}>
      <form className="st-form bk-editor" onSubmit={save}>
        {approved ? (
          <p className="bk-banner">
            This question is approved. Changing the working or hints keeps it live; changing the question, its options or its
            answer makes a new version that another reviewer approves before students see it.
          </p>
        ) : null}
        <div className="bk-two">
          <label className="st-field">
            <span>Number</span>
            <input value={number} maxLength={12} placeholder="Next" onChange={(e) => setNumber(e.target.value)} />
          </label>
          <div className="st-field">
            <span>Level</span>
            <div className="rv-levels" role="group" aria-label="Level">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={level === value ? 'on' : undefined} onClick={() => setLevel(value)}>
                  L{value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="st-field">
          <span>Instruction (optional)</span>
          <input value={instructions} maxLength={1000} placeholder="Choose the option nearest in meaning…" onChange={(e) => setInstructions(e.target.value)} />
        </label>
        <label className="st-field">
          <span>The question</span>
          <textarea rows={4} value={stem} onChange={(e) => setStem(e.target.value)} placeholder="Maths in $…$, like $x^2 + 3x$" />
        </label>
        {stem.trim() ? (
          <div className="bk-preview sp-textbook">
            <Maths text={stem} />
          </div>
        ) : null}
        <div className="st-field">
          <span>Options: tick the right one</span>
          <div className="bk-options">
            {options.map((text, index) => {
              const key = KEYS[index]!;
              return (
                <div key={key} className={`bk-option ${answer === key ? 'on' : ''}`}>
                  <button type="button" className="bk-option-key" aria-pressed={answer === key} onClick={() => setAnswer(key)} title="The right answer">
                    {key}
                  </button>
                  <input
                    value={text}
                    aria-label={`Option ${key}`}
                    onChange={(e) => setOptions(options.map((o, i) => (i === index ? e.target.value : o)))}
                  />
                </div>
              );
            })}
            {options.length < 6 ? (
              <button type="button" className="st-linkbtn" onClick={() => setOptions([...options, ''])}>
                Add option {KEYS[options.length]}
              </button>
            ) : null}
          </div>
        </div>
        <label className="st-field">
          <span>Worked solution: one step a line</span>
          <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
        </label>
        <label className="st-field">
          <span>Hints: one a line</span>
          <textarea rows={2} value={hints} onChange={(e) => setHints(e.target.value)} />
        </label>
        <div className="st-field">
          <span>Topic</span>
          <Select
            aria-label="Topic"
            value={skill}
            onChange={setSkill}
            placeholder={skills.length ? 'Choose the skill it tests' : 'This subject has no topics yet'}
            disabled={!skills.length}
            options={skills.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}`, hint: s.topic ?? undefined }))}
          />
        </div>
        {problem && <p className="st-error">{problem}</p>}
        <div className="bk-editor-foot">
          <span className="st-muted">
            {!answer
              ? 'Tick the right option.'
              : filled < 4
                ? 'A question needs four options to be approved.'
                : approved
                  ? 'Only the working or hints changed? It stays live.'
                  : 'Saved as a draft for checking.'}
          </span>
          <button type="submit" className="sj-btn" disabled={busy || !stem.trim() || !answer || filled < 2}>
            {busy ? 'Saving…' : question ? 'Save changes' : 'Add the question'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ reported questions, everywhere */

export function FlaggedQuestions() {
  const { data, problem } = useLoad(() => api.queue('flagged', null, null), []);
  return (
    <>
      <StaffPageHead title="Reported questions" sub="Questions a student or a check has flagged. Fix the question or close the report." />
      {problem && <p className="st-error">{problem}</p>}
      {data && data.length === 0 ? (
        <div className="bk-empty">
          <span className="bk-empty-icon" aria-hidden="true">
            <IconFlag size={26} />
          </span>
          <h2>Nothing reported</h2>
          <p>Every report has been dealt with.</p>
        </div>
      ) : null}
      {data && data.length > 0 ? (
        <ol className="st-panel bk-questions flat">
          {data.map((q) => (
            <li key={q.question_id}>
              <Link to={`/question/${q.question_id}`} className="bk-q">
                <span className="bk-q-n">{q.question_number ?? '·'}</span>
                <span className="bk-q-text">
                  <span className="bk-q-stem">
                    <Maths text={q.stem.length > 160 ? `${q.stem.slice(0, 160)}…` : q.stem} />
                  </span>
                  <span className="bk-q-meta">
                    <span className="bk-flag">
                      <IconFlag size={12} /> {plural(q.open_reports, 'report')}
                    </span>
                    <span className="st-muted">
                      {q.paper_code} {q.exam_year ? `· ${q.exam_year}` : ''}
                    </span>
                  </span>
                </span>
                <IconArrowRight size={16} />
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

/** A question opened from outside its paper (a report): sends you to it inside its paper. */
export function QuestionRedirect() {
  const { questionId = '' } = useParams();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    bank
      .paperOf(questionId)
      .then((paperId) => navigate(`/papers/${paperId}?q=${questionId}`, { replace: true }))
      .catch((error) => setProblem(friendly(error)));
  }, [questionId, navigate]);
  return problem ? <p className="st-error">{problem}</p> : <p className="st-muted">Opening the question…</p>;
}
