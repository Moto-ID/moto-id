-- Pricing restructure: free account + 1 free vehicle, optional per-vehicle
-- laser-marked plaque (£15), paid additional vehicles (£5 each), and
-- repeatable storage top-ups (£5 / +20 slots) for photos and documents.
-- See src/routes/billing.ts, src/lib/db.ts, src/routes/vehicles.ts,
-- src/routes/documents.ts.

ALTER TABLE vehicles ADD COLUMN plaque_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE vehicles ADD COLUMN plaque_paid_at TEXT;
ALTER TABLE vehicles ADD COLUMN extra_photo_slots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN extra_document_slots INTEGER NOT NULL DEFAULT 0;
