/**
 * The student's notifications (apps/api routers/notifications.py), held once for the bell and
 * the Notifications page so both always agree. Every change shows at once and is then sent; if
 * the server refuses, the list is fetched again so nothing stays wrong.
 */
import { useEffect, useState } from 'react';

import { failure, reach } from '../lib/friendlyError.js';

export type NoteCategory = 'nudge' | 'reward' | 'plan' | 'report' | 'system';

export interface Notification {
  id: string;
  kind: string;
  category: NoteCategory;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
  read: boolean;
}
export interface Inbox {
  unread: number;
  total: number;
  items: Notification[];
}

let current: Inbox | null = null;
let owner: string | null = null;
let fetchedAt = 0;
const listeners = new Set<(inbox: Inbox | null) => void>();

function publish(next: Inbox | null) {
  current = next;
  listeners.forEach((listen) => listen(next));
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await reach(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!response.ok) throw await failure(response);
  return response;
}

/** Fetch the list again (at most every 30 seconds unless forced). */
export async function refreshInbox(studentId: string, force = false): Promise<void> {
  if (!force && owner === studentId && Date.now() - fetchedAt < 30_000) return;
  owner = studentId;
  fetchedAt = Date.now();
  try {
    const response = await call(`/v1/student/${studentId}/notifications`);
    publish((await response.json()) as Inbox);
  } catch {
    // The bell stays quiet when it cannot load; the page shows what it has.
  }
}

/** Changes the list here at once, then sends the change; on a refusal, fetches the truth. */
function change(studentId: string, edit: (inbox: Inbox) => Inbox, send: () => Promise<unknown>) {
  if (current) publish(edit(current));
  send().catch(() => void refreshInbox(studentId, true));
}

const recount = (items: Notification[], total: number): Inbox => ({
  items,
  total,
  unread: items.filter((n) => !n.read).length,
});

export const notes = {
  setRead: (studentId: string, id: string, read: boolean) =>
    change(
      studentId,
      (inbox) => recount(inbox.items.map((n) => (n.id === id ? { ...n, read } : n)), inbox.total),
      () => call(`/v1/student/${studentId}/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({ read }) }),
    ),
  readAll: (studentId: string) =>
    change(
      studentId,
      (inbox) => recount(inbox.items.map((n) => ({ ...n, read: true })), inbox.total),
      () => call(`/v1/student/${studentId}/notifications/read`, { method: 'POST' }),
    ),
  remove: (studentId: string, id: string) =>
    change(
      studentId,
      (inbox) => recount(inbox.items.filter((n) => n.id !== id), Math.max(0, inbox.total - 1)),
      () => call(`/v1/student/${studentId}/notifications/${id}`, { method: 'DELETE' }),
    ),
};

/** The list, kept up to date; fetched when first used and whenever `refreshKey` changes. */
export function useInbox(studentId: string, refreshKey?: unknown): Inbox | null {
  const [inbox, setInbox] = useState<Inbox | null>(owner === studentId ? current : null);
  useEffect(() => {
    listeners.add(setInbox);
    return () => {
      listeners.delete(setInbox);
    };
  }, []);
  useEffect(() => {
    void refreshInbox(studentId);
  }, [studentId, refreshKey]);
  // A quiet check every two minutes while the page is in view, so a reply arrives on its own.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshInbox(studentId, true);
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [studentId]);
  return inbox;
}

/** Where a notification's button goes, in words. */
export function actionWord(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith('/messages')) return 'Read the reply';
  if (link.startsWith('/settings')) return 'Open your settings';
  if (link.startsWith('/plans')) return 'See your plan';
  if (/^\/(checkup|mock)\/[^/]+\/report/.test(link)) return 'See the report';
  if (link.startsWith('/progress')) return 'See your progress';
  if (link.startsWith('/roadmap')) return 'Open your roadmap';
  if (link.startsWith('/checkup')) return 'Start the check-up';
  if (link.startsWith('/mock')) return 'Go to mock exams';
  return "Go to today's plan";
}

export function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
