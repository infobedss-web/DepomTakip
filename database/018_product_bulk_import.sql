BEGIN;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS products_custom_fields_gin
ON products USING gin(custom_fields);

INSERT INTO schema_versions(version)
VALUES (18)
ON CONFLICT DO NOTHING;

COMMIT;