ALTER TABLE incidents ADD COLUMN IF NOT EXISTS pipeline jsonb NOT NULL DEFAULT '{}'::jsonb;
