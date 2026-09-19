import type { Bindings } from "../types";

const STRIPE_API = "https://api.stripe.com/v1";

export interface CheckoutSessionResult {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
}

/**
 * Creates a Stripe Checkout Session for a one-time Moto ID Kit purchase and
 * returns its hosted checkout URL. Calls the Stripe REST API directly via
 * fetch (same pattern as sendEmail() in email.ts for Resend) rather than
 * pulling in the stripe SDK. Requires STRIPE_SECRET_KEY (a Worker secret) to
 * be set — throws a clear error if it isn't, so callers can catch it and show
 * a friendly "payments aren't set up yet" message instead of crashing.
 */
export async function createCheckoutSession(
  env: Bindings,
  opts: {
    userId: string;
    userEmail: string;
    amountPence: number;
    productName: string;
    productDescription: string;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<{ id: string; url: string }> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured on this Worker.");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("customer_email", opts.userEmail);
  params.set("success_url", opts.successUrl);
  params.set("cancel_url", opts.cancelUrl);
  params.set("client_reference_id", opts.userId);
  params.set("metadata[userId]", opts.userId);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "gbp");
  params.set("line_items[0][price_data][unit_amount]", String(opts.amountPence));
  params.set("line_items[0][price_data][product_data][name]", opts.productName);
  params.set("line_items[0][price_data][product_data][description]", opts.productDescription);
  params.set("shipping_address_collection[allowed_countries][0]", "GB");
  // New Stripe accounts default to "Managed Payments", which is incompatible
  // with the classic shipping_address_collection param used above (Stripe
  // rejects the session with a 400 otherwise). We still need to collect a
  // postal address here (it's the only place the app collects one, for
  // posting the physical Moto ID Kit), so disable Managed Payments for this
  // session rather than dropping address collection.
  params.set("managed_payments[enabled]", "false");

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe API error creating checkout session (${res.status}): ${detail}`);
  }

  const session = (await res.json()) as { id: string; url: string | null };
  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL for this session.");
  }
  return { id: session.id, url: session.url };
}

/**
 * Fetches a Checkout Session back from Stripe by id. Used by the /buy/success
 * page to give the user an immediate confirmation without waiting on the
 * webhook. Returns null (rather than throwing) if Stripe isn't configured or
 * the lookup fails, since the webhook remains the authoritative path.
 */
export async function retrieveCheckoutSession(env: Bindings, sessionId: string): Promise<CheckoutSessionResult | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as CheckoutSessionResult;
}

/**
 * Verifies a Stripe webhook's `Stripe-Signature` header against the raw
 * request body, using Web Crypto (no Node crypto / stripe SDK dependency
 * needed — Workers-native). Returns true only if the signature is valid and
 * the timestamp is recent (protects against replay of an old captured
 * request).
 */
export async function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) parts[key] = value;
  }
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
