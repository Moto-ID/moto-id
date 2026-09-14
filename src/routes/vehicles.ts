import { Hono } from "hono";
import type { Env } from "../types";
import { authShell, appShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import {
    createVehicle,
    getVehiclesByUser,
    getVehicleById,
    countDocumentsByFolder,
    recentActivity,
    setVehiclePhoto,
    type Vehicle,
} from "../lib/db";

export const vehicles = new Hono<Env>();

vehicles.use("*", requireAuth);

const CAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" width="50" height="50"><path d="M3.5 16 5 10.5c.4-1.3 1.6-2 3-2h8c1.4 0 2.6.7 3 2L21 16"/><rect x="2.5" y="16" width="19" height="4" rx="1.4"/><circle cx="7" cy="20" r="1.6" fill="var(--ink-subtle)" stroke="none"/><circle cx="17" cy="20" r="1.6" fill="var(--ink-subtle)" stroke="none"/></svg>`;
const BIKE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="26" height="26"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17 10 10h4l2 3h3"/><path d="M10 10 8.5 7h3"/><line x1="14" y1="13" x2="18" y2="17"/></svg>`;

function registerVehicleForm(opts: { error?: string; values?: Record<string, string> }) {
  const v = opts.values ?? {};
  const carActive = (v.vehicleType ?? "car") === "car";
    return `
    <div style="width:100%;max-width:460px">
  <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">STEP 2 OF 2 &mdash; REGISTER YOUR VEHICLE</div>
  <div style="font-family:var(--font-display);font-size:30px;line-height:1.25;margin-bottom:30px">Tell us about<br>the vehicle.</div>

  ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}

        <form method="post" action="/register-vehicle">
    <div style="display:flex;border:1px solid var(--ink);margin-bottom:30px">
    <label style="flex:1 1 0;text-align:center;padding:12px;font-size:12.5px;letter-spacing:0.04em;cursor:pointer;${carActive ? "background:var(--ink);color:var(--bg)" : "color:var(--ink-muted)"}">
    <input type="radio" name="vehicleType" value="car" ${carActive ? "checked" : ""} style="display:none">Car
            </label>
    <label style="flex:1 1 0;text-align:center;padding:12px;font-size:12.5px;letter-spacing:0.04em;cursor:pointer;border-left:1px solid var(--ink);${!carActive ? "background:var(--ink);color:var(--bg)" : "color:var(--ink-muted)"}">
    <input type="radio" name="vehicleType" value="motorcycle" ${!carActive ? "checked" : ""} style="display:none">Motorcycle
            </label>
          </div>

          <div style="display:flex;flex-direction:column;gap:24px;margin-bottom:34px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
              <div class="field" style="margin-bottom:0">
                            <label>REGISTRATION NUMBER</label>
                <input type="text" name="registrationNumber" class="mono" value="${esc(v.registrationNumber ?? "")}" required style="text-transform:uppercase">
                            </div>
                            <div class="field" style="margin-bottom:0">
                                          <label>YEAR</label>
                              <input type="number" name="year" class="mono" value="${esc(v.year ?? "")}" min="1900" max="2100">
                                          </div>
                                        </div>
                                        <div class="field" style="margin-bottom:0">
                                                    <label>VIN</label>
                                          <input type="text" name="vin" class="mono" value="${esc(v.vin ?? "")}" required style="text-transform:uppercase">
                                                    </div>
                                                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
                                                      <div class="field" style="margin-bottom:0">
                                                                    <label>MAKE</label>
                                                        <input type="text" name="make" value="${esc(v.make ?? "")}" required>
                                                                  </div>
                                                                  <div class="field" style="margin-bottom:0">
                                                                                <label>MODEL</label>
                                                                    <input type="text" name="model" value="${esc(v.model ?? "")}" required>
                                                                              </div>
                                                                            </div>
                                                                            <div class="field" style="margin-bottom:0">
                                                                              <label>COLOUR (OPTIONAL)</label>
                                                                              <input type="text" name="colour" value="${esc(v.colour ?? "")}">
                                                                                      </div>
                                                                                    </div>

                                                                              <div style="border:1px solid var(--hairline);padding:18px 20px;display:flex;align-items:center;gap:16px;margin-bottom:30px">
                                                                              <div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-subtle)">Your Moto ID number is assigned the moment you submit this form, and held for the life of the vehicle.</div>
                                                                                      </div>

                                                                                      <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">Create my Moto ID</button>
                                                                                            </form>
                                                                                        <a href="/dashboard" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to my collection</a>
                                                                                          </div>`;
                                                                                        }

                                                                                        vehicles.get("/register-vehicle", (c) => {
                                                                                          return c.html(authShell("Register your vehicle — Moto ID", registerVehicleForm({})));
                                                                                        });

                                                                                        vehicles.post("/register-vehicle", async (c) => {
                                                                                          const user = c.get("user")!;
                                                                                          const body = await c.req.parseBody();
                                                                                            const vehicleType = body.vehicleType === "motorcycle" ? "motorcycle" : "car";
                                                                                          const registrationNumber = String(body.registrationNumber ?? "").trim();
                                                                                          const vin = String(body.vin ?? "").trim();
                                                                                          const make = String(body.make ?? "").trim();
                                                                                          const model = String(body.model ?? "").trim();
                                                                                          const yearRaw = String(body.year ?? "").trim();
                                                                                          const colour = String(body.colour ?? "").trim() || null;
                                                                                          const year = yearRaw ? parseInt(yearRaw, 10) : null;

                                                                                          if (!registrationNumber || !vin || !make || !model) {
                                                                                            return c.html(
                                                                                              authShell(
                                                                                                        "Register your vehicle — Moto ID",
                                                                                                registerVehicleForm({
                                                                                                            error: "Please fill in registration number, VIN, make and model.",
                                                                                                  values: { vehicleType, registrationNumber, vin, make, model, year: yearRaw, colour: colour ?? "" },
                                                                                                })
                                                                                              ),
                                                                                                    400
                                                                                            );
                                                                                          }

                                                                                            const vehicle = await createVehicle(c.env.DB, user.id, {
                                                                                                  vehicleType,
                                                                                                  registrationNumber,
                                                                                                  vin,
                                                                                                  make,
                                                                                                  model,
                                                                                                  year,
                                                                                                  colour,
                                                                                            });

                                                                                          return c.redirect(`/vehicles/${vehicle.id}`);
                                                                                        });

                                                                                        vehicles.get("/dashboard", async (c) => {
                                                                                          const user = c.get("user")!;
                                                                                          const list = await getVehiclesByUser(c.env.DB, user.id);
                                                                                          if (list.length === 0) return c.redirect("/register-vehicle");
                                                                                          return c.redirect(`/vehicles/${list[0].id}`);
                                                                                        });

function photoBox(vehicle: Vehicle, icon: string, uploadEnabled: boolean): string {
    const inner = vehicle.photo_r2_key
    ? `<img src="/vehicles/${vehicle.id}/photo" alt="${esc(vehicle.make)} ${esc(vehicle.model)}" style="width:100%;height:100%;object-fit:cover;display:block">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${icon}</div>`;

    if (!uploadEnabled) {
        return `<div style="height:114px;background:var(--bg-panel);border:1px solid var(--hairline);margin-bottom:20px">${inner}</div>`;
    }

    return `
    <form method="post" action="/vehicles/${vehicle.id}/photo" enctype="multipart/form-data">
    <div class="photo-upload" style="height:114px;background:var(--bg-panel);border:1px solid var(--hairline);margin-bottom:20px">
    ${inner}
    <div class="photo-overlay">${vehicle.photo_r2_key ? "Change photo" : "Click to add a photo"}</div>
    <input type="file" name="file" accept="image/png,image/jpeg,image/webp" onchange="this.form.requestSubmit()">
    </div>
    </form>`;
}

                                                                                        async function requireOwnedVehicle(c: any): Promise<Vehicle | null> {
                                                                                          const user = c.get("user")!;
                                                                                          const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
                                                                                          if (!vehicle || vehicle.user_id !== user.id) return null;
                                                                                            return vehicle;
                                                                                        }

vehicles.post("/vehicles/:id/photo", async (c) => {
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();
    if (!c.env.DOCS) return c.redirect(`/vehicles/${vehicle.id}`);

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) {
        return c.redirect(`/vehicles/${vehicle.id}`);
    }

    const r2Key = `${vehicle.id}/cover/${crypto.randomUUID()}-${file.name}`;
    await c.env.DOCS.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || undefined },
    });

    const previousKey = vehicle.photo_r2_key;
    await setVehiclePhoto(c.env.DB, vehicle.id, r2Key);
    if (previousKey) {
        try {
            await c.env.DOCS.delete(previousKey);
        } catch {
            // best-effort cleanup of the old photo — ignore failures
        }
    }

    return c.redirect(`/vehicles/${vehicle.id}`);
});

vehicles.get("/vehicles/:id/photo", async (c) => {
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle || !vehicle.photo_r2_key || !c.env.DOCS) return c.notFound();

    const object = await c.env.DOCS.get(vehicle.photo_r2_key);
    if (!object) return c.notFound();

    c.header("Content-Type", object.httpMetadata?.contentType ?? "image/jpeg");
    c.header("Cache-Control", "private, max-age=3600");
    return c.body(object.body as any);
});

                                                                                          vehicles.get("/vehicles/:id", async (c) => {
                                                                                            const user = c.get("user")!;
                                                                                            const vehicle = await requireOwnedVehicle(c);
                                                                                            if (!vehicle) return c.notFound();

                                                                                            const counts = await countDocumentsByFolder(c.env.DB, vehicle.id);
                                                                                            const activity = await recentActivity(c.env.DB, vehicle.id, 6);

                                                                                              const icon = vehicle.vehicle_type === "motorcycle" ? BIKE_ICON : CAR_ICON;
                                                                                            const subtitle = [vehicle.year, vehicle.colour].filter(Boolean).join(" · ");

                                                                                            const folderCard = (href: string, icon: string, label: string, count: number, updated: string) => `
                                                                                            <a href="${href}" class="panel" style="padding:22px;background:var(--bg);display:block">
                                                                                              ${icon}
                                                                                              <div style="font-weight:600;font-size:13.5px;margin-top:16px;margin-bottom:4px">${label}</div>
                                                                                              <div style="font-size:11.5px;color:var(--ink-subtle)">${count} file${count === 1 ? "" : "s"}${updated ? ` &middot; updated ${updated}` : ""}</div>
                                                                                                  </a>`;

                                                                                                const activityRows =
                                                                                                  activity.length > 0
                                                                                                    ? activity
                                                                                              .map(
                                                                                                (d) => `
                                                                                                      <div style="display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid var(--hairline)">
                                                                                                <div style="flex:1 1 0;font-size:12.5px">${esc(d.filename)} <span style="color:var(--ink-subtle)">&middot; added to ${esc(d.folder)}</span></div>
                                                                                                <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-subtle)">${new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                                                                                                      </div>`
                                                                                              )
                                                                                              .join("")
                                                                                              : `<div style="padding:22px;font-size:12.5px;color:var(--ink-subtle)">No activity yet — upload your first document to get started.</div>`;

                                                                                                const body = `
                                                                                                <div style="display:flex;gap:40px;align-items:flex-start;flex-wrap:wrap">

                                                                                                  <!-- SIDEBAR -->
                                                                                                  <div style="flex:0 0 300px;display:flex;flex-direction:column;gap:20px;min-width:260px">
                                                                                                    <div>
${photoBox(vehicle, icon, !!c.env.DOCS)}                                                                                              <div style="font-family:var(--font-display);font-size:21px;margin-bottom:2px">${esc(vehicle.make)} ${esc(vehicle.model)}</div>
                                                                                              <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:18px">${esc(subtitle || "—")}</div>

                                                                                              <div style="border-top:1px solid var(--hairline);padding-top:16px;margin-bottom:16px">
                                                                                                        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                                                                                              <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.08em">REGISTRATION</div>
                                                                                              <div style="font-family:var(--font-mono);font-size:12px">${esc(vehicle.registration_number)}</div>
                                                                                                        </div>
                                                                                                        <div style="display:flex;justify-content:space-between">
                                                                                              <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.08em">VIN</div>
                                                                                              <div style="font-family:var(--font-mono);font-size:12px">${esc(vehicle.vin)}</div>
                                                                                                        </div>
                                                                                                      </div>

                                                                                              <div style="border-top:1px solid var(--hairline);padding-top:16px">
                                                                                                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                                                                                              <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.08em">MOTO ID NUMBER</div>
                                                                                                          <div class="badge"><div class="dot"></div>AUTHENTICATED</div>
                                                                                                                      </div>
                                                                                                                      <div style="display:flex;align-items:center;gap:12px">
                                                                                                            <div style="font-family:var(--font-mono);font-weight:700;font-size:14px">No.&nbsp;${esc(vehicle.moto_id_number)}</div>
                                                                                                                      </div>
                                                                                                                    </div>
                                                                                                                  </div>
                                                                                                            
                                                                                                            <a href="/verify/${esc(vehicle.moto_id_number)}" target="_blank" class="btn btn-outline" style="text-align:center">View public record</a>
                                                                                                                    <a href="/settings" class="btn btn-outline" style="text-align:center">Manage vehicle</a>
                                                                                                                          </div>
                                                                                                                      
                                                                                                                          <!-- MAIN -->
                                                                                                                          <div style="flex:1 1 0;min-width:0">
                                                                                                                      <div style="display:flex;gap:30px;border-bottom:1px solid var(--hairline);margin-bottom:28px;overflow-x:auto">
                                                                                                                      <div style="padding-bottom:14px;font-size:13px;font-weight:600;color:var(--ink);border-bottom:2px solid var(--ink);white-space:nowrap">Overview</div>
                                                                                                                            </div>
                                                                                                                      
                                                                                                                            <div class="grid-4" style="margin-bottom:36px">
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/service`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><polyline points="8,12 9.5,13.5 12,10.5"/><line x1="14" y1="12.2" x2="16" y2="12.2"/><line x1="8" y1="16.2" x2="16" y2="16.2"/></svg>`, "Service Documents", counts.service, "")}
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/invoice`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M6 3h12v18l-2.5-1.6L13 21l-1-1.6L10 21l-2.5-1.6L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`, "Invoices", counts.invoice, "")}
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/photo`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/></svg>`, "Photos", counts.photo, "")}
                                                                                                                              <div class="panel" style="padding:22px;background:var(--bg)">
                                                                                                                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="8.5"/><polyline points="12,7.5 12,12 15.2,14"/></svg>
                                                                                                                                          <div style="font-weight:600;font-size:13.5px;margin-top:16px;margin-bottom:4px">Ownership History</div>
                                                                                                                                <div style="font-size:11.5px;color:var(--ink-subtle)">1 owner &middot; since ${new Date(vehicle.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
                                                                                                                                        </div>
                                                                                                                                      </div>
                                                                                                                                
                                                                                                                                <div style="border:1px solid var(--hairline)">
                                                                                                                                <div style="padding:18px 22px;border-bottom:1px solid var(--hairline);font-weight:600;font-size:13.5px">Recent activity</div>
                                                                                                                                ${activityRows}
                                                                                                                                      </div>
                                                                                                                                    </div>
                                                                                                                                  </div>
                                                                                                                                  `;
                                                                                                                                
                                                                                                                                return c.html(appShell(`${vehicle.make} ${vehicle.model} — Moto ID`, `<a href="/dashboard">My Collection</a> / ${esc(vehicle.registration_number)}`, body, user));
                                                                                                                                });
                                                                                                                                
