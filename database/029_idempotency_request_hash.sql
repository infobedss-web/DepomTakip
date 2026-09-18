ALTER TABLE client_operations
ADD COLUMN IF NOT EXISTS request_hash text;

CREATE INDEX IF NOT EXISTS ix_client_operations_processing_updated
ON client_operations(updated_at)
WHERE status = 'PROCESSING';

INSERT INTO schema_versions(version)
VALUES (29)
ON CONFLICT DO NOTHING;
