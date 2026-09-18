-- BEDSS 26
-- One-time firm license activation

ALTER TABLE users
ADD COLUMN IF NOT EXISTS license_activated_at timestamptz DEFAULT now();

-- Existing firm administrators must activate once.
UPDATE users
SET license_activated_at = NULL
WHERE role = 'FIRM_ADMIN';

INSERT INTO schema_versions(version)
VALUES (26)
ON CONFLICT DO NOTHING;