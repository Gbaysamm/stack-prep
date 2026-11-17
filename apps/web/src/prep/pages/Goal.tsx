/**
 * Setting a goal for one subject: four short steps on one page — the score, the date, the
 * rhythm, and a look over it before it is saved. A goal is what turns a check-up into a plan,
 * so a subject without a finished check-up goes straight on to one afterwards.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api, type ExaminationOffer, type Goal as GoalRow } from '../../student/api.js';
import { listNames } from '../countdown.js';
import { progressApi, type Overview } from '../progressApi.js';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconCalendar,
  IconCheck,
  IconClock,
  IconReplay,
  IconTarget,
} from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, Dialog, PageHero, Steps, cx, daysUntil, useToast, PageSkeleton } from '../ui.js';
import { DatePicker } from '../../lib/DatePicker.js';
import { StudyMinutes } from '../StudyMinutes.js';
import { leastTime, type LeastTime } from '../studyTime.js';
import './Goal.css';
import { friendly } from '../../lib/friendlyError.js';

const STEPS = [
  { key: 'score', label: 'Target score', icon: IconTarget },
  { key: 'date', label: 'Exam date', icon: IconCalendar },
  { key: 'rhythm', label: 'Study rhythm', icon: IconClock },
  { key: 'review', label: 'Review', icon: IconCheck },
] as const;

const SCORE_CHIPS = [60, 70, 80, 90];
const DAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
];

/** A date as the yyyy-mm-dd a date input speaks, in the student's own time zone. */
function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function monthsFromToday(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return isoDay(date);
}
function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function dayMonth(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
/** "about 7 in every 10", or "7 or 8" when the score sits between two. */
function perTen(target: number): string {
  if (target >= 97) return 'almost every question';
  if (target < 8) return 'very few questions';
  const exact = target / 10;
  const low = Math.floor(exact);
  const frac = exact - low;
  if (frac >= 0.3 && frac <= 0.7) return `about ${low} or ${low + 1} in every 10 questions`;
  return `about ${Math.round(exact)} in every 10 questions`;
}
function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
function daysText(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'every day';
  if (sorted.join() === '1,2,3,4,5') return 'weekdays';
  if (sorted.join() === '6,7') return 'weekends';
  const run = sorted.length >= 3 && sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  if (run) return `${DAYS[sorted[0]! - 1]?.short} to ${DAYS[sorted[sorted.length - 1]! - 1]?.short}`;
  return sorted.map((n) => DAYS[n - 1]?.short).join(', ');
}

/** A left-aligned message card: icon and title on one line, the words and the button beneath. */
function GoalNote({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sj-card goal-note">
      <div className="goal-note-head">
        <span className="goal-ico" aria-hidden="true">
          {icon}
        </span>
        <h3 className="sj-display sj-h3">{title}</h3>
      </div>
      {children ? <p>{children}</p> : null}
      {action ? <div className="goal-note-actions">{action}</div> : null}
    </div>
  );
}

/** The hero's number: the target, live as the student sets it. */
function TargetStat({ target, away }: { target: number; away: number | null }) {
  return (
    <div className="goal-stat" aria-live="polite">
      <span className="goal-stat-label">Your target</span>
      <span className="goal-stat-num">
        <span className="sj-num">{target}</span>
        <span className="unit sj-mono">/100</span>
      </span>
      <span className="goal-stat-note">
        {away != null && away > 0 ? `${away} ${away === 1 ? 'day' : 'days'} to exam day` : 'Pick your exam day next'}
      </span>
    </div>
  );
}

export function Goal() {
  const { subjectId = '' } = useParams();
  const student = useStudent();
  const load = useLoad(
    () =>
      Promise.all([
        api.catalogue(),
        api.goals(student.studentId),
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
      ]),
    [student.studentId, subjectId],
  );

  const exam = load.data?.[0].find((item) => item.subjects.some((subject) => subject.subject_id === subjectId));
  const subject = exam?.subjects.find((item) => item.subject_id === subjectId);
  const existing = load.data?.[1].find((goal) => goal.subject_id === subjectId);
  const subjectOverview = load.data?.[2]?.subjects.find((item) => item.subject_id === subjectId);
  usePageTitle(subject ? `Goal · ${subject.name}` : 'Your goal');

  if (load.error && !load.data) {
    return (
      <div className="sj-page goal-page">
        <PageHero back={{ to: '/exams', label: 'Subjects' }} eyebrow="Goal" title="Your goal" />
        <GoalNote
          icon={<IconReplay size={18} />}
          title="We could not load your goal"
          action={
            <Button tone="soft" onClick={load.reload}>
              Try again
            </Button>
          }
        >
          {load.error}
        </GoalNote>
      </div>
    );
  }
  if (!load.data) return <GoalSkeleton />;
  if (!exam || !subject) {
    return (
      <div className="sj-page goal-page">
        <PageHero back={{ to: '/exams', label: 'Exams' }} eyebrow="Goal" title="Your goal" />
        <GoalNote
          icon={<IconBook size={18} />}
          title="We could not find that subject"
          action={
            <Button to="/exams" tone="soft">
              Choose a subject
            </Button>
          }
        >
          The link may be out of date. Pick your subject again.
        </GoalNote>
      </div>
    );
  }

  return (
    <GoalStepper
      key={subjectId}
      subjectId={subjectId}
      subjectName={subject.name}
      examLabel={exam.short_name.toUpperCase() === 'SANDBOX' ? 'Practice set' : exam.short_name}
      examId={exam.examination_id}
      exam={exam}
      goals={load.data[1]}
      onChanged={load.reload}
      existing={existing}
      finishedCheckup={Boolean(subjectOverview?.latest_checkup)}
      openCheckupId={subjectOverview?.open_checkup_session_id ?? null}
    />
  );
}

function GoalStepper({
  subjectId,
  subjectName,
  examLabel,
  examId,
  exam,
  goals,
  onChanged,
  existing,
  finishedCheckup,
  openCheckupId,
}: {
  subjectId: string;
  subjectName: string;
  examLabel: string;
  examId: string;
  exam: ExaminationOffer;
  goals: GoalRow[];
  onChanged: () => void;
  existing: GoalRow | undefined;
  finishedCheckup: boolean;
  openCheckupId: string | null;
}) {
  const student = useStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const hadGoal = Boolean(existing?.target_score != null && existing?.exam_date);
  // How the exam is sat decides whose date this is: the whole exam's (UTME), or this paper's.
  const together = exam.sits_together;
  const siblings = goals.filter((goal) => goal.examination_id === exam.examination_id && goal.subject_id !== subjectId);
  const sharedDate = together ? (siblings.find((goal) => goal.exam_date)?.exam_date?.slice(0, 10) ?? '') : '';
  const full = !existing && exam.max_subjects != null && siblings.length >= exam.max_subjects;

  // Development only: `?step=0..3` opens on a step and `?step=4` on the saved moment, for screenshots.
  const devStep = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('step') ?? NaN) : NaN;
  const [step, setStep] = useState(devStep >= 0 && devStep <= 3 ? devStep : 0);
  const [reached, setReached] = useState(hadGoal ? 3 : Number.isNaN(devStep) ? 0 : Math.min(devStep, 3));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [target, setTarget] = useState(() => Math.round(existing?.target_score ?? 70));
  const [examDate, setExamDate] = useState(existing?.exam_date?.slice(0, 10) ?? sharedDate);
  const [minutes, setMinutes] = useState(existing?.minutes_per_day ?? 45);
  const [days, setDays] = useState<number[]>(existing?.study_days?.length ? existing.study_days : [1, 2, 3, 4, 5]);
  const [issue, setIssue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<GoalRow | null>(devStep === 4 && existing ? existing : null);
  const [starting, setStarting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step, saved]);

  const tomorrow = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return isoDay(date);
  })();
  const away = daysUntil(examDate);
  // The study time is shared by every subject of this exam, so the least time a day counts
  // all of their topics, each before its own exam day (studyTime.ts).
  const topicsOf = (id: string) => exam.subjects.find((s) => s.subject_id === id)?.teachable_topics ?? 0;
  const least = leastTime(
    [
      { topics: topicsOf(subjectId), date: examDate },
      ...siblings.map((goal) => ({
        topics: topicsOf(goal.subject_id),
        date: together ? examDate : (goal.exam_date?.slice(0, 10) ?? ''),
      })),
    ],
    days,
  );

  const problem = (index: number): string | null => {
    if (index === 0 && (!Number.isFinite(target) || target < 1 || target > 100)) return 'Pick a score between 1 and 100.';
    if (index === 1) {
      if (!examDate) return 'Pick the day of your exam. A best guess is fine; you can change it later.';
      if (away === null || away < 1) return 'Pick a date after today.';
    }
    if (index === 2) {
      if (days.length === 0) return 'Pick at least one day you can study.';
      if (!minutes || minutes < 5) return 'Pick how long you can study on each of those days.';
      if (least && minutes < least.minutes) return `Pick at least ${least.minutes} minutes a day.`;
    }
    return null;
  };

  const go = (next: number) => {
    if (next > step) {
      for (let index = step; index < next; index += 1) {
        const found = problem(index);
        if (found) {
          setDirection(1);
          setStep(index);
          setIssue(found);
          return;
        }
      }
    }
    setIssue(null);
    setDirection(next > step ? 1 : -1);
    setStep(next);
    setReached((current) => Math.max(current, next));
  };

  const save = async () => {
    for (let index = 0; index < 3; index += 1) {
      const found = problem(index);
      if (found) {
        go(index);
        setIssue(found);
        return;
      }
    }
    setSaving(true);
    setIssue(null);
    try {
      const result = await api.setGoal(student.studentId, subjectId, {
        target_score: target,
        exam_date: examDate,
        minutes_per_day: minutes,
        study_days: [...days].sort((a, b) => a - b),
      });
      const sessions = result.sessions_before_exam;
      const moved = together && siblings.length > 0 && examDate !== sharedDate;
      const also = moved ? ` Your ${examLabel} date is changed for ${listNames(siblings.map((goal) => goal.subject_name))} too.` : '';
      if (finishedCheckup) {
        toast(sessions != null ? `Goal saved. About ${sessions} study sessions before your exam.${also}` : `Goal saved.${also}`);
        navigate(`/subjects/${subjectId}`);
      } else {
        toast(`Goal saved.${also}`);
        setSaved(result);
      }
    } catch (error) {
      setIssue(friendly(error) || 'We could not save your goal. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const startCheckup = async () => {
    if (openCheckupId) {
      navigate(`/checkup/${openCheckupId}`);
      return;
    }
    setStarting(true);
    setIssue(null);
    try {
      const state = await api.start(student.studentId, subjectId);
      navigate(`/checkup/${state.session_id}`);
    } catch (error) {
      setIssue(friendly(error) || 'We could not start your check-up. Try again.');
      setStarting(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 3) go(step + 1);
    else void save();
  };

  const toggleDay = (n: number) => {
    setIssue(null);
    setDays((current) => (current.includes(n) ? current.filter((d) => d !== n) : [...current, n].sort((a, b) => a - b)));
  };

  const values: ReactNode[] = [
    <>{target} / 100</>,
    examDate && away != null && away > 0 ? <>{shortDate(examDate)}</> : null,
    days.length ? (
      <>
        {minutes} min · {daysText(days)}
      </>
    ) : null,
    null,
  ];
  const back = hadGoal ? { to: `/subjects/${subjectId}`, label: subjectName } : { to: '/exams', label: 'Exams & subjects' };

  /* -------------------------------------------------------------- saved: the next step */
  if (saved) {
    return (
      <div className="sj-page goal-page">
        <PageHero
          eyebrow={`Goal saved · ${subjectName}`}
          title="Next: your check-up"
          sub={`A short set of questions finds where you stand now, so your practice starts at the right step and we can predict your score against your target of ${target}.`}
          actions={
            <>
              <Button tone="lime" size="lg" busy={starting} onClick={() => void startCheckup()} trailing={starting ? undefined : <IconArrowRight size={18} />}>
                {openCheckupId ? 'Continue my check-up' : 'Start my check-up'}
              </Button>
              <Button size="lg" tone="ghost" to={`/subjects/${subjectId}`}>
                Later
              </Button>
            </>
          }
        />
        {issue ? (
          <p className="goal-issue goal-issue-top" role="alert">
            {issue}
          </p>
        ) : null}
        <section className="goal-saved" aria-labelledby="goal-saved-title">
          <div className="goal-sechead">
            <div className="sj-eyebrow">Your goal</div>
            <h2 id="goal-saved-title" className="sj-display sj-h2" tabIndex={-1} ref={heading}>
              What you signed up for
            </h2>
          </div>
          <div className="goal-next-facts">
            <div className="sj-rise d1">
              <span className="sj-eyebrow">Target</span>
              <span className="sj-num">
                <CountUp value={target} />
              </span>
              <span className="goal-fact-note">Getting {perTen(target)} right</span>
            </div>
            {away != null && away > 0 ? (
              <div className="sj-rise d2">
                <span className="sj-eyebrow">Exam day</span>
                <span className="sj-num">
                  <CountUp value={away} />
                </span>
                <span className="goal-fact-note">
                  {away === 1 ? 'day to go' : 'days to go'}, on {shortDate(examDate)}
                </span>
              </div>
            ) : null}
            {saved.sessions_before_exam != null ? (
              <div className="sj-rise d3">
                <span className="sj-eyebrow">Study sessions</span>
                <span className="sj-num">
                  <CountUp value={saved.sessions_before_exam} />
                </span>
                <span className="goal-fact-note">
                  {minutes}-minute sessions, {daysText(days)}, before your exam
                </span>
              </div>
            ) : null}
          </div>
          <p className="goal-next-note sj-small sj-muted">No pass or fail in the check-up. You can stop and come back to it; it saves as you go.</p>
        </section>
      </div>
    );
  }

  /* -------------------------------------------------------------- the exam is full */
  if (full) {
    return (
      <div className="sj-page goal-page">
        <PageHero back={back} eyebrow={`${examLabel} · ${subjectName}`} title="Set your goal" />
        <FullExam exam={exam} examLabel={examLabel} subjectName={subjectName} siblings={siblings} onChanged={onChanged} />
      </div>
    );
  }

  /* -------------------------------------------------------------- the stepper */
  const StepIcon = STEPS[step]!.icon;
  const dateWord = together ? `${examLabel} date` : 'Paper date';
  return (
    <div className="sj-page goal-page">
      <PageHero
        back={back}
        eyebrow={`${examLabel} · ${subjectName}`}
        title={hadGoal ? 'Change your goal' : 'Set your goal'}
        sub="Four quick steps. Your goal turns practice into a plan that counts down to exam day."
        aside={<TargetStat target={target} away={away} />}
      />

      <div className="goal-layout">
        <nav className="goal-rail sj-card sj-rise" aria-label="Goal steps">
          <div className="sj-eyebrow goal-rail-eyebrow">Your steps</div>
          <ol className="goal-steps">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const state = index === step ? 'current' : index <= reached ? 'done' : 'todo';
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className={cx('goal-stepbtn', state)}
                    onClick={() => go(index)}
                    disabled={index > reached && index !== step + 1}
                    aria-current={index === step ? 'step' : undefined}
                  >
                    <span className="goal-steprow">
                      <span className="goal-stepdot">
                        {state === 'done' && index !== step ? <IconCheck size={16} /> : <Icon size={16} />}
                      </span>
                      <span className="goal-steplabel">
                        <span className="sj-mono">0{index + 1}</span>
                        {item.key === 'date' ? dateWord : item.label}
                      </span>
                    </span>
                    {values[index] && index <= reached ? <span className="goal-stepvalue">{values[index]}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <form className="goal-stage sj-rise d1" onSubmit={onSubmit} noValidate>
          <div className="goal-progress" aria-hidden="true">
            {STEPS.map((item, index) => (
              <span key={item.key} className={cx(index < step && 'done', index === step && 'on')} />
            ))}
          </div>

          <div className="goal-stagehead">
            <div className="sj-eyebrow">
              Step {step + 1} of {STEPS.length}
            </div>
            <div className="goal-stagerow">
              <span className="goal-stageicon" aria-hidden="true">
                <StepIcon size={18} />
              </span>
              <h2 className="sj-display sj-h2 goal-stagetitle" tabIndex={-1} ref={heading}>
                {step === 0 && `What score are you aiming for?`}
                {step === 1 && (together ? `When is your ${examLabel}?` : `When is your ${subjectName} paper?`)}
                {step === 2 && 'How much can you study?'}
                {step === 3 && 'Here is your goal'}
              </h2>
            </div>
          </div>

          <div key={step} className={cx('goal-body', direction > 0 ? 'fwd' : 'bwd')}>
            {step === 0 ? (
              <ScoreStep
                target={target}
                setTarget={(value) => {
                  setIssue(null);
                  setTarget(value);
                }}
              />
            ) : null}
            {step === 1 ? (
              <DateStep
                label={dateWord}
                together={together}
                examLabel={examLabel}
                siblings={siblings}
                examDate={examDate}
                setExamDate={(value) => {
                  setIssue(null);
                  setExamDate(value);
                }}
                tomorrow={tomorrow}
                away={away}
                invalid={Boolean(issue)}
              />
            ) : null}
            {step === 2 ? (
              <RhythmStep
                least={least}
                minutes={minutes}
                setMinutes={(value) => {
                  setIssue(null);
                  setMinutes(value);
                }}
                days={days}
                toggleDay={toggleDay}
              />
            ) : null}
            {step === 3 ? (
              <ReviewStep
                dateLabel={dateWord}
                sharedWith={together ? siblings.map((goal) => goal.subject_name) : []}
                target={target}
                examDate={examDate}
                away={away}
                minutes={minutes}
                days={days}
                finishedCheckup={finishedCheckup}
                onEdit={go}
              />
            ) : null}
          </div>

          {issue ? (
            <p className="goal-issue" role="alert">
              {issue}
            </p>
          ) : null}

          <div className="goal-actions">
            {step > 0 ? (
              <Button tone="ghost" onClick={() => go(step - 1)} icon={<IconArrowLeft size={18} />}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <Button type="submit" trailing={<IconArrowRight size={18} />}>
                Next
              </Button>
            ) : (
              <Button type="submit" tone="lime" busy={saving} trailing={saving ? undefined : <IconCheck size={18} />}>
                {saving ? 'Saving…' : hadGoal ? 'Save changes' : 'Save my goal'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 1: score */

function ScoreStep({ target, setTarget }: { target: number; setTarget: (value: number) => void }) {
  const sliderId = useId();
  const clamp = (value: number) => Math.max(1, Math.min(100, Math.round(value)));
  return (
    <div className="goal-score">
      <div className="goal-dial">
        <button type="button" className="goal-nudge" onClick={() => setTarget(clamp(target - 1))} aria-label="One less" disabled={target <= 1}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <output className="goal-bignum" htmlFor={sliderId} aria-live="polite">
          <span className="sj-num">{target}</span>
          <span className="goal-outof sj-mono">/100</span>
        </output>
        <button type="button" className="goal-nudge" onClick={() => setTarget(clamp(target + 1))} aria-label="One more" disabled={target >= 100}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <input
        id={sliderId}
        type="range"
        min={1}
        max={100}
        step={1}
        value={target}
        onChange={(event) => setTarget(clamp(Number(event.target.value)))}
        className="goal-range"
        style={{ '--pct': `${((target - 1) / 99) * 100}%` } as CSSProperties}
        aria-label="Target score out of 100"
        aria-valuetext={`${target} out of 100`}
      />
      <div className="goal-ticks sj-mono" aria-hidden="true">
        {[1, 25, 50, 75, 100].map((value) => (
          <span key={value} style={{ '--at': (value - 1) / 99 } as CSSProperties}>
            {value}
          </span>
        ))}
      </div>

      <div className="goal-chips" role="group" aria-label="Quick picks">
        {SCORE_CHIPS.map((value) => (
          <button key={value} type="button" className="sj-chip" aria-pressed={target === value} onClick={() => setTarget(value)}>
            {value}
          </button>
        ))}
      </div>

      <p className="goal-meaning">
        <b>{target} out of 100</b> means getting {perTen(target)} right on the day.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ step 2: date */

function DateStep({
  label,
  together,
  examLabel,
  siblings,
  examDate,
  setExamDate,
  tomorrow,
  away,
  invalid,
}: {
  label: string;
  together: boolean;
  examLabel: string;
  siblings: GoalRow[];
  examDate: string;
  setExamDate: (value: string) => void;
  tomorrow: string;
  away: number | null;
  invalid: boolean;
}) {
  const inputId = useId();
  const quick = [1, 2, 3].map((months) => ({ months, iso: monthsFromToday(months) }));
  const good = examDate && away != null && away > 0;
  // Per paper: the other papers' days, so two papers on one day take one tap.
  const sameDays = new Map<string, string[]>();
  if (!together) {
    for (const goal of siblings) {
      const day = goal.exam_date?.slice(0, 10);
      if (day && (daysUntil(day) ?? 0) > 0) sameDays.set(day, [...(sameDays.get(day) ?? []), goal.subject_name]);
    }
  }
  const others = listNames(siblings.map((goal) => goal.subject_name));
  return (
    <div className="goal-date">
      <div className="goal-date-grid">
        <div className="goal-date-pick">
          <label className="goal-label" htmlFor={inputId}>
            {label}
          </label>
          <DatePicker
            className="goal-dateinput"
            id={inputId}
            value={examDate}
            min={tomorrow}
            onChange={(iso) => setExamDate(iso)}
            invalid={invalid}
          />
          <div className="goal-chips" role="group" aria-label="Quick picks">
            {quick.map(({ months, iso }) => (
              <button key={months} type="button" className="sj-chip" aria-pressed={examDate === iso} onClick={() => setExamDate(iso)}>
                In {months} {months === 1 ? 'month' : 'months'}
              </button>
            ))}
          </div>
          {sameDays.size ? (
            <div className="goal-sameday" role="group" aria-label="Same day as another paper">
              {[...sameDays].map(([day, names]) => (
                <button key={day} type="button" className="sj-chip" aria-pressed={examDate === day} onClick={() => setExamDate(day)}>
                  Same day as {listNames(names)} · {dayMonth(day)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="goal-shared">
            <IconCalendar size={16} aria-hidden="true" />
            {together ? (
              <span>
                <b>One date for all of {examLabel}.</b>{' '}
                {siblings.length
                  ? `Your subjects are sat together on one day, so changing it here changes it for ${others} too.`
                  : 'Every subject is sat together on one day, so each subject you add shares this date.'}
              </span>
            ) : (
              <span>
                <b>Each paper has its own day.</b> Your countdown is to the nearest paper still to come.
              </span>
            )}
          </p>
          <p className="goal-help">Not sure of the exact day yet? Pick your best guess. You can change it any time.</p>
        </div>

        <div className={cx('goal-countdown', good && 'on')} aria-live="polite">
          {good ? (
            <>
              <span className="sj-eyebrow">Counting down</span>
              <span className="sj-num goal-countnum">
                <CountUp value={away!} duration={600} />
              </span>
              <span className="goal-countlabel">{away === 1 ? 'day to go' : 'days to go'}</span>
              <span className="goal-countdate">{longDate(examDate)}</span>
            </>
          ) : (
            <>
              <span className="sj-eyebrow">Counting down</span>
              <span className="sj-num goal-countnum dim">–</span>
              <span className="goal-countlabel">Pick a day to start the clock</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 3: rhythm */

function RhythmStep({
  least,
  minutes,
  setMinutes,
  days,
  toggleDay,
}: {
  least: LeastTime | null;
  minutes: number;
  setMinutes: (value: number) => void;
  days: number[];
  toggleDay: (n: number) => void;
}) {
  const weekly = minutes * days.length;
  return (
    <div className="goal-rhythm">
      <div className="goal-block">
        <div className="goal-label" id="goal-minutes-label">
          On a study day, you can give
        </div>
        <StudyMinutes value={minutes} onChange={setMinutes} least={least} labelledBy="goal-minutes-label" />
      </div>

      <div className="goal-block">
        <div className="goal-blockhead">
          <div className="goal-label" id="goal-days-label">
            On these days
          </div>
        </div>
        <div className="goal-days" role="group" aria-labelledby="goal-days-label">
          {DAYS.map((day) => {
            const on = days.includes(day.n);
            return (
              <button
                key={day.n}
                type="button"
                className={cx('goal-day', on && 'on', day.n > 5 && 'weekend')}
                aria-pressed={on}
                aria-label={day.long}
                onClick={() => toggleDay(day.n)}
              >
                <span className="goal-day-name">{day.short}</span>
                <span className="goal-day-tick" aria-hidden="true">
                  {on ? <IconCheck size={14} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="goal-weekly" aria-live="polite">
        <IconClock size={18} />
        {days.length ? (
          <span>
            That is <b>{duration(weekly)}</b> a week, over {days.length} {days.length === 1 ? 'day' : 'days'}.
          </span>
        ) : (
          <span>Pick at least one day.</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 4: review */

function ReviewStep({
  dateLabel,
  sharedWith,
  target,
  examDate,
  away,
  minutes,
  days,
  finishedCheckup,
  onEdit,
}: {
  dateLabel: string;
  sharedWith: string[];
  target: number;
  examDate: string;
  away: number | null;
  minutes: number;
  days: number[];
  finishedCheckup: boolean;
  onEdit: (step: number) => void;
}) {
  const rows = [
    { step: 0, tone: 'purple', icon: IconTarget, label: 'Target', value: `${target} out of 100`, note: `Getting ${perTen(target)} right` },
    {
      step: 1,
      tone: 'yellow',
      icon: IconCalendar,
      label: dateLabel,
      value: longDate(examDate),
      note: [
        away != null && away > 0 ? `${away} ${away === 1 ? 'day' : 'days'} from today` : '',
        sharedWith.length ? `shared with ${listNames(sharedWith)}` : '',
      ]
        .filter(Boolean)
        .join(', '),
    },
    {
      step: 2,
      tone: 'lime',
      icon: IconClock,
      label: 'Rhythm',
      value: `${minutes} min, ${daysText(days)}`,
      note: `${duration(minutes * days.length)} a week`,
    },
  ] as const;
  return (
    <div className="goal-review">
      <ul className="goal-summary">
        {rows.map(({ step, tone, icon: Icon, label, value, note }) => (
          <li key={label} className="goal-sumrow">
            <span className="goal-sumhead">
              <span className={cx('goal-sumicon', tone)} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="sj-eyebrow">{label}</span>
              <button type="button" className="goal-textbtn" onClick={() => onEdit(step)} aria-label={`Change ${label.toLowerCase()}`}>
                Change
              </button>
            </span>
            <strong>{value}</strong>
            {note ? <span className="goal-sumnote">{note}</span> : null}
          </li>
        ))}
      </ul>

      <div className="goal-plan">
        <div className="sj-eyebrow">What happens next</div>
        <Steps
          steps={[
            ...(finishedCheckup ? [] : [{ title: 'A short check-up', body: 'Finds where you stand now and predicts your score.' }]),
            { title: 'Your plan', body: 'Fits practice into the days and minutes you picked.' },
            { title: 'Each practice run', body: `Teaches the step you missed, so your score can climb towards ${target}.` },
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the exam is full */

/** A subject that would be one too many: say so, and let the student swap one out here. */
function FullExam({
  exam,
  examLabel,
  subjectName,
  siblings,
  onChanged,
}: {
  exam: ExaminationOffer;
  examLabel: string;
  subjectName: string;
  siblings: GoalRow[];
  onChanged: () => void;
}) {
  const student = useStudent();
  const toast = useToast();
  const [removing, setRemoving] = useState<GoalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const limit = exam.max_subjects ?? siblings.length;
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const limitWord = words[limit] ?? String(limit);
  const compulsory = exam.subjects.filter((subject) => exam.compulsory_subject_codes.includes(subject.code));
  const compulsoryIds = new Set(compulsory.map((subject) => subject.subject_id));
  const kept = siblings.filter((goal) => compulsoryIds.has(goal.subject_id)).map((goal) => goal.subject_name);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setIssue(null);
    try {
      await api.removeGoal(student.studentId, removing.subject_id);
      toast(`${removing.subject_name} is off your list. Its practice is kept.`);
      setRemoving(null);
      onChanged();
    } catch (error) {
      setIssue(friendly(error) || 'We could not remove it just now. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sj-card goal-note goal-full">
        <div className="goal-note-head">
          <span className="goal-ico" aria-hidden="true">
            <IconBook size={18} />
          </span>
          <h3 className="sj-display sj-h3">
            {examLabel} is {limitWord} {limit === 1 ? 'subject' : 'subjects'}
          </h3>
        </div>
        <p>
          You already have {limitWord}
          {kept.length ? `, including ${listNames(kept)}, which everyone sits` : ''}. To add {subjectName}, take one of the
          others off your list. Its practice and check-ups are kept, so you can add it back later.
        </p>
        <ul className="goal-full-list">
          {siblings.map((goal) => (
            <li key={goal.subject_id}>
              <span className="goal-full-name">{goal.subject_name}</span>
              {compulsoryIds.has(goal.subject_id) ? (
                <span className="goal-full-tag">Everyone sits this</span>
              ) : (
                <button type="button" className="goal-textbtn" onClick={() => setRemoving(goal)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {issue ? (
          <p className="goal-issue" role="alert">
            {issue}
          </p>
        ) : null}
      </div>
      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={removing ? `Swap ${removing.subject_name} for ${subjectName}?` : ''}
        actions={
          <>
            <Button tone="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button tone="dark" busy={busy} onClick={() => void remove()}>
              Remove {removing?.subject_name}
            </Button>
          </>
        }
      >
        {removing?.subject_name} comes off your plan. Nothing you have done in it is deleted, and you can add it back later.
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ loading */

function GoalSkeleton() {
  // The one loading shape for a page (founder, 17 Nov 2026: each page had its own).
  return <PageSkeleton />;
}
