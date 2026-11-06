// What every affiliate network adapter hands back, whatever its API looks like

export interface NetOffer {
  id: string; // the network's offer id (stored as "<network>:<id>" in coupons.external_id)
  advertiserId: string;
  kind: "code" | "deal";
  title: string;
  code: string;
  discount: string;
  description: string;
  url: string; // landing page on the advertiser's site
  expires: string; // YYYY-MM-DD or ""
}

export interface NetAdvertiser {
  id: string; // stored in stores.merchant_id
  name: string;
  website: string; // https://… or "" when the network doesn't say
  trackingTemplate: string; // link with {url}/{ref} for stores.tracking_url; "" for Awin (built from merchant_id)
}

export interface NetFeed {
  advertisers: NetAdvertiser[];
  offers: NetOffer[];
}

export interface CredentialField {
  name: string;
  label: string;
  secret: boolean; // never shown back in the panel
  help?: string;
  placeholder?: string;
  numeric?: boolean; // digits only: numeric keyboard on phones and checked before saving
  optional?: string; // when it may be left empty, and why (shown next to the label)
}

export type Credentials = Record<string, string>;

export interface NetworkAdapter {
  id: "awin" | "tradedoubler" | "admitad" | "webgains" | "cj" | "rakuten" | "impact" | "adtraction" | "effiliation" | "kwanko" | "affilae" | "partnerize";
  label: string;
  fields: CredentialField[];
  where: string; // where to find the credentials in the network's own panel
  docs: string; // the network's API page, linked from the connect form
  ref: (c: Credentials) => string; // non-secret label for the account (publisher id…)
  fetchFeed: (c: Credentials) => Promise<NetFeed>;
}

// Spanish market: offers and programmes are filtered to this region where the API allows it
export const REGION = "ES";
const MAX_PAGES = 50;

// What a failed call means for whoever pasted the credentials; the caller prefixes the network's name.
// 401: the network doesn't know the key; 403: it knows it, but the key can't read this account
export function httpError(status: number, body: string): string {
  // Tradedoubler answers an unknown token with 403 "Token not authorized for request": that's a 401 really
  if (status === 401 || (status === 403 && /not authori[sz]ed|invalid token/i.test(body))) return "no reconoce estas credenciales (401): revisa que sean las de la API, o genera unas nuevas";
  if (status === 403) return "acepta las credenciales pero no les deja leer esto (403): revisa que sean del tipo que se pide y tengan permiso de lectura";
  if (status === 429 || status === 503) return "pide esperar: prueba en unos minutos";
  return `respondió ${status}${body ? `: ${body}` : ""}`;
}

// "<Red>: <what went wrong>"; a 400/403 also names the ids that network asks for (a wrong one reads as no permission),
// and none when the network only takes a token
export function networkError(adapter: Pick<NetworkAdapter, "label" | "fields">, e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const ids = adapter.fields.filter((f) => !f.secret).map((f) => f.label);
  const hint = /\(403\)|respondió 400/.test(message) && ids.length ? `; revisa también ${ids.join(" y ")}` : "";
  return `${adapter.label}: ${message}${hint}`;
}

// The message inside an error body: CJ/Rakuten answer XML, most others JSON ({ message } / { error_description })
export function readableBody(body: string): string {
  const raw = body.trim();
  if (raw.startsWith("{")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const m = [j.error_description, j.message, j.error, j.detail].find((v) => typeof v === "string" && v);
      if (m) return String(m).slice(0, 200);
    } catch {
      // not JSON after all: shown as text below
    }
  }
  return raw.replace(/<\?xml[^>]*\?>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function fetchOk(url: string, init: RequestInit): Promise<Response> {
  const host = new URL(url).hostname;
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }).catch((e: unknown) => {
    throw new Error(e instanceof Error && e.name === "TimeoutError" ? `${host} no respondió a tiempo` : `${host} no responde`, { cause: e });
  });
  if (!r.ok) {
    const body = readableBody(await r.text().catch(() => ""));
    throw new Error(`${host} ${httpError(r.status, body)}`);
  }
  return r;
}

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  return (await (await fetchOk(url, init)).json()) as T;
}

// For the XML APIs (CJ, Rakuten)
export async function getText(url: string, init: RequestInit = {}): Promise<string> {
  return (await fetchOk(url, init)).text();
}

// Calls page(1), page(2)… until a short page; MAX_PAGES caps a misbehaving API
export async function allPages<T>(pageSize: number, page: (n: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let n = 1; n <= MAX_PAGES; n++) {
    const rows = await page(n);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// "www.adidas.es/es" → "https://www.adidas.es"; "" when it isn't a usable http(s) address
export function siteOf(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  if (!URL.canParse(withScheme)) return "";
  const u = new URL(withScheme);
  return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.origin : "";
}

// "2026-12-31T00:00:00.000" / "2026-12-31 23:59:59" keep their calendar day (no timezone shift); epoch ms → UTC day
export const isoDay = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "";
  const day = String(v).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (day) return day;
  const d = /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export const required = (c: Credentials, ...names: string[]) => {
  const missing = names.filter((n) => !c[n]?.trim());
  if (missing.length) throw new Error(`Faltan credenciales: ${missing.join(", ")}`);
};
