/**
 * Question review: turn proposed answers, levels and skills into decisions, and deal with the
 * problems students and checks have flagged.
 *
 * Built for speed: 200 questions is an afternoon only if the keyboard does the work.
 * A–F sets the answer, 1–5 the level, S approves the skill, Enter approves the question,
 * J/K move through the queue. Keys are ignored while typing in a box.
 *
 * On a wide screen the queue sits beside the question; on a phone the queue comes first and a
 * question opens over it, with a way back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Maths } from '../Maths.js';
import { OptionBody, hasOptionPictures } from '../OptionBody.js';
import { friendly } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import {
  REVIEW_CHANGED,
  api,
  type PaperYear,
  type Progress,
  type QueueItem,
  type QueueState,
  type QuestionDetail,
  type Report,
  type ReviewSubject,
  type Skill,
} from './api.js';
import './review.css';

const QUEUES: { value: QueueState; label: string }[] = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'flagged', label: 'Flagged by students or checks' },
  { value: 'needs_answer', label: 'Answer unchecked' },
  { value: 'needs_level', label: 'Level unchecked' },
  { value: 'ready', label: 'Ready to approve' },
  { value: 'approved', label: 'Approved' },
];

const REASON: Record<string, string> = {
  wrong_answer: 'Answer looks wrong',
  ambiguous: 'Unclear',
  typo: 'Typing mistake',
  image_missing: 'Picture missing',
  off_syllabus: 'Not on the syllabus',
  other: 'Something else',
};

const WHERE: Record<string, string> = {
  practice: 'in practice',
  checkup: 'in a check-up',
  mock: 'during a mock',
  review: 'looking back over an answer',
  lesson: 'in a lesson',
};

const isQueue = (value: string | null): value is QueueState => QUEUES.some((queue) => queue.value === value);

/** Keys typed into a box, a list or a button's own Enter are not shortcuts. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

export function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const queueState: QueueState = isQueue(params.get('queue')) ? (params.get('queue') as QueueState) : 'needs_review';
  const subjectId = params.get('subject');
  const examYear = params.get('year') ? Number(params.get('year')) : null;

  const [subjects, setSubjects] = useState<ReviewSubject[]>([]);
  const [years, setYears] = useState<PaperYear[]>([]);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false); // a phone shows the question over the queue
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'subject') next.delete('year');
    setParams(next, { replace: true });
    setSelected(null);
    setOpen(false);
  };

  const reportError = (cause: unknown) => setError(friendly(cause));

  useEffect(() => {
    api.subjects().then(setSubjects, reportError);
  }, []);
  useEffect(() => {
    // Read from the bank rather than listed here, so a newly loaded paper shows up.
    api.years(subjectId).then(setYears, reportError);
  }, [subjectId]);

  const loadQueue = useCallback(async () => {
    try {
      const [list, counts] = await Promise.all([
        api.queue(queueState, examYear, subjectId),
        api.progress(examYear, subjectId),
      ]);
      setItems(list);
      setProgress(counts);
      // Deliberately keep the current question selected even once it leaves the queue:
      // a decision must never move the page under the reviewer's next keystroke.
      setSelected((current) => current ?? list[0]?.question_id ?? null);
    } catch (cause) {
      reportError(cause);
    }
  }, [queueState, examYear, subjectId]);

  useEffect(() => {
    setItems(null);
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    api.question(selected).then(setDetail, reportError);
  }, [selected]);

  useEffect(() => {
    if (!detail?.syllabus_version_id) return;
    api.skills(detail.syllabus_version_id).then(setSkills, reportError);
  }, [detail?.syllabus_version_id]);

  const changed = useCallback(async () => {
    await loadQueue();
    window.dispatchEvent(new Event(REVIEW_CHANGED));
  }, [loadQueue]);

  const act = useCallback(
    async (action: () => Promise<QuestionDetail>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        setDetail(await action());
        await changed();
      } catch (cause) {
        reportError(cause);
      } finally {
        setBusy(false);
      }
    },
    [busy, changed],
  );

  const move = useCallback(
    (delta: number) => {
      if (!items || items.length === 0) return;
      const index = items.findIndex((item) => item.question_id === selected);
      if (index === -1) {
        // The current question has left the queue; step into the list from the end nearest
        // the direction of travel.
        setSelected(items[delta > 0 ? 0 : items.length - 1]?.question_id ?? null);
        return;
      }
      const next = Math.min(items.length - 1, Math.max(0, index + delta));
      setSelected(items[next]?.question_id ?? null);
    },
    [items, selected],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (key === 'J') return move(1);
      if (key === 'K') return move(-1);
      if (!detail || detail.review_status === 'approved') return;
      if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key) && detail.options.some((o) => o.option_key === key)) {
        event.preventDefault();
        void act(() => api.setAnswer(detail.question_id, key));
      } else if (['1', '2', '3', '4', '5'].includes(key)) {
        event.preventDefault();
        void act(() => api.setLevel(detail.question_id, Number(key)));
      } else if (key === 'S') {
        event.preventDefault();
        void act(() => api.decideSkill(detail.question_id));
      } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        void act(() => api.approve(detail.question_id));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, act, move]);

  const subjectName = useMemo(
    () => (id: string | null | undefined) => subjects.find((s) => s.subject_id === id)?.name ?? null,
    [subjects],
  );
  const total = progress?.total ?? 0;
  const meter = (label: string, done: number) => (
    <div className="rv-meter" key={label}>
      <span>{label}</span>
      <strong>
        {done.toLocaleString('en-NG')}
        <small> / {total.toLocaleString('en-NG')}</small>
      </strong>
      <span className="rv-meter-track" aria-hidden="true">
        <span style={{ width: `${total ? (100 * done) / total : 0}%` }} />
      </span>
    </div>
  );

  return (
    <div className={`rv ${open ? 'rv-open' : ''}`}>
      <StaffPageHead
        title="Question review"
        sub="Check each question's answer, level and skill, then approve it. Deal with flagged questions first."
      />

      {progress && (
        <div className="rv-progress">
          {meter('Answers checked', progress.answer_checked)}
          {meter('Levels checked', progress.level_checked)}
          {meter('Skills approved', progress.skill_approved)}
          {meter('Approved', progress.approved)}
          <button
            type="button"
            className={`rv-meter rv-flag ${progress.flagged ? 'on' : ''}`}
            onClick={() => set('queue', 'flagged')}
          >
            <span>Flagged</span>
            <strong>{progress.flagged}</strong>
            <span className="rv-flag-note">{progress.flagged ? 'Open the flagged queue' : 'Nothing flagged'}</span>
          </button>
        </div>
      )}

      <section className="st-panel rv-filters">
        <div className="st-field">
          <span>Queue</span>
          <Select
            aria-label="Queue"
            value={queueState}
            onChange={(value) => set('queue', value)}
            options={QUEUES.map((queue) => ({ value: queue.value, label: queue.label }))}
          />
        </div>
        <div className="st-field">
          <span>Subject</span>
          <Select
            aria-label="Subject"
            value={subjectId ?? ''}
            onChange={(value) => set('subject', value || null)}
            options={[
              { value: '', label: 'All subjects' },
              ...subjects.map((subject) => ({
                value: subject.subject_id,
                label: subject.name,
                hint: `${subject.questions} questions${subject.flagged ? ` · ${subject.flagged} flagged` : ''}`,
              })),
            ]}
          />
        </div>
        <div className="st-field">
          <span>Paper</span>
          <Select
            aria-label="Paper"
            value={examYear === null ? '' : String(examYear)}
            onChange={(value) => set('year', value || null)}
            options={[
              { value: '', label: 'All years' },
              ...years.map((year) => ({ value: String(year.exam_year), label: String(year.exam_year), hint: `${year.questions} questions` })),
            ]}
          />
        </div>
      </section>

      {error && (
        <p className="st-error rv-error" role="alert">
          {error}
        </p>
      )}

      <div className="rv-body">
        <section className="st-panel rv-queue" aria-label="Queue">
          <p className="rv-queue-count">
            {items === null ? 'Loading…' : `${items.length}${items.length === 200 ? '+' : ''} in this queue`}
          </p>
          {items && items.length === 0 && (
            <div className="rv-empty">
              <p>Nothing in this queue.</p>
              {queueState !== 'flagged' && progress && progress.flagged > 0 && (
                <button type="button" className="sj-btn sm" onClick={() => set('queue', 'flagged')}>
                  Open the {progress.flagged} flagged
                </button>
              )}
            </div>
          )}
          <ol>
            {items?.map((item) => (
              <li key={item.question_id}>
                <button
                  type="button"
                  className={item.question_id === selected ? 'on' : undefined}
                  onClick={() => {
                    setSelected(item.question_id);
                    setOpen(true);
                    // On a phone the question replaces the queue: start it at the top.
                    if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo(0, 0);
                  }}
                >
                  <span className="rv-q-id">
                    {item.exam_year ?? '—'} · Q{item.question_number ?? '?'}
                    {item.open_reports > 0 && <em className="rv-chip bad">{item.open_reports} flagged</em>}
                  </span>
                  <span className="rv-q-stem sp-textbook">
                    <Maths text={item.stem} />
                  </span>
                  <span className="rv-q-flags">
                    <Check on={item.answer_checked} label="Answer" />
                    <Check on={item.level_checked} label="Level" />
                    <Check on={item.has_approved_skill} label="Skill" />
                    {item.review_status === 'approved' && <em className="rv-chip good">Approved</em>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {detail ? (
          <QuestionPanel
            key={detail.question_version_id}
            detail={detail}
            subjectName={subjectName(detail.subject_id)}
            skills={skills}
            busy={busy}
            onAct={act}
            onReportClosed={async () => {
              setDetail(await api.question(detail.question_id));
              await changed();
            }}
            onBack={() => setOpen(false)}
          />
        ) : (
          <section className="st-panel rv-detail rv-none">
            <p className="st-muted">{items && items.length ? 'Choose a question from the queue.' : 'No question to show.'}</p>
          </section>
        )}
      </div>

      <p className="rv-keys" aria-label="Keyboard shortcuts">
        <kbd>A</kbd>–<kbd>F</kbd> answer · <kbd>1</kbd>–<kbd>5</kbd> level · <kbd>S</kbd> approve skill ·{' '}
        <kbd>Enter</kbd> approve question · <kbd>J</kbd>/<kbd>K</kbd> next and previous
      </p>
    </div>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return <em className={`rv-chip ${on ? 'good' : 'todo'}`}>{on ? `${label} ✓` : label}</em>;
}

interface PanelProps {
  detail: QuestionDetail;
  subjectName: string | null;
  skills: Skill[];
  busy: boolean;
  onAct: (action: () => Promise<QuestionDetail>) => Promise<void>;
  onReportClosed: () => Promise<void>;
  onBack: () => void;
}

function QuestionPanel({ detail, subjectName, skills, busy, onAct, onReportClosed, onBack }: PanelProps) {
  const [solution, setSolution] = useState(detail.solution_steps.join('\n'));
  const [hint, setHint] = useState(detail.hints.join('\n'));

  useEffect(() => {
    setSolution(detail.solution_steps.join('\n'));
    setHint(detail.hints.join('\n'));
  }, [detail.solution_steps, detail.hints]);

  const approved = detail.review_status === 'approved';
  const missing = [
    detail.answer_source === 'expert_verified' || detail.answer_source === 'official_key' ? null : 'the answer checked',
    detail.level_source === 'expert_verified' || detail.level_source === 'calibrated' ? null : 'the level checked',
    detail.classification_status === 'approved' ? null : 'the skill approved',
    detail.solution_steps.length > 0 ? null : 'a worked solution',
    detail.hints.length > 0 ? null : 'a hint',
  ].filter(Boolean) as string[];
  const contentChanged = solution !== detail.solution_steps.join('\n') || hint !== detail.hints.join('\n');

  return (
    <section className="st-panel rv-detail" aria-label="Question">
      <button type="button" className="rv-back" onClick={onBack}>
        ← Back to the queue
      </button>
      <header className="rv-detail-head">
        <div>
          <span className="rv-eyebrow">{[subjectName, detail.paper_code].filter(Boolean).join(' · ') || 'Question'}</span>
          <h2>
            {detail.exam_year ?? '—'} · Question {detail.question_number ?? '?'}
          </h2>
        </div>
        <span className={`st-pill ${approved ? 'good' : 'warn'}`}>{approved ? 'Approved' : 'Draft'}</span>
      </header>

      {detail.reports.length > 0 && (
        <div className="rv-reports">
          {detail.reports.map((report) => (
            <ReportCard key={report.id} report={report} onClosed={onReportClosed} />
          ))}
        </div>
      )}

      {detail.passage_body && (
        <details className="rv-passage">
          <summary>{detail.passage_title ?? 'The passage'}</summary>
          <div className="sp-textbook">
            <Maths text={detail.passage_body} />
          </div>
        </details>
      )}

      <div className="rv-question">
        {detail.instructions && (
          <p className="rv-instruction">
            <Maths text={detail.instructions} />
          </p>
        )}
        <p className="rv-stem sp-textbook">
          <Maths text={detail.stem} />
        </p>
      </div>

      <div className="rv-block">
        <h3>Answer</h3>
        <ol className={`rv-options ${hasOptionPictures(detail.options) ? 'sp-pic-options' : ''}`}>
          {detail.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={approved || busy}
                className={option.is_correct ? 'on' : undefined}
                aria-pressed={option.is_correct}
                onClick={() => void onAct(() => api.setAnswer(detail.question_id, option.option_key))}
              >
                <span className="rv-key">{option.option_key}</span>
                <span className="sp-textbook rv-option-body">
                  <OptionBody body={option.body} figure={option.figure} />
                </span>
                {option.is_correct && <span className="rv-chip good">Key</span>}
              </button>
            </li>
          ))}
        </ol>
        <p className="rv-source">
          {source(detail.answer_source)}
          {detail.answer_confidence ? `, proposed with ${detail.answer_confidence} confidence` : ''}
        </p>
      </div>

      <div className="rv-block">
        <h3>Level</h3>
        <div className="rv-levels" role="group" aria-label="Level">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              disabled={approved || busy}
              className={detail.mastery_level_number === level ? 'on' : undefined}
              aria-pressed={detail.mastery_level_number === level}
              onClick={() => void onAct(() => api.setLevel(detail.question_id, level))}
            >
              L{level}
            </button>
          ))}
        </div>
        <p className="rv-source">
          {source(detail.level_source)}
          {detail.level_confidence ? `, ${detail.level_confidence} confidence` : ''}
        </p>
      </div>

      <div className="rv-block">
        <h3>Skill</h3>
        <div className="rv-skill">
          <Select
            className="rv-skill-pick"
            aria-label="Skill"
            value={detail.primary_skill_id ?? ''}
            disabled={approved || busy}
            placeholder="Choose a skill"
            onChange={(value) => void onAct(() => api.decideSkill(detail.question_id, value))}
            options={skills.map((skill) => ({
              value: skill.id,
              label: `${skill.code} — ${skill.name}`,
              hint: skill.topic ?? undefined,
            }))}
          />
          <button
            type="button"
            className="sj-btn ghost sm"
            disabled={approved || busy || detail.classification_status === 'approved' || !detail.primary_skill_id}
            onClick={() => void onAct(() => api.decideSkill(detail.question_id))}
          >
            {detail.classification_status === 'approved' ? 'Skill approved ✓' : 'Approve skill'}
          </button>
        </div>
        {detail.classification_reason && <p className="rv-source">{detail.classification_reason}</p>}
      </div>

      <div className="rv-block rv-content">
        <label className="st-field">
          <span>Worked solution: one step a line</span>
          <textarea value={solution} disabled={approved || busy} rows={5} onChange={(event) => setSolution(event.target.value)} />
        </label>
        <label className="st-field">
          <span>Hints: one a line</span>
          <textarea value={hint} disabled={approved || busy} rows={2} onChange={(event) => setHint(event.target.value)} />
        </label>
        <div className="st-row">
          <button
            type="button"
            className="sj-btn ghost sm"
            disabled={approved || busy || !contentChanged}
            onClick={() =>
              void onAct(() =>
                api.setContent(
                  detail.question_id,
                  solution.split('\n').filter((line) => line.trim()),
                  hint.split('\n').filter((line) => line.trim()),
                ),
              )
            }
          >
            Save the solution and hints
          </button>
        </div>
      </div>

      <footer className="rv-approve">
        <button
          type="button"
          className="sj-btn"
          disabled={approved || busy || missing.length > 0}
          onClick={() => void onAct(() => api.approve(detail.question_id))}
        >
          {approved ? 'Approved' : 'Approve the question'}
        </button>
        <span className="st-muted">
          {approved
            ? 'Approved questions are frozen. A change needs a new version.'
            : missing.length > 0
              ? `Still needs ${missing.join(', ')}.`
              : 'Everything is checked.'}
        </span>
      </footer>
    </section>
  );
}

function ReportCard({ report, onClosed }: { report: Report; onClosed: () => Promise<void> }) {
  const [closing, setClosing] = useState<'fixed' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    if (!closing || busy) return;
    if (!note.trim()) {
      setError('Add a short note on what was done.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resolveReport(report.id, note.trim(), closing);
      await onClosed();
    } catch (failure) {
      setError(friendly(failure));
      setBusy(false);
    }
  };

  const who =
    report.reporter_kind === 'student' ? 'A student' : report.reporter_kind === 'reviewer' ? 'A reviewer' : 'An automatic check';
  return (
    <article className="rv-report">
      <header>
        <span className={`st-pill ${report.reason === 'wrong_answer' ? 'bad' : 'warn'}`}>{REASON[report.reason] ?? report.reason}</span>
        <span className="st-muted">
          {who}
          {report.where ? `, ${WHERE[report.where] ?? report.where}` : ''}
          {report.created_at
            ? `, ${new Date(report.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            : ''}
        </span>
      </header>
      {report.detail && <blockquote>“{report.detail}”</blockquote>}
      {closing ? (
        <div className="rv-report-close">
          <label className="st-field">
            <span>{closing === 'fixed' ? 'What did you fix?' : 'Why is it right as it stands?'}</span>
            <textarea
              rows={2}
              value={note}
              maxLength={1000}
              autoFocus
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="st-error">{error}</p>}
          <div className="st-row">
            <button type="button" className="sj-btn ghost sm" disabled={busy} onClick={() => setClosing(null)}>
              Cancel
            </button>
            <button type="button" className="sj-btn sm" disabled={busy} onClick={() => void close()}>
              {busy ? 'Closing…' : closing === 'fixed' ? 'Close as fixed' : 'Close as not a problem'}
            </button>
          </div>
        </div>
      ) : (
        <div className="st-row">
          <button type="button" className="sj-btn ghost sm" onClick={() => setClosing('rejected')}>
            Not a problem
          </button>
          <button type="button" className="sj-btn ghost sm" onClick={() => setClosing('fixed')}>
            Fixed
          </button>
        </div>
      )}
    </article>
  );
}

function source(value: string): string {
  const words: Record<string, string> = {
    expert_verified: 'Checked by a reviewer',
    official_key: 'From the official key',
    calibrated: 'Calibrated from answers',
    ai_proposed: 'Proposed, not yet checked',
    proposed: 'Proposed, not yet checked',
  };
  return words[value] ?? value.replace(/_/g, ' ');
}
