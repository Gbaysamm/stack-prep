-- Two more doors to the lesson, and so two more contexts for what was said after it.
--
-- `after_second_guess`: right on the second try, after the hint, but the student said they
-- guessed or were unsure. The working is recommended, as after a doubted first try.
--
-- `after_right`: any other right answer, sure or not saying, where the student chose to see it
-- worked out anyway ("See how it's worked out"). Optional, so the check-in after it is a single
-- light "Was this useful?", and a "still unsure" there reads the same as anywhere else.
--
-- Nothing here is scored: the answer was recorded before the lesson opened.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE lesson_feedback
  DROP CONSTRAINT lesson_feedback_context_check;

ALTER TABLE lesson_feedback
  ADD CONSTRAINT lesson_feedback_context_check
    CHECK (context IN ('after_misses', 'after_guess', 'after_unsure',
                       'after_second_guess', 'after_right'));

COMMIT;
