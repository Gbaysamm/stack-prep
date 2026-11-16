/**
 * The mock exam's API: what a mock can hold, starting one, the paper, saving answers, the
 * integrity log, submitting, the report and the history. Mirrors apps/api/src/app/routers/mock.py.
 *
 * The paper never carries the answer key; `correct_option_key` exists only on the report.
 */
import { failure, reach } from '../lib/friendlyError.js';

import type { OptionFigure, QuestionFigure } from '../Figures.js';
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
  /** A mock Stack Prep scheduled: sat once, in JAMB's format. */
  scheduled_mock_id?: string;
}

/** How far the student is from a custom mock, and when it is likely to open. */
export interface Readiness {
  ready: boolean;
  /** The subjects still to practise, by name. */
  short: string[];
  /** Topics practised in runs, and how many the unlock needs. */
  subjects: { name: string; practised: number; needed: number }[];
  to_go: number;
  /** New topics a week: the student's own over the last two weeks, or a starting pace. */
  pace_per_week: number;
  measured: boolean;
  /** YYYY-MM-DD */
  ready_on: string | null;
}

/** A mock set for the student: by Stack Prep (`stack`) or by their roadmap (`roadmap`). */
export interface ScheduledMock {
  /** The schedule's id; "roadmap" for the roadmap's own. */
  id: string;
  source: 'stack' | 'roadmap';
  title: string;
  opens_on: string;
  closes_on: string;
  state: 'open' | 'upcoming';
}

export interface PaperOption {
  option_key: string;
  body: string;
  /** Why this wrong option tempts; only in a report. */
  why?: string | null;
  /** The option's drawing, when the option is a picture; `body` is then only its label. */
  figure?: OptionFigure | null;
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
  /** Right ÷ every question set (a skip scores nothing), as a whole percentage. */
  percent: number | null;
  /** Overall only: the UTME aggregate out of 400 (each subject out of 100, averaged, times 4). */
  aggregate?: number | null;
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
  /** The scheduled mock's name, when Stack Prep set it. */
  title?: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(`/v1/mock${path}`, {
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
  /** Whether a custom mock is open, and the subjects still to practise. */
  readiness: (studentId: string) => call<Readiness>(`/readiness/${studentId}`),
  /** Mocks set for the student, soonest first. */
  scheduled: (studentId: string) => call<ScheduledMock[]>(`/scheduled/${studentId}`),
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
