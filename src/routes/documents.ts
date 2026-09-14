import { Hono } from "hono";
import type { Env } from "../types";
import { appShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import { getVehicleById, listDocuments, addDocument, setDocumentVisibility, getDocumentById, type Folder, type Document } from "../lib/db";

export const documents = new Hono<Env>();

documents.use("*", requireAuth);

const FOLDER_LABEL: Record<Folder, string> = {
    service: "Service Documents",
    invoice: "Invoices",
    photo: "Photos",
};

const DOC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/></svg>`;
const UPLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 15V4"/><polyline points="7.5,8.5 12,4 16.5,8.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>`;

function isFolder(v: string): v is Folder {
    return v === "service" || v === "invoice" || v === "photo";
}

function formatSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function visibilityToggle(vehicleId: string, folder: Folder, doc: Document): string {
    return `
    <form method="post" action="/vehicles/${vehicleId}/folder/${folder}/documents/${doc.id}/visibility" style="margin:0">
      <label style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--ink-subtle);cursor:pointer;white-space:nowrap">
        <input type="checkbox" name="isPublic" onchange="this.form.requestSubmit()" ${doc.is_public ? "checked" : ""}>
        Public
      </label>
    </form>`;
}

function isImage(doc: Document): boolean {
    return !!doc.content_type && doc.content_type.startsWith("image/");
}

documents.get("/vehicles/:id/folder/:folder", async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const folder = folderParam;
    const docs = await listDocuments(c.env.DB, vehicle.id, folder);
    const r2Enabled = !!c.env.DOCS;

    const listing =
          folder === "photo"
                ? docs.length
                      ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px">
        ${docs
              .map((d) => {
                    const thumb = isImage(d)
                          ? `<img src="/vehicles/${vehicle.id}/folder/${folder}/documents/${d.id}" alt="${esc(d.filename)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block">`
                          : `<div style="width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--bg-panel)">${DOC_ICON}</div>`;
                    return `
        <div style="border:1px solid var(--hairline)">
          <a href="/vehicles/${vehicle.id}/folder/${folder}/documents/${d.id}" target="_blank" style="display:block">${thumb}</a>
          <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">
            <div style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.filename)}">${esc(d.filename)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div class="mono" style="font-size:10.5px;color:var(--ink-subtle)">${new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
              ${visibilityToggle(vehicle.id, folder, d)}
            </div>
          </div>
        </div>`;
              })
              .join("")}
      </div>`
                      : `<div style="padding:28px 20px;font-size:13px;color:var(--ink-subtle);border:1px solid var(--hairline)">No photos yet — upload the first one above.</div>`
                : docs.length
                      ? `
      <div style="border:1px solid var(--hairline);overflow-x:auto">
        <div style="min-width:720px">
          <div style="display:grid;grid-template-columns:1fr 160px 190px 90px 90px;gap:12px;padding:12px 20px;border-bottom:1px solid var(--hairline);font-size:10px;letter-spacing:0.08em;color:var(--ink-subtle)">
            <div>DOCUMENT</div><div>DATE</div><div>ADDED BY</div><div style="text-align:right">SIZE</div><div style="text-align:right">VISIBILITY</div>
          </div>
          ${docs
                .map(
                      (d) => `
          <div class="row" style="display:grid;grid-template-columns:1fr 160px 190px 90px 90px;gap:12px;padding:16px 20px;border-bottom:1px solid var(--hairline);align-items:center">
            <div style="display:flex;align-items:center;gap:12px;font-size:13.5px;min-width:0">
              ${DOC_ICON}
              <a href="/vehicles/${vehicle.id}/folder/${folder}/documents/${d.id}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.filename)}</a>
            </div>
            <div class="mono" style="font-size:12px;color:var(--ink-subtle)">${new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
            <div style="font-size:12.5px;color:var(--ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.added_by ?? user.name)}</div>
            <div class="mono" style="text-align:right;font-size:12px;color:var(--ink-subtle)">${formatSize(d.size_bytes)}</div>
            <div style="text-align:right">${visibilityToggle(vehicle.id, folder, d)}</div>
          </div>`
                )
                .join("")}
        </div>
      </div>`
                      : `<div style="padding:28px 20px;font-size:13px;color:var(--ink-subtle);border:1px solid var(--hairline)">No documents yet — upload the first one above.</div>`;

    const uploadBlock = r2Enabled
          ? `
          <form method="post" action="/vehicles/${vehicle.id}/folder/${folder}/upload" enctype="multipart/form-data" style="margin-bottom:32px;display:flex;flex-direction:column;gap:12px">
            <label style="border:1px dashed var(--hairline-strong);padding:26px;display:flex;align-items:center;justify-content:center;gap:12px;color:var(--ink-subtle);cursor:pointer">
              ${UPLOAD_ICON}
              <span style="font-size:13px">Click to choose a file &mdash; PDF, JPG or PNG</span>
              <input type="file" name="file" required style="display:none" onchange="this.form.requestSubmit()">
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-muted);cursor:pointer">
              <input type="checkbox" name="isPublic">
              Make this visible on the public verify page (anyone who scans the plate's QR code will see it)
            </label>
          </form>`
          : `
          <div style="border:1px dashed var(--hairline);padding:22px 26px;margin-bottom:32px;color:var(--ink-subtle);font-size:13px">
            File uploads are being finished — storage isn't switched on for this account yet. Your folders and history are ready as soon as it is.
          </div>`;

    const body = `
    <div style="max-width:1100px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:8px;gap:16px;flex-wrap"wrap">
        <div style="font-family:var(--font-display);font-size:26px">${FOLDER_LABEL[folder]}</div>
      </div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${docs.length} file${docs.length === 1 ? "" : "s"}</div>

      ${uploadBlock}

      ${listing}
    </div>`;

    return c.html(
          appShell(`${FOLDER_LABEL[folder]} — Moto ID`, `My Collection / ${esc(vehicle.registration_number)} / ${FOLDER_LABEL[folder]}`, body, user)
    );
});

documents.post("/vehicles/:id/folder/:folder/upload", async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();
    const folder = folderParam;

    if (!c.env.DOCS) {
          return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
    }

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
          return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
    }
    const isPublic = body.isPublic === "on";

    const r2Key = `${vehicle.id}/${folder}/${crypto.randomUUID()}-${file.name}`;
    await c.env.DOCS.put(r2Key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type || undefined },
    });

    await addDocument(c.env.DB, vehicle.id, {
          folder,
          filename: file.name,
          r2Key,
          contentType: file.type || null,
          sizeBytes: file.size || null,
          addedBy: user.name,
          isPublic,
    });

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
});

documents.post("/vehicles/:id/folder/:folder/documents/:docId/visibility", async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const doc = await getDocumentById(c.env.DB, c.req.param("docId"));
    if (!doc || doc.vehicle_id !== vehicle.id) return c.notFound();

    const body = await c.req.parseBody();
    const isPublic = body.isPublic === "on";
    await setDocumentVisibility(c.env.DB, doc.id, isPublic);

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folderParam}`);
});

documents.get("/vehicles/:id/folder/:folder/documents/:docId", async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();
    if (!c.env.DOCS) return c.notFound();

    const docs = await listDocuments(c.env.DB, vehicle.id, folderParam);
    const doc = docs.find((d) => d.id === c.req.param("docId"));
    if (!doc) return c.notFound();

    const object = await c.env.DOCS.get(doc.r2_key);
    if (!object) return c.notFound();

    c.header("Content-Type", doc.content_type ?? "application/octet-stream");
    c.header("Content-Disposition", `inline; filename="${doc.filename.replace(/"/g, "")}"`);
    return c.body(object.body as any);
});
