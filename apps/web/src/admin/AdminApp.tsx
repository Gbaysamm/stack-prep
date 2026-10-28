/**
 * The admin dashboard, at /admin: everything an admin needs to run Stack Prep.
 *
 * Every page here calls /v1/admin/*, which refuses anyone but an admin (apps/api routers/admin.py);
 * the gate in front only keeps the screen honest about it.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  IconBolt,
  IconBook,
  IconBookmark,
  IconBrain,
  IconCalendar,
  IconChart,
  IconCheck,
  IconClock,
  IconFlag,
  IconHome,
  IconLayers,
  IconLock,
  IconMail,
  IconMegaphone,
  IconSettings,
  IconSparkles,
  IconTarget,
  IconTrophy,
  IconUser,
} from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import {
  CheckupsPage,
  MocksPage,
  QualityPage,
  QuestionBankPage,
  QuestionPage,
  SubjectTopicsPage,
  SubjectsPage,
} from './ContentPages.js';
import { HomePage } from './HomePage.js';
import { OverviewPage } from './OverviewPage.js';
import { AiPage, EngagementPage, FeaturesPage, RevenuePage } from './ReportPages.js';
import { PremiumPage } from './PremiumPage.js';
import { ReportsPage, useOpenReports } from './ReportsPage.js';
import { StaffPage } from './StaffPage.js';
import { StudentPage } from './StudentPage.js';
import { StudentsPage } from './StudentsPage.js';
import { AnnouncementsPage, SupportPage, useWaitingSupport } from './SupportPages.js';
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
  const waitingSupport = useWaitingSupport();
  const nav: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: <IconHome />, section: 'Main' },
    { to: '/overview', label: 'Analytics', icon: <IconChart /> },
    { to: '/students', label: 'Students', icon: <IconUser />, section: 'People' },
    { to: '/staff', label: 'Staff', icon: <IconLock /> },
    { to: '/support', label: 'Support', icon: <IconMail />, count: waitingSupport },
    { to: '/announcements', label: 'Announcements', icon: <IconMegaphone /> },
    { to: '/content', label: 'Subjects & topics', icon: <IconBook />, section: 'Content' },
    { to: '/questions', label: 'Question bank', icon: <IconLayers /> },
    { to: '/quality', label: 'Question quality', icon: <IconTarget /> },
    { to: '/reports', label: 'Question reports', icon: <IconFlag />, count: openReports },
    { to: '/mocks', label: 'Mock exams', icon: <IconClock />, section: 'Activity' },
    { to: '/checkups', label: 'Check-ups', icon: <IconCheck /> },
    { to: '/engagement', label: 'Engagement', icon: <IconCalendar />, section: 'Reports' },
    { to: '/features', label: 'Feature usage', icon: <IconLayers /> },
    { to: '/ai', label: 'AI usage', icon: <IconBrain /> },
    { to: '/revenue', label: 'Revenue', icon: <IconTrophy /> },
    { to: '/premium', label: 'Pricing & plans', icon: <IconSparkles />, section: 'Money' },
    { to: '/settings', label: 'Settings', icon: <IconSettings />, section: 'System' },
    { to: '/health', label: 'System health', icon: <IconBolt /> },
    { to: '/audit', label: 'Audit log', icon: <IconBookmark /> },
  ];
  return (
    <StaffShell title="Admin" nav={nav}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/engagement" element={<EngagementPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/revenue" element={<RevenuePage />} />
        <Route path="/content" element={<SubjectsPage />} />
        <Route path="/content/:subjectId" element={<SubjectTopicsPage />} />
        <Route path="/questions" element={<QuestionBankPage />} />
        <Route path="/questions/:questionId" element={<QuestionPage />} />
        <Route path="/quality" element={<QualityPage />} />
        <Route path="/mocks" element={<MocksPage />} />
        <Route path="/checkups" element={<CheckupsPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:studentId" element={<StudentPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/support/:threadId" element={<SupportPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
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
