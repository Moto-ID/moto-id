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
    syncMotHistoryForVehicle,
    getMotTestsForVehicle,
    getDefectsForTests,
    type Vehicle,
    type MotTestRow,
    type MotDefectRow,
} from "../lib/db";
import { sendOrderNotificationEmail, sendOwnershipTransferEmail } from "../lib/email";
import { lookupVehicleByRegistration, DvsaNotConfiguredError, DvsaNotFoundError, type DvsaVehicle } from "../lib/dvsa";

// Shared by both the registration form's live auto-fill and the
// post-registration/manual-refresh sync below — one DVSA lookup, used two
// ways. Kept here (rather than in dvsa.ts) since converting a DvsaVehicle
// into the shape syncMotHistoryForVehicle wants is app-specific, not part
// of the API client itself.
// Guards every read of the mot_tests/mot_defects tables against migration
// 0010 not having been run yet on this database (D1 migrations are applied
// manually — see the project's deployment notes). Without this, every
// vehicle page would 500 for every user the moment this feature's code
// deployed, ahead of the migration actually being run. Once the migration
// is applied this is a no-op — it only ever catches the "no such table"
// case.
async function getMotTestsSafely(db: D1Database, vehicleId: string): Promise<MotTestRow[]> {
  try {
    return await getMotTestsForVehicle(db, vehicleId);
  } catch (err) {
    console.error("getMotTestsForVehicle failed (has migration 0010 been run?):", err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function syncVehicleFromDvsa(db: D1Database, vehicleId: string, dvsa: DvsaVehicle): Promise<void> {
  await syncMotHistoryForVehicle(db, vehicleId, {
    fuelType: dvsa.fuelType,
    motDueDate: dvsa.motTests[0]?.expiryDate ?? null,
    tests: dvsa.motTests.map((t) => ({
      motTestNumber: t.motTestNumber,
      completedDate: t.completedDate,
      expiryDate: t.expiryDate,
      testResult: t.testResult,
      odometerValue: t.odometerValue,
      odometerUnit: t.odometerUnit,
      odometerResultType: t.odometerResultType,
      dataSource: t.dataSource,
      defects: t.defects,
    })),
  });
}

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

          <script>
            // As soon as a plausible-looking UK registration number is typed,
            // ask the server to look it up against the DVSA MOT History API
            // and fill in make/model/colour/year automatically — still fully
            // editable afterwards, since DVSA doesn't know everything (e.g.
            // a recent respray) and this is only ever a convenience. Debounced
            // so it doesn't fire a lookup on every keystroke, and it never
            // blocks typing or submitting the form.
            // Wrapped in DOMContentLoaded because this script tag sits above
            // the registration-number field in the markup — without this,
            // document.getElementById('registrationNumber') runs before that
            // element has been parsed yet, silently returns null, and the
            // whole feature no-ops with no error anywhere to notice it by.
            document.addEventListener('DOMContentLoaded', function () {
              var regInput = document.getElementById('registrationNumber');
              var statusEl = document.getElementById('dvsaLookupStatus');
              var makeInput = document.getElementById('vehicleMake');
              var modelInput = document.getElementById('vehicleModel');
              var colourInput = document.getElementById('vehicleColour');
              var yearInput = document.getElementById('vehicleYear');
              if (!regInput || !statusEl) return;

              var timer = null;
              var lastLookedUp = '';

              function setStatus(text, isError) {
                statusEl.textContent = text;
                statusEl.style.color = isError ? 'oklch(45% 0.18 25)' : 'var(--ink-subtle)';
              }

              function runLookup() {
                var reg = regInput.value.replace(/\\s+/g, '').toUpperCase();
                if (reg.length < 3 || reg === lastLookedUp) return;
                lastLookedUp = reg;
                setStatus('Looking up ' + reg + ' with the DVSA\\u2026', false);
                fetch('/register-vehicle/dvsa-lookup?registration=' + encodeURIComponent(reg))
                  .then(function (res) { return res.json(); })
                  .then(function (data) {
                    if (regInput.value.replace(/\\s+/g, '').toUpperCase() !== reg) return; // typed on since
                    if (!data.ok) {
                      // Not found is a normal outcome (a brand-new or non-GB
                      // vehicle), not an error — shown in the same neutral
                      // tone as everything else here, never red.
                      setStatus(data.reason === 'not_found' ? 'No DVSA record found \\u2014 enter the details manually.' : '', false);
                      return;
                    }
                    var filled = [];
                    if (data.make && makeInput && !makeInput.value) { makeInput.value = data.make; filled.push('make'); }
                    if (data.model && modelInput && !modelInput.value) { modelInput.value = data.model; filled.push('model'); }
                    if (data.colour && colourInput && !colourInput.value) { colourInput.value = data.colour; filled.push('colour'); }
                    if (data.year && yearInput && !yearInput.value) { yearInput.value = data.year; filled.push('year'); }
                    setStatus(filled.length ? 'Filled in ' + filled.join(', ') + ' from the DVSA.' : 'Found on the DVSA \\u2014 nothing new to fill in.', false);
                  })
                  .catch(function () { setStatus('', false); });
              }

              regInput.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(runLookup, 700);
              });
            });
          </script>

          <div style="display:flex;flex-direction:column;gap:24px;margin-bottom:34px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
              <div class="field" style="margin-bottom:0">
                            <label>REGISTRATION NUMBER</label>
                <input type="text" name="registrationNumber" id="registrationNumber" class="mono" value="${esc(v.registrationNumber ?? "")}" required style="text-transform:uppercase" autocomplete="off">
                <div id="dvsaLookupStatus" style="font-size:11px;color:var(--ink-subtle);margin-top:6px;min-height:14px"></div>
                            </div>
                            <div class="field" style="margin-bottom:0">
                                          <label>YEAR</label>
                              <input type="number" name="year" id="vehicleYear" class="mono" value="${esc(v.year ?? "")}" min="1900" max="2100">
                                          </div>
                                        </div>
                                        <div class="field" style="margin-bottom:0">
                                                    <label>VIN</label>
                                          <input type="text" name="vin" class="mono" value="${esc(v.vin ?? "")}" required style="text-transform:uppercase">
                                                    </div>
                                                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
                                                      <div class="field" style="margin-bottom:0">
                                                                    <label>MAKE</label>
                                                        <input type="text" name="make" id="vehicleMake" value="${esc(v.make ?? "")}" required>
                                                                  </div>
                                                                  <div class="field" style="margin-bottom:0">
                                                                                <label>MODEL</label>
                                                                    <input type="text" name="model" id="vehicleModel" value="${esc(v.model ?? "")}" required>
                                                                              </div>
                                                                            </div>
                                                                            <div class="field" style="margin-bottom:0">
                                                                              <label>COLOUR (OPTIONAL)</label>
                                                                              <input type="text" name="colour" id="vehicleColour" value="${esc(v.colour ?? "")}">
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

// Live auto-fill helper for the registration form (see the inline script in
// registerVehicleForm above). Deliberately returns 200 with {ok:false} for
// every "nothing to fill in" case — not found, not configured, API error —
// rather than an HTTP error status, since none of those should ever be
// treated as a bug by the page: they just mean the form stays manual for
// this vehicle. Requires auth only (not a vehicle credit) since looking
// something up isn't the gated action — registering it still is.
vehicles.get("/register-vehicle/dvsa-lookup", requireAuth, async (c) => {
  const registration = c.req.query("registration") ?? "";
  if (!registration.trim()) return c.json({ ok: false, reason: "empty" });
  try {
    const dvsa = await lookupVehicleByRegistration(c.env, registration);
    const year = dvsa.registrationDate ? new Date(dvsa.registrationDate).getFullYear() : null;
    return c.json({
      ok: true,
      make: dvsa.make,
      model: dvsa.model,
      colour: dvsa.colour,
      year: Number.isFinite(year) ? year : null,
    });
  } catch (err) {
    if (err instanceof DvsaNotFoundError) return c.json({ ok: false, reason: "not_found" });
    if (err instanceof DvsaNotConfiguredError) return c.json({ ok: false, reason: "not_configured" });
    console.error("DVSA lookup failed:", err instanceof Error ? err.message : String(err));
    return c.json({ ok: false, reason: "error" });
  }
});

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

                                                                                            // Pull in this vehicle's MOT history from the DVSA right away, so the
                                                                                            // MOT History folder and mileage graph are already populated the
                                                                                            // first time the owner opens the vehicle page — not just after they
                                                                                            // notice it's empty and click "Refresh". Best-effort: DVSA secrets
                                                                                            // not being configured yet, or DVSA simply having no record for this
                                                                                            // registration, must never block registration itself.
                                                                                            try {
                                                                                              const dvsa = await lookupVehicleByRegistration(c.env, vehicle.registration_number);
                                                                                              await syncVehicleFromDvsa(c.env.DB, vehicle.id, dvsa);
                                                                                            } catch (err) {
                                                                                              if (!(err instanceof DvsaNotFoundError) && !(err instanceof DvsaNotConfiguredError)) {
                                                                                                console.error("DVSA sync at registration failed:", err instanceof Error ? err.message : String(err));
                                                                                              }
                                                                                            }

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
                                                                                            const mot = await getMotTestsSafely(c.env.DB, vehicle.id);
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
                                                                                                        ${vehicle.fuel_type ? `<div style="display:flex;justify-content:space-between;margin-top:10px">
                                                                                              <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.08em">FUEL TYPE</div>
                                                                                              <div style="font-size:12px">${esc(vehicle.fuel_type)}</div>
                                                                                                        </div>` : ""}
                                                                                                        ${vehicle.mot_due_date ? `<div style="display:flex;justify-content:space-between;margin-top:10px">
                                                                                              <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.08em">MOT DUE</div>
                                                                                              <div style="font-size:12px">${formatMotDate(vehicle.mot_due_date)}</div>
                                                                                                        </div>` : ""}
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
                                                                                                                                      ${folderCard(`/vehicles/${vehicle.id}/mot-history`, `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/><path d="M8.5 12.5 11 15l5-6"/></svg>`, "MOT History", mot.length, mot.length ? `last checked ${vehicle.mot_last_synced_at ? new Date(vehicle.mot_last_synced_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""}` : "")}
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

// --- DVSA MOT history ---------------------------------------------------
//
// See migrations/0010_dvsa_mot_history.sql, src/lib/dvsa.ts and
// syncVehicleFromDvsa above. Each MOT test is rendered as a certificate-
// style record card (DVSA's API returns structured data only — there's no
// actual scan/PDF behind any of these, so this is built from that data
// rather than a literal document), plus a mileage-over-time chart.

function formatMotDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatOdometer(value: number | null, unit: string | null): string {
  if (value === null) return "Not recorded";
  return `${value.toLocaleString("en-GB")} ${unit === "km" ? "km" : "mi"}`;
}

function motTestCard(test: MotTestRow, defects: MotDefectRow[]): string {
  const passed = (test.test_result ?? "").toUpperCase() === "PASSED";
  const resultColor = passed ? "oklch(50% 0.14 142)" : "oklch(45% 0.18 25)";
  const defectRows = defects
    .map((d) => {
      const severe = d.dangerous || d.type === "DANGEROUS" || d.type === "MAJOR" || d.type === "FAIL";
      return `<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--hairline);font-size:12px;line-height:1.5">
        <div style="flex:none;font-size:9.5px;letter-spacing:0.06em;color:${severe ? resultColor : "var(--ink-subtle)"};padding-top:2px;white-space:nowrap">${esc(d.type ?? "NOTE")}</div>
        <div style="color:var(--ink-muted)">${esc(d.text)}</div>
      </div>`;
    })
    .join("");

  return `
  <div style="border:1px solid var(--hairline);background:var(--bg);padding:20px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-weight:600;font-size:14.5px;margin-bottom:2px">${formatMotDate(test.completed_date)}</div>
        <div style="font-size:11px;color:var(--ink-subtle)">MOT test no. <span class="mono">${esc(test.mot_test_number)}</span></div>
      </div>
      <div class="badge" style="border-color:${resultColor};color:${resultColor}">
        <div class="dot" style="background:${resultColor}"></div>${passed ? "PASS" : "FAIL"}
      </div>
    </div>
    <div style="display:flex;gap:28px;font-size:12.5px;margin-bottom:${defectRows ? "4px" : "0"}">
      <div><div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:3px">MILEAGE</div>${formatOdometer(test.odometer_value, test.odometer_unit)}</div>
      <div><div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:3px">EXPIRY</div>${formatMotDate(test.expiry_date)}</div>
    </div>
    ${defectRows}
  </div>`;
}

// A simple time-scaled SVG line chart of odometer readings across every
// test that has one — no charting library needed for a handful of points
// rendered server-side. Returns a placeholder message instead of a chart
// when there are fewer than two usable readings (a single point can't show
// a trend).
function mileageChart(tests: MotTestRow[]): string {
  const points = tests
    .filter((t) => t.odometer_value !== null && t.completed_date)
    .map((t) => ({ date: new Date(t.completed_date as string), value: t.odometer_value as number, unit: t.odometer_unit }))
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (points.length < 2) {
    return `<div style="padding:28px 22px;font-size:12.5px;color:var(--ink-subtle);border:1px solid var(--hairline)">Not enough mileage readings yet to chart a history — this fills in as more MOT tests are recorded.</div>`;
  }

  const width = 640;
  const height = 240;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minT = points[0].date.getTime();
  const maxT = points[points.length - 1].date.getTime();
  const spanT = Math.max(maxT - minT, 1);
  // Padded around the actual readings (not forced to a zero baseline) —
  // mileage across a vehicle's MOT history is usually a tight, high range
  // (e.g. 80,000-85,000), and zero-anchoring a line chart like this would
  // flatten the very trend/inconsistency the chart exists to show.
  const values = points.map((p) => p.value);
  const rawMinV = Math.min(...values);
  const rawMaxV = Math.max(...values);
  const padV = Math.max((rawMaxV - rawMinV) * 0.12, 50);
  const minV = Math.max(rawMinV - padV, 0);
  const maxV = rawMaxV + padV;
  const spanV = Math.max(maxV - minV, 1);

  const x = (t: number) => padLeft + ((t - minT) / spanT) * plotW;
  const y = (v: number) => padTop + plotH - ((v - minV) / spanV) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date.getTime()).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const unit = points[points.length - 1].unit === "km" ? "km" : "mi";

  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const gridlines = yTicks
    .map(
      (v) => `
    <line x1="${padLeft}" y1="${y(v).toFixed(1)}" x2="${width - padRight}" y2="${y(v).toFixed(1)}" stroke="var(--hairline)" stroke-width="1"/>
    <text x="${padLeft - 10}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--ink-subtle)">${Math.round(v).toLocaleString("en-GB")}</text>`
    )
    .join("");

  // Date labels: every point if there are few enough, otherwise just the
  // first and last, so labels never overlap.
  const labelPoints = points.length <= 6 ? points : [points[0], points[points.length - 1]];
  const dateLabels = labelPoints
    .map(
      (p) => `
    <text x="${x(p.date.getTime()).toFixed(1)}" y="${height - padBottom + 20}" text-anchor="middle" font-size="10" fill="var(--ink-subtle)">${esc(
        p.date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
      )}</text>`
    )
    .join("");

  // A visible 4px marker plus an invisible wider hit target (8px radius) for
  // each reading, with the real date/mileage carried as data attributes for
  // the hover tooltip below rather than relied on as the only access to that
  // value — every mark a label could reach is already on the axis, this is
  // just a precise read-out on demand.
  const dots = points
    .map((p) => {
      const cx = x(p.date.getTime()).toFixed(1);
      const cy = y(p.value).toFixed(1);
      const label = `${esc(p.date.toLocaleDateString("en-GB"))}: ${p.value.toLocaleString("en-GB")} ${unit}`;
      return `<g class="mot-point" data-label="${label}">
        <circle cx="${cx}" cy="${cy}" r="10" fill="transparent"/>
        <circle cx="${cx}" cy="${cy}" r="4" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/>
      </g>`;
    })
    .join("");

  return `
  <div style="border:1px solid var(--hairline);padding:18px 10px 6px;background:var(--bg);position:relative" id="mileageChartWrap">
    <div id="mileageTooltip" style="position:absolute;display:none;pointer-events:none;background:var(--ink);color:var(--bg);font-size:11px;padding:5px 9px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-100%);z-index:10"></div>
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block" role="img" aria-label="Mileage history, in ${unit}">
      ${gridlines}
      <path d="${linePath}" fill="none" stroke="var(--ink)" stroke-width="2"/>
      ${dots}
      ${dateLabels}
    </svg>
  </div>
  <script>
    (function () {
      var wrap = document.getElementById('mileageChartWrap');
      var tooltip = document.getElementById('mileageTooltip');
      if (!wrap || !tooltip) return;
      var svg = wrap.querySelector('svg');
      Array.prototype.slice.call(wrap.querySelectorAll('.mot-point')).forEach(function (point) {
        point.addEventListener('mouseenter', function () {
          var circle = point.querySelector('circle:last-child');
          var ptRect = circle.getBoundingClientRect();
          var wrapRect = wrap.getBoundingClientRect();
          tooltip.textContent = point.getAttribute('data-label');
          tooltip.style.left = (ptRect.left + ptRect.width / 2 - wrapRect.left) + 'px';
          tooltip.style.top = (ptRect.top - wrapRect.top - 8) + 'px';
          tooltip.style.display = 'block';
        });
        point.addEventListener('mouseleave', function () {
          tooltip.style.display = 'none';
        });
      });
    })();
  </script>`;
}

function motHistoryPage(vehicle: Vehicle, tests: MotTestRow[], defectsByTest: Map<string, MotDefectRow[]>): string {
  const cards = tests.length
    ? tests.map((t) => motTestCard(t, defectsByTest.get(t.id) ?? [])).join("")
    : `<div style="padding:28px 22px;font-size:12.5px;color:var(--ink-subtle);border:1px solid var(--hairline)">No MOT history on file yet. If this vehicle is over three years old, try refreshing — otherwise it simply hasn't had its first MOT yet.</div>`;

  const synced = vehicle.mot_last_synced_at
    ? `Last checked with the DVSA ${formatMotDate(vehicle.mot_last_synced_at)}`
    : "Not yet checked with the DVSA";

  return `
    <div style="max-width:720px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:6px">
        <div>
          <div style="font-family:var(--font-display);font-size:24px;margin-bottom:6px">MOT history</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">${esc(vehicle.make)} ${esc(vehicle.model)} &middot; ${esc(vehicle.registration_number)}</div>
        </div>
        <form method="post" action="/vehicles/${vehicle.id}/mot-history/refresh">
          <button type="submit" class="btn btn-outline" style="white-space:nowrap">Refresh MOT history</button>
        </form>
      </div>
      <div style="font-size:11.5px;color:var(--ink-subtle);margin-bottom:28px">${esc(synced)}${vehicle.fuel_type ? ` &middot; ${esc(vehicle.fuel_type)}` : ""}${vehicle.mot_due_date ? ` &middot; MOT due ${formatMotDate(vehicle.mot_due_date)}` : ""}</div>

      <div style="font-size:10px;letter-spacing:0.14em;color:var(--ink-subtle);margin-bottom:12px">MILEAGE HISTORY</div>
      ${mileageChart(tests)}

      <div style="font-size:10px;letter-spacing:0.14em;color:var(--ink-subtle);margin:32px 0 12px">TEST RECORDS</div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:28px">${cards}</div>

      <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to vehicle</a>
    </div>`;
}

vehicles.get("/vehicles/:id/mot-history", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();
  const tests = await getMotTestsSafely(c.env.DB, vehicle.id);
  let defectsByTest = new Map<string, MotDefectRow[]>();
  try {
    defectsByTest = await getDefectsForTests(c.env.DB, tests.map((t) => t.id));
  } catch (err) {
    console.error("getDefectsForTests failed (has migration 0010 been run?):", err instanceof Error ? err.message : String(err));
  }
  return c.html(
    appShell(
      "MOT history — Moto ID",
      `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / MOT history`,
      motHistoryPage(vehicle, tests, defectsByTest),
      user
    )
  );
});

vehicles.post("/vehicles/:id/mot-history/refresh", requireAuth, async (c) => {
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();
  try {
    const dvsa = await lookupVehicleByRegistration(c.env, vehicle.registration_number);
    await syncVehicleFromDvsa(c.env.DB, vehicle.id, dvsa);
  } catch (err) {
    // Nothing sensible to show inline here without a flash-message system —
    // a failed refresh just leaves the existing data in place (an
    // unconfigured/not-found/erroring lookup is never worse than what was
    // already on file), and gets logged so it's visible in `wrangler tail`.
    console.error("DVSA manual refresh failed:", err instanceof Error ? err.message : String(err));
  }
  return c.redirect(`/vehicles/${vehicle.id}/mot-history`);
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

