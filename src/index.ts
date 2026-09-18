import { Hono } from "hono";
import type { Env } from "./types";
import { attachUser } from "./lib/auth";
import { marketing } from "./routes/marketing";
import { auth } from "./routes/auth";
import { vehicles } from "./routes/vehicles";
import { documents } from "./routes/documents";
import { verify } from "./routes/verify";
import { billing } from "./routes/billing";

const app = new Hono<Env>();

app.use("*", attachUser);

app.route("/", marketing);
app.route("/", auth);
app.route("/", vehicles);
app.route("/", documents);
app.route("/", verify);
app.route("/", billing);

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
                                                                                                        
const passwordError = c.req.query("pwerror");
const passwordOk = c.req.query("pwok") === "1";
const passwordSection = `
  <div style="margin-top:36px">
    <div style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">Change password</div>
    ${passwordOk ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:16px;max-width:360px">Password updated.</div>` : ""}
    ${passwordError ? `<div class="error" style="max-width:360px">${esc(passwordError)}</div>` : ""}
    <form method="post" action="/settings/password" style="max-width:360px">
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
  </div>`;

                                                                                                          const body = `
                                                                                                            <div style="display:flex;gap:56px;flex-wrap:wrap">
                                                                                                                <div style="flex:0 0 190px;display:flex;flex-direction:column;gap:2px">
                                                                                                                      <div style="font-size:13px;color:var(--ink-subtle);padding:10px 0">Profile</div>
                                                                                                                            <div style="font-size:13px;font-weight:600;color:var(--ink);padding:10px 0;border-bottom:2px solid var(--ink);width:fit-content">My Vehicles</div>
                                                                                                                                  <div style="font-size:13px;color:var(--ink-subtle);padding:10px 0">Notifications</div>
                                                                                                                                        <form method="post" action="/logout" style="margin-top:16px">
                                                                                                                                                <button type="submit" style="border:none;background:none;padding:0;font-size:13px;color:var(--ink-subtle);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Sign out</button>
                                                                                                                                                      </form>
                                                                                                                                                          </div>
                                                                                                                                                              <div style="flex:1 1 0;min-width:280px">
                                                                                                                                                                    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:6px;gap:16px;flex-wrap:wrap">
                                                                                                                                                                            <div style="font-family:var(--font-display);font-size:24px">My Vehicles</div>
                                                                                                                                                                                    <a href="/register-vehicle" class="btn btn-outline">Add a vehicle</a>
                                                                                                                                                                                          </div>
                                                                                                                                                                                                <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${list.length} vehicle${list.length === 1 ? "" : "s"} registered to your account</div>
                                                                                                                                                                                                      <div style="border:1px solid var(--hairline)">${rows}</div>
${passwordSection}
                                                                                                                                                                                                          </div>
                                                                                                                                                                                                            </div>`;
                                                                                                                                                                                                            
                                                                                                                                                                                                              return c.html(appShell("Settings — Moto ID", "Settings / My Vehicles", body, user));
                                                                                                                                                                                                              });
                                                                                                                                                                                                              
app.post("/settings/password", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login?next=/settings");
  const { hashPassword, verifyPassword } = await import("./lib/crypto");
  const { updateUserPassword } = await import("./lib/db");

  const body = await c.req.parseBody();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    return c.redirect(`/settings?pwerror=${encodeURIComponent("Current password is incorrect.")}`);
  }
  if (newPassword.length < 8) {
    return c.redirect(`/settings?pwerror=${encodeURIComponent("New password needs at least 8 characters.")}`);
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(c.env.DB, user.id, passwordHash);

  return c.redirect("/settings?pwok=1");
});

                                                                                                                                                                                                              app.notFound((c) => c.text("Not found", 404));
                                                                                                                                                                                                              
                                                                                                                                                                                                              export default app;
                                                                                                                                                                                                              
