/**
 * What a student says after a lesson on the board: whether it landed, and (after a right answer
 * they were not sure of) whether the working was how they had thought it through.
 */

export type LessonContext = 'after_guess' | 'after_unsure' | 'after_misses';
export type Understood = 'got_it' | 'unsure' | 'too_hard';
export type MatchedWorking = 'yes' | 'partly' | 'no';

export interface LessonFeedbackIn {
  context: LessonContext;
  understood: Understood;
  /** Only asked after a right answer; null after a lesson that followed two misses. */
  matched_working: MatchedWorking | null;
}

export interface LessonToRevisit {
  question_version_id: string;
  subject_id: string;
  subject_name: string;
  topic_name: string;
  subtopic_name: string;
  stem_excerpt: string;
  understood: Understood;
  at: string;
}

export interface LessonFeedbackSummary {
  counts: {
    got_it: number;
    unsure: number;
    too_hard: number;
    matched_yes: number;
    matched_partly: number;
    matched_no: number;
  };
  total: number;
  to_revisit: LessonToRevisit[];
}

/** One check-in as the student gave it: every answer, the changed mind too. */
export interface CheckinEntry {
  id: string;
  at: string;
  session_id: string;
  question_version_id: string;
  context: LessonContext;
  understood: Understood;
  matched_working: MatchedWorking | null;
  subject_id: string;
  subject_name: string;
  topic_name: string | null;
  subtopic_name: string | null;
  stem_excerpt: string;
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/v1${path}`, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let detail = await response.text();
    try {
      detail = (JSON.parse(detail) as { detail?: string }).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}

export const lessonFeedbackApi = {
  send: (sessionId: string, questionVersionId: string, body: LessonFeedbackIn) =>
    send<unknown>(`/practice/${sessionId}/lesson/${questionVersionId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  summary: (studentId: string) => send<LessonFeedbackSummary>(`/student/${studentId}/lesson-feedback`),
  entries: (studentId: string) =>
    send<{ entries: CheckinEntry[] }>(`/student/${studentId}/lesson-feedback/entries`).then((body) => body.entries),
};
