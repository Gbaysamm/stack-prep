/**
 * One subject, everything about it. The hero names the subject, the goal and the one thing to do
 * next, with your score and the predicted score; below, where the score stands (the same picture
 * as home), the lowest topics beside the goal, the two ways to move the score, every topic's
 * score, and the runs done in it. Every number follows docs/student-scoring.md.
 *
 * With no goal yet the hero leads with setting one, because the target and the countdown need it.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../../student/api.js';
import { IconArrowRight, IconBolt, IconBook, IconClock, IconTarget, IconTrophy } from '../icons.js';
import { progressApi, type SubjectOverview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { PRACTICE_LOCK_WORDS, practiceLock, rememberSubject, scoreNote, useOverview } from '../SubjectSwitcher.js';
import { Button, CountUp, PageHero, Pager, Skeleton, Track, cx, usePaged } from '../ui.js';
import { MetricTip } from './HowItsWorkedOut.js';
import {
  Alert,
  HeroStats,
  Note,
  Section,
  Standing,
  WeakList,
  fmtScore,
  plural,
  shortDate,
  useStartCheckup,
  useStartPractice,
} from './Home.js';
import { useRunGate } from '../RunGate.js';
import { RunCard, TopicLegend, TopicStrengths, checkupDueWords } from './Progress.js';
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
        Tell us the score you want and when you sit {subject.subject_name}. Your predicted score is measured against it,
        and the countdown runs to that day.
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
            <span className="of sj-mono">%</span>
          </dd>
          <span className="hub-under">The score you're aiming for</span>
        </div>
        <div>
          <dt>Exam day</dt>
          <dd>
            <span className="date">{goal.exam_date ? shortDate(goal.exam_date) : 'Not set'}</span>
          </dd>
          {days !== null ? (
            <span className={cx('hub-days hub-under', days < 0 && 'past')}>
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

      {goal.minutes_per_day ? (
        <ul className="hub-plan-facts">
          <li>
            <IconClock size={16} />
            {goal.minutes_per_day} minutes a day
          </li>
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
  const sc = subject.scores ?? null;
  const due = checkupDueWords(sc);
  // Practice opens after the first check-up and waits while one is due; an open run can finish.
  const lock = practiceLock(subject);
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
          Ten questions aimed at your weakest topics. Miss one twice and the coach teaches it on the board, and any
          question you miss comes back in a later run until you get it right.
        </p>
        {lock ? <p className="hub-action-text hub-locked">{PRACTICE_LOCK_WORDS[lock]}</p> : null}
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
              {lock ? null : (
                <Button tone="ghost" busy={practice.busy !== null} onClick={() => practice.start(subject.subject_id)}>
                  Start a new run
                </Button>
              )}
            </>
          ) : (
            <Button
              busy={practice.busy !== null}
              disabled={!!lock}
              onClick={() => practice.start(subject.subject_id)}
              trailing={<IconArrowRight size={18} />}
            >
              Start practice
            </Button>
          )}
        </div>
        {lock ? null : (
          <Link className="hub-choose" to={`/practice/new?subject=${subject.subject_id}`}>
            Choose topics &amp; years
            <IconArrowRight size={14} />
          </Link>
        )}
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
            ? `Last taken ${shortDate(latest.finished_at)}, ${plural(latest.answered, 'question')}${latest.score !== null ? `: ${latest.score}%` : ''}.${due ? ` ${due}.` : ''}`
            : 'A short mixed test with no help, like the exam. Its result is your predicted score. Practice opens after it, and one is due every 7 days.'}
        </p>
        <div className="hub-action-buttons">
          {subject.open_checkup_session_id ? (
            <>
              <Button to={`/checkup/${subject.open_checkup_session_id}`} trailing={<IconArrowRight size={18} />}>
                Resume check-up
              </Button>
              {latest ? (
                <Button to={`/checkup/${latest.session_id}/report`} tone="soft" size="sm">
                  View last report
                </Button>
              ) : null}
            </>
          ) : latest && sc?.checkup_due ? (
            <>
              <Button busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
                Take your check-up
              </Button>
              <Button to={`/checkup/${latest.session_id}/report`} tone="soft" size="sm">
                View last report
              </Button>
            </>
          ) : latest ? (
            <>
              <Button to={`/checkup/${latest.session_id}/report`} tone="soft" size="sm" trailing={<IconArrowRight size={16} />}>
                View last report
              </Button>
              <Button tone="soft" size="sm" busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)}>
                Take one early
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

function Topics({ subject }: { subject: SubjectOverview }) {
  const topics = subject.scores?.topics ?? [];
  const gate = useRunGate();
  if (!topics.some((topic) => topic.answered > 0)) return null;
  const latest = subject.latest_checkup;
  // Drawn as on Progress (founder, 17 Nov 2026): each section a band that folds open.
  // The Progress page's classes (prog2, prog2-topics), so its banded sections look the same here.
  return (
    <div className="prog2 hub-prog2">
    <Section
      eyebrow="Topic by topic"
      title="How each topic stands"
      id="hub-topics"
      className="prog2-topics"
      sub="Each topic's score is the questions you got right out of those you answered there."
      tip={<MetricTip id="status" />}
    >
      <div className="sj-card prog-panel">
        <TopicLegend />
        <TopicStrengths
          topics={topics}
          subjectId={subject.subject_id}
          collapsible
          onPractise={gate.openTopic}
          tools={
            latest ? (
              <Link className="sj-link prog-tools-report" to={`/checkup/${latest.session_id}/report`}>
                Check-up report <IconArrowRight size={14} />
              </Link>
            ) : null
          }
        />
        {gate.popup}
      </div>
    </Section>
    </div>
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
  } else if (!latest || subject.scores?.checkup_due) {
    primary = (
      <Button tone="lime" size="lg" busy={checkup.busy} onClick={() => checkup.start(subject.subject_id)} trailing={<IconArrowRight size={18} />}>
        {latest ? 'Take your check-up' : 'Take a check-up'}
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
  // A run started from here stays here: held runs are said in a popup (RunGate.tsx).
  const runGate = useRunGate();
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
  const sc = subject.scores ?? null;
  const predicted = sc?.predicted ?? subject.latest_checkup?.score ?? null;

  const stats: Parameters<typeof HeroStats>[0]['stats'] = [];
  if (days !== null && days >= 0) {
    stats.push({ label: 'Days to exam', value: <CountUp value={days} />, tone: 'yellow', note: goal?.exam_date ? shortDate(goal.exam_date) : undefined, tip: 'days' });
  }
  if (sc && sc.score !== null) {
    stats.push({ label: 'Your score', value: <CountUp value={sc.score} />, unit: '%', tone: 'lime', note: scoreNote(subject), tip: 'score' });
  }
  if (predicted !== null) {
    stats.push({
      label: 'Predicted',
      value: <CountUp value={Math.round(predicted)} />,
      unit: '%',
      tone: 'white',
      note: checkupDueWords(sc) ?? 'Your last check-up',
      tip: 'predicted',
    });
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
              You're aiming for <b>{fmtScore(goal.target_score!)}%</b>
              {goal.exam_date ? (
                <>
                  {' '}
                  by <b>{shortDate(goal.exam_date)}</b>
                </>
              ) : null}
              . Here's where you stand, and what to do next.
            </>
          ) : (
            `Set your goal and take a check-up, and this page fills in with your score and every topic of ${subject.subject_name}.`
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

      <Section eyebrow="Your score" title="Where you stand" id="hub-stand" className="sj-rise d1">
        <Standing subject={subject} />
      </Section>

      <div className="hub-duo">
        <Section
          eyebrow="Work on next"
          title="Your lowest topics"
          id="hub-weak"
          className="sj-rise d2"
          tip={<MetricTip id="weakest" />}
          sub={
            <>
              A topic's score is the questions you got right out of those you answered there. <MetricTip id="topic" />
            </>
          }
        >
          <div className="sj-card hub-panel">
            {weak.length > 0 ? (
              <>
                <WeakList subject={subject} weak={weak} starter={starter} />
                <p className="home-note">Practise gives you a run on that one topic, so every question is about it.</p>
                {starter.error ? <Alert>{starter.error}</Alert> : null}
              </>
            ) : (
              <Note icon={<IconTarget size={18} />} title={subject.latest_checkup ? 'No topics to show yet' : 'Nothing to show yet'}>
                {subject.latest_checkup
                  ? 'Your topics show up here, lowest score first, as soon as you have answers in them.'
                  : 'Take a check-up and your lowest topics show up here, lowest score first.'}
              </Note>
            )}
          </div>
        </Section>

        <Section
          eyebrow="Your plan"
          title="Goal and study days"
          id="hub-plan"
          className="sj-rise d3"
          sub="The score you're aiming for, the days you said you'd study, and the countdown."
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
        <div className="prog2 hub-prog2">
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
                <Skeleton key={i} height={72} radius={10} />
              ))}
            </div>
          ) : subjectRuns.length > 0 ? (
            <>
              {/* The Progress page's run cards (founder, 17 Nov 2026). */}
              <ul className="prog2-runlist" id="hub-run-list">
                {runPage.items.map((run) => (
                  <RunCard key={run.session_id} run={run} showSubject={false} />
                ))}
              </ul>
              <Pager paged={runPage} noun="runs" label={`Pages of your ${subject.subject_name} runs`} anchorId="hub-runs" />
            </>
          ) : (
            <div className="prog2-empty">
              <span className="prog2-empty-icon" aria-hidden="true">
                <IconBolt size={20} />
              </span>
              <div>
                <b>No {subject.subject_name} runs yet</b>
                <p>Each run you do shows here, with how it went.</p>
              </div>
              <Button
                size="sm"
                busy={starter.busy !== null}
                onClick={() => runGate.startRun(() => void starter.start(subject.subject_id))}
                trailing={<IconArrowRight size={16} />}
              >
                Start a {subject.subject_name} run
              </Button>
            </div>
          )}
          {runGate.popup}
        </div>
      </Section>
    </>
  );
}

function useRuns(studentId: string) {
  return useLoad(() => progressApi.runs(studentId, 50), [studentId]);
}

/** "Use of English" → "use-of-english". */
export function subjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SubjectHub() {
  const { subjectId: param = '' } = useParams();
  const student = useStudent();
  const overview = useOverview(student.studentId);
  const catalogue = useLoad(() => api.catalogue(), []);
  const navigate = useNavigate();
  // The address is the subject's name; its id still works (old links), and the student's own
  // subjects are matched first, so "biology" is the Biology they sit.
  const bySlug = !UUID.test(param);
  const subjectId = bySlug
    ? (overview.data?.subjects.find((s) => subjectSlug(s.subject_name) === param)?.subject_id ??
      catalogue.data?.flatMap((e) => e.subjects).find((s) => subjectSlug(s.name) === param)?.subject_id ??
      '')
    : param;
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
  // An id in the address is swapped for the name, without a new history entry.
  const slug = subject ? subjectSlug(subject.subject_name) : null;
  useEffect(() => {
    if (slug && !bySlug) navigate(`/subjects/${slug}${window.location.hash}`, { replace: true });
  }, [slug, bySlug, navigate]);

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
      />
    </div>
  );
}
