/**
 * Which app a URL opens. Each has its own router and sign-in:
 *
 *   /             the student app (the bare address is where students arrive)
 *   /review/...   the reviewer dashboard: reviewers and admins only
 *   /admin/...    the admin dashboard: admins only
 *   /dev/checkup  the bare check-up screen the student flow grew out of, for trying a session id
 *
 * The student app lived at /student before; an old link there is sent to the same page at /.
 */

import { AdminApp } from './admin/AdminApp.js';
import { CheckupPage } from './checkup/CheckupPage.js';
import { PrepApp } from './prep/PrepApp.js';
import { ReviewPage } from './review/ReviewPage.js';
import { StaffGate } from './staff/StaffGate.js';

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export function App() {
  const { pathname, search, hash } = window.location;
  if (under(pathname, '/student')) {
    window.location.replace(`${pathname.slice('/student'.length) || '/'}${search}${hash}`);
    return null;
  }
  if (under(pathname, '/admin')) return <AdminApp />;
  if (under(pathname, '/review')) {
    return (
      <StaffGate allow={['reviewer', 'admin']} title="Reviewer dashboard">
        <ReviewPage />
      </StaffGate>
    );
  }
  if (under(pathname, '/dev/checkup')) return <CheckupPage />;
  return <PrepApp />;
}
