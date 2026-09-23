ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code_hash text;
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
