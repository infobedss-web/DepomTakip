DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%role%'
    LOOP
        EXECUTE format(
            'ALTER TABLE users DROP CONSTRAINT %I',
            c.conname
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
        'WAREHOUSE_STAFF',
        'COUNTER',
        'AUDITOR',
        'GUEST'
    )
);

ALTER TABLE users
ADD CONSTRAINT users_business_role_check
CHECK (
    role IN ('SUPER_ADMIN','AUDITOR')
    OR business_id IS NOT NULL
);
INSERT INTO schema_versions(version) VALUES(27) ON CONFLICT (version) DO NOTHING;
