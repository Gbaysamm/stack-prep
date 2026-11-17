/**
 * Saved questions (founder, 17 Nov 2026, second pass): a page of subjects, then a page per
 * subject, so a hundred saved questions never make one long scroll.
 *
 * - /bookmarks: the figures (saved in all, this week, ready to revise, subjects) and a card per
 *   subject: how many, the topics most come from, when the last was saved, a run to revise them.
 * - /bookmarks/:subject: that subject's saved questions as one-line question cards that open to
 *   the passage, the answer and the working; a trash icon on each; paged.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { IconArrowRight, IconBolt, IconBookmark, IconChevronRight } from '../icons.js';
import type { ReviewItem } from '../runsApi.js';
import { BOOKMARKS_CHANGED, savedApi, type Bookmark } from '../savedApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Pager, Skeleton, usePaged, useToast } from '../ui.js';
import { NothingFreshNote, Note, Section, useStartPractice } from './Home.js';
import { IconTrash, QuestionCard } from './RunReport.js';
import './Bookmarks.css';

/** A run revises at most this many at a time; the rest wait for the next. */
const RUN_MOST = 20;
/** Saved questions a subject's page shows at a time. */
const PER_PAGE = 10;
const WEEK_MS = 7 * 86_400_000;

/** "Use of English" → "use-of-english", as the subject page's address. */
function subjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface Group {
  subjectId: string | null;
  name: string;
  slug: string;
  marks: Bookmark[];
}

/** The student's saved questions, kept in step with saves and removals made anywhere. */
function useSaved() {
  const student = useStudent();
  const load = useLoad(
    () => Promise.all([savedApi.bookmarks(student.studentId), savedApi.full(student.studentId).catch(() => [])]),
    [student.studentId],
  );
  const [marks, setMarks] = useState<Bookmark[] | null>(null);
  useEffect(() => {
    if (load.data) setMarks(load.data[0]);
  }, [load.data]);
  useEffect(() => {
    window.addEventListener(BOOKMARKS_CHANGED, load.reload);
    return () => window.removeEventListener(BOOKMARKS_CHANGED, load.reload);
  }, [load.reload]);
  const full = useMemo(() => new Map((load.data?.[1] ?? []).map((item) => [item.question_version_id, item])), [load.data]);
  // By subject, in the order a subject was last saved in.
  const groups: Group[] = [];
  for (const mark of marks ?? []) {
    let group = groups.find((g) => g.subjectId === mark.subject_id);
    if (!group) {
      const name = mark.subject_name ?? 'Other';
      group = { subjectId: mark.subject_id, name, slug: subjectSlug(name), marks: [] };
      groups.push(group);
    }
    group.marks.push(mark);
  }
  return { load, marks, setMarks, full, groups };
}

/** Revise a subject's saved questions as a run. */
function ReviseButton({ group, starter }: { group: Group; starter: ReturnType<typeof useStartPractice> }) {
  const ready = group.marks.filter((m) => m.practisable).length;
  const runOf = Math.min(ready, RUN_MOST);
  if (!group.subjectId || ready === 0) return null;
  const key = `bm:${group.subjectId}`;
  return (
    <Button
      size="sm"
      icon={<IconBolt size={16} />}
      busy={starter.busy === key}
      onClick={() => void starter.start(group.subjectId!, { bookmarked: true, length: runOf, label: 'your saved questions' }, key)}
    >
      Revise {runOf === 1 ? 'it' : runOf} in a run
    </Button>
  );
}

/* ================================================================== /bookmarks */

export function Bookmarks() {
  usePageTitle('Saved questions');
  const starter = useStartPractice();
  const { load, marks, groups } = useSaved();
  const now = Date.now();
  const thisWeek = (marks ?? []).filter((m) => now - new Date(m.created_at).getTime() < WEEK_MS).length;
  const ready = (marks ?? []).filter((m) => m.practisable).length;

  return (
    <div className="sj-page bm2">
      <PageHero
        eyebrow="Saved questions"
        title="Questions you kept"
        sub="Each subject's saved questions, with their answers and how to get them. Revise them as a run."
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
          <Skeleton height={96} radius={10} />
          <Skeleton height={180} radius={10} />
        </div>
      ) : marks.length === 0 ? (
        <Empty />
      ) : (
        <>
          <ul className="bm2-figures" aria-label="Your saved questions in figures">
            <li>
              <span>Saved</span>
              <b className="sj-num">{marks.length}</b>
              <small>questions in all</small>
            </li>
            <li>
              <span>This week</span>
              <b className="sj-num">{thisWeek}</b>
              <small>saved in the last 7 days</small>
            </li>
            <li>
              <span>Ready to revise</span>
              <b className="sj-num">{ready}</b>
              <small>{ready === marks.length ? 'every one' : `${marks.length - ready} being checked`}</small>
            </li>
            <li>
              <span>Subjects</span>
              <b className="sj-num">{groups.length}</b>
              <small>{groups.length === 1 ? 'subject' : 'subjects'} with saved questions</small>
            </li>
          </ul>

          <Section eyebrow="By subject" title="Your saved questions" id="bm2-subjects">
            {starter.error ? (
              <p className="bm-error" role="alert">
                {starter.error}
              </p>
            ) : null}
            {starter.exhausted ? <NothingFreshNote starter={starter} /> : null}
            <ul className="bm2-subjects">
              {groups.map((group) => {
                const counts = new Map<string, number>();
                for (const m of group.marks) if (m.topic_name) counts.set(m.topic_name, (counts.get(m.topic_name) ?? 0) + 1);
                const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                return (
                  <li key={group.subjectId ?? 'other'} className="bm2-subject">
                    <Link to={`/bookmarks/${group.slug}`} className="bm2-subject-cover" aria-label={`Open ${group.name}`} />
                    <div className="bm2-subject-head">
                      <span className="bm2-subject-name">
                        <b className="sj-display">{group.name}</b>
                        <small>Last saved {addedOn(group.marks[0]!.created_at)}</small>
                      </span>
                      <span className="bm2-subject-n">
                        <b className="sj-num">{group.marks.length}</b>
                        <small>saved</small>
                      </span>
                    </div>
                    {topics.length > 0 ? (
                      <p className="bm2-subject-topics">
                        Mostly from <b>{topics.map(([name]) => name).join(', ')}</b>
                      </p>
                    ) : null}
                    <div className="bm2-subject-foot">
                      <ReviseButton group={group} starter={starter} />
                      <span className="bm2-subject-open">
                        See all <IconChevronRight size={16} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

/* ================================================================== /bookmarks/:subject */

export function BookmarksSubject() {
  const { subject: slug = '' } = useParams();
  const student = useStudent();
  const toast = useToast();
  const starter = useStartPractice();
  const { load, marks, setMarks, full, groups } = useSaved();
  const group = groups.find((g) => g.slug === slug);
  usePageTitle(group ? `Saved: ${group.name}` : 'Saved questions');
  const [removing, setRemoving] = useState<string | null>(null);

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

  const back = { to: '/bookmarks', label: 'Saved questions' };
  if (!marks) {
    return (
      <div className="sj-page bm2">
        <PageHero back={back} eyebrow="Saved questions" title="Loading…" />
        {load.error ? <p className="bm-error">{friendly(load.error)}</p> : <Skeleton height={300} radius={10} />}
      </div>
    );
  }
  if (!group) {
    return (
      <div className="sj-page bm2">
        <PageHero back={back} eyebrow="Saved questions" title="Nothing saved here" sub="No saved questions in this subject now." />
      </div>
    );
  }
  return (
    <div className="sj-page bm2">
      <PageHero
        back={back}
        eyebrow={`Saved questions · ${group.marks.length} saved`}
        title={group.name}
        sub="Open any one to see the answer and how to get it."
        actions={<ReviseButton group={group} starter={starter} />}
      />
      {starter.error ? (
        <p className="bm-error" role="alert">
          {starter.error}
        </p>
      ) : null}
      {starter.exhausted ? <NothingFreshNote starter={starter} /> : null}
      <SubjectSaved group={group} full={full} removing={removing} onRemove={remove} />
    </div>
  );
}

function SubjectSaved({
  group,
  full,
  removing,
  onRemove,
}: {
  group: Group;
  full: Map<string, ReviewItem>;
  removing: string | null;
  onRemove: (mark: Bookmark) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const paged = usePaged(group.marks, PER_PAGE, group.slug);
  return (
    <section aria-label={`Saved ${group.name} questions`} id="bm2-list">
      <ol className="rr-qs bm2-qs">
        {paged.items.map((mark, index) => {
          const item = full.get(mark.question_version_id);
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
          if (!item) {
            // The full question did not come: the line alone, still removable.
            return (
              <li key={mark.question_id} className="rr-q bm2-plain">
                <div className="rr-qrow">
                  <span className="bm2-plain-text">
                    {mark.topic_name ? `${mark.topic_name} · ` : ''}
                    {mark.stem}
                  </span>
                  <div className="rr-qtools">{tools}</div>
                </div>
              </li>
            );
          }
          return (
            <QuestionCard
              key={mark.question_id}
              item={{ ...item, position: paged.start + index + 1 }}
              dom={`${group.slug}-`}
              tag={{ label: mark.practisable ? `Kept ${addedOn(mark.created_at)}` : 'Being checked', tone: 'grey' }}
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
      <Pager paged={paged} noun="saved questions" label={`Pages of saved ${group.name} questions`} anchorId="bm2-list" />
    </section>
  );
}

/** Nothing saved yet: what saving is for, in one line, and one way on. */
function Empty() {
  return (
    <section className="bm2-empty">
      <span className="bm2-empty-tile" aria-hidden="true">
        <IconBookmark size={26} />
      </span>
      <div className="bm2-empty-text">
        <b className="sj-display">Nothing saved yet</b>
        <p>Bookmark a question in any run, check-up or mock to keep it here with its answer.</p>
      </div>
      <Link to="/practice" className="sj-btn bm2-empty-go">
        Go to Practice <IconArrowRight size={16} />
      </Link>
    </section>
  );
}
