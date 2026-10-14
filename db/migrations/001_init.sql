CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1001;

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY,
  number integer NOT NULL DEFAULT nextval('ticket_number_seq'),
  store_id text NOT NULL,
  capture_profile_id text NOT NULL DEFAULT 'PHOTO_LANE',
  current_state text NOT NULL DEFAULT 'METADATA_PENDING',
  metadata_job_id uuid NOT NULL,
  image_count integer NOT NULL,
  analysis jsonb NOT NULL,
  fail_extraction boolean NOT NULL DEFAULT false,
  extraction jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incidents_store_created_idx ON incidents (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS library_items (
  id uuid PRIMARY KEY,
  store_id text NOT NULL,
  metadata jsonb NOT NULL,
  thumb text NOT NULL,
  embeddings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_items_store_idx ON library_items (store_id, created_at DESC);
