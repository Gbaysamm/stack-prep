/**
 * /mock/new — set up a mock exam: a scheduled mock (English 60, every other subject 40, two hours),
 * or a custom one (up to four subjects, how many questions in each, how long). Every count is
 * capped by the questions there are; the server caps them again.
 *
 * Starting asks for full screen in the same click, because a browser only grants it to a click.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { IconArrowRight, IconCheck, IconClock, IconLock } from '../icons.js';
import { mockApi, minutesText, type MockExamOption, type MockOptions, type MockSubjectOption } from '../mockApi.js';
import { Refused } from '../runsApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, PageHero, Skeleton, cx } from '../ui.js';
import './Mock.css';
import { friendly } from '../../lib/friendlyError.js';

type Preset = 'utme' | 'custom';

/** JAMB gives 120 minutes for 180 questions: 40 seconds each. */
const SECONDS_PER_QUESTION = 40;

const clampInt = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(value) || low));

/** "1 min 12 s", "40 s": the time each question gets. */
function perQuestion(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const m = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/**
 * How long the test runs: one slider in 5-minute steps, the time shown large, a tick where the
 * real exam's pace falls, and one line saying what the time means per question.
 */
function TimePicker({
  minutes,
  total,
  suggested,
  max,
  onChange,
}: {
  minutes: number;
  total: number;
  suggested: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const low = 5;
  const each = total > 0 ? (minutes * 60) / total : 0;
  const pace =
    each === 0
      ? null
      : each < SECONDS_PER_QUESTION * 0.9
        ? 'tight'
        : each > SECONDS_PER_QUESTION * 1.25
          ? 'relaxed'
          : 'exam';
  const paceWords = { tight: 'Tighter than the exam', exam: 'Exam pace', relaxed: 'More time than the exam' } as const;
  const at = (value: number) => `${(100 * (Math.min(max, Math.max(low, value)) - low)) / (max - low)}%`;
  return (
    <div className="mk-time">
      <div className="mk-time-top">
        <span className="mk-time-value">
          <b className="sj-num">{minutes}</b> min
          <small>{minutesText(minutes)}</small>
        </span>
        {pace ? <span className={cx('mk-time-pace', pace)}>{paceWords[pace]}</span> : null}
      </div>
      <div className="mk-slider" style={{ '--fill': at(minutes) } as CSSProperties}>
        <input
          type="range"
          min={low}
          max={max}
          step={5}
          value={minutes}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label="Minutes allowed"
          aria-valuetext={minutesText(minutes)}
        />
        {suggested >= low && suggested <= max ? (
          <span className="mk-slider-mark" style={{ left: at(suggested) }} aria-hidden="true" />
        ) : null}
      </div>
      <p className="mk-time-note">
        {total > 0 ? (
          <>
            About {perQuestion(each)} a question. JAMB gives {SECONDS_PER_QUESTION}
            {' '}s.
          </>
        ) : (
          'Pick your subjects to see the time per question.'
        )}
        {total > 0 && minutes !== suggested ? (
          <button type="button" className="mk-time-use" onClick={() => onChange(suggested)}>
            Use exam pace ({suggested}
            {' '}min)
          </button>
        ) : null}
      </p>
    </div>
  );
}

function utmeCount(subject: MockSubjectOption, options: MockOptions): number {
  const wanted = subject.compulsory ? options.utme.english_questions : options.utme.other_questions;
  return Math.min(wanted, subject.available, options.max_questions_per_subject);
}

/** The student's own subjects first, the compulsory one before them. */
function startingChoice(exam: MockExamOption): string[] {
  const compulsory = exam.subjects.filter((s) => s.compulsory);
  const mine = exam.subjects.filter((s) => s.mine && !s.compulsory);
  const picked = [...compulsory, ...mine].slice(0, exam.max_subjects);
  if (picked.length === 0 && exam.subjects[0]) picked.push(exam.subjects[0]);
  return picked.map((s) => s.subject_id);
}

export function MockSetup() {
  usePageTitle('Set up a mock');
  const student = useStudent();
  const navigate = useNavigate();
  const loaded = useLoad(() => mockApi.options(student.studentId), [student.studentId]);
  const options = loaded.data;

  const [examId, setExamId] = useState<string | null>(null);
  // ?scheduled=<id> (or "roadmap") opens a scheduled mock: JAMB's format, the student's own
  // subjects. Without it, the student sets up a custom mock.
  const [params] = useSearchParams();
  const scheduled = params.get('scheduled');
  const preset: Preset = scheduled ? 'utme' : 'custom';
  const [chosen, setChosen] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState(120);
  const [starting, setStarting] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const exam = options?.examinations.find((e) => e.examination_id === examId) ?? options?.examinations[0];

  // First load, or a different examination: start from the student's own subjects.
  useEffect(() => {
    if (!exam || !options) return;
    setChosen(startingChoice(exam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.examination_id, options]);

  const byId = useMemo(() => new Map(exam?.subjects.map((s) => [s.subject_id, s]) ?? []), [exam]);

  const countFor = (subject: MockSubjectOption) => {
    if (!options) return 0;
    if (preset === 'utme') return utmeCount(subject, options);
    const wanted =
      counts[subject.subject_id] ??
      (subject.compulsory ? options.utme.english_questions : options.utme.other_questions);
    return clampInt(wanted, 1, Math.min(subject.available, options.max_questions_per_subject));
  };

  const picked = chosen.map((id) => byId.get(id)).filter((s): s is MockSubjectOption => !!s);
  const total = picked.reduce((sum, s) => sum + countFor(s), 0);
  // A scheduled mock: JAMB's own pace for the questions set, so fewer subjects get less time.
  const time = preset === 'utme' ? Math.max(1, Math.ceil((total * SECONDS_PER_QUESTION) / 60)) : minutes;
  const suggested = Math.max(5, Math.round((total * SECONDS_PER_QUESTION) / 60 / 5) * 5);
  const max = exam?.max_subjects ?? 4;

  const toggle = (subject: MockSubjectOption) => {
    if (preset === 'utme' && subject.compulsory) return;
    setChosen((current) => {
      if (current.includes(subject.subject_id)) return current.filter((id) => id !== subject.subject_id);
      if (current.length >= max) return current;
      return [...current, subject.subject_id];
    });
  };

  const start = async () => {
    if (!options || picked.length === 0 || starting) return;
    setStarting(true);
    setIssue(null);
    // Full screen has to be asked for inside the click; the room asks again if this is refused.
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      /* the room's own gate will ask */
    }
    try {
      const paper = await mockApi.start({
        student_id: student.studentId,
        subjects: picked.map((s) => ({ subject_id: s.subject_id, questions: countFor(s) })),
        minutes: time,
        preset,
        ...(scheduled && scheduled !== 'roadmap' ? { scheduled_mock_id: scheduled } : {}),
      });
      navigate(`/mock/${paper.mock_id}`);
    } catch (error) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setIssue(error instanceof Refused || error instanceof Error ? friendly(error) : 'The mock could not start.');
      setStarting(false);
      loaded.reload();
    }
  };

  const hero = (
    <PageHero
      back={{ to: '/mock', label: 'Mock exams' }}
      eyebrow="Mock exam"
      title={preset === 'utme' ? 'Scheduled mock' : 'Custom mock'}
      sub={
        preset === 'utme'
          ? 'JAMB’s format with your own subjects. Check them, then start. Once it starts, the clock doesn’t stop.'
          : 'Choose your subjects, how many questions and how long. Once it starts, the clock doesn’t stop.'
      }
    />
  );

  if (loaded.loading && !options) {
    return (
      <div className="sj-page mk-page">
        {hero}
        <div className="mk-setup">
          <Skeleton height={140} />
          <Skeleton height={220} />
        </div>
      </div>
    );
  }
  if (loaded.error || !options) {
    return (
      <div className="sj-page mk-page">
        {hero}
        <div className="sj-card mk-error">
          <p>{loaded.error ?? 'Something went wrong.'}</p>
          <Button tone="soft" size="sm" onClick={loaded.reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (options.open_mock_id) {
    return (
      <div className="sj-page mk-page">
        {hero}
        <div className="sj-card mk-note">
          <h2 className="sj-display sj-h3">You have a mock running</h2>
          <p>Finish or submit it before you start another. Its clock is still going.</p>
          <Button to={`/mock/${options.open_mock_id}`} trailing={<IconArrowRight size={18} />}>
            Resume it
          </Button>
        </div>
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="sj-page mk-page">
        {hero}
        <div className="sj-card mk-note">
          <h2 className="sj-display sj-h3">No questions ready for a mock yet</h2>
          <p>Add an exam and its subjects, and the mock exam can be built from their questions.</p>
          <Button to="/exams">Exams & subjects</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sj-page mk-page">
      {hero}
      <div className="mk-setup">
        <div className="mk-setup-main">
          {options.examinations.length > 1 ? (
            <section className="sj-card mk-block">
              <h2 className="mk-block-title">Examination</h2>
              <div className="mk-seg" role="radiogroup" aria-label="Examination">
                {options.examinations.map((e) => (
                  <button
                    key={e.examination_id}
                    type="button"
                    role="radio"
                    aria-checked={e.examination_id === exam.examination_id}
                    className={cx('mk-seg-btn', e.examination_id === exam.examination_id && 'on')}
                    onClick={() => setExamId(e.examination_id)}
                  >
                    {e.short_name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="sj-card mk-block">
            <div className="mk-block-head">
              <h2 className="mk-block-title">Your subjects</h2>
            </div>
            <ul className="mk-subjects">
              {/* Only the student's own subjects (founder, 17 Nov 2026); every subject only for a
                  student who has not chosen theirs yet. */}
              {(exam.subjects.some((s) => s.mine || s.compulsory)
                ? exam.subjects.filter((s) => s.mine || s.compulsory)
                : exam.subjects
              ).map((subject) => {
                const on = chosen.includes(subject.subject_id);
                const locked = preset === 'utme' && subject.compulsory;
                const full = !on && chosen.length >= max;
                const count = countFor(subject);
                const wanted =
                  preset === 'utme'
                    ? subject.compulsory
                      ? options.utme.english_questions
                      : options.utme.other_questions
                    : null;
                return (
                  <li key={subject.subject_id} className={cx('mk-subject', on && 'on')}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={locked || full || undefined}
                      className="mk-subject-pick"
                      onClick={() => toggle(subject)}
                      disabled={full}
                    >
                      <span className="mk-check" aria-hidden="true">
                        {locked ? <IconLock size={13} /> : on ? <IconCheck size={14} /> : null}
                      </span>
                      <span className="mk-subject-name">
                        {subject.name}
                        {/* No question counts (founder, 17 Nov 2026); only what is worth saying. */}
                        {subject.compulsory ? <small>Compulsory</small> : null}
                      </span>
                    </button>
                    {on ? (
                      preset === 'utme' ? (
                        <span className="mk-count-fixed sj-mono">
                          {count} Qs
                          {wanted !== null && count < wanted ? <small> (only {count} ready)</small> : null}
                        </span>
                      ) : (
                        <label className="mk-count">
                          <span className="sr-only">Questions in {subject.name}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={Math.min(subject.available, options.max_questions_per_subject)}
                            value={count}
                            onChange={(event) =>
                              setCounts((current) => ({ ...current, [subject.subject_id]: Number(event.target.value) }))
                            }
                          />
                          <span>Qs</span>
                        </label>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {preset === 'custom' ? (
            <section className="sj-card mk-block">
              <div className="mk-block-head">
                <h2 className="mk-block-title">Time allowed</h2>
                <span className="mk-block-note">
                  For {total} question{total === 1 ? '' : 's'}
                </span>
              </div>
              <TimePicker
                minutes={minutes}
                total={total}
                suggested={suggested}
                max={options.max_minutes}
                onChange={(value) => setMinutes(clampInt(value, 5, options.max_minutes))}
              />
            </section>
          ) : null}
        </div>

        <aside className="mk-summary sj-card">
          <span className="sj-eyebrow">Your test</span>
          <div className="mk-summary-big">
            <span className="sj-num">{total}</span>
            <small>questions</small>
          </div>
          <div className="mk-summary-time">
            <IconClock size={18} /> {minutesText(time)}
          </div>
          <ul className="mk-summary-list">
            {picked.map((s) => (
              <li key={s.subject_id}>
                <span>{s.name}</span>
                <span className="sj-mono">{countFor(s)}</span>
              </li>
            ))}
          </ul>
          <ul className="mk-rules">
            <li>Full screen, no hints, no coach until you submit.</li>
            <li>Leaving full screen or switching tabs is recorded.</li>
            <li>At 0:00 your answers are handed in for you.</li>
          </ul>
          {issue ? (
            <p className="mk-issue" role="alert">
              {issue}
            </p>
          ) : null}
          <Button
            size="lg"
            block
            busy={starting}
            disabled={picked.length === 0}
            onClick={() => void start()}
            trailing={<IconArrowRight size={18} />}
          >
            Start the test
          </Button>
        </aside>
      </div>
    </div>
  );
}
