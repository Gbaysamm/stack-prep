/**
 * Build your own run: the subject, the topics (grouped under their syllabus sections), the years,
 * and how long. JAMB's words: a SECTION (the API's `topics`) is a heading with a tick for all of
 * it; a TOPIC (the API's `subtopics`) is what a student picks.
 *
 * Everything starts chosen — every topic, every year, ten questions — so the page reads as "narrow
 * it down", and the number of questions that match updates as the student picks. When both the
 * topics and the years are narrowed, the options only say how many questions each topic and each
 * year has on its own, so the page says "up to" rather than guess at the overlap; the server
 * shortens a run to what really exists.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { IconArrowRight, IconBook, IconCalendar, IconCheck, IconChevronDown, IconClose, IconLayers, IconReplay, IconTarget } from '../icons.js';
import type { SubjectOverview } from '../progressApi.js';
import { SubjectSwitcher, rememberSubject, useOverview } from '../SubjectSwitcher.js';
import { Refused, orGone, runsApi, type PracticeOptions, type StartRunIn } from '../runsApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, PageHero, Skeleton, cx } from '../ui.js';
import { MasteryBar, masteryWord } from './Home.js';
import { yearsLabel } from './RunReport.js';
import './RunBuilder.css';

const LENGTHS = [
  { value: 5, label: 'Quick' },
  { value: 10, label: 'Standard' },
  { value: 20, label: 'Long' },
  { value: 40, label: 'Full paper' },
] as const;

type Topic = PracticeOptions['topics'][number];

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/* ------------------------------------------------------------------ the page */

export function RunBuilder() {
  usePageTitle('Build a run');
  const student = useStudent();
  const [params, setParams] = useSearchParams();
  const overview = useOverview(student.studentId);
  const subjects = overview.data?.subjects ?? [];
  const asked = params.get('subject');
  const subjectId = subjects.some((s) => s.subject_id === asked) ? asked : (subjects[0]?.subject_id ?? null);
  const subject = subjects.find((s) => s.subject_id === subjectId);

  const pick = (id: string) => {
    rememberSubject(id);
    setParams({ subject: id }, { replace: true });
  };

  const hero = (aside?: ReactNode) => (
    <PageHero
      back={{ to: '/practice', label: 'Practice' }}
      eyebrow="Build your own run"
      title="Choose what to practise"
      sub="Pick the topics and the exam years you want, and how many questions. Misses still get a hint, then the board."
      aside={aside}
    />
  );

  if (overview.error && !overview.data) {
    return (
      <div className="sj-page rb">
        {hero()}
        <Problem title="We couldn’t load your subjects" text={overview.error} onRetry={overview.reload} />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div className="sj-page rb" aria-busy="true">
        {hero()}
        <BuilderSkeleton />
      </div>
    );
  }
  if (!subject) {
    return (
      <div className="sj-page rb">
        {hero()}
        <div className="sj-card rb-note">
          <div className="rb-row">
            <span className="rb-tile" aria-hidden="true">
              <IconBook size={18} />
            </span>
            <h2 className="sj-display sj-h3">Add a subject first</h2>
          </div>
          <p className="sj-muted">Runs are built from the subjects you are preparing for. Choose your exam and subjects, then come back.</p>
          <div className="rb-note-actions">
            <Button to="/exams" trailing={<IconArrowRight size={18} />}>
              Choose my exam
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Builder
      key={subject.subject_id}
      studentId={student.studentId}
      subjects={subjects}
      subjectId={subject.subject_id}
      onSubject={pick}
      hero={hero}
    />
  );
}

/* ------------------------------------------------------------------ the builder, for one subject */

function Builder({
  studentId,
  subjects,
  subjectId,
  onSubject,
  hero,
}: {
  studentId: string;
  subjects: SubjectOverview[];
  subjectId: string;
  onSubject: (id: string) => void;
  hero: (aside?: ReactNode) => ReactNode;
}) {
  const navigate = useNavigate();
  const options = useLoad(() => orGone(runsApi.options(studentId, subjectId)), [studentId, subjectId]);
  const data = options.data;
  // A deep link (?topic= or ?subtopic=, from a topic elsewhere in the app) arrives with that
  // topic already chosen and opened; everything else still starts chosen.
  const [params] = useSearchParams();
  const linkedTopic = params.get('topic');
  const linkedSub = params.get('subtopic');

  // null = everything; otherwise the chosen subtopic ids / years.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [years, setYears] = useState<Set<number> | null>(null);
  const [length, setLength] = useState(10);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const preset = useMemo(() => {
    if (!data) return null;
    for (const topic of data.topics) {
      if (linkedTopic && topic.topic_id === linkedTopic)
        return { topicId: topic.topic_id, subs: topic.subtopics.map((sub) => sub.subtopic_id) };
      const sub = linkedSub ? topic.subtopics.find((item) => item.subtopic_id === linkedSub) : undefined;
      if (sub) return { topicId: topic.topic_id, subs: [sub.subtopic_id] };
    }
    return null;
  }, [data, linkedTopic, linkedSub]);
  const presetApplied = useRef(false);
  useEffect(() => {
    if (!preset || presetApplied.current) return;
    presetApplied.current = true;
    setChosen(new Set(preset.subs));
  }, [preset]);

  const allSubs = useMemo(() => data?.topics.flatMap((t) => t.subtopics.map((s) => s.subtopic_id)) ?? [], [data]);
  const picked = (id: string) => chosen === null || chosen.has(id);
  const pickedCount = chosen === null ? allSubs.length : chosen.size;
  const allTopics = pickedCount === allSubs.length;

  const match = useMemo(() => {
    if (!data) return { n: 0, exact: true };
    const total = data.years.reduce((sum, y) => sum + y.questions, 0);
    let topicSum = 0;
    for (const topic of data.topics) {
      const on = topic.subtopics.filter((s) => chosen === null || chosen.has(s.subtopic_id));
      topicSum += on.length === topic.subtopics.length ? topic.questions : on.reduce((sum, s) => sum + s.questions, 0);
    }
    const yearSum = years === null ? total : data.years.filter((y) => years.has(y.exam_year)).reduce((sum, y) => sum + y.questions, 0);
    if (allTopics && years === null) return { n: total, exact: true };
    if (allTopics) return { n: yearSum, exact: true };
    if (years === null) return { n: topicSum, exact: true };
    return { n: Math.min(topicSum, yearSum), exact: false };
  }, [data, chosen, years, allTopics]);

  const runLength = Math.max(0, Math.min(length, match.n));
  // A new choice clears the last refusal: it was about the old one.
  useEffect(() => setProblem(null), [chosen, years, length]);

  const start = () => {
    if (!data || match.n === 0) return;
    const body: StartRunIn = { student_id: studentId, subject_id: subjectId, length: runLength || length };
    if (!allTopics && chosen) {
      const topicIds: string[] = [];
      const subIds: string[] = [];
      for (const topic of data.topics) {
        const on = topic.subtopics.filter((s) => chosen.has(s.subtopic_id));
        if (on.length === 0) continue;
        if (on.length === topic.subtopics.length) topicIds.push(topic.topic_id);
        else subIds.push(...on.map((s) => s.subtopic_id));
      }
      body.topic_ids = topicIds;
      body.subtopic_ids = subIds;
    }
    if (years !== null) body.exam_years = [...years].sort((a, b) => b - a);
    setStarting(true);
    setProblem(null);
    runsApi
      .start(body)
      .then((state) => navigate(`/practice/${state.session_id}`))
      .catch((error: Error) => {
        setStarting(false);
        setProblem(
          error instanceof Refused && error.status === 422
            ? error.message
            : `We couldn’t start the run: ${error.message || 'try again'}`,
        );
      });
  };

  const topicsLabel = allTopics
    ? 'All topics'
    : pickedCount === 0
      ? 'None chosen'
      : (() => {
          const touched = data?.topics.filter((t) => t.subtopics.some((s) => picked(s.subtopic_id))).length ?? 0;
          return touched > 1 ? `${plural(pickedCount, 'topic')} · ${plural(touched, 'section')}` : plural(pickedCount, 'topic');
        })();
  const yearsText = years === null ? 'All years' : (yearsLabel([...years]) ?? 'None');
  const blocked =
    pickedCount === 0 ? 'Choose at least one topic.' : years !== null && years.size === 0 ? 'Choose at least one year.' : match.n === 0 ? 'No questions match that choice yet. Try more topics or years.' : null;

  const aside =
    data && data.years.length > 0 ? (
      <div className="rb-match" aria-live="polite">
        <span className="rb-match-label">{match.exact ? 'Questions that match' : 'Up to this many match'}</span>
        <span className="rb-match-num sj-num">
          <CountUp value={match.n} duration={420} />
        </span>
        <span className="rb-match-note">
          {match.exact
            ? `From ${topicsLabel === 'All topics' ? 'every topic' : topicsLabel.toLowerCase()}, ${yearsText === 'All years' ? 'every year' : yearsText}.`
            : 'Some topics are missing from some years, so the real number may be lower.'}
        </span>
      </div>
    ) : undefined;

  return (
    <div className="sj-page rb">
      {hero(aside)}

      <div className="rb-layout">
        <div className="rb-steps">
          <Step n={1} title="Subject" status={subjects.find((s) => s.subject_id === subjectId)?.subject_name} className="d1">
            <SubjectSwitcher subjects={subjects} value={subjectId} onChange={(id) => id !== subjectId && onSubject(id)} label="Subject" />
          </Step>

          {options.error && data === undefined ? (
            <Problem title="We couldn’t load the topics" text={options.error} onRetry={options.reload} />
          ) : data === null ? (
            <div className="sj-card rb-note sj-rise d2">
              <div className="rb-row">
                <span className="rb-tile yellow" aria-hidden="true">
                  <IconLayers size={18} />
                </span>
                <h2 className="sj-display sj-h3">Choosing topics isn’t ready here yet</h2>
              </div>
              <p className="sj-muted">
                You can still start an ordinary run from the practice page. It aims at your weakest topics for you.
              </p>
              <div className="rb-note-actions">
                <Button to="/practice" trailing={<IconArrowRight size={18} />}>
                  Go to practice
                </Button>
              </div>
            </div>
          ) : !data ? (
            <BuilderSkeleton steps />
          ) : data.years.length === 0 ? (
            <div className="sj-card rb-note sj-rise d2">
              <div className="rb-row">
                <span className="rb-tile" aria-hidden="true">
                  <IconBook size={18} />
                </span>
                <h2 className="sj-display sj-h3">No {data.subject_name} questions yet</h2>
              </div>
              <p className="sj-muted">Questions for this subject are still being checked. Try another subject for now.</p>
            </div>
          ) : (
            <>
              <Step n={2} title="Topics" status={topicsLabel} className="d2">
                <TopicTree data={data} chosen={chosen} setChosen={setChosen} openFirst={preset?.topicId} />
              </Step>
              <Step n={3} title="Exam years" status={yearsText} className="d3">
                <YearPicker data={data} years={years} setYears={setYears} />
              </Step>
              <Step n={4} title="How many questions" status={runLength > 0 ? `${runLength} questions` : '—'} className="d4">
                <div className="rb-lengths" role="radiogroup" aria-label="Run length">
                  {LENGTHS.map((option) => {
                    const tooMany = option.value > match.n && option.value !== LENGTHS[0].value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={length === option.value}
                        disabled={tooMany}
                        className={cx('rb-length', length === option.value && 'on')}
                        onClick={() => setLength(option.value)}
                      >
                        <b>{option.label}</b>
                        <span className="sj-mono">{tooMany ? `${match.exact ? 'Only' : 'At most'} ${match.n} match` : `${option.value} questions`}</span>
                      </button>
                    );
                  })}
                </div>
                {match.n > 0 && match.n < length ? (
                  <p className="rb-foot">
                    {match.exact
                      ? `Only ${plural(match.n, 'question')} match, so the run will be ${match.n} long.`
                      : `The run will be as long as the questions that really match allow, up to ${Math.min(length, match.n)}.`}
                  </p>
                ) : null}
              </Step>
            </>
          )}
        </div>

        {data ? (
          <aside className="rb-summary" aria-label="Your run">
            <div className="rb-summary-in">
              <div className="rb-summary-head">
                <span className="sj-eyebrow">Your run</span>
                <span className="rb-summary-count">
                  <span className="sj-num">{runLength}</span>
                  <span className="rb-summary-of">{runLength === 1 ? 'question' : 'questions'}</span>
                </span>
              </div>
              <dl className="rb-facts">
                <div>
                  <dt>
                    <IconBook size={15} /> Subject
                  </dt>
                  <dd>{data.subject_name}</dd>
                </div>
                <div>
                  <dt>
                    <IconTarget size={15} /> Topics
                  </dt>
                  <dd>{topicsLabel}</dd>
                </div>
                <div>
                  <dt>
                    <IconCalendar size={15} /> Years
                  </dt>
                  <dd>{yearsText}</dd>
                </div>
              </dl>
              <p className={cx('rb-live', match.n === 0 && 'none')} aria-live="polite">
                <span className="sj-mono">{match.exact ? match.n : `≤ ${match.n}`}</span>
                {match.exact ? (match.n === 1 ? ' question matches' : ' questions match') : ' questions may match'}
              </p>
              <Button
                size="lg"
                block
                busy={starting}
                disabled={!!blocked}
                onClick={start}
                trailing={starting ? undefined : <IconArrowRight size={18} />}
              >
                {starting ? 'Picking questions…' : 'Start this run'}
              </Button>
              {problem || blocked ? (
                <p className="rb-alert" role="alert">
                  {problem ?? blocked}
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ a step */

function Step({
  n,
  title,
  status,
  children,
  className,
}: {
  n: number;
  title: string;
  status?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('sj-card rb-step sj-rise', className)} aria-labelledby={`rb-step-${n}`}>
      <header className="rb-step-head">
        <span className="rb-step-n sj-mono" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h2 id={`rb-step-${n}`} className="sj-display sj-h3">
          {title}
        </h2>
        {status ? <span className="rb-step-status">{status}</span> : null}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ topics */

function TopicTree({
  data,
  chosen,
  setChosen,
  openFirst,
}: {
  data: PracticeOptions;
  chosen: Set<string> | null;
  setChosen: (next: Set<string> | null) => void;
  /** A section to show open from the start: the one a deep link chose. Every section starts open. */
  openFirst?: string;
}) {
  const [query, setQuery] = useState('');
  // Sections start open: the topics are what a student picks, so they are on show from the
  // start, and a section only folds away when the student folds it.
  const [openTopics, setOpenTopics] = useState<Set<string>>(
    () => new Set([...data.topics.map((t) => t.topic_id), ...(openFirst ? [openFirst] : [])]),
  );
  const all = useMemo(() => data.topics.flatMap((t) => t.subtopics.map((s) => s.subtopic_id)), [data]);
  const isOn = (id: string) => chosen === null || chosen.has(id);
  const set = (next: Set<string>) => setChosen(next.size === all.length ? null : next);
  const current = () => new Set(chosen ?? all);

  const weakest = useMemo(
    () =>
      data.topics
        .flatMap((t) => t.subtopics.map((s) => ({ ...s, topic_id: t.topic_id })))
        .filter((s) => s.mastery !== null && s.questions > 0)
        .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))
        .slice(0, 3),
    [data],
  );

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return data.topics.map((topic) => ({ topic, subs: topic.subtopics }));
    return data.topics
      .map((topic) => {
        if (topic.name.toLowerCase().includes(q)) return { topic, subs: topic.subtopics };
        return { topic, subs: topic.subtopics.filter((s) => s.name.toLowerCase().includes(q)) };
      })
      .filter((row) => row.subs.length > 0 || row.topic.name.toLowerCase().includes(q));
  }, [data, q]);

  const toggleTopic = (topic: Topic) => {
    const next = current();
    const ids = topic.subtopics.map((s) => s.subtopic_id);
    const every = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (every) next.delete(id);
      else next.add(id);
    }
    set(next);
  };
  const toggleSub = (id: string) => {
    const next = current();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set(next);
  };
  const expand = (id: string) =>
    setOpenTopics((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rb-topics">
      <div className="rb-tools">
        <label className="rb-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="rb-search-input"
            placeholder="Find a topic"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find a topic"
          />
          {query ? (
            <button type="button" className="rb-search-clear" onClick={() => setQuery('')} aria-label="Clear the search">
              <IconClose size={16} />
            </button>
          ) : null}
        </label>
        <div className="rb-quick" role="group" aria-label="Quick choices">
          <button type="button" className={cx('rb-qbtn', chosen === null && 'on')} onClick={() => setChosen(null)}>
            Select all
          </button>
          <button
            type="button"
            className="rb-qbtn"
            disabled={weakest.length === 0}
            title={weakest.length === 0 ? 'Take a check-up first: it finds your weakest topics.' : 'Your three weakest topics, from your answers so far'}
            onClick={() => {
              setChosen(new Set(weakest.map((s) => s.subtopic_id)));
              setOpenTopics((open) => new Set([...open, ...weakest.map((s) => s.topic_id)]));
            }}
          >
            Weakest 3
          </button>
          <button type="button" className={cx('rb-qbtn', chosen !== null && chosen.size === 0 && 'on')} onClick={() => setChosen(new Set())}>
            Clear
          </button>
        </div>
      </div>
      <p className="rb-gloss">
        The bar is how often we think you’d get a question on it right, from your answers so far. Striped means not checked yet.
      </p>

      {visible.length === 0 ? (
        <p className="rb-nomatch">No topic or section called “{query.trim()}”. Try a shorter word.</p>
      ) : (
        <ul className="rb-tree">
          {visible.map(({ topic, subs }) => {
            const ids = topic.subtopics.map((s) => s.subtopic_id);
            const on = ids.filter(isOn).length;
            const state = on === 0 ? 'none' : on === ids.length ? 'all' : 'some';
            const open = !!q || openTopics.has(topic.topic_id);
            return (
              <li key={topic.topic_id} className={cx('rb-topic', open && 'open', state !== 'none' && 'picked')}>
                <div className="rb-topic-row">
                  <Check
                    state={state}
                    label={`All of ${topic.name}`}
                    onChange={() => toggleTopic(topic)}
                    disabled={topic.questions === 0}
                  />
                  <button
                    type="button"
                    className="rb-topic-name"
                    aria-expanded={open}
                    onClick={() => expand(topic.topic_id)}
                    disabled={!!q}
                  >
                    <span className="t">
                      <span className="rb-sec-eyebrow sj-mono">Section</span>
                      {topic.name}
                    </span>
                    <span className="rb-count sj-mono">
                      {state === 'some' ? `${on}/${ids.length} topics · ` : `${plural(ids.length, 'topic')} · `}
                      {topic.questions}
                      <span className="u"> q</span>
                    </span>
                    <IconChevronDown size={18} className="rb-chev" />
                  </button>
                </div>
                {open ? (
                  <ul className="rb-subs">
                    {subs.map((sub) => (
                      <li key={sub.subtopic_id}>
                        <Check
                          state={isOn(sub.subtopic_id) ? 'all' : 'none'}
                          onChange={() => toggleSub(sub.subtopic_id)}
                          disabled={sub.questions === 0}
                          className={cx('rb-sub', isOn(sub.subtopic_id) && 'picked')}
                        >
                          <span className="rb-sub-name">{sub.name}</span>
                          <span className="rb-sub-mastery" title={masteryWord(sub.mastery)}>
                            <MasteryBar value={sub.mastery} label={`${sub.name} mastery`} />
                            <span className={cx('pct sj-mono', sub.mastery === null && 'none')}>
                              {sub.mastery === null ? '—' : `${Math.round(sub.mastery * 100)}%`}
                            </span>
                          </span>
                          <span className="rb-count sj-mono">
                            {sub.questions}
                            <span className="u"> q</span>
                          </span>
                        </Check>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * A checkbox that can also be part-ticked, in the page's own look. With children, the whole
 * row is the label, so a tap anywhere on it ticks.
 */
function Check({
  state,
  label,
  onChange,
  disabled,
  className,
  children,
}: {
  state: 'all' | 'some' | 'none';
  label?: string;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <label className={cx('rb-check', state, disabled && 'off', className)}>
      <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} aria-label={label} disabled={disabled} />
      <span className="box" aria-hidden="true">
        {state === 'all' ? <IconCheck size={14} /> : state === 'some' ? <i /> : null}
      </span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ years */

function YearPicker({
  data,
  years,
  setYears,
}: {
  data: PracticeOptions;
  years: Set<number> | null;
  setYears: (next: Set<number> | null) => void;
}) {
  const list = [...data.years].sort((a, b) => b.exam_year - a.exam_year);
  const newest = list.map((y) => y.exam_year);
  const lastN = (n: number) => new Set(newest.slice(0, n));
  const same = (a: Set<number> | null, b: Set<number>) => a !== null && a.size === b.size && [...b].every((y) => a.has(y));
  const toggle = (year: number) => {
    const next = new Set(years ?? []);
    if (years === null) {
      next.clear();
      next.add(year);
    } else if (next.has(year)) next.delete(year);
    else next.add(year);
    setYears(next.size === 0 || next.size === list.length ? null : next);
  };
  const quick = [5, 10].filter((n) => n < list.length);
  return (
    <div className="rb-years">
      <div className="rb-quick" role="group" aria-label="Quick choices">
        <button type="button" className={cx('rb-qbtn', years === null && 'on')} aria-pressed={years === null} onClick={() => setYears(null)}>
          All years
        </button>
        {quick.map((n) => (
          <button
            key={n}
            type="button"
            className={cx('rb-qbtn', same(years, lastN(n)) && 'on')}
            aria-pressed={same(years, lastN(n))}
            onClick={() => setYears(lastN(n))}
          >
            Last {n} years
          </button>
        ))}
      </div>
      <ul className="rb-yeargrid" aria-label="Years">
        {list.map((y) => {
          const on = years !== null && years.has(y.exam_year);
          return (
            <li key={y.exam_year}>
              <button
                type="button"
                className={cx('rb-year', on && 'on', years === null && 'all')}
                aria-pressed={on}
                onClick={() => toggle(y.exam_year)}
                disabled={y.questions === 0}
              >
                <b className="sj-mono">{y.exam_year}</b>
                <span className="sj-mono">{y.questions} q</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="rb-gloss">
        {years === null ? 'Every year is in. Tap a year to use only the years you pick.' : 'Only the years you picked. Tap again to take one out.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ states */

function Problem({ title, text, onRetry }: { title: string; text: string; onRetry: () => void }) {
  return (
    <div className="sj-card rb-note pink">
      <div className="rb-row">
        <span className="rb-tile pink" aria-hidden="true">
          <IconReplay size={18} />
        </span>
        <h2 className="sj-display sj-h3">{title}</h2>
      </div>
      <p className="sj-muted">{text}</p>
      <div className="rb-note-actions">
        <Button icon={<IconReplay size={18} />} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function BuilderSkeleton({ steps }: { steps?: boolean }) {
  const cards = (
    <>
      {[220, 180, 120].map((h, i) => (
        <div key={i} className="sj-card rb-step">
          <Skeleton width={160} height={22} />
          <Skeleton height={h} radius={10} />
        </div>
      ))}
    </>
  );
  if (steps) return cards;
  return (
    <div className="rb-layout">
      <div className="rb-steps">{cards}</div>
      <div className="rb-summary">
        <div className="rb-summary-in">
          <Skeleton width={120} height={12} />
          <Skeleton height={120} radius={10} />
          <Skeleton height={56} radius={12} />
        </div>
      </div>
    </div>
  );
}
