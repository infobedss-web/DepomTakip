ALTER TABLE count_locks ADD COLUMN product_id uuid REFERENCES products;
ALTER TABLE count_locks ADD COLUMN location_id uuid REFERENCES locations;
UPDATE count_locks c SET product_id=s.product_id,location_id=s.location_id FROM stocks s WHERE c.stock_id=s.id;
ALTER TABLE count_locks ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE count_locks ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE count_locks ADD CONSTRAINT count_locks_product_location_key UNIQUE(product_id,location_id);
INSERT INTO schema_versions(version) VALUES(2);
