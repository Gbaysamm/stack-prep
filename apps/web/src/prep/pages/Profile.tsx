/**
 * The student's own page: who they are signed in as, their record so far, a little about the
 * account, and the way out. Goals moved to the Subjects page (founder, 17 Nov 2026).
 * A sandbox student (no login yet) is offered a login first; signing out asks before it lets them
 * go, because without one there is no way back to the same progress.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ClaimDialog } from '../AuthForms.js';
import { mockApi, type MockSummary } from '../mockApi.js';
import { progressApi, type Overview } from '../progressApi.js';
import { IconArrowRight, IconLock, IconLogout } from '../icons.js';
import { useIdentity, useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, Dialog, PageHero, Skeleton, initials, useToast } from '../ui.js';
import { MetricTip, type MetricId } from './HowItsWorkedOut.js';
import { Note, Section } from './Home.js';
import './Profile.css';

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
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
        mockApi.history(student.studentId).catch(() => [] as MockSummary[]),
      ]),
    [student.studentId],
  );
  const overview = load.data?.[0] ?? null;

  // Every finished mock counts in the record too: its questions, and the mock itself.
  const mocks = (load.data?.[1] ?? []).filter((mock) => mock.overall);
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

      <Section eyebrow="Account" title="About this account" id="pro-account" className="sj-rise d3">
        <div className="sj-card pro-account">
          <dl className="pro-facts">
            <div>
              <dt>{sandbox ? 'Account' : 'Log in with'}</dt>
              <dd>{sandbox ? 'No login yet, this device only' : (student.login ?? 'Email or phone')}</dd>
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
                Account settings
                <small>Your school and aim, how mock results are shown, your login and password.</small>
              </dt>
              <dd>
                <Button tone="ghost" size="sm" to="/settings">
                  Open settings
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
