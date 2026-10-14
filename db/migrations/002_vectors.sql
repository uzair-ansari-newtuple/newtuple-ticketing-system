CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS library_items;

CREATE TABLE IF NOT EXISTS reference_items (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('catalog', 'user')),
  store_id text,
  sku text UNIQUE,
  metadata jsonb NOT NULL,
  thumb text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reference_items_store_idx ON reference_items (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reference_embeddings (
  id bigserial PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES reference_items (id) ON DELETE CASCADE,
  embedding vector(512) NOT NULL
);

CREATE INDEX IF NOT EXISTS reference_embeddings_item_idx ON reference_embeddings (item_id);
CREATE INDEX IF NOT EXISTS reference_embeddings_hnsw_idx ON reference_embeddings USING hnsw (embedding vector_cosine_ops);
