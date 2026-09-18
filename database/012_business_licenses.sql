CREATE TABLE business_licenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL UNIQUE
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    plan_code text NOT NULL DEFAULT 'PILOT'
        CHECK (
            plan_code IN (
                'PILOT',
                'STARTER',
                'PRO',
                'ENTERPRISE'
            )
        ),

    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (
            status IN (
                'ACTIVE',
                'SUSPENDED',
                'EXPIRED'
            )
        ),

    starts_at timestamptz NOT NULL DEFAULT now(),

    ends_at timestamptz NOT NULL
        DEFAULT (now() + interval '30 days'),

    max_warehouses integer NOT NULL DEFAULT 5
        CHECK(max_warehouses > 0),

    max_users integer NOT NULL DEFAULT 30
        CHECK(max_users > 0),

    features jsonb NOT NULL DEFAULT '{}'::jsonb,

    note text NOT NULL DEFAULT '',

    created_by uuid REFERENCES users(id),

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CHECK(ends_at > starts_at)
);


CREATE INDEX business_licenses_status_ends
ON business_licenses(status, ends_at);


INSERT INTO business_licenses(
    business_id,
    plan_code,
    status,
    starts_at,
    ends_at,
    max_warehouses,
    max_users,
    features,
    note
)
SELECT
    b.id,
    'PILOT',
    'ACTIVE',
    now(),
    now() + interval '30 days',
    5,
    30,
    '{}'::jsonb,
    'Existing business pilot license'
FROM businesses b
ON CONFLICT (business_id) DO NOTHING;


CREATE OR REPLACE FUNCTION bedss_default_business_license()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    INSERT INTO business_licenses(
        business_id,
        plan_code,
        status,
        starts_at,
        ends_at,
        max_warehouses,
        max_users,
        features,
        note
    )
    VALUES(
        NEW.id,
        'PILOT',
        'ACTIVE',
        now(),
        now() + interval '30 days',
        5,
        30,
        '{}'::jsonb,
        'Automatic pilot license'
    )
    ON CONFLICT (business_id) DO NOTHING;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_business_default_license
ON businesses;


CREATE TRIGGER trg_business_default_license
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION bedss_default_business_license();


INSERT INTO schema_versions(version)
VALUES(12);