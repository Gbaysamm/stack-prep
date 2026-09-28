/**
 * Cross-subject pieces every page that lists subjects is built from, so a student sitting one
 * subject, four (UTME) or nine and more (WAEC) meets the same pattern everywhere:
 *
 * - `SubjectSwitcher`: a compact row of subject pills, each with a tiny status (a dot for the
 *   check-up, the predicted score when there is one). It scrolls sideways on a phone and, past
 *   six subjects, collapses to one button that opens a searchable list.
 * - `useSubjectChoice`: which subject a page is focused on. It lives in the URL (`?subject=`), so
 *   back, refresh and a shared link keep it; with none there, the last subject the student chose
 *   anywhere, else the one that most needs doing.
 * - `subjectStatus` / `subjectUrgency`: one reading of where a subject stands, so a pill, a row
 *   and a hero all say the same thing.
 * - `SubjectRows`: a compact table of subjects that scales to twenty rows, and a phone layout.
 * - `useOverview`: the overview, plus a development-only `?demo=many` that adds made-up subjects
 *   so the many-subject layouts can be seen without touching the database.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { IconCheck, IconChevronDown, IconPlay } from './icons.js';
import { progressApi, type Overview, type SubjectOverview } from './progressApi.js';
import { useLoad } from './store.js';
import { cx } from './ui.js';
import './SubjectSwitcher.css';

/* ================================================================== status */

export type StatusKind = 'run-open' | 'checkup-open' | 'no-goal' | 'no-checkup' | 'no-score' | 'scored';

export interface SubjectStatus {
  kind: StatusKind;
  /** A few words: "No check-up yet", "Predicted 46". */
  label: string;
  /** The dot's colour: lime once checked, yellow while a check-up is still to take. */
  tone: 'lime' | 'yellow' | 'pink' | 'purple';
  checked: boolean;
  score: number | null;
  target: number | null;
}

/** Where a subject stands, read the same way on every page. */
export function subjectStatus(s: SubjectOverview): SubjectStatus {
  const latest = s.latest_checkup;
  const score = latest?.score_now ?? null;
  const target = s.goal?.target_score ?? latest?.target_score ?? null;
  const base = { checked: !!latest, score: score === null ? null : Math.round(score), target: target === null ? null : Math.round(target) };
  if (s.open_checkup_session_id) return { ...base, kind: 'checkup-open', label: 'Check-up half done', tone: 'yellow' };
  if (!latest && !s.goal) return { ...base, kind: 'no-goal', label: 'No goal yet', tone: 'pink' };
  if (!latest) return { ...base, kind: 'no-checkup', label: 'No check-up yet', tone: 'yellow' };
  if (score === null) return { ...base, kind: 'no-score', label: 'Checked · add a goal', tone: 'lime' };
  return { ...base, kind: 'scored', label: `Predicted ${Math.round(score)}`, tone: 'lime' };
}

/**
 * How much a subject needs doing now; lower comes first. A half-done check-up, then a subject
 * with no check-up (its whole plan is waiting on one), then an open run, then the widest gap
 * to the target, and the nearest exam breaks ties.
 */
export function subjectUrgency(s: SubjectOverview): number {
  const days = s.goal?.days_to_exam;
  const soon = days !== null && days !== undefined && days >= 0 ? Math.min(days, 999) / 1000 : 0.999;
  if (s.open_checkup_session_id) return 0 + soon;
  if (!s.latest_checkup && s.goal) return 1 + soon;
  if (s.open_practice_session_id) return 2 + soon;
  if (!s.latest_checkup) return 3 + soon;
  const st = subjectStatus(s);
  if (st.score !== null && st.target !== null) return 4 + (1 - Math.max(0, Math.min(100, st.target - st.score)) / 100) + soon / 1000;
  return 5 + soon;
}

export const byUrgency = (subjects: SubjectOverview[]) => [...subjects].sort((a, b) => subjectUrgency(a) - subjectUrgency(b));

/* ================================================================== the chosen subject */

const STORE_KEY = 'sp.subject';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function rememberSubject(id: string) {
  try {
    window.localStorage.setItem(STORE_KEY, id);
  } catch {
    /* private mode: the URL still carries it */
  }
}

export const ALL = 'all';

/**
 * The subject a page is focused on: `?subject=<id>` (or `all` when the page allows it); else,
 * when `defaultAll`, every subject; else the last one chosen anywhere; else the most urgent.
 * Changing it rewrites the URL in place and remembers the choice for the next page.
 */
export function useSubjectChoice(
  subjects: SubjectOverview[],
  {
    allowAll = false,
    defaultAll = false,
    param = 'subject',
    prefer,
  }: {
    allowAll?: boolean;
    defaultAll?: boolean;
    param?: string;
    /** With nothing asked for, fall back only among these when any match (e.g. checked ones). */
    prefer?: (subject: SubjectOverview) => boolean;
  } = {},
): [string | null, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get(param);
  const ids = subjects.map((s) => s.subject_id);
  let value: string | null;
  if (asked === ALL && allowAll) value = ALL;
  else if (asked && ids.includes(asked)) value = asked;
  else if (allowAll && defaultAll) value = ALL;
  else {
    const preferred = prefer ? subjects.filter(prefer) : [];
    const pool = preferred.length > 0 ? preferred : subjects;
    const stored = readStored();
    value = stored && pool.some((s) => s.subject_id === stored) ? stored : (byUrgency(pool)[0]?.subject_id ?? null);
  }
  const set = (id: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(param, id);
        return next;
      },
      { replace: true },
    );
    if (id !== ALL) rememberSubject(id);
  };
  return [value, set];
}

/* ================================================================== overview (+ dev demo) */

const DEMO_NAMES = [
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Government',
  'Literature in English',
  'Christian Religious Studies',
  'Geography',
  'Further Mathematics',
  'Agricultural Science',
  'Commerce',
  'Financial Accounting',
  'Civic Education',
  'Yoruba',
  'Computer Studies',
  'French',
  'Technical Drawing',
  'Data Processing',
];

/** Development only: `?demo=many` (optionally `&n=5`) adds made-up subjects to the overview. */
export function withDemoSubjects(overview: Overview): Overview {
  if (!import.meta.env.DEV) return overview;
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== 'many') return overview;
  const total = Math.max(overview.subjects.length, Math.min(40, Number(params.get('n')) || 20));
  const base = overview.subjects.find((s) => s.latest_checkup) ?? overview.subjects[0];
  if (!base) return overview;
  const fakes: SubjectOverview[] = [];
  for (let i = 0; overview.subjects.length + fakes.length < total; i++) {
    const name = DEMO_NAMES[i % DEMO_NAMES.length]! + (i >= DEMO_NAMES.length ? ` ${Math.floor(i / DEMO_NAMES.length) + 1}` : '');
    const checked = i % 3 !== 1;
    const score = 28 + ((i * 17) % 52);
    const target = 60 + ((i * 7) % 25);
    const days = 20 + ((i * 11) % 120);
    fakes.push({
      subject_id: `demo-${i}`,
      subject_name: name,
      examination_short_name: 'WAEC',
      goal:
        i % 7 === 5
          ? null
          : { ...(base.goal ?? { exam_date: null, minutes_per_day: 30, study_days: null, sessions_before_exam: null }), target_score: target, days_to_exam: days } as SubjectOverview['goal'],
      latest_checkup:
        checked && base.latest_checkup
          ? {
              ...base.latest_checkup,
              session_id: base.latest_checkup.session_id,
              score_now: score,
              score_low: score - 9,
              score_high: score + 9,
              score_projected: Math.min(100, score + 12),
              target_score: target,
            }
          : null,
      // Every seventh one has a check-up left half done, so that state can be seen too.
      open_checkup_session_id: i % 7 === 3 ? `demo-checkup-${i}` : null,
      open_practice_session_id: i % 5 === 2 ? `demo-run-${i}` : null,
      practice: {
        runs_finished: checked ? (i * 3) % 9 : 0,
        questions_answered: checked ? ((i * 23) % 90) + 10 : 0,
        correct_unaided: checked ? ((i * 13) % 40) + 4 : 0,
        taught: checked ? (i * 5) % 11 : 0,
      },
    });
  }
  return { ...overview, subjects: [...overview.subjects, ...fakes] };
}

/** True for the made-up subjects of `?demo=many`: the API knows nothing about them. */
export const isDemoSubject = (id: string | null | undefined) => !!id && id.startsWith('demo-');

/** The overview, as every page loads it. */
export function useOverview(studentId: string) {
  return useLoad(() => progressApi.overview(studentId).then(withDemoSubjects), [studentId]);
}

/* ================================================================== the switcher */

/** Past this many subjects the pills give way to one searchable list. */
const PILLS_MAX = 6;

function SearchGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

/** A subject's tiny status inside a pill: the check-up dot, then the predicted score. */
function PillMeta({ status, runOpen }: { status: SubjectStatus; runOpen: boolean }) {
  return (
    <>
      {runOpen ? (
        <span className="ss-run" title="A run is in progress" aria-hidden="true">
          <IconPlay size={10} />
        </span>
      ) : null}
      {status.score !== null ? <span className="ss-score sj-mono">{status.score}</span> : null}
    </>
  );
}

function statusWords(s: SubjectOverview, status: SubjectStatus): string {
  const parts = [status.label];
  if (status.score !== null && status.target !== null) parts[0] = `Predicted ${status.score} of a target ${status.target}`;
  if (s.open_practice_session_id) parts.push('run in progress');
  return parts.join(', ');
}

export function SubjectSwitcher({
  subjects,
  value,
  onChange,
  allowAll = false,
  allLabel = 'All subjects',
  label = 'Subject',
  className,
  onDark,
}: {
  subjects: SubjectOverview[];
  value: string | null;
  onChange: (id: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  /** What is being chosen, for screen readers and the list's heading. */
  label?: string;
  className?: string;
  onDark?: boolean;
}) {
  const exams = new Set(subjects.map((s) => s.examination_short_name));
  const showExam = exams.size > 1;
  if (subjects.length === 0) return null;
  if (subjects.length > PILLS_MAX) {
    return (
      <SwitcherMenu
        subjects={subjects}
        value={value}
        onChange={onChange}
        allowAll={allowAll}
        allLabel={allLabel}
        label={label}
        showExam={showExam}
        className={className}
      />
    );
  }
  return (
    <SwitcherPills
      subjects={subjects}
      value={value}
      onChange={onChange}
      allowAll={allowAll}
      allLabel={allLabel}
      label={label}
      showExam={showExam}
      className={cx(className, onDark && 'on-dark')}
    />
  );
}

function SwitcherPills({
  subjects,
  value,
  onChange,
  allowAll,
  allLabel,
  label,
  showExam,
  className,
}: {
  subjects: SubjectOverview[];
  value: string | null;
  onChange: (id: string) => void;
  allowAll: boolean;
  allLabel: string;
  label: string;
  showExam: boolean;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const options = [...(allowAll ? [ALL] : []), ...subjects.map((s) => s.subject_id)];
  const current = value && options.includes(value) ? value : options[0];

  // Keep the chosen pill in view when the row scrolls sideways on a phone.
  useEffect(() => {
    const row = scroller.current;
    const on = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !on) return;
    const left = on.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: 'smooth' });
    }
  }, [current]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = options.indexOf(current ?? '');
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const id = options[next]!;
    onChange(id);
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus());
  };

  return (
    <div className={cx('ss', className)}>
      <div ref={scroller} className="ss-pills" role="radiogroup" aria-label={label} onKeyDown={onKey}>
        {allowAll ? (
          <button
            type="button"
            role="radio"
            data-id={ALL}
            aria-checked={current === ALL}
            tabIndex={current === ALL ? 0 : -1}
            className="ss-pill all"
            onClick={() => onChange(ALL)}
          >
            <span className="ss-name">{allLabel}</span>
            <span className="ss-count sj-mono">{subjects.length}</span>
          </button>
        ) : null}
        {subjects.map((s) => {
          const status = subjectStatus(s);
          const on = current === s.subject_id;
          return (
            <button
              key={s.subject_id}
              type="button"
              role="radio"
              data-id={s.subject_id}
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="ss-pill"
              onClick={() => onChange(s.subject_id)}
              title={`${s.subject_name}: ${statusWords(s, status)}`}
            >
              <span className={cx('ss-dot', status.tone)} aria-hidden="true" />
              <span className="ss-name">
                {showExam ? <span className="ss-exam sj-mono">{s.examination_short_name}</span> : null}
                {s.subject_name}
              </span>
              <PillMeta status={status} runOpen={!!s.open_practice_session_id} />
              <span className="ss-sr">, {statusWords(s, status)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwitcherMenu({
  subjects,
  value,
  onChange,
  allowAll,
  allLabel,
  label,
  showExam,
  className,
}: {
  subjects: SubjectOverview[];
  value: string | null;
  onChange: (id: string) => void;
  allowAll: boolean;
  allLabel: string;
  label: string;
  showExam: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const chosen = subjects.find((s) => s.subject_id === value);
  const isAll = value === ALL;
  const unchecked = subjects.filter((s) => !s.latest_checkup).length;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = subjects.filter(
      (s) => !q || s.subject_name.toLowerCase().includes(q) || s.examination_short_name.toLowerCase().includes(q),
    );
    const rows: { id: string; subject?: SubjectOverview }[] = matches.map((s) => ({ id: s.subject_id, subject: s }));
    if (allowAll && (!q || allLabel.toLowerCase().includes(q))) rows.unshift({ id: ALL });
    return rows;
  }, [subjects, query, allowAll, allLabel]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const start = items.findIndex((item) => item.id === value);
    setActive(Math.max(0, start));
    requestAnimationFrame(() => input.current?.focus());
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) close(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (pickId: string) => {
    onChange(pickId);
    close();
  };

  const onKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((n) => Math.min(items.length - 1, n + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((n) => Math.max(0, n - 1));
    } else if (event.key === 'Home' && !query) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && !query) {
      event.preventDefault();
      setActive(items.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[active];
      if (item) pick(item.id);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const status = chosen ? subjectStatus(chosen) : null;

  return (
    <div ref={wrap} className={cx('ss ss-menu', open && 'open', className)}>
      <button
        ref={trigger}
        type="button"
        className="ss-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="ss-trigger-label sj-mono">{label}</span>
        <span className="ss-trigger-value">
          {isAll || !chosen ? (
            <span className="ss-name">{allLabel}</span>
          ) : (
            <>
              <span className={cx('ss-dot', status!.tone)} aria-hidden="true" />
              <span className="ss-name">{chosen.subject_name}</span>
              {status!.score !== null ? <span className="ss-score sj-mono">{status!.score}</span> : null}
            </>
          )}
        </span>
        <span className="ss-trigger-count sj-mono">
          {subjects.length} subjects{unchecked > 0 ? ` · ${unchecked} to check` : ''}
        </span>
        <IconChevronDown size={18} className="ss-chev" />
      </button>

      {open ? (
        <div className="ss-pop" role="dialog" aria-label={`Choose a ${label.toLowerCase()}`} onKeyDown={onKey}>
          <label className="ss-search">
            <SearchGlyph />
            <input
              ref={input}
              type="text"
              value={query}
              placeholder={`Search ${subjects.length} subjects`}
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={items[active] ? `${id}-o-${active}` : undefined}
              aria-autocomplete="list"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          </label>
          <ul ref={list} id={`${id}-list`} className="ss-options" role="listbox" aria-label={label}>
            {items.length === 0 ? <li className="ss-none">No subject matches “{query}”.</li> : null}
            {items.map((item, index) => {
              const s = item.subject;
              const st = s ? subjectStatus(s) : null;
              const selected = item.id === value;
              return (
                <li
                  key={item.id}
                  id={`${id}-o-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  className={cx('ss-option', index === active && 'active', selected && 'on')}
                  onMouseMove={() => setActive(index)}
                  onClick={() => pick(item.id)}
                >
                  {s && st ? (
                    <>
                      <span className={cx('ss-dot', st.tone)} aria-hidden="true" />
                      <span className="ss-option-text">
                        <b>{s.subject_name}</b>
                        <small>
                          {showExam ? `${s.examination_short_name} · ` : ''}
                          {st.score !== null && st.target !== null ? `Predicted ${st.score} · target ${st.target}` : st.label}
                          {s.open_practice_session_id ? ' · run in progress' : ''}
                        </small>
                      </span>
                      {st.score !== null ? <span className="ss-score sj-mono">{st.score}</span> : null}
                    </>
                  ) : (
                    <span className="ss-option-text">
                      <b>{allLabel}</b>
                      <small>Every subject together</small>
                    </span>
                  )}
                  {selected ? <IconCheck size={16} className="ss-tick" /> : null}
                </li>
              );
            })}
          </ul>
          <p className="ss-legend sj-mono" aria-hidden="true">
            <span>
              <i className="ss-dot lime" /> Checked
            </span>
            <span>
              <i className="ss-dot yellow" /> Check-up to take
            </span>
            <span>
              <i className="ss-dot pink" /> No goal
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================== subject rows */

export interface SubjectColumn {
  key: string;
  /** Header text; the header row shows on a laptop only. */
  head: ReactNode;
  /** Track size in the row grid, e.g. "minmax(0, 1.4fr)" or "140px". */
  width: string;
  cell: (subject: SubjectOverview) => ReactNode;
  /**
   * On a phone: "lead" opens the first line and shares it with the "end" cells (the action);
   * "full" takes a line of its own; "inline" shares the next line (the default); "hide" drops it.
   */
  phone?: 'lead' | 'full' | 'inline' | 'hide' | 'end';
  align?: 'end';
}

/**
 * Subjects as a compact table: one 56px-ish row each, a header on a laptop, and on a phone each
 * row folds into two lines. Twenty rows stay readable; past `pageSize` a pager takes over.
 */
export function SubjectRows({
  subjects,
  columns,
  label,
  selected,
  className,
  id,
}: {
  subjects: SubjectOverview[];
  columns: SubjectColumn[];
  label: string;
  selected?: string | null;
  className?: string;
  id?: string;
}) {
  const template = columns.map((c) => c.width).join(' ');
  return (
    <div className={cx('ss-table', className)} role="table" aria-label={label} id={id} style={{ '--cols': template } as CSSProperties}>
      <div className="ss-thead" role="rowgroup">
        <div className="ss-tr ss-headrow" role="row">
          {columns.map((c) => (
            <span key={c.key} role="columnheader" className={cx('ss-th', c.align === 'end' && 'end')}>
              {c.head}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup" className="ss-tbody">
        {subjects.map((s) => (
          <div key={s.subject_id} role="row" className={cx('ss-tr', selected === s.subject_id && 'on')}>
            {columns.map((c) => (
              <span
                key={c.key}
                role="cell"
                className={cx('ss-td', `ph-${c.phone ?? 'inline'}`, c.align === 'end' && 'end', `c-${c.key}`)}
              >
                {c.cell(s)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A subject's name cell: the name, and the exam in small mono beneath. */
export function SubjectName({ subject, to, sub }: { subject: SubjectOverview; to?: ReactNode; sub?: ReactNode }) {
  return (
    <span className="ss-cellname">
      <b>{to ?? subject.subject_name}</b>
      <small className="sj-mono">{sub ?? subject.examination_short_name}</small>
    </span>
  );
}

/**
 * Predicted score against the target on one short 0–100 line: a filled bar to the score and a
 * tick at the target. "—" and the reason when there is no score yet.
 */
export function ScoreCell({ subject }: { subject: SubjectOverview }) {
  const st = subjectStatus(subject);
  if (st.score === null) {
    return (
      <span className="ss-scorecell empty">
        <span className="ss-scorecell-num sj-num">—</span>
        <small>{st.checked ? 'Add a goal to see it' : 'After a check-up'}</small>
      </span>
    );
  }
  // The gap the rest of the app quotes: where the plan gets to by exam day against the target.
  const projected = subject.latest_checkup?.score_projected ?? null;
  const gap = st.target !== null ? Math.round(st.target - (projected ?? st.score)) : null;
  return (
    <span className="ss-scorecell" aria-label={`Predicted ${st.score} out of 100${st.target !== null ? `, target ${st.target}` : ''}`}>
      <span className="ss-scorecell-top">
        <span className="ss-scorecell-num sj-num">{st.score}</span>
        {st.target !== null ? (
          <small className={cx('ss-gap', gap !== null && gap <= 0 && 'ok')}>{gap !== null && gap <= 0 ? `on track for ${st.target}` : `${gap} short of ${st.target}`}</small>
        ) : null}
      </span>
      <span className="ss-mini" aria-hidden="true">
        <span className="fill" style={{ width: `${Math.max(0, Math.min(100, st.score))}%` }} />
        {st.target !== null ? <span className="target" style={{ left: `${Math.max(0, Math.min(100, st.target))}%` }} /> : null}
      </span>
    </span>
  );
}

/** The check-up status as a dot and words. */
export function StatusCell({ subject, detail }: { subject: SubjectOverview; detail?: ReactNode }) {
  const st = subjectStatus(subject);
  return (
    <span className="ss-statuscell">
      <span className="ss-statusline">
        <span className={cx('ss-dot', st.tone)} aria-hidden="true" />
        {st.kind === 'scored' ? 'Checked' : st.label}
      </span>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}
