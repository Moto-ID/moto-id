import { newId, randomMotoIdNumber } from "./crypto";

export interface User {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    // Number of vehicle registrations this user is entitled to create. Signing
    // up is free and grants access to "My Collection"; each credit (granted by
    // a completed Stripe purchase — see grantCreditForCheckoutSession below) is
    // consumed by registering one vehicle. See migrations/0005_vehicle_credits.sql.
    vehicle_credits: number;
    // When truthy (1), this account can register any number of vehicles for
    // free — the credit check and /buy paywall are bypassed entirely and no
    // credit is ever consumed. Off (0) for every account by default; set
    // directly in the database for specific accounts (e.g. the business
    // owner's own account). See migrations/0006_unlimited_vehicles.sql.
    unlimited_vehicles: number;
    // Opt-in only, off (0) by default for every account — see
    // migrations/0009_notification_prefs.sql. Governs optional future
    // marketing/product-update emails only; transactional emails (password
    // resets, ownership-transfer invitations) are never gated by this flag.
    marketing_opt_in: number;
    // 1 once the account holder has clicked a verification link sent to
    // their email; 0 until then. Existing accounts were backfilled to 1 —
    // see migrations/0012_email_verification.sql. Checked before letting an
    // account accept an ownership-transfer invite (src/routes/vehicles.ts),
    // since that's the one place an unverified address could otherwise be
    // used to intercept something sent to someone else's inbox.
    email_verified: number;
    created_at: string;
}

export interface Vehicle {
    id: string;
    user_id: string;
    moto_id_number: string;
    vehicle_type: "car" | "motorcycle";
    registration_number: string;
    vin: string;
    make: string;
    model: string;
    year: number | null;
    colour: string | null;
    // Populated from the DVSA MOT History API — see migrations/0010_dvsa_mot_history.sql
    // and src/lib/dvsa.ts. All three are null until the first successful
    // lookup for this vehicle (at registration, or via a manual refresh).
    fuel_type: string | null;
    mot_due_date: string | null;
    mot_last_synced_at: string | null;
    // Owner-controlled visibility for the public /verify page — both off
    // (private) by default, same as a freshly uploaded document/photo. See
    // migrations/0011_mot_visibility_and_reminders.sql.
    mot_history_public: number;
    mileage_public: number;
    // Opt-in only, off by default. mot_reminder_sent_for records the exact
    // mot_due_date a reminder email was already sent for, so the scheduled
    // check (see getVehiclesDueMotReminder below) never double-sends for the
    // same MOT cycle.
    mot_reminder_opt_in: number;
    mot_reminder_sent_for: string | null;
    // One-time-only flag (not opt-in, unlike the MOT reminder above) — see
    // migrations/0016_zero_docs_reminder.sql and getVehiclesDueZeroDocsReminder.
    zero_docs_reminder_sent: number;
    photo_r2_key: string | null;
    // Shipping address for the physical plate, captured as part of the
    // register-vehicle form itself (see migrations/0007_vehicle_shipping.sql).
    // Always populated for any vehicle created after that migration — null
    // only for vehicles that existed before it.
    ship_name: string | null;
    ship_address_line1: string | null;
    ship_address_line2: string | null;
    ship_city: string | null;
    ship_postal_code: string | null;
    ship_country: string | null;
    // Pricing-restructure fields — see migrations/0018_pricing_restructure.sql.
    // The laser-marked plaque is now a separate, optional, per-vehicle
    // purchase made any time after registration (£15), rather than bundled
    // into registration itself — 'none' until the owner starts an order,
    // 'pending_payment' once they've submitted shipping details and been
    // sent to Stripe Checkout, 'paid' once that payment completes. The
    // ship_* columns above are reused for the plaque's shipping address,
    // populated when the order starts rather than at registration.
    plaque_status: "none" | "pending_payment" | "paid";
    plaque_paid_at: string | null;
    // Free tier is 10 photos and 10 combined service+invoice documents per
    // vehicle (see FREE_PHOTO_LIMIT / FREE_DOCUMENT_LIMIT in
    // src/routes/documents.ts) — these track additional slots bought on top
    // of that, £5 per +20 (see STORAGE_TOPUP_* in src/routes/billing.ts).
    extra_photo_slots: number;
    extra_document_slots: number;
    created_at: string;
}

export type Folder = "service" | "invoice" | "photo";

export interface Document {
    id: string;
    vehicle_id: string;
    folder: Folder;
    filename: string;
    r2_key: string;
    content_type: string | null;
    size_bytes: number | null;
    added_by: string | null;
    is_public: number;
    // Set when the owner deletes this document; null means "not deleted".
    // A soft-deleted document is hidden from every normal listing but keeps
    // its D1 row and R2 object until the undo window expires — see
    // DOCUMENT_UNDO_WINDOW_DAYS and migrations/0015_document_soft_delete.sql.
    deleted_at: string | null;
    created_at: string;
}

// How long a deleted document stays recoverable before the daily cron's
// sweep (getExpiredSoftDeletedDocuments, called from src/index.ts) purges
// it from both D1 and R2 for good.
export const DOCUMENT_UNDO_WINDOW_DAYS = 30;

// Sessions use a sliding 30-minute idle window, not a fixed lifetime: every
// authenticated request pushes the expiry forward another 30 minutes (see
// getSessionUser below), so someone actively using the app is never signed
// out mid-session — only after walking away for half an hour or more. The
// session cookie itself (src/lib/auth.ts) is set for 30 days purely as a
// carrier for the token; this server-side expiry is the real gate on
// whether a visit is still signed in.
const SESSION_IDLE_MINUTES = 30;

export async function createUser(db: D1Database, name: string, email: string, passwordHash: string): Promise<User> {
    const id = newId();
    await db
          .prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
          .bind(id, name, email.toLowerCase().trim(), passwordHash)
          .run();
    return {
        id,
        name,
        email,
        password_hash: passwordHash,
        vehicle_credits: 0,
        unlimited_vehicles: 0,
        marketing_opt_in: 0,
        email_verified: 0,
        created_at: new Date().toISOString(),
    };
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
    const row = await db
          .prepare("SELECT * FROM users WHERE email = ?")
          .bind(email.toLowerCase().trim())
          .first<User>();
    return row ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
    const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
    return row ?? null;
}

export async function createSession(db: D1Database, userId: string, token: string): Promise<void> {
    const expires = new Date(Date.now() + SESSION_IDLE_MINUTES * 60 * 1000).toISOString();
    await db
          .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(token, userId, expires)
          .run();
}

export async function getSessionUser(db: D1Database, token: string): Promise<User | null> {
    const row = await db
          .prepare(
            `SELECT users.* FROM sessions
             JOIN users ON users.id = sessions.user_id
             WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`
          )
          .bind(token)
          .first<User>();

    if (row) {
        // Sliding window: this request counts as activity, so push the
        // session's expiry another 30 minutes out. Best-effort — if this
        // write fails for some reason, the session simply expires on its
        // last-set schedule instead of being extended, which is a safe
        // failure mode (errs toward signing out, not staying in forever).
        const newExpires = new Date(Date.now() + SESSION_IDLE_MINUTES * 60 * 1000).toISOString();
        try {
            await db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(newExpires, token).run();
        } catch {
            // best-effort — see comment above
        }
    }

    return row ?? null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
}

export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string): Promise<void> {
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
}

export async function updateUserProfile(db: D1Database, userId: string, name: string, email: string): Promise<void> {
    await db
          .prepare("UPDATE users SET name = ?, email = ? WHERE id = ?")
          .bind(name, email.toLowerCase().trim(), userId)
          .run();
}

export async function setMarketingOptIn(db: D1Database, userId: string, optIn: boolean): Promise<void> {
    await db.prepare("UPDATE users SET marketing_opt_in = ? WHERE id = ?").bind(optIn ? 1 : 0, userId).run();
}

const PASSWORD_RESET_TTL_MINUTES = 60;

export interface PasswordReset {
    token: string;
    user_id: string;
    expires_at: string;
    used: number;
    created_at: string;
}

export async function createPasswordResetToken(db: D1Database, userId: string, token: string): Promise<void> {
    const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString();
    await db
          .prepare("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(token, userId, expires)
          .run();
}

export async function getValidPasswordResetToken(db: D1Database, token: string): Promise<PasswordReset | null> {
    const row = await db
          .prepare(
            `SELECT * FROM password_resets
             WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
          )
          .bind(token)
          .first<PasswordReset>();
    return row ?? null;
}

export async function markPasswordResetUsed(db: D1Database, token: string): Promise<void> {
    await db.prepare("UPDATE password_resets SET used = 1 WHERE token = ?").bind(token).run();
}

// --- Email verification (migrations/0012_email_verification.sql) ---------

const EMAIL_VERIFICATION_TTL_MINUTES = 60 * 24; // 24 hours — longer-lived than a
// password reset since a verification link is less sensitive and people are
// slower to act on a "welcome" email than a "reset your password" one.

export interface EmailVerification {
    token: string;
    user_id: string;
    expires_at: string;
    used: number;
    created_at: string;
}

export async function createEmailVerificationToken(db: D1Database, userId: string, token: string): Promise<void> {
    const expires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();
    await db
          .prepare("INSERT INTO email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(token, userId, expires)
          .run();
}

export async function getValidEmailVerificationToken(db: D1Database, token: string): Promise<EmailVerification | null> {
    try {
        const row = await db
              .prepare(
                `SELECT * FROM email_verifications
                 WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
              )
              .bind(token)
              .first<EmailVerification>();
        return row ?? null;
    } catch {
        // migration 0012 not applied yet — no verification could have been
        // created either, so "not found" is the correct, safe answer; the
        // GET /verify-email/:token route already shows a sensible "invalid
        // or expired" page for a null result.
        return null;
    }
}

export async function markEmailVerificationUsed(db: D1Database, token: string): Promise<void> {
    await db.prepare("UPDATE email_verifications SET used = 1 WHERE token = ?").bind(token).run();
}

export async function setEmailVerified(db: D1Database, userId: string): Promise<void> {
    await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(userId).run();
}

// --- Auth attempt rate limiting (migrations/0013_auth_attempts.sql) ------
//
// A generic log of sensitive-auth attempts, checked before processing a
// request and recorded after. `scope` names the action ("login",
// "signup", "forgot_password", "resend_verification"); `key` is whatever
// the caller wants to throttle on (a lowercased email, an IP, or
// "<email>|<ip>"); `outcome` lets login count only failures toward its
// threshold (see checkRateLimit) so a legitimate user isn't locked out by
// their own successful logins.

export type AuthAttemptOutcome = "attempt" | "success" | "failure";

export async function recordAuthAttempt(
    db: D1Database,
    scope: string,
    key: string,
    outcome: AuthAttemptOutcome = "attempt"
): Promise<void> {
    try {
        await db
              .prepare("INSERT INTO auth_attempts (id, scope, key, outcome) VALUES (?, ?, ?, ?)")
              .bind(newId(), scope, key, outcome)
              .run();
    } catch (err) {
        // Most likely migration 0013 hasn't been applied yet (Cloudflare
        // Workers Builds deploys this code on every push to main, but
        // migrations are applied manually by Adam afterwards — see
        // deployment-status.md) — never let that break login/signup/
        // forgot-password, which all call this before anything else.
        console.error("recordAuthAttempt failed (has migration 0013 been run?):", err instanceof Error ? err.message : String(err));
        return;
    }

    // Opportunistic cleanup, run on a small fraction of calls so this table
    // never needs its own cron job to stay bounded. Best-effort: a failed
    // cleanup is harmless, it just gets retried on a later call.
    if (Math.random() < 0.02) {
        try {
            await db.prepare("DELETE FROM auth_attempts WHERE created_at < datetime('now', '-1 day')").run();
        } catch {
            // best-effort — see comment above
        }
    }
}

/**
 * True if `key` is still under the attempt limit for `scope` within the
 * trailing `windowMinutes`. Counts rows whose outcome is "failure" or
 * "attempt" (i.e. ignores "success" rows) — so for scopes that always
 * record "attempt" (signup, forgot_password, resend_verification) every
 * call counts, while for "login" (which records "success"/"failure")
 * only failures count.
 */
export async function checkRateLimit(
    db: D1Database,
    scope: string,
    key: string,
    maxAttempts: number,
    windowMinutes: number
): Promise<boolean> {
    try {
        const row = await db
              .prepare(
                `SELECT COUNT(*) AS n FROM auth_attempts
                 WHERE scope = ? AND key = ? AND outcome != 'success'
                   AND created_at > datetime('now', ?)`
              )
              .bind(scope, key, `-${windowMinutes} minutes`)
              .first<{ n: number }>();
        return (row?.n ?? 0) < maxAttempts;
    } catch (err) {
        // Fail OPEN (allowed) rather than locking out every login/signup/
        // forgot-password attempt — see the comment in recordAuthAttempt
        // above. Rate limiting is defense-in-depth, not the only thing
        // standing between this app and abuse, so "briefly no rate
        // limiting" is a far better failure mode than "nobody can sign in."
        console.error("checkRateLimit failed (has migration 0013 been run?):", err instanceof Error ? err.message : String(err));
        return true;
    }
}

export async function generateUniqueMotoIdNumber(db: D1Database): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
          const candidate = randomMotoIdNumber();
          const existing = await db
                  .prepare("SELECT id FROM vehicles WHERE moto_id_number = ?")
                  .bind(candidate)
                  .first();
          if (!existing) return candidate;
    }
    throw new Error("Could not generate a unique Moto ID number after 20 attempts");
}

// Registration no longer collects a shipping address or bundles a physical
// plate — the laser-marked plaque is a separate, optional, per-vehicle
// purchase made any time afterwards (see startPlaqueOrder below), so
// ship_* starts out null on every vehicle and is only populated once an
// owner actually starts a plaque order.
export async function createVehicle(
    db: D1Database,
    userId: string,
    input: {
          vehicleType: "car" | "motorcycle";
          registrationNumber: string;
          vin: string;
          make: string;
          model: string;
          year: number | null;
          colour: string | null;
    }
  ): Promise<Vehicle> {
    const id = newId();
    const motoIdNumber = await generateUniqueMotoIdNumber(db);
    await db
          .prepare(
            `INSERT INTO vehicles
             (id, user_id, moto_id_number, vehicle_type, registration_number, vin, make, model, year, colour)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            userId,
            motoIdNumber,
            input.vehicleType,
            input.registrationNumber.toUpperCase().trim(),
            input.vin.toUpperCase().trim(),
            input.make.trim(),
            input.model.trim(),
            input.year,
            input.colour
          )
          .run();
    return {
          id,
          user_id: userId,
          moto_id_number: motoIdNumber,
          vehicle_type: input.vehicleType,
          registration_number: input.registrationNumber,
          vin: input.vin,
          make: input.make,
          model: input.model,
          year: input.year,
          colour: input.colour,
        fuel_type: null,
        mot_due_date: null,
        mot_last_synced_at: null,
        mot_history_public: 0,
        mileage_public: 0,
        mot_reminder_opt_in: 0,
        mot_reminder_sent_for: null,
        zero_docs_reminder_sent: 0,
        photo_r2_key: null,
        ship_name: null,
        ship_address_line1: null,
        ship_address_line2: null,
        ship_city: null,
        ship_postal_code: null,
        ship_country: null,
        plaque_status: "none",
        plaque_paid_at: null,
        extra_photo_slots: 0,
        extra_document_slots: 0,
        created_at: new Date().toISOString(),
    };
}

// Starts a plaque order: records the shipping address and flips plaque_status
// to 'pending_payment' so the owner can be sent to Stripe Checkout for the
// £15 charge — see billing.ts's /vehicles/:id/plaque flow. Only allowed from
// 'none' (or re-entered from a stale 'pending_payment' if they abandoned
// checkout last time), never once a plaque is already 'paid' — returns false
// if called on a vehicle that's already paid for, so the route can treat
// that as a no-op rather than silently overwriting a real order's address.
export async function startPlaqueOrder(
    db: D1Database,
    vehicleId: string,
    shipping: { name: string; addressLine1: string; addressLine2: string | null; city: string; postalCode: string; country: string }
): Promise<boolean> {
    try {
          const res = await db
                .prepare(
                      `UPDATE vehicles SET plaque_status = 'pending_payment',
                       ship_name = ?, ship_address_line1 = ?, ship_address_line2 = ?, ship_city = ?, ship_postal_code = ?, ship_country = ?
                       WHERE id = ? AND plaque_status != 'paid'`
                )
                .bind(
                      shipping.name.trim(),
                      shipping.addressLine1.trim(),
                      shipping.addressLine2?.trim() || null,
                      shipping.city.trim(),
                      shipping.postalCode.toUpperCase().trim(),
                      shipping.country.trim(),
                      vehicleId
                )
                .run();
          return (res.meta?.changes ?? 0) > 0;
    } catch (err) {
          console.error("startPlaqueOrder failed (has migration 0018 been run?):", err instanceof Error ? err.message : String(err));
          return false;
    }
}

// Idempotent — see setListingPaid for the same pattern. Only flips
// pending_payment -> paid, so a webhook and the /plaque/success fallback
// calling this for the same vehicle is harmless.
export async function setVehiclePlaquePaid(db: D1Database, vehicleId: string): Promise<boolean> {
    try {
          const res = await db
                .prepare(`UPDATE vehicles SET plaque_status = 'paid', plaque_paid_at = datetime('now') WHERE id = ? AND plaque_status = 'pending_payment'`)
                .bind(vehicleId)
                .run();
          return (res.meta?.changes ?? 0) > 0;
    } catch (err) {
          console.error("setVehiclePlaquePaid failed (has migration 0018 been run?):", err instanceof Error ? err.message : String(err));
          return false;
    }
}

// Records a completed storage top-up Checkout Session and grants the extra
// slots — idempotent on sessionId via the shared `purchases` table (same
// ON CONFLICT DO NOTHING pattern as grantCreditForCheckoutSession), so a
// webhook and the success-page fallback both calling this for the same
// session only ever grants the slots once. `pool` selects which cap the
// slots apply to — see FREE_PHOTO_LIMIT / FREE_DOCUMENT_LIMIT in
// src/routes/documents.ts.
export async function grantStorageTopup(
    db: D1Database,
    sessionId: string,
    userId: string,
    vehicleId: string,
    pool: "photo" | "document",
    slots: number,
    amountPence: number,
    currency: string,
    paymentIntentId: string | null = null
): Promise<boolean> {
    let result;
    try {
          result = await db
                .prepare(
                      `INSERT INTO purchases (id, user_id, amount_pence, currency, status, payment_intent_id)
                       VALUES (?, ?, ?, ?, 'paid', ?)
                       ON CONFLICT(id) DO NOTHING`
                )
                .bind(sessionId, userId, amountPence, currency, paymentIntentId)
                .run();
    } catch {
          result = await db
                .prepare(
                      `INSERT INTO purchases (id, user_id, amount_pence, currency, status)
                       VALUES (?, ?, ?, ?, 'paid')
                       ON CONFLICT(id) DO NOTHING`
                )
                .bind(sessionId, userId, amountPence, currency)
                .run();
    }
    const granted = (result.meta?.changes ?? 0) > 0;
    if (!granted) return false;

    const column = pool === "photo" ? "extra_photo_slots" : "extra_document_slots";
    try {
          await db
                .prepare(`UPDATE vehicles SET ${column} = ${column} + ? WHERE id = ?`)
                .bind(slots, vehicleId)
                .run();
    } catch (err) {
          console.error("grantStorageTopup failed to apply slots (has migration 0018 been run?):", err instanceof Error ? err.message : String(err));
    }
    return true;
}

export async function setVehiclePhoto(db: D1Database, vehicleId: string, r2Key: string | null): Promise<void> {
    await db.prepare("UPDATE vehicles SET photo_r2_key = ? WHERE id = ?").bind(r2Key, vehicleId).run();
}

export async function getVehiclesByUser(db: D1Database, userId: string): Promise<Vehicle[]> {
    const { results } = await db
          .prepare("SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at ASC")
          .bind(userId)
          .all<Vehicle>();
    return results;
}

export async function getVehicleById(db: D1Database, id: string): Promise<Vehicle | null> {
    const row = await db.prepare("SELECT * FROM vehicles WHERE id = ?").bind(id).first<Vehicle>();
    return row ?? null;
}

export async function getVehicleByMotoIdNumber(db: D1Database, motoIdNumber: string): Promise<Vehicle | null> {
    const row = await db
          .prepare("SELECT * FROM vehicles WHERE moto_id_number = ?")
          .bind(motoIdNumber)
          .first<Vehicle>();
    return row ?? null;
}

export async function addDocument(
    db: D1Database,
    vehicleId: string,
    input: {
          folder: Folder;
          filename: string;
          r2Key: string;
          contentType: string | null;
          sizeBytes: number | null;
          addedBy: string | null;
          isPublic: boolean;
    }
  ): Promise<Document> {
    const id = newId();
    await db
          .prepare(
            `INSERT INTO documents (id, vehicle_id, folder, filename, r2_key, content_type, size_bytes, added_by, is_public)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(id, vehicleId, input.folder, input.filename, input.r2Key, input.contentType, input.sizeBytes, input.addedBy, input.isPublic ? 1 : 0)
          .run();
    return {
          id,
          vehicle_id: vehicleId,
          folder: input.folder,
          filename: input.filename,
          r2_key: input.r2Key,
          content_type: input.contentType,
          size_bytes: input.sizeBytes,
          added_by: input.addedBy,
          is_public: input.isPublic ? 1 : 0,
          deleted_at: null,
          created_at: new Date().toISOString(),
    };
}

export async function setDocumentVisibility(db: D1Database, docId: string, isPublic: boolean): Promise<void> {
    await db.prepare("UPDATE documents SET is_public = ? WHERE id = ?").bind(isPublic ? 1 : 0, docId).run();
}

export async function getDocumentById(db: D1Database, docId: string): Promise<Document | null> {
    const row = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first<Document>();
    return row ?? null;
}

// Permanently deletes a single document's D1 row — used only by the purge
// sweep below, once a soft-deleted document's undo window has expired.
// Callers are responsible for deleting the corresponding R2 object first
// (same convention as deleteVehicle above). For the user-facing "delete"
// action, see softDeleteDocument instead.
export async function deleteDocument(db: D1Database, docId: string): Promise<void> {
    await db.prepare("DELETE FROM documents WHERE id = ?").bind(docId).run();
}

// NOTE on the deleted_at fallbacks below: Cloudflare Workers Builds
// auto-deploys on every push to main, but migrations are applied manually
// by Adam afterwards (see deployment-status.md) — so there's always a
// window where this code is live before migrations/0015_document_soft_delete.sql
// has run, and every function below is on an already-shipped, high-traffic
// path (folder pages, the dashboard, and the PUBLIC /verify page). Querying
// a column that doesn't exist yet would throw "no such column: deleted_at"
// and break those pages outright, so each one catches that and falls back
// to the pre-migration query (no soft-delete concept yet, so nothing to
// filter) rather than erroring. Once the migration has run, this fallback
// path is simply never taken.

/** The user-facing "delete" action: hides the document everywhere, but
 *  keeps it (and its R2 object) around for DOCUMENT_UNDO_WINDOW_DAYS. */
export async function softDeleteDocument(db: D1Database, docId: string): Promise<void> {
    try {
        await db.prepare("UPDATE documents SET deleted_at = datetime('now') WHERE id = ?").bind(docId).run();
    } catch {
        // migration 0015 not applied yet — fall back to the hard-delete this
        // route had before this feature, so clicking "Delete" keeps working
        // rather than erroring; a resulting orphaned R2 object is harmless,
        // same tolerance used everywhere else in this codebase.
        await db.prepare("DELETE FROM documents WHERE id = ?").bind(docId).run();
    }
}

/** Undoes softDeleteDocument — makes the document visible again everywhere. */
export async function restoreDocument(db: D1Database, docId: string): Promise<void> {
    try {
        await db.prepare("UPDATE documents SET deleted_at = NULL WHERE id = ?").bind(docId).run();
    } catch {
        // Nothing to restore if migration 0015 hasn't run — soft-delete
        // can't have happened yet either.
    }
}

/** Documents currently in the "recently deleted" state for a vehicle, most
 *  recently deleted first — backs the undo UI on each folder page. */
export async function listDeletedDocuments(db: D1Database, vehicleId: string): Promise<Document[]> {
    try {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
              .bind(vehicleId)
              .all<Document>();
        return results;
    } catch {
        return []; // migration 0015 not applied yet — nothing is "deleted" in that sense
    }
}

/** Soft-deleted documents whose undo window has expired — callers should
 *  delete each one's R2 object (r2_key) and then call deleteDocument. */
export async function getExpiredSoftDeletedDocuments(db: D1Database): Promise<Document[]> {
    try {
        const { results } = await db
              .prepare(`SELECT * FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`)
              .bind(`-${DOCUMENT_UNDO_WINDOW_DAYS} days`)
              .all<Document>();
        return results;
    } catch {
        return [];
    }
}

export async function listPublicDocuments(db: D1Database, vehicleId: string): Promise<Document[]> {
    try {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND is_public = 1 AND deleted_at IS NULL ORDER BY created_at DESC")
              .bind(vehicleId)
              .all<Document>();
        return results;
    } catch {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND is_public = 1 ORDER BY created_at DESC")
              .bind(vehicleId)
              .all<Document>();
        return results;
    }
}

export async function getPublicDocument(db: D1Database, vehicleId: string, docId: string): Promise<Document | null> {
    try {
        const row = await db
              .prepare("SELECT * FROM documents WHERE id = ? AND vehicle_id = ? AND is_public = 1 AND deleted_at IS NULL")
              .bind(docId, vehicleId)
              .first<Document>();
        return row ?? null;
    } catch {
        const row = await db
              .prepare("SELECT * FROM documents WHERE id = ? AND vehicle_id = ? AND is_public = 1")
              .bind(docId, vehicleId)
              .first<Document>();
        return row ?? null;
    }
}

export async function listDocuments(db: D1Database, vehicleId: string, folder: Folder): Promise<Document[]> {
    try {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND folder = ? AND deleted_at IS NULL ORDER BY created_at DESC")
              .bind(vehicleId, folder)
              .all<Document>();
        return results;
    } catch {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND folder = ? ORDER BY created_at DESC")
              .bind(vehicleId, folder)
              .all<Document>();
        return results;
    }
}

export async function countDocumentsByFolder(db: D1Database, vehicleId: string): Promise<Record<Folder, number>> {
    let results;
    try {
        ({ results } = await db
              .prepare("SELECT folder, COUNT(*) as n FROM documents WHERE vehicle_id = ? AND deleted_at IS NULL GROUP BY folder")
              .bind(vehicleId)
              .all<{ folder: Folder; n: number }>());
    } catch {
        ({ results } = await db
              .prepare("SELECT folder, COUNT(*) as n FROM documents WHERE vehicle_id = ? GROUP BY folder")
              .bind(vehicleId)
              .all<{ folder: Folder; n: number }>());
    }
    const counts: Record<Folder, number> = { service: 0, invoice: 0, photo: 0 };
    for (const row of results) counts[row.folder] = row.n;
    return counts;
}

export async function recentActivity(db: D1Database, vehicleId: string, limit = 6): Promise<Document[]> {
    try {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?")
              .bind(vehicleId, limit)
              .all<Document>();
        return results;
    } catch {
        const { results } = await db
              .prepare("SELECT * FROM documents WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT ?")
              .bind(vehicleId, limit)
              .all<Document>();
        return results;
    }
}

// All documents for a vehicle, across every folder, no limit — used when
// removing a vehicle to find every R2 object that needs deleting alongside
// the D1 rows (which cascade automatically; R2 does not).
export async function listAllDocumentsForVehicle(db: D1Database, vehicleId: string): Promise<Document[]> {
    const { results } = await db
          .prepare("SELECT * FROM documents WHERE vehicle_id = ?")
          .bind(vehicleId)
          .all<Document>();
    return results;
}

// Permanently removes a vehicle. `documents`, `verification_scans`,
// `vehicle_transfers` and `ownership_history` rows all cascade via their
// ON DELETE CASCADE foreign keys — only the vehicles row itself needs
// deleting here. Callers are responsible for deleting the corresponding R2
// objects first (this function only touches D1) and for refusing the
// delete while a transfer is pending.
export async function deleteVehicle(db: D1Database, vehicleId: string): Promise<void> {
    await db.prepare("DELETE FROM vehicles WHERE id = ?").bind(vehicleId).run();
}

export async function recordScan(db: D1Database, vehicleId: string): Promise<void> {
    await db
          .prepare("INSERT INTO verification_scans (id, vehicle_id) VALUES (?, ?)")
          .bind(newId(), vehicleId)
          .run();
}

export async function lastScan(db: D1Database, vehicleId: string): Promise<string | null> {
    const row = await db
          .prepare("SELECT scanned_at FROM verification_scans WHERE vehicle_id = ? ORDER BY scanned_at DESC LIMIT 1")
          .bind(vehicleId)
          .first<{ scanned_at: string }>();
    return row?.scanned_at ?? null;
}

// --- Vehicle credits / payments -------------------------------------------
//
// Signing up is free ("My Collection" is accessible with zero credits).
// Registering a vehicle (getting an actual Moto ID) consumes one credit.
// Credits are granted by a completed Stripe purchase — see src/lib/stripe.ts
// and src/routes/billing.ts for the checkout + webhook flow.

export interface Purchase {
    id: string; // Stripe Checkout Session id
    user_id: string;
    amount_pence: number;
    currency: string;
    status: string;
    // The Stripe PaymentIntent id, used to match an incoming charge.refunded
    // or charge.dispute.created webhook event back to this purchase — see
    // migrations/0014_stripe_refunds.sql. Null for any purchase recorded
    // before that migration.
    payment_intent_id: string | null;
    refunded_at: string | null;
    dispute_status: string | null;
    created_at: string;
}

export async function addUserCredits(db: D1Database, userId: string, amount: number): Promise<void> {
    await db.prepare("UPDATE users SET vehicle_credits = vehicle_credits + ? WHERE id = ?").bind(amount, userId).run();
}

/**
 * Atomically consumes one vehicle credit for a user, if they have one.
 * Returns true if a credit was consumed, false if they had none (the caller
 * should treat false as "not entitled to register a vehicle right now").
 */
export async function consumeUserCredit(db: D1Database, userId: string): Promise<boolean> {
    const result = await db
          .prepare("UPDATE users SET vehicle_credits = vehicle_credits - 1 WHERE id = ? AND vehicle_credits > 0")
          .bind(userId)
          .run();
    return (result.meta.changes ?? 0) > 0;
}

/**
 * Records a completed Stripe Checkout Session and grants one vehicle credit —
 * idempotently, keyed on the session id, so it's safe to call this more than
 * once for the same session (e.g. once from the /webhooks/stripe handler and
 * once from the /buy/success page's own confirmation check). Returns true
 * only the first time (i.e. when a credit was actually granted just now).
 */
export async function grantCreditForCheckoutSession(
    db: D1Database,
    sessionId: string,
    userId: string,
    amountPence: number,
    currency: string,
    paymentIntentId: string | null = null
): Promise<boolean> {
    // This is the revenue-critical path: it's what actually grants the
    // credit a customer just paid for, from both the webhook and the
    // /buy/success fallback. Cloudflare Workers Builds deploys this code on
    // every push to main, but migrations are applied manually afterwards —
    // so there's a window where this code is live before
    // migrations/0014_stripe_refunds.sql has added payment_intent_id. A
    // real customer's purchase must never fail in that window just because
    // we tried to also record a column that doesn't exist yet.
    let result;
    try {
        result = await db
              .prepare(
                    `INSERT INTO purchases (id, user_id, amount_pence, currency, status, payment_intent_id)
                     VALUES (?, ?, ?, ?, 'paid', ?)
                     ON CONFLICT(id) DO NOTHING`
              )
              .bind(sessionId, userId, amountPence, currency, paymentIntentId)
              .run();
    } catch {
        result = await db
              .prepare(
                    `INSERT INTO purchases (id, user_id, amount_pence, currency, status)
                     VALUES (?, ?, ?, ?, 'paid')
                     ON CONFLICT(id) DO NOTHING`
              )
              .bind(sessionId, userId, amountPence, currency)
              .run();
    }
    const grantedNow = (result.meta.changes ?? 0) > 0;
    if (grantedNow) {
        await addUserCredits(db, userId, 1);
    }
    return grantedNow;
}

/** Looks up the purchase a Stripe charge/dispute's payment_intent belongs to. */
export async function getPurchaseByPaymentIntent(db: D1Database, paymentIntentId: string): Promise<Purchase | null> {
    const row = await db.prepare("SELECT * FROM purchases WHERE payment_intent_id = ?").bind(paymentIntentId).first<Purchase>();
    return row ?? null;
}

/**
 * Atomically decrements vehicle_credits by 1, but only if the user
 * currently has one to spare. Used to revoke a credit after a refund or
 * chargeback: "only if unused" because a credit that's already been
 * consumed means a vehicle (and very likely an already-shipped physical
 * plate) exists against it — reversing that needs a human decision, not an
 * automatic decrement that could take the count negative or claw back a
 * different, legitimate registration. Returns whether a credit was
 * actually revoked.
 */
export async function revokeUnusedCreditIfAvailable(db: D1Database, userId: string): Promise<boolean> {
    const result = await db
          .prepare("UPDATE users SET vehicle_credits = vehicle_credits - 1 WHERE id = ? AND vehicle_credits > 0")
          .bind(userId)
          .run();
    return (result.meta.changes ?? 0) > 0;
}

/**
 * Marks a purchase as refunded, idempotently. Returns false if it was
 * already marked refunded, so a duplicate charge.refunded delivery (Stripe
 * doesn't guarantee exactly-once webhook delivery) never revokes a second
 * credit for the same refund.
 */
export async function markPurchaseRefunded(db: D1Database, purchaseId: string): Promise<boolean> {
    const result = await db
          .prepare("UPDATE purchases SET refunded_at = datetime('now') WHERE id = ? AND refunded_at IS NULL")
          .bind(purchaseId)
          .run();
    return (result.meta.changes ?? 0) > 0;
}

export async function markPurchaseDisputed(db: D1Database, purchaseId: string, status: string): Promise<void> {
    await db.prepare("UPDATE purchases SET dispute_status = ? WHERE id = ?").bind(status, purchaseId).run();
}

// --- Ownership transfer -----------------------------------------------------
//
// A vehicle's current owner can hand it to a new owner (e.g. the vehicle was
// sold) by emailing an accept link to the buyer's address. It's free (see
// business-plan.md Section 6: "a record that becomes harder to pass on at
// exactly the point it matters most would undermine the whole point of the
// product"), and the buyer must sign in or create an account using the exact
// email the transfer was sent to before they can accept it — a bare,
// unguessable token in the link already proves inbox access, but matching
// the signed-in account's email too stops a transfer being claimed by
// whichever account happens to be signed in when the link is opened.
// See migrations/0008_vehicle_transfers.sql.

const VEHICLE_TRANSFER_TTL_DAYS = 14;

export interface VehicleTransfer {
    token: string;
    vehicle_id: string;
    from_user_id: string;
    to_email: string;
    status: "pending" | "accepted" | "declined" | "cancelled";
    created_at: string;
    expires_at: string;
    resolved_at: string | null;
}

export interface OwnershipHistoryEntry {
    id: string;
    vehicle_id: string;
    from_user_id: string | null;
    from_name: string | null;
    to_user_id: string;
    to_name: string;
    transferred_at: string;
}

export async function createVehicleTransfer(
    db: D1Database,
    vehicleId: string,
    fromUserId: string,
    toEmail: string,
    token: string
): Promise<void> {
    const expires = new Date(Date.now() + VEHICLE_TRANSFER_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db
          .prepare(
                `INSERT INTO vehicle_transfers (token, vehicle_id, from_user_id, to_email, expires_at)
                 VALUES (?, ?, ?, ?, ?)`
          )
          .bind(token, vehicleId, fromUserId, toEmail.toLowerCase().trim(), expires)
          .run();
}

/** The vehicle's current unresolved transfer, if any — a vehicle can only have one pending transfer at a time. */
export async function getPendingTransferForVehicle(db: D1Database, vehicleId: string): Promise<VehicleTransfer | null> {
    const row = await db
          .prepare(
                `SELECT * FROM vehicle_transfers
                 WHERE vehicle_id = ? AND status = 'pending' AND expires_at > datetime('now')
                 ORDER BY created_at DESC LIMIT 1`
          )
          .bind(vehicleId)
          .first<VehicleTransfer>();
    return row ?? null;
}

export async function getValidVehicleTransfer(db: D1Database, token: string): Promise<VehicleTransfer | null> {
    const row = await db
          .prepare(
                `SELECT * FROM vehicle_transfers WHERE token = ? AND status = 'pending' AND expires_at > datetime('now')`
          )
          .bind(token)
          .first<VehicleTransfer>();
    return row ?? null;
}

/** Only the seller who started it can cancel their own vehicle's pending transfer. */
export async function cancelPendingTransferForVehicle(db: D1Database, vehicleId: string, fromUserId: string): Promise<void> {
    await db
          .prepare(
                `UPDATE vehicle_transfers SET status = 'cancelled', resolved_at = datetime('now')
                 WHERE vehicle_id = ? AND from_user_id = ? AND status = 'pending'`
          )
          .bind(vehicleId, fromUserId)
          .run();
}

export async function declineVehicleTransfer(db: D1Database, token: string): Promise<void> {
    await db
          .prepare(`UPDATE vehicle_transfers SET status = 'declined', resolved_at = datetime('now') WHERE token = ?`)
          .bind(token)
          .run();
}

/**
 * Completes a pending transfer: moves the vehicle to its new owner, logs the
 * change in ownership_history, and marks the transfer row accepted — as one
 * D1 batch so a failure partway through can never leave the vehicle pointing
 * at one owner while the transfer itself still reads "pending".
 */
export async function acceptVehicleTransfer(db: D1Database, transfer: VehicleTransfer, toUser: User): Promise<void> {
    const fromUser = await getUserById(db, transfer.from_user_id);
    await db.batch([
          db.prepare("UPDATE vehicles SET user_id = ? WHERE id = ?").bind(toUser.id, transfer.vehicle_id),
          db
            .prepare(`UPDATE vehicle_transfers SET status = 'accepted', resolved_at = datetime('now') WHERE token = ?`)
            .bind(transfer.token),
          db
            .prepare(
                  `INSERT INTO ownership_history (id, vehicle_id, from_user_id, from_name, to_user_id, to_name)
                   VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(newId(), transfer.vehicle_id, transfer.from_user_id, fromUser?.name ?? null, toUser.id, toUser.name),
    ]);
}

export async function getOwnershipHistory(db: D1Database, vehicleId: string): Promise<OwnershipHistoryEntry[]> {
    const { results } = await db
          .prepare(`SELECT * FROM ownership_history WHERE vehicle_id = ? ORDER BY transferred_at ASC`)
          .bind(vehicleId)
          .all<OwnershipHistoryEntry>();
    return results;
}

// --- DVSA MOT history --------------------------------------------------
//
// See migrations/0010_dvsa_mot_history.sql and src/lib/dvsa.ts. Synced on
// vehicle registration and on demand via the "Refresh MOT history" action
// (src/routes/vehicles.ts) — never automatically in the background, since
// every sync is a billed-against-quota call to DVSA's API.

export interface MotTestRow {
    id: string;
    vehicle_id: string;
    mot_test_number: string;
    completed_date: string | null;
    expiry_date: string | null;
    test_result: string | null;
    odometer_value: number | null;
    odometer_unit: string | null;
    odometer_result_type: string | null;
    data_source: string | null;
    created_at: string;
}

export interface MotDefectRow {
    id: string;
    mot_test_id: string;
    text: string;
    type: string | null;
    dangerous: number;
}

/**
 * Replaces a vehicle's stored vehicle-level DVSA fields and upserts its MOT
 * test history (keyed on DVSA's own mot_test_number, so re-running this is
 * idempotent rather than growing duplicate rows). Defects for a test are
 * deleted and re-inserted on every sync — cheap, and avoids having to diff
 * DVSA's defect wording ourselves. Runs as one D1 batch so a vehicle can
 * never end up with its MOT fields updated but no test rows (or vice
 * versa) if something fails partway through.
 */
export async function syncMotHistoryForVehicle(
    db: D1Database,
    vehicleId: string,
    input: {
          fuelType: string | null;
          motDueDate: string | null;
          tests: Array<{
                motTestNumber: string;
                completedDate: string | null;
                expiryDate: string | null;
                testResult: string | null;
                odometerValue: number | null;
                odometerUnit: string | null;
                odometerResultType: string | null;
                dataSource: string | null;
                defects: Array<{ text: string; type: string | null; dangerous: boolean }>;
          }>;
    }
  ): Promise<void> {
    const statements = [
          db
                .prepare(
                      `UPDATE vehicles SET fuel_type = ?, mot_due_date = ?, mot_last_synced_at = datetime('now') WHERE id = ?`
                )
                .bind(input.fuelType, input.motDueDate, vehicleId),
    ];

    for (const test of input.tests) {
          const testId = newId();
          statements.push(
                db
                      .prepare(
                            `INSERT INTO mot_tests
                             (id, vehicle_id, mot_test_number, completed_date, expiry_date, test_result, odometer_value, odometer_unit, odometer_result_type, data_source)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON CONFLICT (vehicle_id, mot_test_number) DO UPDATE SET
                               completed_date = excluded.completed_date,
                               expiry_date = excluded.expiry_date,
                               test_result = excluded.test_result,
                               odometer_value = excluded.odometer_value,
                               odometer_unit = excluded.odometer_unit,
                               odometer_result_type = excluded.odometer_result_type,
                               data_source = excluded.data_source`
                      )
                      .bind(
                            testId,
                            vehicleId,
                            test.motTestNumber,
                            test.completedDate,
                            test.expiryDate,
                            test.testResult,
                            test.odometerValue,
                            test.odometerUnit,
                            test.odometerResultType,
                            test.dataSource
                      )
          );
          // Defects are keyed off the test's own row id, which ON CONFLICT
          // above doesn't return — look it up by the natural key instead of
          // assuming our freshly generated testId won against an existing row.
          statements.push(
                db
                      .prepare(`DELETE FROM mot_defects WHERE mot_test_id = (SELECT id FROM mot_tests WHERE vehicle_id = ? AND mot_test_number = ?)`)
                      .bind(vehicleId, test.motTestNumber)
          );
          for (const defect of test.defects) {
                statements.push(
                      db
                            .prepare(
                                  `INSERT INTO mot_defects (id, mot_test_id, text, type, dangerous)
                                   VALUES (?, (SELECT id FROM mot_tests WHERE vehicle_id = ? AND mot_test_number = ?), ?, ?, ?)`
                            )
                            .bind(newId(), vehicleId, test.motTestNumber, defect.text, defect.type, defect.dangerous ? 1 : 0)
                );
          }
    }

    await db.batch(statements);
}

export async function getMotTestsForVehicle(db: D1Database, vehicleId: string): Promise<MotTestRow[]> {
    const { results } = await db
          .prepare(`SELECT * FROM mot_tests WHERE vehicle_id = ? ORDER BY completed_date DESC`)
          .bind(vehicleId)
          .all<MotTestRow>();
    return results;
}

export async function getDefectsForTests(db: D1Database, testIds: string[]): Promise<Map<string, MotDefectRow[]>> {
    const byTest = new Map<string, MotDefectRow[]>();
    if (testIds.length === 0) return byTest;
    const placeholders = testIds.map(() => "?").join(",");
    const { results } = await db
          .prepare(`SELECT * FROM mot_defects WHERE mot_test_id IN (${placeholders})`)
          .bind(...testIds)
          .all<MotDefectRow>();
    for (const row of results) {
          const list = byTest.get(row.mot_test_id) ?? [];
          list.push(row);
          byTest.set(row.mot_test_id, list);
    }
    return byTest;
}

export async function setMotHistoryVisibility(db: D1Database, vehicleId: string, isPublic: boolean): Promise<void> {
    await db.prepare("UPDATE vehicles SET mot_history_public = ? WHERE id = ?").bind(isPublic ? 1 : 0, vehicleId).run();
}

export async function setMileageVisibility(db: D1Database, vehicleId: string, isPublic: boolean): Promise<void> {
    await db.prepare("UPDATE vehicles SET mileage_public = ? WHERE id = ?").bind(isPublic ? 1 : 0, vehicleId).run();
}

export async function setMotReminderOptIn(db: D1Database, vehicleId: string, optIn: boolean): Promise<void> {
    await db.prepare("UPDATE vehicles SET mot_reminder_opt_in = ? WHERE id = ?").bind(optIn ? 1 : 0, vehicleId).run();
}

export interface MotReminderRow extends Vehicle {
    owner_email: string;
    owner_name: string;
}

/**
 * Finds every vehicle whose owner has opted in to the MOT-expiry reminder,
 * whose mot_due_date falls within the next 14 days (inclusive of today),
 * and that hasn't already had a reminder sent for this exact due date —
 * see markMotReminderSent below, called right after a reminder actually
 * sends. Wrapped in date(...) on both sides of the comparison so an
 * unexpected or malformed mot_due_date string fails the match (excluded)
 * rather than throwing. Called from the Worker's scheduled() handler in
 * src/index.ts — see migrations/0011_mot_visibility_and_reminders.sql.
 */
export async function getVehiclesDueMotReminder(db: D1Database): Promise<MotReminderRow[]> {
    const { results } = await db
          .prepare(
                `SELECT v.*, u.email AS owner_email, u.name AS owner_name
                 FROM vehicles v
                 JOIN users u ON u.id = v.user_id
                 WHERE v.mot_reminder_opt_in = 1
                   AND v.mot_due_date IS NOT NULL
                   AND date(v.mot_due_date) IS NOT NULL
                   AND date(v.mot_due_date) BETWEEN date('now') AND date('now', '+14 days')
                   AND (v.mot_reminder_sent_for IS NULL OR v.mot_reminder_sent_for <> v.mot_due_date)`
          )
          .all<MotReminderRow>();
    return results;
}

export async function markMotReminderSent(db: D1Database, vehicleId: string, motDueDate: string): Promise<void> {
    await db.prepare("UPDATE vehicles SET mot_reminder_sent_for = ? WHERE id = ?").bind(motDueDate, vehicleId).run();
}

export interface ZeroDocsReminderRow extends Vehicle {
    owner_email: string;
    owner_name: string;
}

const ZERO_DOCS_REMINDER_AFTER_DAYS = 7;

/**
 * Finds every vehicle registered at least ZERO_DOCS_REMINDER_AFTER_DAYS ago
 * that still has zero documents/photos across every folder (deleted ones
 * don't count — see migrations/0015_document_soft_delete.sql) and hasn't
 * already had this one-time reminder sent. See
 * migrations/0016_zero_docs_reminder.sql and business-plan.md Section 11.
 */
export async function getVehiclesDueZeroDocsReminder(db: D1Database): Promise<ZeroDocsReminderRow[]> {
    const { results } = await db
          .prepare(
                `SELECT v.*, u.email AS owner_email, u.name AS owner_name
                 FROM vehicles v
                 JOIN users u ON u.id = v.user_id
                 WHERE v.zero_docs_reminder_sent = 0
                   AND v.created_at <= datetime('now', ?)
                   AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.vehicle_id = v.id AND d.deleted_at IS NULL)`
          )
          .bind(`-${ZERO_DOCS_REMINDER_AFTER_DAYS} days`)
          .all<ZeroDocsReminderRow>();
    return results;
}

export async function markZeroDocsReminderSent(db: D1Database, vehicleId: string): Promise<void> {
    await db.prepare("UPDATE vehicles SET zero_docs_reminder_sent = 1 WHERE id = ?").bind(vehicleId).run();
}

// --- Marketplace listings ------------------------------------------------
//
// Lets an owner list their vehicle for sale, surfacing its Moto ID
// provenance (service record count, ownership history) as the
// differentiator — see business-plan.md Section 8. See
// migrations/0017_marketplace_listings.sql for the schema and
// src/routes/marketplace.ts for the routes. Every function here is wrapped
// in try/catch, same discipline as the rest of this file, so this code
// being live ahead of migration 0017 leaves the feature merely inert
// rather than 500ing pages that already work.

export type ListingStatus = "pending_payment" | "active" | "sold" | "removed";

export interface Listing {
    id: string;
    vehicle_id: string;
    user_id: string;
    price_pence: number;
    description: string;
    location: string | null;
    status: ListingStatus;
    payment_intent_id: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
}

// The shape returned by listActiveListings — a listing joined with just
// enough of its vehicle's public facts to render a marketplace card.
export interface ListingWithVehicle extends Listing {
    make: string;
    model: string;
    year: number | null;
    colour: string | null;
    vehicle_type: "car" | "motorcycle";
    moto_id_number: string;
    photo_r2_key: string | null;
}

/** Returns null (rather than throwing) if this fails — most likely migration 0017 not yet applied — so callers can show a friendly "not available yet" message instead of a 500. */
export async function createListing(
    db: D1Database,
    vehicleId: string,
    userId: string,
    input: { pricePence: number; description: string; location: string | null }
): Promise<Listing | null> {
    const id = newId();
    const now = new Date().toISOString();
    try {
          await db
                .prepare(
                      `INSERT INTO listings (id, vehicle_id, user_id, price_pence, description, location, status)
                       VALUES (?, ?, ?, ?, ?, ?, 'pending_payment')`
                )
                .bind(id, vehicleId, userId, input.pricePence, input.description, input.location)
                .run();
    } catch (err) {
          console.error("createListing failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return null;
    }
    return {
          id,
          vehicle_id: vehicleId,
          user_id: userId,
          price_pence: input.pricePence,
          description: input.description,
          location: input.location,
          status: "pending_payment",
          payment_intent_id: null,
          paid_at: null,
          created_at: now,
          updated_at: now,
    };
}

export async function getListingById(db: D1Database, id: string): Promise<Listing | null> {
    try {
          const row = await db.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first<Listing>();
          return row ?? null;
    } catch (err) {
          console.error("getListingById failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return null;
    }
}

/** Most recent listing for a vehicle, regardless of status — drives the "List for sale" / "Manage listing" page. */
export async function getLatestListingForVehicle(db: D1Database, vehicleId: string): Promise<Listing | null> {
    try {
          const row = await db
                .prepare("SELECT * FROM listings WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1")
                .bind(vehicleId)
                .first<Listing>();
          return row ?? null;
    } catch (err) {
          console.error("getLatestListingForVehicle failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return null;
    }
}

/** Public browse page — newest-first, optionally filtered to one vehicle type. */
export async function listActiveListings(db: D1Database, vehicleType?: "car" | "motorcycle"): Promise<ListingWithVehicle[]> {
    try {
          const query = `
                SELECT l.*, v.make, v.model, v.year, v.colour, v.vehicle_type, v.moto_id_number, v.photo_r2_key
                FROM listings l
                JOIN vehicles v ON v.id = l.vehicle_id
                WHERE l.status = 'active' ${vehicleType ? "AND v.vehicle_type = ?" : ""}
                ORDER BY l.paid_at DESC`;
          const stmt = vehicleType ? db.prepare(query).bind(vehicleType) : db.prepare(query);
          const { results } = await stmt.all<ListingWithVehicle>();
          return results;
    } catch (err) {
          console.error("listActiveListings failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return [];
    }
}

/** Flips a pending_payment listing to active once its listing fee is paid. Idempotent: returns false (no-op) if it wasn't still pending. */
export async function setListingPaid(db: D1Database, listingId: string, paymentIntentId: string | null): Promise<boolean> {
    try {
          const res = await db
                .prepare(
                      `UPDATE listings SET status = 'active', payment_intent_id = ?, paid_at = datetime('now'), updated_at = datetime('now')
                       WHERE id = ? AND status = 'pending_payment'`
                )
                .bind(paymentIntentId, listingId)
                .run();
          return (res.meta?.changes ?? 0) > 0;
    } catch (err) {
          console.error("setListingPaid failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return false;
    }
}

/** Owner-only transition — mark sold or delist. Only acts on a listing that's currently active (or, for "removed", also pending_payment, so an unpaid draft can be cancelled). */
export async function setListingStatus(db: D1Database, listingId: string, status: "sold" | "removed"): Promise<void> {
    try {
          const fromStatuses = status === "removed" ? "('active', 'pending_payment')" : "('active')";
          await db
                .prepare(`UPDATE listings SET status = ?, updated_at = datetime('now') WHERE id = ? AND status IN ${fromStatuses}`)
                .bind(status, listingId)
                .run();
    } catch (err) {
          console.error("setListingStatus failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
    }
}

/** Owner-only edit of the listing's own text/price — never re-charges the flat listing fee. Only acts on an active listing. */
export async function updateListingDetails(
    db: D1Database,
    listingId: string,
    input: { pricePence: number; description: string; location: string | null }
): Promise<void> {
    try {
          await db
                .prepare(
                      `UPDATE listings SET price_pence = ?, description = ?, location = ?, updated_at = datetime('now')
                       WHERE id = ? AND status = 'active'`
                )
                .bind(input.pricePence, input.description, input.location, listingId)
                .run();
    } catch (err) {
          console.error("updateListingDetails failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
    }
}

/** Returns false (rather than throwing) on failure — the caller still emails the seller directly either way, so a DB hiccup here doesn't lose the inquiry. */
export async function addListingInquiry(db: D1Database, listingId: string, name: string, email: string, message: string): Promise<boolean> {
    try {
          await db
                .prepare("INSERT INTO listing_inquiries (id, listing_id, name, email, message) VALUES (?, ?, ?, ?, ?)")
                .bind(newId(), listingId, name, email, message)
                .run();
          return true;
    } catch (err) {
          console.error("addListingInquiry failed (has migration 0017 been run?):", err instanceof Error ? err.message : String(err));
          return false;
    }
}
