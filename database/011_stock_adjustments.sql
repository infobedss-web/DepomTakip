CREATE TABLE IF NOT EXISTS stock_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    location_id uuid NOT NULL REFERENCES locations(id),
    product_id uuid NOT NULL REFERENCES products(id),

    adjustment_type text NOT NULL
        CHECK(adjustment_type IN ('INCREASE','DECREASE')),

    quantity numeric(14,3) NOT NULL CHECK(quantity > 0),

    before_quantity numeric(14,3) NOT NULL,
    after_quantity numeric(14,3) NOT NULL,

    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',

    reason_code text NOT NULL
        CHECK(reason_code IN (
            'COUNT_VARIANCE',
            'DATA_CORRECTION',
            'PHYSICAL_CORRECTION',
            'OTHER'
        )),

    reason text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',

    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_adjustments_business_date
ON stock_adjustments(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_adjustments_product
ON stock_adjustments(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_adjustments_location
ON stock_adjustments(location_id, created_at DESC);

INSERT INTO schema_versions(version)
VALUES(11)
ON CONFLICT DO NOTHING;