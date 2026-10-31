-- Tracks refunds/disputes against a purchase so a charged-back vehicle
-- credit can be revoked (when not yet used to register a vehicle) instead
-- of silently leaving the customer with a free registration. See the
-- charge.refunded / charge.dispute.created handling in src/routes/billing.ts.

ALTER TABLE purchases ADD COLUMN payment_intent_id TEXT;
ALTER TABLE purchases ADD COLUMN refunded_at TEXT;
ALTER TABLE purchases ADD COLUMN dispute_status TEXT;

CREATE INDEX IF NOT EXISTS idx_purchases_payment_intent_id ON purchases(payment_intent_id);
