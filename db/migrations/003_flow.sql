ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS thumb text,
  ADD COLUMN IF NOT EXISTS embeddings jsonb,
  ADD COLUMN IF NOT EXISTS gating text,
  ADD COLUMN IF NOT EXISTS gating_reason text,
  ADD COLUMN IF NOT EXISTS candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected jsonb,
  ADD COLUMN IF NOT EXISTS item_age text,
  ADD COLUMN IF NOT EXISTS escalation jsonb,
  ADD COLUMN IF NOT EXISTS resolver jsonb,
  ADD COLUMN IF NOT EXISTS unread_for_store boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS incidents_state_idx ON incidents (current_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS incident_images (
  id bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  position integer NOT NULL,
  slot text NOT NULL,
  mime_type text NOT NULL,
  sha256 text NOT NULL,
  data text NOT NULL,
  capture jsonb NOT NULL,
  UNIQUE (incident_id, position)
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  store_id text NOT NULL,
  upc text NOT NULL,
  sku text,
  printer integer NOT NULL,
  copies integer NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'failed')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_jobs_incident_idx ON print_jobs (incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  type text NOT NULL,
  actor text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_events_incident_idx ON incident_events (incident_id, created_at);
