ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content bytea;
