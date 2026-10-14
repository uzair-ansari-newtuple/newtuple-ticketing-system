CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('store', 'resolver')),
  store_id text,
  store_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
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

CREATE TABLE IF NOT EXISTS product_images (
  id bigserial PRIMARY KEY,
  sku text NOT NULL REFERENCES products (sku) ON DELETE CASCADE,
  position integer NOT NULL,
  mime_type text NOT NULL,
  data text NOT NULL,
  UNIQUE (sku, position)
);

CREATE SEQUENCE IF NOT EXISTS product_sku_seq START 2001;
