/**
 * The roadmap (/roadmap): what Stack Prep has planned for this student, towards their target.
 * The week day by day, each subject's line to exam day, and how closely the plan is followed.
 * Few words: the plan does the explaining (docs/plans/2026-11-10-student-roadmap.md).
 */
import { Link } from 'react-router-dom';

import { IconArrowRight, IconBolt, IconPlay, IconClock, IconTarget } from '../icons.js';
import { Journey, LEVEL_NAMES, type Stop } from '../Journey.js';
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
const PATH_LENGTH = 10;

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
        action={
          roadmap.record.last_7_days_due > 0 ? (
            <span className="rm-record">
              {roadmap.record.last_7_days_done} of {roadmap.record.last_7_days_due} done this week
            </span>
          ) : undefined
        }
      >
        <Journey
          stops={roadmap.subjects.length === 0 ? FIRST_PATH : pathStops(roadmap, next)}
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
          <ul className="rm-subjects">
            {roadmap.subjects.map((subject) => (
              <SubjectLine key={subject.subject_id} subject={subject} />
            ))}
          </ul>
        </Section>
      ) : null}
      </div>
    </div>
  );
}

/** The path: today's items (finished ones done), what comes after, and exam day at the end. */
function pathStops(roadmap: RoadmapData, next: RoadmapItem | null): Stop[] {
  const upcoming = roadmap.items.filter((item) => item.day >= roadmap.today && item.state !== 'missed');
  // One stop per subtopic: its runs this week are grouped, so the path reads as the syllabus's
  // steps rather than the same three names over and over. Check-ups, mocks and mixed runs stand
  // on their own.
  type Group = { first: RoadmapItem; items: RoadmapItem[] };
  const groups: Group[] = [];
  const bySubtopic = new Map<string, Group>();
  for (const item of upcoming) {
    if (item.kind === 'run' && item.subtopic_id) {
      const found = bySubtopic.get(item.subtopic_id);
      if (found) {
        found.items.push(item);
        continue;
      }
      const group = { first: item, items: [item] };
      bySubtopic.set(item.subtopic_id, group);
      groups.push(group);
    } else {
      groups.push({ first: item, items: [item] });
    }
  }
  const shownGroups = groups.slice(0, PATH_LENGTH);
  const stops: Stop[] = shownGroups.map(({ first: item, items }) => {
    const done = items.every((i) => i.state === 'done');
    const holdsNext = next != null && items.some((i) => i.id === next.id);
    const state: Stop['state'] = done ? 'done' : holdsNext ? 'current' : 'locked';
    const level = item.level ?? undefined;
    const left = items.filter((i) => i.state !== 'done').length;
    const runs = left > 1 ? `${left} runs` : null;
    return {
      key: item.id,
      title: item.kind === 'checkup' ? `${item.subject_name} check-up` : itemLabel(item),
      line:
        item.kind === 'run'
          ? [item.subject_name, level ? LEVEL_NAMES[level] : null, runs].filter(Boolean).join(' · ')
          : item.kind === 'checkup'
            ? 'Checkpoint'
            : item.kind === 'mock'
              ? 'The whole paper'
              : (item.subject_name ?? undefined),
      icon:
        item.kind === 'checkup' ? <IconTarget size={20} /> : item.kind === 'mock' ? <IconClock size={20} /> : <IconBolt size={20} />,
      state,
      level: item.kind === 'run' ? level : undefined,
    };
  });
  return stops;
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
