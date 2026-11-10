/**
 * A subject's topics (routers/topics.py): every subject, then one subject's topic list as a
 * tree (topic → subtopic → skill) with how many questions sit under each. A reviewer adds,
 * renames and removes. Removing is guarded: when questions are filed under it, they must be
 * moved to another skill first, so no question loses its topic.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Maths } from '../Maths.js';
import { friendly } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { IconArrowLeft, IconLayers, IconSearch } from '../prep/icons.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { Crumbs, Drawer, TINTS, plural, useLoad } from './BankPages.js';
import { bank, type ExamPage, type TopicKind, type TopicNode, type TopicTree } from './bankApi.js';
import './bank.css';

const CHILD: Record<TopicKind, TopicKind | null> = { topic: 'subtopic', subtopic: 'skill', skill: null };

/* ------------------------------------------------------------------ every subject */

export function TopicSubjects() {
  const { data, problem } = useLoad<ExamPage[]>(
    () => bank.exams().then((exams) => Promise.all(exams.map((exam) => bank.exam(exam.id)))),
    [],
  );
  return (
    <>
      <StaffPageHead title="Topics" sub="Choose a subject to see its topics, add new ones, or tidy the list." />
      {problem && <p className="st-error">{problem}</p>}
      {data?.map((page) => (
        <section key={page.exam.id} className="bk-section">
          <h2>{page.exam.short_name}</h2>
          {page.subjects.length === 0 ? (
            <p className="st-muted">No subjects yet.</p>
          ) : (
            <ul className="bk-grid">
              {page.subjects.map((subject, index) => (
                <li key={subject.subject_id}>
                  <Link to={`/topics/${subject.subject_id}`} className="bk-card">
                    <span className="bk-card-top">
                      <span className={`bk-letter ${TINTS[index % TINTS.length]}`} aria-hidden="true">
                        {subject.name.slice(0, 1)}
                      </span>
                    </span>
                    <strong className="bk-card-name">{subject.name}</strong>
                    <span className="bk-card-meta">{plural(subject.questions, 'question')}</span>
                    {!subject.has_topics ? <span className="bk-note">No topics yet</span> : null}
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

/* ------------------------------------------------------------------ one subject's tree */

type Acting =
  | { kind: 'add'; parent: TopicNode | null }
  | { kind: 'rename'; item: TopicNode }
  | { kind: 'remove'; item: TopicNode }
  | { kind: 'questions'; item: TopicNode };

const WORD: Record<TopicKind, string> = { topic: 'topic', subtopic: 'subtopic', skill: 'skill' };

/** One "⋯" button with the row's actions in a small menu. */
function RowMenu({ item, act }: { item: TopicNode; act: (acting: Acting) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const child = CHILD[item.kind];
  const pick = (acting: Acting) => {
    setOpen(false);
    act(acting);
  };
  return (
    <div className="tp-menu-box" ref={box}>
      <button
        type="button"
        className="tp-more"
        aria-label={`Change ${item.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div className="tp-menu" role="menu">
          {child ? (
            <button type="button" role="menuitem" onClick={() => pick({ kind: 'add', parent: item })}>
              Add a {WORD[child]}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => pick({ kind: 'rename', item })}>
            Rename
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => pick({ kind: 'remove', item })}>
            Remove…
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** "12 questions", which opens them; quiet when there are none. */
function Count({ item, act }: { item: TopicNode; act: (acting: Acting) => void }) {
  return (
    <button
      type="button"
      className={`tp-count${item.questions ? '' : ' none'}`}
      disabled={!item.questions}
      onClick={() => act({ kind: 'questions', item })}
    >
      {item.questions ? plural(item.questions, 'question') : 'No questions'}
    </button>
  );
}

export function SubjectTopics() {
  const { subjectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, problem, reload } = useLoad<TopicTree>(() => bank.topics(subjectId), [subjectId]);
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<Acting | null>(null);

  const children = useMemo(() => {
    const map = new Map<string | null, TopicNode[]>();
    for (const item of data?.items ?? []) {
      const list = map.get(item.parent_id) ?? [];
      list.push(item);
      map.set(item.parent_id, list);
    }
    return map;
  }, [data]);
  const byId = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item])), [data]);
  const topics = children.get(null) ?? [];

  /** With a search: what matches, what holds a match, and all a matching part holds. */
  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return null;
    const keep = new Set<string>();
    const walk = (id: string) => {
      for (const kid of children.get(id) ?? []) {
        keep.add(kid.id);
        walk(kid.id);
      }
    };
    for (const item of data?.items ?? []) {
      if (!`${item.name} ${item.code}`.toLowerCase().includes(needle)) continue;
      for (let at: TopicNode | undefined = item; at; at = at.parent_id ? byId.get(at.parent_id) : undefined) keep.add(at.id);
      walk(item.id);
    }
    return keep;
  }, [needle, data, byId, children]);
  const visible = (item: TopicNode) => !matches || matches.has(item.id);

  const chosenId = params.get('topic');
  const chosen = (chosenId ? byId.get(chosenId) : undefined) ?? null;
  // On a wide screen one topic is always open: the first, to start with.
  const showing = chosen && visible(chosen) ? chosen : (topics.find(visible) ?? null);
  const choose = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('topic', id);
    else next.delete('topic');
    setParams(next);
  };

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    return {
      skills: items.filter((i) => i.kind === 'skill').length,
      questions: topics.reduce((n, t) => n + t.questions, 0),
    };
  }, [data, topics]);
  const done = () => {
    setActing(null);
    reload();
  };
  const subtopics = showing ? (children.get(showing.id) ?? []) : [];

  return (
    <>
      {data && (
        <Crumbs
          items={[
            { to: '/topics', label: 'Topics' },
            { to: `/exams/${data.exam_id}`, label: data.exam_short_name },
            { label: data.subject_name },
          ]}
        />
      )}
      <StaffPageHead
        title={data ? `${data.subject_name} topics` : 'Topics'}
        sub={
          data && data.items.length
            ? `${plural(topics.length, 'topic')} · ${plural(totals.skills, 'skill')} · ${plural(totals.questions, 'question')} filed`
            : undefined
        }
        actions={
          <>
            {data ? (
              <Link to={`/subjects/${data.subject_id}`} className="sj-btn ghost">
                Papers
              </Link>
            ) : null}
            <button type="button" className="sj-btn" onClick={() => setActing({ kind: 'add', parent: null })}>
              Add a topic
            </button>
          </>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {data && data.items.length === 0 ? (
        <div className="bk-empty">
          <span className="bk-empty-icon" aria-hidden="true">
            <IconLayers size={26} />
          </span>
          <h2>No topics yet</h2>
          <p>
            A question only goes live once it is filed under a skill. Add a topic, then the subtopics in it, then the skills a
            question can test.
          </p>
          <button type="button" className="sj-btn" onClick={() => setActing({ kind: 'add', parent: null })}>
            Add a topic
          </button>
        </div>
      ) : null}

      {data && data.items.length ? (
        <div className={`tp-layout${chosen ? ' reading' : ''}`}>
          <aside className="tp-side">
            <label className="tp-search">
              <IconSearch size={16} />
              <input value={search} placeholder="Find a topic or skill" onChange={(e) => setSearch(e.target.value)} />
            </label>
            <ul className="tp-topics">
              {topics.filter(visible).map((topic) => (
                <li key={topic.id}>
                  <button
                    type="button"
                    className={`tp-topic${showing?.id === topic.id ? ' on' : ''}`}
                    aria-current={showing?.id === topic.id ? 'true' : undefined}
                    onClick={() => choose(topic.id)}
                  >
                    <strong>{topic.name}</strong>
                    <span>
                      {plural((children.get(topic.id) ?? []).length, 'subtopic')} · {plural(topic.questions, 'question')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {matches && matches.size === 0 ? <p className="tp-none">Nothing matches “{search.trim()}”.</p> : null}
          </aside>

          {showing ? (
            <section className="tp-main" aria-label={showing.name}>
              <button type="button" className="tp-back" onClick={() => choose(null)}>
                <IconArrowLeft size={16} /> All topics
              </button>
              <header className="tp-head">
                <div>
                  <span className="tp-code">{showing.code}</span>
                  <h2>{showing.name}</h2>
                </div>
                <div className="tp-head-actions">
                  <Count item={showing} act={setActing} />
                  <RowMenu item={showing} act={setActing} />
                </div>
              </header>
              {subtopics.filter(visible).map((sub) => {
                const skills = (children.get(sub.id) ?? []).filter(visible);
                return (
                  <article key={sub.id} className="tp-sub">
                    <header className="tp-sub-head">
                      <div className="tp-sub-name">
                        <strong>{sub.name}</strong>
                        <span>
                          {sub.code} · {plural((children.get(sub.id) ?? []).length, 'skill')}
                        </span>
                      </div>
                      <Count item={sub} act={setActing} />
                      <RowMenu item={sub} act={setActing} />
                    </header>
                    {skills.length ? (
                      <ul className="tp-skills">
                        {skills.map((skill) => (
                          <li key={skill.id} className="tp-skill">
                            <span className="tp-skill-name">{skill.name}</span>
                            <Count item={skill} act={setActing} />
                            <RowMenu item={skill} act={setActing} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button type="button" className="tp-add" onClick={() => setActing({ kind: 'add', parent: sub })}>
                      + Add a skill
                    </button>
                  </article>
                );
              })}
              {subtopics.length === 0 ? <p className="tp-none">This topic has no subtopics yet.</p> : null}
              <button type="button" className="tp-add tp-add-sub" onClick={() => setActing({ kind: 'add', parent: showing })}>
                + Add a subtopic
              </button>
            </section>
          ) : null}
        </div>
      ) : null}

      {acting?.kind === 'add' && data ? (
        <NameTopic
          title={acting.parent ? `Add a ${WORD[CHILD[acting.parent.kind] ?? 'skill']} to “${acting.parent.name}”` : 'Add a topic'}
          hint={
            !acting.parent
              ? 'A broad area of the subject, like “Quadratic equations”.'
              : acting.parent.kind === 'topic'
                ? 'A part of the topic, like “Solving by factorising”.'
                : 'One thing a question can test, like “Find the roots when the equation factorises”. Questions are filed under skills.'
          }
          action="Add it"
          save={(name) => bank.addTopic(data.subject_id, { name, parent_id: acting.parent?.id ?? null })}
          onClose={() => setActing(null)}
          onDone={(added) => {
            if (added.kind === 'topic') choose(added.id);
            done();
          }}
        />
      ) : null}
      {acting?.kind === 'rename' ? (
        <NameTopic
          title={`Rename the ${WORD[acting.item.kind]}`}
          hint="Questions filed under it stay where they are."
          start={acting.item.name}
          action="Save the name"
          save={(name) => bank.renameTopic(acting.item.id, name)}
          onClose={() => setActing(null)}
          onDone={done}
        />
      ) : null}
      {acting?.kind === 'remove' && data ? (
        <RemoveTopic
          item={acting.item}
          tree={data}
          children={children}
          byId={byId}
          onClose={() => setActing(null)}
          onDone={() => {
            if (acting.item.kind === 'topic') choose(null);
            done();
          }}
        />
      ) : null}
      {acting?.kind === 'questions' ? <TopicQuestions item={acting.item} onClose={() => setActing(null)} /> : null}
    </>
  );
}

function NameTopic({
  title,
  hint,
  start = '',
  action,
  save,
  onClose,
  onDone,
}: {
  title: string;
  hint: string;
  start?: string;
  action: string;
  save: (name: string) => Promise<TopicNode>;
  onClose: () => void;
  onDone: (item: TopicNode) => void;
}) {
  const [name, setName] = useState(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    save(name.trim())
      .then(onDone)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title={title} onClose={onClose}>
      <form className="st-form" onSubmit={submit}>
        <label className="st-field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
          <small className="st-muted">{hint}</small>
        </label>
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn" disabled={busy || name.trim().length < 2 || name.trim() === start}>
          {busy ? 'Saving…' : action}
        </button>
      </form>
    </Drawer>
  );
}

/** The guardrail: questions under it are moved to a skill outside it before it goes. */
function RemoveTopic({
  item,
  tree,
  children,
  byId,
  onClose,
  onDone,
}: {
  item: TopicNode;
  tree: TopicTree;
  children: Map<string | null, TopicNode[]>;
  byId: Map<string, TopicNode>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const inside = useMemo(() => {
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      for (const kid of children.get(id) ?? []) walk(kid.id);
    };
    walk(item.id);
    return ids;
  }, [item, children]);
  const below = inside.size - 1;
  const options = useMemo(
    () =>
      tree.items
        .filter((i) => i.kind === 'skill' && !inside.has(i.id))
        .map((skill) => {
          const sub = skill.parent_id ? byId.get(skill.parent_id) : undefined;
          const topic = sub?.parent_id ? byId.get(sub.parent_id) : undefined;
          return { value: skill.id, label: skill.name, hint: [topic?.name, sub?.name].filter(Boolean).join(' › ') };
        }),
    [tree, inside, byId],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bank
      .removeTopic(item.id, item.questions ? target : null)
      .then(onDone)
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer title={`Remove “${item.name}”`} onClose={onClose}>
      <form className="st-form" onSubmit={submit}>
        <p className="tp-say">
          {below
            ? `The ${plural(below, item.kind === 'topic' ? 'subtopic and skill' : 'skill', item.kind === 'topic' ? 'subtopics and skills' : 'skills')} under it go too.`
            : `It has nothing under it.`}
        </p>
        {item.questions ? (
          <div className="st-field">
            <span>
              Move its {plural(item.questions, 'question')} to
            </span>
            {options.length ? (
              <Select aria-label="Move the questions to" value={target} onChange={setTarget} placeholder="Choose a skill" searchable options={options} />
            ) : null}
            <small className="st-muted">
              {options.length
                ? 'They stay approved and go live under the skill you choose. Nothing is lost.'
                : 'There is no other skill to move them to. Add one first, then remove this.'}
            </small>
          </div>
        ) : (
          <p className="tp-say">No questions are filed under it, so none need a new home.</p>
        )}
        {problem && <p className="st-error">{problem}</p>}
        <button type="submit" className="sj-btn tp-remove" disabled={busy || (item.questions > 0 && !target)}>
          {busy ? 'Removing…' : item.questions ? `Move ${plural(item.questions, 'question')} and remove` : 'Remove it'}
        </button>
      </form>
    </Drawer>
  );
}

function TopicQuestions({ item, onClose }: { item: TopicNode; onClose: () => void }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof bank.topicQuestions>> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    bank.topicQuestions(item.id).then(setList).catch((error) => setProblem(friendly(error)));
  }, [item.id]);
  return (
    <Drawer title={item.name} onClose={onClose}>
      <p className="tp-say">{plural(item.questions, 'question')} filed here{item.questions > 300 ? '; the first 300 are shown' : ''}.</p>
      {problem && <p className="st-error">{problem}</p>}
      {list && list.length === 0 ? <p className="st-muted">No questions are filed here yet.</p> : null}
      <ul className="tp-qs">
        {list?.map((q) => (
          <li key={q.question_id}>
            <Link to={`/question/${q.question_id}`} className="tp-q">
              <span className="tp-q-where">
                {q.paper_title ?? 'No paper'}
                {q.question_number ? ` · Q${q.question_number}` : ''}
                {q.state === 'approved' ? '' : ' · waiting for a check'}
              </span>
              <span className="tp-q-stem">
                <Maths text={q.stem.length > 160 ? `${q.stem.slice(0, 160)}…` : q.stem} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
