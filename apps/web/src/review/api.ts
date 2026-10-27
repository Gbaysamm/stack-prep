/** Thin typed wrapper over the review endpoints. */
import { request as send } from '../lib/friendlyError.js';

import type { OptionFigure } from '../Figures.js';

export interface Reviewer {
  id: string;
  display_name: string;
}

export interface QueueItem {
  question_id: string;
  question_version_id: string;
  exam_year: number | null;
  paper_code: string | null;
  question_number: string | null;
  stem: string;
  review_status: string;
  answer_checked: boolean;
  level_checked: boolean;
  has_approved_skill: boolean;
  has_solution: boolean;
  has_hint: boolean;
  open_reports: number;
}

export interface Option {
  id: string;
  option_key: string;
  body: string;
  is_correct: boolean;
  display_order: number;
  /** The option's drawing, when the option is a picture; `body` is then only its label. */
  figure?: OptionFigure | null;
}

export interface Report {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
}

export interface QuestionDetail {
  question_id: string;
  question_version_id: string;
  subject_id: string;
  syllabus_version_id: string | null;
  exam_year: number | null;
  paper_code: string | null;
  question_number: string | null;
  instructions: string | null;
  stem: string;
  passage_title: string | null;
  passage_body: string | null;
  options: Option[];
  marks: number | null;
  expected_seconds: number | null;
  mastery_level_number: number | null;
  level_source: string;
  level_confidence: string | null;
  answer_source: string;
  answer_confidence: string | null;
  review_status: string;
  solution_steps: string[];
  hints: string[];
  primary_skill_id: string | null;
  primary_skill_code: string | null;
  primary_skill_name: string | null;
  classification_status: string | null;
  classification_reason: string | null;
  reports: Report[];
}

export interface Progress {
  total: number;
  answer_checked: number;
  level_checked: number;
  skill_approved: number;
  ready: number;
  approved: number;
  flagged: number;
}

export interface Skill {
  id: string;
  code: string;
  name: string;
  topic: string | null;
}

export interface PaperYear {
  exam_year: number;
  questions: number;
}

export type QueueState =
  | 'needs_review'
  | 'needs_answer'
  | 'needs_level'
  | 'flagged'
  | 'ready'
  | 'approved';

/** Every review call, signed in: a failure is a sentence, and an ended session asks to sign in. */
const request = <T,>(path: string, init?: RequestInit) => send<T>(`/v1/review${path}`, init);

export const api = {
  queue: (state: QueueState, examYear: number | null) => {
    const params = new URLSearchParams({ state, limit: '200' });
    if (examYear !== null) params.set('exam_year', String(examYear));
    return request<QueueItem[]>(`/queue?${params.toString()}`);
  },

  years: () => request<PaperYear[]>('/years'),

  progress: (examYear: number | null) =>
    request<Progress>(`/progress${examYear !== null ? `?exam_year=${examYear}` : ''}`),

  question: (id: string) => request<QuestionDetail>(`/questions/${id}`),

  skills: (syllabusVersionId: string) =>
    request<Skill[]>(`/skills?syllabus_version_id=${syllabusVersionId}`),

  setAnswer: (id: string, optionKey: string) =>
    request<QuestionDetail>(`/questions/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ option_key: optionKey }),
    }),

  setLevel: (id: string, level: number) =>
    request<QuestionDetail>(`/questions/${id}/level`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),

  decideSkill: (id: string, curriculumItemId?: string, reason?: string) =>
    request<QuestionDetail>(`/questions/${id}/skill`, {
      method: 'POST',
      body: JSON.stringify({
        curriculum_item_id: curriculumItemId ?? null,
        reason: reason ?? null,
      }),
    }),

  setContent: (id: string, solutionSteps: string[], hints: string[]) =>
    request<QuestionDetail>(`/questions/${id}/content`, {
      method: 'POST',
      body: JSON.stringify({
        solution_steps: solutionSteps,
        hints,
      }),
    }),

  approve: (id: string) =>
    request<QuestionDetail>(`/questions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  resolveReport: (reportId: string, note: string) =>
    request<{ status: string }>(`/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
};
