import { Hono } from "hono";
import type { Env } from "../types";
import { pageHead } from "../lib/styles";
import { esc } from "../lib/html";
import { getVehicleByMotoIdNumber, countDocumentsByFolder, recordScan, lastScan, listPublicDocuments, getPublicDocument } from "../lib/db";

export const verify = new Hono<Env>();

function notFoundPage(motoIdNumber: string): string {
    return `<!doctype html>
  <html lang="en">
  <head>${pageHead("Record not found — Moto ID")}</head>
  <body style="padding:60px 22px;text-align:center">
    <div style="font-weight:600;font-size:10.5px;letter-spacing:0.18em;margin-bottom:40px">MOTO ID</div>
  <div style="font-family:var(--font-display);font-size:22px;margin-bottom:12px">No record found</div>
  <div style="font-size:13px;color:var(--ink-subtle);max-width:340px;margin:0 auto">There's no Moto ID record for number ${esc(
        motoIdNumber
  )}. Double check the number on the plate, or the QR code you scanned.</div>
    </body>
    </html>`;
}

  verify.get("/verify", (c) => {
    return c.html(`<!doctype html>
                  <html lang="en">
                  <head>${pageHead("Verify a vehicle — Moto ID")}</head>
                  <body style="padding:60px 22px">
                    <div style="font-weight:600;font-size:10.5px;letter-spacing:0.18em;margin-bottom:40px;text-align:center">MOTO ID</div>
                    <div style="max-width:380px;margin:0 auto">
                  <div style="font-family:var(--font-display);font-size:24px;margin-bottom:10px;text-align:center">Verify a vehicle</div>
                  <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px;text-align:center">Scan the QR code on the plate, or enter its Moto ID number below.</div>
                  <form method="get" action="/verify/lookup" style="display:flex;gap:0;border:1px solid var(--ink)">
                  <input type="text" name="n" placeholder="e.g. 084213" required style="border:none;padding:14px 16px;flex:1 1 0;font-family:var(--font-mono)">
                  <button type="submit" style="border:none;background:var(--ink);color:var(--bg);padding:0 20px;font-size:12.5px;letter-spacing:0.04em;cursor:pointer">Look up</button>
                      </form>
                    </div>
                  </body>
                  </html>`);
  });

  verify.get("/verify/lookup", (c) => {
    const n = (c.req.query("n") ?? "").trim();
    return c.redirect(`/verify/${encodeURIComponent(n)}`);
  });

  verify.get("/verify/:motoIdNumber", async (c) => {
    const motoIdNumber = c.req.param("motoIdNumber");
    const vehicle = await getVehicleByMotoIdNumber(c.env.DB, motoIdNumber);
    if (!vehicle) return c.html(notFoundPage(motoIdNumber), 404);

    await recordScan(c.env.DB, vehicle.id);
    const scannedAt = await lastScan(c.env.DB, vehicle.id);
    const counts = await countDocumentsByFolder(c.env.DB, vehicle.id);
      const serviceRecords = counts.service + counts.invoice;
    const subtitle = [vehicle.year, vehicle.colour].filter(Boolean).join(" · ");

    const publicDocs = await listPublicDocuments(c.env.DB, vehicle.id);
    const publicPhotos = publicDocs.filter((d) => d.folder === "photo" && d.content_type?.startsWith("image/"));
    const publicFiles = publicDocs.filter((d) => !(d.folder === "photo" && d.content_type?.startsWith("image/")));

    const photosSection =
          publicPhotos.length > 0
                ? `
    <div style="border:1px solid var(--hairline);margin-bottom:18px">
      <div style="padding:16px 22px;border-bottom:1px solid var(--hairline);font-weight:600;font-size:12.5px">Photos</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;padding:18px 22px">
        ${publicPhotos
              .map(
                    (d) => `
        <a href="/verify/${esc(vehicle.moto_id_number)}/documents/${d.id}" target="_blank">
          <img src="/verify/${esc(vehicle.moto_id_number)}/documents/${d.id}" alt="${esc(d.filename)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;border:1px solid var(--hairline)">
        </a>`
              )
              .join("")}
      </div>
    </div>`
                : "";

    const filesSection =
          publicFiles.length > 0
                ? `
    <div style="border:1px solid var(--hairline);margin-bottom:22px">
      <div style="padding:16px 22px;border-bottom:1px solid var(--hairline);font-weight:600;font-size:12.5px">Public documents</div>
      ${publicFiles
            .map(
                  (d) => `
      <a href="/verify/${esc(vehicle.moto_id_number)}/documents/${d.id}" target="_blank" style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 22px;border-bottom:1px solid var(--hairline);font-size:12.5px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.filename)}</span>
        <span class="mono" style="color:var(--ink-subtle);font-size:11px;white-space:nowrap">${new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
      </a>`
            )
            .join("")}
    </div>`
                : "";

      const body = `<!doctype html>
    <html lang="en">
    <head>${pageHead(`${vehicle.make} ${vehicle.model} — Verified Moto ID`)}</head>
    <body style="padding:30px 22px 36px;max-width:480px;margin:0 auto">

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:30px">
        <div style="font-weight:600;font-size:10.5px;letter-spacing:0.18em">MOTO ID</div>
    <div style="margin-left:auto;font-size:9.5px;color:var(--ink-subtle);letter-spacing:0.1em">SCANNED RECORD</div>
      </div>

    <div style="border:1px solid var(--hairline);padding:34px 22px;text-align:center;margin-bottom:18px">
    <div style="width:64px;height:64px;border-radius:50%;border:1.5px solid var(--ink);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;position:relative">
    <div style="position:absolute;inset:5px;border-radius:50%;border:1px dashed var(--hairline-strong)"></div>
          <div style="font-size:8.5px;letter-spacing:0.06em;line-height:1.3">AUTHEN&shy;TICATED</div>
        </div>
    <div style="font-family:var(--font-display);font-size:18px;margin-bottom:8px">Verified Moto ID</div>
    <div style="font-family:var(--font-mono);font-size:12.5px;color:var(--ink-muted);letter-spacing:0.02em">No. ${esc(vehicle.moto_id_number)}</div>
      </div>

    <div style="border:1px solid var(--hairline);padding:22px;margin-bottom:18px">
    <div style="font-family:var(--font-display);font-size:18px;margin-bottom:16px">${esc(vehicle.make)} ${esc(vehicle.model)}${
      vehicle.year ? ` <span style="font-style:italic">(${vehicle.year})</span>` : ""
    }</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div>
    <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:4px">TYPE</div>
    <div style="font-size:12.5px;font-family:var(--font-mono)">${esc(vehicle.vehicle_type)}</div>
          </div>
          <div>
    <div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:4px">COLOUR</div>
    <div style="font-size:12.5px;font-family:var(--font-mono)">${esc(vehicle.colour ?? "—")}</div>
          </div>
        </div>
      </div>

    <div style="border:1px solid var(--hairline);margin-bottom:22px">
    <div style="padding:16px 22px;border-bottom:1px solid var(--hairline);font-weight:600;font-size:12.5px">History summary</div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--hairline)">
    <div style="font-size:12px;color:var(--ink-muted)">Registered since</div>
    <div style="font-family:var(--font-mono);font-size:11.5px">${new Date(vehicle.created_at).toLocaleDateString("en-GB", {
              month: "short",
              year: "numeric",
    })}</div>
        </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--hairline)">
    <div style="font-size:12px;color:var(--ink-muted)">Service &amp; invoice records logged</div>
    <div style="font-family:var(--font-mono);font-size:11.5px">${serviceRecords}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 22px">
    <div style="font-size:12px;color:var(--ink-muted)">Last verified scan</div>
    <div style="font-family:var(--font-mono);font-size:11.5px">${scannedAt ? "Today" : "—"}</div>
        </div>
      </div>

      ${photosSection}
      ${filesSection}

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
    <a href="mailto:hello@motoid.example?subject=Full%20history%20request%20-%20${esc(
          vehicle.moto_id_number
    )}" style="display:block;background:var(--ink);color:var(--bg);font-weight:600;font-size:13.5px;text-align:center;padding:14px;cursor:pointer">Request full history</a>
             <a href="mailto:hello@motoid.example?subject=Concern%20-%20${esc(
                   vehicle.moto_id_number
            )}" style="text-align:center;color:var(--ink-subtle);font-size:12px;padding:6px;cursor:pointer;text-decoration:underline;text-underline-offset:3px">Report a concern</a>
    </div>

  <div style="font-size:10.5px;color:var(--ink-subtle);text-align:center;line-height:1.6">This page is generated from the vehicle's Moto ID digital record.<br>Personal owner details are never shown publicly.</div>

  </body>
  </html>`;

  return c.html(body);
  });

  verify.get("/verify/:motoIdNumber/documents/:docId", async (c) => {
    const motoIdNumber = c.req.param("motoIdNumber");
    const vehicle = await getVehicleByMotoIdNumber(c.env.DB, motoIdNumber);
    if (!vehicle || !c.env.DOCS) return c.notFound();

    const doc = await getPublicDocument(c.env.DB, vehicle.id, c.req.param("docId"));
    if (!doc) return c.notFound();

    const object = await c.env.DOCS.get(doc.r2_key);
    if (!object) return c.notFound();

    c.header("Content-Type", doc.content_type ?? "application/octet-stream");
    c.header("Content-Disposition", `inline; filename="${doc.filename.replace(/"/g, "")}"`);
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(object.body as any);
  });

