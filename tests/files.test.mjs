// File-type sniffing and the inline-vs-download serving decision — run
// against the real src/lib/files.ts. This is what stops a mislabeled
// upload (e.g. claiming "image/svg+xml" or "text/html") from being served
// back and executed as a page on this origin — see the comment at the top
// of lib/files.ts for the full stored-XSS reasoning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffFileType, serveHeaders } from "../src/lib/files.ts";

test("sniffs a real JPEG from its magic bytes", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  assert.equal(sniffFileType(bytes), "image/jpeg");
});

test("sniffs a real PNG from its magic bytes", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.equal(sniffFileType(bytes), "image/png");
});

test("sniffs a real PDF from its magic bytes", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n...");
  assert.equal(sniffFileType(bytes), "application/pdf");
});

test("sniffs a WEBP (RIFF container) correctly", () => {
  const bytes = new Uint8Array(16);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  assert.equal(sniffFileType(bytes), "image/webp");
});

test("does NOT identify an HTML file as anything on the allowlist (the core XSS case)", () => {
  const bytes = new TextEncoder().encode("<html><body><script>alert(1)</script></body></html>");
  assert.equal(sniffFileType(bytes), null);
});

test("does NOT identify an SVG as a safe image, even though browsers treat it as one", () => {
  // SVG is XML text with no reliable magic number, and can embed <script> —
  // this is exactly why it must fall through to "unknown", never "image/*".
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(sniffFileType(bytes), null);
});

test("does not crash or false-positive on an empty/tiny buffer", () => {
  assert.equal(sniffFileType(new Uint8Array(0)), null);
  assert.equal(sniffFileType(new Uint8Array([0xff])), null);
});

test("serveHeaders renders a sniffed-safe type inline with that exact content type", () => {
  const result = serveHeaders("image/png");
  assert.deepEqual(result, { contentType: "image/png", disposition: "inline" });
});

test("serveHeaders forces a download for anything not on the allowlist", () => {
  assert.deepEqual(serveHeaders("text/html"), { contentType: "application/octet-stream", disposition: "attachment" });
  assert.deepEqual(serveHeaders("image/svg+xml"), { contentType: "application/octet-stream", disposition: "attachment" });
  assert.deepEqual(serveHeaders(null), { contentType: "application/octet-stream", disposition: "attachment" });
});
