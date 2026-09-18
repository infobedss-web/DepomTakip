-- ============================================================
-- BEDSS 020
-- Firma + Depo detaylari + FIRM_ADMIN
-- 001-019 DEGISTIRILMEZ
-- ============================================================

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS code text,
    ADD COLUMN IF NOT EXISTS legal_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS tax_office text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS authorized_person text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';

UPDATE businesses
SET code = 'FRM-' || upper(substr(id::text, 1, 8))
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE businesses
    ALTER COLUMN code SET NOT NULL;

ALTER TABLE businesses
    ADD CONSTRAINT businesses_code_unique UNIQUE(code);

ALTER TABLE businesses
    ADD CONSTRAINT businesses_status_check
    CHECK(status IN ('ACTIVE','PASSIVE'));


ALTER TABLE warehouses
    ADD COLUMN IF NOT EXISTS code text,
    ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS responsible_person text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';

UPDATE warehouses
SET code = 'DEP-' || upper(substr(id::text, 1, 8))
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE warehouses
    ALTER COLUMN code SET NOT NULL;

ALTER TABLE warehouses
    ADD CONSTRAINT warehouses_code_unique UNIQUE(code);

ALTER TABLE warehouses
    ADD CONSTRAINT warehouses_status_check
    CHECK(status IN ('ACTIVE','PASSIVE'));


-- ============================================================
-- FIRM_ADMIN
--
-- PostgreSQL CHECK constraint'in mevcut adini varsaymiyoruz.
-- users.role kolonundaki role CHECK'i katalogdan bulup kaldiriyoruz.
-- ============================================================

DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema()
          AND t.relname = 'users'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%role%'
    LOOP
        EXECUTE format(
            'ALTER TABLE users DROP CONSTRAINT %I',
            constraint_name
        );
    END LOOP;
END $$;

ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (
        role IN (
            'SUPER_ADMIN',
            'OWNER',
            'FIRM_ADMIN',
            'COUNTER',
            'AUDITOR',
            'GUEST'
        )
    );

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_check;

ALTER TABLE users
    ADD CONSTRAINT users_business_role_check
    CHECK (
        role = 'SUPER_ADMIN'
        OR business_id IS NOT NULL
    );


-- ============================================================
-- INDEXLER
-- ============================================================

CREATE INDEX IF NOT EXISTS businesses_status_idx
    ON businesses(status);

CREATE INDEX IF NOT EXISTS warehouses_business_status_idx
    ON warehouses(business_id, status);


-- ============================================================
-- SCHEMA VERSION
-- ============================================================

INSERT INTO schema_versions(version)
SELECT 20
WHERE NOT EXISTS (
    SELECT 1
    FROM schema_versions
    WHERE version = 20
);
