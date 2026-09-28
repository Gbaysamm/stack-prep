/**
 * A run, question by question.
 *
 * The grid at the side is the run at a glance: one cell per question in the order it came, in the
 * colour of how it went. Each question below opens onto what was asked, what the student chose
 * (first and second try), how sure they said they were, and how to get it — the reviewed working
 * and the hint. A run can be taken out of the history from here; its answers keep counting.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Figures } from '../../Figures.js';
import { Maths } from '../../Maths.js';
import { IconArrowRight, IconBulb, IconCheck, IconChevronDown, IconLayers, IconPlay, IconReplay, IconSpark } from '../icons.js';
import { orGone, runsApi, type Outcome, type ReviewItem, type RunReview } from '../runsApi.js';
import { useLoad, usePageTitle } from '../store.js';
import { Button, Dialog, PageHero, Ring, Skeleton, cx, useToast } from '../ui.js';
import './RunReport.css';

/* ------------------------------------------------------------------ icons only these pages use */

export function IconTrash({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
      <path d="M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ outcomes */

export const OUTCOME: Record<Outcome, { label: string; short: string; tone: string }> = {
  right_first_time: { label: 'Right first time', short: 'Right', tone: 'lime' },
  right_after_hint: { label: 'Right after a hint', short: 'After hint', tone: 'yellow' },
  guessed_right: { label: 'Guessed right', short: 'Guessed', tone: 'amber' },
  taught: { label: 'Taught on the board', short: 'Taught', tone: 'pink' },
  unanswered: { label: 'Missed, no second try', short: 'Left', tone: 'grey' },
};

const HERO_LABEL: Partial<Record<Outcome, string>> = {
  right_after_hint: 'Right after a hint',
  guessed_right: 'Guessed right',
  taught: 'Taught',
};

type Filter = 'all' | 'right' | 'missed' | 'guessed' | 'taught';
const FILTERS: { id: Filter; label: string; match: (o: Outcome) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'right', label: 'Right', match: (o) => o === 'right_first_time' },
  { id: 'missed', label: 'Missed', match: (o) => o === 'right_after_hint' || o === 'taught' || o === 'unanswered' },
  { id: 'guessed', label: 'Guessed', match: (o) => o === 'guessed_right' },
  { id: 'taught', label: 'Taught', match: (o) => o === 'taught' },
];

const CONFIDENCE = { sure: 'I was sure', unsure: 'I wasn’t sure', guessed: 'I guessed' } as const;
const UNDERSTOOD = { got_it: 'Got it', unsure: 'Not sure yet', too_hard: 'Still too hard' } as const;
const MATCHED = { yes: 'it matched my working', partly: 'it partly matched my working', no: 'I had worked it differently' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

function longDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** "2014–2018", "2012, 2015 and 2019", or null for every year. */
export function yearsLabel(years: number[]): string | null {
  if (years.length === 0) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (sorted.length > 2 && last - first === sorted.length - 1) return `${first}–${last}`;
  if (sorted.length === 1) return String(first);
  return `${sorted.slice(0, -1).join(', ')} and ${last}`;
}

/* ------------------------------------------------------------------ delete */

/**
 * The confirm-and-delete step, shared with the practice page's history. `onDelete` does the
 * work (so a list can take the row out first and put it back if the call fails).
 */
export function DeleteRunDialog({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete this run?"
      actions={
        <>
          <Button tone="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button tone="danger" busy={busy} icon={<IconTrash size={18} />} onClick={onConfirm}>
            Delete run
          </Button>
        </>
      }
    >
      <p className="rr-dialog-text">
        It disappears from your history. Your answers still count towards your predicted score.
      </p>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ the page */

export function RunReport() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const review = useLoad(() => orGone(runsApi.review(sessionId)), [sessionId]);
  const data = review.data;
  usePageTitle(data ? `${data.subject_name} run report` : 'Run report');

  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = () => {
    setDeleting(true);
    runsApi
      .remove(sessionId)
      .then(() => {
        toast('Run deleted');
        navigate('/practice', { replace: true });
      })
      .catch((error: Error) => {
        setDeleting(false);
        setAsking(false);
        toast(`Couldn’t delete the run: ${error.message || 'try again'}`);
      });
  };

  if (review.error && data === undefined) {
    return (
      <div className="sj-page rr">
        <PageHero back={{ to: '/practice', label: 'Practice' }} eyebrow="Run report" title="We couldn’t load this run" />
        <div className="sj-card rr-note pink">
          <div className="rr-row">
            <span className="rr-tile pink" aria-hidden="true">
              <IconReplay size={18} />
            </span>
            <h2 className="sj-display sj-h3">Something got in the way</h2>
          </div>
          <p className="sj-muted">{review.error}</p>
          <div className="rr-note-actions">
            <Button icon={<IconReplay size={18} />} onClick={review.reload}>
              Try again
            </Button>
            <Button tone="ghost" to="/practice">
              Back to practice
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="sj-page rr">
        <PageHero back={{ to: '/practice', label: 'Practice' }} eyebrow="Run report" title="This run isn’t here" />
        <div className="sj-card rr-note">
          <div className="rr-row">
            <span className="rr-tile" aria-hidden="true">
              <IconLayers size={18} />
            </span>
            <h2 className="sj-display sj-h3">It may have been deleted</h2>
          </div>
          <p className="sj-muted">
            Deleted runs leave your history, but the answers in them still count towards your predicted score. The
            link may also be for someone else’s run.
          </p>
          <div className="rr-note-actions">
            <Button to="/practice" trailing={<IconArrowRight size={18} />}>
              Back to practice
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <ReportSkeleton />;

  return (
    <div className="sj-page rr">
      <PageHero
        back={{ to: '/practice', label: 'Practice' }}
        eyebrow={`Run report · ${longDate(data.started_at)}`}
        title={data.subject_name}
        sub={<ScopeLine data={data} />}
        actions={
          <>
            {data.finished ? (
              <Button tone="lime" to={`/practice/${data.session_id}/summary`} trailing={<IconArrowRight size={18} />}>
                Summary
              </Button>
            ) : (
              <Button tone="lime" to={`/practice/${data.session_id}`} icon={<IconPlay size={14} />}>
                Resume run
              </Button>
            )}
            <button type="button" className="sj-btn rr-herodelete" onClick={() => setAsking(true)}>
              <IconTrash size={17} />
              Delete
            </button>
          </>
        }
        aside={<HeroScore data={data} />}
      />
      <DeleteRunDialog open={asking} onClose={() => !deleting && setAsking(false)} onConfirm={remove} busy={deleting} />
      {data.items.length === 0 ? (
        <div className="sj-card rr-note sj-rise d1">
          <div className="rr-row">
            <span className="rr-tile" aria-hidden="true">
              <IconSpark size={18} />
            </span>
            <h2 className="sj-display sj-h3">Nothing answered yet</h2>
          </div>
          <p className="sj-muted">Each question shows up here once you answer it, with how it went and how to get it.</p>
          {!data.finished ? (
            <div className="rr-note-actions">
              <Button to={`/practice/${data.session_id}`} trailing={<IconArrowRight size={18} />}>
                Answer the first question
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Questions data={data} />
      )}
    </div>
  );
}

function ScopeLine({ data }: { data: RunReview }) {
  const bits = [`${data.length} ${data.length === 1 ? 'question' : 'questions'}`];
  const years = yearsLabel(data.filters?.exam_years ?? []);
  const topicCount = new Set(data.items.map((item) => item.topic_name).filter(Boolean)).size;
  if (data.filters && (data.filters.topic_ids.length > 0 || data.filters.subtopic_ids.length > 0)) {
    bits.push('your choice of topics');
  } else if (topicCount > 0) {
    bits.push(`${topicCount} ${topicCount === 1 ? 'topic' : 'topics'}`);
  }
  if (years) bits.push(`from ${years}`);
  if (!data.finished) bits.push(`${data.answered} answered so far`);
  const tail = data.items.length > 0 ? ' Open any question to see what you chose and how to get it.' : '';
  return <>{`${bits.join(' · ')}.${tail}`}</>;
}

/** The share right first time, as a ring, and the other outcomes counted beside it. */
function HeroScore({ data }: { data: RunReview }) {
  const counts = countOutcomes(data.items);
  const answered = data.answered;
  return (
    <div className="rr-score">
      <Ring value={answered > 0 ? data.correct_unaided / answered : 0} size={104} stroke={11} color="var(--green-400)">
        <span className="rr-score-num sj-num">
          {data.correct_unaided}
          <small>/{answered}</small>
        </span>
      </Ring>
      <div className="rr-score-side">
        <span className="rr-score-label">Right first time</span>
        <ul className="rr-score-list">
          {(['right_after_hint', 'guessed_right', 'taught'] as Outcome[]).map((outcome) => (
            <li key={outcome}>
              <i className={cx('rr-dot', OUTCOME[outcome].tone)} aria-hidden="true" />
              <span>{HERO_LABEL[outcome]}</span>
              <b className="sj-mono">{counts[outcome]}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function countOutcomes(items: ReviewItem[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = {
    right_first_time: 0,
    right_after_hint: 0,
    guessed_right: 0,
    taught: 0,
    unanswered: 0,
  };
  for (const item of items) counts[item.outcome] += 1;
  return counts;
}

/* ------------------------------------------------------------------ grid + list */

function Questions({ data }: { data: RunReview }) {
  const items = useMemo(() => [...data.items].sort((a, b) => a.position - b.position), [data.items]);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<number>>(() => new Set(items[0] ? [items[0].position] : []));
  const [active, setActive] = useState<number | null>(null);
  const cards = useRef(new Map<number, HTMLElement>());
  const pulseTimer = useRef<number | undefined>(undefined);

  const shown = useMemo(() => {
    const rule = FILTERS.find((f) => f.id === filter)!;
    return items.filter((item) => rule.match(item.outcome));
  }, [items, filter]);
  const allOpen = shown.length > 0 && shown.every((item) => open.has(item.position));

  const toggle = (position: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });

  const goTo = useCallback(
    (position: number, how: { focus?: boolean } = {}) => {
      if (!shown.some((item) => item.position === position)) setFilter('all');
      setOpen((current) => (current.has(position) ? current : new Set(current).add(position)));
      setActive(position);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setActive(null), 1400);
      // After the filter and the opening have rendered.
      requestAnimationFrame(() => {
        const card = cards.current.get(position);
        if (!card) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        if (how.focus !== false) card.querySelector<HTMLButtonElement>('.rr-qhead')?.focus({ preventScroll: true });
      });
    },
    [shown],
  );

  // j / k: the next and previous question in the list as filtered.
  const cursor = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('.sj-scrim')) return;
      const key = event.key.toLowerCase();
      if (key !== 'j' && key !== 'k') return;
      if (shown.length === 0) return;
      event.preventDefault();
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-pos]');
      const from = focused ? Number(focused.dataset.pos) : cursor.current;
      const index = from === null ? -1 : shown.findIndex((item) => item.position === from);
      const nextIndex =
        index === -1 ? (key === 'j' ? 0 : shown.length - 1) : Math.max(0, Math.min(shown.length - 1, index + (key === 'j' ? 1 : -1)));
      const next = shown[nextIndex]!;
      cursor.current = next.position;
      goTo(next.position);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, goTo]);

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.id] = items.filter((item) => f.match(item.outcome)).length;
    return out;
  }, [items]);

  return (
    <div className="rr-layout">
      <aside className="rr-nav sj-rise d1" aria-label="Questions in this run">
        <div className="rr-nav-in">
          <div className="rr-nav-head">
            <span className="sj-eyebrow">At a glance</span>
            <span className="rr-nav-count sj-mono">{items.length} questions</span>
          </div>
          <ol className="rr-grid">
            {items.map((item) => {
              const tone = OUTCOME[item.outcome].tone;
              const dim = !FILTERS.find((f) => f.id === filter)!.match(item.outcome);
              return (
                <li key={item.position}>
                  <button
                    type="button"
                    className={cx('rr-cell', tone, dim && 'dim', active === item.position && 'on')}
                    onClick={() => goTo(item.position)}
                    aria-label={`Question ${item.position}: ${OUTCOME[item.outcome].label}`}
                    title={`Question ${item.position}: ${OUTCOME[item.outcome].label}`}
                    style={{ '--i': item.position } as CSSProperties}
                  >
                    {item.position}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul className="rr-key" aria-label="What the colours mean">
            {(Object.keys(OUTCOME) as Outcome[])
              .filter((outcome) => outcome !== 'unanswered' || items.some((item) => item.outcome === 'unanswered'))
              .map((outcome) => (
                <li key={outcome}>
                  <i className={cx('rr-dot', OUTCOME[outcome].tone)} aria-hidden="true" />
                  {OUTCOME[outcome].label}
                </li>
              ))}
          </ul>
          <p className="rr-keys" aria-hidden="true">
            <kbd>j</kbd>
            <kbd>k</kbd> next and previous question
          </p>
        </div>
      </aside>

      <section className="rr-list sj-rise d2" aria-labelledby="rr-list-title">
        <div className="rr-list-head">
          <div className="rr-section-head">
            <span className="sj-eyebrow">Question by question</span>
            <h2 id="rr-list-title" className="sj-display sj-h2">
              What you chose, and how to get it
            </h2>
          </div>
          <div className="rr-toolbar">
            <div className="rr-filters" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={cx('rr-filter', filter === f.id && 'on')}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  disabled={f.id !== 'all' && counts[f.id] === 0}
                >
                  {f.label}
                  <span className="n sj-mono">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rr-expand"
              onClick={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  for (const item of shown) {
                    if (allOpen) next.delete(item.position);
                    else next.add(item.position);
                  }
                  return next;
                })
              }
              disabled={shown.length === 0}
            >
              <IconChevronDown size={16} className={cx('rr-expand-icon', allOpen && 'up')} />
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="sj-card rr-note">
            <div className="rr-row">
              <span className="rr-tile" aria-hidden="true">
                <IconCheck size={18} />
              </span>
              <h3 className="sj-display sj-h3">None of these in this run</h3>
            </div>
            <div className="rr-note-actions">
              <Button tone="soft" onClick={() => setFilter('all')}>
                Show every question
              </Button>
            </div>
          </div>
        ) : (
          <ol className="rr-qs">
            {shown.map((item) => (
              <QuestionCard
                key={item.position}
                item={item}
                open={open.has(item.position)}
                active={active === item.position}
                onToggle={() => toggle(item.position)}
                refCard={(node) => {
                  if (node) cards.current.set(item.position, node);
                  else cards.current.delete(item.position);
                }}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ one question */

function QuestionCard({
  item,
  open,
  active,
  onToggle,
  refCard,
}: {
  item: ReviewItem;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  refCard: (node: HTMLElement | null) => void;
}) {
  const meta = OUTCOME[item.outcome];
  const bodyId = `rr-q-${item.position}`;
  const first = item.attempts[0];
  const second = item.attempts[1];
  const hintUsed = item.attempts.some((attempt) => attempt.hint_used) || item.outcome === 'right_after_hint';
  const where = [item.topic_name, item.subtopic_name].filter(Boolean).join(' · ');
  const source = [item.exam_year ? String(item.exam_year) : null, item.question_number ? `Q${item.question_number}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      ref={refCard}
      className={cx('rr-q', `t-${meta.tone}`, open && 'open', active && 'active')}
      data-pos={item.position}
    >
      <button type="button" className="rr-qhead" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className={cx('rr-qnum sj-mono', meta.tone)}>{pad(item.position)}</span>
        <span className="rr-qmain">
          <span className="rr-qtop">
            <span className={cx('rr-tag', meta.tone)}>{meta.label}</span>
            {source ? <span className="rr-qsource sj-mono">{source}</span> : null}
          </span>
          <span className="rr-qwhere">{where || 'Question'}</span>
        </span>
        <IconChevronDown size={20} className="rr-chev" />
      </button>

      <div className="rr-qbody" id={bodyId} role="region" aria-label={`Question ${item.position}`}>
        <div className="rr-qbody-in">
          {item.passage_body ? <Passage title={item.passage_title} body={item.passage_body} /> : null}
          {item.instructions ? (
            <p className="rr-instructions">
              <Maths text={item.instructions} />
            </p>
          ) : null}
          <div className="rr-stem sj-question">
            <Maths text={item.stem} />
          </div>
          {item.figures && item.figures.length > 0 ? (
            <div className="rr-figures">
              <Figures figures={item.figures} />
            </div>
          ) : null}

          <ul className="rr-opts" aria-label="Options">
            {item.options.map((option) => {
              const correct = option.option_key === item.correct_option_key;
              const pickedFirst = first?.selected_option_key === option.option_key;
              const pickedSecond = second?.selected_option_key === option.option_key;
              const picked = pickedFirst || pickedSecond;
              const labels: string[] = [];
              if (pickedFirst) labels.push(second ? 'Your first answer' : 'Your answer');
              if (pickedSecond && !pickedFirst) labels.push('Your second answer');
              return (
                <li key={option.option_key} className={cx('rr-opt', correct && 'correct', picked && !correct && 'wrong')}>
                  <span className="key sj-mono">{option.option_key}</span>
                  <span className="body">
                    <Maths text={option.body} />
                  </span>
                  {correct || labels.length > 0 ? (
                    <span className="rr-opt-tags">
                      {labels.map((label) => (
                        <span key={label} className={cx('rr-opt-tag', correct ? 'right' : 'mine')}>
                          {label}
                        </span>
                      ))}
                      {correct ? (
                        <span className="rr-opt-tag right solid">
                          <IconCheck size={13} /> Correct
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <FactsRow item={item} hintUsed={hintUsed} />

          {item.solution_steps.length > 0 || item.hint ? (
            <div className="rr-how">
              <div className="rr-row">
                <span className="rr-tile ink" aria-hidden="true">
                  <IconBulb size={18} />
                </span>
                <h3 className="sj-display sj-h3">How to get it</h3>
              </div>
              {item.hint ? (
                <p className="rr-hint">
                  <span className="sj-eyebrow">The hint</span>
                  <span>
                    <Maths text={item.hint} />
                  </span>
                </p>
              ) : null}
              {item.solution_steps.length > 0 ? (
                <ol className="rr-steps">
                  {item.solution_steps.map((step, index) => (
                    <li key={index}>
                      <span className="n sj-mono">{index + 1}</span>
                      <span className="t">
                        <Maths text={step} />
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** What the student told us about this question: how sure, the hint, the lesson. */
function FactsRow({ item, hintUsed }: { item: ReviewItem; hintUsed: boolean }) {
  const first = item.attempts[0];
  const facts: { label: string; text: string }[] = [];
  if (first?.confidence) facts.push({ label: 'How sure', text: `You said: ${CONFIDENCE[first.confidence]}` });
  if (item.attempts.length > 0) facts.push({ label: 'Hint', text: hintUsed ? 'You used the hint' : 'No hint needed' });
  if (item.lesson_feedback) {
    const said = UNDERSTOOD[item.lesson_feedback.understood];
    const matched = item.lesson_feedback.matched_working ? `, and ${MATCHED[item.lesson_feedback.matched_working]}` : '';
    facts.push({ label: 'After the lesson', text: `${said}${matched}` });
  }
  if (item.outcome === 'unanswered') facts.push({ label: 'Status', text: 'You missed it once and didn’t try again' });
  if (facts.length === 0) return null;
  return (
    <dl className="rr-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="sj-eyebrow">{fact.label}</dt>
          <dd>{fact.text}</dd>
        </div>
      ))}
    </dl>
  );
}

const LONG_PASSAGE = 520;

function Passage({ title, body }: { title: string | null; body: string }) {
  const long = body.length > LONG_PASSAGE;
  const [whole, setWhole] = useState(!long);
  return (
    <div className={cx('rr-passage', long && 'long', whole && 'whole')}>
      {title ? <b className="rr-passage-title">{title}</b> : <span className="sj-eyebrow">Passage</span>}
      <div className="rr-passage-text">
        <Maths text={body} />
      </div>
      {long ? (
        <button type="button" className="rr-passage-more" aria-expanded={whole} onClick={() => setWhole((v) => !v)}>
          <IconChevronDown size={16} className={cx('rr-expand-icon', whole && 'up')} />
          {whole ? 'Show less of the passage' : 'Show the whole passage'}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ loading */

function ReportSkeleton() {
  return (
    <div className="sj-page rr" aria-busy="true">
      <div className="rr-skel-hero">
        <Skeleton width={180} height={12} />
        <Skeleton width={260} height={38} />
        <Skeleton width="60%" height={14} />
      </div>
      <div className="rr-layout">
        <aside className="rr-nav">
          <div className="rr-nav-in">
            <Skeleton width={140} height={12} />
            <div className="rr-grid skel">
              {Array.from({ length: 10 }, (_, index) => (
                <Skeleton key={index} height={40} radius={8} />
              ))}
            </div>
          </div>
        </aside>
        <div className="rr-list">
          <Skeleton width={160} height={12} />
          <Skeleton width={320} height={28} />
          <div className="rr-qs">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} height={index === 0 ? 320 : 76} radius={14} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
