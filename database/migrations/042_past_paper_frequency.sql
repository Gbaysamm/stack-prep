-- How often each subtopic came up in the real past papers we hold (product spec §9.2,
-- `historical_share`).
--
-- No subject has an approved printed paper structure yet, so until now every subtopic was
-- weighted equally and the planner could not tell a topic set every year from one set once.
-- The bank's past papers are JAMB's own, whole papers, year by year (9 to 21 per subject), so
-- how often a subtopic appears across them is real evidence of how the exam samples the
-- syllabus. Only questions on a dated past paper count: never a set of our own, which would
-- make our writing the examiner's.
--
-- The share itself (smoothed, so a subtopic seen once is not treated as never) is worked out
-- by the API (routers/checkup.py `_subtopics`), where the printed structure, when one is
-- approved, still wins.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE VIEW subtopic_past_paper_frequency AS
SELECT
  sub.syllabus_version_id,
  sub.id AS subtopic_id,
  sub.parent_id AS topic_id,
  count(DISTINCT q.id) FILTER (WHERE p.id IS NOT NULL) AS past_questions,
  count(DISTINCT p.exam_year) FILTER (WHERE p.id IS NOT NULL) AS years_seen
FROM curriculum_items sub
LEFT JOIN curriculum_items skill
  ON skill.parent_id = sub.id AND skill.item_type = 'skill'
LEFT JOIN question_classifications c
  ON c.curriculum_item_id = skill.id
 AND c.classification_role = 'primary'
 AND c.review_status = 'approved'
LEFT JOIN questions q
  ON q.id = c.question_id AND q.retired_at IS NULL
LEFT JOIN exam_papers p
  ON p.id = q.exam_paper_id AND p.exam_year IS NOT NULL AND NOT p.own
WHERE sub.item_type = 'subtopic'
GROUP BY sub.syllabus_version_id, sub.id, sub.parent_id;

COMMENT ON VIEW subtopic_past_paper_frequency IS
  'Questions per subtopic on dated past papers (spec 9.2 historical_share); own sets excluded.';

COMMIT;
