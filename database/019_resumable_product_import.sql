-- Transaction ownership belongs to the migration runner. Never silently merge existing products.
CREATE FUNCTION bedss_product_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT translate(btrim(value, E' \t\r\n'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜı', 'abcdefghijklmnopqrstuvwxyzçğiöşüi')
$$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM products GROUP BY business_id,bedss_product_key(sku) HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM products GROUP BY business_id,bedss_product_key(barcode) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Canonical SKU/barcode duplicates exist. Resolve explicitly before migration 019; no products were changed.';
 END IF;
END $$;
CREATE UNIQUE INDEX products_business_sku_canonical ON products(business_id,bedss_product_key(sku));
CREATE UNIQUE INDEX products_business_barcode_canonical ON products(business_id,bedss_product_key(barcode));
CREATE TABLE product_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses,
 created_by uuid NOT NULL REFERENCES users, file_hash text NOT NULL CHECK(length(file_hash)=64),
 mapping_hash text NOT NULL CHECK(length(mapping_hash)=64), filename text NOT NULL,
 total_rows integer NOT NULL CHECK(total_rows BETWEEN 1 AND 50000),
 total_batches integer NOT NULL CHECK(total_batches BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'VALIDATING' CHECK(status IN ('VALIDATING','READY','IMPORTING','FAILED','COMPLETED')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,file_hash,mapping_hash)
);
CREATE INDEX product_import_business_date ON product_import_jobs(business_id,created_at DESC);
CREATE TABLE product_import_batches (
 job_id uuid NOT NULL REFERENCES product_import_jobs, batch_no integer NOT NULL CHECK(batch_no>0),
 content_hash text NOT NULL, row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000),
 status text NOT NULL CHECK(status IN ('VALIDATED','FAILED','COMMITTED')),
 errors jsonb NOT NULL DEFAULT '[]', committed_at timestamptz,
 PRIMARY KEY(job_id,batch_no)
);
CREATE TABLE product_import_rows (
 job_id uuid NOT NULL, batch_no integer NOT NULL, source_row integer NOT NULL,
 sku_key text NOT NULL, barcode_key text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(job_id,source_row), UNIQUE(job_id,sku_key), UNIQUE(job_id,barcode_key),
 FOREIGN KEY(job_id,batch_no) REFERENCES product_import_batches
);
CREATE INDEX product_import_rows_batch ON product_import_rows(job_id,batch_no);
INSERT INTO schema_versions(version) VALUES(19);
