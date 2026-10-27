/**
 * Runs the student shapes and looks back on: what a custom run can be built from, starting one,
 * the question-by-question report of a finished run, and taking a run out of the history.
 *
 * A run that does not exist, or was deleted, answers 404; `NotFound` lets a page tell that apart
 * from a network hiccup and say so plainly instead of offering a retry that cannot work.
 */
import { failure, reach } from '../lib/friendlyError.js';

import type { OptionFigure, QuestionFigure } from '../Figures.js';
import type { PracticeState } from '../student/api.js';

export interface PracticeOptions {
  subject_id: string;
  subject_name: string;
  /** Questions that can be served, per year, newest first. */
  years: { exam_year: number; questions: number }[];
  /**
   * In syllabus order. Each entry is a DB topic, which is JAMB's SECTION (a heading); its
   * `subtopics` are JAMB's TOPICS, the units a student picks.
   */
  topics: {
    topic_id: string;
    name: string;
    questions: number;
    subtopics: { subtopic_id: string; name: string; questions: number; mastery: number | null }[];
    section_id?: string | null;
    section_name?: string | null;
  }[];
}

export interface RunFilters {
  topic_ids: string[];
  subtopic_ids: string[];
  exam_years: number[];
}

export interface StartRunIn {
  student_id: string;
  subject_id: string;
  length?: number;
  topic_ids?: string[];
  subtopic_ids?: string[];
  exam_years?: number[];
}

export type Confidence = 'sure' | 'unsure' | 'guessed';
export type Outcome = 'right_first_time' | 'right_after_hint' | 'guessed_right' | 'taught' | 'unanswered';

export interface ReviewAttempt {
  selected_option_key: string;
  is_correct: boolean;
  confidence: Confidence | null;
  hint_used: boolean;
  answered_at: string;
}

export interface ReviewItem {
  /** 1-based, in the order the student met them. */
  position: number;
  question_version_id: string;
  exam_year: number | null;
  question_number: string | null;
  /** The DB topic, which is JAMB's section. Prefer `section_name`. */
  topic_name: string | null;
  /** JAMB's topic: the name to show. */
  subtopic_name: string | null;
  section_name?: string | null;
  passage_title: string | null;
  passage_body: string | null;
  instructions: string | null;
  stem: string;
  options: { option_key: string; body: string; figure?: OptionFigure | null }[];
  figures: QuestionFigure[];
  correct_option_key: string;
  attempts: ReviewAttempt[];
  outcome: Outcome;
  solution_steps: string[];
  hint: string | null;
  lesson_feedback: {
    understood: 'got_it' | 'unsure' | 'too_hard';
    matched_working: 'yes' | 'partly' | 'no' | null;
  } | null;
}

export interface RunReview {
  session_id: string;
  subject_id: string;
  subject_name: string;
  started_at: string;
  finished: boolean;
  length: number;
  answered: number;
  correct_unaided: number;
  guessed_right: number;
  taught: number;
  filters: RunFilters | null;
  items: ReviewItem[];
}

/** The API said there is no such thing here (never existed, not yours, or deleted). */
export class NotFound extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFound';
  }
}

/** A request the API understood but refused, with its own words for why (e.g. 422). */
export class Refused extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'Refused';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(`/v1${path}`, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const problem = await failure(response);
    if (response.status === 404) throw new NotFound(problem.message);
    if (response.status >= 400 && response.status < 500) throw new Refused(problem.message, response.status);
    throw problem;
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}

export const runsApi = {
  options: (studentId: string, subjectId: string) =>
    call<PracticeOptions>(`/student/${studentId}/subjects/${subjectId}/practice-options`),
  start: (body: StartRunIn) =>
    call<PracticeState>('/practice/start', { method: 'POST', body: JSON.stringify(body) }),
  review: (sessionId: string) => call<RunReview>(`/practice/${sessionId}/review`),
  remove: (sessionId: string) => call<null>(`/practice/${sessionId}`, { method: 'DELETE' }),
};


/** Resolves to null instead of failing when the API answers 404, for pages that show "gone". */
export const orGone = <T,>(promise: Promise<T>): Promise<T | null> =>
  promise.catch((error: unknown) => {
    if (error instanceof NotFound) return null;
    throw error;
  });
