import { discountBadge } from "../discount.ts";
import { getJson, isoDay, REGION, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Kwanko publisher API — developers.kwanko.com: Bearer token, GET /publishers/campaigns (ours, filtered to Spain),
// /publishers/ads?ad_types=voucher_code (codes) and ?ad_types=deeplink (the click link with {XXX} for the page).
// Only one ad type per call.
const API = "https://api.kwanko.com";

interface Campaign { id: number | string; name: string; url?: string; merchant?: { website?: { url?: string } } }
interface Tracked { website_per_language?: { id?: number | string }; urls?: { click?: string } }
export interface Ad {
  id: string;
  name?: string;
  description?: string;
  code?: string;
  campaign: { id: number | string; name?: string };
  validity_date?: { end?: string };
  tracked_material_per_websites?: Tracked[];
}

// The deeplink ad's click URL has {XXX} where the page goes; argsite is Kwanko's sub-id for our ref
export function deeplinkTemplate(click: string): string {
  const link = click.trim();
  if (!/^https:\/\//.test(link) || !link.includes("{XXX}")) return "";
  return `${link.replace("{XXX}", "{url}")}${link.includes("?") ? "&" : "?"}argsite={ref}`;
}

// Voucher ads only carry the tracked click, no plain landing page: the coupon points at the campaign's site
export function mapVoucherAd(ad: Ad, website: string): NetOffer {
  const code = (ad.code ?? "").trim();
  const title = (ad.name ?? "").trim();
  return {
    id: ad.id,
    advertiserId: String(ad.campaign.id),
    kind: code ? "code" : "deal",
    title,
    code,
    discount: discountBadge(title) || discountBadge(ad.description ?? ""),
    description: (ad.description ?? "").trim(),
    url: website,
    expires: isoDay(ad.validity_date?.end),
  };
}

// With several sites, the one picked in the form; otherwise the first one Kwanko lists
const clickOf = (ad: Ad, site: string) =>
  (ad.tracked_material_per_websites ?? []).find((t) => !site || String(t.website_per_language?.id) === site)?.urls?.click ?? "";

export const kwanko: NetworkAdapter = {
  id: "kwanko",
  label: "Kwanko",
  fields: [
    { name: "token", label: "Token de API", secret: true, help: "Solo se muestra una vez al generarlo" },
    { name: "site", label: "ID del sitio por idioma", secret: false, numeric: true, optional: "solo si tienes varios sitios", placeholder: "p. ej. 888" },
  ],
  docs: "https://developers.kwanko.com/Kwanko/index.html",
  where: "publisher.kwanko.com/api-authentication (Generar token)",
  ref: (c) => (c.site ? `Sitio ${c.site}` : `Token …${c.token.slice(-4)}`),
  async fetchFeed(c: Credentials) {
    required(c, "token");
    const headers = { Authorization: `Bearer ${c.token}`, Accept: "application/json" };
    const site = c.site?.trim() ?? "";
    const only = site ? `&websites_per_language=${site}` : "";
    const { campaigns = [] } = await getJson<{ campaigns?: Campaign[] }>(`${API}/publishers/campaigns?countries=${REGION}`, { headers });
    const { ads: deeplinks = [] } = await getJson<{ ads?: Ad[] }>(`${API}/publishers/ads?ad_types=deeplink${only}`, { headers });
    const { ads: vouchers = [] } = await getJson<{ ads?: Ad[] }>(`${API}/publishers/ads?ad_types=voucher_code${only}`, { headers });
    const linkOf = new Map(deeplinks.map((ad) => [String(ad.campaign.id), deeplinkTemplate(clickOf(ad, site))]));
    const advertisers = new Map<string, NetAdvertiser>(
      campaigns.map((cp) => {
        const id = String(cp.id);
        return [id, { id, name: cp.name.trim(), website: siteOf(cp.url || cp.merchant?.website?.url), trackingTemplate: linkOf.get(id) ?? "" }];
      }),
    );
    return {
      advertisers: [...advertisers.values()],
      offers: vouchers
        .filter((ad) => advertisers.has(String(ad.campaign.id)))
        .map((ad) => mapVoucherAd(ad, advertisers.get(String(ad.campaign.id))?.website ?? ""))
        .filter((o) => o.title),
    };
  },
};
