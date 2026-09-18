CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NOT NULL
    REFERENCES businesses(id),

  source_warehouse_id uuid NOT NULL
    REFERENCES warehouses(id),

  destination_warehouse_id uuid NOT NULL
    REFERENCES warehouses(id),

  source_location_id uuid NOT NULL
    REFERENCES locations(id),

  destination_location_id uuid NOT NULL
    REFERENCES locations(id),

  product_id uuid NOT NULL
    REFERENCES products(id),

  source_stock_id uuid NOT NULL
    REFERENCES stocks(id),

  quantity numeric(18,3) NOT NULL
    CHECK (quantity > 0),

  received_quantity numeric(18,3),
  damaged_quantity numeric(18,3) NOT NULL DEFAULT 0,

  lot text,
  serial text,

  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (
      status IN (
        'DRAFT',
        'SHIPPED',
        'RECEIVED',
        'PARTIAL',
        'CANCELLED'
      )
    ),

  note text,

  created_by uuid NOT NULL
    REFERENCES users(id),

  shipped_by uuid
    REFERENCES users(id),

  received_by uuid
    REFERENCES users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  shipped_at timestamptz,
  received_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_business
  ON warehouse_transfers(business_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source
  ON warehouse_transfers(source_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_destination
  ON warehouse_transfers(destination_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_status
  ON warehouse_transfers(status);

INSERT INTO schema_versions(version)
SELECT 23
WHERE NOT EXISTS (
  SELECT 1
  FROM schema_versions
  WHERE version=23
);
