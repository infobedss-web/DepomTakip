ALTER TABLE users ADD COLUMN denied_permissions text[] NOT NULL DEFAULT '{}';
INSERT INTO schema_versions(version) VALUES(3);
