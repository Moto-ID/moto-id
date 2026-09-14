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
} from "../lib/db";
import { setSessionCookie, clearSessionCookie } from "../lib/auth";
import { sendPasswordResetEmail } from "../lib/email";
import { getCookie } from "hono/cookie";

export const auth = new Hono<Env>();

function signupForm(opts: { name?: string; email?: string; error?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">STEP 1 OF 2 &mdash; CREATE YOUR ACCOUNT</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Begin your<br>vehicle's record.</div>

    ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

    <form method="post" action="/signup">
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
      <div style="text-align:center;margin-top:28px;font-size:13px;color:var(--ink-muted)">Already have an account? <a href="/login" class="text-link">Sign in</a></div>
    </div>`;
  }

auth.get("/signup", (c) => {
    return c.html(authShell("Create your account — Moto ID", signupForm({})));
  });

auth.post("/signup", async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!name || !email || password.length < 8) {
          return c.html(
                  authShell(
                            "Create your account — Moto ID",
                            signupForm({ name, email, error: "Please fill in every field — passwords need at least 8 characters." })
                          ),
                  400
                );
        }

    const existing = await getUserByEmail(c.env.DB, email);
    if (existing) {
          return c.html(
                  authShell(
                            "Create your account — Moto ID",
                            signupForm({ name, email, error: "An account already exists for that email. Try signing in instead." })
                          ),
                  400
                );
        }

    const passwordHash = await hashPassword(password);
    const user = await createUser(c.env.DB, name, email, passwordHash);
    const token = newSessionToken();
    await createSession(c.env.DB, user.id, token);
    setSessionCookie(c, token);

    return c.redirect("/register-vehicle");
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
    const next = c.req.query("next");
    const notice = c.req.query("reset") === "1" ? "Your password has been reset. Sign in with your new password." : undefined;
    return c.html(authShell("Sign in — Moto ID", loginForm({ next, notice })));
  });

auth.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/dashboard";

    const user = await getUserByEmail(c.env.DB, email);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;

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
