/**
 * /bookmarks — the questions a student kept, by subject, newest first. Each subject's can be
 * revised as a practice run (oldest bookmark first), and any one removed.
 */
import { useEffect, useState } from 'react';

import { Maths } from '../../Maths.js';
import { friendly } from '../../lib/friendlyError.js';
import { IconArrowRight, IconBookmark, IconBolt } from '../icons.js';
import { BOOKMARKS_CHANGED, savedApi, type Bookmark } from '../savedApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Skeleton, useToast } from '../ui.js';
import { NothingFreshNote, Note, Section, useStartPractice } from './Home.js';
import './Bookmarks.css';

/** A run revises at most this many at a time; the rest wait for the next. */
const RUN_MOST = 20;

function addedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Bookmarks() {
  usePageTitle('Bookmarks');
  const student = useStudent();
  const toast = useToast();
  const starter = useStartPractice();
  const load = useLoad(() => savedApi.bookmarks(student.studentId), [student.studentId]);
  const [items, setItems] = useState<Bookmark[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (load.data) setItems(load.data);
  }, [load.data]);
  useEffect(() => {
    window.addEventListener(BOOKMARKS_CHANGED, load.reload);
    return () => window.removeEventListener(BOOKMARKS_CHANGED, load.reload);
  }, [load.reload]);

  const remove = async (item: Bookmark) => {
    setRemoving(item.question_id);
    try {
      await savedApi.unbookmark(student.studentId, item.question_version_id);
      setItems((current) => current?.filter((other) => other.question_id !== item.question_id) ?? null);
      toast('Removed from your bookmarks');
    } catch (error) {
      toast(friendly(error));
    } finally {
      setRemoving(null);
    }
  };

  // By subject, in the order a subject was last bookmarked in.
  const groups: { subjectId: string | null; name: string; items: Bookmark[] }[] = [];
  for (const item of items ?? []) {
    let group = groups.find((g) => g.subjectId === item.subject_id);
    if (!group) {
      group = { subjectId: item.subject_id, name: item.subject_name ?? 'Other', items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return (
    <div className="sj-page pro-page bm-page">
      <PageHero
        eyebrow="Bookmarks"
        title="Questions you kept"
        sub="Bookmark any question while you practise, sit a check-up or a mock, or look back over one. Revise them here as a run."
      />

      {load.error && !items ? (
        <Note
          card
          icon={<IconBookmark size={18} />}
          tone="pink"
          title="We couldn't load your bookmarks"
          action={
            <Button tone="soft" onClick={load.reload}>
              Try again
            </Button>
          }
        >
          {friendly(load.error)}
        </Note>
      ) : !items ? (
        <div className="bm-list">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={96} radius={14} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Note
          card
          icon={<IconBookmark size={18} />}
          tone="yellow"
          title="No bookmarks yet"
          action={
            <Button to="/practice" trailing={<IconArrowRight size={18} />}>
              Go to practice
            </Button>
          }
        >
          Tap <b>Bookmark</b> above any question to keep it. Questions you found hard, or want to see again before the
          exam, come back here.
        </Note>
      ) : (
        groups.map((group, index) => {
          const ready = group.items.filter((item) => item.practisable).length;
          const runOf = Math.min(ready, RUN_MOST);
          return (
            <Section
              key={group.subjectId ?? 'other'}
              eyebrow={`${group.items.length} ${group.items.length === 1 ? 'question' : 'questions'}`}
              title={group.name}
              id={`bm-${group.subjectId ?? 'other'}`}
              className={`sj-rise d${Math.min(index + 1, 4)}`}
              action={
                group.subjectId && ready > 0 ? (
                  <Button
                    size="sm"
                    icon={<IconBolt size={16} />}
                    busy={starter.busy === `bm:${group.subjectId}`}
                    onClick={() =>
                      void starter.start(
                        group.subjectId!,
                        { bookmarked: true, length: runOf, label: 'your bookmarks' },
                        `bm:${group.subjectId}`,
                      )
                    }
                  >
                    Revise {runOf === 1 ? 'it' : runOf} in a run
                  </Button>
                ) : null
              }
            >
              {starter.error && starter.lastKey === `bm:${group.subjectId}` ? (
                <p className="bm-error" role="alert">
                  {starter.error}
                </p>
              ) : null}
              {starter.exhausted?.key === `bm:${group.subjectId}` ? <NothingFreshNote starter={starter} /> : null}
              <ul className="bm-list">
                {group.items.map((item) => (
                  <li key={item.question_id} className="sj-card bm-item">
                    <div className="bm-meta">
                      <span>{[item.topic_name, item.exam_year ? `UTME ${item.exam_year}` : null].filter(Boolean).join(' · ')}</span>
                      <span className="bm-added">Kept {addedOn(item.created_at)}</span>
                    </div>
                    <div className="bm-stem sj-question">
                      <Maths text={item.stem} />
                    </div>
                    <div className="bm-foot">
                      {item.practisable ? (
                        <span />
                      ) : (
                        <span className="bm-gone">This question is being checked, so it is not in runs for now.</span>
                      )}
                      <Button
                        tone="ghost"
                        size="sm"
                        busy={removing === item.question_id}
                        onClick={() => void remove(item)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}
    </div>
  );
}
