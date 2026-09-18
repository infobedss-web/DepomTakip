ALTER TABLE goods_receipts
ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE goods_receipt_items
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'GOOD',
ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'goods_receipt_item_condition_check'
  ) THEN
    ALTER TABLE goods_receipt_items
    ADD CONSTRAINT goods_receipt_item_condition_check
    CHECK (condition IN ('GOOD','DAMAGED','QUARANTINE'));
  END IF;
END $$;

UPDATE stocks SET lot='' WHERE lot IS NULL;
UPDATE stocks SET serial='' WHERE serial IS NULL;

ALTER TABLE stocks
ALTER COLUMN lot SET DEFAULT '',
ALTER COLUMN lot SET NOT NULL,
ALTER COLUMN serial SET DEFAULT '',
ALTER COLUMN serial SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stocks_product_location_lot_serial_unique
ON stocks(product_id, location_id, lot, serial);

CREATE TABLE IF NOT EXISTS stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses,
    warehouse_id uuid NOT NULL REFERENCES warehouses,
    product_id uuid NOT NULL REFERENCES products,
    from_location_id uuid REFERENCES locations,
    to_location_id uuid REFERENCES locations,
    movement_type text NOT NULL
      CHECK (
        movement_type IN (
          'RECEIPT',
          'PUTAWAY',
          'TRANSFER',
          'SHIPMENT',
          'ADJUSTMENT',
          'DAMAGE',
          'QUARANTINE'
        )
      ),
    quantity numeric(14,3) NOT NULL CHECK(quantity > 0),
    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',
    reference_type text NOT NULL DEFAULT '',
    reference_id uuid,
    created_by uuid NOT NULL REFERENCES users,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_business_date
ON stock_movements(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_product
ON stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_reference
ON stock_movements(reference_type, reference_id);

INSERT INTO schema_versions(version)
SELECT 5
WHERE NOT EXISTS (
  SELECT 1 FROM schema_versions WHERE version=5
);