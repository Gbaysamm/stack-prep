/**
 * Stack Prep: the student app, at /student.
 *
 * Every screen has its own address, so back, forward, refresh and a shared link all do what a
 * student expects. Pages inside AppShell carry the navigation; the check-up, a practice run, the
 * board and the mock exam room are focus pages that have none.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import './prep.css';
import { CheckIns } from './pages/CheckIns.js';
import { CheckupHub } from './pages/CheckupHub.js';
import { CheckupReport } from './pages/CheckupReport.js';
import { CheckupRoom } from './pages/CheckupRoom.js';
import { Exams } from './pages/Exams.js';
import { ExamSubjects } from './pages/ExamSubjects.js';
import { Goal } from './pages/Goal.js';
import { Home } from './pages/Home.js';
import { Help } from './pages/Help.js';
import { MockHub } from './pages/MockHub.js';
import { MockReport } from './pages/MockReport.js';
import { MockRoom } from './pages/MockRoom.js';
import { MockSetup } from './pages/MockSetup.js';
import { HelpNumbers, HowItsWorkedOutRedirect } from './pages/HelpNumbers.js';
import { NotFound } from './pages/NotFound.js';
import { Onboarding } from './pages/Onboarding.js';
import { PracticeHub } from './pages/PracticeHub.js';
import { PracticeRoom } from './pages/PracticeRoom.js';
import { Profile } from './pages/Profile.js';
import { Progress } from './pages/Progress.js';
import { RunBuilder } from './pages/RunBuilder.js';
import { RunReport } from './pages/RunReport.js';
import { RunSummary } from './pages/RunSummary.js';
import { SubjectHub } from './pages/SubjectHub.js';
import { Welcome } from './pages/Welcome.js';
import { AppShell } from './shell.js';
import { IdentityProvider, RequireStudent, useIdentity } from './store.js';
import { ToastProvider } from './ui.js';

function Start() {
  const { identity } = useIdentity();
  return identity ? <Navigate to="/home" replace /> : <Welcome />;
}

export function PrepApp() {
  return (
    <BrowserRouter basename="/student">
      <IdentityProvider>
        <div className="sj">
          <ToastProvider>
            <Routes>
              <Route path="/" element={<Start />} />
              <Route
                element={
                  <RequireStudent>
                    <AppShell />
                  </RequireStudent>
                }
              >
                <Route path="/home" element={<Home />} />
                <Route path="/exams" element={<Exams />} />
                <Route path="/exams/:examId" element={<ExamSubjects />} />
                <Route path="/subjects/:subjectId" element={<SubjectHub />} />
                <Route path="/subjects/:subjectId/goal" element={<Goal />} />
                <Route path="/practice" element={<PracticeHub />} />
                <Route path="/practice/new" element={<RunBuilder />} />
                <Route path="/practice/:sessionId/summary" element={<RunSummary />} />
                <Route path="/practice/:sessionId/report" element={<RunReport />} />
                <Route path="/checkup" element={<CheckupHub />} />
                <Route path="/checkup/:sessionId/report" element={<CheckupReport />} />
                <Route path="/mock" element={<MockHub />} />
                <Route path="/mock/new" element={<MockSetup />} />
                <Route path="/mock/:mockId/report" element={<MockReport />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/progress/check-ins" element={<CheckIns />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/help" element={<Help />} />
                <Route path="/help/numbers" element={<HelpNumbers />} />
                <Route path="/how-its-worked-out" element={<HowItsWorkedOutRedirect />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route
                path="/practice/:sessionId/*"
                element={
                  <RequireStudent>
                    <PracticeRoom />
                  </RequireStudent>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <RequireStudent>
                    <Onboarding />
                  </RequireStudent>
                }
              />
              <Route
                path="/mock/:mockId"
                element={
                  <RequireStudent>
                    <MockRoom />
                  </RequireStudent>
                }
              />
              <Route
                path="/checkup/:sessionId"
                element={
                  <RequireStudent>
                    <CheckupRoom />
                  </RequireStudent>
                }
              />
            </Routes>
          </ToastProvider>
        </div>
      </IdentityProvider>
    </BrowserRouter>
  );
}
