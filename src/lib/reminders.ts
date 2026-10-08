// Runs from the Worker's scheduled() handler (see src/index.ts) on a daily
// Cron Trigger (see wrangler.toml's [triggers] block) rather than from any
// HTTP request. Finds every vehicle whose owner opted in to the MOT-expiry
// reminder and whose MOT falls due within the next 14 days, emails each
// owner once, and marks it sent so the same due date is never emailed twice
// — see getVehiclesDueMotReminder/markMotReminderSent in src/lib/db.ts for
// the dedup logic, and migrations/0011_mot_visibility_and_reminders.sql for
// the underlying columns.

import type { Bindings } from "../types";
import { getVehiclesDueMotReminder, markMotReminderSent } from "./db";
import { sendMotExpiryReminderEmail } from "./email";
import { formatMotDate } from "./mot";

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
