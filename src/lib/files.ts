// Server-side file-type sniffing and safe-serving helpers.
//
// Never trust a client-supplied MIME type when deciding how to SERVE a
// file back to a browser — the uploader's browser (or an attacker) can
// claim anything. A file uploaded as "image/svg+xml" or "text/html" and
// served back with Content-Disposition: inline would execute as a page on
// this origin, which is a stored-XSS vector — and a serious one here,
// since verify.ts serves any document an owner has marked public to
// anyone, with no authentication at all, and a script running on this
// origin can still ride the viewer's httpOnly session cookie on same-origin
// requests even though it can't read the cookie's value directly.
//
// The fix has two parts:
//  1. At UPLOAD time, sniff the real bytes and store that result (not the
//     browser's claimed type) as the document's content_type.
//  2. At SERVE time (both the authenticated documents.ts route and the
//     public verify.ts route), only ever render inline a content_type that
//     is on the small allowlist below. Everything else — including any
//     legacy row written before this fix, and anything we can't positively
//     identify — is forced to download (Content-Disposition: attachment,
//     Content-Type: application/octet-stream), so the browser never
//     executes it no matter what's in the database.
//
// SVG deliberately has no entry here: it doesn't have reliable magic bytes
// (it's just XML text) and can embed <script>, so it always falls through
// to "unknown" and gets forced to download rather than rendered.

export type SniffedType = "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/heic" | "application/pdf";

const ALLOWED_INLINE_TYPES: ReadonlySet<string> = new Set<SniffedType>([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "application/pdf",
]);

// 25MB — generous for a phone photo or a scanned multi-page PDF, while
// still bounding how much a single upload can cost in R2 storage/egress.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function matches(bytes: Uint8Array, offset: number, sig: number[]): boolean {
    if (bytes.length < offset + sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
          if (bytes[offset + i] !== sig[i]) return false;
    }
    return true;
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
    return matches(bytes, offset, Array.from(text).map((ch) => ch.charCodeAt(0)));
}

/**
 * Identifies a file's real type from its first bytes (magic numbers).
 * Returns null for anything not on the short, deliberately conservative
 * list above — callers must treat null as "unknown / don't render inline",
 * never assume it's safe.
 */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
    if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
    if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WEBP")) return "image/webp";
    // HEIC/HEIF (modern iPhone photos): ISO base media file format — a
    // "ftyp" box at offset 4, then a brand code at offset 8.
    if (matchesAscii(bytes, 4, "ftyp")) {
          const brand = Array.from(bytes.slice(8, 12))
                .map((b) => String.fromCharCode(b))
                .join("");
          if (["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
    }
    if (matchesAscii(bytes, 0, "%PDF")) return "application/pdf";
    return null;
}

/**
 * Decides the headers to serve a stored document with, based solely on its
 * recorded content_type (expected to already be a sniffed value — see
 * sniffFileType above — but checked against the allowlist regardless, so a
 * legacy or otherwise-untrusted value can never result in inline
 * rendering of something we don't recognize).
 */
export function serveHeaders(contentType: string | null): { contentType: string; disposition: "inline" | "attachment" } {
    if (contentType && ALLOWED_INLINE_TYPES.has(contentType)) {
          return { contentType, disposition: "inline" };
    }
    return { contentType: "application/octet-stream", disposition: "attachment" };
}
