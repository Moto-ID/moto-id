-- Email verification. Closes the gap where an attacker could register an
-- account using someone else's email address and later intercept anything
-- sent to it (notably an ownership-transfer invite — see
-- src/routes/vehicles.ts, POST /transfer/:token/accept).
--
-- Existing accounts are backfilled to verified = 1 so no current real user
-- is affected; only accounts created from this point on start unverified.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
UPDATE users SET email_verified = 1;

CREATE TABLE IF NOT EXISTS email_verifications (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
