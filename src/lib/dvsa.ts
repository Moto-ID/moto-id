import type { Bindings } from "../types";

// DVSA MOT History API client — looks up a vehicle's make/model/colour/fuel
// type and its full MOT test history by registration number.
//
// Auth is OAuth2 client-credentials via Microsoft Entra ID: exchange
// DVSA_CLIENT_ID/DVSA_CLIENT_SECRET at DVSA_TOKEN_URL (the tenant-specific
// URL from DVSA's "you've been granted access" email) for a bearer token,
// scoped to https://tapi.dvsa.gov.uk/.default. Every actual API call then
// needs BOTH that bearer token and DVSA_API_KEY as an X-API-Key header.
// These four values are Worker secrets Adam sets directly in Cloudflare —
// see the standing rule in this file's callers never to view/type them.
//
// The vehicle-lookup endpoint itself returns only structured JSON (no
// certificate/PDF of any kind exists) — this client's shape mirrors that:
// a flat vehicle object plus a motTests array, each test optionally
// carrying a defects array. DVSA's exact field set isn't published as a
// formal schema anywhere public; the field names below are the ones
// confirmed via a real third-party client built directly against this API
// (https://github.com/0xnu/mothistory). Every read here is defensive
// (tries a couple of plausible key spellings and falls back to undefined)
// so a field DVSA names slightly differently just comes back empty rather
// than breaking the lookup.

const MOT_HISTORY_BASE = "https://history.mot.api.gov.uk/v1/trade/vehicles";
const OAUTH_SCOPE = "https://tapi.dvsa.gov.uk/.default";

export interface MotDefect {
  text: string;
  type: string | null; // 'ADVISORY' | 'FAIL' | 'MINOR' | 'MAJOR' | 'DANGEROUS'
  dangerous: boolean;
}

export interface MotTest {
  motTestNumber: string;
  completedDate: string | null;
  expiryDate: string | null;
  testResult: string | null; // 'PASSED' | 'FAILED'
  odometerValue: number | null;
  odometerUnit: string | null; // 'mi' | 'km'
  odometerResultType: string | null;
  dataSource: string | null;
  defects: MotDefect[];
}

export interface DvsaVehicle {
  registration: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuelType: string | null;
  registrationDate: string | null;
  manufactureDate: string | null;
  motTests: MotTest[];
}

export class DvsaNotConfiguredError extends Error {}
export class DvsaNotFoundError extends Error {}

function missingConfig(env: Bindings): string | null {
  if (!env.DVSA_CLIENT_ID) return "DVSA_CLIENT_ID";
  if (!env.DVSA_CLIENT_SECRET) return "DVSA_CLIENT_SECRET";
  if (!env.DVSA_API_KEY) return "DVSA_API_KEY";
  if (!env.DVSA_TOKEN_URL) return "DVSA_TOKEN_URL";
  return null;
}

// Module-scope cache: Cloudflare Workers can (not guaranteed) reuse the
// same isolate — and therefore this module's top-level state — across
// several requests, so caching the token here is a free performance win
// when it happens and a harmless no-op (we just fetch a fresh one) when it
// doesn't. Never relied on for correctness, only for avoiding an extra
// round-trip to Entra ID on every lookup.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(env: Bindings): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) {
    return cachedToken.value;
  }

  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", env.DVSA_CLIENT_ID!);
  params.set("client_secret", env.DVSA_CLIENT_SECRET!);
  params.set("scope", OAUTH_SCOPE);

  const res = await fetch(env.DVSA_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DVSA token request failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function parseDefect(raw: unknown): MotDefect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = asString(pick(r, ["text", "rfrAndComments", "description"]));
  if (!text) return null;
  const typeRaw = pick(r, ["type", "typeOfDefect", "dangerous"]);
  return {
    text,
    type: asString(pick(r, ["type", "typeOfDefect"])),
    dangerous: typeRaw === true || typeRaw === "true" || asString(pick(r, ["type", "typeOfDefect"])) === "DANGEROUS",
  };
}

function parseTest(raw: unknown): MotTest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const motTestNumber = asString(pick(r, ["motTestNumber", "testNumber"]));
  if (!motTestNumber) return null;
  const defectsRaw = pick(r, ["defects", "rfrAndComments"]);
  const defects = Array.isArray(defectsRaw) ? defectsRaw.map(parseDefect).filter((d): d is MotDefect => d !== null) : [];
  return {
    motTestNumber,
    completedDate: asString(pick(r, ["completedDate"])),
    expiryDate: asString(pick(r, ["expiryDate"])),
    testResult: asString(pick(r, ["testResult"])),
    odometerValue: asNumber(pick(r, ["odometerValue"])),
    odometerUnit: asString(pick(r, ["odometerUnit"])),
    odometerResultType: asString(pick(r, ["odometerResultType"])),
    dataSource: asString(pick(r, ["dataSource"])),
    defects,
  };
}

/**
 * Looks up a vehicle's details and full MOT test history by registration
 * number. Throws DvsaNotConfiguredError if any of the four Worker secrets
 * are missing, DvsaNotFoundError if DVSA has no record for this
 * registration (a very normal outcome — e.g. a brand-new or non-GB
 * vehicle — callers should treat it as "nothing to pre-fill", not an
 * error to show), or a generic Error for any other API failure.
 */
export async function lookupVehicleByRegistration(env: Bindings, registration: string): Promise<DvsaVehicle> {
  const missing = missingConfig(env);
  if (missing) throw new DvsaNotConfiguredError(`${missing} is not configured on this Worker.`);

  const token = await getAccessToken(env);
  const reg = registration.toUpperCase().replace(/\s+/g, "");

  const res = await fetch(`${MOT_HISTORY_BASE}/registration/${encodeURIComponent(reg)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-API-Key": env.DVSA_API_KEY!,
      Accept: "application/json",
    },
  });

  if (res.status === 404) throw new DvsaNotFoundError(`No DVSA record found for ${reg}.`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DVSA API error (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const testsRaw = pick(data, ["motTests"]);
  const motTests = Array.isArray(testsRaw) ? testsRaw.map(parseTest).filter((t): t is MotTest => t !== null) : [];

  return {
    registration: asString(pick(data, ["registration"])),
    make: asString(pick(data, ["make"])),
    model: asString(pick(data, ["model"])),
    colour: asString(pick(data, ["primaryColour", "colour", "color"])),
    fuelType: asString(pick(data, ["fuelType"])),
    registrationDate: asString(pick(data, ["registrationDate"])),
    manufactureDate: asString(pick(data, ["manufactureDate"])),
    motTests,
  };
}
