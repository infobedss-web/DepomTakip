-- BEDSS 022
-- Independent auditor tenant compatibility.
-- 001-021 migrations are immutable.

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_business_role_check;

ALTER TABLE users
    ADD CONSTRAINT users_business_role_check
    CHECK (
        role IN ('SUPER_ADMIN', 'AUDITOR')
        OR business_id IS NOT NULL
    );

INSERT INTO schema_versions(version)
SELECT 22
WHERE NOT EXISTS (
    SELECT 1 FROM schema_versions WHERE version = 22
);