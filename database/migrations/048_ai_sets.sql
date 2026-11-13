-- AI-written question sets, kept apart from the real bank (founder, 13 Nov 2026).
--
-- A subject's "own sets" can now be marked AI-generated: questions written by an AI (pasted in
-- as JSON from another tool, or written with the plan's API credit), each checked and approved
-- by a reviewer before any student sees it. Never a past paper and never a year: the badge
-- shows on the set and on every question in it, so nobody takes them for real past questions.

BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE exam_papers
  ADD COLUMN ai_generated boolean NOT NULL DEFAULT false;
ALTER TABLE exam_papers
  ADD CONSTRAINT exam_papers_ai_is_own CHECK (NOT ai_generated OR own);

COMMIT;
