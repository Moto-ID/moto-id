-- Let owners mark individual documents/photos as publicly visible

ALTER TABLE documents ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
