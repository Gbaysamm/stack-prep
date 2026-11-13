/**
 * The roadmap (/roadmap): what Stack Prep has planned for this student, towards their target.
 * The week day by day, each subject's line to exam day, and how closely the plan is followed.
 * Few words: the plan does the explaining (docs/plans/2026-11-10-student-roadmap.md).
 */
import { Link } from 'react-router-dom';

import { IconArrowRight, IconBolt, IconClock, IconPlay, IconTarget, IconTrophy } from '../icons.js';
import { Journey, type Stop } from '../Journey.js';
import {
  itemLabel,
  today,
  useRoadmap,
  useStartItem,
  type Roadmap as RoadmapData,
  type RoadmapItem,
  type RoadmapSubject,
} from '../roadmapApi.js';
import { usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, PageHero, Skeleton } from '../ui.js';
import { FIRST_PATH, HeroStats, Section } from './Home.js';
import './Roadmap.css';

/** How many planned items the path shows before exam day. */

function headline(roadmap: RoadmapData): string {
  if (roadmap.subjects.length === 0) return 'Start with your goal';
  const target = roadmap.target_total;
  switch (roadmap.status) {
    case 'on_track':
      return `On track for ${target}`;
    case 'stretch':
      return `${target} is within reach`;
    case 'out_of_reach':
      return `Aiming for ${target}`;
    case 'needs_checkups':
      return 'Your plan so far';
    case 'no_target':
      return 'Your plan';
    case 'exam_passed':
      return 'Your exam has passed';
  }
}

function subline(roadmap: RoadmapData): string {
  if (roadmap.subjects.length === 0) return "We'll build your plan from it.";
  // Covering the syllabus comes before any target: say that first.
  if (roadmap.pace_advice) return roadmap.pace_advice;
  if (roadmap.advice) return roadmap.advice;
  if (roadmap.status === 'needs_checkups') return 'Your total out of 400 shows once all four subjects have a check-up.';
  if (roadmap.status === 'no_target') return 'Set a target score and the plan aims at it.';
  if (roadmap.status === 'exam_passed') return '';
  return `${roadmap.study_days_left} study days to go.`;
}

export function Roadmap() {
  usePageTitle('Roadmap');
  const student = useStudent();
  const loaded = useRoadmap(student.studentId);
  const starter = useStartItem(student.studentId);

  if (!loaded.data) {
    return (
      <div className="sj-page rm-page">
        {loaded.error ? (
          <>
            <PageHero eyebrow="Your roadmap" title="We couldn't load your plan" />
            <Button tone="soft" onClick={loaded.reload}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Skeleton height={180} radius={18} />
            <Skeleton height={320} radius={18} />
          </>
        )}
      </div>
    );
  }

  const roadmap = loaded.data;
  const { next } = today(roadmap);
  const stats: Parameters<typeof HeroStats>[0]['stats'] = [];
  if (roadmap.total_expected !== null) {
    stats.push({
      label: 'By exam day',
      value: <CountUp value={Math.round(roadmap.total_expected)} />,
      unit: '/ 400',
      tone: 'lime',
      note: roadmap.total_now !== null ? `Now ${Math.round(roadmap.total_now)}` : undefined,
    });
  }

  return (
    <div className="sj-page rm-page">
      <PageHero
        eyebrow="Your roadmap"
        title={headline(roadmap)}
        sub={subline(roadmap) || undefined}
        aside={stats.length ? <HeroStats stats={stats} /> : undefined}
      />
      {starter.error ? <p className="rm-error">{starter.error}</p> : null}

      <div className="rm-layout">
      <Section
        eyebrow={roadmap.subjects.length === 0 ? 'Getting started' : next ? 'Today, then next' : 'Done for today'}
        title="Your path"
        id="rm-path"
      >
        <Journey
          stops={roadmap.subjects.length === 0 ? FIRST_PATH : pathStops(roadmap, next)}
          continues={roadmap.subjects.length > 0}
          action={
            roadmap.subjects.length === 0 ? (
              <Button to="/onboarding" tone="lime" size="sm" trailing={<IconArrowRight size={16} />}>
                Set my goal
              </Button>
            ) : next ? (
              <Button
                tone="lime"
                size="sm"
                busy={starter.busy === next.id}
                onClick={() => void starter.start(next)}
                icon={<IconPlay size={14} />}
              >
                {next.state === 'in_progress' ? 'Carry on' : 'Start'}
              </Button>
            ) : undefined
          }
        />
      </Section>

      {roadmap.subjects.length ? (
        <Section eyebrow="By exam day" title="Your subjects" id="rm-subjects" className="rm-aside">
          <RoadmapSubjects subjects={roadmap.subjects} />
        </Section>
      ) : null}
      </div>
    </div>
  );
}

/** The path: today's items (finished ones done), what comes after, and exam day at the end. */
/** "Today", "Tomorrow", then the weekday. */
function dayLabel(day: string, today: string): string {
  const gap = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  if (gap <= 0) return 'Today';
  if (gap === 1) return 'Tomorrow';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

/** A stop's icon: a lesson is a video, so it plays; a run is the bolt (founder, 13 Nov 2026). */
function kindIcon(kind: RoadmapItem['kind']) {
  if (kind === 'checkup') return <IconTarget size={20} />;
  if (kind === 'mock') return <IconClock size={20} />;
  if (kind === 'lesson') return <IconPlay size={20} />;
  if (kind === 'topic_test') return <IconTrophy size={20} />;
  return <IconBolt size={20} />;
}

/** "Yesterday", or the weekday, for a day before today. */
function shortDay(day: string, today: string): string {
  const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 864e5);
  if (gap === 1) return 'Yesterday';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

/** How many of the last days' stops the path shows above today. */
const EARLIER_STOPS = 4;

/** Days shown on the path, and stops at most; the rest is implied by the path fading out. */
const PATH_DAYS = 3;
const PATH_STOPS = 14;

/**
 * The path, day by day: a label for each day, then its stops (a subtopic's runs on one day are
 * one stop). Only the next few days are shown; the path fades out after them, as it goes on to
 * exam day.
 */
export function pathStops(roadmap: RoadmapData, next: RoadmapItem | null): Stop[] {
  const upcoming = roadmap.items.filter((item) => item.day >= roadmap.today && item.state !== 'missed');
  const days = [...new Set(upcoming.map((item) => item.day))].sort().slice(0, PATH_DAYS);
  const stops: Stop[] = [];
  // EARLIER (founder, 13 Nov 2026): what the student did on the last days stays on the path,
  // above today, though each morning's plan is a new one. The latest few, done or started.
  const earlier = (roadmap.earlier ?? []).slice(-EARLIER_STOPS);
  if (earlier.length) {
    stops.push({ key: 'earlier', title: 'Earlier', icon: null, state: 'locked', heading: true });
    for (const item of earlier) {
      stops.push({
        key: `earlier-${item.id}`,
        title: item.kind === 'checkup' ? `${item.subject_name} check-up` : itemLabel(item),
        line: `${shortDay(item.day, roadmap.today)} · ${item.state === 'done' ? 'Done' : 'Not finished'}`,
        icon: kindIcon(item.kind),
        state: item.state === 'done' ? 'done' : 'locked',
        level: item.kind === 'run' ? (item.level ?? undefined) : undefined,
      });
    }
  }
  for (const day of days) {
    stops.push({ key: `day-${day}`, title: dayLabel(day, roadmap.today), icon: null, state: 'locked', heading: true });
    type Group = { first: RoadmapItem; items: RoadmapItem[] };
    const groups: Group[] = [];
    const bySubtopic = new Map<string, Group>();
    for (const item of upcoming.filter((i) => i.day === day)) {
      const found = item.kind === 'run' && item.subtopic_id ? bySubtopic.get(item.subtopic_id) : undefined;
      if (found) {
        found.items.push(item);
        continue;
      }
      const group = { first: item, items: [item] };
      if (item.kind === 'run' && item.subtopic_id) bySubtopic.set(item.subtopic_id, group);
      groups.push(group);
    }
    for (const { first: item, items } of groups) {
      if (stops.filter((stop) => !stop.heading).length >= PATH_STOPS) return stops;
      const done = items.every((i) => i.state === 'done');
      const holdsNext = next != null && items.some((i) => i.id === next.id);
      const level = item.level ?? undefined;
      stops.push({
        key: item.id,
        title: item.kind === 'checkup' ? `${item.subject_name} check-up` : itemLabel(item),
        line:
          item.kind === 'run'
            ? item.still_weak
              ? `Still needs work · ${item.subject_name ?? ''}`
              : (item.subject_name ?? undefined)
            : item.kind === 'lesson'
              ? (item.lesson_parts ?? 1) > 1
                ? `Lesson ${item.part ?? 1} of ${item.lesson_parts} · ${item.subtopic_name ?? item.subject_name ?? ''}`
                : `Lesson · ${item.subject_name ?? ''}`
              : item.kind === 'topic_test'
                ? `Whole topic · ${item.subject_name ?? ''}`
                : item.kind === 'checkup'
              ? 'Checkpoint'
              : item.kind === 'mock'
                ? 'The whole paper'
                : 'Topics you have covered',
        icon: kindIcon(item.kind),
        state: done ? 'done' : holdsNext ? 'current' : 'locked',
        level: item.kind === 'run' ? level : undefined,
      });
    }
  }
  return stops;
}

/** Each subject in one slim row: its score now, where the plan takes it, and its target. */
export function RoadmapSubjects({ subjects }: { subjects: RoadmapSubject[] }) {
  return (
    <ul className="rm-subjects">
      {subjects.map((subject) => (
        <SubjectLine key={subject.subject_id} subject={subject} />
      ))}
    </ul>
  );
}

function SubjectLine({ subject }: { subject: RoadmapSubject }) {
  if (!subject.measured) {
    return (
      <li className="rm-subject">
        <span className="rm-subject-name">{subject.name}</span>
        <span className="rm-subject-note">Take its check-up to plan it</span>
      </li>
    );
  }
  const now = Math.round(subject.score_now);
  const expected = Math.round(subject.expected);
  return (
    <li className="rm-subject">
      <span className="rm-subject-name">{subject.name}</span>
      <span className="rm-bar" aria-hidden="true">
        <i className="now" style={{ width: `${now}%` }} />
        <i className="gain" style={{ left: `${now}%`, width: `${Math.max(0, expected - now)}%` }} />
        {subject.target !== null ? <b style={{ left: `${Math.min(100, subject.target)}%` }} /> : null}
      </span>
      <span className="rm-subject-nums">
        {now} → <strong>{expected}</strong>
        {subject.target !== null ? <span> · target {Math.round(subject.target)}</span> : null}
      </span>
    </li>
  );
}

export function RoadmapLink() {
  return (
    <Link to="/roadmap" className="sj-link">
      Your roadmap <IconArrowRight size={14} />
    </Link>
  );
}
