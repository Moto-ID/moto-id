import type { Bindings } from "../types";

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
