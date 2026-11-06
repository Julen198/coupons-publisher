import { discountBadge } from "./discount.ts";

// Wraps a store URL in the client's Awin tracking link. Falls back to the raw URL
// when either side is missing an ID, so pages still work before Awin is set up.
export function affiliateUrl(
  targetUrl: string,
  opts: { affiliateId: string; merchantId: string; clickref: string },
) {
  if (!opts.affiliateId || !opts.merchantId) return targetUrl;
  const params = new URLSearchParams({
    awinmid: opts.merchantId,
    awinaffid: opts.affiliateId,
    clickref: opts.clickref,
    ued: targetUrl,
  });
  return `https://www.awin1.com/cread.php?${params}`;
}

// Networks other than Awin: the store keeps the tracking link the network gives, with {url} where the
// destination goes and {ref} where the subid/clickref goes. No link yet → straight to the store.
// A template that starts with {url} tracks by adding parameters to the page itself (Affilae: "{url}?ae=42&aev={ref}").
export function trackingUrl(template: string, targetUrl: string, clickref: string) {
  if (!template) return targetUrl;
  if (template.startsWith("{url}")) {
    const params = template.slice("{url}".length).replace(/^[?&]/, "").replaceAll("{ref}", encodeURIComponent(clickref));
    return `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}${params}`;
  }
  return template.replaceAll("{url}", encodeURIComponent(targetUrl)).replaceAll("{ref}", encodeURIComponent(clickref));
}

export const NETWORKS = [
  { id: "awin", label: "Awin" },
  { id: "tradedoubler", label: "Tradedoubler" },
  { id: "admitad", label: "Admitad" },
  { id: "webgains", label: "Webgains" },
  { id: "cj", label: "CJ" },
  { id: "rakuten", label: "Rakuten" },
  { id: "impact", label: "Impact" },
  { id: "adtraction", label: "Adtraction" },
  { id: "effiliation", label: "Effiliation" },
  { id: "kwanko", label: "Kwanko" },
  { id: "affilae", label: "Affilae" },
  { id: "partnerize", label: "Partnerize" },
  // no API integration yet: stores keep the tracking link pasted by hand
  { id: "tradetracker", label: "TradeTracker" },
  { id: "daisycon", label: "Daisycon" },
  { id: "other", label: "Otra red" },
] as const;

// Can this store's coupons carry affiliate tracking at all?
export const storeTracked = (s: { network: string; merchant_id: string; tracking_url: string }) =>
  s.network === "awin" ? Boolean(s.merchant_id) : Boolean(s.tracking_url);

export type Network = (typeof NETWORKS)[number]["id"];
export const networkLabel = (id: string) => NETWORKS.find((n) => n.id === id)?.label ?? id;
export const asNetwork = (v: string): Network => (NETWORKS.some((n) => n.id === v) ? (v as Network) : "awin");

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "Código descuento adidas 15% | 10€ octubre 2026" — month/year keeps the page matching seasonal searches
export function pageTitle(storeName: string, discounts: string[], now: Date) {
  const top = [...new Set(discounts.map(discountBadge).filter(Boolean))].slice(0, 2).join(" | ");
  return [`Código descuento ${storeName}`, top, `${MONTHS[now.getMonth()]} ${now.getFullYear()}`]
    .filter(Boolean)
    .join(" ");
}

export function parseFaqs(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter(([q, a]) => q && a)
    .map(([q, a]) => ({ q, a }));
}
