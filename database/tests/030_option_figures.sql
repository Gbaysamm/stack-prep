-- Run after 030_option_figures.sql in a disposable PostgreSQL database.
-- Local variables are prefixed v_ so they never collide with column names.
BEGIN;
SET LOCAL search_path = stackprep, public;

DO $$
DECLARE
  v_author uuid;
  v_reviewer uuid;
  v_exam uuid;
  v_subject uuid;
  v_question uuid;
  v_version uuid;
  v_asset uuid;
  v_rejected boolean;
BEGIN
  INSERT INTO academic_reviewers(display_name) VALUES ('Option author') RETURNING id INTO v_author;
  INSERT INTO academic_reviewers(display_name) VALUES ('Option reviewer') RETURNING id INTO v_reviewer;
  INSERT INTO examinations(name, short_name, exam_body, country_code, status)
    VALUES ('Option exam', 'TESTOPT', 'Test body', 'NG', 'active') RETURNING id INTO v_exam;
  INSERT INTO subjects(examination_id, code, name, status)
    VALUES (v_exam, 'PHY', 'Physics', 'active') RETURNING id INTO v_subject;
  INSERT INTO questions(subject_id, origin, usage_pool, created_by)
    VALUES (v_subject, 'authored', 'practice', v_author) RETURNING id INTO v_question;
  INSERT INTO question_versions(question_id, subject_id, version, stem, response_format,
    marking_method, solution_steps, hints, marks, expected_seconds, option_count,
    content_hash, authored_by, answer_source, mastery_level_number, level_source)
    VALUES (v_question, v_subject, 1, 'Which symbol is an n-p-n transistor?', 'mcq_single',
      'auto_key', '["the arrow points out of the emitter"]'::jsonb, '["look at the arrow"]'::jsonb,
      1, 45, 4, repeat('b', 64), v_author, 'expert_verified', 2, 'expert_verified')
    RETURNING id INTO v_version;
  INSERT INTO question_options(question_version_id, subject_id, option_key, body, is_correct, display_order)
    VALUES (v_version, v_subject, 'A', 'Symbol A', true, 1);
  INSERT INTO question_options(question_version_id, subject_id, option_key, body, display_order)
    VALUES (v_version, v_subject, 'B', 'Symbol B', 2);
  INSERT INTO question_options(question_version_id, subject_id, option_key, body, display_order)
    VALUES (v_version, v_subject, 'C', 'Symbol C', 3);
  INSERT INTO question_options(question_version_id, subject_id, option_key, body, display_order)
    VALUES (v_version, v_subject, 'D', 'Symbol D', 4);

  -- The question's own figure keeps option_key NULL, as every row before 030 does.
  INSERT INTO question_assets(question_version_id, storage_uri, mime_type, alt_text,
    alt_text_source, licence_status)
    VALUES (v_version, 'docs/questions/utme/physics/figures/svg/2010_q04.svg', 'image/svg+xml',
      'A circuit.', 'expert_verified', 'verified');

  -- An option's picture, whose description is not yet a person's: approval still waits.
  INSERT INTO question_assets(question_version_id, storage_uri, mime_type, alt_text,
    alt_text_source, licence_status, option_key, display_order)
    VALUES (v_version, 'docs/questions/utme/physics/figures/svg/2010_q04_a.svg',
      'image/svg+xml', 'Arrow pointing out of the emitter.', 'model_proposed', 'verified', 'A', 1)
    RETURNING id INTO v_asset;
  v_rejected := false;
  BEGIN
    UPDATE question_versions SET review_status = 'approved', reviewed_by = v_reviewer,
      reviewed_at = now() WHERE id = v_version;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%alt text a person has confirmed%' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'an option picture with a proposed description was approved';
  END IF;
  UPDATE question_assets SET alt_text_source = 'expert_verified' WHERE id = v_asset;

  -- A second picture for the same option is refused.
  v_rejected := false;
  BEGIN
    INSERT INTO question_assets(question_version_id, storage_uri, mime_type, alt_text,
      alt_text_source, licence_status, option_key)
      VALUES (v_version, 'x.svg', 'image/svg+xml', 'Another.', 'expert_verified', 'verified', 'A');
  EXCEPTION WHEN unique_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'two pictures for one option were accepted'; END IF;

  -- A letter no option can have is refused.
  v_rejected := false;
  BEGIN
    INSERT INTO question_assets(question_version_id, storage_uri, mime_type, alt_text,
      alt_text_source, licence_status, option_key)
      VALUES (v_version, 'x.svg', 'image/svg+xml', 'Another.', 'expert_verified', 'verified', 'F');
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'option_key F was accepted'; END IF;

  -- With every description a person's, the version is approved.
  UPDATE question_versions SET review_status = 'approved', reviewed_by = v_reviewer,
    reviewed_at = now() WHERE id = v_version;
  IF (SELECT review_status FROM question_versions WHERE id = v_version) <> 'approved' THEN
    RAISE EXCEPTION 'a question with confirmed option pictures was not approved';
  END IF;
END $$;

ROLLBACK;
