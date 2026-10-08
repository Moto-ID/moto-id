import { Hono } from "hono";
import type { Env, Bindings } from "./types";
import { attachUser } from "./lib/auth";
import { marketing } from "./routes/marketing";
import { auth } from "./routes/auth";
import { vehicles } from "./routes/vehicles";
import { documents } from "./routes/documents";
import { verify } from "./routes/verify";
import { billing } from "./routes/billing";
import { sendDueMotReminders } from "./lib/reminders";

const app = new Hono<Env>();

app.use("*", attachUser);

app.route("/", marketing);
app.route("/", auth);
app.route("/", vehicles);
app.route("/", documents);
app.route("/", verify);
app.route("/", billing);

type SettingsTab = "profile" | "vehicles" | "notifications";

/** Shared sidebar for every /settings/* page — real links now, not placeholder text. */
function settingsNav(active: SettingsTab): string {
  const tab = (href: string, label: string, key: SettingsTab) => {
    const isActive = key === active;
    const style = isActive
      ? "font-size:13px;font-weight:600;color:var(--ink);padding:10px 0;border-bottom:2px solid var(--ink);width:fit-content"
      : "font-size:13px;color:var(--ink-subtle);padding:10px 0";
    return `<a href="${href}" style="${style};text-decoration:none">${label}</a>`;
  };
  return `
    <div style="flex:0 1 190px;display:flex;flex-direction:column;gap:2px;min-width:0">
      ${tab("/settings/profile", "Profile", "profile")}
      ${tab("/settings", "My Vehicles", "vehicles")}
      ${tab("/settings/notifications", "Notifications", "notifications")}
      <form method="post" action="/logout" style="margin-top:16px">
        <button type="submit" style="border:none;background:none;padding:0;font-size:13px;color:var(--ink-subtle);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Sign out</button>
      </form>
    </div>`;
}

app.get("/settings", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings");
  const { appShell } = await import("./lib/layout");
  const { getVehiclesByUser } = await import("./lib/db");
  const { esc } = await import("./lib/html");
  const list = await getVehiclesByUser(c.env.DB, user.id);

  const rows = list.length
    ? list
        .map(
          (v) => `
          <div class="vrow" style="display:flex;align-items:center;gap:18px;padding:18px 20px;border-bottom:1px solid var(--hairline)">
            <div style="flex:1 1 0">
              <div style="font-weight:600;font-size:14.5px;margin-bottom:2px">${esc(v.make)} ${esc(v.model)}${v.year ? ` (${v.year})` : ""}</div>
              <div style="font-size:12.5px;color:var(--ink-subtle)">${esc(v.registration_number)}</div>
            </div>
            <div class="mono" style="font-size:13px;color:var(--ink-muted);margin-right:18px">No.&nbsp;${esc(v.moto_id_number)}</div>
            <a href="/vehicles/${v.id}" style="font-size:12.5px;color:var(--ink);border-bottom:1px solid var(--ink);white-space:nowrap">Manage</a>
          </div>`
        )
        .join("")
    : `<div style="padding:22px;font-size:13px;color:var(--ink-subtle)">No vehicles registered yet.</div>`;

  const body = `
    <div style="display:flex;gap:56px;flex-wrap:wrap">
      ${settingsNav("vehicles")}
      <div style="flex:1 1 280px;min-width:0">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:6px;gap:16px;flex-wrap:wrap">
          <div style="font-family:var(--font-display);font-size:24px">My Vehicles</div>
          <a href="/register-vehicle" class="btn btn-outline">Add a vehicle</a>
        </div>
        <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${list.length} vehicle${list.length === 1 ? "" : "s"} registered to your account</div>
        <div style="border:1px solid var(--hairline)">${rows}</div>
      </div>
    </div>`;

  return c.html(appShell("Settings — Moto ID", "Settings / My Vehicles", body, user));
});

app.get("/settings/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings/profile");
  const { appShell } = await import("./lib/layout");
  const { esc } = await import("./lib/html");

  const profileError = c.req.query("error");
  const profileOk = c.req.query("ok") === "1";
  const passwordError = c.req.query("pwerror");
  const passwordOk = c.req.query("pwok") === "1";

  const body = `
    <div style="display:flex;gap:56px;flex-wrap:wrap">
      ${settingsNav("profile")}
      <div style="flex:1 1 280px;min-width:0;max-width:420px">
        <div style="font-family:var(--font-display);font-size:24px;margin-bottom:28px">Profile</div>

        ${profileOk ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:16px">Profile updated.</div>` : ""}
        ${profileError ? `<div class="error">${esc(profileError)}</div>` : ""}
        <form method="post" action="/settings/profile">
          <div class="field">
            <label>NAME</label>
            <input type="text" name="name" value="${esc(user.name)}" required autocomplete="name">
          </div>
          <div class="field">
            <label>EMAIL</label>
            <input type="email" name="email" value="${esc(user.email)}" required autocomplete="email">
          </div>
          <button type="submit" class="btn btn-outline">Save profile</button>
        </form>

        <div style="margin-top:36px">
          <div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">Change password</div>
          ${passwordOk ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:16px">Password updated.</div>` : ""}
          ${passwordError ? `<div class="error">${esc(passwordError)}</div>` : ""}
          <form method="post" action="/settings/password">
            <div class="field">
              <label>CURRENT PASSWORD</label>
              <input type="password" name="currentPassword" required autocomplete="current-password">
            </div>
            <div class="field">
              <label>NEW PASSWORD</label>
              <input type="password" name="newPassword" required minlength="8" autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-outline">Update password</button>
          </form>
        </div>
      </div>
    </div>`;

  return c.html(appShell("Profile — Moto ID", "Settings / Profile", body, user));
});

app.post("/settings/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings/profile");
  const { getUserByEmail, updateUserProfile } = await import("./lib/db");

  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();

  if (!name || !email) {
    return c.redirect(`/settings/profile?error=${encodeURIComponent("Please fill in both fields.")}`);
  }

  if (email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = await getUserByEmail(c.env.DB, email);
    if (existing && existing.id !== user.id) {
      return c.redirect(`/settings/profile?error=${encodeURIComponent("Another account already uses that email address.")}`);
    }
  }

  await updateUserProfile(c.env.DB, user.id, name, email);
  return c.redirect("/settings/profile?ok=1");
});

app.get("/settings/notifications", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings/notifications");
  const { appShell } = await import("./lib/layout");

  const notifOk = c.req.query("ok") === "1";

  const body = `
    <div style="display:flex;gap:56px;flex-wrap:wrap">
      ${settingsNav("notifications")}
      <div style="flex:1 1 280px;min-width:0;max-width:480px">
        <div style="font-family:var(--font-display);font-size:24px;margin-bottom:6px">Notifications</div>
        <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">Control what Moto ID emails you.</div>

        ${notifOk ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:16px">Preferences saved.</div>` : ""}

        <form method="post" action="/settings/notifications">
          <label style="display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--ink);cursor:pointer;margin-bottom:20px">
            <input type="checkbox" name="marketingOptIn" style="margin-top:3px" ${user.marketing_opt_in ? "checked" : ""}>
            <span>Product updates &amp; occasional tips<br><span style="color:var(--ink-subtle);font-size:12px">Off by default. We'll only use this if we start sending the occasional update — nothing is sent today.</span></span>
          </label>
          <button type="submit" class="btn btn-outline">Save preferences</button>
        </form>

        <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--hairline);font-size:12.5px;color:var(--ink-subtle)">
          Account essentials — password resets and vehicle ownership-transfer invitations — are always sent, since they're required for your account and your vehicles to work correctly. There's no way to opt out of those.
        </div>
      </div>
    </div>`;

  return c.html(appShell("Notifications — Moto ID", "Settings / Notifications", body, user));
});

app.post("/settings/notifications", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings/notifications");
  const { setMarketingOptIn } = await import("./lib/db");

  const body = await c.req.parseBody();
  await setMarketingOptIn(c.env.DB, user.id, body.marketingOptIn === "on");

  return c.redirect("/settings/notifications?ok=1");
});

app.post("/settings/password", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings/profile");
  const { hashPassword, verifyPassword } = await import("./lib/crypto");
  const { updateUserPassword } = await import("./lib/db");

  const body = await c.req.parseBody();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    return c.redirect(`/settings/profile?pwerror=${encodeURIComponent("Current password is incorrect.")}`);
  }
  if (newPassword.length < 8) {
    return c.redirect(`/settings/profile?pwerror=${encodeURIComponent("New password needs at least 8 characters.")}`);
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(c.env.DB, user.id, passwordHash);

  return c.redirect("/settings/profile?pwok=1");
});

app.notFound((c) => c.text("Not found", 404));

export default {
  fetch: app.fetch,
  // Runs on the daily Cron Trigger declared in wrangler.toml's [triggers]
  // block — entirely separate from any HTTP request, so there's no `c`
  // (Hono context) here, just the raw env bindings. See
  // src/lib/reminders.ts for what this actually does (the MOT-expiry
  // reminder emails) and why it's safe to run unattended every day: it's
  // fully idempotent per MOT cycle via mot_reminder_sent_for.
  async scheduled(controller: any, env: Bindings, ctx: any): Promise<void> {
    ctx.waitUntil(sendDueMotReminders(env));
  },
};
