ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sm_entity_id uuid;
CREATE INDEX IF NOT EXISTS incidents_sm_entity_idx ON incidents (sm_entity_id);
