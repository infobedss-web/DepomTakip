CREATE TABLE IF NOT EXISTS internal_transfer_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL REFERENCES businesses,
    warehouse_id uuid NOT NULL REFERENCES warehouses,

    source_location_id uuid NOT NULL REFERENCES locations,
    destination_location_id uuid NOT NULL REFERENCES locations,

    product_id uuid NOT NULL REFERENCES products,

    quantity numeric(14,3) NOT NULL CHECK(quantity > 0),

    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',

    created_by uuid NOT NULL REFERENCES users,
    created_at timestamptz NOT NULL DEFAULT now(),

    CHECK(source_location_id <> destination_location_id)
);

CREATE INDEX IF NOT EXISTS internal_transfer_business_date
ON internal_transfer_operations(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_transfer_product_date
ON internal_transfer_operations(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_transfer_warehouse_date
ON internal_transfer_operations(warehouse_id, created_at DESC);

INSERT INTO schema_versions(version)
SELECT 7
WHERE NOT EXISTS (
    SELECT 1
    FROM schema_versions
    WHERE version = 7
);