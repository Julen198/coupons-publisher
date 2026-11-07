// The launch gate for outgoing links: a coupon is public only when its link is a real tracked link of its store's
// network (right tracking host and shape, our publisher id, the advertiser's id) to a page on the store's own domain.
// Pure, so the public queries, /go, the panel and scripts/audit-tracking.ts all decide the same way.
import { affiliateUrl, networkLabel, trackingUrl } from "./affiliate.ts";

export type LinkProblem =
  | "no-website" // the store has no website: nothing to check the destination against
  | "no-merchant" // Awin store without merchant id
  | "no-publisher" // Awin link without our (or the client's) publisher id
  | "unknown-publisher" // Awin publisher id that is none of our connected accounts nor the client's own
  | "no-template" // other networks: no tracking link for the store
  | "bad-template" // the tracking link isn't of the store's network (host, shape or ids)
  | "unknown-network"; // a network whose links we can't check (Otra red)

export const PROBLEM_TEXT: Record<LinkProblem, string> = {
  "no-website": "La tienda no tiene web",
  "no-merchant": "Sin merchant ID",
  "no-publisher": "Sin publisher ID de Awin",
  "unknown-publisher": "Publisher ID de Awin que no es de ninguna cuenta conectada",
  "no-template": "Sin enlace de seguimiento",
  "bad-template": "El enlace de seguimiento no es de su red",
  "unknown-network": "Red sin comprobación de enlaces",
};

// Why the destination isn't the coupon's own page: it was on another shop's domain (sent to the store's home instead),
// it had none, or it was http (upgraded)
export type LinkNote = "foreign-destination" | "no-destination" | "https-upgraded";

export interface LinkCoupon { id: number; target_url: string; publisher_id?: string }
export interface LinkStore {
  slug: string;
  network: string;
  merchant_id: string;
  tracking_url: string;
  website: string;
  publisher_id?: string;
  alt_domains?: string; // other domains the store sells on, comma-separated ("sprintersports.com")
}
export interface LinkAccounts {
  client: { slug: string; awin_affiliate_id: string };
  clientTemplate?: string; // the client's own account's link for this store (client_tracking), wins over ours
  awinPublishers?: ReadonlySet<string>; // publisher ids of our connected Awin accounts; empty/missing = not checked
}

export type TrackedLink =
  | { url: string; destination: string; clickref: string; notes: LinkNote[] }
  | { problem: LinkProblem; message: string };

export const isTracked = (l: TrackedLink): l is Extract<TrackedLink, { url: string }> => "url" in l;

// ---- domains

// Second-level labels that are part of a country's suffix: amazon.co.uk, tienda.com.es
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "gob", "ac", "edu", "nom"]);

// "www.fnac.es" → "fnac.es", "shop.amazon.co.uk" → "amazon.co.uk"; "" for an IP or a bare word
export function registrableDomain(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return "";
  const labels = h.split(".");
  const n = labels.length;
  const take = n >= 3 && labels[n - 1].length === 2 && SECOND_LEVEL.has(labels[n - 2]) ? 3 : 2;
  return labels.slice(-take).join(".");
}

// An http(s) URL from loose input ("www.x.es/p" too), or null
function webUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  if (!URL.canParse(withScheme)) return null;
  const u = new URL(withScheme);
  return /^https?:$/.test(u.protocol) && registrableDomain(u.hostname) ? u : null;
}

// The store's website and its extra domains, as registrable domains
export function storeDomains(store: Pick<LinkStore, "website" | "alt_domains">): string[] {
  const all = [store.website, ...(store.alt_domains ?? "").split(",")].map((d) => webUrl(d)).filter((u): u is URL => u !== null);
  return [...new Set(all.map((u) => registrableDomain(u.hostname)))];
}

// "sprintersports.com, https://www.sprinter.pt/x" → "sprintersports.com,sprinter.pt"; throws on something that isn't a domain
export function altDomainsInput(raw: string): string {
  const parts = raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  const domains = parts.map((p) => {
    const u = webUrl(p);
    if (!u) throw new Error(`«${p}» no es un dominio`);
    return registrableDomain(u.hostname);
  });
  return [...new Set(domains)].join(",");
}

const httpsOf = (u: URL): string => (u.protocol === "http:" ? `https://${u.href.slice("http://".length)}` : u.href);

// Where the reader lands: the coupon's page when it is on one of the store's domains (https), else the store's home
export function destinationOf(c: Pick<LinkCoupon, "target_url">, store: Pick<LinkStore, "website" | "alt_domains">): { url: string; notes: LinkNote[] } | null {
  const domains = storeDomains(store);
  const home = webUrl(store.website) ?? webUrl((store.alt_domains ?? "").split(",")[0] ?? "");
  if (!domains.length || !home) return null;
  const page = webUrl(c.target_url);
  if (page && domains.includes(registrableDomain(page.hostname))) {
    return { url: httpsOf(page), notes: page.protocol === "http:" ? ["https-upgraded"] : [] };
  }
  return { url: httpsOf(home), notes: [page ? "foreign-destination" : "no-destination"] };
}

// ---- clickref

// Sub-id length each network takes; [a-z0-9-] fits all of them
const REF_LIMIT: Record<string, number> = { awin: 50, cj: 64, rakuten: 72 };
const DEFAULT_REF_LIMIT = 50;
const refPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// "<client-slug>-<store-slug>-<coupon id>", shortened to the network's limit: the store slug gives way first, then the
// client's (never under 12), so the coupon id and the client stay readable in the network's reports
export function clickrefFor(clientSlug: string, storeSlug: string, couponId: number, network: string): string {
  const limit = REF_LIMIT[network] ?? DEFAULT_REF_LIMIT;
  const id = String(couponId);
  let client = refPart(clientSlug);
  let store = refPart(storeSlug);
  const len = () => [client, store, id].filter(Boolean).join("-").length;
  if (len() > limit) store = store.slice(0, Math.max(0, store.length - (len() - limit))).replace(/-$/, "");
  if (len() > limit) client = client.slice(0, Math.max(12, client.length - (len() - limit))).replace(/-$/, "");
  return [client, store, id].filter(Boolean).join("-").slice(0, limit);
}

// ---- what a tracked link of each network looks like

const has = (u: URL, ...keys: string[]) => keys.every((k) => (u.searchParams.get(k) ?? "").trim() !== "");
const CJ_HOSTS = /^(www\.)?(anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|qksrv\.net|ftjcfx\.com|lduhtrp\.net|awltovhc\.com|yceml\.net|afcyhf\.com|apmebf\.com|emjcd\.com)$/;

// Does this built URL look like the network's own tracked link for this store?
const SHAPES: Record<string, (u: URL, store: LinkStore) => boolean> = {
  awin: (u, s) => u.hostname === "www.awin1.com" && u.pathname === "/cread.php" && u.searchParams.get("awinmid") === s.merchant_id && /^\d+$/.test(u.searchParams.get("awinaffid") ?? ""),
  tradedoubler: (u) => u.hostname === "clk.tradedoubler.com" && (has(u, "p", "a") || /p\(\d+\)a\(\d+\)/.test(u.search + u.pathname)),
  cj: (u) => CJ_HOSTS.test(u.hostname) && /^\/click-\d+-\d+$/.test(u.pathname),
  rakuten: (u, s) => u.hostname === "click.linksynergy.com" && has(u, "id") && (!u.searchParams.get("mid") || u.searchParams.get("mid") === s.merchant_id),
  // branded tracking domains vary (underarmoures.sjv.io, go.marca.com): the /c/<partner>/<ad>/<campaign> path is what's checked
  impact: (u, s) => /^\/c\/\d+\/\d+\/(\d+)\/?$/.test(u.pathname) && (!s.merchant_id || u.pathname.split("/")[4] === s.merchant_id),
  admitad: (u) => /^\/(g|goto)\/[a-z0-9]+\/?$/i.test(u.pathname),
  webgains: (u, s) => u.hostname === "track.webgains.com" && has(u, "wgcampaignid", "wgprogramid") && (!s.merchant_id || u.searchParams.get("wgprogramid") === s.merchant_id),
  adtraction: (u) => u.hostname === "track.adtraction.com" && u.pathname === "/t/t" && has(u, "a", "as"),
  effiliation: (u) => u.hostname === "track.effiliation.com" && /^\d+$/.test(u.searchParams.get("id_compteur") ?? ""),
  kwanko: (u) => u.hostname === "action.metaffiliation.com" && has(u, "mclic"),
  // parameter tracking on the shop's own page (ae = our tracking id)
  affilae: (u, s) => storeDomains(s).includes(registrableDomain(u.hostname)) && /^\d+$/.test(u.searchParams.get("ae") ?? ""),
  partnerize: (u) => u.hostname === "prf.hn" && /^\/click\/camref:[a-z0-9]+/i.test(u.pathname),
  tradetracker: (u) => u.hostname === "tc.tradetracker.net" && has(u, "c", "a"),
  daisycon: (u) => u.hostname === "ds1.nl" && has(u, "si", "wi"),
};

const fail = (problem: LinkProblem): TrackedLink => ({ problem, message: PROBLEM_TEXT[problem] });

// The link one client's button sends a reader to for this coupon, or why there is none we can trust
export function trackedLinkOf(coupon: LinkCoupon, store: LinkStore, accounts: LinkAccounts): TrackedLink {
  const shape = SHAPES[store.network];
  if (!shape) return fail("unknown-network");
  const dest = destinationOf(coupon, store);
  if (!dest) return fail("no-website");
  const clickref = clickrefFor(accounts.client.slug, store.slug, coupon.id, store.network);
  let url: string;
  if (store.network === "awin") {
    if (!store.merchant_id.trim()) return fail("no-merchant");
    const affiliateId = (accounts.client.awin_affiliate_id || coupon.publisher_id || store.publisher_id || "").trim();
    if (!affiliateId) return fail("no-publisher");
    const known = accounts.awinPublishers;
    if (known?.size && affiliateId !== accounts.client.awin_affiliate_id && !known.has(affiliateId)) return fail("unknown-publisher");
    url = affiliateUrl(dest.url, { affiliateId, merchantId: store.merchant_id.trim(), clickref });
  } else {
    const template = (accounts.clientTemplate || store.tracking_url).trim();
    if (!template) return fail("no-template");
    url = trackingUrl(template, dest.url, clickref);
  }
  if (!URL.canParse(url)) return fail("bad-template");
  const u = new URL(url);
  if (u.protocol !== "https:" || !shape(u, store)) return fail("bad-template");
  return { url, destination: dest.url, clickref, notes: dest.notes };
}

// The store-level problem the panel flags (no coupon needed): what any coupon of it would hit
export function storeLinkProblem(store: LinkStore, accounts: Pick<LinkAccounts, "awinPublishers"> = {}): LinkProblem | null {
  const link = trackedLinkOf({ id: 0, target_url: "" }, store, { client: { slug: "panel", awin_affiliate_id: "" }, ...accounts });
  return isTracked(link) ? null : link.problem;
}

// Short label for the panel's store list: "sin merchant ID", "sin enlace"…
export const problemLabel = (p: LinkProblem, network: string): string =>
  p === "bad-template" ? `enlace que no es de ${networkLabel(network)}` : PROBLEM_TEXT[p].charAt(0).toLowerCase() + PROBLEM_TEXT[p].slice(1);
