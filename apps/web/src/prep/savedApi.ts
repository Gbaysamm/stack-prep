/**
 * Bookmarks and problem reports. Mirrors apps/api/src/app/routers/saved.py.
 */
import { failure, reach } from '../lib/friendlyError.js';

export interface Bookmark {
  question_id: string;
  question_version_id: string;
  subject_id: string | null;
  subject_name: string | null;
  topic_name: string | null;
  exam_year: number | null;
  stem: string;
  created_at: string;
  /** False when the question can no longer be practised. */
  practisable: boolean;
}

export type ReportReason = 'wrong_answer' | 'ambiguous' | 'typo' | 'image_missing' | 'off_syllabus' | 'other';
export type ReportPlace = 'practice' | 'checkup' | 'mock' | 'review' | 'lesson';

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'wrong_answer', label: 'The answer looks wrong', hint: 'The marked answer is not the right one.' },
  { value: 'ambiguous', label: 'It is unclear', hint: 'More than one option could be right, or the question is confusing.' },
  { value: 'typo', label: 'A typing mistake', hint: 'A word, number or symbol is wrong or missing.' },
  { value: 'image_missing', label: 'A picture is missing or wrong', hint: 'The question needs a diagram it does not show.' },
  { value: 'off_syllabus', label: 'Not on my syllabus', hint: 'This is not something the exam tests.' },
  { value: 'other', label: 'Something else', hint: 'Tell us below.' },
];

/** Sent whenever a bookmark is added or removed, so every list and toggle can catch up. */
export const BOOKMARKS_CHANGED = 'stackprep:bookmarks-changed';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(`/v1/student${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

const changed = <T,>(value: T): T => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BOOKMARKS_CHANGED));
  return value;
};

export const savedApi = {
  bookmarks: (studentId: string) => call<Bookmark[]>(`/${studentId}/bookmarks`),
  /** Each saved question in full (passage, options, answer, working), newest first. */
  full: (studentId: string) =>
    call<{ items: import('./runsApi.js').ReviewItem[] }>(`/${studentId}/bookmarks-full`).then((got) => got.items),
  isBookmarked: (studentId: string, versionId: string) =>
    call<{ bookmarked: boolean }>(`/${studentId}/bookmarks/${versionId}`).then((state) => state.bookmarked),
  bookmark: (studentId: string, versionId: string) =>
    call<{ bookmarked: boolean }>(`/${studentId}/bookmarks/${versionId}`, { method: 'PUT' }).then(changed),
  unbookmark: (studentId: string, versionId: string) =>
    call<{ bookmarked: boolean }>(`/${studentId}/bookmarks/${versionId}`, { method: 'DELETE' }).then(changed),
  report: (
    studentId: string,
    body: {
      question_version_id: string;
      reason: ReportReason;
      detail?: string;
      where: ReportPlace;
      session_id?: string;
    },
  ) =>
    call<{ status: 'received' | 'already' }>(`/${studentId}/reports`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
