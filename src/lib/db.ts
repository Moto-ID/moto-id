import { newId, randomMotoIdNumber } from "./crypto";

export interface User {
    id: string;
    name: string;
    email: string;
    password_hash: string;
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
    created_at: string;
}

export type Folder = "service" | "invoice" | "photo";

export interface User {
    id: string;
    name: string;
    email: string;
    password_hash: string;
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
    return { id, name, email, password_hash: passwordHash, created_at: new Date().toISOString() };
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
        photo_r2_key: null,
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
