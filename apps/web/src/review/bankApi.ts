/** The reviewer's question bank: exams, subjects, papers and their questions. Mirrors
 *  apps/api/src/app/routers/bank.py. Checking and approving a question stay in api.ts. */
import { request as send } from '../lib/friendlyError.js';

export interface ExamLine {
  id: string;
  name: string;
  short_name: string;
  exam_body: string;
  subjects: number;
  questions: number;
}

export interface SubjectCard {
  subject_id: string;
  name: string;
  code: string;
  papers: number;
  questions: number;
  approved: number;
  needs_review: number;
  flagged: number;
  has_topics: boolean;
}

export interface ExamPage {
  exam: ExamLine;
  subjects: SubjectCard[];
  topic_sources: { subject_id: string; name: string; exam: string }[];
}

export interface PaperLine {
  paper_id: string;
  title: string;
  exam_year: number | null;
  own: boolean;
  /** A set of AI-written questions: badged, and the only place questions are imported. */
  ai_generated?: boolean;
  questions: number;
  approved: number;
  needs_review: number;
  flagged: number;
}

/** A subtopic of a subject's syllabus, for the outside AI's prompt (routers/bank_import.py). */
export interface SubtopicLine {
  code: string;
  name: string;
  topic: string;
  covers: string | null;
  questions: number;
}

export interface ImportVerdict {
  index: number;
  ok: boolean;
  problems: string[];
  notes: string[];
  subtopic: string | null;
  stem: string | null;
  question_id: string | null;
}

export interface ImportResult {
  checked: number;
  passed: number;
  saved: number;
  verdicts: ImportVerdict[];
}

export interface SubjectPage {
  exam: ExamLine;
  subject: SubjectCard;
  papers: PaperLine[];
}

export interface QuestionLine {
  question_id: string;
  question_number: string | null;
  stem: string;
  state: 'approved' | 'ready' | 'needs_review';
  answer_checked: boolean;
  level_checked: boolean;
  skill_checked: boolean;
  has_working: boolean;
  open_reports: number;
}

export interface PaperPage {
  exam: ExamLine;
  subject: SubjectCard;
  paper: PaperLine;
  questions: QuestionLine[];
  syllabus_version_id: string | null;
}

export interface QuestionIn {
  question_number?: string | null;
  instructions?: string | null;
  stem: string;
  options: { key: string; body: string }[];
  answer: string;
  solution_steps: string[];
  hints: string[];
  level?: number | null;
  skill_id?: string | null;
}

export type TopicKind = 'topic' | 'subtopic' | 'skill';

export interface TopicNode {
  id: string;
  kind: TopicKind;
  code: string;
  name: string;
  parent_id: string | null;
  /** Questions filed under it: its own for a skill, its skills' together otherwise. */
  questions: number;
}

export interface TopicTree {
  subject_id: string;
  subject_name: string;
  exam_id: string;
  exam_short_name: string;
  syllabus_version_id: string | null;
  items: TopicNode[];
}

export interface FiledQuestion {
  question_id: string;
  question_number: string | null;
  stem: string;
  paper_id: string | null;
  paper_title: string | null;
  state: string;
}

/** Sent after anything in the bank changes, so the menu's counts catch up. */
export const BANK_CHANGED = 'stackprep:bank-changed';
const changed = <T,>(value: T): T => {
  window.dispatchEvent(new Event(BANK_CHANGED));
  return value;
};

const request = <T,>(path: string, init?: RequestInit) => send<T>(`/v1/bank${path}`, init);
const post = <T,>(path: string, body: unknown, method = 'POST') =>
  request<T>(path, { method, body: JSON.stringify(body) }).then(changed);

export const bank = {
  exams: () => request<ExamLine[]>('/exams'),
  exam: (id: string) => request<ExamPage>(`/exams/${id}`),
  addExam: (body: { name: string; short_name: string; exam_body: string }) => post<ExamLine>('/exams', body),
  addSubject: (examId: string, body: { name: string; code?: string; copy_topics_from?: string | null }) =>
    post<SubjectCard>(`/exams/${examId}/subjects`, body),
  subject: (id: string) => request<SubjectPage>(`/subjects/${id}`),
  addPaper: (subjectId: string, body: { exam_year?: number | null; title?: string | null; ai_generated?: boolean }) =>
    post<PaperLine>(`/subjects/${subjectId}/papers`, body),
  removePaper: (id: string, withQuestions = false) =>
    request<void>(`/papers/${id}${withQuestions ? '?with_questions=true' : ''}`, { method: 'DELETE' }).then(changed),
  renamePaper: (id: string, body: { title?: string; exam_year?: number }) =>
    post<PaperLine>(`/papers/${id}`, body, 'PATCH').then(changed),
  subtopics: (subjectId: string) => request<SubtopicLine[]>(`/subjects/${subjectId}/subtopics`),
  importQuestions: (paperId: string, questions: unknown[], apply: boolean) =>
    post<ImportResult>(`/papers/${paperId}/import`, { questions, apply }).then((r) => (apply ? changed(r) : r)),
  paper: (id: string) => request<PaperPage>(`/papers/${id}`),
  addQuestion: (paperId: string, body: QuestionIn) =>
    post<{ question_id: string }>(`/papers/${paperId}/questions`, body),
  editQuestion: (id: string, body: QuestionIn) => post<{ question_id: string }>(`/questions/${id}`, body, 'PUT'),
  paperOf: (questionId: string) =>
    request<{ paper_id: string }>(`/questions/${questionId}/paper`).then((found) => found.paper_id),
  topics: (subjectId: string) => request<TopicTree>(`/subjects/${subjectId}/topics`),
  addTopic: (subjectId: string, body: { name: string; parent_id?: string | null }) =>
    post<TopicNode>(`/subjects/${subjectId}/topics`, body),
  renameTopic: (id: string, name: string) => post<TopicNode>(`/topics/${id}`, { name }, 'PUT'),
  removeTopic: (id: string, moveTo: string | null) =>
    post<{ moved: number }>(`/topics/${id}/remove`, { move_to_skill_id: moveTo }),
  topicQuestions: (id: string) => request<FiledQuestion[]>(`/topics/${id}/questions`),
  removeQuestion: (id: string, reason: string) => post<void>(`/questions/${id}/remove`, { reason }),
  lessons: (subjectId: string) => request<LessonsPage>(`/subjects/${subjectId}/lessons`),
  lesson: (subtopicId: string, part: number) => request<LessonDetail>(`/lessons/${subtopicId}/${part}`),
  editLesson: (subtopicId: string, part: number, moments: { index: number; say: string; write: string | null }[]) =>
    post<LessonEditResult>(`/lessons/${subtopicId}/${part}`, { moments }, 'PUT'),
};

/* ------------------------------------------------------------------ lessons (routers/bank_lessons.py) */

export interface LessonPart {
  part: number;
  title: string | null;
  moments: number;
  minutes: number;
  problems: number;
  edited_at: string | null;
  edited_by: string | null;
}

export interface SubtopicLessons {
  subtopic_id: string;
  code: string;
  name: string;
  questions: number;
  parts: LessonPart[];
}

export interface LessonsPage {
  subject_id: string;
  subject: string;
  exam_id: string | null;
  exam: string | null;
  topics: { name: string; subtopics: SubtopicLessons[] }[];
}

export interface LessonMoment {
  index: number;
  section: string | null;
  say: string;
  write: string | null;
  marks: string[];
}

export interface LessonDetail {
  subtopic_id: string;
  subtopic: string;
  code: string;
  part: number;
  parts: number;
  title: string | null;
  source_file: string;
  minutes: number;
  edited_at: string | null;
  edited_by: string | null;
  moments: LessonMoment[];
  problems: { ask: string; answer: string; working: string[] }[];
}

export interface LessonEditResult {
  saved: boolean;
  problems: string[];
  lesson: LessonDetail;
}
