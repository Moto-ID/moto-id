// Rate-limit / lockout threshold logic — run against the real
// checkRateLimit/recordAuthAttempt in src/lib/db.ts, using a real in-memory
// SQLite database (see helpers/fake-d1.mjs) rather than a reimplementation
// of the logic, so these tests actually exercise the SQL this code runs in
// production. This backs the login/signup/forgot-password/
// resend-verification lockouts in src/routes/auth.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, recordAuthAttempt } from "../src/lib/db.ts";
import { createFakeD1 } from "./helpers/fake-d1.mjs";

// Copied from migrations/0013_auth_attempts.sql — kept minimal to just what
// these two functions touch.
const SCHEMA = `
  CREATE TABLE auth_attempts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'attempt',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

test("allows requests under the threshold", async () => {
  const db = createFakeD1(SCHEMA);
  for (let i = 0; i < 4; i++) await recordAuthAttempt(db, "login", "a@example.com", "failure");
  assert.equal(await checkRateLimit(db, "login", "a@example.com", 5, 15), true);
});

test("blocks once the threshold is reached", async () => {
  const db = createFakeD1(SCHEMA);
  for (let i = 0; i < 5; i++) await recordAuthAttempt(db, "login", "a@example.com", "failure");
  assert.equal(await checkRateLimit(db, "login", "a@example.com", 5, 15), false);
});

test("a successful login never counts toward the lockout", async () => {
  const db = createFakeD1(SCHEMA);
  for (let i = 0; i < 10; i++) await recordAuthAttempt(db, "login", "a@example.com", "success");
  // 10 successful logins — still fully allowed, because checkRateLimit
  // ignores outcome = 'success' rows entirely (see the SQL comment in
  // lib/db.ts: a legitimate user isn't punished for logging in a lot).
  assert.equal(await checkRateLimit(db, "login", "a@example.com", 5, 15), true);
});

test("scopes that always record 'attempt' (signup, forgot_password, resend_verification) count every call", async () => {
  const db = createFakeD1(SCHEMA);
  for (let i = 0; i < 8; i++) await recordAuthAttempt(db, "signup", "203.0.113.1"); // default outcome = "attempt"
  assert.equal(await checkRateLimit(db, "signup", "203.0.113.1", 8, 60), false);
});

test("different scopes and keys are tracked independently", async () => {
  const db = createFakeD1(SCHEMA);
  for (let i = 0; i < 5; i++) await recordAuthAttempt(db, "login", "victim@example.com", "failure");
  // A different email isn't affected by someone else's failed attempts...
  assert.equal(await checkRateLimit(db, "login", "someone-else@example.com", 5, 15), true);
  // ...and neither is a different scope against the exact same key.
  assert.equal(await checkRateLimit(db, "forgot_password", "victim@example.com", 5, 15), true);
  // But the original, matching scope+key combination is correctly blocked.
  assert.equal(await checkRateLimit(db, "login", "victim@example.com", 5, 15), false);
});

test("attempts outside the time window no longer count", async () => {
  const db = createFakeD1(SCHEMA);
  // Insert 5 "failure" rows backdated well outside a 15-minute window,
  // using the same prepare()/bind() interface db.ts itself uses — this
  // exercises the real datetime(...) comparison in checkRateLimit's SQL,
  // not a reimplementation of "is this expired" in JS.
  for (let i = 0; i < 5; i++) {
    await db
      .prepare("INSERT INTO auth_attempts (id, scope, key, outcome, created_at) VALUES (?, ?, ?, ?, datetime('now', '-1 hour'))")
      .bind(`old-${i}`, "login", "a@example.com", "failure")
      .run();
  }
  assert.equal(await checkRateLimit(db, "login", "a@example.com", 5, 15), true);

  // One recent failure on top, still under a max of 5.
  await recordAuthAttempt(db, "login", "a@example.com", "failure");
  assert.equal(await checkRateLimit(db, "login", "a@example.com", 5, 15), true);
});
