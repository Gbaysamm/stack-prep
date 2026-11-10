/**
 * The roadmap (/roadmap): what Stack Prep has planned for this student, towards their target.
 * The week day by day, each subject's line to exam day, and how closely the plan is followed.
 * Few words: the plan does the explaining (docs/plans/2026-11-10-student-roadmap.md).
 */
import { Link } from 'react-router-dom';

import { IconArrowRight, IconCheck } from '../icons.js';
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
import { Badge, Button, CountUp, PageHero, Skeleton, cx } from '../ui.js';
import { HeroStats, Section } from './Home.js';
import './Roadmap.css';

const DAY = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
/** How many of the coming items are listed. */
const UP_NEXT = 6;

function headline(roadmap: RoadmapData): string {
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
  const { items: todays, next } = today(roadmap);
  // Later days in order, without their dates: the plan re-builds as results come in, so only a
  // real deadline (a check-up, a mock) carries a date.
  const upcoming = roadmap.items.filter((item) => item.day > roadmap.today).slice(0, UP_NEXT);
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
        actions={
          next ? (
            <Button
              tone="lime"
              size="lg"
              busy={starter.busy === next.id}
              onClick={() => void starter.start(next)}
              trailing={<IconArrowRight size={18} />}
            >
              {next.state === 'in_progress' ? 'Carry on' : "Start today's plan"}
            </Button>
          ) : roadmap.status === 'no_target' ? (
            <Button to="/profile" tone="lime" size="lg">
              Set my target
            </Button>
          ) : null
        }
        aside={stats.length ? <HeroStats stats={stats} /> : undefined}
      />
      {starter.error ? <p className="rm-error">{starter.error}</p> : null}

      <Section
        eyebrow="Today"
        title={next ? "Today's plan" : 'Done for today'}
        id="rm-today"
        action={
          roadmap.record.last_7_days_due > 0 ? (
            <span className="rm-record">
              {roadmap.record.last_7_days_done} of {roadmap.record.last_7_days_due} done this week
            </span>
          ) : undefined
        }
      >
        <Items items={todays} next={next} starter={starter} today={roadmap.today} />
      </Section>

      {upcoming.length ? (
        <Section eyebrow="Up next" title="After today" id="rm-next">
          <Items items={upcoming} next={null} starter={starter} today={roadmap.today} />
        </Section>
      ) : null}

      {roadmap.subjects.length ? (
        <Section eyebrow="By exam day" title="Your subjects" id="rm-subjects">
          <ul className="rm-subjects">
            {roadmap.subjects.map((subject) => (
              <SubjectLine key={subject.subject_id} subject={subject} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Items({
  items,
  next,
  starter,
  today: todayIso,
}: {
  items: RoadmapItem[];
  next: RoadmapItem | null;
  starter: ReturnType<typeof useStartItem>;
  today: string;
}) {
  if (items.length === 0) return <p className="rm-empty">Nothing more planned today.</p>;
  return (
    <ul className="rm-items">
      {items.map((item) => {
        const deadline = (item.kind === 'checkup' || item.kind === 'mock') && item.day !== todayIso;
        return (
          <li key={item.id} className={cx('rm-item', item.state)}>
            <span className="rm-mark" aria-hidden="true">
              {item.state === 'done' ? <IconCheck size={14} /> : null}
            </span>
            <span className="rm-what">
              <b>{itemLabel(item)}</b>
              <span>
                {[
                  item.kind === 'mock' ? null : item.subject_name,
                  item.length ? `${item.length} questions` : null,
                  deadline ? `Due ${DAY.format(new Date(`${item.day}T00:00:00`))}` : null,
                  item.state === 'in_progress' ? 'Started' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {item.value === 'high' && item.state !== 'done' ? <Badge tone="green">High value</Badge> : null}
            {next && item.id === next.id ? (
              <Button size="sm" busy={starter.busy === item.id} onClick={() => void starter.start(item)}>
                {item.state === 'in_progress' ? 'Carry on' : 'Start'}
              </Button>
            ) : null}
          </li>
        );
      })}
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
