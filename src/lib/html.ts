/** Escape untrusted text before interpolating it into HTML. */
export function esc(input: string | number | null | undefined): string {
    if (input === null || input === undefined) return "";
  return String(input)
        .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
