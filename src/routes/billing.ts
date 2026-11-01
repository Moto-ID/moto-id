import { Hono } from "hono";
import type { Env } from "../types";
import { authShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import {
  getVehiclesByUser,
  getVehicleById,
  getUserById,
  grantCreditForCheckoutSession,
  getPurchaseByPaymentIntent,
  markPurchaseRefunded,
  markPurchaseDisputed,
  revokeUnusedCreditIfAvailable,
  setListingPaid,
  startPlaqueOrder,
  setVehiclePlaquePaid,
  grantStorageTopup,
} from "../lib/db";
import { createCheckoutSession, retrieveCheckoutSession, verifyStripeWebhookSignature } from "../lib/stripe";
import { sendPaymentReviewAlertEmail, sendOrderNotificationEmail } from "../lib/email";

export const billing = new Hono<Env>();

// Pricing restructure — see migrations/0018_pricing_restructure.sql. The
// first vehicle on any account is free (no payment, no credit needed); each
// one after that costs a flat EXTRA_VEHICLE_PRICE_PENCE. The physical
// laser-marked plaque used to be bundled into registration itself — it's now
// a separate, optional, per-vehicle purchase (PLAQUE_PRICE_PENCE), bought any
// time via /vehicles/:id/plaque. Document storage past the free per-vehicle
// allowance (see FREE_PHOTO_LIMIT / FREE_DOCUMENT_LIMIT in
// src/routes/documents.ts) is a repeatable top-up, STORAGE_TOPUP_SLOTS more
// slots in one pool for STORAGE_TOPUP_PRICE_PENCE.
export const FREE_VEHICLE_LIMIT = 1;
const EXTRA_VEHICLE_PRICE_PENCE = 500; // £5 — each vehicle after the first free one
const PLAQUE_PRICE_PENCE = 1500; // £15 — optional laser-marked plaque, per vehicle
export const STORAGE_TOPUP_SLOTS = 20;
export const STORAGE_TOPUP_PRICE_PENCE = 500; // £5 for +20 slots in one pool

function extraVehiclePricing() {
  return {
    amountPence: EXTRA_VEHICLE_PRICE_PENCE,
    label: "Additional vehicle",
    description: "Register another vehicle on your account — your first vehicle is always free.",
  };
}

billing.get("/buy", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicleList = await getVehiclesByUser(c.env.DB, user.id);

  if (user.unlimited_vehicles || vehicleList.length < FREE_VEHICLE_LIMIT || user.vehicle_credits > 0) {
    return c.redirect("/register-vehicle");
  }

  const pricing = extraVehiclePricing();
  const priceDisplay = `£${(pricing.amountPence / 100).toFixed(0)}`;

  const body = `
    <div style="width:100%;max-width:440px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">GET A MOTO ID</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1.25;margin-bottom:22px">${esc(pricing.label)}</div>
      <div style="font-family:var(--font-display);font-size:40px;margin-bottom:10px">${priceDisplay}</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:30px">One-time payment &middot; ${esc(pricing.description)}</div>
      <div style="border:1px solid var(--hairline);padding:18px 20px;margin-bottom:30px">
        <div style="font-size:12.5px;color:var(--ink-muted);line-height:1.7">Includes unlimited document storage up to the free per-vehicle allowance and a public verification page for the life of the vehicle. The laser-marked plaque is a separate optional purchase from the vehicle's own page. No subscription.</div>
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
  const vehicleList = await getVehiclesByUser(c.env.DB, user.id);

  if (user.unlimited_vehicles || vehicleList.length < FREE_VEHICLE_LIMIT || user.vehicle_credits > 0) {
    return c.redirect("/register-vehicle");
  }

  const pricing = extraVehiclePricing();
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
      await grantCreditForCheckoutSession(
        c.env.DB,
        session.id,
        user.id,
        session.amount_total ?? 0,
        session.currency ?? "gbp",
        session.payment_intent ?? null
      );
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

function plaqueOrderForm(vehicle: { id: string; make: string; model: string }, opts: { error?: string } = {}): string {
  const priceDisplay = `£${(PLAQUE_PRICE_PENCE / 100).toFixed(0)}`;
  return `
    <div style="width:100%;max-width:460px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">ORDER YOUR PLAQUE</div>
      <div style="font-family:var(--font-display);font-size:26px;line-height:1.3;margin-bottom:10px">${esc(vehicle.make)} ${esc(vehicle.model)}</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:26px">One engraved plate and a set of tamper-evident QR stickers, both carrying this vehicle's Moto ID number &mdash; ${priceDisplay}, posted to you.</div>
      ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
      <form method="post" action="/vehicles/${vehicle.id}/plaque">
        <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin:6px 0 18px">SHIP THE PLAQUE TO</div>
        <div style="display:flex;flex-direction:column;gap:24px;margin-bottom:30px">
          <div class="field" style="margin-bottom:0">
            <label>FULL NAME</label>
            <input type="text" name="shipName" required>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>ADDRESS LINE 1</label>
            <input type="text" name="shipAddressLine1" required>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>ADDRESS LINE 2 (OPTIONAL)</label>
            <input type="text" name="shipAddressLine2">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
            <div class="field" style="margin-bottom:0">
              <label>TOWN / CITY</label>
              <input type="text" name="shipCity" required>
            </div>
            <div class="field" style="margin-bottom:0">
              <label>POSTCODE</label>
              <input type="text" name="shipPostalCode" class="mono" required style="text-transform:uppercase">
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--ink-subtle)">We currently post within the United Kingdom only.</div>
        </div>
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">Continue to payment — ${priceDisplay}</button>
      </form>
      <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to vehicle</a>
    </div>`;
}

billing.get("/vehicles/:id/plaque", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return c.notFound();
  if (vehicle.plaque_status === "paid") return c.redirect(`/vehicles/${vehicle.id}`);

  const error = c.req.query("error");
  return c.html(authShell(`Order your plaque — ${vehicle.make} ${vehicle.model} — Moto ID`, plaqueOrderForm(vehicle, { error })));
});

billing.post("/vehicles/:id/plaque", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return c.notFound();
  if (vehicle.plaque_status === "paid") return c.redirect(`/vehicles/${vehicle.id}`);

  const body = await c.req.parseBody();
  const shipName = String(body.shipName ?? "").trim();
  const shipAddressLine1 = String(body.shipAddressLine1 ?? "").trim();
  const shipAddressLine2 = String(body.shipAddressLine2 ?? "").trim() || null;
  const shipCity = String(body.shipCity ?? "").trim();
  const shipPostalCode = String(body.shipPostalCode ?? "").trim();

  if (!shipName || !shipAddressLine1 || !shipCity || !shipPostalCode) {
    return c.html(
      authShell(`Order your plaque — ${vehicle.make} ${vehicle.model} — Moto ID`, plaqueOrderForm(vehicle, { error: "Please fill in the shipping address for your plaque." })),
      400
    );
  }

  const started = await startPlaqueOrder(c.env.DB, vehicle.id, {
    name: shipName,
    addressLine1: shipAddressLine1,
    addressLine2: shipAddressLine2,
    city: shipCity,
    postalCode: shipPostalCode,
    country: "United Kingdom",
  });
  if (!started) {
    return c.redirect(`/vehicles/${vehicle.id}?error=${encodeURIComponent("This vehicle's plaque is already on order.")}`);
  }

  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
  try {
    const session = await createCheckoutSession(c.env, {
      userId: user.id,
      userEmail: user.email,
      amountPence: PLAQUE_PRICE_PENCE,
      productName: "Moto ID laser-marked plaque",
      productDescription: `${vehicle.make} ${vehicle.model} — engraved plate + tamper-evident sticker set`,
      successUrl: `${origin}/vehicles/${vehicle.id}/plaque/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/vehicles/${vehicle.id}`,
      extraMetadata: { purpose: "plaque", vehicleId: vehicle.id },
    });
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe checkout session creation failed (plaque):", err instanceof Error ? err.message : String(err));
    return c.redirect(`/vehicles/${vehicle.id}/plaque?error=${encodeURIComponent("We couldn't start checkout right now. Please check back shortly.")}`);
  }
});

// Grants the plaque + sends Adam the shipping/order-notification email only
// the first time a given session actually flips plaque_status to 'paid'
// (setVehiclePlaquePaid is the idempotency guard — see its own comment) —
// so this page and the webhook below racing each other never double-sends.
billing.get("/vehicles/:id/plaque/success", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return c.notFound();

  const sessionId = c.req.query("session_id");
  if (sessionId) {
    const session = await retrieveCheckoutSession(c.env, sessionId);
    if (session && session.payment_status === "paid" && session.metadata?.vehicleId === vehicle.id) {
      const justPaid = await setVehiclePlaquePaid(c.env.DB, vehicle.id);
      if (justPaid) {
        try {
          const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
          await sendOrderNotificationEmail(c.env, {
            customerName: user.name,
            customerEmail: user.email,
            vehicle: {
              vehicleType: vehicle.vehicle_type,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year,
              colour: vehicle.colour,
              registrationNumber: vehicle.registration_number,
              vin: vehicle.vin,
              motoIdNumber: vehicle.moto_id_number,
            },
            shipping: {
              name: vehicle.ship_name ?? "",
              addressLine1: vehicle.ship_address_line1 ?? "",
              addressLine2: vehicle.ship_address_line2,
              city: vehicle.ship_city ?? "",
              postalCode: vehicle.ship_postal_code ?? "",
              country: vehicle.ship_country ?? "United Kingdom",
            },
            verifyUrl: `${origin}/verify/${vehicle.moto_id_number}`,
            paidOrder: true,
          });
        } catch (err) {
          console.error("Failed to send plaque order notification email:", err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  const freshVehicle = await getVehicleById(c.env.DB, vehicle.id);
  const isPaid = freshVehicle?.plaque_status === "paid";

  const body = `
    <div style="width:100%;max-width:440px;text-align:center">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">PAYMENT RECEIVED</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1.3;margin-bottom:22px">Thank you.</div>
      ${
        isPaid
          ? `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">Your plaque order for ${esc(vehicle.make)} ${esc(vehicle.model)} is on its way.</div>
             <a href="/vehicles/${vehicle.id}" class="btn btn-solid" style="display:block;border:none">Back to vehicle</a>`
          : `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">We're confirming your payment — this can take a few seconds. Refresh this page in a moment.</div>
             <a href="/vehicles/${vehicle.id}" class="btn btn-outline" style="display:block">Back to vehicle</a>`
      }
    </div>`;

  return c.html(authShell("Payment received — Moto ID", body));
});

function isStoragePool(v: unknown): v is "photo" | "document" {
  return v === "photo" || v === "document";
}

// Started from a "Buy +20 more" button on a folder page (see documents.ts) —
// `pool` is which cap to extend (photos, or the combined service+invoice
// documents cap) and `from` is the folder to send the owner back to
// afterwards, since the "document" pool covers two folders.
billing.post("/vehicles/:id/storage/buy", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return c.notFound();

  const body = await c.req.parseBody();
  const pool = body.pool;
  const from = body.from === "service" || body.from === "invoice" || body.from === "photo" ? body.from : "photo";
  if (!isStoragePool(pool)) return c.notFound();

  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
  try {
    const session = await createCheckoutSession(c.env, {
      userId: user.id,
      userEmail: user.email,
      amountPence: STORAGE_TOPUP_PRICE_PENCE,
      productName: pool === "photo" ? "Extra photo storage" : "Extra document storage",
      productDescription: `+${STORAGE_TOPUP_SLOTS} ${pool === "photo" ? "photo" : "service document / invoice"} slots for ${vehicle.make} ${vehicle.model}`,
      successUrl: `${origin}/vehicles/${vehicle.id}/storage/success?session_id={CHECKOUT_SESSION_ID}&pool=${pool}&from=${from}`,
      cancelUrl: `${origin}/vehicles/${vehicle.id}/folder/${from}`,
      extraMetadata: { purpose: "storage_topup", vehicleId: vehicle.id, pool, slots: String(STORAGE_TOPUP_SLOTS) },
    });
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe checkout session creation failed (storage top-up):", err instanceof Error ? err.message : String(err));
    return c.redirect(`/vehicles/${vehicle.id}/folder/${from}?error=${encodeURIComponent("We couldn't start checkout right now. Please check back shortly.")}`);
  }
});

billing.get("/vehicles/:id/storage/success", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return c.notFound();

  const sessionId = c.req.query("session_id");
  const poolParam = c.req.query("pool");
  const pool = isStoragePool(poolParam) ? poolParam : "photo";
  const from = c.req.query("from") === "service" || c.req.query("from") === "invoice" || c.req.query("from") === "photo" ? c.req.query("from")! : "photo";

  if (sessionId) {
    const session = await retrieveCheckoutSession(c.env, sessionId);
    if (session && session.payment_status === "paid" && session.metadata?.vehicleId === vehicle.id) {
      await grantStorageTopup(
        c.env.DB,
        session.id,
        user.id,
        vehicle.id,
        pool,
        STORAGE_TOPUP_SLOTS,
        session.amount_total ?? 0,
        session.currency ?? "gbp",
        session.payment_intent ?? null
      );
    }
  }

  return c.redirect(`/vehicles/${vehicle.id}/folder/${from}`);
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
    const purpose: string | undefined = session?.metadata?.purpose;

    // A marketplace listing fee (see src/routes/marketplace.ts) uses the
    // same Checkout Session + webhook plumbing as a Moto ID Kit purchase,
    // but must never grant a vehicle credit — metadata[purpose] is what
    // tells the two apart. Any session with no "purpose" metadata (every
    // kit purchase, unchanged) falls through to the original behaviour.
    if (purpose === "listing_fee") {
      const listingId: string | undefined = session?.metadata?.listingId;
      const paymentIntentId: string | undefined = typeof session?.payment_intent === "string" ? session.payment_intent : null;
      if (listingId && session.payment_status === "paid") {
        await setListingPaid(c.env.DB, listingId, paymentIntentId ?? null);
      }
    } else if (purpose === "plaque") {
      // Mirrors /vehicles/:id/plaque/success — the webhook and the success
      // redirect race each other, but setVehiclePlaquePaid only flips
      // plaque_status on its first call (WHERE plaque_status =
      // 'pending_payment'), so whichever lands first sends the order email
      // and the other is a safe no-op.
      const vehicleId: string | undefined = session?.metadata?.vehicleId;
      if (vehicleId && session.payment_status === "paid") {
        const justPaid = await setVehiclePlaquePaid(c.env.DB, vehicleId);
        if (justPaid) {
          const vehicle = await getVehicleById(c.env.DB, vehicleId);
          if (vehicle) {
            try {
              await sendOrderNotificationEmail(c.env, {
                customerName: vehicle.ship_name ?? "",
                customerEmail: typeof session?.customer_email === "string" ? session.customer_email : "",
                vehicle: {
                  vehicleType: vehicle.vehicle_type,
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                  colour: vehicle.colour,
                  registrationNumber: vehicle.registration_number,
                  vin: vehicle.vin,
                  motoIdNumber: vehicle.moto_id_number,
                },
                shipping: {
                  name: vehicle.ship_name ?? "",
                  addressLine1: vehicle.ship_address_line1 ?? "",
                  addressLine2: vehicle.ship_address_line2,
                  city: vehicle.ship_city ?? "",
                  postalCode: vehicle.ship_postal_code ?? "",
                  country: vehicle.ship_country ?? "United Kingdom",
                },
                verifyUrl: `https://www.digitalvehicleid.com/verify/${vehicle.moto_id_number}`,
                paidOrder: true,
              });
            } catch (err) {
              console.error("Failed to send plaque order notification email (webhook):", err instanceof Error ? err.message : String(err));
            }
          }
        }
      }
    } else if (purpose === "storage_topup") {
      const vehicleId: string | undefined = session?.metadata?.vehicleId;
      const userId: string | undefined = session?.metadata?.userId || session?.client_reference_id;
      const pool = session?.metadata?.pool === "photo" || session?.metadata?.pool === "document" ? session.metadata.pool : null;
      const slots = Number.parseInt(session?.metadata?.slots ?? "", 10);
      if (vehicleId && userId && pool && Number.isFinite(slots) && slots > 0 && session.payment_status === "paid" && session?.id) {
        await grantStorageTopup(
          c.env.DB,
          session.id,
          userId,
          vehicleId,
          pool,
          slots,
          session.amount_total ?? 0,
          session.currency ?? "gbp",
          session.payment_intent ?? null
        );
      }
    } else {
      const userId: string | undefined = session?.metadata?.userId || session?.client_reference_id;
      if (session?.id && userId && session.payment_status === "paid") {
        await grantCreditForCheckoutSession(
          c.env.DB,
          session.id,
          userId,
          session.amount_total ?? 0,
          session.currency ?? "gbp",
          session.payment_intent ?? null
        );
      }
    }
  }

  // charge.refunded and charge.dispute.created both carry a payment_intent
  // we can match back to the purchases row grantCreditForCheckoutSession
  // created above — see migrations/0014_stripe_refunds.sql. A credit is
  // only ever revoked automatically when the customer still has an unused
  // one sitting on their account; otherwise Adam gets emailed to decide
  // manually, since the vehicle (and possibly a shipped plate) likely
  // already exists. See revokeUnusedCreditIfAvailable in lib/db.ts.
  if (event.type === "charge.refunded") {
    const charge = event.data?.object;
    const paymentIntentId: string | undefined = typeof charge?.payment_intent === "string" ? charge.payment_intent : undefined;
    // charge.refunded is only true once the charge is refunded in full —
    // a partial refund leaves it false, and we don't auto-revoke a whole
    // credit for a partial refund (ambiguous whether that should cost the
    // customer their registration), so this handler is a no-op for those;
    // Adam still sees partial refunds in the Stripe dashboard directly.
    if (paymentIntentId && charge?.refunded === true) {
      const purchase = await getPurchaseByPaymentIntent(c.env.DB, paymentIntentId);
      if (purchase) {
        const notAlreadyProcessed = await markPurchaseRefunded(c.env.DB, purchase.id);
        if (notAlreadyProcessed) {
          const creditRevoked = await revokeUnusedCreditIfAvailable(c.env.DB, purchase.user_id);
          try {
            const buyer = await getUserById(c.env.DB, purchase.user_id);
            await sendPaymentReviewAlertEmail(c.env, {
              kind: "refund",
              customerEmail: buyer?.email ?? purchase.user_id,
              amountPence: purchase.amount_pence,
              currency: purchase.currency,
              creditRevoked,
            });
          } catch (err) {
            console.error("Failed to send refund review alert email:", err);
          }
        }
      }
    }
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data?.object;
    const paymentIntentId: string | undefined = typeof dispute?.payment_intent === "string" ? dispute.payment_intent : undefined;
    if (paymentIntentId) {
      const purchase = await getPurchaseByPaymentIntent(c.env.DB, paymentIntentId);
      if (purchase) {
        await markPurchaseDisputed(c.env.DB, purchase.id, dispute?.status ?? "created");
        // Disputes aren't idempotency-guarded the way refunds are (Stripe
        // sends further charge.dispute.updated events as a dispute
        // progresses, which we don't otherwise handle) — only revoke a
        // credit the first time we see a dispute on this purchase.
        if (!purchase.dispute_status) {
          const creditRevoked = await revokeUnusedCreditIfAvailable(c.env.DB, purchase.user_id);
          try {
            const buyer = await getUserById(c.env.DB, purchase.user_id);
            await sendPaymentReviewAlertEmail(c.env, {
              kind: "dispute",
              customerEmail: buyer?.email ?? purchase.user_id,
              amountPence: purchase.amount_pence,
              currency: purchase.currency,
              creditRevoked,
            });
          } catch (err) {
            console.error("Failed to send dispute review alert email:", err);
          }
        }
      }
    }
  }

  return c.text("ok", 200);
});
