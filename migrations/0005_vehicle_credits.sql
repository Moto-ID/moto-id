-- Free accounts + paid vehicle registration ("Moto ID Kit").
--
-- vehicle_credits tracks how many vehicle registrations a user is entitled to
-- create (each successful Stripe purchase grants 1). Registering a vehicle
-- consumes exactly one credit. Signing up remains free and gives access to
-- "My Collection"; getting an actual Moto ID (registering a vehicle) requires
-- a credit, which requires payment.
ALTER TABLE users ADD COLUMN vehicle_credits INTEGER NOT NULL DEFAULT 0;

-- One row per completed Stripe Checkout Session. The primary key is the
-- Stripe session id itself, so re-processing the same session (e.g. once from
-- the webhook and once from the success-page fallback check) is a no-op --
-- this is what makes credit-granting idempotent.
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_pence INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
