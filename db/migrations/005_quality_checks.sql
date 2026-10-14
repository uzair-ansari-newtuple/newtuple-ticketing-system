CREATE TABLE IF NOT EXISTS quality_checks (
  id uuid PRIMARY KEY,
  store_id text NOT NULL,
  result jsonb NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quality_checks_created_idx ON quality_checks (created_at);
