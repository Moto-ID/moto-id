// Password hashing round-trip — run against the real src/lib/crypto.ts (no
// reimplementation), with no npm install required: Node's built-in
// WebCrypto global covers everything hashPassword/verifyPassword use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/crypto.ts";

test("hashPassword produces a pbkdf2:<iterations>:<salt>:<hash> string", async () => {
  const stored = await hashPassword("correct horse battery staple");
  const parts = stored.split(":");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "pbkdf2");
  assert.ok(Number(parts[1]) > 0, "iteration count should be a positive number");
  assert.match(parts[2], /^[0-9a-f]+$/, "salt should be hex");
  assert.match(parts[3], /^[0-9a-f]+$/, "derived hash should be hex");
});

test("verifyPassword accepts the correct password", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
});

test("verifyPassword rejects an incorrect password", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("wrong password", stored), false);
});

test("two hashes of the same password differ (random salt per hash)", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b);
  // ...but both still verify correctly against that same password.
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

test("verifyPassword rejects a malformed/garbage stored value instead of throwing", async () => {
  assert.equal(await verifyPassword("anything", "not-a-real-hash"), false);
  assert.equal(await verifyPassword("anything", ""), false);
});
