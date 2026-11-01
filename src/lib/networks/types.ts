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
}

export type Credentials = Record<string, string>;

export interface NetworkAdapter {
  id: "awin" | "tradedoubler" | "admitad" | "webgains";
  label: string;
  fields: CredentialField[];
  where: string; // where to find the credentials in the network's own panel
  ref: (c: Credentials) => string; // non-secret label for the account (publisher id…)
  fetchFeed: (c: Credentials) => Promise<NetFeed>;
}

// Spanish market: offers and programmes are filtered to this region where the API allows it
export const REGION = "ES";
const MAX_PAGES = 50;

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    const body = (await r.text().catch(() => "")).slice(0, 200);
    throw new Error(`${new URL(url).hostname} respondió ${r.status}${body ? `: ${body}` : ""}`);
  }
  return (await r.json()) as T;
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
