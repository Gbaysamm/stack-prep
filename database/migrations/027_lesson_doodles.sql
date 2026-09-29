-- A lesson's own doodles: small pictures drawn for a question to make its content make sense.
--
-- A moment of a written lesson may bring a doodle onto the board (`doodle: {name, caption?,
-- near?}` in its moment), drawn by the pen beside a line: a wavy corrugated roofing sheet on a
-- little house for "corrugated", a snake with a bulge in its belly for "eats big meals". Most
-- are drawn for the one question (docs/questions/utme/<subject>/doodles/YYYY_qNN_x.svg, named
-- 'custom:YYYY_qNN_x'); a few come from the board's shared library, which the web app carries
-- itself and is not stored here. The loader checks each file (database/lesson_doodles.py:
-- well-formed SVG in the board's art format, an aria-label that describes it, nothing in it
-- that runs or fetches) and stores it with the lesson it belongs to, so it travels with the
-- lesson to the board, which cleans it again before drawing it.
--
-- [{"name": "custom:YYYY_qNN_x", "svg": text, "alt_text": text}, ...], in file order; [] for none.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE question_lessons
  ADD COLUMN doodles jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(doodles) = 'array');

COMMENT ON COLUMN question_lessons.doodles IS
  'Pictures drawn for the lesson''s board, to make the question make sense: '
  '[{name, svg, alt_text}], named custom:YYYY_qNN_x by the moments that bring them in.';

COMMIT;
