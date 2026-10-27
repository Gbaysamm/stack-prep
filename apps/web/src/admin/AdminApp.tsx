/**
 * The admin dashboard, at /admin: everything an admin needs to run Stack Prep.
 *
 * Every page here calls /v1/admin/*, which refuses anyone but an admin (apps/api routers/admin.py);
 * the gate in front only keeps the screen honest about it.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconUser } from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import { StaffPage } from './StaffPage.js';

const NAV: NavItem[] = [{ to: '/staff', label: 'Staff', icon: <IconUser /> }];

export function AdminApp() {
  return (
    <BrowserRouter basename="/admin">
      <StaffGate allow={['admin']} title="Admin dashboard">
        <StaffShell title="Admin" nav={NAV}>
          <Routes>
            <Route path="/" element={<Navigate to="/staff" replace />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </StaffShell>
      </StaffGate>
    </BrowserRouter>
  );
}
