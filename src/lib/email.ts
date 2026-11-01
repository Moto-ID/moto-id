import type { Bindings } from "../types";
import { esc } from "./html";

const DEFAULT_ORDER_NOTIFICATION_EMAIL = "adam_mcgivern@hotmail.com";
const DEFAULT_OPS_ALERT_EMAIL = "adam_mcgivern@hotmail.com";

/**
 * Sends transactional email via the Resend API (https://resend.com).
 * Requires RESEND_API_KEY (secret) and RESEND_FROM_EMAIL (plain var) to be set
 * on the Worker. If either is missing, this throws — callers should catch and
 * surface a friendly error rather than pretending the email sent.
 */
async function sendEmail(env: Bindings, opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
    if (!env.RESEND_API_KEY) {
          throw new Error("RESEND_API_KEY is not configured on this Worker.");
    }
    const from = env.RESEND_FROM_EMAIL || "Moto ID <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
        },
        body: JSON.stringify({
              from,
              to: [opts.to],
              subject: opts.subject,
              html: opts.html,
              ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
  });

  if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend API error (${res.status}): ${detail}`);
  }
}

export async function sendPasswordResetEmail(env: Bindings, toEmail: string, resetUrl: string): Promise<void> {
    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">We received a request to reset the password on your Moto ID account.</p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">Reset your password</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    </div>`;

  await sendEmail(env, {
        to: toEmail,
        subject: "Reset your Moto ID password",
        html,
  });
}

/**
 * Sends the "new order" notification — every time a customer registers a
 * vehicle (which is also the moment they commit to a physical plate), this
 * emails Adam everything needed to fulfil it: who it's from, what vehicle
 * it's for, where to post the plate, and the exact URL to encode in the
 * plate's QR code. Fired from the /register-vehicle handler in
 * src/routes/vehicles.ts, right after the vehicle row (and its shipping
 * address — see migrations/0007_vehicle_shipping.sql) is created. Callers
 * should catch any error this throws and log it rather than block the
 * customer's own flow — a failed notification email should never stop
 * someone from completing their registration.
 */
export async function sendOrderNotificationEmail(
    env: Bindings,
    opts: {
          customerName: string;
          customerEmail: string;
          vehicle: {
                vehicleType: "car" | "motorcycle";
                make: string;
                model: string;
                year: number | null;
                colour: string | null;
                registrationNumber: string;
                vin: string;
                motoIdNumber: string;
          };
          shipping: {
                name: string;
                addressLine1: string;
                addressLine2: string | null;
                city: string;
                postalCode: string;
                country: string;
          };
          verifyUrl: string;
          // false for Adam's own unlimited_vehicles account, which never goes
          // through Stripe — flagged clearly so a test/personal registration
          // is never mistaken for a paying customer's order.
          paidOrder: boolean;
    }
): Promise<void> {
    const to = env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_NOTIFICATION_EMAIL;
    const { vehicle: v, shipping: s } = opts;
    const vehicleSummary = [v.year, v.make, v.model].filter(Boolean).join(" ");

    const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:6px">MOTO ID &mdash; NEW ORDER</div>
      <div style="display:inline-block;font-size:11px;letter-spacing:0.06em;padding:3px 9px;margin-bottom:22px;${
        opts.paidOrder ? "background:#111;color:#fff" : "background:#eee;color:#555"
      }">${opts.paidOrder ? "PAID" : "NO PAYMENT — UNLIMITED-VEHICLES ACCOUNT"}</div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:26px">
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Customer</td><td style="padding:6px 0">${esc(opts.customerName)} &mdash; ${esc(opts.customerEmail)}</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Vehicle</td><td style="padding:6px 0">${esc(vehicleSummary)}${v.colour ? ", " + esc(v.colour) : ""} (${esc(v.vehicleType)})</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Registration</td><td style="padding:6px 0;font-family:monospace">${esc(v.registrationNumber)}</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">VIN</td><td style="padding:6px 0;font-family:monospace">${esc(v.vin)}</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Moto ID number</td><td style="padding:6px 0;font-family:monospace;font-weight:700">${esc(v.motoIdNumber)}</td></tr>
      </table>

      <div style="font-size:12px;color:#666;letter-spacing:0.08em;margin-bottom:6px">SHIP THE PLATE TO</div>
      <p style="font-size:14.5px;line-height:1.65;margin:0 0 26px">
        ${esc(s.name)}<br>
        ${esc(s.addressLine1)}<br>
        ${s.addressLine2 ? `${esc(s.addressLine2)}<br>` : ""}
        ${esc(s.city)}<br>
        ${esc(s.postalCode)}<br>
        ${esc(s.country)}
      </p>

      <div style="font-size:12px;color:#666;letter-spacing:0.08em;margin-bottom:6px">QR CODE URL FOR THIS PLATE</div>
      <p style="margin:0 0 26px"><a href="${esc(opts.verifyUrl)}" style="font-size:14px;color:#111">${esc(opts.verifyUrl)}</a></p>

      <p style="font-size:12px;color:#999;margin:0">Sent automatically when the customer completed their Moto ID registration.</p>
    </div>`;

  await sendEmail(env, {
        to,
        subject: `New Moto ID order — ${vehicleSummary} (No. ${v.motoIdNumber})`,
        html,
  });
}

/**
 * Sent to the buyer's email when a vehicle's current owner starts an
 * ownership transfer (e.g. the vehicle has been sold). The link takes them
 * to an accept/decline page; they must sign in or create an account using
 * this exact email address before the transfer can be accepted — see
 * acceptVehicleTransfer in src/lib/db.ts.
 */
export async function sendOwnershipTransferEmail(
    env: Bindings,
    opts: {
          toEmail: string;
          fromName: string;
          vehicle: { make: string; model: string; year: number | null; registrationNumber: string; motoIdNumber: string };
          acceptUrl: string;
    }
): Promise<void> {
    const { vehicle: v } = opts;
    const vehicleSummary = [v.year, v.make, v.model].filter(Boolean).join(" ");

    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6"><strong>${esc(opts.fromName)}</strong> wants to transfer ownership of their Moto ID record to you:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0 28px;background:#f7f7f7">
        <tr><td style="padding:14px 16px">
          <div style="font-weight:600;margin-bottom:4px">${esc(vehicleSummary)}</div>
          <div style="color:#666;font-family:monospace;font-size:12.5px">${esc(v.registrationNumber)} &middot; No. ${esc(v.motoIdNumber)}</div>
        </td></tr>
      </table>
      <p style="margin:28px 0">
        <a href="${opts.acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">Review the transfer</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">Ownership transfers are free. You'll need to sign in or create a Moto ID account with this email address (${esc(opts.toEmail)}) to accept it. This link expires in 14 days. If you weren't expecting this, you can safely ignore it — nothing changes unless you accept.</p>
    </div>`;

  await sendEmail(env, {
        to: opts.toEmail,
        subject: `${opts.fromName} wants to transfer a Moto ID vehicle to you`,
        html,
  });
}

/**
 * Sent once per MOT cycle to an owner who's opted in (see the "Email me 14
 * days before this MOT is due to expire" checkbox on the MOT History page,
 * and migrations/0011_mot_visibility_and_reminders.sql). Fired from the
 * Worker's scheduled() handler in src/index.ts, which runs a daily check via
 * getVehiclesDueMotReminder/markMotReminderSent in src/lib/db.ts — those two
 * functions are what guarantee this only ever sends once per due date, not
 * once a day for two weeks straight.
 */
export async function sendMotExpiryReminderEmail(
    env: Bindings,
    opts: {
          toEmail: string;
          ownerName: string;
          vehicle: { make: string; model: string; year: number | null; registrationNumber: string; motoIdNumber: string };
          motDueDateFormatted: string;
          manageUrl: string;
    }
): Promise<void> {
    const { vehicle: v } = opts;
    const vehicleSummary = [v.year, v.make, v.model].filter(Boolean).join(" ");

    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">Hi ${esc(opts.ownerName)}, your vehicle's MOT is due soon:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0 28px;background:#f7f7f7">
        <tr><td style="padding:14px 16px">
          <div style="font-weight:600;margin-bottom:4px">${esc(vehicleSummary)}</div>
          <div style="color:#666;font-family:monospace;font-size:12.5px;margin-bottom:8px">${esc(v.registrationNumber)} &middot; No. ${esc(v.motoIdNumber)}</div>
          <div style="color:#111;font-size:13.5px"><strong>MOT due ${esc(opts.motDueDateFormatted)}</strong></div>
        </td></tr>
      </table>
      <p style="margin:28px 0">
        <a href="${esc(opts.manageUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">View MOT history</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">This is a one-time reminder for this MOT cycle — booking and carrying out the test itself isn't something Moto ID does. You can turn this reminder off any time from the vehicle's MOT History page.</p>
    </div>`;

  await sendEmail(env, {
        to: opts.toEmail,
        subject: `MOT reminder — ${vehicleSummary} due ${opts.motDueDateFormatted}`,
        html,
  });
}

/**
 * Sent right after signup to confirm the account holder actually controls
 * the email address they registered with. Fired best-effort (non-blocking)
 * from POST /signup in src/routes/auth.ts — the new account can sign in and
 * use the app immediately either way; verification only gates the one
 * sensitive action that depends on provable inbox control (accepting an
 * ownership-transfer invite — see POST /transfer/:token/accept in
 * src/routes/vehicles.ts).
 */
export async function sendVerificationEmail(env: Bindings, toEmail: string, verifyUrl: string): Promise<void> {
    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">Welcome to Moto ID. Please confirm this is your email address:</p>
      <p style="margin:28px 0">
        <a href="${verifyUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">Verify your email</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">This link expires in 24 hours. You can already sign in and use your account without doing this — verifying is only needed before accepting an ownership transfer sent to this address. If you didn't create a Moto ID account, you can safely ignore this email.</p>
    </div>`;

  await sendEmail(env, {
        to: toEmail,
        subject: "Verify your email — Moto ID",
        html,
  });
}

/**
 * Sent to the real account holder when someone else tries to sign up again
 * with their already-registered email address. Fired from POST /signup in
 * src/routes/auth.ts in place of telling the *submitter* that the account
 * already exists (which would let anyone probe which emails have Moto ID
 * accounts) — the submitter sees the same generic "check your email" response
 * a brand-new signup would see, while the real owner gets this notice and a
 * safe way to regain access if the attempt wasn't theirs.
 */
/**
 * Sent to Adam when a scheduled (cron) job throws an error that escaped its
 * own handling — see runCronJob in src/lib/reminders.ts. Every job already
 * catches its own expected failure modes (a migration not yet run, one
 * item's email failing to send) and just console.errors those, so an error
 * reaching this point is unexpected and worth a human looking at; Adam has
 * no dashboard watching `wrangler tail`, so this is the only way he'd find
 * out the daily job broke at all.
 */
export async function sendCronFailureAlertEmail(env: Bindings, jobName: string, errorMessage: string): Promise<void> {
    const to = env.ORDER_NOTIFICATION_EMAIL || DEFAULT_OPS_ALERT_EMAIL;

    const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:6px">MOTO ID &mdash; SCHEDULED JOB FAILED</div>
      <div style="display:inline-block;font-size:11px;letter-spacing:0.06em;padding:3px 9px;margin-bottom:22px;background:#111;color:#fff">ACTION MAY BE NEEDED</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px">
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Job</td><td style="padding:6px 0;font-family:monospace">${esc(jobName)}</td></tr>
      </table>
      <div style="font-size:12px;color:#666;letter-spacing:0.08em;margin-bottom:6px">ERROR</div>
      <pre style="font-size:12.5px;background:#f7f7f7;padding:14px 16px;white-space:pre-wrap;word-break:break-word;margin:0 0 22px">${esc(errorMessage)}</pre>
      <p style="font-size:12px;color:#999;margin:0">This is an unexpected failure — the job's own known failure cases are only logged, not emailed. Check wrangler tail / the Cloudflare dashboard for more detail.</p>
    </div>`;

  await sendEmail(env, {
        to,
        subject: `Scheduled job failed — ${jobName}`,
        html,
  });
}

/**
 * One-time nudge sent when a vehicle still has zero documents/photos a week
 * after registration (see getVehiclesDueZeroDocsReminder in src/lib/db.ts
 * and business-plan.md Section 11: "Owners could simply not bother
 * maintaining the record"). Unlike the MOT reminder this isn't opt-in and
 * never repeats — it's a single nudge, not a recurring one.
 */
export async function sendZeroDocumentsReminderEmail(
    env: Bindings,
    opts: {
          toEmail: string;
          ownerName: string;
          vehicle: { make: string; model: string; year: number | null; registrationNumber: string; motoIdNumber: string };
          manageUrl: string;
    }
): Promise<void> {
    const { vehicle: v } = opts;
    const vehicleSummary = [v.year, v.make, v.model].filter(Boolean).join(" ");

    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">Hi ${esc(opts.ownerName)}, your Moto ID record is still empty:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0 28px;background:#f7f7f7">
        <tr><td style="padding:14px 16px">
          <div style="font-weight:600;margin-bottom:4px">${esc(vehicleSummary)}</div>
          <div style="color:#666;font-family:monospace;font-size:12.5px">${esc(v.registrationNumber)} &middot; No. ${esc(v.motoIdNumber)}</div>
        </td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;color:#444">A Moto ID is most useful once it actually holds something — a service invoice, an MOT certificate, even a quick photo. It only takes a minute, and it's often easiest to do from your phone right after you take the photo.</p>
      <p style="margin:28px 0">
        <a href="${opts.manageUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">Add your first document</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">This is a one-time reminder — we won't send it again for this vehicle.</p>
    </div>`;

  await sendEmail(env, {
        to: opts.toEmail,
        subject: `Add your first document — ${vehicleSummary}`,
        html,
  });
}

/**
 * Sent to Adam whenever a charge.refunded or charge.dispute.created Stripe
 * webhook comes in (src/routes/billing.ts) — a solo-operator business has
 * no finance team watching the Stripe dashboard, so this is the only way
 * he finds out a refund/chargeback happened at all, let alone whether the
 * vehicle credit it paid for was already used (and a plate possibly
 * already shipped) and needs a manual decision.
 */
export async function sendPaymentReviewAlertEmail(
    env: Bindings,
    opts: {
          kind: "refund" | "dispute";
          customerEmail: string;
          amountPence: number;
          currency: string;
          creditRevoked: boolean;
    }
): Promise<void> {
    const to = env.ORDER_NOTIFICATION_EMAIL || DEFAULT_OPS_ALERT_EMAIL;
    const amount = `${(opts.amountPence / 100).toFixed(2)} ${opts.currency.toUpperCase()}`;
    const kindLabel = opts.kind === "refund" ? "Refund" : "Dispute/chargeback";

    const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:6px">MOTO ID &mdash; ${esc(kindLabel.toUpperCase())}</div>
      <div style="display:inline-block;font-size:11px;letter-spacing:0.06em;padding:3px 9px;margin-bottom:22px;${
        opts.creditRevoked ? "background:#eee;color:#555" : "background:#111;color:#fff"
      }">${opts.creditRevoked ? "CREDIT AUTOMATICALLY REVOKED" : "ACTION NEEDED — CREDIT NOT REVOKED"}</div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:26px">
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Customer</td><td style="padding:6px 0">${esc(opts.customerEmail)}</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top;white-space:nowrap">Amount</td><td style="padding:6px 0">${esc(amount)}</td></tr>
      </table>

      <p style="font-size:13.5px;color:#444;line-height:1.7;margin:0 0 20px">
        ${
          opts.creditRevoked
            ? "This customer still had an unused vehicle credit, so it's been automatically taken back — no further action needed unless you want to follow up with them directly."
            : "This customer had no unused vehicle credit to take back, which most likely means they've already registered a vehicle and a plate may already be on its way. Please check their account and decide how to handle it (e.g. contact them, hold the shipment if it hasn't gone yet)."
        }
      </p>

      <p style="font-size:12px;color:#999;margin:0">Sent automatically from the Stripe webhook handler.</p>
    </div>`;

  await sendEmail(env, {
        to,
        subject: `${kindLabel} received — ${amount} (${opts.customerEmail})${opts.creditRevoked ? "" : " — needs review"}`,
        html,
  });
}

export async function sendAccountAlreadyExistsEmail(env: Bindings, toEmail: string, resetUrl: string): Promise<void> {
    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">Someone just tried to create a new Moto ID account using this email address — but you already have one.</p>
      <p style="font-size:15px;line-height:1.6">If that was you, just sign in instead. If it wasn't you, your account is safe; no changes were made. If you've forgotten your password, you can reset it below.</p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">Reset your password</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">This link expires in 1 hour.</p>
    </div>`;

  await sendEmail(env, {
        to: toEmail,
        subject: "Someone tried to sign up with your email — Moto ID",
        html,
  });
}

/**
 * Relays a buyer's marketplace inquiry straight to the seller's inbox, with
 * reply_to set to the buyer's own email — so the seller can just hit
 * "reply" in their own mail client, and the buyer's address is never shown
 * on the public listing itself. Fired from POST /marketplace/:id/inquire in
 * src/routes/marketplace.ts. Callers should catch any error this throws
 * (the inquiry is still saved to listing_inquiries either way, via
 * addListingInquiry in lib/db.ts) rather than block the buyer's own flow on
 * a failed notification email.
 */
export async function sendListingInquiryEmail(
    env: Bindings,
    opts: {
          sellerEmail: string;
          buyerName: string;
          buyerEmail: string;
          message: string;
          listingTitle: string;
          listingUrl: string;
    }
): Promise<void> {
    const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="font-weight:600;font-size:15px;letter-spacing:0.08em;margin-bottom:24px">MOTO ID</div>
      <p style="font-size:15px;line-height:1.6">You've had an inquiry about your marketplace listing:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0 28px;background:#f7f7f7">
        <tr><td style="padding:14px 16px">
          <div style="font-weight:600;margin-bottom:4px">${esc(opts.listingTitle)}</div>
          <div style="color:#666;font-size:12.5px">From ${esc(opts.buyerName)} &lt;${esc(opts.buyerEmail)}&gt;</div>
        </td></tr>
      </table>
      <p style="font-size:14.5px;line-height:1.7;white-space:pre-wrap;border-left:3px solid #ddd;padding-left:14px;color:#333">${esc(opts.message)}</p>
      <p style="margin:28px 0">
        <a href="${opts.listingUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px">View your listing</a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6">Just hit reply to get back to ${esc(opts.buyerName)} directly — this email is addressed so a reply goes straight to them, not to Moto ID.</p>
    </div>`;

  await sendEmail(env, {
        to: opts.sellerEmail,
        subject: `Inquiry about your listing: ${opts.listingTitle}`,
        html,
        replyTo: opts.buyerEmail,
  });
}
