-- One-time nudge: if a vehicle still has zero documents/photos a week after
-- registration, email the owner once to remind them the record is empty.
-- See business-plan.md Section 11 ("Owners could simply not bother
-- maintaining the record") — this is a single email per vehicle, not a
-- recurring reminder, and unlike the MOT reminder it isn't opt-in: it's a
-- one-off nudge serving the owner's own interest in a complete record,
-- not a marketing message. See getVehiclesDueZeroDocsReminder in
-- src/lib/db.ts.

ALTER TABLE vehicles ADD COLUMN zero_docs_reminder_sent INTEGER NOT NULL DEFAULT 0;
