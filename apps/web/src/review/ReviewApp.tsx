/**
 * The reviewer dashboard, at /review: the question bank (BankPages.tsx). The menu lists the
 * exams (UTME, and any added: WAEC, Post-UTME…); an exam shows its subjects, a subject its
 * papers by year, a paper its questions to check, edit, add or remove. Reviewers and admins
 * only (apps/api routers/bank.py and review.py check it too).
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { IconBook, IconFlag, IconLayers } from '../prep/icons.js';
import { StaffGate } from '../staff/StaffGate.js';
import { StaffShell, type NavItem } from '../staff/StaffShell.js';
import { REVIEW_CHANGED, api } from './api.js';
import {
  AddExam,
  ExamSubjects,
  FlaggedQuestions,
  PaperQuestions,
  QuestionRedirect,
  SubjectPapers,
} from './BankPages.js';
import { BANK_CHANGED, bank, type ExamLine } from './bankApi.js';

export function ReviewApp() {
  return (
    <BrowserRouter basename="/review">
      <StaffGate allow={['reviewer', 'admin']} title="Reviewer dashboard">
        <ReviewShell />
      </StaffGate>
    </BrowserRouter>
  );
}

/** Inside the gate, so the exams and the reported count are only asked for by signed-in staff. */
function ReviewShell() {
  const [exams, setExams] = useState<ExamLine[] | null>(null);
  const [flagged, setFlagged] = useState<number>();
  useEffect(() => {
    const load = () => {
      bank.exams().then(setExams).catch(() => setExams([]));
      api
        .progress(null, null)
        .then((progress) => setFlagged(progress.flagged))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(REVIEW_CHANGED, load);
    window.addEventListener(BANK_CHANGED, load);
    return () => {
      window.removeEventListener(REVIEW_CHANGED, load);
      window.removeEventListener(BANK_CHANGED, load);
    };
  }, []);

  const nav: NavItem[] = [
    ...(exams ?? []).map((exam, index) => ({
      to: `/exams/${exam.id}`,
      label: exam.short_name,
      icon: <IconBook />,
      section: index === 0 ? 'Exams' : undefined,
    })),
    { to: '/new-exam', label: 'Add an exam', icon: <IconLayers />, section: exams?.length ? undefined : 'Exams' },
    { to: '/reported', label: 'Reported', icon: <IconFlag />, count: flagged, section: 'Needs attention' },
  ];
  return (
    <StaffShell title="Reviewer" nav={nav}>
      <Routes>
        <Route path="/" element={exams === null ? null : <Navigate to={exams[0] ? `/exams/${exams[0].id}` : '/new-exam'} replace />} />
        <Route path="/exams/:examId" element={<ExamSubjects />} />
        <Route path="/subjects/:subjectId" element={<SubjectPapers />} />
        <Route path="/papers/:paperId" element={<PaperQuestions />} />
        <Route path="/question/:questionId" element={<QuestionRedirect />} />
        <Route path="/reported" element={<FlaggedQuestions />} />
        <Route path="/new-exam" element={<NewExam />} />
        {/* The old queue's address. */}
        <Route path="/questions" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StaffShell>
  );
}

function NewExam() {
  const navigate = useNavigate();
  return <AddExam onClose={() => navigate(-1)} onAdded={(id) => navigate(`/exams/${id}`, { replace: true })} />;
}
