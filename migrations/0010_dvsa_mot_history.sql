-- DVSA MOT History API integration: pulls in vehicle details (fuel type,
-- MOT due date) and a full MOT test history per vehicle, which powers the
-- "MOT History" folder and mileage graph on the vehicle page. See
-- src/lib/dvsa.ts for the API client and src/routes/vehicles.ts for where
-- it's called (on registration, and via the manual "Refresh MOT history"
-- action for vehicles registered before this feature existed).

ALTER TABLE vehicles ADD COLUMN fuel_type TEXT;
ALTER TABLE vehicles ADD COLUMN mot_due_date TEXT;
-- NULL until the first successful DVSA lookup for this vehicle (either at
-- registration or via a manual refresh) — used to show "last checked" on
-- the MOT History section and to tell a never-synced vehicle apart from
-- one DVSA has no MOT data for at all.
ALTER TABLE vehicles ADD COLUMN mot_last_synced_at TEXT;

CREATE TABLE IF NOT EXISTS mot_tests (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    -- DVSA's own test number — the natural key for a test, used to make
    -- re-syncing idempotent (ON CONFLICT below) rather than growing
    -- duplicate rows every time a vehicle's MOT history is refreshed.
    mot_test_number TEXT NOT NULL,
    completed_date TEXT,
    expiry_date TEXT,
    test_result TEXT, -- 'PASSED' | 'FAILED' as returned by DVSA
    odometer_value INTEGER,
    odometer_unit TEXT, -- 'mi' | 'km'
    odometer_result_type TEXT, -- e.g. 'READ', 'NO_ODOMETER', 'UNREADABLE'
    data_source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (vehicle_id, mot_test_number)
  );

CREATE INDEX IF NOT EXISTS idx_mot_tests_vehicle_id ON mot_tests(vehicle_id);

CREATE TABLE IF NOT EXISTS mot_defects (
    id TEXT PRIMARY KEY,
    mot_test_id TEXT NOT NULL REFERENCES mot_tests(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type TEXT, -- 'ADVISORY' | 'FAIL' | 'MINOR' | 'MAJOR' | 'DANGEROUS'
    dangerous INTEGER NOT NULL DEFAULT 0
  );

CREATE INDEX IF NOT EXISTS idx_mot_defects_test_id ON mot_defects(mot_test_id);
