/**
 * Onboarding: the first thing a new student sees after typing their name. Four short steps on
 * one focus page — the exam (with, optionally, their school and aim), the subjects, one goal for all of them, a look over it — and then a
 * finish that hands them straight to their first check-up. Nothing is discovered later from the
 * sidebar, and nobody lands on a dashboard full of "set this up" cards.
 *
 * A student who comes back here finds their current choices filled in, so it doubles as the one
 * place to re-plan every subject at once.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  api,
  type ExaminationOffer,
  type Goal as GoalRow,
  type StudentProfile,
  type SubjectOffer,
} from '../../student/api.js';
import { AboutFields, aboutChange, draftOf, type AboutDraft } from '../AboutFields.js';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconCalendar,
  IconCheck,
  IconClock,
  IconFlag,
  IconLock,
  IconReplay,
  IconTarget,
  IconTrophy,
  IconUser,
} from '../icons.js';
import { progressApi, type Overview } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, CountUp, Skeleton, cx, daysUntil, useToast } from '../ui.js';
import { examTitle, isHiddenExam } from './Exams.js';
import { CountdownTip } from '../countdown.js';
import { Journey } from '../Journey.js';
import { leastTime, type LeastTime } from '../studyTime.js';
import { DatePicker } from '../../lib/DatePicker.js';
import './Onboarding.css';
import { friendly } from '../../lib/friendlyError.js';

const STEPS = [
  { key: 'exam', label: 'Exam', icon: IconTarget },
  { key: 'about', label: 'About', icon: IconUser },
  { key: 'subjects', label: 'Subjects', icon: IconBook },
  { key: 'goal', label: 'Your goal', icon: IconCalendar },
  { key: 'review', label: 'Review', icon: IconCheck },
] as const;
// Where each step sits, so the numbers below read as names.
const EXAM = 0;
const ABOUT = 1;
const SUBJECTS = 2;
const GOAL = 3;
const REVIEW = 4;

const MINUTE_CHIPS = [15, 30, 45, 60, 90];
const DAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
];
const DEFAULT_TARGET = 70;

/* ------------------------------------------------------------------ small helpers */

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
function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
const clampScore = (value: number) => Math.max(1, Math.min(100, Math.round(value)));
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);
/** "UTME is four subjects. Remove one to add another." — the server says the same on a fifth. */
const fullText = (exam: ExaminationOffer) =>
  `${exam.short_name} is ${countWord(exam.max_subjects ?? 0)} subjects. Remove one to add another.`;
/** The subjects every candidate of this exam sits, in catalogue order. */
/** The picked subjects with the exam's compulsory ones (when we teach them) always in, first,
 *  and never more than the exam allows: a compulsory subject never waits for a free place. */
function withCompulsory(exam: ExaminationOffer | undefined, picked: string[]): string[] {
  const must = (exam?.subjects ?? []).filter((s) => s.compulsory && s.ready).map((s) => s.subject_id);
  const all = [...must, ...picked.filter((id) => !must.includes(id))];
  return exam?.max_subjects != null ? all.slice(0, Math.max(exam.max_subjects, must.length)) : all;
}
const compulsoryOf = (exam: ExaminationOffer) => exam.subjects.filter((subject) => subject.compulsory);

/* ------------------------------------------------------------------ the page */

export function Onboarding() {
  usePageTitle('Set up');
  const student = useStudent();
  const [finished, setFinished] = useState(false);
  const load = useLoad(
    () =>
      Promise.all([
        api.catalogue(),
        api.goals(student.studentId),
        progressApi.overview(student.studentId).catch(() => null as Overview | null),
        api.profile(student.studentId).catch(() => null as StudentProfile | null),
      ]),
    [student.studentId],
  );

  let body: ReactNode;
  if (load.error && !load.data) {
    body = (
      <div className="onb-main">
        <div className="sj-card onb-note">
          <div className="onb-note-head">
            <span className="onb-ico" aria-hidden="true">
              <IconReplay size={18} />
            </span>
            <h2 className="sj-display sj-h3">We could not load your setup</h2>
          </div>
          <p>{load.error}. Check your connection and try again; nothing is lost.</p>
          <div className="onb-note-actions">
            <Button tone="soft" onClick={load.reload}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (!load.data) {
    body = <OnboardingSkeleton />;
  } else {
    const [catalogue, goals, overview, profile] = load.data;
    body = (
      <Flow
        exams={catalogue.filter((exam) => !isHiddenExam(exam))}
        goals={goals}
        overview={overview}
        profile={profile}
        name={overview?.student.display_name || student.displayName}
        onFinished={() => setFinished(true)}
      />
    );
  }

  const canLeave = finished || Boolean(load.data?.[1].some((goal) => goal.target_score != null && goal.exam_date));

  return (
    <div className="onb">
      <div className="onb-sky" aria-hidden="true">
        <span className="a" />
        <span className="b" />
      </div>
      <header className="onb-bar">
        <div className="onb-wrap onb-bar-in">
          {/* Setting up is not skippable: only a student changing an existing goal (or one who has
              finished) gets a way out, by the logo or the link. */}
          {canLeave ? (
            <Link to="/home" className="onb-brand" aria-label="Stack Prep home">
              <img src="/brand/mark-96.png" alt="" width={34} height={34} />
              <span>Stack Prep</span>
            </Link>
          ) : (
            <span className="onb-brand">
              <img src="/brand/mark-96.png" alt="" width={34} height={34} />
              <span>Stack Prep</span>
            </span>
          )}
          {canLeave && !finished ? (
            <Link to="/home" className="onb-skip">
              Back to home
            </Link>
          ) : null}
        </div>
      </header>
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ the flow */

type Choice = {
  examId: string;
  selected: string[];
  /** The one date of an exam sat together (UTME). */
  examDate: string;
  /** Each paper's own date, for an exam sat paper by paper (WAEC, NECO). */
  dates: Record<string, string>;
  targets: Record<string, number>;
  minutes: number;
  days: number[];
};

function initialChoice(exams: ExaminationOffer[], goals: GoalRow[]): Choice {
  const goalFor = new Map(goals.map((goal) => [goal.subject_id, goal]));
  const examWithGoal = exams.find((exam) => exam.subjects.some((subject) => goalFor.has(subject.subject_id)));
  const exam = exams.length === 1 ? exams[0] : examWithGoal;
  const selected = withCompulsory(exam, exam ? exam.subjects.filter((s) => s.ready && goalFor.has(s.subject_id)).map((s) => s.subject_id) : []);
  const known = selected.map((id) => goalFor.get(id)!).filter(Boolean);
  const dated = known.find((goal) => goal.exam_date);
  const paced = known.find((goal) => goal.minutes_per_day);
  const daysed = known.find((goal) => goal.study_days?.length);
  const targets: Record<string, number> = {};
  for (const goal of goals) if (goal.target_score != null) targets[goal.subject_id] = clampScore(goal.target_score);
  const dates: Record<string, string> = {};
  for (const goal of goals) if (goal.exam_date) dates[goal.subject_id] = goal.exam_date.slice(0, 10);
  return {
    examId: exam?.examination_id ?? '',
    selected,
    examDate: dated?.exam_date?.slice(0, 10) ?? '',
    dates,
    targets,
    minutes: paced?.minutes_per_day ?? 45,
    days: daysed?.study_days?.length ? [...daysed.study_days].sort((a, b) => a - b) : [1, 2, 3, 4, 5],
  };
}

/** The rail's line for the about step: what they gave, briefly. */
function aboutLine(about: AboutDraft): string | null {
  const said = [about.class_level, about.school_name, about.target_course].map((v) => v.trim()).filter(Boolean);
  return said.length ? said.slice(0, 2).join(', ') : null;
}

function Flow({
  exams,
  goals,
  overview,
  profile,
  name,
  onFinished,
}: {
  exams: ExaminationOffer[];
  goals: GoalRow[];
  overview: Overview | null;
  /** What they have told us about themselves; null when it could not be loaded. */
  profile: StudentProfile | null;
  name: string;
  onFinished: () => void;
}) {
  const student = useStudent();
  const toast = useToast();
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const returning = goals.some((goal) => goal.target_score != null && goal.exam_date);

  // Development only: `?step=0..4` opens on a step and `?step=5` on the finish, for screenshots.
  const devStep = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('step') ?? NaN) : NaN;
  const hasDev = !Number.isNaN(devStep);

  const [choice, setChoice] = useState<Choice>(() => {
    const start = initialChoice(exams, goals);
    if (hasDev && devStep >= GOAL) {
      const exam = exams.find((e) => e.examination_id === start.examId);
      if (!start.selected.length && exam) start.selected = withCompulsory(exam, exam.subjects.filter((s) => s.ready).map((s) => s.subject_id));
      if (!start.examDate) start.examDate = monthsFromToday(7);
    }
    return start;
  });
  const [step, setStep] = useState(hasDev ? Math.max(0, Math.min(REVIEW, devStep)) : 0);
  const [reached, setReached] = useState(returning ? REVIEW : hasDev ? Math.min(REVIEW, Math.max(0, devStep)) : 0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [issue, setIssue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, GoalRow>>({});
  const [done, setDone] = useState(hasDev && devStep > REVIEW);
  // A new student is greeted on a page of its own before the first step.
  const [welcomed, setWelcomed] = useState(returning || hasDev);
  // School, class and aim, asked in their own step; all optional, saved with the goals.
  const [about, setAbout] = useState<AboutDraft>(() => draftOf(profile));
  const [aboutSaved, setAboutSaved] = useState<AboutDraft>(() => draftOf(profile));
  useEffect(() => {
    if (done) onFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, done]);

  const exam = exams.find((item) => item.examination_id === choice.examId);
  const subjects = exam?.subjects ?? [];
  const chosen = subjects.filter((subject) => choice.selected.includes(subject.subject_id));
  const targetOf = (id: string) => choice.targets[id] ?? DEFAULT_TARGET;
  // UTME is sat in one sitting: one date. WAEC and NECO are sat paper by paper: a date each.
  const together = exam?.sits_together ?? true;
  const dateOf = (id: string) => (together ? choice.examDate : (choice.dates[id] ?? ''));
  // The countdown's day: the one date, or the nearest paper still to come.
  const nearest = together
    ? choice.examDate
    : (chosen
        .map((subject) => dateOf(subject.subject_id))
        .filter((day) => (daysUntil(day) ?? -1) > 0)
        .sort()[0] ?? '');
  const away = daysUntil(nearest);
  const nearestNames = chosen.filter((subject) => dateOf(subject.subject_id) === nearest).map((subject) => subject.name);
  const goalFor = new Map(goals.map((goal) => [goal.subject_id, goal]));
  // The least time a day that reaches every topic before the exam (studyTime.ts).
  const least = leastTime(
    chosen.map((subject) => ({ topics: subject.teachable_topics ?? 0, date: dateOf(subject.subject_id) })),
    choice.days,
  );

  const update = (patch: Partial<Choice>) => {
    setIssue(null);
    setSaved({});
    setChoice((current) => {
      const next = { ...current, ...patch };
      const forExam = exams.find((item) => item.examination_id === next.examId);
      return { ...next, selected: withCompulsory(forExam, next.selected) };
    });
  };

  const problem = (index: number): string | null => {
    if (index === EXAM && !exam) return 'Pick the exam you are sitting.';
    if (index === SUBJECTS && chosen.length === 0) return 'Pick at least one subject. You can add more later.';
    if (index === GOAL) {
      if (together) {
        if (!choice.examDate) return 'Pick the day of your exam. A best guess is fine; you can change it later.';
        if (away === null || away < 1) return 'Pick an exam day after today.';
      } else {
        const missing = chosen.filter((subject) => !dateOf(subject.subject_id));
        if (missing.length) return `Pick the day of your ${listText(missing.map((subject) => subject.name))} paper. A best guess is fine.`;
        const past = chosen.filter((subject) => (daysUntil(dateOf(subject.subject_id)) ?? 0) < 1);
        if (past.length) return `Pick a day after today for ${listText(past.map((subject) => subject.name))}.`;
      }
      if (choice.days.length === 0) return 'Pick at least one day you can study.';
      if (least && choice.minutes < least.minutes) return `Pick at least ${least.minutes} minutes a day.`;
    }
    return null;
  };

  const go = (next: number) => {
    if (next > step) {
      for (let index = step; index < next; index += 1) {
        const found = problem(index);
        if (found) {
          setDirection(index < step ? -1 : 1);
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
    for (let index = 0; index < REVIEW; index += 1) {
      const found = problem(index);
      if (found) {
        go(index);
        setIssue(found);
        return;
      }
    }
    setSaving(true);
    setIssue(null);
    const payload = {
      minutes_per_day: choice.minutes,
      study_days: [...choice.days].sort((a, b) => a - b),
    };
    // Subjects of this exam the student unticked come off the list first, so a swap never runs
    // into the exam's subject limit. Their practice is kept.
    const dropped = subjects.filter((subject) => goalFor.has(subject.subject_id) && !choice.selected.includes(subject.subject_id));
    try {
      for (const subject of dropped) await api.removeGoal(student.studentId, subject.subject_id);
    } catch (error) {
      setSaving(false);
      setIssue(`We could not update your subjects just now: ${friendly(error) || 'try again'}.`);
      return;
    }
    const aboutNow = aboutChange(about, aboutSaved);
    if (profile && Object.keys(aboutNow).length) {
      try {
        await api.updateProfile(student.studentId, aboutNow);
        setAboutSaved(about);
      } catch (error) {
        setSaving(false);
        setIssue(`We could not save your school and aim just now: ${friendly(error)}`);
        return;
      }
    }
    // Only the subjects not yet saved: a retry after a half-finished save does not repeat work.
    const todo = chosen.filter((subject) => !saved[subject.subject_id]);
    const results = await Promise.allSettled(
      todo.map((subject) =>
        api.setGoal(student.studentId, subject.subject_id, {
          ...payload,
          exam_date: dateOf(subject.subject_id),
          target_score: targetOf(subject.subject_id),
        }),
      ),
    );
    const next = { ...saved };
    const failed: string[] = [];
    let reason = '';
    results.forEach((result, index) => {
      const subject = todo[index]!;
      if (result.status === 'fulfilled') next[subject.subject_id] = result.value;
      else {
        failed.push(subject.name);
        reason ||= (result.reason as Error)?.message ?? '';
      }
    });
    setSaved(next);
    setSaving(false);
    if (failed.length) {
      const good = chosen.filter((subject) => next[subject.subject_id]).map((subject) => subject.name);
      setIssue(
        `${good.length ? `We saved ${listText(good)}, but not ${listText(failed)} yet.` : 'We could not save your goal just now.'} ${
          /fetch|network/i.test(reason) ? 'Check your connection and try again.' : 'Try again in a moment.'
        }`,
      );
      return;
    }
    toast(chosen.length > 1 ? `Your goals for ${chosen.length} subjects are saved.` : 'Your goal is saved.');
    setDone(true);
    onFinished();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < REVIEW) go(step + 1);
    else void save();
  };

  const rail: { value: ReactNode; state: 'done' | 'current' | 'todo' }[] = STEPS.map((_, index) => ({
    // Ticked only when it is really complete, not merely visited.
    state: done ? 'done' : index === step ? 'current' : index <= reached && !problem(index) ? 'done' : 'todo',
    value: null,
  }));
  rail[EXAM]!.value = exam ? exam.short_name : null;
  rail[ABOUT]!.value = aboutLine(about);
  rail[SUBJECTS]!.value = chosen.length ? chosen.map((subject) => subject.name).join(', ') : null;
  rail[GOAL]!.value =
    nearest && away != null && away > 0 ? (
      <>
        {together ? shortDate(nearest) : `Next paper ${shortDate(nearest)}`}
        <br />
        {choice.minutes} min, {daysText(choice.days)}
      </>
    ) : null;
  rail[REVIEW]!.value = done ? 'Saved' : null;

  const StepIcon = STEPS[step]!.icon;
  const pieces: { title: string; lede: ReactNode }[] = [
    {
      title: exams.length === 1 ? 'Your exam' : 'Which exam are you sitting?',
      lede: exams.length === 1 ? 'Picked for you.' : 'Pick the exam you are preparing for.',
    },
    {
      title: 'A little about you',
      lede: 'Optional. Fill in what you know.',
    },
    {
      title: 'Which subjects are you sitting?',
      lede: exam && compulsoryOf(exam).some((s) => s.ready)
        ? `${listText(compulsoryOf(exam).filter((s) => s.ready).map((s) => s.name))} is in. Pick the rest.`
        : 'Pick every one you are sitting.',
    },
    {
      title: 'Set your goal',
      lede: together
        ? `One ${exam?.short_name ?? 'exam'} date and one study rhythm for all your subjects, and the score you want in each.`
        : 'The day of each paper, one study rhythm for all of them, and the score you want in each.',
    },
    {
      title: 'Here is your plan',
      lede: 'Check it over. You can change any of it later.',
    },
  ];

  if (!welcomed) return <Welcome firstName={firstName} onStart={() => setWelcomed(true)} />;

  return (
    <div className="onb-main">
      <Rail rail={rail} step={step} reached={reached} done={done} firstName={firstName} onGo={go} />

      {done ? (
        <Finish
          heading={heading}
          firstName={firstName}
          chosen={chosen}
          saved={saved}
          examDate={nearest}
          together={together}
          nearestNames={nearestNames}
          away={away}
          minutes={choice.minutes}
          days={choice.days}
          overview={overview}
          targetOf={targetOf}
        />
      ) : (
        <form className="onb-stage sj-rise d1" onSubmit={onSubmit} noValidate>
          <div className="onb-stagehead">
            <div className="sj-eyebrow">
              Step {step + 1} of {STEPS.length}
            </div>
            <div className="onb-stagerow">
              <span className="onb-stageicon" aria-hidden="true">
                <StepIcon size={18} />
              </span>
              <h1 className="sj-display sj-h2 onb-stagetitle" tabIndex={-1} ref={heading}>
                {pieces[step]!.title}
              </h1>
            </div>
            <p className="onb-lede">{pieces[step]!.lede}</p>
          </div>

          <div key={step} className={cx('onb-body', direction > 0 ? 'fwd' : 'bwd')}>
            {step === EXAM ? (
              <ExamStep
                  exams={exams}
                  examId={choice.examId}
                  onPick={(examId) => {
                    if (examId === choice.examId) return;
                    const next = exams.find((item) => item.examination_id === examId);
                    const keep = withCompulsory(next, choice.selected.filter((id) => next?.subjects.some((s) => s.subject_id === id)));
                    update({ examId, selected: next?.max_subjects ? keep.slice(0, next.max_subjects) : keep });
                  }}
                />
            ) : null}
            {step === ABOUT ? (
              profile ? (
                <AboutFields draft={about} onChange={(key, value) => setAbout((current) => ({ ...current, [key]: value }))} />
              ) : (
                <p className="sj-muted">We could not load this just now. You can fill it in later on your profile.</p>
              )
            ) : null}
            {step === SUBJECTS && exam ? (
              <SubjectsStep
                exam={exam}
                selected={choice.selected}
                goalFor={goalFor}
                onToggle={(id) => {
                  if (subjects.some((s) => s.subject_id === id && s.compulsory && s.ready)) return;
                  const adding = !choice.selected.includes(id);
                  if (adding && exam.max_subjects != null && choice.selected.length >= exam.max_subjects) {
                    setIssue(fullText(exam));
                    return;
                  }
                  update({
                    selected: adding
                      ? subjects.filter((s) => s.subject_id === id || choice.selected.includes(s.subject_id)).map((s) => s.subject_id)
                      : choice.selected.filter((item) => item !== id),
                  });
                }}
                onAll={() => {
                  // Compulsory subjects first, so a limit never leaves out the one everyone sits.
                  const ready = subjects.filter((s) => s.ready).sort((a, b) => Number(b.compulsory) - Number(a.compulsory));
                  update({ selected: ready.slice(0, exam.max_subjects ?? ready.length).map((s) => s.subject_id) });
                }}
                // Red only when nothing is picked; a full list is not a mistake.
                invalid={Boolean(issue) && chosen.length === 0}
              />
            ) : null}
            {step === GOAL ? (
              <GoalStep
                examName={exam?.short_name ?? 'your exam'}
                together={together}
                chosen={chosen}
                choice={choice}
                away={away}
                nearestNames={nearestNames}
                targetOf={targetOf}
                update={update}
                least={least}
                invalidDate={Boolean(issue) && (!nearest || away === null || away < 1)}
              />
            ) : null}
            {step === REVIEW && exam ? (
              <ReviewStep
                exam={exam}
                chosen={chosen}
                choice={choice}
                dateOf={dateOf}
                away={away}
                targetOf={targetOf}
                saved={saved}
                onEdit={go}
              />
            ) : null}
          </div>

          {issue ? (
            <p className="onb-issue" role="alert">
              {issue}
            </p>
          ) : null}

          <div className="onb-actions">
            {step > 0 ? (
              <Button tone="ghost" onClick={() => go(step - 1)} icon={<IconArrowLeft size={18} />}>
                Back
              </Button>
            ) : (
              <span className="onb-actions-note" />
            )}
            {step < REVIEW ? (
              <Button type="submit" trailing={<IconArrowRight size={18} />}>
                Continue
              </Button>
            ) : (
              <Button type="submit" tone="lime" busy={saving} trailing={saving ? undefined : <IconCheck size={18} />}>
                {saving ? 'Saving…' : issue && Object.keys(saved).length ? 'Try again' : 'Save and continue'}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );

}

/* ------------------------------------------------------------------ welcome */

function Welcome({ firstName, onStart }: { firstName: string; onStart: () => void }) {
  return (
    <div className="onb-welcome">
      <div className="onb-welcome-words sj-rise">
        <span className="sj-eyebrow">Welcome</span>
        <h1 className="sj-display onb-welcome-title">Hi {firstName}, let's set up your plan</h1>
        <p className="onb-lede">About a minute. You can change it all later.</p>
        <Button tone="lime" onClick={onStart} trailing={<IconArrowRight size={18} />}>
          Let's start
        </Button>
      </div>
      <div className="onb-welcome-path sj-rise d2">
        <Journey
          stops={[
            { key: 'exam', title: 'Your exam', icon: <IconTarget size={20} />, state: 'current' },
            { key: 'about', title: 'About you', icon: <IconUser size={20} />, state: 'locked' },
            { key: 'subjects', title: 'Your subjects', icon: <IconBook size={20} />, state: 'locked' },
            { key: 'goal', title: 'Your goal', icon: <IconCalendar size={20} />, state: 'locked' },
            { key: 'plan', title: 'Your plan', icon: <IconFlag size={20} />, state: 'locked', finish: true },
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the rail */

function Rail({
  rail,
  step,
  reached,
  done,
  firstName,
  onGo,
}: {
  rail: { value: ReactNode; state: 'done' | 'current' | 'todo' }[];
  step: number;
  reached: number;
  done: boolean;
  firstName: string;
  onGo: (step: number) => void;
}) {
  return (
    <nav className="onb-rail sj-rise" aria-label="Setup steps">
      <div className="onb-rail-art" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>
      <div className="onb-rail-head">
        <span className="sj-eyebrow">Setting up · {firstName}</span>
        <span className="sj-display onb-rail-title">Your plan</span>
      </div>
      <ol className="onb-rail-steps" style={{ '--at': done ? STEPS.length : step } as CSSProperties}>
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const { state, value } = rail[index]!;
          return (
            <li key={item.key}>
              <button
                type="button"
                className={cx('onb-railbtn', state)}
                onClick={() => onGo(index)}
                disabled={done || index > reached}
                aria-current={!done && index === step ? 'step' : undefined}
              >
                <span className="onb-railrow">
                  <span className="onb-raildot" aria-hidden="true">
                    {state === 'done' ? <IconCheck size={16} /> : <Icon size={16} />}
                  </span>
                  <span className="onb-raillabel">
                    <span className="sj-mono">0{index + 1}</span>
                    {item.label}
                  </span>
                </span>
                <span className="onb-railvalue">{value ?? (state === 'todo' ? 'Not yet' : index === REVIEW ? 'Ready when you are' : index === ABOUT ? 'Optional' : 'Not picked yet')}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="onb-rail-foot">Your goal turns practice into a plan that counts down to exam day.</p>
    </nav>
  );
}

/* ------------------------------------------------------------------ step 1: exam */

/** What the exam itself is like: how many subjects, how it is sat, the top score. */
function examFacts(exam: ExaminationOffer): { value: string; label: string; icon: ReactNode; tone: string }[] {
  const must = exam.subjects.filter((subject) => subject.compulsory).map((subject) => subject.name);
  const facts: { value: string; label: string; icon: ReactNode; tone: string }[] = [];
  if (exam.max_subjects != null) {
    facts.push({
      value: `${exam.max_subjects} subjects`,
      label: must.length ? `${listText(must)} for everyone` : 'Your choice',
      icon: <IconBook size={18} />,
      tone: 'purple',
    });
  }
  facts.push(
    exam.sits_together
      ? { value: 'One sitting', label: 'All subjects on one day', icon: <IconCalendar size={18} />, tone: 'yellow' }
      : { value: 'Paper by paper', label: 'Each subject on its own day', icon: <IconCalendar size={18} />, tone: 'yellow' },
  );
  if (exam.sits_together && exam.max_subjects != null) {
    facts.push({ value: `${exam.max_subjects * 100}`, label: 'Top score', icon: <IconTrophy size={18} />, tone: 'lime' });
  }
  return facts;
}

function ExamStep({ exams, examId, onPick }: { exams: ExaminationOffer[]; examId: string; onPick: (id: string) => void }) {
  const name = useId();
  if (exams.length === 0) {
    return (
      <div className="onb-empty">
        <p>No exams are open yet. Come back soon.</p>
      </div>
    );
  }
  return (
    <div className={cx('onb-exams', exams.length === 1 && 'single')} role="radiogroup" aria-label="Exam">
      {exams.map((exam, index) => {
        const on = exam.examination_id === examId;
        return (
          <label key={exam.examination_id} className={cx('onb-opt onb-exam', on && 'on', `sj-rise d${Math.min(index + 1, 4)}`)}>
            <input
              className="onb-sr"
              type="radio"
              name={name}
              value={exam.examination_id}
              checked={on}
              onChange={() => onPick(exam.examination_id)}
            />
            <span className="onb-opt-head">
              <span className="onb-opt-ico ink" aria-hidden="true">
                <IconTarget size={18} />
              </span>
              <span className="onb-opt-title sj-display">{exam.short_name}</span>
              <span className="onb-tick round" aria-hidden="true">
                {on ? <IconCheck size={14} /> : null}
              </span>
            </span>
            <span className="onb-exam-name">{examTitle(exam)}</span>
            <span className="onb-opt-meta">Set by {exam.exam_body}</span>
            <span className="onb-exam-facts">
              {examFacts(exam).map((fact) => (
                <span key={fact.label} className="onb-exam-fact">
                  <span className={cx('onb-exam-fact-ico', fact.tone)} aria-hidden="true">
                    {fact.icon}
                  </span>
                  <span>
                    <b>{fact.value}</b>
                    <span>{fact.label}</span>
                  </span>
                </span>
              ))}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ step 2: subjects */

function SubjectsStep({
  exam,
  selected,
  goalFor,
  onToggle,
  onAll,
  invalid,
}: {
  exam: ExaminationOffer;
  selected: string[];
  goalFor: Map<string, GoalRow>;
  onToggle: (id: string) => void;
  onAll: () => void;
  invalid: boolean;
}) {
  const ready = exam.subjects.filter((subject) => subject.ready);
  const limit = exam.max_subjects;
  const allOn = ready.length > 0 && ready.every((subject) => selected.includes(subject.subject_id));
  return (
    <div className="onb-subjects">

      <div className="onb-blockhead">
        <span className="onb-label" id="onb-subjects-label">
          {limit != null ? `${selected.length} of ${limit} picked` : `${selected.length} of ${ready.length} picked`}
        </span>
        {ready.length > 1 && (limit == null || ready.length <= limit) ? (
          <button type="button" className="onb-textbtn" onClick={onAll} disabled={allOn}>
            {allOn ? 'All picked' : 'Pick all'}
          </button>
        ) : null}
      </div>

      <div className={cx('onb-subgrid', invalid && 'invalid')} role="group" aria-labelledby="onb-subjects-label">
        {[...exam.subjects]
          .sort((a, b) => Number(b.compulsory && b.ready) - Number(a.compulsory && a.ready))
          .map((subject, index) => (
          <SubjectCard
            key={subject.subject_id}
            subject={subject}
            on={selected.includes(subject.subject_id)}
            goal={goalFor.get(subject.subject_id)}
            onToggle={() => onToggle(subject.subject_id)}
            delay={index}
          />
        ))}
      </div>
    </div>
  );
}

function SubjectCard({
  subject,
  on,
  goal,
  onToggle,
  delay,
}: {
  subject: SubjectOffer;
  on: boolean;
  goal: GoalRow | undefined;
  onToggle: () => void;
  delay: number;
}) {
  const disabled = !subject.ready;
  // Everyone sits it: ticked for them, and it stays ticked.
  const must = subject.compulsory && !disabled;
  return (
    <label className={cx('onb-opt onb-subject', (on || must) && 'on', must && 'must', disabled && 'off', `sj-rise d${Math.min(delay + 1, 4)}`)}>
      <input
        className="onb-sr"
        type="checkbox"
        checked={on || must}
        disabled={disabled}
        aria-readonly={must || undefined}
        onChange={must ? () => undefined : onToggle}
      />
      <span className="onb-opt-head">
        <span className={cx('onb-opt-ico', on || must ? 'purple' : 'soft')} aria-hidden="true">
          {disabled ? <IconLock size={18} /> : <IconBook size={18} />}
        </span>
        <span className="onb-opt-title">{subject.name}</span>
        <span className="onb-tick" aria-hidden="true">
          {on || must ? <IconCheck size={14} /> : null}
        </span>
      </span>
      {disabled ? (
        <span className="onb-opt-meta">{subject.blocked_reason ?? 'Not ready yet. We are still building it.'}</span>
      ) : null}
      {goal?.target_score != null ? (
        <span className="onb-opt-badges">
          <span className="onb-opt-badge sj-mono">Goal set · {Math.round(goal.target_score)}/100</span>
        </span>
      ) : null}
    </label>
  );
}

/* ------------------------------------------------------------------ step 3: goal */

function GoalStep({
  examName,
  together,
  chosen,
  choice,
  away,
  nearestNames,
  targetOf,
  update,
  least,
  invalidDate,
}: {
  examName: string;
  together: boolean;
  chosen: SubjectOffer[];
  choice: Choice;
  away: number | null;
  nearestNames: string[];
  targetOf: (id: string) => number;
  update: (patch: Partial<Choice>) => void;
  least: LeastTime | null;
  invalidDate: boolean;
}) {
  const dateId = useId();
  const tomorrow = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return isoDay(date);
  })();
  const quick = [1, 2, 3].map((months) => ({ months, iso: monthsFromToday(months) }));
  const good = away != null && away > 0;
  const isUtme = examName.toUpperCase() === 'UTME';
  const setDate = (id: string, value: string) => update({ dates: { ...choice.dates, [id]: value } });
  const minuteChips = [...new Set([...MINUTE_CHIPS, choice.minutes, ...(least ? [least.minutes] : [])])].sort((a, b) => a - b);
  // A time below the least is raised to it as soon as the date or days make it too short.
  useEffect(() => {
    if (least && choice.minutes < least.minutes) update({ minutes: least.minutes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [least?.minutes]);
  const sortedDays = [...choice.days].sort((a, b) => a - b).join();
  const setTarget = (id: string, value: number) => update({ targets: { ...choice.targets, [id]: clampScore(value) } });
  const toggleDay = (n: number) =>
    update({ days: choice.days.includes(n) ? choice.days.filter((d) => d !== n) : [...choice.days, n].sort((a, b) => a - b) });

  return (
    <div className="onb-goal">
      {/* --- exam day: one for an exam sat together, one per paper otherwise */}
      <section className="onb-part" aria-labelledby="onb-part-date">
        <div className="onb-parthead">
          <span className="sj-mono">A</span>
          <h2 id="onb-part-date" className="onb-parttitle">
            {together ? `Your ${examName} date` : 'Your paper dates'}
          </h2>
          <CountdownTip className="onb-parttip" />
        </div>
        <p className="onb-partnote">
          {together
            ? `All your ${examName} papers are sat together on one day, so there is one date for every subject.`
            : 'Each paper has its own day, and some share one. Your countdown is to the nearest paper still to come.'}
        </p>
        {together ? (
        <div className="onb-dategrid">
          <DatePicker
            className="onb-dateinput"
            id={dateId}
            value={choice.examDate}
            min={tomorrow}
            onChange={(iso) => update({ examDate: iso })}
            invalid={invalidDate}
            aria-labelledby="onb-part-date"
          />
          <div className="onb-quick" role="group" aria-label="Quick picks for exam day">
            {quick.map(({ months, iso }) => (
              <button
                key={months}
                type="button"
                className="sj-chip"
                aria-pressed={choice.examDate === iso}
                onClick={() => update({ examDate: iso })}
              >
                In {months} {months === 1 ? 'month' : 'months'}
              </button>
            ))}
          </div>
        </div>
        ) : (
          <PaperDates chosen={chosen} dates={choice.dates} setDate={setDate} tomorrow={tomorrow} invalid={invalidDate} />
        )}
        <p className={cx('onb-count', good && 'on')} aria-live="polite">
          {good ? (
            <>
              <b>
                {together
                  ? `${away} ${away === 1 ? 'day' : 'days'} to go`
                  : `Next paper: ${listText(nearestNames)} in ${away} ${away === 1 ? 'day' : 'days'}`}
              </b>
              <span>{longDate(together ? choice.examDate : (choice.dates[chosen.find((s) => nearestNames.includes(s.name))?.subject_id ?? ''] ?? ''))}</span>
            </>
          ) : (
            <>
              <b>No day yet</b>
              <span>
                {isUtme
                  ? 'UTME usually falls around April or May. Pick your best guess and change it when JAMB confirms your day.'
                  : 'Pick your best guess. You can change it any time.'}
              </span>
            </>
          )}
        </p>
      </section>

      {/* --- targets */}
      <section className="onb-part" aria-labelledby="onb-part-target">
        <div className="onb-parthead">
          <span className="sj-mono">B</span>
          <h2 id="onb-part-target" className="onb-parttitle">
            Your target {chosen.length > 1 ? 'in each subject' : 'score'}
          </h2>
        </div>
        <ul className="onb-targets">
          {chosen.map((subject) => {
            const value = targetOf(subject.subject_id);
            return (
              <li key={subject.subject_id} className="onb-target">
                <div className="onb-target-top">
                  <span className="onb-target-text">
                    <span className="onb-target-name">{subject.name}</span>
                    <span className="onb-target-note">{perTen(value).replace(/^a/, 'A').replace('in every 10', 'in 10')} right</span>
                  </span>
                  <output className="onb-target-num" aria-live="polite">
                    <span className="sj-num">{value}</span>
                    <span className="sj-mono">/100</span>
                  </output>
                </div>
                <div className="onb-target-control">
                  <button
                    type="button"
                    className="onb-nudge"
                    onClick={() => setTarget(subject.subject_id, value - 5)}
                    disabled={value <= 1}
                    aria-label={`Five less for ${subject.name}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={value}
                    onChange={(event) => setTarget(subject.subject_id, Number(event.target.value))}
                    className="onb-range"
                    style={{ '--pct': `${((value - 1) / 99) * 100}%` } as CSSProperties}
                    aria-label={`Target score in ${subject.name}, out of 100`}
                    aria-valuetext={`${value} out of 100`}
                  />
                  <button
                    type="button"
                    className="onb-nudge"
                    onClick={() => setTarget(subject.subject_id, value + 5)}
                    disabled={value >= 100}
                    aria-label={`Five more for ${subject.name}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- rhythm */}
      <section className="onb-part" aria-labelledby="onb-part-rhythm">
        <div className="onb-parthead">
          <span className="sj-mono">C</span>
          <h2 id="onb-part-rhythm" className="onb-parttitle">
            Your study rhythm
          </h2>
        </div>
        <div className="onb-block">
          <span className="onb-label" id="onb-minutes-label">
            On a study day, you can give
          </span>
          <div className="onb-minutes" role="group" aria-labelledby="onb-minutes-label">
            {minuteChips.map((value) => (
              <button
                key={value}
                type="button"
                className="sj-chip"
                aria-pressed={choice.minutes === value}
                disabled={least != null && value < least.minutes}
                onClick={() => update({ minutes: value })}
              >
                {value} min
              </button>
            ))}
          </div>
          {least ? (
            <p className={cx('sj-least', !least.enough && 'short')} aria-live="polite">
              {least.enough
                ? `${least.daysLeft} days to go: at least ${least.minutes} min a day to cover all your topics.`
                : `${least.daysLeft} days to go: even ${least.minutes} min a day won't cover every topic.${
                    least.everyDayWouldDo && choice.days.length < 7 ? ' Add more days.' : ' Your plan will put the topics that come up most first.'
                  }`}
            </p>
          ) : null}
        </div>
        <div className="onb-block">
          <div className="onb-blockhead">
            <span className="onb-label" id="onb-days-label">
              On these days
            </span>
            <span className="sj-seg" role="group" aria-label="Quick picks for study days">
              <button type="button" className={cx(sortedDays === '1,2,3,4,5' && 'on')} aria-pressed={sortedDays === '1,2,3,4,5'} onClick={() => update({ days: [1, 2, 3, 4, 5] })}>
                Weekdays
              </button>
              <button type="button" className={cx(choice.days.length === 7 && 'on')} aria-pressed={choice.days.length === 7} onClick={() => update({ days: [1, 2, 3, 4, 5, 6, 7] })}>
                Every day
              </button>
            </span>
          </div>
          <div className="onb-days" role="group" aria-labelledby="onb-days-label">
            {DAYS.map((day) => {
              const on = choice.days.includes(day.n);
              return (
                <button
                  key={day.n}
                  type="button"
                  className={cx('onb-day', on && 'on')}
                  aria-pressed={on}
                  aria-label={day.long}
                  onClick={() => toggleDay(day.n)}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </div>
        <p className="onb-weekly" aria-live="polite">
          {choice.days.length ? (
            <>
              That is <b>{duration(choice.minutes * choice.days.length)}</b> a week, over {choice.days.length}{' '}
              {choice.days.length === 1 ? 'day' : 'days'}.
            </>
          ) : (
            'Pick at least one day.'
          )}
        </p>
      </section>
    </div>
  );
}

/** One date per paper, with a one-tap "same day as" for papers that share a day. */
function PaperDates({
  chosen,
  dates,
  setDate,
  tomorrow,
  invalid,
}: {
  chosen: SubjectOffer[];
  dates: Record<string, string>;
  setDate: (id: string, value: string) => void;
  tomorrow: string;
  invalid: boolean;
}) {
  return (
    <ul className="onb-papers">
      {chosen.map((subject) => {
        const mine = dates[subject.subject_id] ?? '';
        // Other papers' days, each once, named by the papers on it.
        const sameDays = new Map<string, string[]>();
        for (const other of chosen) {
          const day = dates[other.subject_id];
          if (other.subject_id !== subject.subject_id && day && day >= tomorrow) {
            sameDays.set(day, [...(sameDays.get(day) ?? []), other.name]);
          }
        }
        const inputId = `onb-paper-${subject.subject_id}`;
        return (
          <li key={subject.subject_id} className="onb-paper">
            <label className="onb-paper-name" htmlFor={inputId}>
              {subject.name}
            </label>
            <DatePicker
              className="onb-dateinput"
              id={inputId}
              value={mine}
              min={tomorrow}
              onChange={(iso) => setDate(subject.subject_id, iso)}
              invalid={invalid && (!mine || mine < tomorrow)}
            />
            {sameDays.size ? (
              <div className="onb-paper-same" role="group" aria-label={`Same day as another paper, for ${subject.name}`}>
                {[...sameDays].map(([day, names]) => (
                  <button key={day} type="button" className="sj-chip" aria-pressed={mine === day} onClick={() => setDate(subject.subject_id, day)}>
                    Same day as {listText(names)}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ step 4: review */

function ReviewStep({
  exam,
  chosen,
  choice,
  dateOf,
  away,
  targetOf,
  saved,
  onEdit,
}: {
  exam: ExaminationOffer;
  chosen: SubjectOffer[];
  choice: Choice;
  dateOf: (id: string) => string;
  away: number | null;
  targetOf: (id: string) => number;
  saved: Record<string, GoalRow>;
  onEdit: (step: number) => void;
}) {
  const rows: { step: number; tone: string; icon: typeof IconTarget; label: string; body: ReactNode }[] = [
    {
      step: EXAM,
      tone: 'ink',
      icon: IconTarget,
      label: 'Exam',
      body: (
        <>
          <strong>{exam.short_name}</strong>
          <span className="onb-sumnote">{examTitle(exam)}</span>
        </>
      ),
    },
    {
      step: SUBJECTS,
      tone: 'purple',
      icon: IconBook,
      label: chosen.length === 1 ? 'Subject and target' : 'Subjects and targets',
      body: (
        <ul className="onb-sumsubjects">
          {chosen.map((subject) => (
            <li key={subject.subject_id}>
              <span className="onb-sumsubject">
                {saved[subject.subject_id] ? <IconCheck size={14} aria-hidden="true" /> : null}
                {subject.name}
              </span>
              <span className="onb-sumtarget">
                <span className="sj-num">{targetOf(subject.subject_id)}</span>
                <span className="sj-mono">/100</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      step: GOAL,
      tone: 'yellow',
      icon: IconCalendar,
      label: exam.sits_together ? `${exam.short_name} date` : 'Paper dates',
      body: exam.sits_together ? (
        <>
          <strong>{longDate(choice.examDate)}</strong>
          {away != null && away > 0 ? (
            <span className="onb-sumnote">
              {away} {away === 1 ? 'day' : 'days'} from today
              {chosen.length > 1 ? ', all your subjects sat together' : ''}
            </span>
          ) : null}
        </>
      ) : (
        <ul className="onb-sumsubjects">
          {[...chosen]
            .sort((a, b) => dateOf(a.subject_id).localeCompare(dateOf(b.subject_id)))
            .map((subject) => (
              <li key={subject.subject_id}>
                <span className="onb-sumsubject">{subject.name}</span>
                <span className="onb-sumdate">{shortDate(dateOf(subject.subject_id))}</span>
              </li>
            ))}
        </ul>
      ),
    },
    {
      step: GOAL,
      tone: 'lime',
      icon: IconClock,
      label: 'Study rhythm',
      body: (
        <>
          <strong>
            {choice.minutes} min, {daysText(choice.days)}
          </strong>
          <span className="onb-sumnote">{duration(choice.minutes * choice.days.length)} a week</span>
        </>
      ),
    },
  ];
  return (
    <ul className="onb-summary">
      {rows.map(({ step, tone, icon: Icon, label, body }) => (
        <li key={label} className="onb-sumrow">
          <span className="onb-sumhead">
            <span className={cx('onb-ico', tone)} aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="sj-eyebrow">{label}</span>
            <button type="button" className="onb-textbtn" onClick={() => onEdit(step)} aria-label={`Change ${label.toLowerCase()}`}>
              Change
            </button>
          </span>
          {body}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ finish */

function Finish({
  heading,
  firstName,
  chosen,
  saved,
  examDate,
  together,
  nearestNames,
  away,
  minutes,
  days,
  overview,
  targetOf,
}: {
  heading: RefObject<HTMLHeadingElement>;
  firstName: string;
  chosen: SubjectOffer[];
  saved: Record<string, GoalRow>;
  examDate: string;
  together: boolean;
  nearestNames: string[];
  away: number | null;
  minutes: number;
  days: number[];
  overview: Overview | null;
  targetOf: (id: string) => number;
}) {
  const student = useStudent();
  const navigate = useNavigate();
  const info = (id: string) => overview?.subjects.find((subject) => subject.subject_id === id);
  // A check-up is due in every chosen subject that has not had a finished one.
  const due = chosen.filter((subject) => !info(subject.subject_id)?.latest_checkup);
  const [pick, setPick] = useState(due[0]?.subject_id ?? '');
  const [starting, setStarting] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const picked = due.find((subject) => subject.subject_id === pick) ?? due[0];
  const open = picked ? info(picked.subject_id)?.open_checkup_session_id ?? null : null;
  const sessions = chosen.map((subject) => saved[subject.subject_id]?.sessions_before_exam).find((n) => n != null) ?? null;

  const start = async () => {
    if (!picked) return;
    if (open) {
      navigate(`/checkup/${open}`);
      return;
    }
    setStarting(true);
    setIssue(null);
    try {
      const state = await api.start(student.studentId, picked.subject_id);
      navigate(`/checkup/${state.session_id}`);
    } catch (error) {
      setIssue(`We could not start your check-up just now: ${friendly(error) || 'try again'}.`);
      setStarting(false);
    }
  };

  const names = listText(chosen.map((subject) => subject.name));
  return (
    <section className="onb-stage onb-done sj-rise d1" aria-labelledby="onb-done-title">
      <div className="onb-stagehead">
        <div className="sj-eyebrow">All set</div>
        <div className="onb-stagerow">
          <span className="onb-stageicon lime" aria-hidden="true">
            <IconCheck size={18} />
          </span>
          <h1 id="onb-done-title" className="sj-display sj-h2 onb-stagetitle" tabIndex={-1} ref={heading}>
            You're set up, {firstName}
          </h1>
        </div>
        <p className="onb-lede">
          Your {chosen.length > 1 ? 'goals are' : 'goal is'} saved for {names}.{' '}
          {picked ? (
            <>
              Next, a short <span className="onb-nowrap">check-up</span> finds where you stand, so your practice starts at the right step.
            </>
          ) : (
            "Your dashboard has today's practice ready."
          )}
        </p>
      </div>

      <div className="onb-facts">
        <div className="onb-factcard sj-rise d1">
          <span className="sj-eyebrow">{together ? 'Days to exam' : 'Days to next paper'}</span>
          <span className="sj-num">{away != null && away > 0 ? <CountUp value={away} /> : '–'}</span>
          <span className="onb-factnote">
            {!examDate ? 'Pick a day' : together ? `On ${shortDate(examDate)}` : `${listText(nearestNames)}, ${shortDate(examDate)}`}
          </span>
        </div>
        <div className="onb-factcard sj-rise d2">
          <span className="sj-eyebrow">{chosen.length === 1 ? 'Target' : 'Subjects'}</span>
          <span className="sj-num">
            <CountUp value={chosen.length === 1 ? targetOf(chosen[0]!.subject_id) : chosen.length} />
          </span>
          <span className="onb-factnote">
            {chosen.length === 1 ? `Out of 100 in ${chosen[0]!.name}` : names}
          </span>
        </div>
        <div className="onb-factcard sj-rise d3">
          <span className="sj-eyebrow">{sessions != null ? 'Study sessions' : 'Study days a week'}</span>
          <span className="sj-num">{sessions != null ? <CountUp value={sessions} /> : <CountUp value={days.length} />}</span>
          <span className="onb-factnote">
            {sessions != null ? `${minutes} minutes, ${daysText(days)}, before your exam` : `${minutes} minutes each, ${daysText(days)}`}
          </span>
        </div>
      </div>

      {picked && due.length > 1 ? (
        <div className="onb-block">
          <span className="onb-label" id="onb-first-label">
            Start your check-ups with
          </span>
          <div className="onb-firstpick" role="group" aria-labelledby="onb-first-label">
            {due.map((subject) => (
              <button
                key={subject.subject_id}
                type="button"
                className="sj-chip"
                aria-pressed={picked.subject_id === subject.subject_id}
                onClick={() => setPick(subject.subject_id)}
              >
                {subject.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {issue ? (
        <p className="onb-issue" role="alert">
          {issue}
        </p>
      ) : null}

      <div className="onb-actions onb-done-actions">
        {picked ? (
          <>
            <Button size="lg" tone="ghost" to="/home">
              Go to my dashboard
            </Button>
            <Button size="lg" tone="lime" busy={starting} onClick={() => void start()} trailing={starting ? undefined : <IconArrowRight size={18} />}>
              {open ? 'Continue my check-up' : 'Take my first check-up'}
            </Button>
          </>
        ) : (
          <>
            <span />
            <Button size="lg" tone="lime" to="/home" trailing={<IconArrowRight size={18} />}>
              Go to my dashboard
            </Button>
          </>
        )}
      </div>
      {picked ? (
        <p className="onb-done-note sj-small sj-muted">
          The {picked.name} check-up has no pass or fail. Stop any time; it saves as you go.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ loading */

function OnboardingSkeleton() {
  return (
    <div className="onb-main" aria-busy="true" aria-label="Loading your setup">
      <div className="onb-rail onb-rail-skel">
        <Skeleton height={12} width={120} />
        <Skeleton height={28} width="60%" />
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} height={52} radius={10} />
        ))}
      </div>
      <div className="onb-stage">
        <Skeleton height={12} width={90} />
        <Skeleton height={34} width="60%" radius={8} />
        <Skeleton height={16} width="80%" />
        <Skeleton height={180} radius={14} />
      </div>
    </div>
  );
}
