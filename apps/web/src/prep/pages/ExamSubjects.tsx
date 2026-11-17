/**
 * /exams/:examId. Subjects are chosen on /exams now (founder, 17 Nov 2026: one place to see,
 * add and remove them), so an old link lands there.
 */

import { Navigate } from 'react-router-dom';

export function ExamSubjects() {
  return <Navigate to="/exams" replace />;
}
