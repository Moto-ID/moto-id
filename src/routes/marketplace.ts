import { Hono } from "hono";
import type { Env } from "../types";
import type { Vehicle } from "../lib/db";
import { marketingShell, authShell, appShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth, getClientIp } from "../lib/auth";
import { serveHeaders } from "../lib/files";
import {
  getVehicleById,
  getUserById,
  countDocumentsByFolder,
  getOwnershipHistory,
  getPendingTransferForVehicle,
  createListing,
  getListingById,
  getLatestListingForVehicle,
  listActiveListings,
  setListingStatus,
  setListingPaid,
  updateListingDetails,
  addListingInquiry,
  checkRateLimit,
  recordAuthAttempt,
  listPublicDocuments,
  getPublicDocument,
  getDefectsForTests,
  type Listing,
  type MotDefectRow,
} from "../lib/db";
import { createCheckoutSession, retrieveCheckoutSession } from "../lib/stripe";
import { sendListingInquiryEmail } from "../lib/email";
import { getMotTestsSafely, formatMotDate, motTestCard, mileageChart } from "../lib/mot";

export const marketplace = new Hono<Env>();

// Flat, one-time fee to publish a listing — matches the pricing shown on
// /pricing (kit £29, additional vehicle £35, replacement plate £18). A
// listing stays live until the owner marks it sold or removes it; there's
// no expiry and no success-fee-on-sale, which keeps the Stripe/webhook
// plumbing to a single checkout rather than a second payment later.
const LISTING_FEE_PENCE = 1500;

function formatPrice(pence: number): string {
  const pounds = pence / 100;
  return pounds % 1 === 0
    ? `£${pounds.toLocaleString("en-GB")}`
    : `£${pounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nl2br(text: string): string {
  return esc(text).replace(/\n/g, "<br>");
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireOwnedVehicle(c: any): Promise<Vehicle | null> {
  const user = c.get("user")!;
  const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
  if (!vehicle || vehicle.user_id !== user.id) return null;
  return vehicle;
}

// --- Public: browse + listing detail + inquiry --------------------------

marketplace.get("/marketplace", async (c) => {
  const typeParam = c.req.query("type");
  const vehicleType = typeParam === "car" || typeParam === "motorcycle" ? typeParam : undefined;
  const listings = await listActiveListings(c.env.DB, vehicleType);

  const filterTab = (href: string, label: string, isActive: boolean) =>
    `<a href="${href}" style="font-size:12px;letter-spacing:0.06em;padding:8px 16px;border:1px solid var(--ink);${
      isActive ? "background:var(--ink);color:var(--bg)" : "color:var(--ink)"
    }">${label}</a>`;

  const cards = listings
    .map((l) => {
      const subtitle = [l.year, l.colour].filter(Boolean).join(" · ");
      const thumb = l.photo_r2_key
        ? `<img src="/marketplace/${l.id}/photo" alt="${esc(l.make)} ${esc(l.model)}" style="width:100%;height:100%;object-fit:cover;display:block">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--ink-subtle);letter-spacing:0.06em">NO PHOTO</div>`;
      return `
      <a href="/marketplace/${l.id}" class="panel" style="display:block;border:1px solid var(--hairline)">
        <div style="height:170px;background:var(--bg-panel);border-bottom:1px solid var(--hairline)">${thumb}</div>
        <div style="padding:18px 20px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
            <div style="font-weight:600;font-size:14.5px">${esc(l.make)} ${esc(l.model)}</div>
            <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">${formatPrice(l.price_pence)}</div>
          </div>
          <div style="font-size:12px;color:var(--ink-subtle);margin-bottom:10px">${esc(subtitle || "—")}${l.location ? ` &middot; ${esc(l.location)}` : ""}</div>
          <div class="badge" style="font-size:9px">AUTHENTICATED &middot; No.&nbsp;${esc(l.moto_id_number)}</div>
        </div>
      </a>`;
    })
    .join("");

  const body = `
    <div style="padding:80px 56px 56px;text-align:center">
      <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle);margin-bottom:22px">THE MARKETPLACE</div>
      <div style="font-family:var(--font-display);font-size:min(38px,8vw);line-height:1.3;max-width:640px;margin:0 auto 16px">Vehicles with a verified history.</div>
      <div style="font-size:14px;color:var(--ink-muted);max-width:480px;margin:0 auto">Every listing here carries its own Moto ID &mdash; a record built and dated by its owner, not a seller's word.</div>
    </div>

    <div style="max-width:1080px;margin:0 auto 32px;padding:0 56px;display:flex;gap:10px;justify-content:center">
      ${filterTab("/marketplace", "ALL", !vehicleType)}
      ${filterTab("/marketplace?type=car", "CARS", vehicleType === "car")}
      ${filterTab("/marketplace?type=motorcycle", "MOTORCYCLES", vehicleType === "motorcycle")}
    </div>

    <div style="max-width:1080px;margin:0 auto 100px;padding:0 56px">
      ${
        listings.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px">${cards}</div>`
          : `<div style="text-align:center;padding:60px 0;font-size:13.5px;color:var(--ink-subtle)">No vehicles listed for sale right now &mdash; check back soon.</div>`
      }
    </div>
  `;

  return c.html(marketingShell("Marketplace — Moto ID", body, { activeNav: "marketplace" }));
});

function listingUnavailablePage(): string {
  return `<!doctype html>
  <html lang="en">
  <head><title>Listing not available — Moto ID</title></head>
  <body style="padding:60px 22px;text-align:center;font-family:sans-serif">
    <div style="font-weight:600;font-size:10.5px;letter-spacing:0.18em;margin-bottom:40px">MOTO ID</div>
    <div style="font-size:18px;margin-bottom:12px">This listing isn't available</div>
    <div style="font-size:13px;color:#888;max-width:340px;margin:0 auto 24px">It may have sold, been removed by its owner, or never existed.</div>
    <a href="/marketplace" style="font-size:13px">&larr; Back to the marketplace</a>
  </body>
  </html>`;
}

marketplace.get("/marketplace/:id", async (c) => {
  const listing = await getListingById(c.env.DB, c.req.param("id"));
  if (!listing || listing.status !== "active") return c.html(listingUnavailablePage(), 404);

  const vehicle = await getVehicleById(c.env.DB, listing.vehicle_id);
  if (!vehicle) return c.html(listingUnavailablePage(), 404);

  const counts = await countDocumentsByFolder(c.env.DB, vehicle.id);
  const serviceRecords = counts.service + counts.invoice;
  const ownershipHistory = await getOwnershipHistory(c.env.DB, vehicle.id);
  const ownerCount = 1 + ownershipHistory.length;
  const subtitle = [vehicle.year, vehicle.colour].filter(Boolean).join(" · ");

  const sent = c.req.query("sent") === "1";
  const error = c.req.query("error");

  const photoBlock = vehicle.photo_r2_key
    ? `<img src="/marketplace/${listing.id}/photo" alt="${esc(vehicle.make)} ${esc(vehicle.model)}" style="width:100%;aspect-ratio:16/10;object-fit:cover;display:block;border:1px solid var(--hairline)">`
    : `<div style="width:100%;aspect-ratio:16/10;background:var(--bg-panel);border:1px solid var(--hairline);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--ink-subtle);letter-spacing:0.06em">NO PHOTO SUPPLIED</div>`;

  // The whole Photos folder from the vehicle's own Moto ID profile is shown
  // here too, not just the single cover photo above — but only the photos
  // the owner has already marked public (same is_public flag the verify
  // page honours), never a private upload. A listing is already public by
  // definition, but the gallery still respects whatever the owner ticked on
  // each individual photo, same as everywhere else on the site.
  const publicDocs = await listPublicDocuments(c.env.DB, vehicle.id);
  const publicPhotos = publicDocs.filter((d) => d.folder === "photo" && d.content_type?.startsWith("image/"));
  const gallerySection =
    publicPhotos.length > 0
      ? `
          <div style="margin-top:28px">
            <div style="font-weight:600;font-size:13px;margin-bottom:12px">Photos (${publicPhotos.length})</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px">
              ${publicPhotos
                .map(
                  (d) => `
              <a href="/marketplace/${listing.id}/documents/${d.id}" target="_blank">
                <img src="/marketplace/${listing.id}/documents/${d.id}" alt="${esc(d.filename)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;border:1px solid var(--hairline)">
              </a>`
                )
                .join("")}
            </div>
          </div>`
      : "";

  // MOT history and mileage history on a marketplace listing honour exactly
  // the same opt-in flags as the public /verify page (vehicle.mot_history_public
  // / vehicle.mileage_public — see migrations/0011_mot_visibility_and_reminders.sql)
  // rather than being shown just because the listing itself is public: a
  // seller who's kept either private on their own Moto ID profile sees that
  // choice carried through here unchanged. Fetched once and shared between
  // both sections, same as verify.ts, and only when at least one is on. Unlike
  // verify.ts (which lists the full history), a listing only ever shows the
  // single most recent test — getMotTestsSafely already orders newest first,
  // so that's just motTests[0] — a prospective buyer cares whether it's
  // currently roadworthy, not a multi-year certificate archive; the mileage
  // chart below still plots the full history motTests carries, unaffected by
  // this.
  const motTests = vehicle.mot_history_public || vehicle.mileage_public ? await getMotTestsSafely(c.env.DB, vehicle.id) : [];
  const latestMotTest = motTests[0] ?? null;
  let motDefectsByTest = new Map<string, MotDefectRow[]>();
  if (vehicle.mot_history_public && latestMotTest) {
    try {
      motDefectsByTest = await getDefectsForTests(c.env.DB, [latestMotTest.id]);
    } catch (err) {
      console.error("getDefectsForTests failed on marketplace listing (has migration 0010 been run?):", err instanceof Error ? err.message : String(err));
    }
  }

  const motHistorySection = vehicle.mot_history_public
    ? `
          <div style="margin-top:28px">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px;display:flex;align-items:center;justify-content:space-between;gap:12px">
              <span>Most recent MOT</span>
              ${vehicle.mot_due_date ? `<span style="font-size:11px;color:var(--ink-subtle);font-weight:400">MOT due ${formatMotDate(vehicle.mot_due_date)}</span>` : ""}
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
              ${
                latestMotTest
                  ? motTestCard(latestMotTest, motDefectsByTest.get(latestMotTest.id) ?? [])
                  : `<div style="font-size:12.5px;color:var(--ink-subtle)">No MOT history on file yet.</div>`
              }
            </div>
          </div>`
    : "";

  const mileageSection = vehicle.mileage_public
    ? `
          <div style="margin-top:28px">
            <div style="font-weight:600;font-size:13px;margin-bottom:12px">Mileage history</div>
            ${mileageChart(motTests)}
          </div>`
    : "";

  const body = `
    <div style="max-width:960px;margin:0 auto;padding:56px 56px 100px">
      <a href="/marketplace" style="font-size:12.5px;color:var(--ink-subtle);display:inline-block;margin-bottom:24px">&larr; Back to the marketplace</a>

      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:flex-start" class="listing-grid">
        <div>
          ${photoBlock}
          <div style="margin-top:28px">
            <div style="font-family:var(--font-display);font-size:28px;margin-bottom:6px">${esc(vehicle.make)} ${esc(vehicle.model)}${vehicle.year ? ` <span style="font-style:italic">(${vehicle.year})</span>` : ""}</div>
            <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:24px">${esc(subtitle || "—")}${listing.location ? ` &middot; ${esc(listing.location)}` : ""}</div>
            <div style="font-size:14px;color:var(--ink-muted);line-height:1.8">${nl2br(listing.description) || "<em>No further description provided.</em>"}</div>
          </div>
          ${gallerySection}
          ${motHistorySection}
          ${mileageSection}
        </div>

        <div>
          <div style="font-family:var(--font-display);font-size:34px;margin-bottom:20px">${formatPrice(listing.price_pence)}</div>

          <div style="border:1px solid var(--hairline);padding:22px;margin-bottom:22px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div class="badge" style="font-size:10px">AUTHENTICATED</div>
            </div>
            <div style="font-family:var(--font-mono);font-weight:700;font-size:14px;margin-bottom:16px">No.&nbsp;${esc(vehicle.moto_id_number)}</div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--hairline)">
              <span style="font-size:12px;color:var(--ink-muted)">Service &amp; invoice records</span>
              <span style="font-family:var(--font-mono);font-size:12px">${serviceRecords}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--hairline)">
              <span style="font-size:12px;color:var(--ink-muted)">Owners on record</span>
              <span style="font-family:var(--font-mono);font-size:12px">${ownerCount}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--hairline);margin-bottom:16px">
              <span style="font-size:12px;color:var(--ink-muted)">Registered since</span>
              <span style="font-family:var(--font-mono);font-size:12px">${new Date(vehicle.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span>
            </div>
            <a href="/verify/${esc(vehicle.moto_id_number)}" target="_blank" class="btn btn-outline" style="display:block;text-align:center;width:100%">View public verification record</a>
          </div>

          <div style="border:1px solid var(--hairline);padding:22px">
            <div style="font-weight:600;font-size:14px;margin-bottom:14px">Ask the seller</div>
            ${sent ? `<div style="font-size:13px;color:var(--ink-muted);background:var(--bg-panel);padding:12px 14px;margin-bottom:16px">Message sent &mdash; the seller will reply to you directly.</div>` : ""}
            ${error ? `<div class="error">${esc(error)}</div>` : ""}
            <form method="post" action="/marketplace/${listing.id}/inquire">
              <div class="field" style="margin-bottom:14px">
                <label>YOUR NAME</label>
                <input type="text" name="name" required>
              </div>
              <div class="field" style="margin-bottom:14px">
                <label>YOUR EMAIL</label>
                <input type="email" name="email" required autocomplete="email">
              </div>
              <div class="field" style="margin-bottom:16px">
                <label>MESSAGE</label>
                <textarea name="message" rows="4" required style="width:100%;resize:vertical;font-family:var(--font-body);font-size:13.5px;padding:10px 12px;border:1px solid var(--hairline-strong)"></textarea>
              </div>
              <button type="submit" class="btn btn-solid" style="width:100%;border:none">Send message</button>
            </form>
            <div style="font-size:11px;color:var(--ink-subtle);margin-top:12px;line-height:1.6">Your message goes straight to the seller's inbox. Your email address is never shown publicly.</div>
          </div>
        </div>
      </div>
    </div>
    <style>@media (max-width:760px){.listing-grid{grid-template-columns:1fr!important}}</style>
  `;

  return c.html(marketingShell(`${vehicle.make} ${vehicle.model} — Moto ID Marketplace`, body, { activeNav: "marketplace" }));
});

marketplace.get("/marketplace/:id/photo", async (c) => {
  const listing = await getListingById(c.env.DB, c.req.param("id"));
  if (!listing || listing.status !== "active" || !c.env.DOCS) return c.notFound();

  const vehicle = await getVehicleById(c.env.DB, listing.vehicle_id);
  if (!vehicle?.photo_r2_key) return c.notFound();

  const object = await c.env.DOCS.get(vehicle.photo_r2_key);
  if (!object) return c.notFound();

  const headers = serveHeaders(object.httpMetadata?.contentType ?? null);
  c.header("Content-Type", headers.contentType);
  c.header("Content-Disposition", headers.disposition);
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(object.body as any);
});

// Serves one photo from the vehicle's public Photos-folder gallery (see
// gallerySection above). Unauthenticated, same as every other public
// document route on the site — getPublicDocument only ever returns a row
// with is_public = 1, so a photo the owner hasn't marked public 404s here
// exactly as it does on the verify page, even though the listing itself is
// public. Real byte-sniffing via serveHeaders() matters even more on a
// route with no auth at all — it's what stops a mislabeled upload from
// executing as a page on this origin for an anonymous visitor.
marketplace.get("/marketplace/:id/documents/:docId", async (c) => {
  const listing = await getListingById(c.env.DB, c.req.param("id"));
  if (!listing || listing.status !== "active" || !c.env.DOCS) return c.notFound();

  const doc = await getPublicDocument(c.env.DB, listing.vehicle_id, c.req.param("docId"));
  if (!doc) return c.notFound();

  const object = await c.env.DOCS.get(doc.r2_key);
  if (!object) return c.notFound();

  const headers = serveHeaders(doc.content_type);
  c.header("Content-Type", headers.contentType);
  c.header("Content-Disposition", `${headers.disposition}; filename="${doc.filename.replace(/"/g, "")}"`);
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(object.body as any);
});

marketplace.post("/marketplace/:id/inquire", async (c) => {
  const listingId = c.req.param("id");
  const listing = await getListingById(c.env.DB, listingId);
  if (!listing || listing.status !== "active") return c.html(listingUnavailablePage(), 404);

  const ip = getClientIp(c);
  const rateOk = await checkRateLimit(c.env.DB, "listing_inquiry", `ip:${ip}`, 8, 30);
  await recordAuthAttempt(c.env.DB, "listing_inquiry", `ip:${ip}`);
  if (!rateOk) {
    return c.redirect(`/marketplace/${listingId}?error=${encodeURIComponent("Too many messages sent. Please wait a while and try again.")}`);
  }

  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim().slice(0, 4000);

  if (!name || !email || !message || !looksLikeEmail(email)) {
    return c.redirect(`/marketplace/${listingId}?error=${encodeURIComponent("Please fill in every field with a valid email address.")}`);
  }

  const saved = await addListingInquiry(c.env.DB, listingId, name, email, message);
  if (!saved) {
    return c.redirect(`/marketplace/${listingId}?error=${encodeURIComponent("Sorry, we couldn't send that right now. Please try again shortly.")}`);
  }

  try {
    const seller = await getUserById(c.env.DB, listing.user_id);
    const vehicle = await getVehicleById(c.env.DB, listing.vehicle_id);
    if (seller && vehicle) {
      const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
      await sendListingInquiryEmail(c.env, {
        sellerEmail: seller.email,
        buyerName: name,
        buyerEmail: email,
        message,
        listingTitle: `${vehicle.make} ${vehicle.model}`,
        listingUrl: `${origin}/marketplace/${listingId}`,
      });
    }
  } catch (err) {
    console.error("sendListingInquiryEmail failed:", err instanceof Error ? err.message : String(err));
  }

  return c.redirect(`/marketplace/${listingId}?sent=1`);
});

// --- Seller-facing: create / pay / manage a listing ----------------------

function sellForm(vehicle: Vehicle, opts: { error?: string; listing?: Listing; showHeader?: boolean; free?: boolean } = {}): string {
  const l = opts.listing;
  const header =
    opts.showHeader === false
      ? ""
      : `
    <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">LIST FOR SALE</div>
    <div style="font-family:var(--font-display);font-size:26px;margin-bottom:10px">${esc(vehicle.make)} ${esc(vehicle.model)}</div>
    <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:26px">${esc(vehicle.registration_number)} &middot; No.&nbsp;${esc(vehicle.moto_id_number)}</div>`;
  const feeNotice = opts.free
    ? `<div style="border:1px solid var(--hairline);padding:16px 18px;margin-bottom:26px;font-size:12.5px;color:var(--ink-muted);line-height:1.7">
      Your account lists for free — no listing fee. Your vehicle publishes on the marketplace immediately, with its Moto ID provenance — service records, ownership history — shown alongside it. It stays listed until you mark it sold or remove it.
    </div>`
    : `<div style="border:1px solid var(--hairline);padding:16px 18px;margin-bottom:26px;font-size:12.5px;color:var(--ink-muted);line-height:1.7">
      A one-time listing fee of <strong>${formatPrice(LISTING_FEE_PENCE)}</strong> publishes your vehicle on the public marketplace, with its Moto ID provenance — service records, ownership history — shown alongside it. It stays listed until you mark it sold or remove it.
    </div>`;
  const buttonLabel = opts.free ? "Publish listing — free" : `Continue to payment — ${formatPrice(LISTING_FEE_PENCE)}`;
  return `
  <div style="width:100%;max-width:480px">
    ${header}
    ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
    ${feeNotice}
    <form method="post" action="/vehicles/${vehicle.id}/sell">
      <div class="field">
        <label>ASKING PRICE (&pound;)</label>
        <input type="number" name="price" min="1" step="1" required value="${l ? (l.price_pence / 100).toString() : ""}">
      </div>
      <div class="field">
        <label>DESCRIPTION</label>
        <textarea name="description" rows="5" required style="width:100%;resize:vertical;font-family:var(--font-body);font-size:13.5px;padding:10px 12px;border:1px solid var(--hairline-strong)">${esc(l?.description ?? "")}</textarea>
      </div>
      <div class="field">
        <label>LOCATION <span style="color:var(--ink-subtle);font-weight:400">(region only — not a full address)</span></label>
        <input type="text" name="location" placeholder="e.g. Surrey, UK" value="${esc(l?.location ?? "")}">
      </div>
      <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">${buttonLabel}</button>
    </form>
    <a href="/vehicles/${vehicle.id}" style="display:block;text-align:center;font-size:13px;color:var(--ink-muted)">&larr; Back to vehicle</a>
  </div>`;
}

marketplace.get("/vehicles/:id/sell", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  const pendingTransfer = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
  const error = c.req.query("error");

  let body: string;

  if (listing?.status === "pending_payment") {
    const free = !!user.unlimited_vehicles;
    body = `
    <div style="width:100%;max-width:440px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">LIST FOR SALE</div>
      <div style="font-family:var(--font-display);font-size:24px;margin-bottom:22px">${free ? "Publish your listing." : "Complete payment to publish your listing."}</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:28px">${free ? "Your account lists for free — no listing fee. Publish to make it live on the marketplace." : `Your listing details are saved — pay the ${formatPrice(LISTING_FEE_PENCE)} listing fee to make it live on the marketplace.`}</div>
      ${error ? `<div class="error">${esc(error)}</div>` : ""}
      <form method="post" action="/vehicles/${vehicle.id}/sell/pay">
        <button type="submit" class="btn btn-solid" style="width:100%;border:none;margin-bottom:16px">${free ? "Publish listing — free" : `Continue to payment — ${formatPrice(LISTING_FEE_PENCE)}`}</button>
      </form>
      <form method="post" action="/vehicles/${vehicle.id}/sell/remove">
        <button type="submit" style="display:block;width:100%;text-align:center;border:none;background:none;padding:0;font-size:12.5px;color:var(--ink-subtle);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Cancel this listing</button>
      </form>
    </div>`;
  } else if (listing?.status === "active") {
    body = `
    <div style="width:100%;max-width:520px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">LISTED FOR SALE</div>
      <div style="font-family:var(--font-display);font-size:26px;margin-bottom:6px">${formatPrice(listing.price_pence)}</div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:24px">Live on the marketplace since ${listing.paid_at ? new Date(listing.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
      <a href="/marketplace/${listing.id}" target="_blank" class="btn btn-outline" style="display:block;text-align:center;margin-bottom:24px">View public listing</a>

      ${error ? `<div class="error">${esc(error)}</div>` : ""}
      <form method="post" action="/vehicles/${vehicle.id}/sell/edit" style="margin-bottom:28px">
        <div class="field">
          <label>ASKING PRICE (&pound;)</label>
          <input type="number" name="price" min="1" step="1" required value="${(listing.price_pence / 100).toString()}">
        </div>
        <div class="field">
          <label>DESCRIPTION</label>
          <textarea name="description" rows="5" required style="width:100%;resize:vertical;font-family:var(--font-body);font-size:13.5px;padding:10px 12px;border:1px solid var(--hairline-strong)">${esc(listing.description)}</textarea>
        </div>
        <div class="field">
          <label>LOCATION</label>
          <input type="text" name="location" value="${esc(listing.location ?? "")}">
        </div>
        <button type="submit" class="btn btn-outline" style="width:100%">Save changes</button>
      </form>

      <form method="post" action="/vehicles/${vehicle.id}/sell/mark-sold" style="margin-bottom:12px">
        <button type="submit" class="btn btn-solid" style="width:100%;border:none">Mark as sold</button>
      </form>
      <form method="post" action="/vehicles/${vehicle.id}/sell/remove">
        <button type="submit" style="display:block;width:100%;text-align:center;border:none;background:none;padding:0;font-size:12.5px;color:oklch(45% 0.18 25);cursor:pointer;text-decoration:underline;text-underline-offset:3px">Remove listing</button>
      </form>
    </div>`;
  } else if (pendingTransfer) {
    body = `
    <div style="width:100%;max-width:440px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">LIST FOR SALE</div>
      <div style="font-family:var(--font-display);font-size:22px;margin-bottom:16px">This vehicle has a pending ownership transfer.</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:28px">Cancel the pending transfer to <strong style="color:var(--ink)">${esc(pendingTransfer.to_email)}</strong> before listing this vehicle for sale.</div>
      <a href="/vehicles/${vehicle.id}" class="btn btn-outline" style="display:block;text-align:center">&larr; Back to vehicle</a>
    </div>`;
  } else if (listing?.status === "sold") {
    body = `
    <div style="width:100%;max-width:440px">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">LIST FOR SALE</div>
      <div style="font-family:var(--font-display);font-size:22px;margin-bottom:16px">Marked as sold.</div>
      <div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:28px">This vehicle's last listing is marked sold and no longer public. You can list it again below.</div>
      ${sellForm(vehicle, { error, showHeader: false, free: !!user.unlimited_vehicles })}
    </div>`;
  } else {
    body = sellForm(vehicle, { error, free: !!user.unlimited_vehicles });
  }

  return c.html(appShell(`Sell — ${vehicle.make} ${vehicle.model} — Moto ID`, `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Sell`, body, user));
});

function parseListingInput(body: Record<string, any>): { pricePence: number; description: string; location: string | null } | null {
  const price = Number.parseFloat(String(body.price ?? ""));
  const description = String(body.description ?? "").trim().slice(0, 4000);
  const locationRaw = String(body.location ?? "").trim().slice(0, 120);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000 || !description) return null;
  return { pricePence: Math.round(price * 100), description, location: locationRaw || null };
}

marketplace.post("/vehicles/:id/sell", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const pendingTransfer = await getPendingTransferForVehicle(c.env.DB, vehicle.id);
  if (pendingTransfer) return c.redirect(`/vehicles/${vehicle.id}/sell`);

  const existing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  if (existing && (existing.status === "pending_payment" || existing.status === "active")) {
    return c.redirect(`/vehicles/${vehicle.id}/sell`);
  }

  const body = await c.req.parseBody();
  const input = parseListingInput(body);
  if (!input) {
    return c.html(appShell(`Sell — ${vehicle.make} ${vehicle.model} — Moto ID`, `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / Sell`, sellForm(vehicle, { error: "Please enter a valid price and description.", free: !!user.unlimited_vehicles }), user), 400);
  }

  const listing = await createListing(c.env.DB, vehicle.id, user.id, input);
  if (!listing) {
    return c.redirect(`/vehicles/${vehicle.id}/sell?error=${encodeURIComponent("Listing isn't available yet — please try again shortly.")}`);
  }

  // Accounts with the unlimited_vehicles flag (currently just Adam's own
  // account — see migrations/0006_unlimited_vehicles.sql) also skip the
  // marketplace listing fee entirely: publish straight to "active" with no
  // Stripe Checkout round-trip, the same bypass pattern already used for
  // vehicle-registration credits in src/routes/billing.ts and vehicles.ts.
  if (user.unlimited_vehicles) {
    await setListingPaid(c.env.DB, listing.id, null);
    return c.redirect(`/vehicles/${vehicle.id}/sell/success`);
  }

  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
  try {
    const session = await createCheckoutSession(c.env, {
      userId: user.id,
      userEmail: user.email,
      amountPence: LISTING_FEE_PENCE,
      productName: "Moto ID Marketplace listing fee",
      productDescription: `${vehicle.make} ${vehicle.model} — one-time marketplace listing fee`,
      successUrl: `${origin}/vehicles/${vehicle.id}/sell/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/vehicles/${vehicle.id}/sell`,
      extraMetadata: { purpose: "listing_fee", listingId: listing.id },
    });
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe checkout session creation failed (listing fee):", err instanceof Error ? err.message : String(err));
    return c.redirect(`/vehicles/${vehicle.id}/sell?error=${encodeURIComponent("We couldn't start checkout right now. Please check back shortly.")}`);
  }
});

marketplace.post("/vehicles/:id/sell/pay", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  if (!listing || listing.status !== "pending_payment") return c.redirect(`/vehicles/${vehicle.id}/sell`);

  if (user.unlimited_vehicles) {
    await setListingPaid(c.env.DB, listing.id, null);
    return c.redirect(`/vehicles/${vehicle.id}/sell/success`);
  }

  const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
  try {
    const session = await createCheckoutSession(c.env, {
      userId: user.id,
      userEmail: user.email,
      amountPence: LISTING_FEE_PENCE,
      productName: "Moto ID Marketplace listing fee",
      productDescription: `${vehicle.make} ${vehicle.model} — one-time marketplace listing fee`,
      successUrl: `${origin}/vehicles/${vehicle.id}/sell/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/vehicles/${vehicle.id}/sell`,
      extraMetadata: { purpose: "listing_fee", listingId: listing.id },
    });
    return c.redirect(session.url, 303);
  } catch (err) {
    console.error("Stripe checkout session creation failed (listing fee resume):", err instanceof Error ? err.message : String(err));
    return c.redirect(`/vehicles/${vehicle.id}/sell?error=${encodeURIComponent("We couldn't start checkout right now. Please check back shortly.")}`);
  }
});

marketplace.get("/vehicles/:id/sell/success", requireAuth, async (c) => {
  const user = c.get("user")!;
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const sessionId = c.req.query("session_id");
  if (sessionId) {
    const session = await retrieveCheckoutSession(c.env, sessionId);
    const listingId = session?.metadata?.listingId;
    if (session && session.payment_status === "paid" && listingId) {
      await setListingPaid(c.env.DB, listingId, session.payment_intent ?? null);
    }
  }

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  const isLive = listing?.status === "active";

  const body = `
    <div style="width:100%;max-width:440px;text-align:center">
      <div style="font-size:10px;letter-spacing:0.16em;color:var(--ink-subtle);margin-bottom:14px">PAYMENT RECEIVED</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1.3;margin-bottom:22px">Thank you.</div>
      ${
        isLive
          ? `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">Your listing is live on the marketplace.</div>
             <a href="/marketplace/${listing!.id}" target="_blank" class="btn btn-solid" style="display:block;border:none">View your listing</a>`
          : `<div style="font-size:13.5px;color:var(--ink-muted);line-height:1.7;margin-bottom:30px">We're confirming your payment — this can take a few seconds. Refresh this page in a moment.</div>
             <a href="/vehicles/${vehicle.id}/sell" class="btn btn-outline" style="display:block">Back to listing</a>`
      }
    </div>`;

  return c.html(authShell("Payment received — Moto ID", body));
});

marketplace.post("/vehicles/:id/sell/mark-sold", requireAuth, async (c) => {
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  if (listing?.status === "active") {
    await setListingStatus(c.env.DB, listing.id, "sold");
  }
  return c.redirect(`/vehicles/${vehicle.id}/sell`);
});

marketplace.post("/vehicles/:id/sell/remove", requireAuth, async (c) => {
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  if (listing && (listing.status === "active" || listing.status === "pending_payment")) {
    await setListingStatus(c.env.DB, listing.id, "removed");
  }
  return c.redirect(`/vehicles/${vehicle.id}/sell`);
});

marketplace.post("/vehicles/:id/sell/edit", requireAuth, async (c) => {
  const vehicle = await requireOwnedVehicle(c);
  if (!vehicle) return c.notFound();

  const listing = await getLatestListingForVehicle(c.env.DB, vehicle.id);
  if (!listing || listing.status !== "active") return c.redirect(`/vehicles/${vehicle.id}/sell`);

  const body = await c.req.parseBody();
  const input = parseListingInput(body);
  if (!input) {
    return c.redirect(`/vehicles/${vehicle.id}/sell?error=${encodeURIComponent("Please enter a valid price and description.")}`);
  }

  await updateListingDetails(c.env.DB, listing.id, input);
  return c.redirect(`/vehicles/${vehicle.id}/sell`);
});
