-- DepomTakip 032
-- Firma yetkilisi ve personel icin 6 haneli PIN girisi.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS login_code text;

CREATE UNIQUE INDEX IF NOT EXISTS users_business_login_code_unique
ON users (business_id, login_code)
WHERE login_code IS NOT NULL;

ALTER TABLE users
ADD CONSTRAINT users_login_code_format_check
CHECK (
    login_code IS NULL
    OR login_code ~ '^[0-9]{6}$'
);

INSERT INTO schema_versions(version)
VALUES (32)
ON CONFLICT (version) DO NOTHING;
