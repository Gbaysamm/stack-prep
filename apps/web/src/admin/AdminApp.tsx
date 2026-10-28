/**
 * The admin dashboard, at /admin: everything an admin needs to run Stack Prep.
 *
 * Every page here calls /v1/admin/*, which refuses anyone but an admin (apps/api routers/admin.py);
 * the gate in front only keeps the screen honest about it.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconFlag, IconUser } from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import { ReportsPage, useOpenReports } from './ReportsPage.js';
import { StaffPage } from './StaffPage.js';

export function AdminApp() {
  return (
    <BrowserRouter basename="/admin">
      <StaffGate allow={['admin']} title="Admin dashboard">
        <AdminShell />
      </StaffGate>
    </BrowserRouter>
  );
}

/** Inside the gate, so the open-report count is only asked for by a signed-in admin. */
function AdminShell() {
  const openReports = useOpenReports();
  const nav: NavItem[] = [
    { to: '/reports', label: 'Reports', icon: <IconFlag />, count: openReports },
    { to: '/staff', label: 'Staff', icon: <IconUser /> },
  ];
  return (
    <StaffShell title="Admin" nav={nav}>
      <Routes>
        <Route path="/" element={<Navigate to="/reports" replace />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StaffShell>
  );
}
