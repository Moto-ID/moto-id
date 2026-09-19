import { Hono } from "hono";
import type { Env } from "../types";
import { authShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import { getVehiclesByUser, getUserById, grantCreditForCheckoutSession } from "../lib/db";
import { createCheckoutSession, retrieveCheckoutSession, verifyStripeWebhookSignature } from "../lib/stripe";

export const billing = new Hono<Env>();

// Matches the pricing shown on /pricing (the business's founding-member offer
// for the first ~250 kits) and the additional-vehicle price on the same page.
const FOUNDING_PRICE_PENCE = 2900; // £29 — first Moto ID Kit
const ADDITIONAL_VEHICLE_PRICE_PENCE = 3500; // £35 — each additional vehicle on an existing account

function pricingFor(existingVehicleCount: number) {
  return existingVehicleCount === 0
    ? {
        amountPence: FOUNDING_PRICE_PENCE,
        label: "The Moto ID Kit — founding price",
        description: "One engraved plate, tamper-evident sticker set, and your first vehicle's digital record.",
      }
    : {
        amountPence: ADDITIONAL_VEHICLE_PRICE_PENCE,
        label: "Additional vehicle",
        description: "One more engraved plate and sticker set for another vehicle on your account.",
      };
}

billing.get("/buy", requireAuth, async (c) => {
  const user = c.get("user")!;

  if (user.vehicle_credits > 0) {
    return c.redirect("/register-vehicle");
  }

  const vehicleList = await getVehiclesByUser(c.env.DB, user.id);
  const pricing = pricingFor(vehicleList.length);
  const priceDisplay = `£${(pricing.amountPence / 100).toFixed(0)}`;

  const body = `
    <div style="width:100%;max-width:440px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">GET A MOTO ID</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1.25;margin-bottom:22px">${esc(pricing.label)}</div>
      <div style="font-family:var(--font-display);font-size:40px;margin-bottom:10px">${priceDisplay}</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:30px">One-time payment &middot; ${esc(pricing.description)}</div>
      <div style="border:1px solid var(--hairline);padding:18px 20px;margin-bottom:30px">
        <div style="font-size:12.5px;color:var(--ink-muted);line-height:1.7">Includes an engraved plate and tamper-evident stickers, posted to you, plus unlimited document storage and a public verification page for the life of the vehicle. No subscription.</div>
      </div>
      <form method="post" action="/buy/checkout">
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">Continue to payment — ${priceDisplay}</button>
      </form>
      <a href="/dashboard" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to my collection</a>
    </div>`;

  return c.html(authShell("Get a Moto ID — Moto ID", body));
});

billing.post("/buy/checkout", requireAuth, async (c) => {
  const user = c.get("user")!;

  if (user.vehicle_credits > 0) {
    return c.redirect("/register-vehicle");
  }

  const vehicleList = await getVehiclesByUser(c.env.DB, user.id);
  const pricing = pricingFor(vehicleList.length);
  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;

  try {
    const session = await createCheckoutSession(c.env, {
      userId: user.id,
      userEmail: user.email,
      amountPence: pricing.amountPence,
      productName: pricing.label,
      productDescription: pricing.description,
      successUrl: `${origin}/buy/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/buy`,
    });
    return c.redirect(session.url, 303);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("Stripe checkout session creation failed:", errMessage);
    const body = `
      <div style="width:100%;max-width:440px">
        <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">GET A MOTO ID</div>
        <div style="font-family:var(--font-display);font-size:26px;line-height:1.3;margin-bottom:22px">Payments aren't set up yet.</div>
        <div class="error">We couldn't start checkout right now. Please check back shortly.</div>
        <a href="/dashboard" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted);margin-top:24px">&larr; Back to my collection</a>
      </div>`;
    return c.html(authShell("Get a Moto ID — Moto ID", body), 500);
  }
});

billing.get("/buy/success", requireAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.query("session_id");

  if (sessionId) {
    const session = await retrieveCheckoutSession(c.env, sessionId);
    if (session && session.payment_status === "paid" && session.metadata?.userId === user.id) {
      await grantCreditForCheckoutSession(c.env.DB, session.id, user.id, session.amount_total ?? 0, session.currency ?? "gbp");
    }
  }

  // attachUser resolved `user` before this handler ran, so re-fetch to see a
  // credit that might have just been granted above.
  const freshUser = await getUserById(c.env.DB, user.id);
  const hasCredit = (freshUser?.vehicle_credits ?? 0) > 0;

  const body = `
    <div style="width:100%;max-width:440px;text-align:center">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">PAYMENT RECEIVED</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1.3;margin-bottom:22px">Thank you.</div>
      ${
        hasCredit
          ? `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">Your Moto ID Kit is on its way, and you can register your vehicle's digital record right now.</div>
             <a href="/register-vehicle" class="btn btn-solid" style="display:block;border:none">Register your vehicle</a>`
          : `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">We're confirming your payment — this can take a few seconds. Refresh this page in a moment, or head back to your collection and it'll be ready there.</div>
             <a href="/dashboard" class="btn btn-outline" style="display:block">Back to my collection</a>`
      }
    </div>`;

  return c.html(authShell("Payment received — Moto ID", body));
});

// Stripe calls this directly (no user session) whenever a Checkout Session
// completes. This is the authoritative way credits get granted — the
// /buy/success page above is just an immediate confirmation for the user,
// for the common case where they land on it before or alongside the webhook.
billing.post("/webhooks/stripe", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Received a Stripe webhook but STRIPE_WEBHOOK_SECRET is not configured.");
    return c.text("Webhook secret not configured", 500);
  }

  const payload = await c.req.text();
  const signature = c.req.header("Stripe-Signature") ?? null;
  const valid = await verifyStripeWebhookSignature(payload, signature, secret);
  if (!valid) {
    return c.text("Invalid signature", 400);
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return c.text("Invalid payload", 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    const userId: string | undefined = session?.metadata?.userId || session?.client_reference_id;
    if (session?.id && userId && session.payment_status === "paid") {
      await grantCreditForCheckoutSession(c.env.DB, session.id, userId, session.amount_total ?? 0, session.currency ?? "gbp");
    }
  }

  return c.text("ok", 200);
});
