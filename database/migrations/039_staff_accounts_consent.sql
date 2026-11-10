-- Staff accounts made on the server with database/create_admin.py had no consent row and kept
-- the default requires_guardian_consent = true, so check_attempt_consent refused every answer
-- they gave (a check-up stopped at question 1 with "not quite right"). Accounts made by
-- signing up are adults who agreed in the app; a staff account is an adult who made it
-- themselves on the server. This gives each such account the same footing as a sign-up.

SET LOCAL search_path = stackprep, public;

UPDATE students s SET requires_guardian_consent = false
WHERE s.requires_guardian_consent
  AND EXISTS (SELECT 1 FROM account_roles r WHERE r.student_id = s.id)
  AND NOT EXISTS (
    SELECT 1 FROM consents c
    WHERE c.student_id = s.id AND c.consent_type = 'data_processing' AND c.granted
      AND c.revoked_at IS NULL
  );

INSERT INTO consents (student_id, consent_type, granted, source, evidence_note)
SELECT r.student_id, 'data_processing', true, 'in_app',
       'Staff account made on the server by its owner (create_admin); recorded by migration 039.'
FROM account_roles r
WHERE NOT EXISTS (
  SELECT 1 FROM consents c
  WHERE c.student_id = r.student_id AND c.consent_type = 'data_processing' AND c.granted
    AND c.revoked_at IS NULL
);
