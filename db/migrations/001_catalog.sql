-- Neon holds only the product catalog and the image vectors used to match photos to products.
-- Tickets, their photos, quality checks and users all live in the State Machine.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE products (
  sku text PRIMARY KEY,
  upc text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text NOT NULL,
  class_code text NOT NULL,
  color_code text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
  id bigserial PRIMARY KEY,
  sku text NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  position integer NOT NULL,
  mime_type text NOT NULL,
  data text NOT NULL,
  UNIQUE (sku, position)
);

-- One row per catalog product, plus any item a store adds from a ticket.
CREATE TABLE reference_items (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('catalog', 'user')),
  store_id text,
  sku text UNIQUE,
  metadata jsonb NOT NULL,
  thumb text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reference_items_store_idx ON reference_items (store_id, created_at DESC);

CREATE TABLE reference_embeddings (
  id bigserial PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES reference_items (id) ON DELETE CASCADE,
  embedding vector(512) NOT NULL
);

CREATE INDEX reference_embeddings_item_idx ON reference_embeddings (item_id);
CREATE INDEX reference_embeddings_hnsw_idx ON reference_embeddings USING hnsw (embedding vector_cosine_ops);
