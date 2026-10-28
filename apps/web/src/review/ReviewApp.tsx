/**
 * The reviewer dashboard, at /review: the question queue in the same frame as the admin
 * dashboard. Reviewers and admins only (apps/api routers/review.py checks it too).
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconLayers } from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import { REVIEW_CHANGED, api } from './api.js';
import { ReviewPage } from './ReviewPage.js';

export function ReviewApp() {
  return (
    <BrowserRouter basename="/review">
      <StaffGate allow={['reviewer', 'admin']} title="Reviewer dashboard">
        <ReviewShell />
      </StaffGate>
    </BrowserRouter>
  );
}

/** Inside the gate, so the flagged count is only asked for by signed-in staff. */
function ReviewShell() {
  const [flagged, setFlagged] = useState<number>();
  useEffect(() => {
    const load = () =>
      api
        .progress(null, null)
        .then((progress) => setFlagged(progress.flagged))
        .catch(() => undefined);
    void load();
    window.addEventListener(REVIEW_CHANGED, load);
    return () => window.removeEventListener(REVIEW_CHANGED, load);
  }, []);
  const nav: NavItem[] = [
    // The count is the questions with an open report: the queue reviewers most need to see.
    { to: '/questions', label: 'Questions', icon: <IconLayers />, count: flagged },
  ];
  return (
    <StaffShell title="Reviewer" nav={nav}>
      <Routes>
        <Route path="/" element={<Navigate to="/questions" replace />} />
        <Route path="/questions" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/questions" replace />} />
      </Routes>
    </StaffShell>
  );
}
