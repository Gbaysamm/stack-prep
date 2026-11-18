/**
 * Which app a URL opens. Each has its own router and sign-in:
 *
 *   /             the student app (the bare address is where students arrive), and the
 *                 public site for anyone not signed in
 *   /watch/:id    a lesson on the coach's board, for anyone: the public site plays it in a frame
 *   /review/...   the reviewer dashboard: reviewers and admins only
 *   /admin/...    the admin dashboard: admins only
 *   /tracker      the project tracker, read-only, for anyone with the link
 *   /dev/checkup  the bare check-up screen the student flow grew out of, for trying a session id
 *
 * Each is loaded only when its address is opened, so a visitor to the home page never
 * downloads the dashboards, and the lesson frame never downloads the student app.
 *
 * The student app lived at /student before; an old link there is sent to the same page at /.
 */

import { lazy, Suspense, type ComponentType } from 'react';

/** A named export, loaded on first use. */
function later<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

const AdminApp = later(() => import('./admin/AdminApp.js'), 'AdminApp');
const CheckupPage = later(() => import('./checkup/CheckupPage.js'), 'CheckupPage');
const PrepApp = later(() => import('./prep/PrepApp.js'), 'PrepApp');
const ReviewApp = later(() => import('./review/ReviewApp.js'), 'ReviewApp');
const WatchApp = later(() => import('./site/WatchApp.js'), 'WatchApp');
const PublicTracker = later(() => import('./staff/TrackerPage.js'), 'PublicTracker');
const EmailPreviews = later(() => import('./dev/EmailPreviews.js'), 'EmailPreviews');
const Motion = later(() => import('./dev/Motion.js'), 'Motion');
const ParentConfirm = later(() => import('./site/ParentConfirm.js'), 'ParentConfirm');

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

function Which() {
  const { pathname, search, hash } = window.location;
  if (under(pathname, '/student')) {
    window.location.replace(`${pathname.slice('/student'.length) || '/'}${search}${hash}`);
    return null;
  }
  if (under(pathname, '/watch')) return <WatchApp />;
  if (under(pathname, '/admin')) return <AdminApp />;
  if (under(pathname, '/review')) return <ReviewApp />;
  if (under(pathname, '/tracker')) return <PublicTracker />;
  if (under(pathname, '/dev/checkup')) return <CheckupPage />;
  if (under(pathname, '/dev/emails')) return <EmailPreviews />;
  if (under(pathname, '/dev/motion')) return <Motion />;
  if (under(pathname, '/parent')) return <ParentConfirm />;
  return <PrepApp />;
}

export function App() {
  return (
    <Suspense fallback={null}>
      <Which />
    </Suspense>
  );
}
