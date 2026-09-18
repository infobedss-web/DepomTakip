CREATE TABLE IF NOT EXISTS quarantine_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL
        REFERENCES businesses(id),

    warehouse_id uuid NOT NULL
        REFERENCES warehouses(id),

    source_location_id uuid NOT NULL
        REFERENCES locations(id),

    destination_location_id uuid
        REFERENCES locations(id),

    product_id uuid NOT NULL
        REFERENCES products(id),

    action_type text NOT NULL
        CHECK (
            action_type IN (
                'RELEASE',
                'DISPOSE',
                'RETURN'
            )
        ),

    quantity numeric(14,3) NOT NULL
        CHECK (quantity > 0),

    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',

    reason text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',

    created_by uuid NOT NULL
        REFERENCES users(id),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_actions_business
    ON quarantine_actions(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quarantine_actions_warehouse
    ON quarantine_actions(warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quarantine_actions_product
    ON quarantine_actions(product_id, created_at DESC);

INSERT INTO schema_versions(version)
VALUES (10)
ON CONFLICT DO NOTHING;