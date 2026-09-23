ALTER TABLE activities ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS activities_user_client_id ON activities(user_id,client_id) WHERE client_id IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
