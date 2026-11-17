/**
 * /bookmarks — the questions a student kept (redesigned 17 Nov 2026). By subject, newest first,
 * each a one-line question card like the check-up report's: the topic and the start of the
 * question (a passage gap names its passage), opening onto the question with its passage, the
 * answer and how to get it. A trash icon removes one; each subject revises as a run.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { IconArrowRight, IconBolt, IconBookmark } from '../icons.js';
import type { ReviewItem } from '../runsApi.js';
import { BOOKMARKS_CHANGED, savedApi, type Bookmark } from '../savedApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, ShowMore, Skeleton, useShowMore, useToast } from '../ui.js';
import { NothingFreshNote, Note, Section, useStartPractice } from './Home.js';
import { IconTrash, QuestionCard } from './RunReport.js';
import './Bookmarks.css';

/** A run revises at most this many at a time; the rest wait for the next. */
const RUN_MOST = 20;
/** Saved questions a subject shows before "Show all". */
const SHOWN = 5;

function addedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface Saved {
  mark: Bookmark;
  item: ReviewItem | undefined;
}

export function Bookmarks() {
  usePageTitle('Saved questions');
  const student = useStudent();
  const toast = useToast();
  const starter = useStartPractice();
  const load = useLoad(
    () => Promise.all([savedApi.bookmarks(student.studentId), savedApi.full(student.studentId).catch(() => [])]),
    [student.studentId],
  );
  const [marks, setMarks] = useState<Bookmark[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (load.data) setMarks(load.data[0]);
  }, [load.data]);
  useEffect(() => {
    window.addEventListener(BOOKMARKS_CHANGED, load.reload);
    return () => window.removeEventListener(BOOKMARKS_CHANGED, load.reload);
  }, [load.reload]);

  const full = useMemo(() => new Map((load.data?.[1] ?? []).map((item) => [item.question_version_id, item])), [load.data]);

  const remove = async (mark: Bookmark) => {
    setRemoving(mark.question_id);
    try {
      await savedApi.unbookmark(student.studentId, mark.question_version_id);
      setMarks((current) => current?.filter((other) => other.question_id !== mark.question_id) ?? null);
      toast('Removed from your saved questions');
    } catch (error) {
      toast(friendly(error));
    } finally {
      setRemoving(null);
    }
  };

  // By subject, in the order a subject was last saved in.
  const groups: { subjectId: string | null; name: string; saved: Saved[] }[] = [];
  for (const mark of marks ?? []) {
    let group = groups.find((g) => g.subjectId === mark.subject_id);
    if (!group) {
      group = { subjectId: mark.subject_id, name: mark.subject_name ?? 'Other', saved: [] };
      groups.push(group);
    }
    group.saved.push({ mark, item: full.get(mark.question_version_id) });
  }

  return (
    <div className="sj-page bm2">
      <PageHero
        eyebrow="Saved questions"
        title="Questions you kept"
        sub="Open any one to see the answer and how to get it, or revise a subject's as a run."
      />

      {load.error && !marks ? (
        <Note
          card
          icon={<IconBookmark size={18} />}
          tone="pink"
          title="We couldn't load your saved questions"
          action={
            <Button tone="soft" onClick={load.reload}>
              Try again
            </Button>
          }
        >
          {friendly(load.error)}
        </Note>
      ) : !marks ? (
        <div className="bm2-skel">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={76} radius={10} />
          ))}
        </div>
      ) : marks.length === 0 ? (
        <Empty />
      ) : (
        groups.map((group) => {
          const ready = group.saved.filter((s) => s.mark.practisable).length;
          const runOf = Math.min(ready, RUN_MOST);
          const key = `bm:${group.subjectId}`;
          return (
            <Section
              key={group.subjectId ?? 'other'}
              eyebrow={`${group.saved.length} saved`}
              title={group.name}
              id={`bm-${group.subjectId ?? 'other'}`}
              action={
                group.subjectId && ready > 0 ? (
                  <Button
                    size="sm"
                    icon={<IconBolt size={16} />}
                    busy={starter.busy === key}
                    onClick={() =>
                      void starter.start(group.subjectId!, { bookmarked: true, length: runOf, label: 'your saved questions' }, key)
                    }
                  >
                    Revise {runOf === 1 ? 'it' : runOf} in a run
                  </Button>
                ) : null
              }
            >
              {starter.error && starter.lastKey === key ? (
                <p className="bm-error" role="alert">
                  {starter.error}
                </p>
              ) : null}
              {starter.exhausted?.key === key ? <NothingFreshNote starter={starter} /> : null}
              <SubjectSaved saved={group.saved} groupKey={group.subjectId ?? 'other'} removing={removing} onRemove={remove} />
            </Section>
          );
        })
      )}
    </div>
  );
}

function SubjectSaved({
  saved,
  groupKey,
  removing,
  onRemove,
}: {
  saved: Saved[];
  groupKey: string;
  removing: string | null;
  onRemove: (mark: Bookmark) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const more = useShowMore(saved, SHOWN);
  const listId = `bm2-${groupKey}`;
  return (
    <>
      <ol className="rr-qs bm2-qs" id={listId}>
        {more.items.map(({ mark, item }, index) => {
          const tools = (
            <button
              type="button"
              className="bm2-trash"
              onClick={() => onRemove(mark)}
              disabled={removing === mark.question_id}
              aria-label="Remove from saved questions"
              title="Remove from saved questions"
            >
              <IconTrash size={17} />
            </button>
          );
          const tag = { label: mark.practisable ? `Kept ${addedOn(mark.created_at)}` : 'Being checked', tone: 'grey' };
          if (!item) {
            // The full question did not come: the line alone, still removable.
            return (
              <li key={mark.question_id} className="rr-q bm2-plain">
                <div className="rr-qrow">
                  <span className="bm2-plain-text">{mark.topic_name ? `${mark.topic_name} · ` : ''}{mark.stem}</span>
                  <div className="rr-qtools">{tools}</div>
                </div>
              </li>
            );
          }
          const shown = { ...item, position: index + 1 };
          return (
            <QuestionCard
              key={mark.question_id}
              item={shown}
              dom={`${groupKey}-`}
              tag={tag}
              tools={tools}
              checkup
              open={open.has(mark.question_id)}
              active={false}
              onToggle={() =>
                setOpen((now) => {
                  const next = new Set(now);
                  if (next.has(mark.question_id)) next.delete(mark.question_id);
                  else next.add(mark.question_id);
                  return next;
                })
              }
              refCard={() => undefined}
            />
          );
        })}
      </ol>
      <ShowMore more={more} noun="saved questions" controls={listId} className="bm2-more" />
    </>
  );
}

/** Nothing saved yet: what a saved question is for, and where the button is. */
function Empty() {
  return (
    <section className="bm2-empty">
      <span className="bm2-empty-tile" aria-hidden="true">
        <IconBookmark size={28} />
      </span>
      <div className="bm2-empty-text">
        <b className="sj-display">Nothing saved yet</b>
        <p>
          Save a question you found hard, or one to see again before the exam. It waits here with its answer and how to
          get it, ready to revise as a run.
        </p>
        <p className="bm2-empty-how">
          Look for
          <span className="bm2-chip" aria-hidden="true">
            <IconBookmark size={14} /> Bookmark
          </span>
          above any question in a run, a check-up or a mock.
        </p>
      </div>
      <Link to="/practice" className="sj-btn bm2-empty-go">
        Go to Practice <IconArrowRight size={16} />
      </Link>
    </section>
  );
}
