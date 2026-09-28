-- How an examination is sat: every subject on one day, or each paper on its own day.
--
-- A UTME candidate sits four subjects in one computer-based sitting, so there is one exam
-- date for all of them, and asking for a date per subject invited four different answers to
-- one question. A WAEC or NECO candidate sits each paper on its own day, and several papers
-- may fall on the same day. The goal rows stay per subject either way; what changes is who
-- decides the date:
--
--   sits_together = true   one date per student per examination. Saving it for one subject
--                          saves it for every active subject of that examination.
--   sits_together = false  one date per paper. "Days to exam" means the nearest paper still
--                          to come.
--
-- `max_subjects` is how many subjects a candidate may enter (UTME: four), and
-- `compulsory_subject_codes` the ones every candidate sits (UTME: Use of English). Both are
-- facts about the examination, not preferences, so they live on its row.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE examinations
  ADD COLUMN sits_together boolean NOT NULL DEFAULT false,
  ADD COLUMN max_subjects smallint CHECK (max_subjects IS NULL OR max_subjects BETWEEN 1 AND 20),
  ADD COLUMN compulsory_subject_codes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN examinations.sits_together IS
  'True when every subject is sat in one sitting on one day (UTME), so a student has one exam '
  'date for the whole examination. False when each paper has its own date (WAEC, NECO).';
COMMENT ON COLUMN examinations.max_subjects IS
  'How many subjects one candidate may enter; null when the examination sets no limit.';
COMMENT ON COLUMN examinations.compulsory_subject_codes IS
  'Subject codes every candidate sits, such as ENG for UTME Use of English.';

UPDATE examinations
SET sits_together = true, max_subjects = 4, compulsory_subject_codes = ARRAY['ENG'],
    updated_at = now()
WHERE short_name = 'UTME' AND country_code = 'NG';

-- Students who set a different date per UTME subject before this: keep the date they set
-- most recently, since that is their latest word on when they sit, and give it to every
-- active subject of that examination.
WITH latest AS (
  SELECT DISTINCT ON (g.student_id, s.examination_id)
         g.student_id, s.examination_id, g.exam_date
  FROM student_exam_goals g
  JOIN subjects s ON s.id = g.subject_id
  JOIN examinations e ON e.id = s.examination_id
  WHERE e.sits_together AND g.status = 'active' AND g.exam_date IS NOT NULL
  ORDER BY g.student_id, s.examination_id, g.updated_at DESC, g.exam_date
)
UPDATE student_exam_goals g
SET exam_date = latest.exam_date, updated_at = now()
FROM subjects s, latest
WHERE s.id = g.subject_id
  AND latest.student_id = g.student_id
  AND latest.examination_id = s.examination_id
  AND g.status = 'active'
  AND g.exam_date IS DISTINCT FROM latest.exam_date;

COMMIT;
