import { Hono } from "hono";
import type { Env } from "../types";
import { authShell } from "../lib/layout";
import { esc } from "../lib/html";
import { hashPassword, verifyPassword, newSessionToken } from "../lib/crypto";
import { createUser, getUserByEmail, createSession, deleteSession } from "../lib/db";
import { setSessionCookie, clearSessionCookie } from "../lib/auth";
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

function loginForm(opts: { email?: string; error?: string; next?: string }) {
    return `
    <div style="width:100%;max-width:380px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">SIGN IN</div>
      <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Welcome back.</div>

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
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:20px">Sign in</button>
      </form>

      <div style="text-align:center;font-size:13px;color:var(--ink-muted)">New to Moto ID? <a href="/signup" class="text-link">Create an account</a></div>
    </div>`;
  }

auth.get("/login", (c) => {
    const next = c.req.query("next");
    return c.html(authShell("Sign in — Moto ID", loginForm({ next })));
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
