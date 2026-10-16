-- Options that are pictures.
--
-- Some Physics questions print their options as drawings: four transistor symbols, four
-- graphs, four circuits. The student chooses a picture, so each option needs its own figure,
-- and a figure has so far belonged only to a whole question version (or a passage).
--
-- question_assets.option_key says which option a figure draws. NULL, as every existing row
-- is, means the figure belongs to the question itself, exactly as before. When set it is the
-- option's letter, as question_options.option_key spells it, and the row must hang off a
-- question version: a passage has no options.
--
-- Nothing about approval changes. check_question_version() and
-- check_question_version_asset_descriptions() already look at every asset on a version, so an
-- option's picture needs alt text a person confirmed and a verified licence before its
-- version can be approved, the same as the question's own figure. That is right: the alt text
-- is what a blind student chooses between.
BEGIN;
SET LOCAL search_path = stackprep, public;

ALTER TABLE question_assets
  ADD COLUMN option_key text
    CHECK (option_key IS NULL OR option_key IN ('A', 'B', 'C', 'D', 'E')),
  ADD CONSTRAINT question_assets_option_on_version
    CHECK (option_key IS NULL OR question_version_id IS NOT NULL);

-- One picture per option of a version.
CREATE UNIQUE INDEX question_assets_option_idx
  ON question_assets (question_version_id, option_key)
  WHERE option_key IS NOT NULL;

COMMENT ON COLUMN question_assets.option_key IS
  'NULL: a figure of the question itself. A-E: the picture that option is, for a question '
  'whose printed options are drawings; its alt_text describes what the student chooses.';

COMMIT;
