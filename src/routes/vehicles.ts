import { Hono } from "hono";
import type { Env } from "../types";
import { authShell, appShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import { newId } from "../lib/crypto";
import {
    createVehicle,
    getVehiclesByUser,
    getVehicleById,
    countDocumentsByFolder,
    recentActivity,
    setVehiclePhoto,
    consumeUserCredit,
    getUserById,
    createVehicleTransfer,
    getPendingTransferForVehicle,
    getValidVehicleTransfer,
    cancelPendingTransferForVehicle,
    declineVehicleTransfer,
    acceptVehicleTransfer,
    getOwnershipHistory,
    listAllDocumentsForVehicle,
    deleteVehicle,
    type Vehicle,
} from "../lib/db";
import { sendOrderNotificationEmail, sendOwnershipTransferEmail } from "../lib/email";

export const vehicles = new Hono<Env>();

// requireAuth is applied per-route below (not via a blanket vehicles.use("*", ...))
// because Hono mounts every route file at the same base path ("/" in
// index.ts) — a wildcard "*" middleware registered here ends up matching
// every path in the whole app, not just this file's own routes. That
// silently broke the public /verify/:motoIdNumber page (no login required by
// design — it's what a QR-code scan lands on) once this line was added,
// redirecting every visitor, including anonymous ones, to /login. Found
// 2026-09-19 while investigating why a restored vehicle's public record
// wasn't showing.

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
    <div style="display:flex;border:1px solid var(--ink);margin-bottom:30px" id="vehicleTypeToggle">
    <label class="vtype-label" style="flex:1 1 0;text-align:center;padding:12px;font-size:12.5px;letter-spacing:0.04em;cursor:pointer;${carActive ? "background:var(--ink);color:var(--bg)" : "color:var(--ink-muted)"}">
    <input type="radio" name="vehicleType" value="car" ${carActive ? "checked" : ""} style="display:none">Car
            </label>
    <label class="vtype-label" style="flex:1 1 0;text-align:center;padding:12px;font-size:12.5px;letter-spacing:0.04em;cursor:pointer;border-left:1px solid var(--ink);${!carActive ? "background:var(--ink);color:var(--bg)" : "color:var(--ink-muted)"}">
    <input type="radio" name="vehicleType" value="motorcycle" ${!carActive ? "checked" : ""} style="display:none">Motorcycle
            </label>
          </div>
          <script>
            // The Car/Motorcycle toggle's highlight above was previously baked
            // in only from the server-rendered initial state (carActive), with
            // nothing to update it on click — the hidden radio's checked state
            // did actually change when you clicked "Motorcycle", but the label
            // never re-styled to show it, so the toggle looked unresponsive.
            // Fixed by re-applying the highlight on the radio's own "change"
            // event, which fires for both a direct click and a keyboard toggle.
            (function () {
              var toggle = document.getElementById('vehicleTypeToggle');
              if (!toggle) return;
              var labels = Array.prototype.slice.call(toggle.querySelectorAll('.vtype-label'));
              labels.forEach(function (label) {
                var input = label.querySelector('input[type="radio"]');
                input.addEventListener('change', function () {
                  labels.forEach(function (l) {
                    var active = l === label;
                    l.style.background = active ? 'var(--ink)' : '';
                    l.style.color = active ? 'var(--bg)' : 'var(--ink-muted)';
                  });
                });
              });
            })();
          </script>

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

  <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin:6px 0 18px">SHIP THE PLATE TO</div>
  <div style="display:flex;flex-direction:column;gap:24px;margin-bottom:30px">
    <div class="field" style="margin-bottom:0">
      <label>FULL NAME</label>
      <input type="text" name="shipName" value="${esc(v.shipName ?? "")}" required>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>ADDRESS LINE 1</label>
      <input type="text" name="shipAddressLine1" value="${esc(v.shipAddressLine1 ?? "")}" required>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>ADDRESS LINE 2 (OPTIONAL)</label>
      <input type="text" name="shipAddressLine2" value="${esc(v.shipAddressLine2 ?? "")}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div class="field" style="margin-bottom:0">
        <label>TOWN / CITY</label>
        <input type="text" name="shipCity" value="${esc(v.shipCity ?? "")}" required>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>POSTCODE</label>
        <input type="text" name="shipPostalCode" class="mono" value="${esc(v.shipPostalCode ?? "")}" required style="text-transform:uppercase">
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--ink-subtle)">We currently post within the United Kingdom only.</div>
  </div>

                                                                              <div style="border:1px solid var(--hairline);padding:18px 20px;display:flex;align-items:center;gap:16px;margin-bottom:30px">
                                                                              <div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-subtle)">Your Moto ID number is assigned the moment you submit this form, and held for the life of the vehicle.</div>
                                                                                      </div>

                                                                                      <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">Create my Moto ID</button>
                                                                                            </form>
                                                                                        <a href="/dashboard" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to my collection</a>
                                                                                          </div>`;
                                                                                        }

                                                                                        vehicles.get("/register-vehicle", requireAuth, (c) => {
                                                                                          const user = c.get("user")!;
                                                                                          if (!user.unlimited_vehicles && user.vehicle_credits <= 0) return c.redirect("/buy");
                                                                                          return c.html(authShell("Register your vehicle — Moto ID", registerVehicleForm({ values: { shipName: user.name } })));
                                                                                        });

                                                                                        vehicles.post("/register-vehicle", requireAuth, async (c) => {
                                                                                          const user = c.get("user")!;
                                                                                          if (!user.unlimited_vehicles && user.vehicle_credits <= 0) return c.redirect("/buy");
                                                                                          const body = await c.req.parseBody();
                                                                                            const vehicleType = body.vehicleType === "motorcycle" ? "motorcycle" : "car";
                                                                                          const registrationNumber = String(body.registrationNumber ?? "").trim();
                                                                                          const vin = String(body.vin ?? "").trim();
                                                                                          const make = String(body.make ?? "").trim();
                                                                                          const model = String(body.model ?? "").trim();
                                                                                          const yearRaw = String(body.year ?? "").trim();
                                                                                          const colour = String(body.colour ?? "").trim() || null;
                                                                                          const year = yearRaw ? parseInt(yearRaw, 10) : null;

                                                                                          // Shipping address for the physical plate — the "order form" fields,
                                                                                          // collected right alongside the vehicle details so one submit captures
                                                                                          // everything needed to both mint the Moto ID and fulfil the order.
                                                                                          const shipName = String(body.shipName ?? "").trim();
                                                                                          const shipAddressLine1 = String(body.shipAddressLine1 ?? "").trim();
                                                                                          const shipAddressLine2 = String(body.shipAddressLine2 ?? "").trim() || null;
                                                                                          const shipCity = String(body.shipCity ?? "").trim();
                                                                                          const shipPostalCode = String(body.shipPostalCode ?? "").trim();
                                                                                          const shipCountry = "United Kingdom"; // UK-only for now — see the note on the form itself.

                                                                                          const formValues = {
                                                                                            vehicleType,
                                                                                            registrationNumber,
                                                                                            vin,
                                                                                            make,
                                                                                            model,
                                                                                            year: yearRaw,
                                                                                            colour: colour ?? "",
                                                                                            shipName,
                                                                                            shipAddressLine1,
                                                                                            shipAddressLine2: shipAddressLine2 ?? "",
                                                                                            shipCity,
                                                                                            shipPostalCode,
                                                                                          };

                                                                                          if (!registrationNumber || !vin || !make || !model) {
                                                                                            return c.html(
                                                                                              authShell(
                                                                                                        "Register your vehicle — Moto ID",
                                                                                                registerVehicleForm({
                                                                                                            error: "Please fill in registration number, VIN, make and model.",
                                                                                                  values: formValues,
                                                                                                })
                                                                                              ),
                                                                                                    400
                                                                                            );
                                                                                          }

                                                                                          if (!shipName || !shipAddressLine1 || !shipCity || !shipPostalCode) {
                                                                                            return c.html(
                                                                                              authShell(
                                                                                                        "Register your vehicle — Moto ID",
                                                                                                registerVehicleForm({
                                                                                                            error: "Please fill in the shipping address for your plate.",
                                                                                                  values: formValues,
                                                                                                })
                                                                                              ),
                                                                                                    400
                                                                                            );
                                                                                          }

                                                                                            if (!user.unlimited_vehicles) {
                                                                                              const creditConsumed = await consumeUserCredit(c.env.DB, user.id);
                                                                                              if (!creditConsumed) {
                                                                                                // Credit was used up between the form loading and this submit (e.g. two
                                                                                                // tabs, or a race with another purchase) — send them to buy another.
                                                                                                return c.redirect("/buy");
                                                                                              }
                                                                                            }

                                                                                            const vehicle = await createVehicle(c.env.DB, user.id, {
                                                                                                  vehicleType,
                                                                                                  registrationNumber,
                                                                                                  vin,
                                                                                                  make,
                                                                                                  model,
                                                                                                  year,
                                                                                                  colour,
                                                                                                  shipName,
                                                                                                  shipAddressLine1,
                                                                                                  shipAddressLine2,
                                                                                                  shipCity,
                                                                                                  shipPostalCode,
                                                                                                  shipCountry,
                                                                                            });

                                                                                            // Automated order notification — every registration is a physical plate
                                                                                            // order, so Adam needs the customer's shipping address, the vehicle
                                                                                            // details, and the QR-code URL for the plate itself. A failure here must
                                                                                            // never block the customer's own flow (e.g. Resend not configured yet),
                                                                                            // so it's caught and logged rather than surfaced to them.
                                                                                            const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
                                                                                            try {
                                                                                              await sendOrderNotificationEmail(c.env, {
                                                                                                customerName: user.name,
                                                                                                customerEmail: user.email,
                                                                                                vehicle: {
                                                                                                  vehicleType,
                                                                                                  make: vehicle.make,
                                                                                                  model: vehicle.model,
                                                                                                  year: vehicle.year,
                                                                                                  colour: vehicle.colour,
                                                                                                  registrationNumber: vehicle.registration_number,
                                                                                                  vin: vehicle.vin,
                                                                                                  motoIdNumber: vehicle.moto_id_number,
                                                                                                },
                                                                                                shipping: {
                                                                                                  name: shipName,
                                                                                                  addressLine1: shipAddressLine1,
                                                                                                  addressLine2: shipAddressLine2,
                                                                                                  city: shipCity,
                                                                                                  postalCode: shipPostalCode,
                                                                                                  country: shipCountry,
                                                                                                },
                                                                                                verifyUrl: `${origin}/verify/${vehicle.moto_id_number}`,
                                                                                                paidOrder: !user.unlimited_vehicles,
                                                                                              });
                                                                                            } catch (err) {
                                                                                              console.error("Failed to send order notification email:", err instanceof Error ? err.message : String(err));
                                                                                            }

                                                                                          return c.redirect(`/vehicles/${vehicle.id}`);
                                                                                        });

// The free "My Collection" empty state — shown to any signed-in user with no
// vehicles yet and no unused Moto ID credit. Signing up is always free; this
// is the wall before registering an actual vehicle, which needs a credit.
function myCollectionEmptyState(): string {
  return `
    <div style="max-width:480px;margin:70px auto;text-align:center">
      <div style="font-family:var(--font-display);font-size:26px;margin-bottom:14px">My Collection is empty.</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:32px">Your account is free to keep, for as long as you like. To register a vehicle and get an actual Moto ID, you'll need a Moto ID Kit &mdash; a single engraved plate, which comes with the digital record and public verification page you'll build on here.</div>
      <a href="/buy" class="btn btn-solid" style="display:inline-block;border:none;padding:15px 34px">Get a Moto ID &mdash; from &pound;29</a>
    </div>`;
}

// A single vehicle tile for the "My Collection" grid: thumbnail (the same
// cover photo set via photoBox on the vehicle detail page, read-only here)
// plus make/model, registration and Moto ID number. The whole tile links to
// the vehicle's own detail page.
function vehicleCard(vehicle: Vehicle): string {
  const icon = vehicle.vehicle_type === "motorcycle" ? BIKE_ICON : CAR_ICON;
  const thumb = vehicle.photo_r2_key
    ? `<img src="/vehicles/${vehicle.id}/photo" alt="${esc(vehicle.make)} ${esc(vehicle.model)}" style="width:100%;height:100%;object-fit:cover;display:block">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${icon}</div>`;
  const subtitle = [vehicle.year, vehicle.colour].filter(Boolean).join(" · ");

  return `
    <a href="/vehicles/${vehicle.id}" class="panel" style="display:block">
      <div class="vcard-thumb">${thumb}</div>
      <div style="padding:18px 20px">
        <div style="font-weight:600;font-size:14.5px;margin-bottom:2px">${esc(vehicle.make)} ${esc(vehicle.model)}</div>
        <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:14px">${esc(subtitle || "—")}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono);font-size:11.5px;color:var(--ink-muted)">
          <span>${esc(vehicle.registration_number)}</span>
          <span>No.&nbsp;${esc(vehicle.moto_id_number)}</span>
        </div>
      </div>
    </a>`;
}

vehicles.get("/dashboard", requireAuth, async (c) => {
  const user = c.get("user")!;
  const list = await getVehiclesByUser(c.env.DB, user.id);

  if (list.length === 0) {
    if (user.unlimited_vehicles || user.vehicle_credits > 0) return c.redirect("/register-vehicle");
    return c.html(appShell("My Collection — Moto ID", "My Collection", myCollectionEmptyState(), user));
  }

  const body = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:6px;gap:16px;flex-wrap:wrap">
      <div style="font-family:var(--font-display);font-size:26px">My Collection</div>
      <a href="/register-vehicle" class="btn btn-outline">+ Add a vehicle</a>
    </div>
    <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${list.length} vehicle${list.length === 1 ? "" : "s"} registered to your account</div>
    <div class="grid-3">${list.map(vehicleCard).join("")}</div>`;

  return c.html(appShell("My Collection — Moto ID", "My Collection", body, user));
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

vehicles.post("/vehicles/:id/photo", requireAuth, async (c) => {
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

vehicles.get("/vehicles/:id/photo", requireAuth, async (c) => {
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle || !vehicle.photo_r2_key || !c.env.DOCS) return c.notFound();

    const object = await c.env.DOCS.get(vehicle.photo_r2_key);
    if (!object) return c.notFound();

    c.header("Content-Type", object.httpMetadata?.contentType ?? "image/jpeg");
    c.header("Cache-Control", "private, max-age=3600");
    return c.body(object.body as any);
});

                                                                                          vehicles.get("/vehicles/:id", requireAuth, async (c) => {
                                                                                            const user = c.get("user")!;
                                                                                            const vehicle = await requireOwnedVehicle(c);
                                                                                            if (!vehicle) return c.notFound();

                                                                                            const counts = await countDocumentsByFolder(c.env.DB, vehicle.id);
                                                                                            const activity = await recentActivity(c.env.DB, vehicle.id, 6);
                                                                                            const pendingTransfer = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
                                                                                            const ownershipHistory = await getOwnershipHistory(c.env.DB, vehicle.id);
                                                                                            const ownerCount = 1 + ownershipHistory.length;
                                                                                            const ownedSince = ownershipHistory.length > 0
                                                                                              ? ownershipHistory[ownershipHistory.length - 1].transferred_at
                                                                                              : vehicle.created_at;

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
                                                                                                  <div style="flex:0 1 300px;display:flex;flex-direction:column;gap:20px;min-width:0;max-width:300px">
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
                                                                                                                    ${pendingTransfer
                                                                                                                      ? `<div style="border:1px solid var(--hairline);padding:14px 16px;font-size:12px;color:var(--ink-muted);line-height:1.6">Transfer pending to <strong style="color:var(--ink)">${esc(pendingTransfer.to_email)}</strong><form method="post" action="/vehicles/${vehicle.id}/transfer/cancel" style="margin-top:8px"><button type="submit" style="border:none;background:none;padding:0;font-size:12px;color:var(--ink-subtle);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Cancel transfer</button></form></div>`
                                                                                                                      : `<a href="/vehicles/${vehicle.id}/transfer" class="btn btn-outline" style="text-align:center">Transfer ownership</a>`
                                                                                                                    }
                                                                                                                    <a href="/vehicles/${vehicle.id}/remove" style="display:block;text-align:center;font-size:12.5px;color:oklch(45% 0.18 25);text-decoration:underline;text-underline-offset:3px;margin-top:4px">Remove vehicle</a>
                                                                                                                          </div>
                                                                                                                      
                                                                                                                          <!-- MAIN -->
                                                                                                                          <div style="flex:1 1 0;min-width:0">
                                                                                                                      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--hairline);margin-bottom:28px;overflow-x:auto">
                                                                                                                      <div style="display:flex;gap:30px">
                                                                                                                      <div style="padding-bottom:14px;font-size:13px;font-weight:600;color:var(--ink);border-bottom:2px solid var(--ink);white-space:nowrap">Overview</div>
                                                                                                                            </div>
                                                                                                                      <a href="/register-vehicle" style="font-size:12.5px;color:var(--ink);border-bottom:1px solid var(--ink);white-space:nowrap;padding-bottom:14px">+ Add a vehicle</a>
                                                                                                                            </div>
                                                                                                                      
                                                                                                                            <div class="grid-4" style="margin-bottom:36px">
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/service`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><polyline points="8,12 9.5,13.5 12,10.5"/><line x1="14" y1="12.2" x2="16" y2="12.2"/><line x1="8" y1="16.2" x2="16" y2="16.2"/></svg>`, "Service Documents", counts.service, "")}
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/invoice`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M6 3h12v18l-2.5-1.6L13 21l-1-1.6L10 21l-2.5-1.6L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`, "Invoices", counts.invoice, "")}
                                                                                                                              ${folderCard(`/vehicles/${vehicle.id}/folder/photo`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/></svg>`, "Photos", counts.photo, "")}
                                                                                                                              <a href="/vehicles/${vehicle.id}/history" class="panel" style="padding:22px;background:var(--bg);display:block">
                                                                                                                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="8.5"/><polyline points="12,7.5 12,12 15.2,14"/></svg>
                                                                                                                                          <div style="font-weight:600;font-size:13.5px;margin-top:16px;margin-bottom:4px">Ownership History</div>
                                                                                                                                <div style="font-size:11.5px;color:var(--ink-subtle)">${ownerCount} owner${ownerCount === 1 ? "" : "s"} &middot; since ${new Date(ownedSince).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
                                                                                                                                        </a>
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

// --- Ownership transfer ------------------------------------------------
//
// Lets the current owner hand a vehicle to a new owner (e.g. it's been
// sold) — free, per the business plan. The current owner starts it from
// the vehicle page by email address; the buyer gets an emailed link and
// must sign in or create an account using that exact email before they
// can accept, at which point the vehicle (and its whole document/photo
// history) moves to their account. See the ownership-transfer functions
// in src/lib/db.ts for the data model.

function transferForm(vehicle: Vehicle, opts: { error?: string } = {}): string {
    return `
    <div style="width:100%;max-width:440px">
      <div style="font-family:var(--font-display);font-size:24px;margin-bottom:10px">Transfer ownership</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${esc(vehicle.make)} ${esc(vehicle.model)} &middot; ${esc(vehicle.registration_number)}</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:28px">If you've sold this vehicle, transfer its Moto ID record &mdash; including its full service history, invoices and photos &mdash; to the new owner. Transfers are free. Enter the new owner's email and we'll send them a link to accept; nothing changes unless they do, and you can cancel any time before then.</div>
      ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
      <form method="post" action="/vehicles/${vehicle.id}/transfer">
        <div class="field">
          <label>NEW OWNER'S EMAIL</label>
          <input type="email" name="toEmail" required autocomplete="email">
        </div>
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">Send transfer invitation</button>
      </form>
      <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to vehicle</a>
    </div>`;
}

vehicles.get("/vehicles/:id/transfer", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();
    const pending = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
    if (pending) return c.redirect(`/vehicles/${vehicle.id}`);
    return c.html(
        appShell(
            "Transfer ownership — Moto ID",
            `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Transfer ownership`,
            transferForm(vehicle),
            user
        )
    );
});

vehicles.post("/vehicles/:id/transfer", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();

    const breadcrumb = `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Transfer ownership`;
    const showError = (error: string, status: 400 | 500) =>
        c.html(appShell("Transfer ownership — Moto ID", breadcrumb, transferForm(vehicle, { error }), user), status);

    const existingPending = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
    if (existingPending) return c.redirect(`/vehicles/${vehicle.id}`);

    const body = await c.req.parseBody();
    const toEmail = String(body.toEmail ?? "").trim();

    if (!toEmail) return showError("Please enter the new owner's email.", 400);
    if (toEmail.toLowerCase() === user.email.toLowerCase()) {
        return showError("You can't transfer a vehicle to your own account.", 400);
    }

    const token = newId();
    await createVehicleTransfer(c.env.DB, vehicle.id, user.id, toEmail, token);

    const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
    try {
        await sendOwnershipTransferEmail(c.env, {
            toEmail,
            fromName: user.name,
            vehicle: {
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                registrationNumber: vehicle.registration_number,
                motoIdNumber: vehicle.moto_id_number,
            },
            acceptUrl: `${origin}/transfer/${token}`,
        });
    } catch (err) {
        console.error("Failed to send ownership transfer email:", err instanceof Error ? err.message : String(err));
        // Undo the pending row so the owner isn't stuck unable to retry (the
        // "one pending transfer per vehicle" check above would otherwise block it).
        await cancelPendingTransferForVehicle(c.env.DB, vehicle.id, user.id);
        return showError("We couldn't send the invitation email right now. Please try again shortly.", 500);
    }

    return c.redirect(`/vehicles/${vehicle.id}`);
});

vehicles.post("/vehicles/:id/transfer/cancel", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();
    await cancelPendingTransferForVehicle(c.env.DB, vehicle.id, user.id);
    return c.redirect(`/vehicles/${vehicle.id}`);
});

// --- Remove vehicle -----------------------------------------------------
//
// Permanently deletes a vehicle and everything filed under it. D1 cascades
// the documents/scans/transfer/history rows automatically (see the foreign
// keys in migrations/0001_init.sql and 0008_vehicle_transfers.sql); R2
// objects (the cover photo and every uploaded document) are not cascaded
// and are deleted here, best-effort, before the D1 row goes. Blocked while
// a transfer is pending so a vehicle mid-handover can't vanish out from
// under the incoming owner.

function removeVehiclePage(vehicle: Vehicle, pending: boolean): string {
    const blocked = pending
        ? `<div class="error">This vehicle has a pending ownership transfer. Cancel the transfer before removing the vehicle.</div>`
        : "";
    return `
    <div style="width:100%;max-width:460px">
      <div style="font-family:var(--font-display);font-size:24px;margin-bottom:10px">Remove vehicle</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${esc(vehicle.make)} ${esc(vehicle.model)} &middot; ${esc(vehicle.registration_number)}</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:24px">This permanently deletes this vehicle's Moto ID record, including every service document, invoice and photo on file. Its Moto ID number will stop resolving on the public verify page. This cannot be undone, and no vehicle credit is refunded.</div>
      ${blocked}
      ${
          pending
              ? `<a href="/vehicles/${vehicle.id}" class="btn btn-outline" style="display:block;text-align:center">&larr; Back to vehicle</a>`
              : `<form method="post" action="/vehicles/${vehicle.id}/remove">
                   <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px;background:oklch(45% 0.18 25)">Permanently remove this vehicle</button>
                 </form>
                 <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to vehicle</a>`
      }
    </div>`;
}

vehicles.get("/vehicles/:id/remove", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();
    const pending = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
    return c.html(
        appShell(
            "Remove vehicle — Moto ID",
            `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Remove vehicle`,
            removeVehiclePage(vehicle, !!pending),
            user
        )
    );
});

vehicles.post("/vehicles/:id/remove", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();

    const pending = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
    if (pending) return c.redirect(`/vehicles/${vehicle.id}/remove`);

    if (c.env.DOCS) {
        if (vehicle.photo_r2_key) {
            try {
                await c.env.DOCS.delete(vehicle.photo_r2_key);
            } catch {
                // best-effort — a leftover R2 object is harmless once the vehicle row is gone
            }
        }
        const docs = await listAllDocumentsForVehicle(c.env.DB, vehicle.id);
        for (const doc of docs) {
            try {
                await c.env.DOCS.delete(doc.r2_key);
            } catch {
                // best-effort, same as above
            }
        }
    }

    await deleteVehicle(c.env.DB, vehicle.id);
    return c.redirect(`/dashboard`);
});

function historyPage(vehicle: Vehicle, history: Awaited<ReturnType<typeof getOwnershipHistory>>, originalOwnerName: string): string {
    const rows = [
        { label: `Registered by ${esc(originalOwnerName)}`, date: vehicle.created_at },
        ...history.map((h) => ({ label: `Transferred to ${esc(h.to_name)}`, date: h.transferred_at })),
    ];
    return `
    <div style="max-width:520px">
      <div style="font-family:var(--font-display);font-size:24px;margin-bottom:4px">Ownership history</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${esc(vehicle.make)} ${esc(vehicle.model)} &middot; ${esc(vehicle.registration_number)}</div>
      <div style="border:1px solid var(--hairline)">
        ${rows
            .map(
                (r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;${i < rows.length - 1 ? "border-bottom:1px solid var(--hairline)" : ""}">
            <div style="font-size:13.5px">${r.label}</div>
            <div style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-subtle);white-space:nowrap">${new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>`
            )
            .join("")}
      </div>
      <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted);margin-top:24px">&larr; Back to vehicle</a>
    </div>`;
}

vehicles.get("/vehicles/:id/history", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await requireOwnedVehicle(c);
    if (!vehicle) return c.notFound();
    const history = await getOwnershipHistory(c.env.DB, vehicle.id);
    const originalOwnerName = history.length > 0 ? history[0].from_name ?? "a previous owner" : user.name;
    return c.html(
        appShell(
            "Ownership history — Moto ID",
            `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Ownership history`,
            historyPage(vehicle, history, originalOwnerName),
            user
        )
    );
});

function transferInvalidPage(): string {
    return `
    <div style="width:100%;max-width:420px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">OWNERSHIP TRANSFER</div>
      <div style="font-family:var(--font-display);font-size:26px;line-height:1.25;margin-bottom:24px">This invitation<br>isn't available.</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:28px">This transfer link is invalid, has expired, or has already been used. If you're expecting a vehicle, ask the seller to send a new invitation.</div>
      <a href="/dashboard" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">Go to My Collection</a>
    </div>`;
}

function transferInviteForm(opts: {
    token: string;
    vehicle: Vehicle;
    fromName: string;
    state: "needs_login" | "wrong_account" | "ready";
    toEmail: string;
    currentEmail?: string;
}): string {
    const v = opts.vehicle;
    const vehicleSummary = `${esc(v.make)} ${esc(v.model)}${v.year ? ` (${v.year})` : ""}`;
    const card = `
      <div style="border:1px solid var(--hairline);padding:18px 20px;margin-bottom:28px;background:var(--bg-panel)">
        <div style="font-weight:600;font-size:14.5px;margin-bottom:4px">${vehicleSummary}</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-subtle)">${esc(v.registration_number)} &middot; No. ${esc(v.moto_id_number)}</div>
      </div>`;
    const intro = `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:22px"><strong style="color:var(--ink)">${esc(opts.fromName)}</strong> wants to transfer this Moto ID record to you. It's free, and includes the full service history, invoices and photos already on file.</div>`;
    const header = `
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">OWNERSHIP TRANSFER</div>
      <div style="font-family:var(--font-display);font-size:26px;line-height:1.25;margin-bottom:24px">You've been offered<br>a vehicle.</div>`;

    if (opts.state === "needs_login") {
        const next = encodeURIComponent(`/transfer/${opts.token}`);
        return `
        <div style="width:100%;max-width:420px">
          ${header}
          ${intro}
          ${card}
          <div style="font-size:13px;color:var(--ink-muted);margin-bottom:20px">Sign in or create an account with <strong style="color:var(--ink)">${esc(opts.toEmail)}</strong> to accept.</div>
          <a href="/login?next=${next}" class="btn btn-solid" style="display:block;text-align:center;border:none;margin-bottom:12px">Sign in</a>
          <a href="/signup?next=${next}&email=${encodeURIComponent(opts.toEmail)}" class="btn btn-outline" style="display:block;text-align:center">Create an account</a>
        </div>`;
    }

    if (opts.state === "wrong_account") {
        return `
        <div style="width:100%;max-width:420px">
          ${header}
          ${intro}
          ${card}
          <div style="font-size:13px;color:var(--ink-muted);margin-bottom:20px">This invitation was sent to <strong style="color:var(--ink)">${esc(opts.toEmail)}</strong>, but you're signed in as ${esc(opts.currentEmail ?? "")}. Sign out and sign in with the correct email to accept it.</div>
          <form method="post" action="/logout">
            <button type="submit" class="btn btn-outline" style="width:100%">Sign out</button>
          </form>
        </div>`;
    }

    return `
    <div style="width:100%;max-width:420px">
      ${header}
      ${intro}
      ${card}
      <form method="post" action="/transfer/${opts.token}/accept" style="margin-bottom:12px">
        <button type="submit" class="btn btn-solid" style="width:100%;border:none">Accept transfer</button>
      </form>
      <form method="post" action="/transfer/${opts.token}/decline">
        <button type="submit" style="width:100%;border:none;background:none;padding:10px;font-size:13px;color:var(--ink-subtle);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Decline</button>
      </form>
    </div>`;
}

vehicles.get("/transfer/:token", async (c) => {
    const token = c.req.param("token");
    const transfer = await getValidVehicleTransfer(c.env.DB, token);
    if (!transfer) return c.html(authShell("Ownership transfer — Moto ID", transferInvalidPage()), 404);

    const vehicle = await getVehicleById(c.env.DB, transfer.vehicle_id);
    const fromUser = await getUserById(c.env.DB, transfer.from_user_id);
    if (!vehicle || !fromUser) return c.html(authShell("Ownership transfer — Moto ID", transferInvalidPage()), 404);

    const user = c.get("user");
    const state = !user ? "needs_login" : user.email.toLowerCase() !== transfer.to_email.toLowerCase() ? "wrong_account" : "ready";

    return c.html(
        authShell(
            "Ownership transfer — Moto ID",
            transferInviteForm({ token, vehicle, fromName: fromUser.name, state, toEmail: transfer.to_email, currentEmail: user?.email })
        )
    );
});

vehicles.post("/transfer/:token/accept", async (c) => {
    const token = c.req.param("token");
    const user = c.get("user");
    if (!user) return c.redirect(`/login?next=${encodeURIComponent(`/transfer/${token}`)}`);

    const transfer = await getValidVehicleTransfer(c.env.DB, token);
    if (!transfer) return c.html(authShell("Ownership transfer — Moto ID", transferInvalidPage()), 404);

    if (user.email.toLowerCase() !== transfer.to_email.toLowerCase()) {
        const vehicle = await getVehicleById(c.env.DB, transfer.vehicle_id);
        const fromUser = await getUserById(c.env.DB, transfer.from_user_id);
        if (!vehicle || !fromUser) return c.html(authShell("Ownership transfer — Moto ID", transferInvalidPage()), 404);
        return c.html(
            authShell(
                "Ownership transfer — Moto ID",
                transferInviteForm({ token, vehicle, fromName: fromUser.name, state: "wrong_account", toEmail: transfer.to_email, currentEmail: user.email })
            ),
            403
        );
    }

    await acceptVehicleTransfer(c.env.DB, transfer, user);
    return c.redirect(`/vehicles/${transfer.vehicle_id}`);
});

vehicles.post("/transfer/:token/decline", async (c) => {
    const token = c.req.param("token");
    const user = c.get("user");
    if (!user) return c.redirect(`/login?next=${encodeURIComponent(`/transfer/${token}`)}`);

    const transfer = await getValidVehicleTransfer(c.env.DB, token);
    if (transfer && user.email.toLowerCase() === transfer.to_email.toLowerCase()) {
        await declineVehicleTransfer(c.env.DB, token);
    }
    return c.redirect("/dashboard");
});

