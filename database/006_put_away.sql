CREATE TABLE IF NOT EXISTS put_away_operations (
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
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS put_away_business_date
ON put_away_operations(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS put_away_product
ON put_away_operations(product_id, created_at DESC);

INSERT INTO schema_versions(version)
SELECT 6
WHERE NOT EXISTS (
    SELECT 1
    FROM schema_versions
    WHERE version=6
);