-- Soft-delete for uploaded documents/photos, so "delete" has an undo
-- window instead of being instantly permanent. A document with deleted_at
-- set is hidden from every normal listing (folder pages, recent activity,
-- the public verify page) but still exists in R2 + D1 until the daily
-- cron's sweep (see getExpiredSoftDeletedDocuments in src/lib/db.ts, called
-- from src/index.ts's scheduled() handler) purges it after the undo
-- window expires.

ALTER TABLE documents ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
