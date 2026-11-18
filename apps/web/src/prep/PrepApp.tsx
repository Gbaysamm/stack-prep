/**
 * Stack Prep: the student app, at /student.
 *
 * Every screen has its own address, so back, forward, refresh and a shared link all do what a
 * student expects. Pages inside AppShell carry the navigation; the check-up, a practice run, the
 * board and the mock exam room are focus pages that have none.
 */

import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import './prep.css';
import { FaqPage } from '../site/Faq.js';
import { Landing } from '../site/Landing.js';
import { PrivacyPage, TermsPage } from '../site/Legal.js';
import { AboutPage, ContactPage, HowItWorksPage, PricingPage } from '../site/Pages.js';
import { NotFound } from './pages/NotFound.js';
import { Welcome } from './pages/Welcome.js';
import { PremiumProvider } from './premium.js';
import { registerWorker } from './pushClient.js';
import { AppShell } from './shell.js';
import { IdentityProvider, RequireStudent, useIdentity } from './store.js';
import { ToastProvider } from './ui.js';

/** Pages behind sign-in, each loaded the first time it is opened (shell.tsx shows a spinner). */
/** Every page's code loader, so the app can fetch them all in the background once it is up. */
const LOADERS: (() => Promise<unknown>)[] = [];

function later<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  LOADERS.push(load);
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

/**
 * Fetch every page's code quietly after the app has started (founder, 17 Nov 2026: a page
 * opened for the first time waited on its code, with a spinner, before its own skeleton).
 * Done while the browser is idle, one after another, so it never competes with the page.
 */
function usePreloadPages() {
  useEffect(() => {
    // Only on the built site: in development each page is hundreds of separate files, and
    // fetching them all slows the machine the app is being tested on.
    if (!import.meta.env.PROD) return;
    let stopped = false;
    const idle = (go: () => void) =>
      'requestIdleCallback' in window
        ? (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(go)
        : globalThis.setTimeout(go, 200);
    const next = (index: number) => {
      if (stopped || index >= LOADERS.length) return;
      idle(() => void LOADERS[index]!().catch(() => undefined).finally(() => next(index + 1)));
    };
    const start = window.setTimeout(() => next(0), 1500);
    return () => {
      stopped = true;
      window.clearTimeout(start);
    };
  }, []);
}
const CheckIns = later(() => import('./pages/CheckIns.js'), 'CheckIns');
const Lesson = later(() => import('./pages/Lesson.js'), 'Lesson');
const LessonAfterPage = later(() => import('./pages/LessonAfter.js'), 'LessonAfterPage');
const CheckupHub = later(() => import('./pages/CheckupHub.js'), 'CheckupHub');
const CheckupReport = later(() => import('./pages/CheckupReport.js'), 'CheckupReport');
const CheckupRoom = later(() => import('./pages/CheckupRoom.js'), 'CheckupRoom');
const Exams = later(() => import('./pages/Exams.js'), 'Exams');
const ExamSubjects = later(() => import('./pages/ExamSubjects.js'), 'ExamSubjects');
const Subjects = later(() => import('./pages/Subjects.js'), 'Subjects');
const Goal = later(() => import('./pages/Goal.js'), 'Goal');
const Home = later(() => import('./pages/Home.js'), 'Home');
const Roadmap = later(() => import('./pages/Roadmap.js'), 'Roadmap');
const Help = later(() => import('./pages/Help.js'), 'Help');
const MockHub = later(() => import('./pages/MockHub.js'), 'MockHub');
const MockReport = later(() => import('./pages/MockReport.js'), 'MockReport');
const MockRoom = later(() => import('./pages/MockRoom.js'), 'MockRoom');
const MockSetup = later(() => import('./pages/MockSetup.js'), 'MockSetup');
const SupportThread = later(() => import('./pages/Support.js'), 'SupportThread');
const Messages = later(() => import('./pages/Support.js'), 'Messages');
const Notifications = later(() => import('./pages/Notifications.js'), 'Notifications');
const Onboarding = later(() => import('./pages/Onboarding.js'), 'Onboarding');
const PracticeHub = later(() => import('./pages/PracticeHub.js'), 'PracticeHub');
const PracticeRoom = later(() => import('./pages/PracticeRoom.js'), 'PracticeRoom');
const Profile = later(() => import('./pages/Profile.js'), 'Profile');
const Settings = later(() => import('./pages/Settings.js'), 'Settings');
const Bookmarks = later(() => import('./pages/Bookmarks.js'), 'Bookmarks');
const BookmarksSubject = later(() => import('./pages/Bookmarks.js'), 'BookmarksSubject');
const Progress = later(() => import('./pages/Progress.js'), 'Progress');
const RunBuilder = later(() => import('./pages/RunBuilder.js'), 'RunBuilder');
const RunReport = later(() => import('./pages/RunReport.js'), 'RunReport');
const RunSummary = later(() => import('./pages/RunSummary.js'), 'RunSummary');
const SubjectHub = later(() => import('./pages/SubjectHub.js'), 'SubjectHub');
const HelpNumbers = later(() => import('./pages/HelpNumbers.js'), 'HelpNumbers');
const HowItsWorkedOutRedirect = later(() => import('./pages/HelpNumbers.js'), 'HowItsWorkedOutRedirect');
const Plans = later(() => import('./pages/Plans.js'), 'Plans');
const PlanPaid = later(() => import('./pages/Plans.js'), 'PlanPaid');

/** The bare address is the public home page for everyone, signed in or not (its menu then says
 *  "Open the app"). The sign-up and log-in forms (?mode=signup, ?mode=login) send someone
 *  already signed in on to their home instead. */
function Start() {
  const { identity } = useIdentity();
  const [params] = useSearchParams();
  if (params.get('mode')) return identity ? <Navigate to="/home" replace /> : <Welcome />;
  return <Landing />;
}

export function PrepApp() {
  usePreloadPages();
  // The service worker that shows push notifications (pushClient.ts).
  useEffect(registerWorker, []);
  return (
    <BrowserRouter>
      <IdentityProvider>
        <div className="sj">
          <ToastProvider>
            <PremiumProvider>
              <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Start />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route
                  element={
                    <RequireStudent>
                      <AppShell />
                    </RequireStudent>
                  }
                >
                  <Route path="/home" element={<Home />} />
                  <Route path="/roadmap" element={<Roadmap />} />
                  <Route path="/exams" element={<Exams />} />
                  <Route path="/exams/:examId" element={<ExamSubjects />} />
                  <Route path="/subjects" element={<Subjects />} />
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
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/bookmarks" element={<Bookmarks />} />
                  <Route path="/bookmarks/:subject" element={<BookmarksSubject />} />
                  <Route path="/plans" element={<Plans />} />
                  <Route path="/plans/paid" element={<PlanPaid />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/help/numbers" element={<HelpNumbers />} />
                  <Route path="/help/messages/:threadId" element={<SupportThread />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/notifications/:noteId" element={<Notifications />} />
                  <Route path="/messages/:threadId" element={<SupportThread />} />
                  <Route path="/how-its-worked-out" element={<HowItsWorkedOutRedirect />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route
                  path="/lesson/:subtopicId/after"
                  element={
                    <RequireStudent>
                      <LessonAfterPage />
                    </RequireStudent>
                  }
                />
                <Route
                  path="/lesson/:subtopicId"
                  element={
                    <RequireStudent>
                      <Lesson />
                    </RequireStudent>
                  }
                />
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
              </Suspense>
            </PremiumProvider>
          </ToastProvider>
        </div>
      </IdentityProvider>
    </BrowserRouter>
  );
}
