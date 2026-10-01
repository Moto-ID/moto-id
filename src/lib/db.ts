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
    created_at: string;
}

const SESSION_TTL_DAYS = 30;

export async function createUser(db: D1Database, name: string, email: string, passwordHash: string): Promise<User> {
    const id = newId();
    await db
          .prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
          .bind(id, name, email.toLowerCase().trim(), passwordHash)
          .run();
    return { id, name, email, password_hash: passwordHash, vehicle_credits: 0, unlimited_vehicles: 0, created_at: new Date().toISOString() };
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
    const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
    return row ?? null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
}

export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string): Promise<void> {
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
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
          shipName: string;
          shipAddressLine1: string;
          shipAddressLine2: string | null;
          shipCity: string;
          shipPostalCode: string;
          shipCountry: string;
    }
  ): Promise<Vehicle> {
    const id = newId();
    const motoIdNumber = await generateUniqueMotoIdNumber(db);
    const shipName = input.shipName.trim();
    const shipAddressLine1 = input.shipAddressLine1.trim();
    const shipAddressLine2 = input.shipAddressLine2?.trim() || null;
    const shipCity = input.shipCity.trim();
    const shipPostalCode = input.shipPostalCode.toUpperCase().trim();
    const shipCountry = input.shipCountry.trim();
    await db
          .prepare(
            `INSERT INTO vehicles
             (id, user_id, moto_id_number, vehicle_type, registration_number, vin, make, model, year, colour,
              ship_name, ship_address_line1, ship_address_line2, ship_city, ship_postal_code, ship_country)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            input.colour,
            shipName,
            shipAddressLine1,
            shipAddressLine2,
            shipCity,
            shipPostalCode,
            shipCountry
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
        photo_r2_key: null,
        ship_name: shipName,
        ship_address_line1: shipAddressLine1,
        ship_address_line2: shipAddressLine2,
        ship_city: shipCity,
        ship_postal_code: shipPostalCode,
        ship_country: shipCountry,
        created_at: new Date().toISOString(),
    };
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

export async function listPublicDocuments(db: D1Database, vehicleId: string): Promise<Document[]> {
    const { results } = await db
          .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND is_public = 1 ORDER BY created_at DESC")
          .bind(vehicleId)
          .all<Document>();
    return results;
}

export async function getPublicDocument(db: D1Database, vehicleId: string, docId: string): Promise<Document | null> {
    const row = await db
          .prepare("SELECT * FROM documents WHERE id = ? AND vehicle_id = ? AND is_public = 1")
          .bind(docId, vehicleId)
          .first<Document>();
    return row ?? null;
}

export async function listDocuments(db: D1Database, vehicleId: string, folder: Folder): Promise<Document[]> {
    const { results } = await db
          .prepare("SELECT * FROM documents WHERE vehicle_id = ? AND folder = ? ORDER BY created_at DESC")
          .bind(vehicleId, folder)
          .all<Document>();
    return results;
}

export async function countDocumentsByFolder(db: D1Database, vehicleId: string): Promise<Record<Folder, number>> {
    const { results } = await db
          .prepare("SELECT folder, COUNT(*) as n FROM documents WHERE vehicle_id = ? GROUP BY folder")
          .bind(vehicleId)
          .all<{ folder: Folder; n: number }>();
    const counts: Record<Folder, number> = { service: 0, invoice: 0, photo: 0 };
    for (const row of results) counts[row.folder] = row.n;
    return counts;
}

export async function recentActivity(db: D1Database, vehicleId: string, limit = 6): Promise<Document[]> {
    const { results } = await db
          .prepare("SELECT * FROM documents WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT ?")
          .bind(vehicleId, limit)
          .all<Document>();
    return results;
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
    currency: string
): Promise<boolean> {
    const result = await db
          .prepare(
                `INSERT INTO purchases (id, user_id, amount_pence, currency, status)
                 VALUES (?, ?, ?, ?, 'paid')
                 ON CONFLICT(id) DO NOTHING`
          )
          .bind(sessionId, userId, amountPence, currency)
          .run();
    const grantedNow = (result.meta.changes ?? 0) > 0;
    if (grantedNow) {
        await addUserCredits(db, userId, 1);
    }
    return grantedNow;
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
