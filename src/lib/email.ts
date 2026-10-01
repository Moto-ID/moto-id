import type { Bindings } from "../types";
import { esc } from "./html";

const DEFAULT_ORDER_NOTIFICATION_EMAIL = "adam_mcgivern@hotmail.com";

/**
 * Sends transactional email via the Resend API (https://resend.com).
 * Requires RESEND_API_KEY (secret) and RESEND_FROM_EMAIL (plain var) to be set
 * on the Worker. If either is missing, this throws — callers should catch and
 * surface a friendly error rather than pretending the email sent.
 */
async function sendEmail(env: Bindings, opts: { to: string; subject: string; html: string }): Promise<void> {
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
