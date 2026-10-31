// Runs from the Worker's scheduled() handler (see src/index.ts) on a daily
// Cron Trigger (see wrangler.toml's [triggers] block) rather than from any
// HTTP request. Finds every vehicle whose owner opted in to the MOT-expiry
// reminder and whose MOT falls due within the next 14 days, emails each
// owner once, and marks it sent so the same due date is never emailed twice
// — see getVehiclesDueMotReminder/markMotReminderSent in src/lib/db.ts for
// the dedup logic, and migrations/0011_mot_visibility_and_reminders.sql for
// the underlying columns.

import type { Bindings } from "../types";
import {
  getVehiclesDueMotReminder,
  markMotReminderSent,
  getExpiredSoftDeletedDocuments,
  deleteDocument,
  getVehiclesDueZeroDocsReminder,
  markZeroDocsReminderSent,
} from "./db";
import { sendMotExpiryReminderEmail, sendZeroDocumentsReminderEmail, sendCronFailureAlertEmail } from "./email";
import { formatMotDate } from "./mot";

/**
 * Wraps one scheduled job so an unexpected error — anything that escapes
 * the job's own internal try/catch, which only console.errors known
 * failure modes (see sendDueMotReminders etc. below) — gets emailed to
 * Adam instead of just sitting in `wrangler tail` where nobody's watching.
 * src/index.ts's scheduled() handler wraps every job with this rather than
 * calling them directly.
 */
export async function runCronJob(env: Bindings, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Scheduled job "${name}" threw an unhandled error:`, message);
    try {
      await sendCronFailureAlertEmail(env, name, message);
    } catch (alertErr) {
      console.error(`Also failed to send the failure alert email for "${name}":`, alertErr instanceof Error ? alertErr.message : String(alertErr));
    }
  }
}

export async function sendDueMotReminders(env: Bindings): Promise<void> {
  let due;
  try {
    due = await getVehiclesDueMotReminder(env.DB);
  } catch (err) {
    // Most likely migration 0011 hasn't been run yet on this database —
    // never let that take down the whole scheduled run (nothing else
    // depends on this job), just log it so it's visible in `wrangler tail`.
    console.error("getVehiclesDueMotReminder failed (has migration 0011 been run?):", err instanceof Error ? err.message : String(err));
    return;
  }

  const origin = env.PUBLIC_ORIGIN || "https://www.digitalvehicleid.com";

  for (const vehicle of due) {
    try {
      await sendMotExpiryReminderEmail(env, {
        toEmail: vehicle.owner_email,
        ownerName: vehicle.owner_name,
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          registrationNumber: vehicle.registration_number,
          motoIdNumber: vehicle.moto_id_number,
        },
        motDueDateFormatted: formatMotDate(vehicle.mot_due_date),
        manageUrl: `${origin}/vehicles/${vehicle.id}/mot-history`,
      });
      // Only marked sent once the email actually succeeds — a failed send
      // (e.g. Resend briefly down) leaves it eligible again on tomorrow's
      // run rather than silently skipping this vehicle's one reminder.
      await markMotReminderSent(env.DB, vehicle.id, vehicle.mot_due_date as string);
    } catch (err) {
      console.error(`MOT reminder email failed for vehicle ${vehicle.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * One-time "your record is still empty" nudge — see
 * getVehiclesDueZeroDocsReminder in src/lib/db.ts and business-plan.md
 * Section 11. Same per-vehicle try/catch and "only mark sent once the
 * email actually succeeds" pattern as sendDueMotReminders above.
 */
export async function sendZeroDocsReminders(env: Bindings): Promise<void> {
  let due;
  try {
    due = await getVehiclesDueZeroDocsReminder(env.DB);
  } catch (err) {
    console.error("getVehiclesDueZeroDocsReminder failed (has migration 0016 been run?):", err instanceof Error ? err.message : String(err));
    return;
  }

  const origin = env.PUBLIC_ORIGIN || "https://www.digitalvehicleid.com";

  for (const vehicle of due) {
    try {
      await sendZeroDocumentsReminderEmail(env, {
        toEmail: vehicle.owner_email,
        ownerName: vehicle.owner_name,
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          registrationNumber: vehicle.registration_number,
          motoIdNumber: vehicle.moto_id_number,
        },
        manageUrl: `${origin}/vehicles/${vehicle.id}`,
      });
      await markZeroDocsReminderSent(env.DB, vehicle.id);
    } catch (err) {
      console.error(`Zero-documents reminder email failed for vehicle ${vehicle.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * The other half of the soft-delete feature on documents/photos (see
 * softDeleteDocument in src/lib/db.ts and the /delete route in
 * src/routes/documents.ts): once a document's undo window
 * (DOCUMENT_UNDO_WINDOW_DAYS) has passed, actually remove it — the R2
 * object first, then the D1 row — so "recently deleted" doesn't grow
 * forever. Each document is purged independently so one failure (e.g. a
 * stale r2_key) doesn't stop the rest of the sweep.
 */
export async function purgeExpiredDeletedDocuments(env: Bindings): Promise<void> {
  let expired;
  try {
    expired = await getExpiredSoftDeletedDocuments(env.DB);
  } catch (err) {
    // Most likely migration 0015 hasn't been run yet — never let that take
    // down the rest of the scheduled run.
    console.error("getExpiredSoftDeletedDocuments failed (has migration 0015 been run?):", err instanceof Error ? err.message : String(err));
    return;
  }

  for (const doc of expired) {
    try {
      if (env.DOCS) {
        try {
          await env.DOCS.delete(doc.r2_key);
        } catch {
          // best-effort — same convention used elsewhere (vehicles.ts,
          // documents.ts): a leftover R2 object is harmless once the D1
          // row is gone, and we'd rather finish purging the row than get
          // stuck retrying a storage call forever.
        }
      }
      await deleteDocument(env.DB, doc.id);
    } catch (err) {
      console.error(`Failed to purge expired deleted document ${doc.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
}
