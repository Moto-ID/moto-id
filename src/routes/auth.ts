import { Hono } from "hono";
import type { Env } from "../types";
import { authShell } from "../lib/layout";
import { esc } from "../lib/html";
import { hashPassword, verifyPassword, newSessionToken, newId } from "../lib/crypto";
import {
  createUser,
  getUserByEmail,
  createSession,
  deleteSession,
  createPasswordResetToken,
  getValidPasswordResetToken,
  markPasswordResetUsed,
  updateUserPassword,
  getUserById,
  createEmailVerificationToken,
  getValidEmailVerificationToken,
  markEmailVerificationUsed,
  setEmailVerified,
  checkRateLimit,
  recordAuthAttempt,
} from "../lib/db";
import { setSessionCookie, clearSessionCookie, getClientIp } from "../lib/auth";
import { sendPasswordResetEmail, sendVerificationEmail, sendAccountAlreadyExistsEmail } from "../lib/email";
import { getCookie } from "hono/cookie";

// Shared by every rate-limited route below — kept generous enough that a
// real user mistyping a password or re-submitting a form never notices,
// while still bounding the damage a script hammering the endpoint can do.
const RATE_LIMITS = {
  login_email: { max: 8, windowMinutes: 15 },
  login_ip: { max: 20, windowMinutes: 15 },
  signup_ip: { max: 8, windowMinutes: 60 },
  forgot_password_email: { max: 5, windowMinutes: 60 },
  forgot_password_ip: { max: 15, windowMinutes: 60 },
  resend_verification: { max: 3, windowMinutes: 60 },
};

function tooManyAttemptsMessage() {
  return "Too many attempts. Please wait a while and try again.";
}

function verificationNeededForm() {
  return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">VERIFY YOUR EMAIL</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Check your<br>inbox.</div>
      <div style="font-size:13.5px;line-height:1.7;color:var(--ink-muted);margin-bottom:24px">We've sent a verification link to your email. Click it, then come back to try again.</div>
      <form method="post" action="/verify-email/resend">
        <button type="submit" class="btn" style="width:100%;margin-bottom:12px">Resend verification email</button>
      </form>
      <div style="text-align:center;font-size:13px;color:var(--ink-muted)"><a href="/dashboard" class="text-link">Back to dashboard</a></div>
    </div>`;
}

export const auth = new Hono<Env>();

function signupForm(opts: { name?: string; email?: string; error?: string; next?: string; notice?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">STEP 1 OF 2 &mdash; CREATE YOUR ACCOUNT</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Begin your<br>vehicle's record.</div>

    ${opts.notice ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:20px">${esc(opts.notice)}</div>` : ""}
    ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

    <form method="post" action="/signup">
      ${opts.next ? `<input type="hidden" name="next" value="${esc(opts.next)}">` : ""}
      <div class="field">
        <label>FULL NAME</label>
        <input type="text" name="name" value="${esc(opts.name ?? "")}" required autocomplete="name">
      </div>
      <div class="field">
        <label>EMAIL</label>
        <input type="email" name="email" value="${esc(opts.email ?? "")}" required autocomplete="email">
      </div>
      <div class="field">
        <label>PASSWORD</label>
        <input type="password" name="password" required minlength="8" autocomplete="new-password">
      </div>
      <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:20px">Continue</button>
    </form>

    <div style="font-size:11.5px;color:var(--ink-subtle);text-align:center;line-height:1.6">By continuing you agree to Moto ID's Terms and Privacy Policy.</div>
      <div style="text-align:center;margin-top:28px;font-size:13px;color:var(--ink-muted)">Already have an account? <a href="/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}" class="text-link">Sign in</a></div>
    </div>`;
  }

auth.get("/signup", (c) => {
    const next = c.req.query("next");
    const email = c.req.query("email");
    return c.html(authShell("Create your account — Moto ID", signupForm({ next, email })));
  });

auth.post("/signup", async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : undefined;

    if (!name || !email || password.length < 8) {
          return c.html(
                  authShell(
                            "Create your account — Moto ID",
                            signupForm({ name, email, next, error: "Please fill in every field — passwords need at least 8 characters." })
                          ),
                  400
                );
        }

    const ip = getClientIp(c);
    const ipOk = await checkRateLimit(c.env.DB, "signup", ip, RATE_LIMITS.signup_ip.max, RATE_LIMITS.signup_ip.windowMinutes);
    await recordAuthAttempt(c.env.DB, "signup", ip);
    if (!ipOk) {
          return c.html(
                  authShell("Create your account — Moto ID", signupForm({ name, email, next, error: tooManyAttemptsMessage() })),
                  429
                );
        }

    // This whole branch exists to avoid leaking account existence: the
    // caller sees the exact same "signed up" outcome whether the email was
    // already registered or not. If it WAS already registered, the real
    // account holder gets a courtesy email instead (with a password-reset
    // link), and we stop there — the submitter's own attempt is silently a
    // no-op, not a second account.
    const existing = await getUserByEmail(c.env.DB, email);
    if (existing) {
          const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
          const resetToken = newId();
          try {
                await createPasswordResetToken(c.env.DB, existing.id, resetToken);
                await sendAccountAlreadyExistsEmail(c.env, existing.email, `${origin}/reset-password/${resetToken}`);
          } catch (err) {
                // Best-effort — never let an email-provider hiccup turn into an
                // enumeration leak via a different error response.
                console.error("Failed to send account-already-exists notice:", err);
          }
          return c.html(authShell("Check your email — Moto ID", signupForm({ name, email: "", next, notice: "Almost there — check your email to continue." })));
        }

    const passwordHash = await hashPassword(password);
    const user = await createUser(c.env.DB, name, email, passwordHash);
    const sessionToken = newSessionToken();
    await createSession(c.env.DB, user.id, sessionToken);
    setSessionCookie(c, sessionToken);

    // Best-effort, non-blocking: the account is usable immediately either
    // way (see email_verified comment on the User interface in lib/db.ts) —
    // a failure here should never stop someone from completing signup.
    try {
          const verifyToken = newId();
          await createEmailVerificationToken(c.env.DB, user.id, verifyToken);
          const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
          await sendVerificationEmail(c.env, user.email, `${origin}/verify-email/${verifyToken}`);
    } catch (err) {
          console.error("Failed to send verification email:", err);
    }

    // Signing up is free — /dashboard shows "My Collection" and, since a new
    // account has no vehicle credits yet, prompts them to get a Moto ID
    // before they can register a vehicle (see routes/vehicles.ts + billing.ts).
    // "next" is used by the ownership-transfer accept flow (routes/vehicles.ts)
    // to send a brand-new buyer straight back to the invitation they clicked.
    return c.redirect(next ?? "/dashboard");
  });

auth.get("/verify-email/:token", async (c) => {
    const token = c.req.param("token");
    const verification = await getValidEmailVerificationToken(c.env.DB, token);
    if (!verification) {
          return c.html(
                  authShell(
                            "Verify your email — Moto ID",
                            `<div style="width:100%;max-width:380px">
                               <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:20px">Link expired.</div>
                               <div style="font-size:13.5px;line-height:1.7;color:var(--ink-muted);margin-bottom:24px">This verification link is invalid or has expired.</div>
                               <form method="post" action="/verify-email/resend">
                                 <button type="submit" class="btn btn-solid" style="width:100%;border:none">Send a new link</button>
                               </form>
                             </div>`
                          ),
                  400
                );
        }

    await markEmailVerificationUsed(c.env.DB, token);
    await setEmailVerified(c.env.DB, verification.user_id);

    return c.html(
          authShell(
                  "Email verified — Moto ID",
                  `<div style="width:100%;max-width:380px">
                     <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:20px">Email verified.</div>
                     <div style="font-size:13.5px;line-height:1.7;color:var(--ink-muted);margin-bottom:24px">Thanks — your email address is confirmed.</div>
                     <a href="/dashboard" class="btn btn-solid" style="display:block;text-align:center;width:100%;border:none;text-decoration:none">Go to dashboard</a>
                   </div>`
                )
        );
  });

auth.post("/verify-email/resend", async (c) => {
    const user = c.get("user");
    if (!user) return c.redirect("/login");

    if (user.email_verified) {
          return c.redirect("/dashboard");
        }

    const ok = await checkRateLimit(
          c.env.DB,
          "resend_verification",
          user.id,
          RATE_LIMITS.resend_verification.max,
          RATE_LIMITS.resend_verification.windowMinutes
        );
    await recordAuthAttempt(c.env.DB, "resend_verification", user.id);

    if (ok) {
          try {
                const verifyToken = newId();
                await createEmailVerificationToken(c.env.DB, user.id, verifyToken);
                const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
                await sendVerificationEmail(c.env, user.email, `${origin}/verify-email/${verifyToken}`);
          } catch (err) {
                console.error("Failed to resend verification email:", err);
          }
        }

    // Same response either way (rate-limited or not, send succeeded or not)
    // — nothing here needs to, or should, tell the caller which happened.
    return c.html(authShell("Verify your email — Moto ID", verificationNeededForm()));
  });

function loginForm(opts: { email?: string; error?: string; next?: string; notice?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">SIGN IN</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Welcome back.</div>

      ${opts.notice ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:20px">${esc(opts.notice)}</div>` : ""}
      ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

      <form method="post" action="/login">
        ${opts.next ? `<input type="hidden" name="next" value="${esc(opts.next)}">` : ""}
        <div class="field">
          <label>EMAIL</label>
          <input type="email" name="email" value="${esc(opts.email ?? "")}" required autocomplete="email">
        </div>
        <div class="field">
          <label>PASSWORD</label>
          <input type="password" name="password" required autocomplete="current-password">
        </div>
        <div style="text-align:right;margin:-12px 0 20px">
          <a href="/forgot-password" class="text-link" style="font-size:12.5px">Forgot password?</a>
        </div>
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:20px">Sign in</button>
      </form>

      <div style="text-align:center;font-size:13px;color:var(--ink-muted)">New to Moto ID? <a href="/signup" class="text-link">Create an account</a></div>
    </div>`;
  }

auth.get("/login", (c) => {
    // A visitor who's still signed in (e.g. tapping the new "APP" shortcut
    // next to the logo while already logged in on this device) should land
    // straight in the app, not be shown a login form they don't need.
    if (c.get("user")) {
          const next = c.req.query("next");
          return c.redirect(next && next.startsWith("/") ? next : "/dashboard");
        }
    const next = c.req.query("next");
    const notice = c.req.query("reset") === "1" ? "Your password has been reset. Sign in with your new password." : undefined;
    return c.html(authShell("Sign in — Moto ID", loginForm({ next, notice })));
  });

auth.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/dashboard";

    const ip = getClientIp(c);
    const emailKey = email.toLowerCase();
    const [emailOk, ipOk] = await Promise.all([
          checkRateLimit(c.env.DB, "login", emailKey, RATE_LIMITS.login_email.max, RATE_LIMITS.login_email.windowMinutes),
          checkRateLimit(c.env.DB, "login", `ip:${ip}`, RATE_LIMITS.login_ip.max, RATE_LIMITS.login_ip.windowMinutes),
        ]);

    if (!emailOk || !ipOk) {
          return c.html(
                  authShell("Sign in — Moto ID", loginForm({ email, error: tooManyAttemptsMessage(), next })),
                  429
                );
        }

    const user = await getUserByEmail(c.env.DB, email);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;

    // Record the outcome against both keys — checkRateLimit ignores
    // "success" rows, so a correct login never counts toward the lockout.
    const outcome = ok ? "success" : "failure";
    await Promise.all([
          recordAuthAttempt(c.env.DB, "login", emailKey, outcome),
          recordAuthAttempt(c.env.DB, "login", `ip:${ip}`, outcome),
        ]);

    if (!user || !ok) {
          return c.html(
                  authShell("Sign in — Moto ID", loginForm({ email, error: "Email or password is incorrect.", next })),
                  400
                );
        }

    const token = newSessionToken();
    await createSession(c.env.DB, user.id, token);
    setSessionCookie(c, token);

    return c.redirect(next);
  });

auth.post("/logout", async (c) => {
    const token = getCookie(c, "moto_id_session");
    if (token) await deleteSession(c.env.DB, token);
    clearSessionCookie(c);
    return c.redirect("/");
  });

function forgotPasswordForm(opts: { sent?: boolean; error?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">RESET YOUR PASSWORD</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Forgot your<br>password?</div>

      ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

      ${
        opts.sent
          ? `<div style="font-size:13.5px;line-height:1.7;color:var(--ink-muted);margin-bottom:24px">If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour.</div>
             <div style="text-align:center;font-size:13px;color:var(--ink-muted)"><a href="/login" class="text-link">Back to sign in</a></div>`
          : `<div style="font-size:13.5px;line-height:1.7;color:var(--ink-muted);margin-bottom:24px">Enter the email on your account and we'll send you a link to reset your password.</div>
             <form method="post" action="/forgot-password">
               <div class="field">
                 <label>EMAIL</label>
                 <input type="email" name="email" required autocomplete="email">
               </div>
               <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:20px">Send reset link</button>
             </form>
             <div style="text-align:center;font-size:13px;color:var(--ink-muted)"><a href="/login" class="text-link">Back to sign in</a></div>`
      }
    </div>`;
  }

auth.get("/forgot-password", (c) => {
    return c.html(authShell("Reset your password — Moto ID", forgotPasswordForm({})));
  });

auth.post("/forgot-password", async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? "").trim();

  // Always show the same "sent" message whether or not the account exists,
  // so this form can't be used to check which emails have accounts.
  const done = () => c.html(authShell("Reset your password — Moto ID", forgotPasswordForm({ sent: true })));

  if (!email) return done();

  const ip = getClientIp(c);
  const emailKey = email.toLowerCase();
  const [emailOk, ipOk] = await Promise.all([
        checkRateLimit(c.env.DB, "forgot_password", emailKey, RATE_LIMITS.forgot_password_email.max, RATE_LIMITS.forgot_password_email.windowMinutes),
        checkRateLimit(c.env.DB, "forgot_password", `ip:${ip}`, RATE_LIMITS.forgot_password_ip.max, RATE_LIMITS.forgot_password_ip.windowMinutes),
      ]);
  await Promise.all([
        recordAuthAttempt(c.env.DB, "forgot_password", emailKey),
        recordAuthAttempt(c.env.DB, "forgot_password", `ip:${ip}`),
      ]);
  // Rate-limited requests get the exact same response as a genuine "sent"
  // — showing a different message here would itself leak information.
  if (!emailOk || !ipOk) return done();

  const user = await getUserByEmail(c.env.DB, email);
    if (!user) return done();

  const token = newId();
    await createPasswordResetToken(c.env.DB, user.id, token);

  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
    const resetUrl = `${origin}/reset-password/${token}`;

  try {
        await sendPasswordResetEmail(c.env, user.email, resetUrl);
  } catch (err) {
        // Don't leak whether the email exists via error behaviour, but do surface
        // a generic failure if the email provider itself isn't configured/working.
        console.error("Failed to send password reset email:", err);
        return c.html(
              authShell(
                    "Reset your password — Moto ID",
                    forgotPasswordForm({ error: "We couldn't send a reset email right now. Please try again shortly." })
              ),
              500
            );
  }

  return done();
  });

function resetPasswordForm(opts: { error?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">RESET YOUR PASSWORD</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Choose a new<br>password.</div>

      ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

      <form method="post">
        <div class="field">
          <label>NEW PASSWORD</label>
          <input type="password" name="password" required minlength="8" autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:20px">Reset password</button>
      </form>
    </div>`;
  }

auth.get("/reset-password/:token", async (c) => {
    const token = c.req.param("token");
    const reset = await getValidPasswordResetToken(c.env.DB, token);
    if (!reset) {
          return c.html(
                  authShell(
                            "Reset your password — Moto ID",
                            resetPasswordForm({ error: "This reset link is invalid or has expired. Request a new one below." })
                          ),
                  400
                );
        }
    return c.html(authShell("Reset your password — Moto ID", resetPasswordForm({})));
  });

auth.post("/reset-password/:token", async (c) => {
    const token = c.req.param("token");
    const reset = await getValidPasswordResetToken(c.env.DB, token);
    if (!reset) {
          return c.html(
                  authShell(
                            "Reset your password — Moto ID",
                            resetPasswordForm({ error: "This reset link is invalid or has expired. Request a new one below." })
                          ),
                  400
                );
        }

    const body = await c.req.parseBody();
    const password = String(body.password ?? "");
    if (password.length < 8) {
          return c.html(
                  authShell("Reset your password — Moto ID", resetPasswordForm({ error: "Password needs at least 8 characters." })),
                  400
                );
        }

    const user = await getUserById(c.env.DB, reset.user_id);
    if (!user) {
          return c.html(
                  authShell(
                            "Reset your password — Moto ID",
                            resetPasswordForm({ error: "This reset link is invalid or has expired. Request a new one below." })
                          ),
                  400
                );
        }

    const passwordHash = await hashPassword(password);
    await updateUserPassword(c.env.DB, user.id, passwordHash);
    await markPasswordResetUsed(c.env.DB, token);

  return c.redirect("/login?reset=1");
  });
