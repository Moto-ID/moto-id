-- Ownership transfer: lets a vehicle's current owner hand it to a new owner
-- (e.g. when the vehicle is sold) via an emailed accept link, free of
-- charge (see business-plan.md Section 6), and keeps a permanent log of
-- past transfers for the vehicle's "Ownership History".

CREATE TABLE IF NOT EXISTS vehicle_transfers (
    token TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | cancelled
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    resolved_at TEXT
  );

CREATE INDEX IF NOT EXISTS idx_vehicle_transfers_vehicle_id ON vehicle_transfers(vehicle_id);

CREATE TABLE IF NOT EXISTS ownership_history (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    -- Nullable + a name snapshot so history survives even if the account
    -- behind from_user_id is ever removed in the future.
    from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    from_name TEXT,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_name TEXT NOT NULL,
    transferred_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_ownership_history_vehicle_id ON ownership_history(vehicle_id);
