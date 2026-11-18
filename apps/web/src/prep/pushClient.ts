/**
 * Push notifications on this device (apps/api push.py; founder, 18 Nov 2026). The browser asks
 * the student's permission; then this device's subscription is sent to the API, which pushes
 * every notification to it. On iPhone push needs Stack Prep on the home screen (Apple's rule),
 * so there the bell suggests that instead.
 */
import { failure, reach } from '../lib/friendlyError.js';

export type PushState =
  /** Push is not set up on the server, or this browser cannot do it: say nothing. */
  | 'unavailable'
  /** iPhone or iPad in the browser: add to the home screen first. */
  | 'install'
  /** Can be turned on. */
  | 'off'
  /** On for this device. */
  | 'on'
  /** The student said no in the browser; only the browser's settings can change it. */
  | 'blocked';

let key: Promise<string | null> | null = null;
const serverKey = () =>
  (key ??= reach('/v1/push/key')
    .then((response) => (response.ok ? response.json() : { key: null }))
    .then((body: { key: string | null }) => body.key)
    .catch(() => null));

const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const capable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker, registered once for the whole app. */
export function registerWorker(): void {
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

function bytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(studentId: string, subscription: PushSubscription): Promise<void> {
  const response = await reach(`/v1/student/${studentId}/push-subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw await failure(response);
}

/** Where this device stands; when push is on, it also makes sure the API has the subscription. */
export async function pushState(studentId: string): Promise<PushState> {
  if (!(await serverKey())) return 'unavailable';
  if (!capable()) return ios() && !installed() ? 'install' : 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return 'off';
  void save(studentId, subscription).catch(() => undefined);
  return 'on';
}

/** Ask the browser, subscribe this device, and tell the API. */
export async function turnOnPush(studentId: string): Promise<PushState> {
  const applicationServerKey = await serverKey();
  if (!applicationServerKey || !capable()) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes(applicationServerKey) as BufferSource,
    }));
  await save(studentId, subscription);
  return 'on';
}
