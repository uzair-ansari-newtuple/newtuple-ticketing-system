ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS new_tag_added boolean NOT NULL DEFAULT false;
