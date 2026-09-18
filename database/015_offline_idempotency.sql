CREATE TABLE IF NOT EXISTS client_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    client_operation_id uuid NOT NULL,

    user_id uuid NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    business_id uuid
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    method text NOT NULL,

    path text NOT NULL,

    status text NOT NULL DEFAULT 'PROCESSING'
        CHECK (status IN ('PROCESSING','DONE','FAILED')),

    response_status integer,

    response_body jsonb,

    error_message text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE(user_id, client_operation_id)
);

CREATE INDEX IF NOT EXISTS
    ix_client_operations_business
ON client_operations(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
    ix_client_operations_status
ON client_operations(status, updated_at);

INSERT INTO schema_versions(version)
VALUES (15)
ON CONFLICT DO NOTHING;