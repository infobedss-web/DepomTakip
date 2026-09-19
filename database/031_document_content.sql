ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content bytea;

INSERT INTO schema_versions(version) VALUES(31) ON CONFLICT (version) DO NOTHING;
