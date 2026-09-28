/**
 * One subject, everything about it. The hero names the subject, the goal and the one thing to do
 * next; below, where the score stands (the same scale as home), what is weakest beside the study
 * plan, the two ways to move the score, how each topic stands, and the runs done in it.
 *
 * With no goal yet the hero leads with setting one, because the score, the countdown and the
 * plan all need it.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, type CheckupReport } from '../../student/api.js';
import { IconArrowRight, IconBolt, IconBook, IconCalendar, IconClock, IconTarget, IconTrophy } from '../icons.js';
import { progressApi, type SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { SubjectSwitcher, rememberSubject, useOverview } from '../SubjectSwitcher.js';
import { Button, CountUp, PageHero, Pager, ShowMore, Skeleton, Track, cx, usePaged, useShowMore } from '../ui.js';
import { MetricTip } from './HowItsWorkedOut.js';
import {
  Alert,
  HeroStats,
  Note,
  RunRow,
  Section,
  Standing,
  WeakList,
  fmtScore,
  plural,
  shortDate,
  useStartCheckup,
  useStartPractice,
} from './Home.js';
import { MasteryLegend, TopicStrengths } from './Progress.js';
import './SubjectHub.css';

const WEEK = [
  { n: 1, s: 'M', l: 'Monday' },
  { n: 2, s: 'T', l: 'Tuesday' },
  { n: 3, s: 'W', l: 'Wednesday' },
  { n: 4, s: 'T', l: 'Thursday' },
  { n: 5, s: 'F', l: 'Friday' },
  { n: 6, s: 'S', l: 'Saturday' },
  { n: 0, s: 'S', l: 'Sunday' },
];

/** Study days may come as 0–6 (Sunday first) or 1–7 (Monday first); 7 means Sunday either way. */
const hasDay = (days: number[], n: number) => days.includes(n) || (n === 0 && days.includes(7));

function PlanCard({ subject }: { subject: SubjectOverview }) {
  const goal = subject.goal;
  const editTo = `/subjects/${subject.subject_id}/goal`;
  if (!goal || goal.target_score === null) {
    return (
      <Note
        card
        className="hub-plan-empty"
        icon={<IconTrophy size={18} />}
        tone="yellow"
        title="Set your goal first"
        action={
          <Button to={editTo} trailing={<IconArrowRight size={18} />}>
            Set my goal
          </Button>
        }
      >
        Tell us the score you want and when you sit {subject.subject_name}. Your predicted score, countdown and study plan
        are all worked out from it.
      </Note>
    );
  }
  const days = goal.days_to_exam;
  const studyDays = goal.study_days ?? [];
  return (
    <div className="sj-card hub-plan">
      <dl className="hub-plan-figs">
        <div>
          <dt>
            Target <MetricTip id="target" />
          </dt>
          <dd>
            <span className="sj-num">{fmtScore(goal.target_score)}</span>
            <span className="of sj-mono">/100</span>
          </dd>
        </div>
        <div>
          <dt>Exam day</dt>
          <dd>
            <span className="date">{goal.exam_date ? shortDate(goal.exam_date) : 'Not set'}</span>
          </dd>
          {days !== null ? (
            <span className={cx('hub-days', days < 0 && 'past')}>
              {days < 0 ? 'This date has passed' : days === 0 ? 'It is today' : `${plural(days, 'day')} to go`}
              {days >= 0 ? <MetricTip id="days" /> : null}
            </span>
          ) : null}
        </div>
      </dl>

      <div className="hub-plan-week">
        <span className="label sj-mono">Study days</span>
        {studyDays.length > 0 ? (
          <ul className="hub-week" aria-label="Your study days">
            {WEEK.map((d) => {
              const on = hasDay(studyDays, d.n);
              return (
                <li key={d.l} className={cx(on && 'on')} title={d.l} aria-label={`${d.l}: ${on ? 'study day' : 'rest'}`}>
                  {d.s}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hub-plan-none">No study days picked yet.</p>
        )}
      </div>

      {goal.minutes_per_day || goal.sessions_before_exam !== null ? (
        <ul className="hub-plan-facts">
          {goal.minutes_per_day ? (
            <li>
              <IconClock size={16} />
              {goal.minutes_per_day} minutes a day
            </li>
          ) : null}
          {goal.sessions_before_exam !== null ? (
            <li>
              <IconCalendar size={16} />
              <span>
                About {plural(goal.sessions_before_exam, 'study session')} left before the exam{' '}
                <MetricTip id="sessions" />
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      <Link className="sj-link hub-plan-edit" to={editTo}>
        Change my goal <IconArrowRight size={14} />
      </Link>
    </div>
  );
}

function ActionCards({ subject, openRun }: { subject: SubjectOverview; openRun?: { answered: number; length: number } }) {
  const practice = useStartPractice();
  const checkup = useStartCheckup();
  const latest = subject.latest_checkup;
  return (
    <div className="hub-actions">
      <article className="sj-card hub-action">
        <div className="home-iconrow">
          <span className="home-icontile" aria-hidden="true">
            <IconBolt size={18} />
          </span>
          <h3 className="sj-display sj-h3">Practice</h3>
        </div>
        <p className="hub-action-text">
          Ten questions aimed at your weakest spots. Miss one twice and the coach teaches it on the board.
          {!latest && !subject.open_practice_session_id ? ' Works best after a check-up, so it knows where to start.' : ''}
        </p>
        {subject.open_practice_session_id && openRun ? (
          <div className="hub-action-progress">
            <span className="sj-mono">
              Open run · {openRun.answered} of {openRun.length} answered
            </span>
            <Track value={openRun.answered} max={openRun.length} label="Open run progress" />
          </div>
        ) : null}
        <div className="hub-action-buttons">
          {subject.open_practice_session_id ? (
            <>
              <Button to={`/practice/${subject.open_practice_session_id}`} trailing={<IconArrowRight size={18} />}>
                Resume run
              </Button>
              <Button tone="ghost" busy={practice.busy !== null} onClick={() => practice.start(subject.subject_id)}>
                Start a new run
              </Button>
            </>
          ) : (
            <Button busy={practice.busy !== null} onClick={() => practice.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
              Start practice
            </Button>
          )}
        </div>
        <Link className="hub-choose" to={`/practice/new?subject=${subject.subject_id}`}>
          Choose topics &amp; years
          <IconArrowRight size={14} />
        </Link>
        {practice.error ? <Alert>{practice.error}</Alert> : null}
      </article>

      <article className="sj-card hub-action">
        <div className="home-iconrow">
          <span className="home-icontile lime" aria-hidden="true">
            <IconTarget size={18} />
          </span>
          <h3 className="sj-display sj-h3">Check-up</h3>
        </div>
        <p className="hub-action-text">
          {latest
            ? `Last taken ${shortDate(latest.finished_at)}, ${plural(latest.answered, 'question')}. Take another to see how far you've moved.`
            : 'A short set of questions that finds where you stand and predicts your score.'}
        </p>
        <div className="hub-action-buttons">
          {subject.open_checkup_session_id ? (
            <>
              <Button to={`/checkup/${subject.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
                Resume check-up
              </Button>
              {latest ? (
                <Button to={`/checkup/${latest.session_id}/report`} tone="ghost">
                  View last report
                </Button>
              ) : null}
            </>
          ) : latest ? (
            <>
              <Button to={`/checkup/${latest.session_id}/report`} tone="soft" trailing={<IconArrowRight size={18} />}>
                View last report
              </Button>
              <Button tone="ghost" busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)}>
                Take a new check-up
              </Button>
            </>
          ) : (
            <Button busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
              Take check-up
            </Button>
          )}
        </div>
        {checkup.error ? <Alert>{checkup.error}</Alert> : null}
      </article>
    </div>
  );
}

/** How many topics show before "Show all". */
const TOPICS_SHOWN = 6;

function Topics({ subject }: { subject: SubjectOverview }) {
  const latest = subject.latest_checkup;
  const report = useLoad<CheckupReport | null>(
    () => (latest ? api.report(latest.session_id) : Promise.resolve(null)),
    [latest?.session_id],
  );
  // Weakest first, the order TopicStrengths shows them in, so the cap keeps the weakest.
  const ordered = useMemo(
    () => [...(report.data?.topics ?? [])].sort((a, b) => (a.mastery ?? 2) - (b.mastery ?? 2)),
    [report.data],
  );
  const more = useShowMore(ordered, TOPICS_SHOWN);
  const shownReport = useMemo(
    () => (report.data ? { ...report.data, topics: more.items } : null),
    [report.data, more.items],
  );
  if (!latest) return null;
  return (
    <Section
      eyebrow="Topic by topic"
      title="How each topic stands"
      id="hub-topics"
      sub="From your last check-up, weakest first. Open a topic to see its parts. Striped means the check-up didn't reach it yet."
      tip={<MetricTip id="bands" />}
      action={
        <Link className="sj-link" to={`/checkup/${latest.session_id}/report`}>
          Full report <IconArrowRight size={14} />
        </Link>
      }
    >
      <div className="sj-card hub-panel">
        {report.error ? (
          <Note
            icon={<IconBook size={18} />}
            tone="pink"
            title="We couldn't load your topics"
            action={
              <Button tone="soft" onClick={report.reload}>
                Try again
              </Button>
            }
          >
            Your check-up is safe. This is just a loading hiccup.
          </Note>
        ) : !report.data ? (
          <div className="hub-skel">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={58} radius={10} />
            ))}
          </div>
        ) : (
          <>
            <MasteryLegend />
            <div id="hub-topic-list">
              <TopicStrengths report={shownReport ?? report.data} />
            </div>
            <ShowMore more={more} noun="topics" controls="hub-topic-list" className="hub-more" />
          </>
        )}
      </div>
    </Section>
  );
}

function HubSkeleton() {
  return (
    <div className="hub-skel-page" aria-busy="true" aria-label="Loading this subject">
      <Skeleton height={236} radius={18} />
      <Skeleton height={250} radius={14} />
      <div className="hub-skel-duo">
        <Skeleton height={300} radius={14} />
        <Skeleton height={300} radius={14} />
      </div>
    </div>
  );
}

/** The hero's one action for this subject, and a quieter second one. */
function useHeroActions(subject: SubjectOverview, hasGoal: boolean) {
  const practice = useStartPractice();
  const checkup = useStartCheckup();
  const latest = subject.latest_checkup;
  let primary;
  let secondary = null;
  if (subject.open_practice_session_id) {
    primary = (
      <Button to={`/practice/${subject.open_practice_session_id}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
        Resume run
      </Button>
    );
  } else if (subject.open_checkup_session_id) {
    primary = (
      <Button to={`/checkup/${subject.open_checkup_session_id}`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
        Resume check-up
      </Button>
    );
  } else if (!hasGoal) {
    primary = (
      <Button to={`/subjects/${subject.subject_id}/goal`} tone="lime" size="lg" trailing={<IconArrowRight size={18} />}>
        Set my goal
      </Button>
    );
  } else if (!latest) {
    primary = (
      <Button tone="lime" size="lg" busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
        Take a check-up
      </Button>
    );
  } else {
    primary = (
      <Button
        tone="lime"
        size="lg"
        busy={practice.busy !== null}
        onClick={() => practice.start(subject.subject_id)}
        trailing={<IconArrowRight size={18} />}
      >
        Start practice
      </Button>
    );
  }
  if (latest) {
    secondary = <Link to={`/checkup/${latest.session_id}/report`}>Read your check-up report</Link>;
  } else if (!hasGoal) {
    secondary = <Link to="/checkup">What a check-up does</Link>;
  }
  return { primary, secondary, error: practice.error ?? checkup.error };
}

function HubBody({
  subject,
  exam,
  runs,
  switcher,
}: {
  subject: SubjectOverview;
  exam?: { short_name: string; exam_body: string };
  runs: ReturnType<typeof useRuns>;
  /** The other subjects, one tap away, when there are any. */
  switcher?: ReactNode;
}) {
  const starter = useStartPractice();
  const hasGoal = !!subject.goal && subject.goal.target_score !== null;
  const hero = useHeroActions(subject, hasGoal);
  const subjectRuns = useMemo(
    () => (runs.data?.runs ?? []).filter((r) => r.subject_id === subject.subject_id),
    [runs.data, subject.subject_id],
  );
  const runPage = usePaged(subjectRuns, 5, subject.subject_id);
  const openRun = subjectRuns.find((r) => r.session_id === subject.open_practice_session_id);
  const weak = subject.latest_checkup?.weakest_subtopics ?? [];
  const goal = subject.goal;
  const days = goal?.days_to_exam ?? null;
  const now = subject.latest_checkup?.score_now ?? null;

  const stats: Parameters<typeof HeroStats>[0]['stats'] = [];
  if (days !== null && days >= 0) {
    stats.push({ label: 'Days to exam', value: <CountUp value={days} />, tone: 'yellow', note: goal?.exam_date ? shortDate(goal.exam_date) : undefined, tip: 'days' });
  }
  if (now !== null) {
    stats.push({ label: 'Predicted', value: <CountUp value={Math.round(now)} />, unit: '/100', tone: 'lime', note: 'If you sat it today', tip: 'predicted' });
  }

  return (
    <>
      <PageHero
        back={{ to: '/home', label: 'Home' }}
        eyebrow={exam ? `${exam.short_name} · ${exam.exam_body}` : subject.examination_short_name}
        title={subject.subject_name}
        sub={
          hasGoal && goal ? (
            <>
              You're aiming for <b>{fmtScore(goal.target_score!)}</b>
              {goal.exam_date ? (
                <>
                  {' '}
                  by <b>{shortDate(goal.exam_date)}</b>
                </>
              ) : null}
              . Here's where you stand, and what to do next.
            </>
          ) : (
            `Set your goal and take a check-up, and this page fills in with your predicted score and a plan for ${subject.subject_name}.`
          )
        }
        actions={
          <>
            {hero.primary}
            {hero.secondary ? <span className="home-hero-link">{hero.secondary}</span> : null}
          </>
        }
        aside={stats.length > 0 ? <HeroStats stats={stats} /> : undefined}
      />
      {hero.error ? <Alert>{hero.error}</Alert> : null}
      {switcher}

      <Section eyebrow="Predicted score" title="Where you stand" id="hub-stand" className="sj-rise d1">
        <Standing subject={subject} />
      </Section>

      <div className="hub-duo">
        <Section
          eyebrow="Work on next"
          title="Your weakest spots"
          id="hub-weak"
          className="sj-rise d2"
          tip={<MetricTip id="weakest" />}
          sub={
            <>
              Mastery is how often we think you'd get a question on it right, from your check-up answers.{' '}
              <MetricTip id="mastery" />
            </>
          }
        >
          <div className="sj-card hub-panel">
            {weak.length > 0 ? (
              <>
                <WeakList subject={subject} weak={weak} starter={starter} />
                <p className="home-note">A run starts with the spot your plan puts first, then works down the list.</p>
                {starter.error ? <Alert>{starter.error}</Alert> : null}
              </>
            ) : (
              <Note icon={<IconTarget size={18} />} title={subject.latest_checkup ? 'Nothing weak to single out' : 'Nothing to show yet'}>
                {subject.latest_checkup
                  ? 'Your check-up found nothing weak enough to single out. Keep practising to hold it.'
                  : 'Take a check-up and the spots holding your score down show up here, weakest first.'}
              </Note>
            )}
          </div>
        </Section>

        <Section
          eyebrow="Your plan"
          title="Goal and study days"
          id="hub-plan"
          className="sj-rise d3"
          sub="The days you said you'd study, and what's left before the exam."
        >
          <PlanCard subject={subject} />
        </Section>
      </div>

      <Section eyebrow="Move your score" title="Practise, or check again" id="hub-actions" className="sj-rise d3">
        <ActionCards subject={subject} openRun={openRun} />
      </Section>

      <Topics subject={subject} />

      <Section
        eyebrow="Recent practice"
        title={`Your ${subject.subject_name} runs`}
        id="hub-runs"
        className="sj-rise d4"
        action={
          subjectRuns.length > 0 ? (
            <Link className="sj-link" to="/progress">
              All runs <IconArrowRight size={14} />
            </Link>
          ) : null
        }
      >
        <div className="sj-card hub-panel">
          {runs.error && !runs.data ? (
            <Note
              icon={<IconBolt size={18} />}
              tone="pink"
              title="We couldn't load your runs"
              action={
                <Button tone="soft" size="sm" onClick={runs.reload}>
                  Try again
                </Button>
              }
            />
          ) : !runs.data ? (
            <div className="hub-skel">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={60} radius={10} />
              ))}
            </div>
          ) : subjectRuns.length > 0 ? (
            <>
              <ul className="home-runs" id="hub-run-list">
                {runPage.items.map((run) => (
                  <RunRow key={run.session_id} run={run} showSubject={false} />
                ))}
              </ul>
              <Pager paged={runPage} noun="runs" label={`Pages of your ${subject.subject_name} runs`} anchorId="hub-runs" />
            </>
          ) : (
            <Note icon={<IconBolt size={18} />} tone="lime" title={`No ${subject.subject_name} runs yet`}>
              Your first run shows up here the moment you start it, with how it went.
            </Note>
          )}
        </div>
      </Section>
    </>
  );
}

function useRuns(studentId: string) {
  return useLoad(() => progressApi.runs(studentId, 50), [studentId]);
}

export function SubjectHub() {
  const { subjectId = '' } = useParams();
  const student = useStudent();
  const overview = useOverview(student.studentId);
  const catalogue = useLoad(() => api.catalogue(), []);
  const navigate = useNavigate();
  useEffect(() => {
    if (subjectId) rememberSubject(subjectId);
  }, [subjectId]);
  const runs = useRuns(student.studentId);

  const fromOverview = overview.data?.subjects.find((s) => s.subject_id === subjectId);
  const exam = catalogue.data?.find((e) => e.subjects.some((s) => s.subject_id === subjectId));
  const offer = exam?.subjects.find((s) => s.subject_id === subjectId);

  // A subject the student has not touched yet is not in the overview; build an empty one.
  const subject: SubjectOverview | undefined =
    fromOverview ??
    (offer && exam
      ? {
          subject_id: subjectId,
          subject_name: offer.name,
          examination_short_name: exam.short_name,
          goal: null,
          latest_checkup: null,
          open_checkup_session_id: null,
          open_practice_session_id: null,
          practice: { runs_finished: 0, questions_answered: 0, correct_unaided: 0, taught: 0 },
        }
      : undefined);

  usePageTitle(subject?.subject_name ?? 'Subject');

  if (overview.error && !overview.data) {
    return (
      <div className="sj-page hub">
        <PageHero back={{ to: '/home', label: 'Home' }} eyebrow="Subject" title="Something went wrong" />
        <Note
          card
          icon={<IconBook size={18} />}
          tone="pink"
          title="We couldn't load this subject"
          action={
            <Button tone="soft" onClick={overview.reload}>
              Try again
            </Button>
          }
        >
          Check your connection and try again. Nothing you've done is lost.
        </Note>
      </div>
    );
  }

  if (!overview.data || (!fromOverview && !catalogue.data && !catalogue.error)) {
    return (
      <div className="sj-page hub">
        <HubSkeleton />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="sj-page hub">
        <PageHero back={{ to: '/home', label: 'Home' }} eyebrow="Subject" title="Subject not found" />
        <Note
          card
          icon={<IconBook size={18} />}
          title="We couldn't find that subject"
          action={
            <Button to="/exams" trailing={<IconArrowRight size={18} />}>
              Browse exams
            </Button>
          }
        >
          It may have been moved. Pick your subject again from the exams list.
        </Note>
      </div>
    );
  }

  return (
    <div className="sj-page hub">
      <HubBody
        subject={subject}
        exam={exam}
        runs={runs}
        switcher={
          fromOverview && overview.data.subjects.length > 1 ? (
            <SubjectSwitcher
              subjects={overview.data.subjects}
              value={subject.subject_id}
              onChange={(id) => navigate(`/subjects/${id}`)}
              label="Subject"
            />
          ) : undefined
        }
      />
    </div>
  );
}
