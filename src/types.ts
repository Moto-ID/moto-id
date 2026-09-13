import type { User } from "./lib/db";

export interface Bindings {
    DB: D1Database;
    // Uncomment once R2 is enabled on the account and the bucket exists (see wrangler.toml).
  // DOCS: R2Bucket;
  DOCS?: R2Bucket;
}

export interface Variables {
    user: User | null;
}

export type Env = { Bindings: Bindings; Variables: Variables };
