ALTER TABLE incidents ADD COLUMN IF NOT EXISTS missing_price_tag_count integer NOT NULL DEFAULT 1 CHECK (missing_price_tag_count BETWEEN 1 AND 99);
