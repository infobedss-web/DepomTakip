-- BEDSS Commercial V1 license plan migration.
-- Keeps existing paid licenses valid while replacing pilot naming with the
-- commercial TRIAL / BEGINNER / PLUS / PRO model.

ALTER TABLE business_licenses
  DROP CONSTRAINT IF EXISTS business_licenses_plan_code_check;

UPDATE business_licenses SET plan_code='TRIAL' WHERE plan_code='PILOT';
UPDATE business_licenses SET plan_code='BEGINNER' WHERE plan_code='STARTER';

ALTER TABLE business_licenses
  ADD CONSTRAINT business_licenses_plan_code_check
  CHECK (plan_code IN ('TRIAL','BEGINNER','PLUS','PRO','ENTERPRISE'));

ALTER TABLE business_licenses
  ALTER COLUMN plan_code SET DEFAULT 'TRIAL';

CREATE OR REPLACE FUNCTION bedss_default_business_license()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO business_licenses(
    business_id, plan_code, status, starts_at, ends_at,
    max_warehouses, max_users, features, note
  )
  VALUES(
    NEW.id, 'TRIAL', 'ACTIVE', now(), now() + interval '14 days',
    1, 10,
    '{"offline":true,"blind_count":true,"mobile_pwa":true}'::jsonb,
    'Automatic 14-day BEDSS trial'
  )
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

INSERT INTO schema_versions(version) VALUES(30);
