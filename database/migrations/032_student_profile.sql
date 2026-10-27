-- What a student tells us about themselves, and how they like their results shown.
--
-- Profile: the school they attend, their state, their class, and the institution and course they
-- are aiming for. Asked during onboarding and editable in account settings; the admin dashboard
-- shows them. All optional: a student can use every part of the app without answering.
--
-- Results: `score_display` is whether a mock result leads with the percentage or with the UTME
-- aggregate out of 400 (the other is always shown beside it). `target_aggregate` is the overall
-- UTME score they are aiming for, out of 400, beside the per-subject targets (/100) in
-- student_exam_goals.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE students
  ADD COLUMN school_name        text CHECK (char_length(school_name) <= 160),
  ADD COLUMN state              text CHECK (char_length(state) <= 60),
  ADD COLUMN class_level        text CHECK (class_level IN ('ss1', 'ss2', 'ss3', 'graduated', 'other')),
  ADD COLUMN target_institution text CHECK (char_length(target_institution) <= 160),
  ADD COLUMN target_course      text CHECK (char_length(target_course) <= 120),
  ADD COLUMN score_display      text NOT NULL DEFAULT 'percentage'
                                CHECK (score_display IN ('percentage', 'aggregate')),
  ADD COLUMN target_aggregate   smallint CHECK (target_aggregate BETWEEN 0 AND 400);

COMMIT;
