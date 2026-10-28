/**
 * The admin dashboard, at /admin: everything an admin needs to run Stack Prep.
 *
 * Every page here calls /v1/admin/*, which refuses anyone but an admin (apps/api routers/admin.py);
 * the gate in front only keeps the screen honest about it.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconBolt, IconBook, IconChart, IconFlag, IconLock, IconSettings, IconSparkles, IconUser } from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import { OverviewPage } from './OverviewPage.js';
import { PremiumPage } from './PremiumPage.js';
import { ReportsPage, useOpenReports } from './ReportsPage.js';
import { StaffPage } from './StaffPage.js';
import { StudentPage } from './StudentPage.js';
import { StudentsPage } from './StudentsPage.js';
import { AuditPageView, HealthPage, SettingsPage } from './SystemPages.js';

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
    { to: '/overview', label: 'Overview', icon: <IconChart />, section: 'Main' },
    { to: '/students', label: 'Students', icon: <IconUser />, section: 'People' },
    { to: '/staff', label: 'Staff', icon: <IconLock /> },
    { to: '/reports', label: 'Question reports', icon: <IconFlag />, count: openReports, section: 'Content' },
    { to: '/premium', label: 'Pricing & plans', icon: <IconSparkles />, section: 'Money' },
    { to: '/settings', label: 'Settings', icon: <IconSettings />, section: 'System' },
    { to: '/health', label: 'System health', icon: <IconBolt /> },
    { to: '/audit', label: 'Audit log', icon: <IconBook /> },
  ];
  return (
    <StaffShell title="Admin" nav={nav}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:studentId" element={<StudentPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/premium" element={<PremiumPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/audit" element={<AuditPageView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StaffShell>
  );
}
