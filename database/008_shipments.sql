CREATE TABLE IF NOT EXISTS shipment_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL REFERENCES businesses,
    warehouse_id uuid NOT NULL REFERENCES warehouses,

    source_location_id uuid NOT NULL REFERENCES locations,
    product_id uuid NOT NULL REFERENCES products,

    quantity numeric(14,3) NOT NULL CHECK(quantity > 0),

    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',

    customer text NOT NULL DEFAULT '',
    document_number text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',

    created_by uuid NOT NULL REFERENCES users,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipment_business_date
ON shipment_operations(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shipment_warehouse_date
ON shipment_operations(warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shipment_product_date
ON shipment_operations(product_id, created_at DESC);

INSERT INTO schema_versions(version)
SELECT 8
WHERE NOT EXISTS (
    SELECT 1
    FROM schema_versions
    WHERE version = 8
);