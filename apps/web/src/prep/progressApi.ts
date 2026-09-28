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

export interface WeakSubtopic {
  subtopic_id: string;
  name: string;
  topic_name: string;
  /** 0..1 */
  mastery: number;
  confidence: string;
}

export interface LatestCheckup {
  session_id: string;
  finished_at: string;
  answered: number;
  /** Null when the subject has no goal: the projection needs one. */
  score_now: number | null;
  score_low: number | null;
  score_high: number | null;
  score_projected: number | null;
  target_score: number | null;
  weakest_subtopics: WeakSubtopic[];
}

export interface SubjectOverview {
  subject_id: string;
  subject_name: string;
  examination_short_name: string;
  goal: GoalSummary | null;
  latest_checkup: LatestCheckup | null;
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

export interface Overview {
  student: { student_id: string; display_name: string };
  subjects: SubjectOverview[];
  /** Up to 8, newest first. */
  recent_runs: PracticeRun[];
  streak_days: number;
  active_today: boolean;
}

export interface PracticeRunPage {
  runs: (PracticeRun & { topics: string[] })[];
  next_before: string | null;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`/v1${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    let detail = await response.text();
    try {
      detail = (JSON.parse(detail) as { detail?: string }).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

/** Exams the student app never shows: the old demo set and test fixtures. */
const hiddenExam = (shortName: string) => shortName === 'SANDBOX' || shortName.startsWith('PR');

/** The overview without hidden exams' subjects, or the runs and totals that belong to them. */
function visible(overview: Overview): Overview {
  const hidden = new Set(
    overview.subjects.filter((subject) => hiddenExam(subject.examination_short_name)).map((subject) => subject.subject_id),
  );
  if (hidden.size === 0) return overview;
  return {
    ...overview,
    subjects: overview.subjects.filter((subject) => !hidden.has(subject.subject_id)),
    recent_runs: overview.recent_runs.filter((run) => !hidden.has(run.subject_id)),
  };
}

export const progressApi = {
  overview: (studentId: string) => get<Overview>(`/student/${studentId}/overview`).then(visible),
  runs: (studentId: string, limit = 20, before?: string) =>
    get<PracticeRunPage>(
      `/student/${studentId}/practice?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),
};
