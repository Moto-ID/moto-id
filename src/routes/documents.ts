import { Hono } from "hono";
import type { Env } from "../types";
import { appShell } from "../lib/layout";
import { esc } from "../lib/html";
import { requireAuth } from "../lib/auth";
import {
  getVehicleById,
  listDocuments,
  addDocument,
  setDocumentVisibility,
  getDocumentById,
  softDeleteDocument,
  restoreDocument,
  listDeletedDocuments,
  DOCUMENT_UNDO_WINDOW_DAYS,
  type Folder,
  type Document,
} from "../lib/db";
import { sniffFileType, serveHeaders, MAX_UPLOAD_BYTES } from "../lib/files";

export const documents = new Hono<Env>();

// requireAuth is applied per-route below, not via a blanket
// documents.use("*", ...) — see the matching note in vehicles.ts for why: a
// wildcard middleware here leaks into every route in the whole app (they're
// all mounted at "/"), which is what broke the public /verify page.

const FOLDER_LABEL: Record<Folder, string> = {
    service: "Service Documents",
    invoice: "Invoices",
    photo: "Photos",
};

const DOC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/></svg>`;
const UPLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 15V4"/><polyline points="7.5,8.5 12,4 16.5,8.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="4,7 20,7"/><path d="M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`;

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

function deleteButton(vehicleId: string, folder: Folder, doc: Document): string {
    return `
    <form method="post" action="/vehicles/${vehicleId}/folder/${folder}/documents/${doc.id}/delete" style="margin:0" onsubmit="return confirm('Delete this file? You can restore it from Recently Deleted for ${DOCUMENT_UNDO_WINDOW_DAYS} days.')">
      <button type="submit" title="Delete" aria-label="Delete file" style="background:none;border:none;padding:4px;margin:0;color:var(--ink-subtle);cursor:pointer;display:inline-flex;align-items:center;line-height:0">${TRASH_ICON}</button>
    </form>`;
}

function daysLeft(deletedAt: string): number {
    const deletedMs = new Date(deletedAt + "Z").getTime(); // D1's datetime('now') is UTC, no offset in the string
    const elapsedDays = (Date.now() - deletedMs) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(DOCUMENT_UNDO_WINDOW_DAYS - elapsedDays));
}

function recentlyDeletedSection(vehicleId: string, folder: Folder, deleted: Document[]): string {
    if (deleted.length === 0) return "";
    return `
    <details style="margin-top:28px">
      <summary style="cursor:pointer;font-size:12.5px;color:var(--ink-subtle);letter-spacing:0.04em">RECENTLY DELETED (${deleted.length})</summary>
      <div style="margin-top:14px;border:1px solid var(--hairline)">
        ${deleted
              .map(
                    (d) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--hairline);font-size:12.5px;color:var(--ink-muted)">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.filename)}</div>
          <div style="display:flex;align-items:center;gap:14px;white-space:nowrap">
            <span style="color:var(--ink-subtle);font-size:11px">${daysLeft(d.deleted_at!)} day${daysLeft(d.deleted_at!) === 1 ? "" : "s"} left</span>
            <form method="post" action="/vehicles/${vehicleId}/folder/${folder}/documents/${d.id}/restore" style="margin:0">
              <button type="submit" class="text-link" style="background:none;border:none;padding:0;font-size:12.5px;cursor:pointer">Restore</button>
            </form>
          </div>
        </div>`
              )
              .join("")}
      </div>
    </details>`;
}

function isImage(doc: Document): boolean {
    return !!doc.content_type && doc.content_type.startsWith("image/");
}

documents.get("/vehicles/:id/folder/:folder", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const folder = folderParam;
    const docs = await listDocuments(c.env.DB, vehicle.id, folder);
    const deletedDocs = (await listDeletedDocuments(c.env.DB, vehicle.id)).filter((d) => d.folder === folder);
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
              <div style="display:flex;align-items:center;gap:10px">
                ${visibilityToggle(vehicle.id, folder, d)}
                ${deleteButton(vehicle.id, folder, d)}
              </div>
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
        <div style="min-width:780px">
          <div style="display:grid;grid-template-columns:1fr 160px 190px 90px 90px 50px;gap:12px;padding:12px 20px;border-bottom:1px solid var(--hairline);font-size:10px;letter-spacing:0.08em;color:var(--ink-subtle)">
            <div>DOCUMENT</div><div>DATE</div><div>ADDED BY</div><div style="text-align:right">SIZE</div><div style="text-align:right">VISIBILITY</div><div></div>
          </div>
          ${docs
                .map(
                      (d) => `
          <div class="row" style="display:grid;grid-template-columns:1fr 160px 190px 90px 90px 50px;gap:12px;padding:16px 20px;border-bottom:1px solid var(--hairline);align-items:center">
            <div style="display:flex;align-items:center;gap:12px;font-size:13.5px;min-width:0">
              ${DOC_ICON}
              <a href="/vehicles/${vehicle.id}/folder/${folder}/documents/${d.id}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.filename)}</a>
            </div>
            <div class="mono" style="font-size:12px;color:var(--ink-subtle)">${new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
            <div style="font-size:12.5px;color:var(--ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.added_by ?? user.name)}</div>
            <div class="mono" style="text-align:right;font-size:12px;color:var(--ink-subtle)">${formatSize(d.size_bytes)}</div>
            <div style="text-align:right">${visibilityToggle(vehicle.id, folder, d)}</div>
            <div style="text-align:right">${deleteButton(vehicle.id, folder, d)}</div>
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
              <span style="font-size:13px">Click to choose files &mdash; PDF, JPG or PNG (you can select more than one)</span>
              <input type="file" name="file" accept="image/*,application/pdf" multiple required style="display:none" onchange="this.form.requestSubmit()">
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
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:8px;gap:16px;flex-wrap:wrap">
        <div style="font-family:var(--font-display);font-size:26px">${FOLDER_LABEL[folder]}</div>
      </div>
      <div style="font-size:13px;color:var(--ink-subtle);margin-bottom:28px">${docs.length} file${docs.length === 1 ? "" : "s"}</div>

      ${uploadBlock}

      ${listing}

      ${recentlyDeletedSection(vehicle.id, folder, deletedDocs)}
    </div>`;

    return c.html(
          appShell(`${FOLDER_LABEL[folder]} — Moto ID`, `<a href="/dashboard">My Collection</a> / <a href="/vehicles/${vehicle.id}">${esc(vehicle.registration_number)}</a> / ${FOLDER_LABEL[folder]}`, body, user)
    );
});

documents.post("/vehicles/:id/folder/:folder/upload", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();
    const folder = folderParam;

    if (!c.env.DOCS) {
          return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
    }

    // { all: true } makes a <input multiple> submit come through as an array
    // even when the visitor picked just one file (then it's a single File,
    // not an array) — handle both shapes.
    const body = await c.req.parseBody({ all: true });
    const rawFiles = body.file;
    const files = (Array.isArray(rawFiles) ? rawFiles : [rawFiles]).filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
          return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
    }
    const isPublic = body.isPublic === "on";

    for (const file of files) {
          // Oversized files are silently skipped rather than erroring the whole
          // batch — a multi-file drop with one huge photo should still save
          // the rest. (25MB — see MAX_UPLOAD_BYTES in lib/files.ts for why.)
          if (file.size > MAX_UPLOAD_BYTES) continue;

          const bytes = new Uint8Array(await file.arrayBuffer());
          // Store what the bytes actually are, never what the browser claimed
          // — see lib/files.ts for why (this is the content_type later used
          // to decide inline-vs-download when serving the file back).
          const sniffed = sniffFileType(bytes);

          const r2Key = `${vehicle.id}/${folder}/${crypto.randomUUID()}-${file.name}`;
          await c.env.DOCS.put(r2Key, bytes, {
                httpMetadata: { contentType: sniffed ?? "application/octet-stream" },
          });

          await addDocument(c.env.DB, vehicle.id, {
                folder,
                filename: file.name,
                r2Key,
                contentType: sniffed,
                sizeBytes: file.size || null,
                addedBy: user.name,
                isPublic,
          });
    }

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folder}`);
});

documents.post("/vehicles/:id/folder/:folder/documents/:docId/visibility", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const doc = await getDocumentById(c.env.DB, c.req.param("docId"));
    if (!doc || doc.vehicle_id !== vehicle.id || doc.deleted_at) return c.notFound();

    const body = await c.req.parseBody();
    const isPublic = body.isPublic === "on";
    await setDocumentVisibility(c.env.DB, doc.id, isPublic);

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folderParam}`);
});

documents.post("/vehicles/:id/folder/:folder/documents/:docId/delete", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const doc = await getDocumentById(c.env.DB, c.req.param("docId"));
    if (!doc || doc.vehicle_id !== vehicle.id || doc.deleted_at) return c.notFound();

    // Soft-delete only: the R2 object stays put, and the D1 row just gets
    // deleted_at set, so this is undoable from the "Recently deleted"
    // section for DOCUMENT_UNDO_WINDOW_DAYS — see restoreDocument below and
    // the purge sweep in src/index.ts's scheduled() handler.
    await softDeleteDocument(c.env.DB, doc.id);

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folderParam}`);
});

documents.post("/vehicles/:id/folder/:folder/documents/:docId/restore", requireAuth, async (c) => {
    const user = c.get("user")!;
    const vehicle = await getVehicleById(c.env.DB, c.req.param("id"));
    const folderParam = c.req.param("folder");
    if (!vehicle || vehicle.user_id !== user.id || !isFolder(folderParam)) return c.notFound();

    const doc = await getDocumentById(c.env.DB, c.req.param("docId"));
    if (!doc || doc.vehicle_id !== vehicle.id || !doc.deleted_at) return c.notFound();

    await restoreDocument(c.env.DB, doc.id);

    return c.redirect(`/vehicles/${vehicle.id}/folder/${folderParam}`);
});

documents.get("/vehicles/:id/folder/:folder/documents/:docId", requireAuth, async (c) => {
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

    const headers = serveHeaders(doc.content_type);
    c.header("Content-Type", headers.contentType);
    c.header("Content-Disposition", `${headers.disposition}; filename="${doc.filename.replace(/"/g, "")}"`);
    return c.body(object.body as any);
});
