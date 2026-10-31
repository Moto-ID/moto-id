// Stripe webhook signature verification — run against the real
// src/lib/stripe.ts. This is the security-critical gate on
// POST /webhooks/stripe (src/routes/billing.ts): anyone who can defeat it
// could forge a "payment completed" event and grant themselves a free
// vehicle credit, or forge a refund/dispute to revoke someone else's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStripeWebhookSignature } from "../src/lib/stripe.ts";

const SECRET = "whsec_test_secret_for_unit_tests_only";

async function sign(payload, secret, timestamp) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

test("accepts a correctly signed, fresh payload", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await sign(payload, SECRET, timestamp);
  const ok = await verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${sig}`, SECRET);
  assert.equal(ok, true);
});

test("rejects a payload that was tampered with after signing", async () => {
  const originalPayload = JSON.stringify({ type: "checkout.session.completed", metadata: { userId: "user_1" } });
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await sign(originalPayload, SECRET, timestamp);
  // Same signature header, but the body an attacker actually sent differs —
  // e.g. trying to redirect the credit to a different userId.
  const tamperedPayload = JSON.stringify({ type: "checkout.session.completed", metadata: { userId: "attacker" } });
  const ok = await verifyStripeWebhookSignature(tamperedPayload, `t=${timestamp},v1=${sig}`, SECRET);
  assert.equal(ok, false);
});

test("rejects a signature produced with the wrong secret", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await sign(payload, "whsec_some_other_secret", timestamp);
  const ok = await verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${sig}`, SECRET);
  assert.equal(ok, false);
});

test("rejects a stale timestamp (replay protection)", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const oldTimestamp = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes old
  const sig = await sign(payload, SECRET, oldTimestamp);
  const ok = await verifyStripeWebhookSignature(payload, `t=${oldTimestamp},v1=${sig}`, SECRET);
  assert.equal(ok, false);
});

test("rejects a missing or malformed signature header", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  assert.equal(await verifyStripeWebhookSignature(payload, null, SECRET), false);
  assert.equal(await verifyStripeWebhookSignature(payload, "not-a-valid-header", SECRET), false);
  assert.equal(await verifyStripeWebhookSignature(payload, "t=12345", SECRET), false); // missing v1
});
