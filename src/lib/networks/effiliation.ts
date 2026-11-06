import { discountBadge } from "../discount.ts";
import { getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Effiliation (Effinity) publisher API v3 — api.effinity.fr/apiv3/docs: the key goes in the path,
// GET /publisher/programs (joined = status active or inactive) and /publisher/links?linkType=voucherOrDeal.
// The v2 API (apiv2.effiliation.com) closes in 2027. Data refreshes every 2 h: syncing more often can get the key blocked.
const API = "https://api.effinity.fr/apiv3";
const PAGE = 1000;
const MAX_PAGES = 50;

export interface Program { programId: string | number; merchantName?: string; programName?: string; merchantUrl?: string; defaultTrackedLink?: string }
export interface Promo { code?: string; voucher?: string; description?: string; value?: number | string; valueType?: string; validityEndDate?: string }
export interface Link {
  linkId: string | number;
  programId: string | number;
  linkName?: string;
  text?: string;
  urlRedir?: string;
  endDate?: string;
  promo?: Promo;
}

// defaultTrackedLink is "https://track.effiliation.com/servlet/effi.redir?id_compteur=<counter>"; effi_id carries our ref
// and url the page, the deeplink form of their TrackedLink example
export function mapProgram(p: Program): NetAdvertiser {
  const link = (p.defaultTrackedLink ?? "").trim();
  return {
    id: String(p.programId),
    name: (p.merchantName || p.programName || String(p.programId)).trim(),
    website: siteOf(p.merchantUrl),
    trackingTemplate: /^https:\/\//.test(link) && !/[?&]url=/.test(link) ? `${link}${link.includes("?") ? "&" : "?"}effi_id={ref}&url={url}` : "",
  };
}

// ponytail: valueType values aren't documented; anything percent-like is %, any other amount is €, else read the title
function discountOf(l: Link): string {
  const value = Number(l.promo?.value);
  if (value > 0) return /perc|pourc|%/i.test(l.promo?.valueType ?? "") ? `${value}%` : `${value}€`;
  return discountBadge(l.linkName ?? "") || discountBadge(l.promo?.description ?? "");
}

export function mapLink(l: Link): NetOffer {
  // the spec doesn't say which of voucher/code holds the code: voucher first, as other integrations read it
  const code = (l.promo?.voucher || l.promo?.code || "").trim();
  const title = (l.linkName || l.promo?.description || l.text || "").trim();
  return {
    id: String(l.linkId),
    advertiserId: String(l.programId),
    kind: code ? "code" : "deal",
    title,
    code,
    discount: discountOf(l),
    description: (l.text ?? "").trim() === title ? "" : (l.text ?? "").trim(),
    url: l.urlRedir ?? "",
    expires: isoDay(l.promo?.validityEndDate || l.endDate),
  };
}

async function pages<T>(url: string, key: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await getJson<Record<string, unknown>>(`${url}${url.includes("?") ? "&" : "?"}page=${page}&perPage=${PAGE}`, { headers: { Accept: "application/json" } });
    out.push(...((r[key] as T[] | undefined) ?? []));
    const last = Number((r.pagination as { lastPage?: number } | undefined)?.lastPage) || 1;
    if (page >= last) break;
  }
  return out;
}

export const effiliation: NetworkAdapter = {
  id: "effiliation",
  label: "Effiliation",
  fields: [{ name: "apiKey", label: "Clave de API", secret: true }],
  docs: "https://api.effinity.fr/apiv3/docs",
  where: "Centro de publisher de Effiliation → Mon compte → Identifiants (clave de API)",
  ref: (c) => `Clave …${c.apiKey.slice(-4)}`,
  async fetchFeed(c: Credentials) {
    required(c, "apiKey");
    if (!/^[\w-]+$/.test(c.apiKey)) throw new Error("La clave de API de Effiliation solo lleva letras, números y guiones");
    const base = `${API}/${c.apiKey}/publisher`;
    const programs = await pages<Program>(`${base}/programs?status=active&status=inactive`, "programs");
    const links = await pages<Link>(`${base}/links?linkType=voucherOrDeal`, "links");
    const advertisers = new Map(programs.map((p) => [String(p.programId), mapProgram(p)]));
    return {
      advertisers: [...advertisers.values()],
      offers: links.filter((l) => advertisers.has(String(l.programId))).map(mapLink).filter((o) => o.title),
    };
  },
};
