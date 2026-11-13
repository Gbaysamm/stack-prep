/**
 * The Lessons pages (routers/bank_lessons.py): every subject, then one subject's topics with the
 * lessons each subtopic has (and the subtopics that have none), then one lesson as it is taught:
 * what the voice says and what goes on the board, moment by moment, with the problems tried
 * after it. A reviewer corrects the words here; the check on the server keeps the timing sound
 * (cue words still said, marked words still on their line), and the edit is kept from being
 * overwritten by the next load of the lesson files.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Maths } from '../Maths.js';
import { friendly } from '../lib/friendlyError.js';
import { IconArrowLeft, IconArrowRight, IconPencil, IconPlay } from '../prep/icons.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { Crumbs, TINTS, plural, useLoad } from './BankPages.js';
import { bank, type ExamPage, type LessonDetail, type LessonMoment, type LessonsPage } from './bankApi.js';
import './bank.css';
import './lessons.css';

/* ------------------------------------------------------------------ every subject */

export function LessonSubjects() {
  const { data, problem } = useLoad<ExamPage[]>(
    () => bank.exams().then((exams) => Promise.all(exams.map((exam) => bank.exam(exam.id)))),
    [],
  );
  return (
    <>
      <StaffPageHead title="Lessons" sub="Choose a subject to see which subtopics have lessons, read them and correct them." />
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
                  <Link to={`/lessons/${subject.subject_id}`} className="bk-card">
                    <span className="bk-card-top">
                      <span className={`bk-letter ${TINTS[index % TINTS.length]}`} aria-hidden="true">
                        {subject.name.slice(0, 1)}
                      </span>
                    </span>
                    <strong className="bk-card-name">{subject.name}</strong>
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

/* ------------------------------------------------------------------ one subject */

type Show = 'all' | 'with' | 'missing';

export function SubjectLessons() {
  const { subjectId = '' } = useParams();
  const { data, problem } = useLoad<LessonsPage>(() => bank.lessons(subjectId), [subjectId]);
  const [show, setShow] = useState<Show>('all');

  const totals = useMemo(() => {
    const subs = (data?.topics ?? []).flatMap((topic) => topic.subtopics);
    return {
      subtopics: subs.length,
      with: subs.filter((sub) => sub.parts.length).length,
      lessons: subs.reduce((n, sub) => n + sub.parts.length, 0),
    };
  }, [data]);

  return (
    <>
      {data && (
        <Crumbs
          items={[
            ...(data.exam_id ? [{ to: `/exams/${data.exam_id}`, label: data.exam ?? 'Exam' }] : []),
            { to: `/subjects/${subjectId}`, label: data.subject },
            { label: 'Lessons' },
          ]}
        />
      )}
      <StaffPageHead
        title={data ? `${data.subject} lessons` : 'Lessons'}
        sub={
          data
            ? `${totals.with} of ${plural(totals.subtopics, 'subtopic')} have lessons · ${plural(totals.lessons, 'lesson')}`
            : undefined
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {data && (
        <>
          <div className="st-seg ls-filter" role="tablist" aria-label="Show">
            {(
              [
                ['all', 'All', totals.subtopics],
                ['with', 'With lessons', totals.with],
                ['missing', 'No lessons yet', totals.subtopics - totals.with],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={show === value}
                className={show === value ? 'on' : undefined}
                onClick={() => setShow(value)}
              >
                {label} <span className="bk-count">{count}</span>
              </button>
            ))}
          </div>
          <div className="ls-topics">
            {data.topics.map((topic) => {
              const subs = topic.subtopics.filter((sub) =>
                show === 'all' ? true : show === 'with' ? sub.parts.length > 0 : sub.parts.length === 0,
              );
              if (!subs.length) return null;
              const done = topic.subtopics.filter((sub) => sub.parts.length).length;
              return (
                <section key={topic.name} className="ls-topic">
                  <header>
                    <h2>{topic.name}</h2>
                    <span className={done === topic.subtopics.length ? 'ls-done' : 'st-muted'}>
                      {done} of {topic.subtopics.length}
                    </span>
                  </header>
                  <ul>
                    {subs.map((sub) => (
                      <li key={sub.subtopic_id} className={sub.parts.length ? undefined : 'ls-none'}>
                        <div className="ls-sub">
                          <code>{sub.code}</code>
                          <strong>{sub.name}</strong>
                          <span className="st-muted">{plural(sub.questions, 'question')}</span>
                        </div>
                        {sub.parts.length ? (
                          <ol className="ls-parts">
                            {sub.parts.map((part) => (
                              <li key={part.part}>
                                <Link to={`/lessons/${subjectId}/${sub.subtopic_id}/${part.part}`}>
                                  <span className="ls-n">
                                    <IconPlay size={11} />
                                    {part.part}
                                  </span>
                                  <span className="ls-title">{part.title ?? sub.name}</span>
                                  <span className="ls-min">{Math.max(1, Math.round(part.minutes))} min</span>
                                  {part.edited_at ? (
                                    <span className="ls-edited" title={`Edited in the app by ${part.edited_by ?? 'a reviewer'}`}>
                                      <IconPencil size={12} />
                                    </span>
                                  ) : null}
                                </Link>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="ls-missing">No lessons yet</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ one lesson */

interface Draft {
  say: string;
  write: string;
}

export function LessonScript() {
  const { subjectId = '', subtopicId = '', part = '1' } = useParams();
  const number = Number(part) || 1;
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [refused, setRefused] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    setLesson(null);
    setEditing(false);
    setDrafts({});
    setRefused([]);
    bank
      .lesson(subtopicId, number)
      .then((found) => live && setLesson(found))
      .catch((error) => live && setProblem(friendly(error)));
    return () => {
      live = false;
    };
  }, [subtopicId, number]);

  const changed = useMemo(
    () =>
      (lesson?.moments ?? []).filter((moment) => {
        const draft = drafts[moment.index];
        return draft && (draft.say !== moment.say || draft.write !== (moment.write ?? ''));
      }),
    [lesson, drafts],
  );

  const save = async () => {
    if (!lesson || !changed.length) return;
    setSaving(true);
    setRefused([]);
    try {
      const result = await bank.editLesson(
        subtopicId,
        number,
        changed.map((moment) => {
          const draft = drafts[moment.index] ?? { say: moment.say, write: moment.write ?? '' };
          return { index: moment.index, say: draft.say, write: moment.write === null ? null : draft.write };
        }),
      );
      if (result.saved) {
        setLesson(result.lesson);
        setDrafts({});
        setEditing(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 3000);
      } else {
        setRefused(result.problems);
      }
    } catch (error) {
      setRefused([friendly(error)]);
    } finally {
      setSaving(false);
    }
  };

  const go = (to: number) => navigate(`/lessons/${subjectId}/${subtopicId}/${to}`);

  return (
    <>
      {lesson && (
        <Crumbs
          items={[
            { to: `/lessons/${subjectId}`, label: 'Lessons' },
            { label: `${lesson.code} ${lesson.subtopic}` },
          ]}
        />
      )}
      <StaffPageHead
        title={lesson ? (lesson.title ?? lesson.subtopic) : 'Lesson'}
        sub={
          lesson
            ? `Lesson ${lesson.part} of ${lesson.parts} · ${plural(lesson.moments.length, 'moment')} · about ${Math.max(1, Math.round(lesson.minutes))} min`
            : undefined
        }
        actions={
          lesson ? (
            editing ? (
              <>
                <button
                  type="button"
                  className="sj-btn ghost"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setDrafts({});
                    setRefused([]);
                  }}
                >
                  Cancel
                </button>
                <button type="button" className="sj-btn" disabled={saving || !changed.length} onClick={() => void save()}>
                  {saving ? 'Saving…' : changed.length ? `Save ${plural(changed.length, 'change')}` : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="sj-btn ghost" disabled={lesson.part <= 1} onClick={() => go(lesson.part - 1)} aria-label="Previous lesson">
                  <IconArrowLeft size={16} />
                </button>
                <button type="button" className="sj-btn ghost" disabled={lesson.part >= lesson.parts} onClick={() => go(lesson.part + 1)} aria-label="Next lesson">
                  <IconArrowRight size={16} />
                </button>
                <button type="button" className="sj-btn" onClick={() => setEditing(true)}>
                  <IconPencil size={16} /> Edit
                </button>
              </>
            )
          ) : undefined
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {saved ? <p className="ls-saved">Saved. Students get the corrected lesson the next time they open it.</p> : null}
      {lesson?.edited_at && !editing ? (
        <p className="ls-note">
          Edited in the app by {lesson.edited_by ?? 'a reviewer'}. The file <code>{lesson.source_file}</code> still has the old words
          until the edit is copied into it.
        </p>
      ) : null}
      {editing ? (
        <p className="ls-note">
          Change the words, not the shape: each moment keeps its place, and words the board waits for (and words a mark points at)
          must stay.
        </p>
      ) : null}
      {refused.length ? (
        <div className="ls-refused" role="alert">
          <strong>Not saved yet</strong>
          <ul>
            {refused.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {lesson ? (
        <div className="ls-script">
          {lesson.moments.map((moment) => (
            <Moment
              key={moment.index}
              moment={moment}
              editing={editing}
              draft={drafts[moment.index]}
              onDraft={(draft) => setDrafts((now) => ({ ...now, [moment.index]: draft }))}
            />
          ))}
          {lesson.problems.length ? (
            <section className="ls-problems">
              <h2>After the lesson</h2>
              {lesson.problems.map((item, index) => (
                <article key={index}>
                  <p className="sp-textbook">
                    <Maths text={item.ask} />
                  </p>
                  <p className="ls-answer">
                    Answer: <Maths text={item.answer} />
                  </p>
                  {item.working.length ? (
                    <ol>
                      {item.working.map((line, n) => (
                        <li key={n}>
                          <Maths text={line} />
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>
      ) : !problem ? (
        <div className="st-panel ls-loading">Loading the lesson…</div>
      ) : null}
    </>
  );
}

function Moment({
  moment,
  editing,
  draft,
  onDraft,
}: {
  moment: LessonMoment;
  editing: boolean;
  draft: Draft | undefined;
  onDraft: (draft: Draft) => void;
}) {
  const say = draft?.say ?? moment.say;
  const write = draft?.write ?? moment.write ?? '';
  return (
    <>
      {moment.section ? <h3 className="ls-section">{moment.section}</h3> : null}
      <div className={`ls-moment ${draft && (draft.say !== moment.say || draft.write !== (moment.write ?? '')) ? 'changed' : ''}`}>
        <span className="ls-dot">{moment.index + 1}</span>
        <div className="ls-body">
          {editing ? (
            <textarea
              className="ls-say-edit"
              aria-label={`Moment ${moment.index + 1}: what is said`}
              value={say}
              rows={Math.max(2, Math.ceil(say.length / 80))}
              onChange={(event) => onDraft({ say: event.target.value, write })}
            />
          ) : (
            <p className="ls-say">{moment.say}</p>
          )}
          {moment.write === null ? null : editing ? (
            <textarea
              className="ls-board-edit"
              aria-label={`Moment ${moment.index + 1}: what is written`}
              value={write}
              rows={Math.max(1, Math.ceil(write.length / 60))}
              onChange={(event) => onDraft({ say, write: event.target.value })}
            />
          ) : (
            <p className="ls-board">
              <IconPencil size={13} aria-hidden="true" />
              <span>
                <Marked text={moment.write} marks={moment.marks} />
              </span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** The written line with the words its marks point at underlined, as the board shows them. */
function Marked({ text, marks }: { text: string; marks: string[] }) {
  const found = marks
    .map((mark) => ({ mark, at: text.toLowerCase().indexOf(mark.toLowerCase()) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!found.length) return <Maths text={text} />;
  const parts: JSX.Element[] = [];
  let from = 0;
  found.forEach(({ mark, at }, n) => {
    if (at < from) return;
    if (at > from) parts.push(<Maths key={`t${n}`} text={text.slice(from, at)} />);
    parts.push(
      <mark key={`m${n}`}>
        <Maths text={text.slice(at, at + mark.length)} />
      </mark>,
    );
    from = at + mark.length;
  });
  if (from < text.length) parts.push(<Maths key="end" text={text.slice(from)} />);
  return <>{parts}</>;
}
