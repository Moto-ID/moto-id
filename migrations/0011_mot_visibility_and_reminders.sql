-- Adds owner-controlled visibility toggles for the DVSA-derived MOT history
-- and mileage chart (both default private, same as every document/photo —
-- see migrations/0001_init.sql's documents.is_public), plus an opt-in
-- 14-day-before-expiry reminder email.
--
-- mot_reminder_sent_for stores the exact mot_due_date a reminder was last
-- sent for, so a daily scheduled check can run indefinitely without ever
-- emailing the same owner twice for the same MOT cycle — see
-- getVehiclesDueMotReminder/markMotReminderSent in src/lib/db.ts. It resets
-- naturally the next time DVSA sync picks up a new mot_due_date (the vehicle
-- passed its MOT and got a new expiry), making it eligible again.

ALTER TABLE vehicles ADD COLUMN mot_history_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN mileage_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN mot_reminder_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN mot_reminder_sent_for TEXT;
