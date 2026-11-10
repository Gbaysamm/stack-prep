-- The reviewer's question bank (docs/plans/2026-11-10-reviewer-question-bank.md): exams hold
-- subjects, subjects hold papers, papers hold questions, and a reviewer can add each of them.
--
-- A paper was already one row per subject and year (exam_papers, with the year only on its
-- questions). It now carries its year itself, so an empty paper (a year just added, waiting
-- for its questions) still knows which year it is. A paper of our own (a practice set we
-- write, not a past paper) has no year and is marked `own`; its questions are `authored`.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE exam_papers
  ADD COLUMN exam_year integer CHECK (exam_year BETWEEN 1900 AND 2200),
  ADD COLUMN own boolean NOT NULL DEFAULT false,
  ADD COLUMN created_by uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD CONSTRAINT exam_papers_own_has_no_year CHECK (NOT own OR exam_year IS NULL);

UPDATE exam_papers p
SET exam_year = y.exam_year
FROM (
  SELECT exam_paper_id, max(exam_year) AS exam_year
  FROM questions WHERE exam_paper_id IS NOT NULL
  GROUP BY exam_paper_id
) y
WHERE y.exam_paper_id = p.id;

-- A year is added once per subject; a retired paper frees its year.
CREATE UNIQUE INDEX exam_papers_one_year_idx ON exam_papers(subject_id, exam_year)
  WHERE exam_year IS NOT NULL AND status <> 'retired';
CREATE UNIQUE INDEX exam_papers_own_name_idx ON exam_papers(subject_id, lower(name))
  WHERE own AND status <> 'retired';

-- Who retired a question (removed it from the bank), kept when their account goes.
ALTER TABLE questions
  ADD COLUMN retired_by uuid REFERENCES students(id) ON DELETE SET NULL;

COMMIT;
