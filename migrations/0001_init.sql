-- Moto ID initial schema

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moto_id_number TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car', 'motorcycle')),
    registration_number TEXT NOT NULL,
    vin TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    colour TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_moto_id_number ON vehicles(moto_id_number);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    folder TEXT NOT NULL CHECK (folder IN ('service', 'invoice', 'photo')),
    filename TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER,
    added_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_documents_vehicle_id ON documents(vehicle_id);

CREATE TABLE IF NOT EXISTS verification_scans (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_scans_vehicle_id ON verification_scans(vehicle_id);
