import { failure, reach } from '../lib/friendlyError.js';
import type { SubjectScore } from '../student/api';
import { KEEP, shared } from '../lib/shared.js';

/**
 * The student's overview and run history: the calls the home dashboard and the progress page are
 * built on. Everything else the app needs is in student/api.ts.
 */

export interface GoalSummary {
  target_score: number | null;
  exam_date: string | null;
  /** Negative once the date has passed. */
  days_to_exam: number | null;
  minutes_per_day: number | null;
  study_days: number[] | null;
  sessions_before_exam: number | null;
}

/**
 * One weak JAMB topic. The database calls it a subtopic, and its `topic_name` is JAMB's
 * section: show `section_name` as the heading, and `name` as the topic.
 */
export interface WeakSubtopic {
  subtopic_id: string;
  name: string;
  /** The DB topic, which is JAMB's section. Prefer `section_name`. */
  topic_name: string;
  section_id?: string | null;
  section_name?: string | null;
  /** 0..1: the topic score as a fraction. */
  mastery: number;
  confidence: string;
  answered?: number;
  right?: number;
}

export interface LatestCheckup {
  session_id: string;
  finished_at: string;
  answered: number;
  right: number;
  /** That sitting's result, right ÷ answered: the predicted score. */
  score: number | null;
  /** Weakest first, by topic score now. */
  weakest_subtopics: WeakSubtopic[];
}

export interface SubjectOverview {
  subject_id: string;
  subject_name: string;
  examination_short_name: string;
  goal: GoalSummary | null;
  latest_checkup: LatestCheckup | null;
  /** Every number shown for this subject (docs/student-scoring.md). */
  scores?: SubjectScore | null;
  open_checkup_session_id: string | null;
  open_practice_session_id: string | null;
  practice: { runs_finished: number; questions_answered: number; correct_unaided: number; taught: number };
}

export interface PracticeRun {
  session_id: string;
  subject_id: string;
  subject_name: string;
  started_at: string;
  finished: boolean;
  answered: number;
  correct_unaided: number;
  taught: number;
  length: number;
}

export interface ExamPaper {
  subject_id: string;
  subject_name: string;
  exam_date: string | null;
  /** Negative once the paper has been sat. */
  days_to_exam: number | null;
}

/** One exam's countdown. Sat together (UTME): to its one day. Paper by paper (WAEC, NECO): to
 *  the nearest paper still to come, named in `next_subject_names`. Past dates are never next. */
export interface ExamCountdown {
  examination_id: string;
  short_name: string;
  name: string;
  sits_together: boolean;
  next_date: string | null;
  days_to_next: number | null;
  next_subject_names: string[];
  papers: ExamPaper[];
}

export interface Overview {
  student: { student_id: string; display_name: string };
  subjects: SubjectOverview[];
  /** Nearest first. What "days to exam" means across the app. */
  exams: ExamCountdown[];
  /** Up to 8, newest first. */
  recent_runs: PracticeRun[];
  streak_days: number;
  active_today: boolean;
}

export interface PracticeRunPage {
  /** `subtopics` are JAMB's topics, the names to show; `topics`/`sections` are its sections. */
  runs: (PracticeRun & { topics: string[]; sections?: string[]; subtopics?: string[] })[];
  next_before: string | null;
}

async function get<T>(path: string): Promise<T> {
  const response = await reach(`/v1${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

/** Exams the student app never shows: the old demo set and test fixtures. */
const hiddenExam = (shortName: string) => shortName === 'SANDBOX' || shortName.startsWith('PR');

/** The overview without hidden exams' subjects, or the runs and totals that belong to them. */
function visible(overview: Overview): Overview {
  const hidden = new Set(
    overview.subjects.filter((subject) => hiddenExam(subject.examination_short_name)).map((subject) => subject.subject_id),
  );
  const exams = (overview.exams ?? []).filter((exam) => !hiddenExam(exam.short_name));
  if (hidden.size === 0) return { ...overview, exams };
  return {
    ...overview,
    exams,
    subjects: overview.subjects.filter((subject) => !hidden.has(subject.subject_id)),
    recent_runs: overview.recent_runs.filter((run) => !hidden.has(run.subject_id)),
  };
}

export const progressApi = {
  overview: (studentId: string) =>
    shared(`overview:${studentId}`, KEEP.overview, () => get<Overview>(`/student/${studentId}/overview`).then(visible)),
  /** Practice across subjects: right without a hint, in all, this week and the week before. */
  practiceSummary: (studentId: string) =>
    shared(`practice-summary:${studentId}`, KEEP.overview, () => get<PracticeSummary>(`/student/${studentId}/practice/summary`)),
  runs: (studentId: string, limit = 20, before?: string, subjectId?: string) =>
    get<PracticeRunPage>(
      `/student/${studentId}/practice?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}${
        subjectId ? `&subject_id=${subjectId}` : ''
      }`,
    ),
};

export interface PracticeSummary {
  answered: number;
  right: number;
  week_answered: number;
  week_right: number;
  last_week_answered: number;
  last_week_right: number;
}
