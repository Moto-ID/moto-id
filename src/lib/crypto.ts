// Password hashing (PBKDF2 via Web Crypto, available in the Workers runtime)
// and small ID helpers. No external dependencies needed.

const PBKDF2_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
}

function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(password),
          "PBKDF2",
          false,
          ["deriveBits"]
        );
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
          keyMaterial,
          256
        );
    return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(salt.buffer as ArrayBuffer)}:${toHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = parseInt(parts[1], 10);
    const salt = fromHex(parts[2]);
    const expected = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
          keyMaterial,
          256
        );
    const actual = toHex(derived);

  // constant-time-ish compare
  if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) {
          diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
}

export function newId(): string {
    return crypto.randomUUID();
}

export function newSessionToken(): string {
    return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
}

/** A 6-digit Moto ID number, e.g. "084213". Uniqueness is checked by the caller. */
export function randomMotoIdNumber(): string {
    const n = Math.floor(Math.random() * 1_000_000);
    return n.toString().padStart(6, "0");
}
