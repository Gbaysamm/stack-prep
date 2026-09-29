-- A lesson's own diagrams: sketches drawn for a question that describes a figure in words.
--
-- Many questions have no printed figure but describe one — a bearing, a ladder against a wall,
-- a triangle given by its sides and angles — and a teacher draws it before working it. The
-- sketch is drawn by hand from the question's numbers (docs/questions/utme/mathematics/
-- sketches/YYYY_qNN.svg, a second one YYYY_qNN_b.svg), checked by the loader (well-formed SVG
-- with a viewBox and a description, nothing in it that runs or fetches), and stored with the
-- lesson it belongs to, so it travels with the lesson to the board. The board shows it as a
-- picture (an <img> of a data: URL), never as markup, and a lesson's marks can point at it
-- (`figure: sketch`) as they point at a printed figure.
--
-- [{"name": "sketch" | "sketch_b", "svg": text, "alt_text": text,
--   "width": int | null, "height": int | null}, ...], in order; [] for none.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE question_lessons
  ADD COLUMN sketches jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(sketches) = 'array');

COMMENT ON COLUMN question_lessons.sketches IS
  'Diagrams drawn for the lesson from the question''s own words, for a question with no printed '
  'figure: [{name, svg, alt_text, width, height}]. Shown as pictures; marks address them as '
  'figure: sketch / sketch_b.';

COMMIT;
