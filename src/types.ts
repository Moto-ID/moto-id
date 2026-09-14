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
}

export interface Variables {
    user: User | null;
}

export type Env = { Bindings: Bindings; Variables: Variables };
