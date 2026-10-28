/**
 * Support conversations, announcements and the app's public settings. Mirrors
 * apps/api/src/app/routers/support.py, announcements.py and admin_system.py (public part).
 */
import { failure, reach } from '../lib/friendlyError.js';

export type SupportTopic = 'account' | 'payment' | 'question' | 'app' | 'other';
export type SupportStatus = 'open' | 'answered' | 'closed';

export const SUPPORT_TOPICS: { value: SupportTopic; label: string }[] = [
  { value: 'account', label: 'My account' },
  { value: 'payment', label: 'Payments and plans' },
  { value: 'question', label: 'A question or answer' },
  { value: 'app', label: 'Something not working' },
  { value: 'other', label: 'Something else' },
];
export const topicWord = (topic: SupportTopic) => SUPPORT_TOPICS.find((t) => t.value === topic)?.label ?? topic;

export interface SupportMessage {
  id: string;
  from_staff: boolean;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface ThreadLine {
  id: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  last_body: string;
  last_from_staff: boolean;
  messages: number;
  unread: boolean;
}

export interface Thread extends ThreadLine {
  thread_messages: SupportMessage[];
}

export interface Announcement {
  id: string;
  kind: 'banner' | 'popup';
  title: string;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  tone: 'info' | 'good' | 'warning';
}

export interface PublicSettings {
  signups_open: boolean;
  notice: string;
  support_email: string;
  support_whatsapp: string;
}

/** Sent when a conversation is read or written to, so the unread note can catch up. */
export const SUPPORT_CHANGED = 'stackprep:support-changed';
const changed = <T,>(value: T): T => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SUPPORT_CHANGED));
  return value;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!response.ok) throw await failure(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const supportApi = {
  threads: (studentId: string) => call<ThreadLine[]>(`/v1/student/${studentId}/support`),
  thread: (studentId: string, threadId: string) =>
    call<Thread>(`/v1/student/${studentId}/support/${threadId}`).then(changed),
  start: (studentId: string, body: { topic: SupportTopic; subject: string; body: string }) =>
    call<Thread>(`/v1/student/${studentId}/support`, { method: 'POST', body: JSON.stringify(body) }).then(changed),
  reply: (studentId: string, threadId: string, body: string) =>
    call<Thread>(`/v1/student/${studentId}/support/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then(changed),
  announcements: (studentId: string) => call<Announcement[]>(`/v1/student/${studentId}/announcements`),
  dismiss: (studentId: string, id: string) =>
    call<void>(`/v1/student/${studentId}/announcements/${id}/dismiss`, { method: 'POST' }),
  settings: () => call<PublicSettings>('/v1/app/settings'),
  contact: (body: { name: string; email: string; topic: SupportTopic; subject: string; body: string; website: string }) =>
    call<{ status: 'sent' }>('/v1/contact', { method: 'POST', body: JSON.stringify(body) }),
};

/** "3 Oct, 14:05" for a message's time. */
export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
