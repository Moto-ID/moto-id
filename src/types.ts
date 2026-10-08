import type { User } from "./lib/db";

export interface Bindings {
    DB: D1Database;
    // Uncomment once R2 is enabled on the account and the bucket exists (see wrangler.toml).
  // DOCS: R2Bucket;
  DOCS?: R2Bucket;
  // Set via `wrangler secret put RESEND_API_KEY` (or the Cloudflare dashboard) — never committed to the repo.
  RESEND_API_KEY?: string;
  // Non-secret sender address/name, set as a plain [vars] entry in wrangler.toml.
  RESEND_FROM_EMAIL?: string;
  // Non-secret public site origin, used to build links in emails (e.g. password reset links).
  PUBLIC_ORIGIN?: string;
  // Set via `wrangler secret put STRIPE_SECRET_KEY` (or the Cloudflare dashboard) — never committed to the repo.
  STRIPE_SECRET_KEY?: string;
  // Set via `wrangler secret put STRIPE_WEBHOOK_SECRET` — the signing secret for the /webhooks/stripe endpoint.
  STRIPE_WEBHOOK_SECRET?: string;
  // Non-secret: where to send the "new order" notification email for every
  // completed vehicle registration (see sendOrderNotificationEmail in
  // src/lib/email.ts). Defaults to adam_mcgivern@hotmail.com in code if unset
  // — only set this as a plain [vars] entry in wrangler.toml if that address
  // ever needs to change.
  ORDER_NOTIFICATION_EMAIL?: string;
  // DVSA MOT History API — all four set via `wrangler secret put` (or the
  // Cloudflare dashboard), never committed to the repo. See src/lib/dvsa.ts.
  // DVSA_TOKEN_URL is the tenant-specific Microsoft Entra ID token endpoint
  // from DVSA's "you've been granted access" email (not a fixed URL).
  DVSA_CLIENT_ID?: string;
  DVSA_CLIENT_SECRET?: string;
  DVSA_API_KEY?: string;
  DVSA_TOKEN_URL?: string;
}

export interface Variables {
    user: User | null;
}

export type Env = { Bindings: Bindings; Variables: Variables };
