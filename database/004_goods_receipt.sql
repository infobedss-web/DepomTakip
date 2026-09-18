CREATE TABLE goods_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses,
    warehouse_id uuid NOT NULL REFERENCES warehouses,
    supplier text NOT NULL DEFAULT '',
    document_number text NOT NULL DEFAULT '',
    document_photo_id uuid REFERENCES documents,
    status text NOT NULL DEFAULT 'COMPLETED'
        CHECK(status IN ('DRAFT','COMPLETED','CANCELLED')),
    received_by uuid NOT NULL REFERENCES users,
    received_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipt_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL REFERENCES goods_receipts ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products,
    location_id uuid NOT NULL REFERENCES locations,
    quantity numeric(14,3) NOT NULL CHECK(quantity > 0),
    unit text NOT NULL DEFAULT 'Adet',
    base_quantity numeric(14,3) NOT NULL CHECK(base_quantity > 0),
    lot text NOT NULL DEFAULT '',
    serial text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX goods_receipt_business_date
ON goods_receipts(business_id, received_at DESC);

CREATE INDEX goods_receipt_item_receipt
ON goods_receipt_items(receipt_id);

INSERT INTO schema_versions(version) VALUES(4);
