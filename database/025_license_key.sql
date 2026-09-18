-- BEDSS 25
-- Firma lisans anahtari

ALTER TABLE business_licenses
ADD COLUMN IF NOT EXISTS license_key text;

CREATE UNIQUE INDEX IF NOT EXISTS business_licenses_license_key_unique
ON business_licenses(license_key)
WHERE license_key IS NOT NULL;

INSERT INTO schema_versions(version)
VALUES (25)
ON CONFLICT DO NOTHING;
