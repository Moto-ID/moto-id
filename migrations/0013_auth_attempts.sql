-- Generic attempt log backing rate limiting / lockout for sensitive auth
-- actions (login, signup, forgot-password, resend-verification). One row
-- per attempt; see checkRateLimit()/recordAttempt() in src/lib/db.ts for
-- how scope+key+outcome are used to decide whether to allow a request.
--
-- Rows are opportunistically purged after ~1 day (see recordAttempt) so
-- this table never needs its own cron job to stay small.

CREATE TABLE IF NOT EXISTS auth_attempts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'attempt',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_auth_attempts_scope_key_created ON auth_attempts(scope, key, created_at);
