CREATE TABLE IF NOT EXISTS stock_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL REFERENCES businesses,
    warehouse_id uuid NOT NULL REFERENCES warehouses,

    source_location_id uuid NOT NULL REFERENCES locations,
    quarantine_location_id uuid REFERENCES locations,

    product_id uuid NOT NULL REFERENCES products,

    incident_type text NOT NULL
        CHECK(incident_type IN ('DAMAGE','FIRE','LOSS')),

    quantity numeric(14,3) NOT NULL
        CHECK(quantity > 0),

    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',

    description text NOT NULL DEFAULT '',

    photo_document_id uuid REFERENCES documents,

    created_by uuid NOT NULL REFERENCES users,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_incidents_business_date
ON stock_incidents(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_incidents_warehouse_date
ON stock_incidents(warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_incidents_product_date
ON stock_incidents(product_id, created_at DESC);

INSERT INTO schema_versions(version)
SELECT 9
WHERE NOT EXISTS (
    SELECT 1
    FROM schema_versions
    WHERE version = 9
);