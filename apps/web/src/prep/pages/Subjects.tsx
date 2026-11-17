/**
 * /subjects — the student's subjects, one tap from each one's page (founder, 17 Nov 2026).
 * Each subject is an exam ticket (moved here from Profile, which the founder liked): the
 * target on a torn-off stub, then the subject, its exam day and study time, its score now and
 * the days to go. The ticket opens the subject; Edit opens its goal; Swap (not on the
 * compulsory subject, which comes first) puts another subject in its place.
 */

import { Link } from 'react-router-dom';

import type { ExaminationOffer, Goal } from '../../student/api.js';
import { api } from '../../student/api.js';
import { IconArrowRight, IconCalendar, IconChart, IconChevronRight, IconClock, IconReplay, IconTarget } from '../icons.js';
import { useSwap } from '../swap.js';
import { progressApi, type Overview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Skeleton, cx, daysUntil } from '../ui.js';
import { HeroStats, Note, Section } from './Home.js';
import './Profile.css';
import './Subjects.css';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function rhythm(goal: Goal): string | null {
  if (!goal.minutes_per_day) return null;
  const days = [...(goal.study_days ?? [])].sort((a, b) => a - b);
  const when =
    days.length === 7 || days.length === 0
      ? 'every day'
      : days.join() === '1,2,3,4,5'
        ? 'weekdays'
        : days.length >= 3 && days.every((n, i) => i === 0 || n === days[i - 1]! + 1)
          ? `${DAY_SHORT[days[0]! - 1]} to ${DAY_SHORT[days[days.length - 1]! - 1]}`
          : days.map((n) => DAY_SHORT[n - 1]).join(', ');
  return `${goal.minutes_per_day} min, ${when}`;
}

function longDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SubjectTicket({
  goal,
  exam,
  score,
  compulsory,
  onSwap,
}: {
  goal: Goal;
  exam?: string;
  score: number | null;
  compulsory: boolean;
  onSwap: () => void;
}) {
  const days = daysUntil(goal.exam_date);
  const pace = rhythm(goal);
  const target = goal.target_score != null ? Math.round(goal.target_score) : null;
  return (
    <li>
      <div className="pro-ticket sb3-ticket">
        {/* The whole ticket opens the subject; Edit sits above it and opens the goal. */}
        <Link to={`/subjects/${goal.subject_id}`} className="sb3-cover" aria-label={`Open ${goal.subject_name}`} />
        <span className="pro-ticket-stub">
          <span className="label sj-mono">Target</span>
          <span className="sj-num">{target ?? '–'}</span>
          <span className="of sj-mono">/100</span>
        </span>
        <span className="pro-ticket-body">
          <span className="top">
            <span className="sj-eyebrow">{exam ?? 'Exam'}</span>
            <span className="sb3-acts">
              {compulsory ? (
                <span className="sb3-compulsory">Compulsory</span>
              ) : (
                <button type="button" className="edit sb3-edit" onClick={onSwap}>
                  <IconReplay size={14} />
                  Swap
                </button>
              )}
              <Link to={`/subjects/${goal.subject_id}/goal`} className="edit sb3-edit" aria-label={`Edit your ${goal.subject_name} goal`}>
                Edit
                <IconChevronRight size={16} />
              </Link>
            </span>
          </span>
          <strong className="sj-display">{goal.subject_name}</strong>
          <span className="pro-ticket-meta">
            {goal.exam_date ? (
              <span>
                <IconCalendar size={15} />
                {longDate(goal.exam_date)}
              </span>
            ) : null}
            {pace ? (
              <span>
                <IconClock size={15} />
                {pace}
              </span>
            ) : null}
            <span>
              <IconChart size={15} />
              Score now <b className="sb3-score">{score !== null ? `${score}%` : '—'}</b>
              {score !== null && target !== null && target - score > 0 ? ` · ${target - score} to go` : ''}
            </span>
          </span>
          {days != null ? (
            <span className={cx('pro-ticket-days', days < 0 && 'past')}>
              {days < 0 ? 'Exam date passed' : days === 0 ? 'Exam day is today' : `${days} ${days === 1 ? 'day' : 'days'} to go`}
            </span>
          ) : null}
        </span>
      </div>
    </li>
  );
}

export function Subjects() {
  usePageTitle('Subjects');
  const student = useStudent();
  const load = useLoad(
    () =>
      Promise.all([
        api.goals(student.studentId),
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
        api.catalogue().catch(() => [] as ExaminationOffer[]),
      ]),
    [student.studentId],
  );
  const catalogue = load.data?.[2] ?? [];
  const isCompulsory = (id: string) =>
    catalogue.some((e) => e.subjects.some((s) => s.subject_id === id && s.compulsory));
  // The compulsory subject first (Use of English), then the rest by name.
  const goals = (load.data?.[0] ?? [])
    .filter((goal) => goal.target_score != null || goal.exam_date)
    .sort(
      (a, b) =>
        Number(isCompulsory(b.subject_id)) - Number(isCompulsory(a.subject_id)) ||
        a.subject_name.localeCompare(b.subject_name),
    );
  const overview = load.data?.[1] ?? null;
  const swapper = useSwap(catalogue, load.data?.[0] ?? [], load.reload);
  const subjectOf = (id: string) => overview?.subjects.find((s) => s.subject_id === id);
  const exam = goals[0]?.examination_short_name ?? '';
  const scores = goals.map((g) => subjectOf(g.subject_id)?.scores?.score ?? null);
  const allScored = goals.length > 0 && scores.every((s) => s !== null);
  const total = scores.reduce<number>((n, s) => n + (s ?? 0), 0);
  const targets = goals.reduce((n, g) => n + Math.round(g.target_score ?? 0), 0);

  return (
    <div className="sj-page sb2">
      <PageHero
        eyebrow="Your subjects"
        title={goals.length > 0 ? `${goals.length} ${goals.length === 1 ? 'subject' : 'subjects'}${exam ? ` for ${exam}` : ''}` : 'Your subjects'}
        sub="Tap a subject for its topics, lessons and runs. Swap puts another subject in its place; Edit changes its target and study time."
        aside={
          allScored ? (
            <HeroStats
              stats={[
                {
                  label: 'Your score now',
                  value: total,
                  unit: `/ ${goals.length * 100}`,
                  tone: 'lime',
                  note: targets > 0 ? `Target ${targets}` : undefined,
                },
              ]}
            />
          ) : undefined
        }
      />

      <Section eyebrow="Your goals" title="What you're aiming for" id="sb3-title">
        {load.error && !load.data ? (
          <Note
            card
            icon={<IconReplay size={18} />}
            tone="pink"
            title="We couldn't load your subjects"
            action={
              <Button tone="soft" onClick={load.reload}>
                Try again
              </Button>
            }
          >
            Your goals are safe. This is just a loading hiccup.
          </Note>
        ) : !load.data ? (
          <div className="pro-tickets">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} height={150} radius={14} />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <Note
            card
            icon={<IconTarget size={18} />}
            tone="yellow"
            title="No subjects yet"
            action={
              <Button to="/exams" trailing={<IconArrowRight size={18} />}>
                Choose your subjects
              </Button>
            }
          >
            Pick your subjects, the score you want and the day you sit. Your plan then counts down to exam day with you.
          </Note>
        ) : (
          <ul className="pro-tickets">
            {goals.map((goal, i) => (
              <SubjectTicket
                key={goal.subject_id}
                goal={goal}
                exam={subjectOf(goal.subject_id)?.examination_short_name}
                score={scores[i] ?? null}
                compulsory={isCompulsory(goal.subject_id)}
                onSwap={() => swapper.start(goal.subject_id)}
              />
            ))}
          </ul>
        )}
      </Section>
      {swapper.dialog}
    </div>
  );
}
