/**
 * The student's own page: who they are signed in as, their record so far, the goals they have
 * set (as exam tickets, the page's signature), a little about the account, and the way out.
 * A sandbox student (no login yet) is offered a login first; signing out asks before it lets them
 * go, because without one there is no way back to the same progress.
 */

import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, type Features, type Goal } from '../../student/api.js';
import { ClaimDialog } from '../AuthForms.js';
import { mockApi, type MockSummary } from '../mockApi.js';
import { progressApi, type Overview } from '../progressApi.js';
import { IconArrowRight, IconCalendar, IconChevronRight, IconClock, IconLock, IconLogout, IconTarget } from '../icons.js';
import { useIdentity, useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, Dialog, PageHero, ShowMore, Skeleton, cx, daysUntil, initials, useShowMore, useToast } from '../ui.js';
import { MetricTip, type MetricId } from './HowItsWorkedOut.js';
import { Note, Section } from './Home.js';
import { ResultSettings } from './ResultSettings.js';
import './Profile.css';

/** Goal tickets shown before "Show all". */
const GOALS_SHOWN = 4;

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

/** A plus, drawn in the icon family's style (the shared set has none). */
function IconPlus() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GoalTicket({ goal, exam }: { goal: Goal; exam?: string }) {
  const days = daysUntil(goal.exam_date);
  const pace = rhythm(goal);
  return (
    <li>
      <Link to={`/subjects/${goal.subject_id}/goal`} className="pro-ticket" aria-label={`Edit your ${goal.subject_name} goal`}>
        <span className="pro-ticket-stub">
          <span className="label sj-mono">Target</span>
          <span className="sj-num">{goal.target_score != null ? Math.round(goal.target_score) : '–'}</span>
          <span className="of sj-mono">/100</span>
        </span>
        <span className="pro-ticket-body">
          <span className="top">
            <span className="sj-eyebrow">{exam ?? 'Exam'}</span>
            <span className="edit">
              Edit
              <IconChevronRight size={16} />
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
          </span>
          {days != null ? (
            <span className={cx('pro-ticket-days', days < 0 && 'past')}>
              {days < 0 ? 'Exam date passed' : days === 0 ? 'Exam day is today' : `${days} ${days === 1 ? 'day' : 'days'} to go`}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function Profile() {
  usePageTitle('Profile');
  const student = useStudent();
  const { signOut, sandbox } = useIdentity();
  const navigate = useNavigate();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const closeClaim = useCallback(() => setClaiming(false), []);

  const load = useLoad(
    () =>
      Promise.all([
        api.goals(student.studentId),
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
        api.features().catch(() => null as Features | null),
        mockApi.history(student.studentId).catch(() => [] as MockSummary[]),
      ]),
    [student.studentId],
  );
  const goals = (load.data?.[0] ?? []).filter((goal) => goal.target_score != null || goal.exam_date);
  const overview = load.data?.[1] ?? null;
  const features = load.data?.[2] ?? null;
  const examOf = (subjectId: string) => overview?.subjects.find((s) => s.subject_id === subjectId)?.examination_short_name;

  // Every finished mock counts in the record too: its questions, and the mock itself.
  const mocks = (load.data?.[3] ?? []).filter((mock) => mock.overall);
  const mockAnswered = mocks.reduce((sum, mock) => sum + (mock.overall?.answered ?? 0), 0);
  const answered = (overview?.subjects.reduce((sum, subject) => sum + subject.practice.questions_answered, 0) ?? 0) + mockAnswered;
  const runs = overview?.subjects.reduce((sum, subject) => sum + subject.practice.runs_finished, 0) ?? 0;
  const checkups = overview?.subjects.filter((subject) => subject.latest_checkup).length ?? 0;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(student.studentId);
      toast('Student ID copied');
    } catch {
      toast('Could not copy. Select the ID and copy it instead.');
    }
  };

  const leave = () => {
    setAsking(false);
    void signOut().then(() => navigate('/', { replace: true }));
  };

  const record: { label: string; value: number | undefined; line: string; tone: string; tip: MetricId }[] = [
    { label: 'Day streak', value: overview?.streak_days, line: 'Days in a row with at least one answer', tone: 'yellow', tip: 'streak' },
    {
      label: 'Questions answered',
      value: answered,
      line:
        runs + mocks.length === 0
          ? 'No runs or mocks finished yet'
          : `Across ${runs} ${runs === 1 ? 'run' : 'runs'} and ${mocks.length} ${mocks.length === 1 ? 'mock' : 'mocks'}`,
      tone: 'lime',
      tip: 'answered',
    },
    { label: 'Subjects checked', value: checkups, line: 'Subjects with a check-up done', tone: 'ink', tip: 'checked' },
    {
      label: 'Mock exams',
      value: mocks.length,
      line: mocks.length === 0 ? 'None sat yet' : 'Full mock exams finished',
      tone: 'pink',
      tip: 'mocks',
    },
  ];
  const moreGoals = useShowMore(goals, GOALS_SHOWN);

  return (
    <div className="sj-page pro-page">
      <PageHero
        eyebrow="Signed in as"
        title={student.displayName}
        sub={
          sandbox
            ? "No login yet, so your progress is kept on this device only."
            : `You log in with ${student.login ?? 'your email or phone number'}. Your progress follows you to any device.`
        }
        aside={
          <div className="pro-avatar" aria-hidden="true">
            {initials(student.displayName)}
          </div>
        }
      />

      {sandbox ? (
        <Note
          card
          className="pro-secure sj-rise d1"
          icon={<IconLock size={18} />}
          tone="yellow"
          title="Secure your account"
          action={
            <Button onClick={() => setClaiming(true)} trailing={<IconArrowRight size={18} />}>
              Create login
            </Button>
          }
        >
          Right now your progress lives only on this device. Add an email or phone number and a password, and you can
          pick up on any phone or laptop, even if this one is lost. Everything you've done comes with you.
        </Note>
      ) : null}

      <Section eyebrow="Your record" title="What you've done so far" id="pro-record" className="sj-rise d1">
        <dl className="sj-card pro-record">
          {record.map((stat) => (
            <div key={stat.label} className={stat.tone}>
              <dt>
                <i aria-hidden="true" />
                {stat.label}
                <MetricTip id={stat.tip} />
              </dt>
              <dd className="sj-num">{overview ? <CountUp value={stat.value ?? 0} /> : load.data ? '—' : <Skeleton height={40} width={56} />}</dd>
              <p>{stat.line}</p>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        eyebrow="Your goals"
        title="What you're aiming for"
        id="pro-goals"
        className="sj-rise d2"
      >
        {load.error && !load.data ? (
          <Note
            card
            icon={<IconTarget size={18} />}
            tone="pink"
            title="We couldn't load your goals"
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
            {[0, 1].map((key) => (
              <Skeleton key={key} height={132} radius={14} />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <Note
            card
            icon={<IconTarget size={18} />}
            tone="yellow"
            title="No goals yet"
            action={
              <Button to="/exams" trailing={<IconArrowRight size={18} />}>
                Set my first goal
              </Button>
            }
          >
            Pick a subject, the score you want and the day you sit it. Your plan then counts down to exam day with you.
          </Note>
        ) : (
          <>
          <ul className="pro-tickets" id="pro-goal-list">
            {moreGoals.items.map((goal) => (
              <GoalTicket key={goal.subject_id} goal={goal} exam={examOf(goal.subject_id)} />
            ))}
            <li>
              <Link to="/exams" className="pro-ticket-add">
                <span className="home-iconrow">
                  <span className="home-icontile" aria-hidden="true">
                    <IconPlus />
                  </span>
                  <strong className="sj-display sj-h3">Add another subject</strong>
                </span>
                <span className="txt">Set a target for each subject you sit, and each gets its own plan.</span>
              </Link>
            </li>
          </ul>
          <ShowMore more={moreGoals} noun="goals" controls="pro-goal-list" />
          </>
        )}
      </Section>

      <Section eyebrow="Mock results" title="How your scores are shown" id="pro-results" className="sj-rise d3">
        <ResultSettings studentId={student.studentId} />
      </Section>

      <Section eyebrow="Account" title="About this account" id="pro-account" className="sj-rise d3">
        <div className="sj-card pro-account">
          <dl className="pro-facts">
            <div>
              <dt>App</dt>
              <dd>Stack Prep by Stackjunior</dd>
            </div>
            <div>
              <dt>{sandbox ? 'Account' : 'Log in with'}</dt>
              <dd>{sandbox ? 'No login yet, this device only' : (student.login ?? 'Email or phone')}</dd>
            </div>
            <div>
              <dt>Coach voice</dt>
              <dd>{features ? (features.coach_voice ? 'On' : 'Off') : load.data ? 'Unknown' : <Skeleton height={14} width={40} />}</dd>
            </div>
            <div>
              <dt>
                Student ID
                <small>Lets us find your record if you ever need help.</small>
              </dt>
              <dd className="pro-idrow">
                <code className="sj-mono" title={student.studentId}>
                  {student.studentId.slice(0, 8)}…
                </code>
                <button type="button" className="pro-copy" onClick={() => void copyId()}>
                  Copy
                </button>
              </dd>
            </div>
            <div>
              <dt>
                Help & guides
                <small>How your numbers are worked out, and answers to common questions.</small>
              </dt>
              <dd>
                <Button tone="ghost" size="sm" to="/help">
                  Open help
                </Button>
              </dd>
            </div>
            <div className="out">
              <dt>
                Sign out
                <small>
                  {sandbox
                    ? "This device forgets you. With no login yet, you can't get back to this progress from here."
                    : 'Log back in any time with your email or phone number and password.'}
                </small>
              </dt>
              <dd>
                <Button
                  tone="ghost"
                  size="sm"
                  icon={<IconLogout size={16} />}
                  onClick={() => (sandbox ? setAsking(true) : leave())}
                >
                  Sign out
                </Button>
              </dd>
            </div>
          </dl>
        </div>
      </Section>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        icon={<IconLogout size={26} />}
        title="Sign out on this device?"
        actions={
          <>
            <Button
              tone="ghost"
              onClick={() => {
                setAsking(false);
                setClaiming(true);
              }}
            >
              Create a login first
            </Button>
            <Button tone="danger" onClick={leave}>
              Sign out anyway
            </Button>
          </>
        }
      >
        You have no login yet, so once you sign out this device forgets you, and you will not be able to get back
        to {student.displayName}&rsquo;s progress. Create a login first and it comes with you.
      </Dialog>
      <ClaimDialog open={claiming} onClose={closeClaim} />
    </div>
  );
}
