-- BEDSS 028
-- Mobile devices + per-user mobile screen permissions

CREATE TABLE mobile_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    user_id uuid
        REFERENCES users(id)
        ON DELETE SET NULL,

    device_id text NOT NULL,
    device_name text NOT NULL DEFAULT '',
    platform text NOT NULL DEFAULT 'ANDROID',

    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','DISABLED','REVOKED')),

    paired_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    revoked_at timestamptz,

    UNIQUE (business_id, device_id)
);

CREATE INDEX idx_mobile_devices_business
    ON mobile_devices(business_id);

CREATE INDEX idx_mobile_devices_user
    ON mobile_devices(user_id);

CREATE TABLE user_mobile_permissions (
    user_id uuid NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    permission text NOT NULL,

    enabled boolean NOT NULL DEFAULT true,

    granted_by uuid
        REFERENCES users(id)
        ON DELETE SET NULL,

    updated_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, permission)
);

CREATE INDEX idx_user_mobile_permissions_user
    ON user_mobile_permissions(user_id);

INSERT INTO schema_versions(version)
VALUES (28);
