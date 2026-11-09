// Read-only access to Search Console and GA4 with the service account in GOOGLE_SERVICE_ACCOUNT_KEY (the key JSON).
// Plain fetch and node:crypto, no Google SDK. Account: cuponlab-seo@cuponlab-seo.iam.gserviceaccount.com (restricted
// user in Search Console, Viewer in GA4).
import { createSign } from "node:crypto";

export const SEARCH_SITE = process.env.SEARCH_CONSOLE_SITE || "https://www.cuponlab.com/";
export const GA4_PROPERTY = process.env.GA4_PROPERTY_ID || "563375285";
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 15_000;

export interface ServiceAccount { email: string; key: string }

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  try {
    const j = JSON.parse(raw ?? "") as { client_email?: unknown; private_key?: unknown };
    return typeof j.client_email === "string" && typeof j.private_key === "string" ? { email: j.client_email, key: j.private_key } : null;
  } catch {
    return null;
  }
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function signedJwt(sa: ServiceAccount, scopes: string[], now = Math.floor(Date.now() / 1000)): string {
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.email, scope: scopes.join(" "), aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(sa.key, "base64url")}`;
}

export const googleConfigured = (): boolean => parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) !== null;

// Why Google can't be read: no key at all, or a value that isn't the key JSON (e.g. cut at its first line)
export const googleKeyProblem = (raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY): string =>
  !raw?.trim() ? "sin credenciales" : parseServiceAccount(raw) ? "" : `clave no válida (${raw.trim().length} caracteres)`;

// ponytail: one token per warm instance, renewed 5 min before it expires
let token: { value: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const sa = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (!sa) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_KEY");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(sa, SCOPES) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google token: ${j.error_description ?? res.status}`);
  token = { value: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 };
  return token.value;
}

async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google ${new URL(url).hostname}: ${j.error?.message ?? res.status}`);
  return j;
}

const isoDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The last `days` full days (up to yesterday, Madrid) and the same span right before
export function dateRange(days: number, now = new Date()) {
  const end = shift(isoDay(now), -1);
  const start = shift(end, -(days - 1));
  return { start, end, prevStart: shift(start, -days), prevEnd: shift(start, -1) };
}

export interface SearchRow { keys: string[]; clicks: number; impressions: number; position: number }

export function rowsOfSearch(body: { rows?: { keys?: string[]; clicks?: number; impressions?: number; position?: number }[] }): SearchRow[] {
  return (body.rows ?? []).map((r) => ({ keys: r.keys ?? [], clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 }));
}

// Search Console searchAnalytics.query (dimensions: query, page, date…); [] dimensions = the totals
export async function searchAnalytics(start: string, end: string, dimensions: string[], rowLimit = 1000): Promise<SearchRow[]> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SEARCH_SITE)}/searchAnalytics/query`;
  return rowsOfSearch(await post(url, { startDate: start, endDate: end, dimensions, rowLimit, dataState: "all" }));
}

export interface Ga4Row { dims: string[]; values: number[] }

export function rowsOfGa4(body: { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] }): Ga4Row[] {
  return (body.rows ?? []).map((r) => ({ dims: (r.dimensionValues ?? []).map((d) => d.value ?? ""), values: (r.metricValues ?? []).map((m) => Number(m.value) || 0) }));
}

// GA4 Data API runReport
export async function ga4Report(start: string, end: string, dimensions: string[], metrics: string[], extra: object = {}): Promise<Ga4Row[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`;
  return rowsOfGa4(await post(url, { dateRanges: [{ startDate: start, endDate: end }], dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: 1000, ...extra }));
}

// "https://www.cuponlab.com/tiendas/kiwoko?x" or "/tiendas/kiwoko" → "kiwoko"
export function storeSlugOf(page: string): string | null {
  const m = /^(?:https?:\/\/[^/]+)?\/tiendas\/([a-z0-9-]+)\/?(?:[?#].*)?$/.exec(page);
  return m ? m[1] : null;
}

// Weighted mean position of Search Console rows (by impressions)
export const meanPosition = (rows: readonly SearchRow[]): number | null => {
  const impr = rows.reduce((n, r) => n + r.impressions, 0);
  return impr ? rows.reduce((n, r) => n + r.position * r.impressions, 0) / impr : null;
};
