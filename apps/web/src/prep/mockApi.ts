/**
 * The mock exam's API: what a mock can hold, starting one, the paper, saving answers, the
 * integrity log, submitting, the report and the history. Mirrors apps/api/src/app/routers/mock.py.
 *
 * The paper never carries the answer key; `correct_option_key` exists only on the report.
 */

import type { QuestionFigure } from '../Figures.js';
import { NotFound, Refused } from './runsApi.js';

export interface MockSubjectOption {
  subject_id: string;
  code: string;
  name: string;
  available: number;
  unseen: number;
  mine: boolean;
  compulsory: boolean;
}

export interface MockExamOption {
  examination_id: string;
  short_name: string;
  name: string;
  max_subjects: number;
  subjects: MockSubjectOption[];
}

export interface MockOptions {
  examinations: MockExamOption[];
  open_mock_id: string | null;
  utme: { english_questions: number; other_questions: number; minutes: number; subjects: number };
  max_questions_per_subject: number;
  max_minutes: number;
}

export interface StartMockIn {
  student_id: string;
  subjects: { subject_id: string; questions: number }[];
  minutes: number;
  preset: 'utme' | 'custom';
}

export interface PaperOption {
  option_key: string;
  body: string;
  /** Why this wrong option tempts; only in a report. */
  why?: string | null;
}

export interface PaperQuestion {
  question_version_id: string;
  position: number;
  stem: string;
  instructions: string | null;
  passage_id: string | null;
  passage_title: string | null;
  passage_body: string | null;
  options: PaperOption[];
  figures: QuestionFigure[];
  selected_option_key: string | null;
  flagged: boolean;
  response_ms: number;
}

export interface PaperSubject {
  subject_id: string;
  session_id: string;
  code: string;
  name: string;
  questions: PaperQuestion[];
}

export interface MockPaper {
  mock_id: string;
  status: 'in_progress' | 'submitted';
  preset: string;
  duration_minutes: number;
  started_at: string;
  deadline_at: string;
  server_now: string;
  seconds_left: number;
  subjects: PaperSubject[];
}

export interface AnswerSave {
  question_version_id: string;
  selected_option_key: string | null;
  flagged: boolean;
  response_ms: number;
}

export interface Saved {
  saved: number;
  server_now: string;
  seconds_left: number;
}

export type EventKind =
  | 'fullscreen_enter'
  | 'fullscreen_exit'
  | 'tab_hidden'
  | 'tab_visible'
  | 'window_blur'
  | 'window_focus'
  | 'copy_blocked'
  | 'paste_blocked'
  | 'menu_blocked';

export interface Tally {
  questions: number;
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** Right ÷ answered as a whole percentage; null when nothing was answered. */
  percent: number | null;
}

export interface ReportItem {
  position: number;
  question_version_id: string;
  stem: string;
  instructions: string | null;
  passage_title: string | null;
  passage_body: string | null;
  options: PaperOption[];
  figures: QuestionFigure[];
  selected_option_key: string | null;
  correct_option_key: string | null;
  flagged: boolean;
  outcome: 'right' | 'wrong' | 'unanswered';
  /** The reviewed working, step by step. */
  solution_steps: string[];
  /** Time the question was visibly open in the room, summed across visits. */
  response_ms: number;
  /** The JAMB topic (the curriculum's subtopic) it tests; null when not classified. */
  subtopic_id: string | null;
  subtopic_name: string | null;
  /** The syllabus section the topic sits in. */
  topic_name: string | null;
}

export interface TopicResult {
  subtopic_id: string;
  name: string;
  topic_name: string | null;
  questions: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface SubjectResult {
  subject_id: string;
  session_id: string;
  code: string;
  name: string;
  tally: Tally;
  items: ReportItem[];
  /** Time the subject's questions were open, summed; only in a report. */
  time_ms: number;
  /** The subject's topics, most wrong first; only in a report. */
  topics: TopicResult[];
}

export interface Integrity {
  fullscreen_exits: number;
  tab_switches: number;
  window_blurs: number;
  copy_blocked: number;
  paste_blocked: number;
  menu_blocked: number;
  events: { kind: EventKind; at: string }[];
}

export interface MockReport {
  mock_id: string;
  preset: string;
  duration_minutes: number;
  started_at: string;
  deadline_at: string;
  submitted_at: string;
  auto_submitted: boolean;
  time_used_seconds: number;
  overall: Tally;
  subjects: SubjectResult[];
  integrity: Integrity;
}

export interface MockSummary {
  mock_id: string;
  status: 'in_progress' | 'submitted';
  preset: string;
  duration_minutes: number;
  started_at: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  overall: Tally | null;
  subjects: SubjectResult[];
  integrity_flags: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/v1/mock${path}`, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let detail = await response.text();
    try {
      const parsed = (JSON.parse(detail) as { detail?: unknown }).detail;
      if (typeof parsed === 'string') detail = parsed;
      else if (Array.isArray(parsed)) detail = 'That choice was not accepted.';
    } catch {
      /* not JSON */
    }
    const message = detail || `Something went wrong (${response.status}).`;
    if (response.status === 404) throw new NotFound(message);
    if (response.status >= 400 && response.status < 500) throw new Refused(message, response.status);
    throw new Error(message);
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}

export const mockApi = {
  options: (studentId: string) => call<MockOptions>(`/options/${studentId}`),
  start: (body: StartMockIn) => call<MockPaper>('/start', { method: 'POST', body: JSON.stringify(body) }),
  paper: (mockId: string) => call<MockPaper>(`/${mockId}`),
  save: (mockId: string, answers: AnswerSave[]) =>
    call<Saved>(`/${mockId}/answers`, { method: 'PUT', body: JSON.stringify({ answers }) }),
  /** Sent with keepalive, so the last events still arrive while the page is closing. */
  events: (mockId: string, events: { kind: EventKind; at_client: string }[]) =>
    call<null>(`/${mockId}/events`, { method: 'POST', body: JSON.stringify({ events }), keepalive: true }),
  submit: (mockId: string, answers: AnswerSave[]) =>
    call<MockReport>(`/${mockId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
  report: (mockId: string) => call<MockReport>(`/${mockId}/report`),
  history: (studentId: string) => call<MockSummary[]>(`/history/${studentId}`),
  remove: (mockId: string) => call<null>(`/${mockId}`, { method: 'DELETE' }),
};

/** "1:05:09" or "4:07": hours only when there are some. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/** "2 hours", "1 hour 30 minutes", "45 minutes". */
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || '0 minutes';
}

export const percentText = (tally: Tally | null | undefined) =>
  tally && tally.percent !== null ? `${tally.percent}%` : '—';
