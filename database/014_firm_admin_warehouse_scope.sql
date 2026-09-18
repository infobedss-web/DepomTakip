-- BEDSS 014
-- Firm Admin + personnel warehouse scope
-- 001-013 immutable.

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT c.conname
      INTO constraint_name
      FROM pg_constraint c
      JOIN pg_class t
        ON t.oid = c.conrelid
     WHERE t.relname = 'users'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%SUPER_ADMIN%'
       AND pg_get_constraintdef(c.oid) LIKE '%OWNER%'
       AND pg_get_constraintdef(c.oid) LIKE '%COUNTER%'
     LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE users DROP CONSTRAINT %I',
            constraint_name
        );
    END IF;
END
$$;

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

CREATE TABLE user_warehouse_assignments (
    user_id uuid NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    warehouse_id uuid NOT NULL
        REFERENCES warehouses(id)
        ON DELETE CASCADE,

    assigned_by uuid
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    PRIMARY KEY (
        user_id,
        warehouse_id
    )
);

CREATE INDEX idx_user_warehouse_assignments_warehouse
    ON user_warehouse_assignments(warehouse_id);

CREATE INDEX idx_user_warehouse_assignments_user
    ON user_warehouse_assignments(user_id);

INSERT INTO schema_versions(version)
VALUES (14);